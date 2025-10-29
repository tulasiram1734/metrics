// src/pages/HomeMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';

// Data
import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';

// Styles (keep your existing CSS file; just ensure .mapbox has width/height 100%)
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// UI pill labels must match feature properties.division values
const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];

// Health → neon color
function healthToColor(h) {
  if (h >= 80) return '#28FFA0'; // neon green
  if (h >= 60) return '#FFEA54'; // neon amber
  return '#FF5A72';              // neon red
}

const CONUS_BOUNDS = [[-125, 24], [-66, 49]]; // contiguous US

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const readyRef = useRef(false);
  const navigate = useNavigate();

  // UI state
  const [division, setDivision] = useState('All'); // 'All' or one of DIVISIONS
  const [dc, setDc] = useState('ALL');            // 'ALL' or a dc_id
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // Filter stores by division/country + assignment
  const filteredStores = useMemo(() => {
    const feats = storesGeo.features.filter((f) => {
      const p = f.properties;
      if (onlyAssigned && p.assigned !== true) return false;
      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned]);

  // Build DC dropdown options for current visible selection
  const dcOptions = useMemo(() => {
    const set = new Set();
    filteredStores.features.forEach((f) => set.add(f.properties.dc_id));
    return ['ALL', ...Array.from(set).sort()];
  }, [filteredStores]);

  // -------- Map init (USA only, no globe) --------
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      projection: 'mercator',          // no globe
      renderWorldCopies: false,
      center: [-97, 37],
      zoom: 3.25,
      pitch: 0,
      bearing: 0,
      maxBounds: [
        [-167, 10], // SW
        [-52, 75],  // NE
      ],
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      // --- Regions (Divisions + DCs) sources/layers ---
      if (!map.getSource('regions')) {
        map.addSource('regions', { type: 'geojson', data: regionsGeo });
      }

      // Division glow (wide soft line)
      if (!map.getLayer('region-glow')) {
        map.addLayer({
          id: 'region-glow',
          type: 'line',
          source: 'regions',
          filter: ['==', ['get', 'type'], 'Division'],
          paint: {
            'line-color': '#2BC4FF',
            'line-opacity': 0.15,
            'line-width': 6,
            'line-blur': 0.6,
          },
        });
      }
      // Division crisp line
      if (!map.getLayer('region-line')) {
        map.addLayer({
          id: 'region-line',
          type: 'line',
          source: 'regions',
          filter: ['==', ['get', 'type'], 'Division'],
          paint: {
            'line-color': '#2BC4FF',
            'line-opacity': 0.85,
            'line-width': 1.6,
          },
        });
      }

      // --- Stores source + layers ---
      if (!map.getSource('stores')) {
        map.addSource('stores', { type: 'geojson', data: filteredStores });
      }

      // Outer glow
      if (!map.getLayer('stores-glow')) {
        map.addLayer({
          id: 'stores-glow',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              1, 3, 3, 4, 6, 7.5, 12, 10, 14, 14],
            'circle-color': [
              'case',
              ['>=', ['get', 'health'], 80], '#28FFA0',
              ['>=', ['get', 'health'], 60], '#FFEA54',
              '#FF5A72',
            ],
            'circle-opacity': 0.35,
            'circle-blur': 1.0,
          },
        });
      }

      // Core dot
      if (!map.getLayer('stores-core')) {
        map.addLayer({
          id: 'stores-core',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              1, 2.2, 3, 3.2, 6, 5.2, 12, 6.4, 14, 7.8],
            'circle-color': [
              'case',
              ['>=', ['get', 'health'], 80], '#28FFA0',
              ['>=', ['get', 'health'], 60], '#FFEA54',
              '#FF5A72',
            ],
            'circle-opacity': 1.0,
          },
        });
      }

      // Cursor
      map.on('mouseenter', 'stores-core', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'stores-core', () => {
        map.getCanvas().style.cursor = '';
      });

      // Dark tooltip
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -10],
      });
      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const pct = p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '—';

        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="
              background:#0b1530;border:1px solid rgba(43,196,255,.35);
              box-shadow:0 8px 30px rgba(0,0,0,.45);
              padding:10px 12px;border-radius:10px;
              color:#e9f0ff; font-size:12px; line-height:1.25; min-width:180px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="width:8px;height:8px;border-radius:50%;
                  background:${healthToColor(Number(p.health))};box-shadow:0 0 12px ${healthToColor(Number(p.health))};"></span>
                <b>${p.store_name ?? 'Store'}</b>
                <span style="opacity:.7;">(${p.store_id})</span>
              </div>
              <div>Health: <b>${Math.round(p.health)}</b></div>
              <div>Division: <b>${p.division}</b></div>
              <div>Turnover: <b>${(p.turnover ?? 0).toFixed(1)}%</b></div>
              <div>Returns: <b>${pct}</b></div>
            </div>
          `)
          .addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());

      // Click → Store dashboard
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        navigate(`/store/${f.properties.store_id}`);
      });

      // First fit to US
      map.fitBounds(CONUS_BOUNDS, { padding: 60, duration: 600, maxZoom: 6.2 });
      readyRef.current = true;
    });

    return () => map.remove();
  }, [navigate, filteredStores]);

  // Update stores data on filter change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('stores');
    if (src) src.setData(filteredStores);
  }, [filteredStores]);

  // Zoom to Division/DC selection (with subtle 3D)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    const fitPoly = (feature, { maxZoom = 6.8 } = {}) => {
      const bounds = new mapboxgl.LngLatBounds();
      const geom = feature.geometry;
      const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
      rings.flat().forEach(([lng, lat]) => bounds.extend([lng, lat]));
      map.fitBounds(bounds, {
        padding: 60,
        duration: 900,
        pitch: 35,
        bearing: 10,
        maxZoom,
      });
    };

    const flyToPoint = ([lng, lat]) => {
      map.flyTo({
        center: [lng, lat],
        zoom: 8,
        pitch: 40,
        bearing: 20,
        duration: 900,
        curve: 1.6,
        essential: true,
      });
    };

    // DC selected
    if (dc !== 'ALL') {
      const dcFeat = regionsGeo.features.find(
        (f) => f.properties.type === 'DC' && f.properties.dc_id === dc
      );
      if (dcFeat) {
        flyToPoint(dcFeat.geometry.coordinates);
        return;
      }
    }

    // Division selected
    if (division !== 'All') {
      const divPoly = regionsGeo.features.find(
        (f) => f.properties.type === 'Division' && f.properties.division === division
      );
      if (divPoly) {
        fitPoly(divPoly, { maxZoom: 6.6 });
        return;
      }
    }

    // Default: whole US
    map.fitBounds(CONUS_BOUNDS, { padding: 60, duration: 600, pitch: 0, bearing: 0, maxZoom: 6.2 });
  }, [division, dc]);

  return (
    <div className="home-shell">
      {/* Top bar (unchanged style) */}
      <div className="home-header">
        <span className="brand">
          <span className="pulse-dot" /> <span>Pulse • Inventory Insights</span>
        </span>
      </div>

      {/* Filters */}
      <div className="filters">
        <label>Division</label>
        <div className="pills">
          <button
            className={division === 'All' ? 'is-active' : ''}
            onClick={() => { setDivision('All'); setDc('ALL'); }}
          >All</button>
          {DIVISIONS.map((d) => (
            <button
              key={d}
              className={division === d ? 'is-active' : ''}
              onClick={() => { setDivision(d); setDc('ALL'); }}
            >
              {d}
            </button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select
          value={dc}
          onChange={(e) => setDc(e.target.value)}
        >
          {dcOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <label className="chk">
          <input
            type="checkbox"
            checked={onlyAssigned}
            onChange={(e) => setOnlyAssigned(e.target.checked)}
          />
          Show only my assigned stores
        </label>
      </div>

      {/* Map */}
      <div ref={containerRef} className="mapbox" />

      {/* Legend (unchanged) */}
      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot orange" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
