import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;
console.log('Mapbox token length:', (mapboxgl.accessToken || '').length);

// UI constants
const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];

const healthToColor = (h) => (h >= 80 ? '#28FFA0' : h >= 60 ? '#FFB54C' : '#FF5A72');

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  // UI state
  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // Filtered data
  const filteredStores = useMemo(() => {
    const feats = storesGeo.features.filter((f) => {
      const p = f.properties;
      if (onlyAssigned && !p.assigned) return false;
      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned]);

  // DC options based on visible division
  const dcOptions = useMemo(() => {
    const set = new Set();
    storesGeo.features.forEach((f) => {
      const p = f.properties;
      if (division === 'All' || p.division === division) set.add(p.dc_id);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [division]);

  // Find a region polygon by division
  const activeRegionFeature = useMemo(() => {
    if (division === 'All') return null;
    return regionsGeo.features.find((f) => f.properties.kind === 'division' && f.properties.division === division) || null;
  }, [division]);

  // --- Map init
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-98.5, 38.9], // USA
      zoom: 3.15,
      projection: 'mercator',
      attributionControl: false,
      preserveDrawingBuffer: true
    });
    mapRef.current = map;

    function addSourcesAndLayers() {
      if (map.getSource('stores')) return;

      // 1) Regions (divisions & DCs)
      map.addSource('regions', { type: 'geojson', data: regionsGeo });

      // Soft glowing fill-extrusion for selected region
      map.addLayer({
        id: 'region-extrusion',
        type: 'fill-extrusion',
        source: 'regions',
        filter: ['all', ['==', ['get', 'kind'], 'division'], ['==', ['get', 'division'], '___none___']],
        paint: {
          'fill-extrusion-color': '#2bc4ff',
          'fill-extrusion-height': 6000,
          'fill-extrusion-opacity': 0.08
        }
      });

      // Neon outline for region
      map.addLayer({
        id: 'region-outline',
        type: 'line',
        source: 'regions',
        filter: ['all', ['==', ['get', 'kind'], 'division'], ['==', ['get', 'division'], '___none___']],
        paint: {
          'line-color': '#2bc4ff',
          'line-width': 2.2,
          'line-opacity': 0.65
        }
      });

      // 2) Stores
      map.addSource('stores', { type: 'geojson', data: filteredStores });

      // Glow (blurred underlay)
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.2, 6, 6.2, 9, 10.5],
          'circle-color': ['case',
            ['>=', ['get', 'health'], 80], '#28FFA0',
            ['>=', ['get', 'health'], 60], '#FFB54C',
            '#FF5A72'
          ],
          'circle-opacity': 0.7,
          'circle-blur': 0.6
        }
      });

      // Core dot
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 6, 3.6, 9, 5.2],
          'circle-color': ['case',
            ['>=', ['get', 'health'], 80], '#28FFA0',
            ['>=', ['get', 'health'], 60], '#FFB54C',
            '#FF5A72'
          ],
          'circle-opacity': 1.0
        }
      });

      // Mouse cursor
      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

      // Tooltip
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'pulse-tooltip',
        offset: [0, -10]
      });

      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt">
              <div class="tt-title">${p.store_name || p.store_id} <span class="tt-id">${p.store_id}</span></div>
              <div class="tt-line"><span>Health</span><b>${Math.round(+p.health)}</b></div>
              <div class="tt-line"><span>Turnover</span><b>${(+p.turnover || 0).toFixed(1)}x</b></div>
              <div class="tt-line"><span>Returns</span><b>${p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '—'}</b></div>
            </div>
          `)
          .addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());

      // Click -> navigate
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties.store_id;
        window.location.assign(`/store/${id}`);
      });

      // Initial fit
      fitToCurrent(map, filteredStores, division, dc);
      updateRegionHighlight(map, activeRegionFeature);
    }

    map.on('style.load', addSourcesAndLayers);
    map.on('load', addSourcesAndLayers);

    // guard for container sizing
    setTimeout(() => map.resize(), 60);

    return () => map.remove();
  }, []); // init once

  // Update stores + view on filter change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('stores');
    if (!src) return;

    src.setData(filteredStores);
    fitToCurrent(map, filteredStores, division, dc);
  }, [filteredStores, division, dc]);

  // Update region glow when division changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateRegionHighlight(map, activeRegionFeature);
  }, [activeRegionFeature]);

  return (
    <div className="home-shell">
      {/* Header */}
      <div className="home-header">
        <span className="brand">
          <span className="pulse-dot" /> Pulse • Inventory Insights
        </span>
      </div>

      {/* Filters */}
      <div className="filters">
        <label>Division</label>
        <div className="pills">
          <button className={division === 'All' ? 'is-active' : ''} onClick={() => setDivision('All')}>All</button>
          {DIVISIONS.map(d => (
            <button key={d} className={division === d ? 'is-active' : ''} onClick={() => setDivision(d)}>{d}</button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dc} onChange={(e) => setDc(e.target.value)}>
          {dcOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned} onChange={(e) => setOnlyAssigned(e.target.checked)} />
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

/* ---------- helpers ---------- */

function fitToCurrent(map, featureCollection, division, dc) {
  const feats = featureCollection.features;
  if (!feats.length) return;

  if (dc !== 'ALL') {
    // center on first store of that DC
    const first = feats.find(f => f.properties.dc_id === dc) || feats[0];
    map.flyTo({ center: first.geometry.coordinates, zoom: 8.5, speed: 0.9, curve: 1.2, essential: true });
    return;
  }

  if (division !== 'All') {
    // fit to region polygon bbox
    const reg = getRegionBbox(division);
    if (reg) {
      map.fitBounds(reg, { padding: 60, maxZoom: 6.5, duration: 700 });
      return;
    }
  }

  // fit to stores bbox
  const bounds = new mapboxgl.LngLatBounds();
  feats.forEach(f => bounds.extend(f.geometry.coordinates));
  map.fitBounds(bounds, { padding: 60, maxZoom: 5.8, duration: 700 });
}

function updateRegionHighlight(map, regionFeature) {
  const outline = map.getLayer('region-outline');
  const extrude = map.getLayer('region-extrusion');
  if (!outline || !extrude) return;

  if (!regionFeature) {
    map.setFilter('region-outline', ['all', ['==', ['get', 'kind'], 'division'], ['==', ['get', 'division'], '___none___']]);
    map.setFilter('region-extrusion', ['all', ['==', ['get', 'kind'], 'division'], ['==', ['get', 'division'], '___none___']]);
    return;
  }
  const name = regionFeature.properties.division;
  map.setFilter('region-outline', ['all', ['==', ['get', 'kind'], 'division'], ['==', ['get', 'division'], name]]);
  map.setFilter('region-extrusion', ['all', ['==', ['get', 'kind'], 'division'], ['==', ['get', 'division'], name]]);
}

function getRegionBbox(divisionName) {
  // hand-tuned US regional bounds (minLng,minLat,maxLng,maxLat)
  const boxes = {
    'Eastern':   [-84.9, 24.5, -66.9, 47.5],
    'Southern':  [-106.7, 24.0, -80.0, 37.5],
    'Northern':  [-124.6, 44.0, -67.0, 49.5],
    'Midwestern':[-106.7, 36.5, -82.0, 49.5]
  };
  const b = boxes[divisionName];
  return b ? [[b[0], b[1]], [b[2], b[3]]] : null;
}
