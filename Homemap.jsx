// src/pages/HomeMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import divisionsGeo from '../data/divisions.geo.json';  // simple polygons for Northern/Southern/Eastern/Midwestern
import storesGeo from '../data/stores.geo.json';        // points with store_id, store_name, dc_id, division, health, turnover, assigned
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];
const USA_BOUNDS = [[-125.0, 24.2], [-66.5, 49.5]];
const healthToColor = (h) => (h >= 80 ? '#28F7A0' : h >= 60 ? '#FFB54C' : '#FF5A72');

export default function HomeMap() {
  const el = useRef(null);
  const mapRef = useRef(null);

  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [loading, setLoading] = useState(true);

  // Log token prefix so we can confirm .env loaded
  useEffect(() => {
    const t = process.env.REACT_APP_MAPBOX_TOKEN || '';
    console.log('Mapbox token starts with:', t ? t.slice(0, 7) : '(missing)');
  }, []);

  // -------- Build DC list (visible under current division) ----------
  const dcOptions = useMemo(() => {
    const set = new Set();
    for (const f of storesGeo.features) {
      const p = f.properties;
      if (division !== 'All' && p.division !== division) continue;
      set.add(p.dc_id);
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [division]);

  // -------- Precompute bounds for divisions and DCs once -----------
  const boundsIndex = useMemo(() => {
    const divBounds = {};
    for (const f of divisionsGeo.features) {
      const name = f.properties?.name;
      if (!name) continue;
      const b = new mapboxgl.LngLatBounds();
      // assume simple polygon (outer ring at [0])
      for (const [lng, lat] of f.geometry.coordinates[0]) b.extend([lng, lat]);
      divBounds[name] = b;
    }
    const dcBounds = {};
    for (const opt of new Set(storesGeo.features.map(f => f.properties.dc_id))) {
      const b = new mapboxgl.LngLatBounds();
      for (const f of storesGeo.features) {
        const p = f.properties;
        if (p.dc_id !== opt) continue;
        const [lng, lat] = f.geometry.coordinates;
        b.extend([lng, lat]);
      }
      dcBounds[opt] = b.isEmpty() ? null : b;
    }
    return { divBounds, dcBounds };
  }, []);

  // -------- Filtered stores for the visible region -----------------
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

  // -------- Camera helpers (with 3D) ------------------------------
  const flyTo3D = (map, bounds) => {
    if (!bounds) return;
    map.easeTo({
      pitch: 55,
      bearing: 18,
      padding: 64,
      duration: 900,
      center: bounds.getCenter(),
      zoom: Math.max(
        map.cameraForBounds(bounds, { padding: 64 }).zoom,
        4.5
      ),
    });
  };
  const reset2D = (map) => {
    map.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 600,
    });
  };

  // -------- Initialize the map once --------------------------------
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: el.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      bounds: USA_BOUNDS,
      dragRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('error', (e) => console.warn('Mapbox error:', e?.error || e));

    map.on('style.load', () => {
      // Divisions sources/layers (glow + subtle extrusion)
      map.addSource('divisions', { type: 'geojson', data: divisionsGeo });
      map.addLayer({
        id: 'div-outline',
        type: 'line',
        source: 'divisions',
        paint: {
          'line-color': '#2bc4ff',
          'line-width': 2.2,
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
          'fill-extrusion-height': 1800,
          'fill-extrusion-opacity': 0.09,
        },
      });

      // Stores as clustered source for faster first paint
      map.addSource('stores', {
        type: 'geojson',
        data: filteredStores,
        cluster: true,
        clusterRadius: 36,
        clusterMaxZoom: 9,
      });

      // Cluster bubbles
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'stores',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#3a4a70',
          'circle-radius': ['step', ['get', 'point_count'], 12, 20, 18, 50, 26],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#94a7ff',
          'circle-opacity': 0.7,
        },
      });

      // Cluster label
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'stores',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#e9f0ff' },
      });

      // Store glow (unclustered)
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.6, 3, 3.6, 5, 5.0, 7, 7.2, 9, 10],
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

      // Store core
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        filter: ['!', ['has', 'point_count']],
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

      // Cursor + popup
      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));
      const pop = new mapboxgl.Popup({ closeButton: false, offset: [0, -8] });
      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        pop
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt">
              <div class="tt-title"><b>${p.store_name}</b> · <span class="tt-id">${p.store_id}</span></div>
              <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
              <div class="tt-line"><span>Turnover</span><b>${Number(p.turnover).toFixed(1)}×</b></div>
              <div class="tt-line"><span>DC</span><b>${p.dc_id}</b></div>
              <div class="tt-line"><span>Division</span><b>${p.division}</b></div>
            </div>
          `)
          .addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => pop.remove());
      map.on('click', 'stores-core', (e) => {
        const id = e.features?.[0]?.properties?.store_id;
        if (id) window.location.href = `/store/${id}`;
      });

      // Start in 2D view of USA
      map.fitBounds(USA_BOUNDS, { padding: 40, duration: 500 });
      setLoading(false);
      setTimeout(() => map.resize(), 0);
    });

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
    };
  }, []);

  // -------- React to Division/DC changes (filters + camera) --------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // update data (keeps clustering)
    const src = map.getSource('stores');
    if (src) src.setData(filteredStores);

    // outline/extrude filters
    if (division === 'All') {
      map.setFilter('div-outline', ['in', ['get', 'name'], ['literal', DIVISIONS]]);
      map.setFilter('div-extrude', ['in', ['get', 'name'], ['literal', DIVISIONS]]);
      reset2D(map);
      map.fitBounds(USA_BOUNDS, { padding: 40, duration: 700 });
    } else {
      map.setFilter('div-outline', ['==', ['get', 'name'], division]);
      map.setFilter('div-extrude', ['==', ['get', 'name'], division]);
      flyTo3D(map, boundsIndex.divBounds[division]);
    }

    // If a specific DC is selected, overwrite camera with DC bounds (also 3D)
    if (dc !== 'ALL') {
      const b = boundsIndex.dcBounds[dc];
      if (b) flyTo3D(map, b);
    }
  }, [filteredStores, division, dc, boundsIndex]);

  // -------- UI ------------------------------------------------------
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
            <button className={division === 'All' ? 'is-active' : ''} onClick={() => { setDivision('All'); setDc('ALL'); }}>
              All
            </button>
            {DIVISIONS.map(d => (
              <button key={d} className={division === d ? 'is-active' : ''} onClick={() => { setDivision(d); setDc('ALL'); }}>
                {d}
              </button>
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

      <div ref={el} className="mapbox" />
      {loading && (
        <div className="loading">
          Loading map…
        </div>
      )}

      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot orange" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
