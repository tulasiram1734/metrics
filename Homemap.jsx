import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import storesGeo from "../data/stores.geo.json";
import dcsGeo from "../data/dcs.geo.json";
import regionsGeo from "../data/regions.geo.json"; // US states polygons for division glow

import "../styles/HomeMap.css";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

/** UI constants */
const DIVISIONS = ["All", "Northern", "Southern", "Eastern", "Midwestern"];

/** USA bounds (fit screen) */
const USA_BOUNDS = [
  [-125.41, 24.30], // SW
  [-66.90, 49.38],  // NE
];

/** Zoom thresholds */
const Z_DC = 4.8;     // DC circles visible at and above this zoom
const Z_STORES = 6.6; // stores visible at and above this zoom

/** Health color palette (neon-ish but readable) */
const C_GREEN = "#22FFAA";
const C_AMBER = "#FFDF5A";
const C_RED   = "#FF5A5C";

/** Ring for DC glow */
const C_RING  = "#28BCFF";

/** Map helpers */
function healthToColor(h=0) {
  if (h >= 80) return C_GREEN;
  if (h >= 60) return C_AMBER;
  return C_RED;
}

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  /** Filters */
  const [division, setDivision] = useState("All");
  const [dcId, setDcId] = useState("ALL");
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  /** Filtered feature sets (memoized) */
  const filteredDcs = useMemo(() => {
    const feats = dcsGeo.features
      .filter(f => division === "All" || f.properties.division === division)
      .filter(f => (onlyAssigned ? f.properties.assigned === true : true));
    return { type: "FeatureCollection", features: feats };
  }, [division, onlyAssigned]);

  const filteredStores = useMemo(() => {
    let feats = storesGeo.features
      .filter(f => division === "All" || f.properties.division === division);
    if (onlyAssigned) feats = feats.filter(f => f.properties.assigned === true);
    if (dcId !== "ALL") feats = feats.filter(f => f.properties.dc_id === dcId);
    return { type: "FeatureCollection", features: feats };
  }, [division, dcId, onlyAssigned]);

  /** DC dropdown options for current division */
  const dcOptions = useMemo(() => {
    const set = new Map();
    filteredDcs.features.forEach(f => set.set(f.properties.dc_id, f.properties.dc_name));
    return Array.from(set.entries()).map(([value, label]) => ({ value, label }));
  }, [filteredDcs]);

  /** init map */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      bounds: USA_BOUNDS,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      projection: "mercator"
    });
    mapRef.current = map;

    map.on("load", () => {
      /** --- SOURCES --- */
      map.addSource("regions", { type: "geojson", data: regionsGeo });
      map.addSource("dcs",     { type: "geojson", data: filteredDcs });
      map.addSource("stores",  { type: "geojson", data: filteredStores });

      /** --- DIVISION glow (states) --- */
      map.addLayer({
        id: "region-lines",
        type: "line",
        source: "regions",
        paint: {
          "line-color": C_RING,
          "line-width": 0.6,
          "line-opacity": 0.0 // off by default; we toggle on division select
        }
      });

      /** --- DC circles (rollup health) --- */
      map.addLayer({
        id: "dc-circles",
        type: "circle",
        source: "dcs",
        minzoom: Z_DC,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            3.5, 3.5,
            5.0, 6.5,
            6.5, 9
          ],
          "circle-color": ["case",
            [">=", ["get", "rollup_health"], 80], C_GREEN,
            [">=", ["get", "rollup_health"], 60], C_AMBER,
            C_RED
          ],
          "circle-stroke-color": "#0B1120",
          "circle-stroke-width": 1.2
        }
      });

      /** --- DC hover outline (subtle) --- */
      map.addLayer({
        id: "dc-ring",
        type: "circle",
        source: "dcs",
        minzoom: Z_DC,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            3.5, 5.5,
            6.5, 12
          ],
          "circle-color": "transparent",
          "circle-stroke-color": C_RING,
          "circle-stroke-width": 1.4,
          "circle-stroke-opacity": 0.0
        }
      });

      /** --- Stores (hidden initially; shown when zoomed >= Z_STORES) --- */
      map.addLayer({
        id: "stores-circles",
        type: "circle",
        source: "stores",
        minzoom: Z_STORES,
        layout: { visibility: "none" },
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            6.6, 2.6,
            8.0, 4.6,
            10.0, 6.0
          ],
          "circle-color": [
            "case",
            [">=", ["get", "health"], 80], C_GREEN,
            [">=", ["get", "health"], 60], C_AMBER,
            C_RED
          ],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#0B1120",
          "circle-stroke-width": 0.8
        }
      });

      /** Cursor & tooltip */
      map.on("mouseenter", "dc-circles", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", "dc-circles", () => map.getCanvas().style.cursor = "");

      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: "tt" });

      map.on("mousemove", "stores-circles", (e) => {
        const f = e.features?.[0]; if (!f) return;
        const p = f.properties || {};
        const html = `
          <div class="tt-wrap">
            <div class="tt-title">
              <span class="dot ${p.health >= 80 ? "green" : p.health >= 60 ? "amber" : "red"}"></span>
              <span>${p.store_name || p.store_id}</span>
            </div>
            <div class="tt-line"><span>Health</span><span>${Math.round(p.health)}</span></div>
            <div class="tt-line"><span>Division</span><span>${p.division}</span></div>
            <div class="tt-line"><span>DC</span><span>${p.dc_name}</span></div>
          </div>
        `;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("mouseleave", "stores-circles", () => popup.remove());

      /** Click DC to zoom + reveal its stores */
      map.on("click", "dc-circles", (e) => {
        const f = e.features?.[0]; if (!f) return;
        const id = f.properties.dc_id;
        setDcId(id);               // update filter state
        flyToDC(map, f);           // camera move
        showStores(map, true);     // ensure visible
      });

      /** Keep store visibility in sync with zoom */
      map.on("zoomend", () => {
        const z = map.getZoom();
        showStores(map, z >= Z_STORES);
      });

      /** First fit */
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 0 });
    });

    return () => { map.remove(); };
  }, []);

  /** Update sources whenever filters change */
  useEffect(() => {
    const map = mapRef.current; if (!map?.isStyleLoaded()) return;
    const dcsSrc = map.getSource("dcs");
    const stSrc  = map.getSource("stores");
    if (dcsSrc) dcsSrc.setData(filteredDcs);
    if (stSrc)  stSrc.setData(filteredStores);

    // Highlight division glow
    setDivisionGlow(map, division);

    // If a DC is chosen, fly to it and show stores
    if (dcId !== "ALL") {
      const dcFeature = filteredDcs.features.find(f => f.properties.dc_id === dcId);
      if (dcFeature) {
        flyToDC(map, dcFeature);
        showStores(map, true);
      }
    } else {
      // back to national
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 600, essential: true });
      showStores(map, false);
    }
  }, [filteredDcs, filteredStores, division, dcId]);

  /** UI handlers */
  const onDivisionClick = (div) => {
    setDivision(div);
    setDcId("ALL");
    const map = mapRef.current;
    if (!map) return;

    // zoom to the division bounds using regions layer
    const bounds = boundsForDivision(regionsGeo, div);
    if (bounds) {
      map.fitBounds(bounds, { padding: {top:80, left:80, right:80, bottom:120}, duration: 600, pitch: 35, bearing: 8, essential: true });
    } else {
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 600 });
    }
  };

  const onDcChange = (e) => {
    setDcId(e.target.value || "ALL");
  };

  /** helpers */
  return (
    <div className="home">
      {/* Top bar (kept) */}
      <div className="topbar">
        <span className="title-dot" /> <span>Pulse · Inventory Insights</span>
      </div>

      {/* Filters */}
      <div className="panel">
        <div className="grp">
          <label>Division</label>
          <div className="chips">
            {DIVISIONS.map(div => (
              <button
                key={div}
                className={`chip ${division === div ? "is-active" : ""}`}
                onClick={() => onDivisionClick(div)}
              >
                {div}
              </button>
            ))}
          </div>
        </div>

        <div className="grp">
          <label>Distribution Center</label>
          <select value={dcId} onChange={onDcChange}>
            <option value="ALL">ALL</option>
            {dcOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <label className="chk">
          <input
            type="checkbox"
            checked={onlyAssigned}
            onChange={e => setOnlyAssigned(e.target.checked)}
          />
          Show only my assigned stores
        </label>
      </div>

      {/* Map */}
      <div ref={containerRef} className="mapbox" />

      {/* Legend */}
      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot amber" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}

/** ===== helper fns (below component to keep JSX uncluttered) ===== */

function boundsForDivision(regions, div) {
  if (!regions || div === "All") return null;
  const hits = regions.features.filter(f => f.properties?.division === div);
  if (hits.length === 0) return null;

  const bounds = new mapboxgl.LngLatBounds();
  hits.forEach(f => {
    const geom = f.geometry;
    const coords = geom.type === "MultiPolygon" ? geom.coordinates.flat(2) : geom.coordinates.flat(1);
    coords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
  });
  return bounds;
}

function setDivisionGlow(map, div) {
  if (!map) return;
  const opacity = div === "All" ? 0.0 : 0.55;
  if (map.getLayer("region-lines")) {
    map.setPaintProperty("region-lines", "line-opacity", opacity);
    if (div !== "All") {
      map.setFilter("region-lines", ["==", ["get", "division"], div]);
    } else {
      map.setFilter("region-lines", null);
    }
  }
}

function flyToDC(map, dcFeature) {
  const center = dcFeature.geometry.coordinates;
  map.flyTo({
    center,
    zoom: 8.2,
    speed: 0.7,
    curve: 1.4,
    pitch: 45,
    bearing: 12,
    essential: true
  });

  // softly highlight just that DC’s ring
  if (map.getLayer("dc-ring")) {
    const id = dcFeature.properties.dc_id;
    map.setFilter("dc-ring", ["==", ["get", "dc_id"], id]);
    map.setPaintProperty("dc-ring", "circle-stroke-opacity", 0.85);
  }
}

function showStores(map, visible) {
  if (!map.getLayer("stores-circles")) return;
  map.setLayoutProperty("stores-circles", "visibility", visible ? "visible" : "none");
}
