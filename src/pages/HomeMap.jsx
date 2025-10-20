// src/pages/HomeMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';

import storesGeo from '../data/stores.geo.json';
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';

const DIVISIONS = ['Northern', 'Southern', 'Eastern', 'Midwestern'];

// health → color helper
const healthToColor = (h) => (h >= 80 ? '#28F7A0' : h >= 60 ? '#FFA54C' : '#FF5A72');

export default function HomeMap() {
  const navigate = useNavigate();

  // map refs
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  // UI state
  const [period, setPeriod] = useState('DAILY');     // DAILY | WEEKLY
  const [country, setCountry] = useState('USA');     // USA | CAN
  const [division, setDivision] = useState('ALL');   // ALL | Northern | ...
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // ---- Filtering (same logic you had) ----
  const filteredGeo = useMemo(() => {
    const feats = storesGeo.features.filter((f) => {
      const p = f.properties || {};
      if (country && p.p_country && p.p_country !== country) return false;
      if (division !== 'ALL' && p.p_division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      if (onlyAssigned && !p.is_assigned) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [country, division, dc, onlyAssigned]);

  // Rebuild DC options list from current filtered result
  const dcOptions = useMemo(() => {
    const set = new Set();
    filteredGeo.features.forEach((f) => f.properties?.dc_id && set.add(f.properties.dc_id));
    return ['ALL', ...Array.from(set).sort()];
  }, [filteredGeo]);

  // ---------------------------
  // 1) Initialize the map ONCE
  // ---------------------------
  useEffect(() => {
    if (mapRef.current) return;

    console.log('Mapbox token starts with:', (mapboxgl.accessToken || '').slice(0, 3)); // "pk."
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: country === 'CAN' ? [-98, 58] : [-97, 39],
      zoom: country === 'CAN' ? 3.2 : 3.5,
      attributionControl: false
    });

    mapRef.current = map;

    map.on('error', (e) => console.error('Mapbox error:', e?.error || e));

    // Add sources & layers ONLY when style is ready
    map.on('load', () => {
      console.log('Map load fired. Style is now attached:', !!map.getStyle());

      // source
      if (!map.getSource('stores')) {
        map.addSource('stores', { type: 'geojson', data: filteredGeo });
      }

      // glow
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

      // core
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

      // hover cursor
      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

      // click → store details
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties?.store_id;
        if (id) navigate(`/store/${id}?period=${period}`);
      });

      // tooltip
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10] });
      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        const html = `
          <div class="tt">
            <div class="tt-row"><b>${p.store_name || p.store_id}</b></div>
            <div class="tt-row">Health: <b>${Math.round(p.health)}</b></div>
            <div class="tt-row">Turnover: <b>${(p.turnover ?? 0).toFixed(1)}x</b></div>
            <div class="tt-row">Returns: <b>${p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '-'}</b></div>
          </div>`;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());
    });

    return () => map.remove();
  }, [navigate, period, country]); // these won’t recreate the map because of the early return

  // ---------------------------------------------------
  // 2) Update the source data when filters/data change
  // ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource('stores');
      if (src) {
        src.setData(filteredGeo);
        // optional: fit to bounds on each filter
        if (filteredGeo.features.length > 0) {
          const b = new mapboxgl.LngLatBounds();
          filteredGeo.features.forEach((f) => b.extend(f.geometry.coordinates));
          map.fitBounds(b, { padding: 60, maxZoom: 7.5, duration: 500 });
        }
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      // wait for style if not yet ready
      const onLoad = () => apply();
      map.once('load', onLoad);
      return () => map.off('load', onLoad);
    }
  }, [filteredGeo]);

  // UI (your existing header/filters/legend) — keep as-is
  return (
    <div className="home-shell">
      {/* … your header + filters code … */}
      <div ref={containerRef} className="mapbox" />
      {/* … legend … */}
    </div>
  );
}
