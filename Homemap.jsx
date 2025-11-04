import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import regionsGeo from "../data/regions.geo.json";   // polygons per division (same as before)
import dcsGeo     from "../data/dcs.geo.json";       // DC points with rollup
import storesGeo  from "../data/stores.geo.json";    // store points

import "../styles/HomeMap.css";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

/* ---------- constants (unchanged UX) ---------- */
const DIVISIONS = ["All", "Northern", "Southern", "Eastern", "Midwestern"];
const USA_BOUNDS = [[-125.4, 24.2], [-66.9, 49.5]];
const MAX_BOUNDS = [[-131, 20], [-60, 52]];
const Z_SHOW_DCS    = 3.8;   // DCs visible from national
const Z_SHOW_STORES = 6.4;   // stores visible only after zoom
const C_GREEN = "#22FFAA";
const C_AMBER = "#FFDF5A";
const C_RED   = "#FF5A5C";
const C_RING  = "#28BCFF";

const healthColor = (h=0) => (h >= 80 ? C_GREEN : h >= 60 ? C_AMBER : C_RED);

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  const [division, setDivision] = useState("All");
  const [dcId, setDcId] = useState("ALL");
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  /* ---------- filtered data (same as before) ---------- */
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
    const seen = new Set();
    return filteredDcs.features
      .filter(f => { const id = f.properties.dc_id; if (seen.has(id)) return false; seen.add(id); return true; })
      .map(f => ({ value: f.properties.dc_id, label: f.properties.dc_name }));
  }, [filteredDcs]);

  /* ---------- map init (identical feel) ---------- */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      projection: "mercator",                 // US only (no globe)
      bounds: USA_BOUNDS,
      maxBounds: MAX_BOUNDS,
      attributionControl: false
    });
    mapRef.current = map;

    // keep canvas sized after React layout
    const onIdleOnce = () => { try { map.resize(); } catch (_) {} };
    map.once("idle", onIdleOnce);

    const ro = new ResizeObserver(() => { try { map.resize(); } catch (_) {} });
    ro.observe(containerRef.current);

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      // sources
      map.addSource("regions", { type: "geojson", data: regionsGeo });
      map.addSource("dcs",     { type: "geojson", data: filteredDcs });
      map.addSource("stores",  { type: "geojson", data: filteredStores });

      // division glow outline (hidden until a division is selected)
      map.addLayer({
        id: "region-lines",
        type: "line",
        source: "regions",
        paint: { "line-color": C_RING, "line-width": 0.6, "line-opacity": 0.0 }
      });

      // DC roll-up dots (national view)
      map.addLayer({
        id: "dc-circles",
        type: "circle",
        source: "dcs",
        minzoom: Z_SHOW_DCS,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3.5, 3.2, 5.5, 6.6],
          "circle-color": [
            "case",
            [">=", ["get", "rollup_health"], 80], C_GREEN,
            [">=", ["get", "rollup_health"], 60], C_AMBER,
            C_RED
          ],
          "circle-stroke-color": "#0B1120",
          "circle-stroke-width": 1.2
        }
      });
      // subtle neon ring for active DC
      map.addLayer({
        id: "dc-ring",
        type: "circle",
        source: "dcs",
        minzoom: Z_SHOW_DCS,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3.5, 5.0, 6.5, 11],
          "circle-color": "transparent",
          "circle-stroke-color": C_RING,
          "circle-stroke-width": 1.4,
          "circle-stroke-opacity": 0.0
        }
      });

      // Stores (hidden until zoom/DC selected)
      map.addLayer({
        id: "stores-circles",
        type: "circle",
        source: "stores",
        minzoom: Z_SHOW_STORES,
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.4, 2.4, 9, 5.4],
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

      // Click DC => zoom & reveal stores for that DC
      map.on("click", "dc-circles", (e) => {
        const f = e.features?.[0]; if (!f) return;
        setDcId(f.properties.dc_id);
        flyToDC(map, f);
        toggleStores(map, true);
      });

      // keep store layer in sync with zoom
      map.on("zoomend", () => {
        toggleStores(map, map.getZoom() >= Z_SHOW_STORES || dcId !== "ALL");
      });

      // initial frame
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 0 });
    });

    return () => { try { ro.disconnect(); } catch(_){} try { map.remove(); } catch(_){} };
  }, []); // init once

  /* ---------- push filtered data to map safely ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const dcsSrc = map.getSource("dcs");
    const stSrc  = map.getSource("stores");
    if (dcsSrc) dcsSrc.setData(filteredDcs);
    if (stSrc)  stSrc.setData(filteredStores);

    // division glow and camera
    setDivisionGlow(map, division);
    if (division === "All" && dcId === "ALL") {
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 500, pitch: 0, bearing: 0 });
      toggleStores(map, false);
    }
  }, [filteredDcs, filteredStores, division, dcId]);

  /* ---------- UI actions ---------- */
  const handleDivisionClick = (div) => {
    setDivision(div);
    setDcId("ALL");

    const map = mapRef.current; if (!map) return;

    const b = boundsForDivision(regionsGeo, div);
    if (b) {
      map.fitBounds(b, { padding: { top: 80, left: 80, right: 80, bottom: 120 }, duration: 600, pitch: 35, bearing: 8 });
    } else {
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 600, pitch: 0, bearing: 0 });
    }
  };

  const handleDcChange = (val) => {
    setDcId(val);
    const map = mapRef.current; if (!map) return;

    if (val === "ALL") {
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 500 });
      toggleStores(map, false);
      if (map.getLayer("dc-ring")) map.setPaintProperty("dc-ring", "circle-stroke-opacity", 0.0);
      return;
    }
    const f = filteredDcs.features.find(x => x.properties.dc_id === val);
    if (f) { flyToDC(map, f); toggleStores(map, true); }
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
                onClick={() => handleDivisionClick(div)}>
                {div}
              </button>
            ))}
          </div>
        </div>

        <div className="grp">
          <label>Distribution Center</label>
          <select value={dcId} onChange={e => handleDcChange(e.target.value)}>
            <option value="ALL">ALL</option>
            {dcOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned} onChange={e => setOnlyAssigned(e.target.checked)} />
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

/* ---------- helpers (same IDs as the old working) ---------- */
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
  map.setFilter("region-lines", div === "All" ? null : ["==", ["get","division"], div]);
}

function flyToDC(map, dcFeature){
  const center = dcFeature.geometry.coordinates;
  map.flyTo({ center, zoom: 8.2, speed: 0.7, curve: 1.3, pitch: 45, bearing: 12, essential: true });
  if (map.getLayer("dc-ring")) {
    map.setFilter("dc-ring", ["==", ["get","dc_id"], dcFeature.properties.dc_id]);
    map.setPaintProperty("dc-ring", "circle-stroke-opacity", 0.85);
  }
}

function toggleStores(map, visible){
  if (!map.getLayer("stores-circles")) return;
  map.setLayoutProperty("stores-circles", "visibility", visible ? "visible" : "none");
}
