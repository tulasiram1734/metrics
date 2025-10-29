/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/HomeMap.css';

import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const DIVISIONS = ['All', 'Northern', 'Southern', 'Eastern', 'Midwestern'];

const US_CENTER = [-96.9, 38.5];

const colorForHealth = (h) => (h >= 80 ? '#00FFC6' : h >= 60 ? '#FFC14D' : '#FF2E63');

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [debugMsg, setDebugMsg] = useState('');

  // Filtered stores for rendering
  const filteredStores = useMemo(() => {
    const feats = storesGeo.features.filter((f) => {
      const p = f.properties;
      if (p.country !== 'USA') return false;
      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      if (onlyAssigned && p.assigned !== true) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned]);

  // DC dropdown options based on current division
  const dcOptions = useMemo(() => {
    const set = new Set();
    storesGeo.features.forEach((f) => {
      const p = f.properties;
      if (p.country !== 'USA') return;
      if (division !== 'All' && p.division !== division) return;
      if (p.dc_id && p.dc_id !== 'ALL') set.add(p.dc_id);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [division]);

  // ---- Init map (once) ----
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: US_CENTER,
      zoom: 3.3,
      attributionControl: false
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    map.on('error', (e) => {
      if (e?.error?.message) setDebugMsg(e.error.message);
    });

    map.once('style.load', () => {
      try {
        // Sources
        if (!map.getSource('regions')) {
          map.addSource('regions', { type: 'geojson', data: regionsGeo });
        }
        if (!map.getSource('stores')) {
          map.addSource('stores', { type: 'geojson', data: filteredStores });
        }

        // Region outline/glow (hidden by default)
        addLineLayer(map, 'region-line-glow', 'regions', '#2BC4FF', 3, 0.24, 'none');
        addLineLayer(map, 'region-line-bright', 'regions', '#2BC4FF', 1, 0.85, 'none');

        // Store dots (glow + core)
        addCircleLayer(map, 'stores-glow', 'stores', true);
        addCircleLayer(map, 'stores-core', 'stores', false);

        // Pointer + popup
        const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10] });

        map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'stores-core', () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });

        map.on('mousemove', 'stores-core', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties;
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="tt">
                 <div class="tt-title"><span>Store</span><span class="tt-id">#${p.store_id}</span></div>
                 <div class="tt-line"><span>Division</span><b>${p.division}</b></div>
                 <div class="tt-line"><span>DC</span><b>${p.dc_id || '-'}</b></div>
                 <div class="tt-line"><span>Health</span>
                   <b style="color:${colorForHealth(+p.health)}">${Math.round(+p.health)}%</b>
                 </div>
               </div>`
            )
            .addTo(map);
        });

        map.on('click', 'stores-core', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          navigate(`/store/${f.properties.store_id}`);
        });

        // first paint
        map.getSource('stores').setData(filteredStores);
      } catch (err) {
        setDebugMsg(err?.message || 'Map init failed');
      }
    });

    return () => {
      ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ---- Update on filter changes (and handle zooming) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Update store data
    const src = map.getSource('stores');
    if (src) src.setData(filteredStores);

    // helper to toggle region outlines
    const showRegions = (visible) => {
      ['region-line-glow', 'region-line-bright'].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      });
    };
    const setRegionFilter = (exp) => {
      ['region-line-glow', 'region-line-bright'].forEach((id) => {
        if (map.getLayer(id)) map.setFilter(id, exp);
      });
    };

    // 1) Zoom to DC = fit to all stores with that dc_id
    if (dc !== 'ALL') {
      const dcStores = storesGeo.features.filter(
        (f) => f.properties.country === 'USA' && f.properties.dc_id === dc
      );
      if (dcStores.length) {
        const bounds = new mapboxgl.LngLatBounds();
        dcStores.forEach((f) => bounds.extend(f.geometry.coordinates));
        showRegions(false); // focus on stores
        map.easeTo({ pitch: 25, bearing: 10, duration: 350 });
        map.fitBounds(bounds, { padding: 100, maxZoom: 7.8, duration: 700 });
        return;
      }
    }

    // 2) Zoom to Division polygon
    if (division !== 'All') {
      const poly = regionsGeo.features.find(
        (f) => f.properties.type === 'Division' && f.properties.division === division
      );
      if (poly) {
        showRegions(true);
        setRegionFilter(['==', ['get', 'division'], division]);
        fitToFeature(map, poly);
        return;
      }
    }

    // 3) Default national view
    showRegions(false);
    map.easeTo({ center: US_CENTER, zoom: 3.3, pitch: 0, bearing: 0, duration: 450 });
  }, [division, dc, onlyAssigned, filteredStores]);

  return (
    <div className="home-shell">
      <div className="home-header">
        <span className="brand"><span className="pulse-dot" /> Pulse • Inventory Insights</span>
      </div>

      <div className="filters">
        <label>Division</label>
        <div className="pills">
          {DIVISIONS.map((d) => (
            <button key={d} className={division === d ? 'is-active' : ''} onClick={() => setDivision(d)}>
              {d}
            </button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dc} onChange={(e) => setDc(e.target.value)}>
          {dcOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        <div className="chk">
          <input id="onlyAssigned" type="checkbox" checked={onlyAssigned}
                 onChange={(e) => setOnlyAssigned(e.target.checked)} />
          <label htmlFor="onlyAssigned">Show only my assigned stores</label>
        </div>
      </div>

      <div ref={containerRef} className="mapbox" />

      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot yellow" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>

      {debugMsg && <div className="debug-banner">Map error: {debugMsg}</div>}
    </div>
  );
}

/* ---------- helpers ---------- */
function addLineLayer(map, id, source, color, width, opacity, visibility) {
  if (map.getLayer(id)) return;
  map.addLayer({
    id,
    type: 'line',
    source,
    paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity },
    layout: { visibility }
  });
}

function addCircleLayer(map, id, source, isGlow) {
  if (map.getLayer(id)) return;
  map.addLayer({
    id,
    type: 'circle',
    source,
    paint: isGlow
      ? {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 6, 10, 9, 14],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80],
            '#00FFC6',
            ['>=', ['get', 'health'], 60],
            '#FFC14D',
            '#FF2E63'
          ],
          'circle-opacity': 0.26,
          'circle-blur': 1
        }
      : {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 8, 7.8],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80],
            '#00FFC6',
            ['>=', ['get', 'health'], 60],
            '#FFC14D',
            '#FF2E63'
          ],
          'circle-opacity': 1
        }
  });
}

function fitToFeature(map, feature) {
  const t = feature.geometry.type;
  if (t !== 'Polygon' && t !== 'MultiPolygon') return;
  const bounds = new mapboxgl.LngLatBounds();
  const add = (c) => bounds.extend(c);
  if (t === 'Polygon') feature.geometry.coordinates[0].forEach(add);
  else feature.geometry.coordinates.forEach((poly) => poly[0].forEach(add));
  map.easeTo({ pitch: 26, bearing: 8, duration: 360 });
  map.fitBounds(bounds, { padding: 70, maxZoom: 6.8, duration: 720 });
}
