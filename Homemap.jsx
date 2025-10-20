// HomeMap.jsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';
import storesGeo from '../data/stores.geo.json';
import '../styles/HomeMap.css';

// ******* IMPORTANT *******
// Make sure your .env has: REACT_APP_MAPBOX_TOKEN=pk.XXXX
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const DIVISIONS = ['Northern','Southern','Eastern','Midwestern'];

const healthToColor = (h) => {
  if (h >= 80) return '#28F7A0';       // neon green
  if (h >= 60) return '#FFA54C';       // neon orange
  return '#FF5A72';                    // neon red
};

export default function HomeMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const navigate = useNavigate();

  // UI state
  const [period, setPeriod] = useState('DAILY'); // or WEEKLY
  const [country, setCountry] = useState('USA'); // USA | CAN
  const [division, setDivision] = useState('All');
 const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // Filter data
  const filteredGeo = useMemo(() => {
    const feats = storesGeo.features.filter(f => {
      const p = f.properties || {};
      if (country !== p.country) return false;
      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      if (onlyAssigned && !p.assigned) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [country, division, dc, onlyAssigned]);

  // Build DC dropdown based on visible features
  const dcOptions = useMemo(() => {
    const s = new Set();
    filteredGeo.features.forEach(f => s.add(f.properties.dc_id));
    return ['ALL', ...Array.from(s).sort()];
  }, [filteredGeo]);

  // ---- Create map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const initialCenter = country === 'USA' ? [-98.5, 39.8] : [-95.5, 61.4];
    const initialZoom = country === 'USA' ? 3.2 : 3.5;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11', // *** CRUCIAL ***
      center: initialCenter,
      zoom: initialZoom,
      projection: 'globe',
    });

    // Store ref
    mapRef.current = map;

    // Do all layer/source work only after style is ready
    map.on('style.load', () => {
      map.setFog({}); // subtle globe fog

      // Source
      if (!map.getSource('stores')) {
        map.addSource('stores', { type: 'geojson', data: filteredGeo });
      }

      // Glow layer (under)
      if (!map.getLayer('stores-glow')) {
        map.addLayer({
          id: 'stores-glow',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              1, 3, 3, 4, 6, 7.5, 12, 10
            ],
            'circle-color': [
              'case',
              ['>=', ['get','health'], 80], '#28F7A0',
              ['>=', ['get','health'], 60], '#FFA54C',
              '#FF5A72'
            ],
            'circle-opacity': 0.85,
            'circle-blur': 0.6
          }
        });
      }

      // Core dot (above)
      if (!map.getLayer('stores-core')) {
        map.addLayer({
          id: 'stores-core',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              1, 2, 3, 3.2, 6, 3.2, 12, 4.5
            ],
            'circle-color': [
              'case',
              ['>=', ['get','health'], 80], '#28F7A0',
              ['>=', ['get','health'], 60], '#FFA54C',
              '#FF5A72'
            ],
            'circle-opacity': 1.0
          }
        });
      }

      // Cursor
      map.on('mouseenter', 'stores-core', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'stores-core', () => map.getCanvas().style.cursor = '');

      // Click => navigate
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        navigate(`/store/${f.properties.store_id}?period=${period}`);
      });

      // Tooltip
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10]});
      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        popup.setLngLat(e.lngLat).setHTML(`
          <div class="tt">
            <div class="tt-title"><b>${p.store_name}</b> <span class="tt-id">${p.store_id}</span></div>
            <div class="tt-line">Health <b>${Math.round(p.health)}</b></div>
            <div class="tt-line">Turnover <b>${(p.turnover ?? 0).toFixed(1)}x</b></div>
            <div class="tt-line">Returns <b>${p.return_pct != null ? (p.return_pct*100).toFixed(1)+'%' : '–'}</b></div>
          </div>
        `).addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());
    });

    // Clean up
    return () => map.remove();
  }, [navigate, country, period, filteredGeo]);

  // Update source data when filters change (after style is ready)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;

    const src = map.getSource('stores');
    if (src) src.setData(filteredGeo);

    // Fit bounds of visible points
    if (filteredGeo.features.length) {
      const bounds = new mapboxgl.LngLatBounds();
      filteredGeo.features.forEach(f => bounds.extend(f.geometry.coordinates));
      map.fitBounds(bounds, { padding: 60, maxZoom: 7, duration: 500 });
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
          <button className={`seg button ${period==='DAILY' ? 'is-active' : ''}`}
                  onClick={() => setPeriod('DAILY')}>Daily</button>
          <button className={`seg button ${period==='WEEKLY' ? 'is-active' : ''}`}
                  onClick={() => setPeriod('WEEKLY')}>Weekly</button>
        </div>

        <div className="seg">
          <button className="seg button is-active">USA</button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <label>Division</label>
        <div className="pills">
          <button className={`p ${division==='All' ? 'is-active':''}`} onClick={() => setDivision('All')}>All</button>
          {DIVISIONS.map(d =>
            <button key={d} className={`p ${division===d ? 'is-active':''}`} onClick={() => setDivision(d)}>{d}</button>
          )}
        </div>

        <label>Distribution Center</label>
        <select value={dc} onChange={e => setDc(e.target.value)}>
          {dcOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned} onChange={e => setOnlyAssigned(e.target.checked)} />
          Show only my assigned stores
        </label>
      </div>

      {/* Map */}
      <div ref={containerRef} className="mapbox" />

      {/* Legend */}
      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot orange" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
