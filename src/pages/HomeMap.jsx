// src/pages/HomeMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import storesGeo from '../data/stores.geo.json';
import '../styles/HomeMap.css';

// ---------- constants ----------
const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];
const US_BOUNDS = [[-167.65, 5.5], [-52.2, 74.1]]; // clamp panning to US/AK/HI bounds

// optional helper if you ever want to use it in JSX
const healthToColor = (h) => (h >= 80 ? '#28F7A0' : h >= 60 ? '#FFA54C' : '#FF5A72');

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // ---------- UI state ----------
  const [period, setPeriod] = useState('DAILY');     // DAILY | WEEKLY
  const [division, setDivision] = useState('All');   // All | Northern | Southern | Eastern | Midwestern
  const [dc, setDc] = useState('ALL');               // ALL | list from filtered set
  const [onlyAssigned, setOnlyAssigned] = useState(false); // wire later when you have assignments

  // ---------- filtering the dataset ----------
  const filteredGeo = useMemo(() => {
    const feats = storesGeo.features.filter((f) => {
      const p = f.properties || {};
      // stick to USA only per requirement
      if (p.country && p.country !== 'USA') return false;

      if (division !== 'All' && p.division !== division) return false;

      if (dc !== 'ALL' && p.dc_id !== dc) return false;

      if (onlyAssigned && !p.is_assigned) return false;

      return true;
    });

    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned]);

  // ---------- build DC options from current filter (division) ----------
  const dcOptions = useMemo(() => {
    const set = new Set();
    storesGeo.features.forEach((f) => {
      const p = f.properties || {};
      if (p.country && p.country !== 'USA') return;
      if (division !== 'All' && p.division !== division) return;
      if (onlyAssigned && !p.is_assigned) return;
      if (p.dc_id) set.add(p.dc_id);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [division, onlyAssigned]);

  // Reset DC when division changes
  useEffect(() => setDc('ALL'), [division]);

  // ---------- initialize map once ----------
  useEffect(() => {
    if (mapRef.current) return;

    const token = process.env.REACT_APP_MAPBOX_TOKEN;
    mapboxgl.accessToken = token || '';
    console.log('Mapbox token length:', token ? token.length : 0);

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11', // keep agreed dark style
      center: [-97, 39],
      zoom: 3.5,
      attributionControl: false
    });

    map.setMaxBounds(US_BOUNDS);
    map.on('error', (e) => console.error('Mapbox error:', e?.error || e));
    mapRef.current = map;

    // Make sure the canvas lays out properly
    requestAnimationFrame(() => map.resize());

    const onStyleLoaded = () => {
      try {
        if (!map.getStyle()) {
          console.error('Style not available after style.load (token/restriction?)');
          return;
        }

        // Source (create once)
        if (!map.getSource('stores')) {
          map.addSource('stores', { type: 'geojson', data: filteredGeo });
        }

        // Glow layer
        if (!map.getLayer('stores-glow')) {
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
        }

        // Core dot layer
        if (!map.getLayer('stores-core')) {
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
              'circle-opacity': 1
            }
          });
        }

        // Interactions
        map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

        map.on('click', 'stores-core', (e) => {
          const f = e?.features?.[0];
          const id = f?.properties?.store_id;
          if (id) navigate(`/store/${id}?period=${period}`);
        });

        // Tooltip
        const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10] });
        map.on('mousemove', 'stores-core', (e) => {
          const f = e?.features?.[0]; if (!f) return;
          const p = f.properties || {};
          popup.setLngLat(e.lngLat).setHTML(`
            <div class="tt">
              <div class="tt-row"><b>${p.store_name || p.store_id}</b></div>
              <div class="tt-row">Health: <b>${Math.round(p.health)}</b></div>
              <div class="tt-row">Turnover: <b>${(p.turnover ?? 0).toFixed(1)}x</b></div>
              <div class="tt-row">Returns: <b>${p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '-'}</b></div>
            </div>
          `).addTo(map);
        });
        map.on('mouseleave', 'stores-core', () => popup.remove());
      } catch (err) {
        console.error('Layer wiring error:', err);
      }
    };

    // Some Chrome builds emit either one—listen to both
    map.once('style.load', onStyleLoaded);
    map.once('load', onStyleLoaded);

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, period]);

  // ---------- update source data + zoom when filters change ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const src = map.getSource('stores');
    if (src) src.setData(filteredGeo);

    if (filteredGeo.features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      filteredGeo.features.forEach((f) => bounds.extend(f.geometry.coordinates));
      map.fitBounds(bounds, { padding: 60, maxZoom: 7.5, duration: 600 });
    }
  }, [filteredGeo]);

  // ---------- UI ----------
  return (
    <div className="home-shell">
      {/* Top bar (brand + period switch + region chip) */}
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" />
          <span>Pulse • Inventory Insights</span>
        </div>

        <div className="seg">
          <button
            className={`period ${period === 'DAILY' ? 'is-active' : ''}`}
            onClick={() => setPeriod('DAILY')}
          >
            Daily
          </button>
          <button
            className={`period ${period === 'WEEKLY' ? 'is-active' : ''}`}
            onClick={() => setPeriod('WEEKLY')}
          >
            Weekly
          </button>
        </div>

        {/* Country selector fixed to USA as requested */}
        <div className="seg">
          <button className="country is-active">USA</button>
        </div>
      </div>

      {/* Filters panel */}
      <div className="filters">
        <div className="group">
          <label>Division</label>
          <div className="pills">
            <button
              className={`pill ${division === 'All' ? 'is-active' : ''}`}
              onClick={() => setDivision('All')}
            >
              All
            </button>
            {DIVISIONS.map((d) => (
              <button
                key={d}
                className={`pill ${division === d ? 'is-active' : ''}`}
                onClick={() => setDivision(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="group">
          <label>Distribution Center</label>
          <select value={dc} onChange={(e) => setDc(e.target.value)}>
            {dcOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className="group chk">
          <label>
            <input
              type="checkbox"
              checked={onlyAssigned}
              onChange={(e) => setOnlyAssigned(e.target.checked)}
            />
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
