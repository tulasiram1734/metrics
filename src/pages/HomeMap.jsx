// src/pages/HomeMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';
import storesGeo from '../data/stores.geo.json';
import '../styles/HomeMap.css';
import 'mapbox-gl/dist/mapbox-gl.css';

// ----- Mapbox token -----
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';

const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];

const colorForHealth = (h) => {
  if (h >= 80) return '#2B7FA0'; // neon green/blue
  if (h >= 60) return '#FFA54C'; // orange
  return '#FF5A72';              // red
};

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // --- UI state ---
  const [period, setPeriod] = useState('DAILY');        // DAILY | WEEKLY (placeholder for future)
  const [country, setCountry] = useState('USA');        // USA | CAN (we default to USA)
  const [division, setDivision] = useState('ALL');      // ALL | Northern | Southern | Eastern | Midwestern
  const [dc, setDc] = useState('ALL');                  // dynamic options
  const [onlyAssigned, setOnlyAssigned] = useState(false); // future: filter for modeler’s stores

  // --- Filtered geojson for the map ---
  const filteredGeo = useMemo(() => {
    const feats = storesGeo.features.filter((f) => {
      const p = f.properties || {};
      if (country !== 'USA' && p.country !== country) return false;
      if (country === 'USA' && p.country !== 'USA') return false;

      if (division !== 'ALL' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;

      if (onlyAssigned && !p.assigned) return false;

      return true;
    });

    return { type: 'FeatureCollection', features: feats };
  }, [country, division, dc, onlyAssigned]);

  // --- Build DC options from filtered set ---
  const dcOptions = useMemo(() => {
    const set = new Set();
    filteredGeo.features.forEach((f) => {
      const p = f.properties || {};
      if (p.dc_id) set.add(p.dc_id);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [filteredGeo]);

  // --- Initialize map (once) ---
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    if (!mapboxgl.accessToken) {
      console.warn('Mapbox token missing. Put REACT_APP_MAPBOX_TOKEN=... in .env and restart dev server.');
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',     // IMPORTANT: style must be mapbox://… for GL JS
      projection: 'mercator',
      center: [-98.5, 39],                          // USA center
      zoom: 3.25,
      minZoom: 2.8,
      maxZoom: 8
    });

    // Disable default box zoom/rotation for cleaner UX
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    // Add source + layers when map is ready
    map.on('load', () => {
      map.addSource('stores', { type: 'geojson', data: filteredGeo });

      // Glow ring
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            1, 3, 3, 5, 4.5, 7, 6.5, 10, 8, 12
          ],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80], '#2B7FA0',
            ['>=', ['get', 'health'], 60], '#FFA54C',
            '#FF5A72'
          ],
          'circle-opacity': 0.85,
          'circle-blur': 0.6
        }
      });

      // Core dot
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            1, 1.8, 3, 3, 4.5, 4.6, 6.5, 6.4, 8, 7.5
          ],
          'circle-color': '#ffffff',
          'circle-opacity': 1
        }
      });

      // Cursor feedback
      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

      // Click → navigate to store dashboard
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        navigate(`/store/${p.store_id}?period=${period}`);
      });

      // Tooltip on hover
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -12] });
      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        popup.setLngLat(e.lngLat).setHTML(
          `<div class="tt">
            <div class="tt-title">${p.store_name || p.store_id}</div>
            <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
            <div class="tt-line"><span>Turnover</span><b>${(p.turnover || 0).toFixed(1)}×</b></div>
            <div class="tt-line"><span>Returns</span><b>${p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '—'}</b></div>
          </div>`
        ).addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());
    });

    // Resize on container changes (important for the “There is no style added…” glitches)
    const ro = new ResizeObserver(() => {
      try { map.resize(); } catch {}
    });
    ro.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [navigate, period, filteredGeo]);

  // --- Update source data when filters change ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('stores');
    if (src) src.setData(filteredGeo);

    // Auto-fit bounds if we have points
    if (filteredGeo.features.length) {
      const bounds = new mapboxgl.LngLatBounds();
      filteredGeo.features.forEach((f) => bounds.extend(f.geometry.coordinates));
      map.fitBounds(bounds, { padding: 72, maxZoom: 7.5, duration: 600 });
    } else {
      map.easeTo({ center: [-98.5, 39], zoom: 3.25, duration: 600 });
    }
  }, [filteredGeo]);

  // Reset DC to ALL when division changes
  useEffect(() => { setDc('ALL'); }, [division]);

  return (
    <div className="home-shell">
      {/* Top bar */}
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" /> <span>Pulse · Inventory Insights</span>
        </div>

        <div className="seg">
          <button className={`seg-btn ${period === 'DAILY' ? 'is-active' : ''}`} onClick={() => setPeriod('DAILY')}>Daily</button>
          <button className={`seg-btn ${period === 'WEEKLY' ? 'is-active' : ''}`} onClick={() => setPeriod('WEEKLY')}>Weekly</button>
        </div>

        <div className="seg">
          <button className={`seg-btn ${country === 'USA' ? 'is-active' : ''}`} onClick={() => setCountry('USA')}>USA</button>
          <button className={`seg-btn ${country === 'CAN' ? 'is-active' : ''}`} onClick={() => setCountry('CAN')}>Canada</button>
        </div>
      </div>

      {/* Filters card */}
      <div className="filters">
        <label>Division</label>
        <div className="filters-pills">
          <button
            className={`pill ${division === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setDivision('ALL')}
          >All</button>

          {DIVISIONS.map((d) => (
            <button
              key={d}
              className={`pill ${division === d ? 'is-active' : ''}`}
              onClick={() => setDivision(d)}
            >{d}</button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dc} onChange={(e) => setDc(e.target.value)}>
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

      {/* Map container */}
      <div ref={containerRef} className="mapbox-container" />

      {/* Legend */}
      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot orange" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
