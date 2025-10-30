import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import storesGeo from "./data/stores.geo.json";
import dcsGeo from "./data/dcs.geo.json";
import regionsGeo from "./data/regions.geo.json"; // USA states polygons (optional, for glow)

import "./styles/HomeMap.css";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// --- UI constants ---
const DIVISIONS = ["All", "Northern", "Southern", "Eastern", "Midwestern"];
const USA_BOUNDS = [
  [-125.101, 24.396], // SW
  [-66.934, 49.384],  // NE
];

const Z_DC = 4.5;     // DC circles are visible at & below this zoom
const Z_STORE = 6.0;  // stores are visible at & above this zoom

// colors
const C_GREEN = "#21FFA4"; // neon green (healthy)
const C_AMBER = "#FFDF4A"; // neon amber (watch)
const C_RED = "#FF5A5C";   // neon red (at risk)
const C_DC_RING = "#2BC4FF"; // division glow

function healthToColor(h) {
  if (h >= 80) return C_GREEN;
  if (h >= 60) return C_AMBER;
  return C_RED;
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function computeStoreRollups(storesFC) {
  // group by dc_id and compute average health
  const byDc = new Map();
  for (const f of storesFC.features) {
    const dc = f?.properties?.dc_id;
    const h = Number(f?.properties?.health ?? 0);
    if (!dc) continue;
    if (!byDc.has(dc)) byDc.set(dc, []);
    byDc.get(dc).push(h);
  }
  const rollup = new Map();
  byDc.forEach((arr, dc) => rollup.set(dc, +avg(arr).toFixed(1)));
  return rollup;
}

function filterFC(fc, predicate) {
  return {
    type: "FeatureCollection",
    features: fc.features.filter(predicate),
  };
}

function fcBounds(fc) {
  const b = new mapboxgl.LngLatBounds();
  fc.features.forEach((f) => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === "Point") {
      b.extend(g.coordinates);
    } else if (g.type === "MultiPoint") {
      g.coordinates.forEach((c) => b.extend(c));
    } else if (g.type === "Polygon") {
      g.coordinates.flat().forEach((c) => b.extend(c));
    } else if (g.type === "MultiPolygon") {
      g.coordinates.flat(2).forEach((c) => b.extend(c));
    }
  });
  return b;
}

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  const [division, setDivision] = useState("All");
  const [dcId, setDcId] = useState("ALL");
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // ---- data views (reactive to filters) ----
  const rollups = useMemo(() => computeStoreRollups(storesGeo), []);

  // DCs with rollup_health injected (source-of-truth remains your JSON)
  const dcsWithRollup = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: dcsGeo.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          rollup_health:
            f.properties.rollup_health ??
            rollups.get(f.properties.dc_id) ??
            0,
        },
      })),
    };
  }, [rollups]);

  // Filtered DCs by division
  const filteredDCs = useMemo(() => {
    return filterFC(dcsWithRollup, (f) =>
      division === "All" ? true : f.properties.division === division
    );
  }, [division, dcsWithRollup]);

  // Filtered stores by division/DC/assignment
  const filteredStores = useMemo(() => {
    return filterFC(storesGeo, (f) => {
      const okDiv = division === "All" || f.properties.division === division;
      const okDc = dcId === "ALL" || f.properties.dc_id === dcId;
      const okAssign = !onlyAssigned || !!f.properties.assigned;
      return okDiv && okDc && okAssign;
    });
  }, [division, dcId, onlyAssigned]);

  // options for DC dropdown
  const dcOptions = useMemo(() => {
    const s = new Set();
    filteredDCs.features.forEach((f) => s.add(f.properties.dc_id));
    return ["ALL", ...Array.from(s).sort()];
  }, [filteredDCs]);

  // ---- init map once ----
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-98.5795, 39.8283], // USA centroid
      zoom: 3.35,
      projection: "globe",
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.fitBounds(USA_BOUNDS, { padding: 60, duration: 600 });

    map.on("load", () => {
      // --- sources ---
      if (!map.getSource("regions")) {
        map.addSource("regions", { type: "geojson", data: regionsGeo });
      }
      if (!map.getSource("dcs")) {
        map.addSource("dcs", { type: "geojson", data: filteredDCs });
      }
      if (!map.getSource("stores")) {
        map.addSource("stores", { type: "geojson", data: filteredStores });
      }

      // --- division glow (thin neon outline) ---
      if (!map.getLayer("region-outline")) {
        map.addLayer({
          id: "region-outline",
          type: "line",
          source: "regions",
          paint: {
            "line-color": C_DC_RING,
            "line-width": 0.6,
            "line-opacity": 0.15,
          },
        });
      }

      // --- DC circles (rollup view) ---
      if (!map.getLayer("dcs-core")) {
        map.addLayer({
          id: "dcs-core",
          type: "circle",
          source: "dcs",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3, 6,
              5, 10,
              6, 0 // gracefully fade before stores appear
            ],
            "circle-color": [
              "case",
              [">=", ["get", "rollup_health"], 80], C_GREEN,
              [">=", ["get", "rollup_health"], 60], C_AMBER,
              C_RED,
            ],
            "circle-opacity": 0.85,
            "circle-stroke-color": "#0B1220",
            "circle-stroke-width": 1.2,
          },
          minzoom: 0,
          maxzoom: Z_STORE, // hide when stores show
        });
      }

      // --- Store dots (individual health) ---
      if (!map.getLayer("stores-core")) {
        map.addLayer({
          id: "stores-core",
          type: "circle",
          source: "stores",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              6, 2.5,
              8, 4.5,
              10, 7.5,
              12, 10,
            ],
            "circle-color": [
              "case",
              [">=", ["get", "health"], 80], C_GREEN,
              [">=", ["get", "health"], 60], C_AMBER,
              C_RED,
            ],
            "circle-opacity": 0.88,
            "circle-stroke-color": "#080F1A",
            "circle-stroke-width": 0.6,
          },
          minzoom: Z_STORE,
        });
      }

      // pointer cursor
      map.on("mousemove", (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: ["stores-core", "dcs-core"],
        });
        map.getCanvas().style.cursor = feats.length ? "pointer" : "default";
      });

      // hover tooltip (stores + DCs)
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "mapbox-popup--dark",
        offset: [0, 10],
      });

      function showTooltip(f, lngLat) {
        if (!f) return popup.remove();

        const p = f.properties || {};
        const isStore = !!p.store_id;

        const html = isStore
          ? `
          <div class="tt">
            <div class="tt-title">
              <span>${p.store_name ?? p.store_id}</span>
              <span class="tt-chip ${p.health >= 80 ? "green" : p.health >= 60 ? "amber" : "red"}">
                ${p.health}
              </span>
            </div>
            <div class="tt-line"><span>DC</span><span>${p.dc_id}</span></div>
            <div class="tt-line"><span>Division</span><span>${p.division}</span></div>
            <div class="tt-line"><span>Turnover</span><span>${p.turnover ?? "-"}</span></div>
            <div class="tt-line"><span>Returns</span><span>${p.return_pct != null ? (p.return_pct*100).toFixed(0) + "%" : "-"}</span></div>
          </div>`
          : `
          <div class="tt">
            <div class="tt-title">
              <span>${p.dc_name ?? p.dc_id}</span>
              <span class="tt-chip ${p.rollup_health >= 80 ? "green" : p.rollup_health >= 60 ? "amber" : "red"}">
                ${p.rollup_health}
              </span>
            </div>
            <div class="tt-line"><span>Division</span><span>${p.division}</span></div>
            <div class="tt-line"><span>Stores</span><span>${rollups.has(p.dc_id) ? "≈ " + (storesGeo.features.filter(s=>s.properties.dc_id===p.dc_id).length) : "-"}</span></div>
          </div>`;

        popup.setLngLat(lngLat).setHTML(html).addTo(map);
      }

      map.on("mouseleave", "stores-core", () => popup.remove());
      map.on("mouseleave", "dcs-core", () => popup.remove());

      map.on("mousemove", "stores-core", (e) =>
        showTooltip(e.features?.[0], e.lngLat)
      );
      map.on("mousemove", "dcs-core", (e) =>
        showTooltip(e.features?.[0], e.lngLat)
      );

      // click to zoom / navigate
      map.on("click", "dcs-core", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties.dc_id;
        setDcId(id);
        zoomToDC(id);
      });

      map.on("click", "stores-core", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        // TODO: hook to your router; for now, simulate navigation:
        // window.location.href = `/stores/${f.properties.store_id}`;
      });
    });

    // cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keep sources in sync with filters ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const dcsSrc = map.getSource("dcs");
    const storesSrc = map.getSource("stores");
    if (dcsSrc) dcsSrc.setData(filteredDCs);
    if (storesSrc) storesSrc.setData(filteredStores);
  }, [filteredDCs, filteredStores]);

  // ---- zoom logic: if DC changes, fit to its stores; else fit to USA ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (dcId === "ALL") {
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 700 });
      return;
    }
    zoomToDC(dcId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dcId]);

  function zoomToDC(id) {
    const map = mapRef.current;
    if (!map) return;

    const storesOfDc = filterFC(storesGeo, (f) => f.properties.dc_id === id);
    if (!storesOfDc.features.length) return;

    const b = fcBounds(storesOfDc);
    if (!b.isEmpty()) {
      map.fitBounds(b, { padding: { top: 90, right: 60, bottom: 80, left: 320 }, duration: 900 });
      // a little pitch for subtle 3D feel
      map.easeTo({ pitch: 35, bearing: 8, duration: 900, essential: true });
    }
  }

  return (
    <div className="home">
      {/* top bar */}
      <div className="topbar">
        <span className="brand-dot" />
        <span>Pulse · Inventory Insights</span>
      </div>

      {/* filters */}
      <div className="filters">
        <label>Division</label>
        <div className="division-pills">
          {DIVISIONS.map((d) => (
            <button
              key={d}
              className={`pill ${division === d ? "is-active" : ""}`}
              onClick={() => {
                setDivision(d);
                setDcId("ALL");
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select
          value={dcId}
          onChange={(e) => setDcId(e.target.value)}
          className="dc-select"
        >
          {dcOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <label className="chk">
          <input
            type="checkbox"
            checked={onlyAssigned}
            onChange={(e) => setOnlyAssigned(e.target.checked)}
          />
          <span>Show only my assigned stores</span>
        </label>
      </div>

      {/* map */}
      <div ref={containerRef} className="mapbox" />

      {/* legend */}
      <div className="legend">
        <span className="dot green" />
        <span>Healthy (≥80)</span>
        <span className="dot amber" />
        <span>Watch (60–79)</span>
        <span className="dot red" />
        <span>At Risk (&lt;60)</span>
      </div>
    </div>
  );
}
