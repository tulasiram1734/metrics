import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';
import storesGeo from '../data/stores.geo.json';
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// Health → color
const healthToColor = (h) => (h >= 80 ? '#28F7A0' : h >= 60 ? '#FFA54C' : '#FF5A72');

// Division options (exact labels you requested)
const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // UI state
  const [period, setPeriod] = useState('DAILY');    // DAILY | WEEKLY
  const [country, setCountry] = useState('USA');    // USA | CAN
  const [division, setDivision] = useState('All');  // All | Northern | Southern | Eastern | Midwestern
  const [dc, setDc] = useState('All');              // All | DC-xxx (depends on division)
  const [onlyAssigned, setOnlyAssigned] = useState(false); // optional: show only modeler’s stores

  // Filter stores based on division/dc/country
  const filteredGeo = useMemo(() => {
    const feats = storesGeo.features.filter(f => {
      const p = f.properties;
      if (country !== 'ALL' && p.country && p.country !== country) return false;

      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'All' && p.dc_id !== dc) return false;

      if (onlyAssigned && p.assigned !== true) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned, country]);

  // Build DC list from the *currently visible* division/country
  const dcOptions = useMemo(() => {
    const set = new Set();
    storesGeo.features.forEach(f => {
      const p = f.properties;
      if ((division === 'All' || p.division === division) &&
          (country === 'ALL' || !p.country || p.country === country)) {
        set.add(p.dc_id);
      }
    });
    return ['All', ...Array.from(set).sort()];
  }, [division, country]);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: country === 'CAN' ? [-98, 58] : [-97, 39],
      zoom: country === 'CAN' ? 3.2 : 3.5,
      attributionControl: false
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('stores', { type: 'geojson', data: filteredGeo });

      // Glow
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 6, 7.5, 12, 10],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80], '#28F7A0',
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
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 6, 3.2, 12, 4.5],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80], '#28F7A0',
            ['>=', ['get', 'health'], 60], '#FFA54C',
            '#FF5A72'
          ],
          'circle-opacity': 1.0
        }
      });

      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

      // Click → navigate to store detail
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties.store_id;
        navigate(`/store/${id}?period=${period}`);
      });

      // Tooltip on hover
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10] });
      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt">
              <div class="tt-title">${p.store_name} <span class="tt-id">${p.store_id}</span></div>
              <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
              <div class="tt-line"><span>Turnover</span><b>${(p.turnover ?? 0).toFixed(1)}×</b></div>
              <div class="tt-line"><span>Returns</span><b>${p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '-'}</b></div>
            </div>
          `)
          .addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());
    });

    return () => map.remove();
  }, [navigate, period, country, filteredGeo]);

  // Update source when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('stores');
    if (src) src.setData(filteredGeo);

    // Zoom to bounds of filtered set
    if (filteredGeo.features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      filteredGeo.features.forEach(f => bounds.extend(f.geometry.coordinates));
      map.fitBounds(bounds, { padding: 60, maxZoom: 7.5, duration: 600 });
    }
  }, [filteredGeo]);

  // When division changes, reset DC to All
  useEffect(() => { setDc('All'); }, [division]);

  return (
    <div className="home-shell">
      {/* Top bar */}
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" /> <span>Pulse • Inventory Insights</span>
        </div>

        <div className="seg">
          <button className={period === 'DAILY' ? 'is-active' : ''} onClick={() => setPeriod('DAILY')}>Daily</button>
          <button className={period === 'WEEKLY' ? 'is-active' : ''} onClick={() => setPeriod('WEEKLY')}>Weekly</button>
        </div>

        <div className="seg">
          <button className={country === 'USA' ? 'is-active' : ''} onClick={() => setCountry('USA')}>USA</button>
          <button className={country === 'CAN' ? 'is-active' : ''} onClick={() => setCountry('CAN')}>Canada</button>
        </div>
      </div>

      {/* Filters card */}
      <div className="filters">
        <div className="group">
          <label>Division</label>
          <div className="pills">
            <button className={division === 'All' ? 'is-active' : ''} onClick={() => setDivision('All')}>All</button>
            {DIVISIONS.map(d => (
              <button key={d} className={division === d ? 'is-active' : ''} onClick={() => setDivision(d)}>{d}</button>
            ))}
          </div>
        </div>

        <div className="group">
          <label>Distribution Center</label>
          <select value={dc} onChange={(e) => setDc(e.target.value)}>
            {dcOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned} onChange={e => setOnlyAssigned(e.target.checked)} />
          Show only my assigned stores
        </label>
      </div>

      {/* Map container */}
      <div ref={containerRef} className="mapbox" />

      {/* Legend */}
      <div className="legend">
        <span><i className="dot green" /> Healthy (80–100)</span>
        <span><i className="dot orange" /> Watch (60–79)</span>
        <span><i className="dot red" /> At Risk (&lt;60)</span>
      </div>
    </div>
  );
}
