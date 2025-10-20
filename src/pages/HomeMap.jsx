import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';

import storesGeo from '../data/stores.geo.json';
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';

const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];

const US_BOUNDS = [
  [-125.0, 24.5],  // SW lng,lat
  [-66.9, 49.5]    // NE lng,lat (CONUS)
];

export default function HomeMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  // UI state
  const [period, setPeriod] = useState('DAILY');     // DAILY | WEEKLY
  const [division, setDivision] = useState('ALL');   // ALL + 4 regions
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // Filtered data (USA-only)
  const filteredGeo = useMemo(() => {
    const feats = storesGeo.features.filter(f => {
      const p = f.properties || {};
      if (p.p_country !== 'USA') return false;                // enforce USA
      if (division !== 'ALL' && p.p_division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      if (onlyAssigned && !p.is_assigned) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned]);

  // Build DC select options from current result
  const dcOptions = useMemo(() => {
    const s = new Set();
    filteredGeo.features.forEach(f => f.properties?.dc_id && s.add(f.properties.dc_id));
    return ['ALL', ...Array.from(s).sort()];
  }, [filteredGeo]);

  // Init map ONCE
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-97, 39],
      zoom: 3.5,
      attributionControl: false
    });

    // keep the map inside the USA and avoid scrolling to the world
    map.setMaxBounds(US_BOUNDS);
    mapRef.current = map;

    map.on('error', (e) => console.error('Mapbox error:', e?.error || e));

    map.on('load', () => {
      // source
      map.addSource('stores', { type: 'geojson', data: filteredGeo });

      // glow
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 6, 7.5, 12, 10],
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

      // core
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 6, 3.2, 12, 4.5],
          'circle-color': [
            'case',
            ['>=', ['get','health'], 80], '#28F7A0',
            ['>=', ['get','health'], 60], '#FFA54C',
            '#FF5A72'
          ],
          'circle-opacity': 1
        }
      });

      // cursor + click
      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.store_id;
        if (id) navigate(`/store/${id}?period=${period}`);
      });

      // tooltip
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10] });
      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0]; if (!f) return;
        const p = f.properties || {};
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt">
              <div class="tt-row"><b>${p.store_name || p.store_id}</b></div>
              <div class="tt-row">Health: <b>${Math.round(p.health)}</b></div>
              <div class="tt-row">Turnover: <b>${(p.turnover ?? 0).toFixed(1)}x</b></div>
              <div class="tt-row">Returns: <b>${p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '-'}</b></div>
            </div>`)
          .addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());
    });

    return () => map.remove();
  }, [navigate, period]);

  // Update data + fit bounds when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('stores');
    if (src) {
      src.setData(filteredGeo);
      if (filteredGeo.features.length) {
        const b = new mapboxgl.LngLatBounds();
        filteredGeo.features.forEach(f => b.extend(f.geometry.coordinates));
        map.fitBounds(b, { padding: 60, maxZoom: 7.5, duration: 500 });
      }
    }
  }, [filteredGeo]);

  return (
    <div className="home-shell">
      {/* Top bar */}
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" /> <span>Pulse · Inventory Insights</span>
        </div>
        <div className="seg">
          <button className={`seg-btn ${period==='DAILY' ? 'is-active' : ''}`} onClick={() => setPeriod('DAILY')}>Daily</button>
          <button className={`seg-btn ${period==='WEEKLY' ? 'is-active' : ''}`} onClick={() => setPeriod('WEEKLY')}>Weekly</button>
        </div>
        <div className="seg">
          <button className="seg-btn is-active">USA</button>
        </div>
      </div>

      {/* Filters card */}
      <div className="filters">
        <div className="group">
          <label>Division</label>
          <div className="pills">
            <button className={division==='ALL' ? 'is-active' : ''} onClick={() => setDivision('ALL')}>All</button>
            {DIVISIONS.map(d => (
              <button key={d} className={division===d ? 'is-active' : ''} onClick={() => setDivision(d)}>{d}</button>
            ))}
          </div>
        </div>

        <div className="group">
          <label>Distribution Center</label>
          <select value={dc} onChange={(e) => setDc(e.target.value)}>
            {dcOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div className="group chk">
          <label>
            <input type="checkbox" checked={onlyAssigned} onChange={(e) => setOnlyAssigned(e.target.checked)} />
            Show only my assigned stores
          </label>
        </div>
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
