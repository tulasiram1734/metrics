import React, {useEffect, useMemo, useRef, useState} from "react";
import mapboxgl from "mapbox-gl";
import storesGeo from "./data/stores.geo.json";
import dcsGeo from "./data/dcs.geo.json";
import regionsGeo from "./data/regions.geo.json"; // US states polygons for a subtle glow

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// ---- Tunables ----
const USA_BOUNDS = [-125.0, 24.3, -66.5, 49.5];
const ZOOM_THRESHOLD = 6;            // >= show stores, < show DCs
const FLY_SPEED = 0.8;
const FLY_CURVE = 1.4;
const DC_FIT_PADDING = {top: 60, bottom: 60, left: 80, right: 380}; // space for filter panel

// legend colors (same used in paint expressions)
const HEALTH = {
  GOOD: "#2DFFAA",
  WATCH: "#FFD24A",
  RISK: "#FF5A5C"
};

const DIVISIONS = ["All", "Northern", "Southern", "Eastern", "Midwestern"];

// roll-up dc health from stores (avg; change to weighted if you prefer)
function buildDcRollups(storesFc) {
  const acc = new Map();
  for (const f of storesFc.features) {
    const dc = f.properties.dc_id;
    const h = Number(f.properties.health ?? 0);
    if (!acc.has(dc)) acc.set(dc, {sum: 0, n: 0});
    const o = acc.get(dc);
    o.sum += h; o.n += 1;
  }
  const avg = new Map();
  for (const [dc, {sum, n}] of acc) avg.set(dc, n ? sum / n : 0);
  return avg;
}

function healthColorExpr(getProp = ["get", "health"]) {
  // mapbox expression returning color by health numeric value
  return [
    "case",
    [">=", getProp, 80], HEALTH.GOOD,
    [">=", getProp, 60], HEALTH.WATCH,
    HEALTH.RISK
  ];
}

function featureBounds(feature) {
  if (feature.geometry.type === "Point") {
    const [lng, lat] = feature.geometry.coordinates;
    return [[lng, lat], [lng, lat]];
  }
  // polygon/lines: compute bbox
  const coords = [];
  const walk = c => Array.isArray(c[0]) ? c.forEach(walk) : coords.push(c);
  walk(feature.geometry.coordinates);
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });
  return [[minLng, minLat], [maxLng, maxLat]];
}

