import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';

// IMPORTANT: mapbox CSS (prevents invisible canvas / popup glitches)
import 'mapbox-gl/dist/mapbox-gl.css';

import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN; // keep in .env

// UI pills
const DIVISIONS = ['All', 'Northern', 'Southern', 'Eastern', 'Midwestern'];

// hard USA bounds (keeps us off the globe)
const US_BOUNDS = [
  [-127.0, 23.0], // SW
  [-65.0, 50.0],  // NE
];

function healthToColor(h = 0) {
  if (h >= 80) return '#28FFA0'; // neon green
  if (h >= 60) return '#FFAB54'; // neon amber
  return '#FF5A72';              // neon red
}

export default function HomeMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleReady = useRef(false); // gate all source/layer ops
  const navigate = useNavigate();

  // filters
  const [division, setDivision] = useState('All');
  const [dcId, setDcId] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // derived stores by filters
  const filteredStores = useMemo(() => {
    const feats = storesGeo.features.filter(f => {
      const p = f.properties;
      if (p.country !== 'USA') return false;
      if (division !== 'All' && p.division !== division) return false;
      if (onlyAssigned && !p.assigned) return false;
      if (dcId !== 'ALL' && p.dc_id !== dcId) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dcId, onlyAssigned]);

  // DC list for current filter
  const dcOptions = useMemo(() => {
    const s = new Set();
    filteredStores.features.forEach(f => s.add(f.properties.dc_id));
    return ['ALL', ...Array.from(s).sort()];
  }, [filteredStores]);

  // INIT MAP exactly once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      projection: 'mercator',
      center: [-98.5, 38.0],
      zoom: 3.3,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });

    // USA only
    map.setMaxBounds(US_BOUNDS);
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on('load', () => {
      styleReady.current = true;

      // sources
      map.addSource('regions', { type: 'geojson', data: regionsGeo });
      map.addSource('stores', { type: 'geojson', data: filteredStores });

      // region outline (hidden initially)
      map.addLayer({
        id: 'region-outline',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': '#2BC4FF',
          'line-width': 2.4,
          'line-opacity': 0.0
        }
      });

      // subtle 3D glow using fill-extrusion
      map.addLayer({
        id: 'region-extrude',
        type: 'fill-extrusion',
        source: 'regions',
        paint: {
          'fill-extrusion-color': '#2BC4FF',
          'fill-extrusion-height': 1800,
          'fill-extrusion-opacity': 0.0
        }
      });

      // stores glow
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 4, 6, 8, 8, 12, 11, 14, 13],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80], '#28FFA0',
            ['>=', ['get', 'health'], 60], '#FFAB54',
            '#FF5A72'
          ],
          'circle-opacity': 0.85,
          'circle-blur': 0.6
        }
      });

      // stores core
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.7, 4, 2.2, 8, 3.3, 12, 4.5, 14, 6.2],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80], '#28FFA0',
            ['>=', ['get', 'health'], 60], '#FFAB54',
            '#FF5A72'
          ],
          'circle-opacity': 1.0
        }
      });

      // cursor
      map.on('mouseenter', 'stores-core', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'stores-core', () => map.getCanvas().style.cursor = '');

      // dark tooltip
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10], className: 'tt' });
      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt-wrap">
              <div class="tt-title"><b>${p.store_name}</b> <span class="tt-id">#${p.store_id}</span></div>
              <div class="tt-line"><span>Division</span><b>${p.division}</b></div>
              <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
              <div class="tt-line"><span>Turnover</span><b>${(p.turnover ?? 0).toFixed(1)}%</b></div>
            </div>
          `)
          .addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());

      // click → store dashboard
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        navigate(`/store/${f.properties.store_id}`);
      });

      // first fit
      fitToCurrent(map, filteredStores, division, dcId);
    });

    mapRef.current = map;
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update on filters/data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;

    const src = map.getSource('stores');
    if (src && 'setData' in src) src.setData(filteredStores);

    highlightRegion(map, division, dcId);
    fitToCurrent(map, filteredStores, division, dcId);
  }, [filteredStores, division, dcId]);

  // ---- helpers ----
  function highlightRegion(map, div, dc) {
    if (!styleReady.current) return;

    // hide
    map.setPaintProperty('region-outline', 'line-opacity', 0.0);
    map.setPaintProperty('region-extrude', 'fill-extrusion-opacity', 0.0);

    if (dc !== 'ALL') {
      map.setFilter('region-outline', ['all', ['==', ['get', 'type'], 'DC'], ['==', ['get', 'dc_id'], dc]]);
      map.setFilter('region-extrude', ['all', ['==', ['get', 'type'], 'DC'], ['==', ['get', 'dc_id'], dc]]);
      map.setPaintProperty('region-outline', 'line-opacity', 0.95);
      map.setPaintProperty('region-extrude', 'fill-extrusion-opacity', 0.18);
      return;
    }
    if (div !== 'All') {
      map.setFilter('region-outline', ['all', ['==', ['get', 'type'], 'Division'], ['==', ['get', 'division'], div]]);
      map.setFilter('region-extrude', ['all', ['==', ['get', 'type'], 'Division'], ['==', ['get', 'division'], div]]);
      map.setPaintProperty('region-outline', 'line-opacity', 0.85);
      map.setPaintProperty('region-extrude', 'fill-extrusion-opacity', 0.14);
    }
  }

  function fitToCurrent(map, storesFC, div, dc) {
    if (!styleReady.current) return;

    // DC focus
    if (dc !== 'ALL') {
      const hit = regionsGeo.features.find(f => f.properties.type === 'DC' && f.properties.dc_id === dc);
      if (hit) {
        const b = new mapboxgl.LngLatBounds();
        hit.geometry.coordinates[0].forEach(([lng, lat]) => b.extend([lng, lat]));
        map.fitBounds(b, { padding: 60, curve: 1.4, speed: 0.8, pitch: 35, bearing: 16, duration: 700, essential: true });
        return;
      }
    }
    // Division focus
    if (div !== 'All') {
      const hit = regionsGeo.features.find(f => f.properties.type === 'Division' && f.properties.division === div);
      if (hit) {
        const b = new mapboxgl.LngLatBounds();
        hit.geometry.coordinates[0].forEach(([lng, lat]) => b.extend([lng, lat]));
        map.fitBounds(b, { padding: 60, curve: 1.3, speed: 0.8, pitch: 25, bearing: 8, duration: 650, essential: true });
        return;
      }
    }
    // Default: stores extent (or US)
    if (storesFC.features.length) {
      const b = new mapboxgl.LngLatBounds();
      storesFC.features.forEach(f => b.extend(f.geometry.coordinates));
      map.fitBounds(b, { padding: 60, maxZoom: 5.5, duration: 600, essential: true });
    } else {
      map.fitBounds(US_BOUNDS, { padding: 50, duration: 500, essential: true });
    }
  }

  // ---- UI ----
  return (
    <div className="home-shell">
      {/* header */}
      <div className="home-header">
        <div className="brand"><span className="pulse-dot" /> <span>Pulse · Inventory Insights</span></div>
      </div>

      {/* filters card */}
      <div className="filters">
        <label>Division</label>
        <div className="pills">
          {DIVISIONS.map(d => (
            <button key={d} className={division === d ? 'is-active' : ''} onClick={() => setDivision(d)}>
              {d}
            </button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dcId} onChange={e => setDcId(e.target.value)}>
          {dcOptions.map(x => <option key={x} value={x}>{x}</option>)}
        </select>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned} onChange={e => setOnlyAssigned(e.target.checked)} />
          Show only my assigned stores
        </label>
      </div>

      {/* map */}
      <div ref={containerRef} className="mapbox" />

      {/* legend */}
      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot orange" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
