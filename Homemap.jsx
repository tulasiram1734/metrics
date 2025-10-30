import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import storesGeo from "../data/stores.geo.json";
import dcsGeo from "../data/dcs.geo.json";
import regionsGeo from "../data/regions.geo.json";

import "../styles/HomeMap.css";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

/** UI constants */
const DIVISIONS = ["All", "Northern", "Southern", "Eastern", "Midwestern"];
const USA_BOUNDS = [[-125.41, 24.3], [-66.9, 49.38]];

/** zoom thresholds */
const Z_DC = 4.8;
const Z_STORES = 6.6;

/** colors */
const C_GREEN = "#22FFAA";
const C_AMBER = "#FFDF5A";
const C_RED   = "#FF5A5C";
const C_RING  = "#28BCFF";

function healthToColor(h=0){ return h>=80?C_GREEN:h>=60?C_AMBER:C_RED; }

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  const [division, setDivision] = useState("All");
  const [dcId, setDcId] = useState("ALL");
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  const filteredDcs = useMemo(() => ({
    type: "FeatureCollection",
    features: dcsGeo.features
      .filter(f => division === "All" || f.properties.division === division)
      .filter(f => (onlyAssigned ? f.properties.assigned === true : true))
  }), [division, onlyAssigned]);

  const filteredStores = useMemo(() => {
    let feats = storesGeo.features
      .filter(f => division === "All" || f.properties.division === division);
    if (onlyAssigned) feats = feats.filter(f => f.properties.assigned === true);
    if (dcId !== "ALL") feats = feats.filter(f => f.properties.dc_id === dcId);
    return { type: "FeatureCollection", features: feats };
  }, [division, dcId, onlyAssigned]);

  const dcOptions = useMemo(() => {
    const m = new Map();
    filteredDcs.features.forEach(f => m.set(f.properties.dc_id, f.properties.dc_name));
    return Array.from(m.entries()).map(([value,label]) => ({ value, label }));
  }, [filteredDcs]);

  /** init map */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      bounds: USA_BOUNDS,
      attributionControl: false,
      projection: "mercator"
    });
    mapRef.current = map;

    // Make sure canvas paints after layout
    map.once("idle", () => map.resize());
    const ro = new ResizeObserver(() => { try { map.resize(); } catch(_){} });
    ro.observe(containerRef.current);

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      // SOURCES
      map.addSource("regions", { type: "geojson", data: regionsGeo });
      map.addSource("dcs",     { type: "geojson", data: filteredDcs });
      map.addSource("stores",  { type: "geojson", data: filteredStores });

      // DIVISION glow
      map.addLayer({
        id: "region-lines",
        type: "line",
        source: "regions",
        paint: { "line-color": C_RING, "line-width": 0.6, "line-opacity": 0.0 }
      });

      // DC roll-up circles
      map.addLayer({
        id: "dc-circles",
        type: "circle",
        source: "dcs",
        minzoom: Z_DC,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3.5, 3.5, 5.0, 6.5, 6.5, 9],
          "circle-color": [
            "case",
            [">=", ["get","rollup_health"], 80], C_GREEN,
            [">=", ["get","rollup_health"], 60], C_AMBER,
            C_RED
          ],
          "circle-stroke-color": "#0B1120",
          "circle-stroke-width": 1.2
        }
      });
      map.addLayer({
        id: "dc-ring",
        type: "circle",
        source: "dcs",
        minzoom: Z_DC,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3.5, 5.5, 6.5, 12],
          "circle-color": "transparent",
          "circle-stroke-color": C_RING,
          "circle-stroke-width": 1.4,
          "circle-stroke-opacity": 0.0
        }
      });

      // STORES (hidden till zoomed)
      map.addLayer({
        id: "stores-circles",
        type: "circle",
        source: "stores",
        minzoom: Z_STORES,
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.6, 2.6, 8.0, 4.6, 10.0, 6.0],
          "circle-color": ["case",
            [">=", ["get","health"], 80], C_GREEN,
            [">=", ["get","health"], 60], C_AMBER,
            C_RED
          ],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#0B1120",
          "circle-stroke-width": 0.8
        }
      });

      // Cursor & tooltip
      const popup = new mapboxgl.Popup({ closeButton:false, closeOnClick:false, className:"tt" });
      map.on("mouseenter", "dc-circles", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", "dc-circles", () => map.getCanvas().style.cursor = "");

      map.on("mousemove", "stores-circles", (e) => {
        const f = e.features?.[0]; if (!f) return;
        const p = f.properties || {};
        popup.setLngLat(e.lngLat).setHTML(`
          <div class="tt-wrap">
            <div class="tt-title">
              <span class="dot ${p.health>=80?"green":p.health>=60?"amber":"red"}"></span>
              <span>${p.store_name || p.store_id}</span>
            </div>
            <div class="tt-line"><span>Health</span><span>${Math.round(p.health)}</span></div>
            <div class="tt-line"><span>Division</span><span>${p.division}</span></div>
            <div class="tt-line"><span>DC</span><span>${p.dc_name}</span></div>
          </div>
        `).addTo(map);
      });
      map.on("mouseleave", "stores-circles", () => popup.remove());

      // Click DC -> zoom & show its stores
      map.on("click", "dc-circles", (e) => {
        const f = e.features?.[0]; if (!f) return;
        const id = f.properties.dc_id;
        setDcId(id);
        flyToDC(map, f);
        showStores(map, true);
      });

      // Keep store visibility synced with zoom
      map.on("zoomend", () => {
        showStores(map, map.getZoom() >= Z_STORES || dcId !== "ALL");
      });

      // Initial fit
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 0 });
    });

    return () => { try { ro.disconnect(); } catch(_){} try { map.remove(); } catch(_){} };
  }, []);

  /** reactive data updates AFTER style is loaded */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const dcs = map.getSource("dcs");
    const st  = map.getSource("stores");
    if (dcs) dcs.setData(filteredDcs);
    if (st)  st.setData(filteredStores);

    setDivisionGlow(map, division);

    if (dcId !== "ALL") {
      const dcFeature = filteredDcs.features.find(f => f.properties.dc_id === dcId);
      if (dcFeature) {
        flyToDC(map, dcFeature);
        showStores(map, true);
      }
    } else {
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 500 });
      showStores(map, false);
      // fade the dc ring
      if (map.getLayer("dc-ring")) map.setPaintProperty("dc-ring", "circle-stroke-opacity", 0.0);
    }
  }, [filteredDcs, filteredStores, division, dcId]);

  /** UI handlers */
  const onDivisionClick = (div) => {
    setDivision(div);
    setDcId("ALL");
    const map = mapRef.current; if (!map) return;

    const b = boundsForDivision(regionsGeo, div);
    if (b) {
      map.fitBounds(b, { padding:{top:80,left:80,right:80,bottom:120}, duration: 600, pitch:35, bearing:8 });
    } else {
      map.fitBounds(USA_BOUNDS, { padding:60, duration:600, pitch:0, bearing:0 });
    }
  };

  return (
    <div className="home">
      <div className="topbar">
        <span className="title-dot" /> <span>Pulse · Inventory Insights</span>
      </div>

      <div className="panel">
        <div className="grp">
          <label>Division</label>
          <div className="chips">
            {DIVISIONS.map(div => (
              <button key={div}
                className={`chip ${division === div ? "is-active" : ""}`}
                onClick={() => onDivisionClick(div)}>
                {div}
              </button>
            ))}
          </div>
        </div>

        <div className="grp">
          <label>Distribution Center</label>
          <select value={dcId} onChange={e => setDcId(e.target.value || "ALL")}>
            <option value="ALL">ALL</option>
            {dcOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned}
                 onChange={e => setOnlyAssigned(e.target.checked)} />
          Show only my assigned stores
        </label>
      </div>

      <div ref={containerRef} className="mapbox" />

      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot amber" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}

/** helpers */
function boundsForDivision(regions, div){
  if (!regions || div === "All") return null;
  const hits = regions.features.filter(f => f.properties?.division === div);
  if (!hits.length) return null;
  const b = new mapboxgl.LngLatBounds();
  hits.forEach(f => {
    const coords = f.geometry.type === "MultiPolygon"
      ? f.geometry.coordinates.flat(2)
      : f.geometry.coordinates.flat(1);
    coords.forEach(([lng,lat]) => b.extend([lng,lat]));
  });
  return b;
}

function setDivisionGlow(map, div){
  if (!map.getLayer("region-lines")) return;
  const opacity = div === "All" ? 0.0 : 0.55;
  map.setPaintProperty("region-lines", "line-opacity", opacity);
  if (div === "All") {
    map.setFilter("region-lines", null);
  } else {
    map.setFilter("region-lines", ["==", ["get","division"], div]);
  }
}

function flyToDC(map, dcFeature){
  const center = dcFeature.geometry.coordinates;
  map.flyTo({ center, zoom: 8.2, speed: 0.7, curve: 1.4, pitch: 45, bearing: 12, essential: true });
  if (map.getLayer("dc-ring")) {
    map.setFilter("dc-ring", ["==", ["get","dc_id"], dcFeature.properties.dc_id]);
    map.setPaintProperty("dc-ring", "circle-stroke-opacity", 0.85);
  }
}

function showStores(map, visible){
  if (!map.getLayer("stores-circles")) return;
  map.setLayoutProperty("stores-circles", "visibility", visible ? "visible" : "none");
}
