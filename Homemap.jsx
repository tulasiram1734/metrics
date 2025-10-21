import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import divisionsGeo from '../data/divisions.geo.json';
import storesGeo from '../data/stores.geo.json';
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];
const usaBounds = [[-125.0, 24.2], [-66.5, 49.5]];
const healthToColor = (h) => (h >= 80 ? '#28F7A0' : h >= 60 ? '#FFB54C' : '#FF5A72');

export default function HomeMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [loading, setLoading] = useState(true);

  // Log token prefix so we know env is working
  useEffect(() => {
    const t = process.env.REACT_APP_MAPBOX_TOKEN || '';
    console.log('Mapbox token starts with:', t ? t.slice(0, 7) : '(missing)');
  }, []);

  const dcOptions = useMemo(() => {
    const set = new Set();
    storesGeo.features.forEach(f => {
      const p = f.properties;
      if (division !== 'All' && p.division !== division) return;
      set.add(p.dc_id);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [division]);

  const filteredStores = useMemo(() => ({
    type: 'FeatureCollection',
    features: storesGeo.features.filter(f => {
      const p = f.properties;
      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      if (onlyAssigned && !p.assigned) return false;
      return true;
    }),
  }), [division, dc, onlyAssigned]);

  const fitToCurrent = () => {
    const map = mapRef.current;
    if (!map) return;

    if (division === 'All') {
      map.fitBounds(usaBounds, { padding: 40, duration: 700 });
      map.setFilter('div-outline', ['in', ['get', 'name'], ['literal', DIVISIONS]]);
      map.setFilter('div-extrude', ['in', ['get', 'name'], ['literal', DIVISIONS]]);
    } else {
      const poly = divisionsGeo.features.find(f => f.properties.name === division);
      if (poly) {
        const bounds = new mapboxgl.LngLatBounds();
        poly.geometry.coordinates[0].forEach(([lng, lat]) => bounds.extend([lng, lat]));
        map.fitBounds(bounds, { padding: 60, duration: 700 });
      }
      map.setFilter('div-outline', ['==', ['get', 'name'], division]);
      map.setFilter('div-extrude', ['==', ['get', 'name'], division]);
    }
  };

  useEffect(() => {
    if (mapRef.current) return;

    const token = mapboxgl.accessToken;
    if (!token) {
      console.error('Missing REACT_APP_MAPBOX_TOKEN. Check .env at project root and restart dev server.');
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      bounds: usaBounds,
      dragRotate: false,
      touchPitch: false,
    });

    mapRef.current = map;

    // Surface any mapbox internal errors
    map.on('error', (e) => {
      console.warn('Mapbox error:', e && e.error ? e.error : e);
    });

    // Wait until the STYLE is ready
    map.on('style.load', () => {
      try {
        map.addSource('divisions', { type: 'geojson', data: divisionsGeo });
        map.addSource('stores', { type: 'geojson', data: filteredStores });

        map.addLayer({
          id: 'div-outline',
          type: 'line',
          source: 'divisions',
          paint: {
            'line-color': '#2bc4ff',
            'line-width': 2.0,
            'line-opacity': 0.85,
            'line-blur': 0.6,
          },
        });

        map.addLayer({
          id: 'div-extrude',
          type: 'fill-extrusion',
          source: 'divisions',
          paint: {
            'fill-extrusion-color': '#1a6cff',
            'fill-extrusion-height': 2000,
            'fill-extrusion-opacity': 0.08,
            'fill-extrusion-base': 0,
          },
        });

        map.addLayer({
          id: 'stores-glow',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.6, 3, 3.6, 5, 5.2, 7, 7.5, 9, 10.5],
            'circle-color': [
              'case',
              ['>=', ['get', 'health'], 80], '#28F7A0',
              ['>=', ['get', 'health'], 60], '#FFB54C',
              '#FF5A72'
            ],
            'circle-opacity': 0.85,
            'circle-blur': 0.55,
          },
        });

        map.addLayer({
          id: 'stores-core',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 3, 2.0, 5, 2.8, 7, 4.0, 9, 6.0],
            'circle-color': [
              'case',
              ['>=', ['get', 'health'], 80], '#28F7A0',
              ['>=', ['get', 'health'], 60], '#FFB54C',
              '#FF5A72'
            ],
            'circle-opacity': 1.0,
          },
        });

        // Interactions
        map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

        const popup = new mapboxgl.Popup({ closeButton: false, offset: [0, -8] });
        map.on('mousemove', 'stores-core', (e) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const p = f.properties;
          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="tt">
                <div class="tt-title"><b>${p.store_name}</b> • <span class="tt-id">${p.store_id}</span></div>
                <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
                <div class="tt-line"><span>Turnover</span><b>${Number(p.turnover).toFixed(1)}×</b></div>
                <div class="tt-line"><span>DC</span><b>${p.dc_id}</b></div>
                <div class="tt-line"><span>Division</span><b>${p.division}</b></div>
              </div>
            `)
            .addTo(map);
        });
        map.on('mouseleave', 'stores-core', () => popup.remove());
        map.on('click', 'stores-core', (e) => {
          const f = e.features && e.features[0];
          if (!f) return;
          window.location.href = `/store/${f.properties.store_id}`;
        });

        fitToCurrent();
      } finally {
        setLoading(false);
        setTimeout(() => map.resize(), 0);
      }
    });

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
    };
  }, [filteredStores]); // init once; filteredStores used only inside style.load

  // Keep stores data in sync when filters change (after style is loaded)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('stores');
    if (src) src.setData(filteredStores);
    fitToCurrent();
  }, [filteredStores, division]);

  return (
    <div className="home-shell">
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" />
          <span>Pulse · Inventory Insights</span>
        </div>
      </div>

      <div className="filters">
        <div className="filters__group">
          <label>Division</label>
          <div className="filters__pills">
            <button className={division === 'All' ? 'is-active' : ''} onClick={() => { setDivision('All'); setDc('ALL'); }}>All</button>
            {DIVISIONS.map(d => (
              <button key={d} className={division === d ? 'is-active' : ''} onClick={() => { setDivision(d); setDc('ALL'); }}>{d}</button>
            ))}
          </div>
        </div>
        <div className="filters__group">
          <label>Distribution Center</label>
          <select value={dc} onChange={(e) => setDc(e.target.value)}>
            {dcOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div className="filters__group chk">
          <label>
            <input type="checkbox" checked={onlyAssigned} onChange={(e) => setOnlyAssigned(e.target.checked)} />
            Show only my assigned stores
          </label>
        </div>
      </div>

      <div ref={containerRef} className="mapbox" />
      {loading && <div style={{
        position:'absolute', inset:0, display:'grid', placeItems:'center',
        color:'#9fb6ff', fontSize:14, pointerEvents:'none'
      }}>Loading map…</div>}

      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot orange" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
