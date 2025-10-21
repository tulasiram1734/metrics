// src/pages/HomeMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import divisionsGeo from '../data/divisions.geo.json';
import storesGeo from '../data/stores.geo.json';

import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN; // keep in .env

const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];

const usaBounds = [
  [-125.0, 24.2], // SW
  [-66.5, 49.5],  // NE
];

const healthToColor = (h) => (h >= 80 ? '#28F7A0' : h >= 60 ? '#FFB54C' : '#FF5A72');

export default function HomeMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // Build DC options based on current division
  const dcOptions = useMemo(() => {
    const set = new Set();
    storesGeo.features.forEach(f => {
      const p = f.properties;
      if (division !== 'All' && p.division !== division) return;
      set.add(p.dc_id);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [division]);

  // Filtered stores FC (division, dc, onlyAssigned)
  const filteredStores = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: storesGeo.features.filter(f => {
        const p = f.properties;
        if (division !== 'All' && p.division !== division) return false;
        if (dc !== 'ALL' && p.dc_id !== dc) return false;
        if (onlyAssigned && !p.assigned) return false;
        return true;
      }),
    };
  }, [division, dc, onlyAssigned]);

  // Helper: fit to division/DC automatically
  const fitToCurrent = () => {
    const map = mapRef.current;
    if (!map) return;

    // Highlight division polygon (glow + extrusion)
    if (division === 'All') {
      map.fitBounds(usaBounds, { padding: 40, duration: 750 });
      map.setFilter('div-outline', ['in', ['get', 'name'], ['literal', DIVISIONS]]);
      map.setFilter('div-extrude', ['in', ['get', 'name'], ['literal', DIVISIONS]]);
    } else {
      const poly = divisionsGeo.features.find(f => f.properties.name === division);
      if (poly) {
        const bounds = new mapboxgl.LngLatBounds();
        poly.geometry.coordinates[0].forEach(([lng, lat]) => bounds.extend([lng, lat]));
        map.fitBounds(bounds, { padding: 60, duration: 750 });
      }
      map.setFilter('div-outline', ['==', ['get', 'name'], division]);
      map.setFilter('div-extrude', ['==', ['get', 'name'], division]);
    }
  };

  // init map once
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      bounds: usaBounds,
      dragRotate: false,
      touchPitch: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Sources
      map.addSource('divisions', { type: 'geojson', data: divisionsGeo });
      map.addSource('stores', { type: 'geojson', data: filteredStores });

      // Division glowing outline
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

      // Division 3D “glow” via tiny extrusion
      map.addLayer({
        id: 'div-extrude',
        type: 'fill-extrusion',
        source: 'divisions',
        paint: {
          'fill-extrusion-color': '#1a6cff',
          'fill-extrusion-height': 2000,            // visual glow “wall”
          'fill-extrusion-opacity': 0.08,
          'fill-extrusion-base': 0,
        },
      });

      // Stores neon outer glow
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            1, 2.6, 3, 3.6, 5, 5.2, 7, 7.5, 9, 10.5],
          'circle-color': ['case',
            ['>=', ['get', 'health'], 80], '#28F7A0',
            ['>=', ['get', 'health'], 60], '#FFB54C',
            '#FF5A72'],
          'circle-opacity': 0.85,
          'circle-blur': 0.55,
        },
      });

      // Stores solid core
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            1, 1.2, 3, 2.0, 5, 2.8, 7, 4.0, 9, 6.0],
          'circle-color': ['case',
            ['>=', ['get', 'health'], 80], '#28F7A0',
            ['>=', ['get', 'health'], 60], '#FFB54C',
            '#FF5A72'],
          'circle-opacity': 1.0,
        },
      });

      // Cursor + tooltip
      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

      const popup = new mapboxgl.Popup({ closeButton: false, offset: [0, -8] });

      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const p = f.properties;
        const html = `
          <div class="tt">
            <div class="tt-title"><b>${p.store_name}</b> • <span class="tt-id">${p.store_id}</span></div>
            <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
            <div class="tt-line"><span>Turnover</span><b>${Number(p.turnover).toFixed(1)}×</b></div>
            <div class="tt-line"><span>DC</span><b>${p.dc_id}</b></div>
            <div class="tt-line"><span>Division</span><b>${p.division}</b></div>
          </div>`;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });

      map.on('mouseleave', 'stores-core', () => popup.remove());

      // Click → navigate to store detail page
      map.on('click', 'stores-core', (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const id = f.properties.store_id;
        // If you use react-router, you can swap this for navigate(`/store/${id}`);
        window.location.href = `/store/${id}`;
      });

      // Initial camera
      fitToCurrent();
    });

    // Keep canvas sized right
    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
    };
  }, []); // init once

  // Update source data when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('stores');
    if (src) src.setData(filteredStores);
    // zoom / highlight
    fitToCurrent();
  }, [filteredStores, division]);

  return (
    <div className="home-shell">
      {/* Header */}
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" /> <span>Pulse · Inventory Insights</span>
        </div>
      </div>

      {/* Filters panel */}
      <div className="filters">
        <div className="filters__group">
          <label>Division</label>
          <div className="filters__pills">
            <button
              className={division === 'All' ? 'is-active' : ''}
              onClick={() => { setDivision('All'); setDc('ALL'); }}
            >
              All
            </button>
            {DIVISIONS.map(d => (
              <button
                key={d}
                className={division === d ? 'is-active' : ''}
                onClick={() => { setDivision(d); setDc('ALL'); }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="filters__group">
          <label>Distribution Center</label>
          <select value={dc} onChange={(e) => setDc(e.target.value)}>
            {dcOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className="filters__group chk">
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

      {/* Map container */}
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