export default function HomeMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  const [division, setDivision] = useState("All");
  const [dcId, setDcId] = useState("ALL");
  const [onlyAssigned, setOnlyAssigned] = useState(false); // wire up when you have auth

  // cache rollups
  const dcHealth = useMemo(() => buildDcRollups(storesGeo), []);
  // enrich DC features with roll-up health & division fallback
  const dcsEnriched = useMemo(() => ({
    type: "FeatureCollection",
    features: dcsGeo.features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        rollup_health: dcHealth.get(f.properties.dc_id) ?? 0
      }
    }))
  }), [dcHealth]);

  // filtered sets (by division/assigned)
  const filteredDcs = useMemo(() => ({
    type: "FeatureCollection",
    features: dcsEnriched.features.filter(f => {
      if (division !== "All" && f.properties.division !== division) return false;
      if (onlyAssigned && !f.properties.assigned) return false;
      return true;
    })
  }), [dcsEnriched, division, onlyAssigned]);

  const filteredStores = useMemo(() => ({
    type: "FeatureCollection",
    features: storesGeo.features.filter(f => {
      if (division !== "All" && f.properties.division !== division) return false;
      if (dcId !== "ALL" && f.properties.dc_id !== dcId) return false;
      if (onlyAssigned && !f.properties.assigned) return false;
      return true;
    })
  }), [division, dcId, onlyAssigned]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-96.5, 39.8],
      zoom: 3.3,
      projection: "mercator",
      attributionControl: false,
      maxBounds: USA_BOUNDS
    });
    map.addControl(new mapboxgl.AttributionControl({compact: true}));
    map.addControl(new mapboxgl.NavigationControl({showCompass: false}), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      // faint state boundaries for the glow effect
      map.addSource("regions", {type: "geojson", data: regionsGeo});
      map.addLayer({
        id: "region-lines",
        type: "line",
        source: "regions",
        paint: {"line-color": "#2BC4FF", "line-opacity": 0.08, "line-width": 1}
      });

      // DCs source + layer (visible at low zooms)
      map.addSource("dcs", {type: "geojson", data: filteredDcs});
      map.addLayer({
        id: "dcs-circle",
        type: "circle",
        source: "dcs",
        minzoom: 0,
        maxzoom: 24,
        paint: {
          "circle-color": healthColorExpr(["get", "rollup_health"]),
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            3, 5,
            6, 8,
            8, 10
          ],
          "circle-stroke-color": "#0B1022",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9
        }
      });

      // Stores source + layer (visible when zoomed in)
      map.addSource("stores", {type: "geojson", data: filteredStores});
      map.addLayer({
        id: "stores-circle",
        type: "circle",
        source: "stores",
        minzoom: ZOOM_THRESHOLD,
        paint: {
          "circle-color": healthColorExpr(["get", "health"]),
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            ZOOM_THRESHOLD, 3.5, 9, 6.5, 12, 9
          ],
          "circle-stroke-color": "#0B1022",
          "circle-stroke-width": 0.8,
          "circle-opacity": 0.92
        },
        layout: {"visibility": "none"}
      });

      // tooltips (dark)
      const popup = new mapboxgl.Popup({closeButton: false, closeOnClick: false, className: "tt"});

      // hover for DC
      map.on("mousemove", "dcs-circle", e => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features[0];
        const {dc_id, dc_name, division} = f.properties;
        const rh = Number(f.properties.rollup_health ?? 0).toFixed(0);
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt-wrap">
              <div class="tt-title">${dc_name}</div>
              <div class="tt-line"><span>DC ID</span><span>${dc_id}</span></div>
              <div class="tt-line"><span>Division</span><span>${division}</span></div>
              <div class="tt-line"><span>Roll-up Health</span><span class="${rh>=80?"green":rh>=60?"amber":"red"}">${rh}</span></div>
            </div>
          `)
          .addTo(map);
      });
      map.on("mouseleave", "dcs-circle", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      // click DC => zoom + reveal stores for that DC
      map.on("click", "dcs-circle", e => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const id = f.properties.dc_id;
        setDcId(id);                // updates store filter in React
        zoomToFeature(map, f);      // fly + glow
        showStores(map, true);      // reveal layer
      });

      // hover for store
      map.on("mousemove", "stores-circle", e => {
        map.getCanvas().style.cursor = "pointer";
        const p = e.features[0].properties;
        const h = Number(p.health ?? 0).toFixed(0);
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt-wrap">
              <div class="tt-title">${p.store_name}</div>
              <div class="tt-line"><span>Store</span><span>${p.store_id}</span></div>
              <div class="tt-line"><span>Health</span><span class="${h>=80?"green":h>=60?"amber":"red"}">${h}</span></div>
              <div class="tt-line"><span>DC</span><span>${p.dc_id}</span></div>
            </div>
          `)
          .addTo(map);
      });
      map.on("mouseleave", "stores-circle", () => { map.getCanvas().style.cursor = ""; popup.remove(); });

      // click store => navigate (replace with your router)
      map.on("click", "stores-circle", e => {
        const p = e.features[0].properties;
        window.location.href = `/store/${encodeURIComponent(p.store_id)}`;
      });

      // watch zoom to toggle visibility if user wheel-zooms
      map.on("moveend", () => {
        const z = map.getZoom();
        showStores(map, z >= ZOOM_THRESHOLD);
      });
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // update sources on filter changes
  useEffect(() => {
    const map = mapRef.current; if (!map?.isStyleLoaded()) return;

    const dcs = map.getSource("dcs"); if (dcs) dcs.setData(filteredDcs);
    const stores = map.getSource("stores"); if (stores) stores.setData(filteredStores);

    // when DC filter changes: if "ALL", fit to USA; else fly to that DC
    if (dcId === "ALL") {
      flyUSA(map);
      showStores(map, false);
    } else {
      const f = filteredDcs.features.find(ft => ft.properties.dc_id === dcId);
      if (f) { zoomToFeature(map, f); showStores(map, true); }
    }
  }, [filteredDcs, filteredStores, dcId]);

  // helpers
  const flyUSA = (map) => {
    map.fitBounds(USA_BOUNDS, {padding: DC_FIT_PADDING, duration: 700, curve: FLY_CURVE});
  };

  const zoomToFeature = (map, feature) => {
    const [sw, ne] = featureBounds(feature);
    map.fitBounds([sw, ne], {padding: DC_FIT_PADDING, duration: 700, curve: FLY_CURVE, maxZoom: 8});
    // subtle “glow” of the state bounds under the DC
    if (feature.properties?.state) {
      map.setFilter("region-lines", ["==", ["get", "name"], feature.properties.state]);
      map.setPaintProperty("region-lines", "line-opacity", 0.28);
      setTimeout(() => map.setPaintProperty("region-lines", "line-opacity", 0.08), 900);
    } else {
      map.setFilter("region-lines", true);
      map.setPaintProperty("region-lines", "line-opacity", 0.08);
    }
  };

  const showStores = (map, show) => {
    map.setLayoutProperty("stores-circle", "visibility", show ? "visible" : "none");
    map.setLayoutProperty("dcs-circle", "visibility", show ? "none" : "visible");
  };

  // build DC dropdown options from the currently filtered DCs
  const dcOptions = useMemo(() =>
    ["ALL", ...Array.from(new Set(filteredDcs.features.map(f => f.properties.dc_id)))],
    [filteredDcs]
  );

  return (
    <div className="home-wrap">
      {/* top bar */}
      <div className="topbar">
        <span className="title-dot" /> <span>Pulse · Inventory Insights</span>
      </div>

      {/* filter card */}
      <div className="filters">
        <label>Division</label>
        <div className="chips">
          {DIVISIONS.map(div => (
            <button
              key={div}
              className={division === div ? "chip chip--active" : "chip"}
              onClick={() => { setDivision(div); setDcId("ALL"); }}
            >{div}</button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dcId} onChange={e => setDcId(e.target.value)}>
          {dcOptions.map(id => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={onlyAssigned}
            onChange={e => setOnlyAssigned(e.target.checked)}
          />
          <span>Show only my assigned stores</span>
        </label>
      </div>

      {/* map */}
      <div ref={containerRef} className="mapbox" />

      {/* legend */}
      <div className="legend">
        <span className="dot green" /> <span>Healthy (≥80)</span>
        <span className="dot amber" /> <span>Watch (60–79)</span>
        <span className="dot red" /> <span>At Risk (&lt;60)</span>
      </div>
    </div>
  );
}
