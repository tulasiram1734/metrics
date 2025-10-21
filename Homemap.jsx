// HomeMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';

import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// health → neon color
function healthToColor(h) {
  if (h >= 80) return '#28FFA0';  // neon green
  if (h >= 60) return '#FFB54C';  // neon amber
  return '#FF5A72';               // neon red
}

const DIVISIONS = ['All', 'Northern', 'Southern', 'Eastern', 'Midwestern'];

export default function HomeMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);        // map instance
  const readyRef = useRef(false);     // style/sources ready
  const navigate = useNavigate();

  // UI state
  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // --- Filtered feature collections (stores + regions) ----------------------
  const filteredStores = useMemo(() => {
    const feats = storesGeo.features
      .filter((f) => division === 'All' || f.properties.division === division)
      .filter((f) => (dc === 'ALL' ? true : f.properties.dc_id === dc))
      .filter((f) => (onlyAssigned ? f.properties.assigned === true : true));
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned]);

  // dynamic DC options for the visible division
  const dcOptions = useMemo(() => {
    const set = new Set(['ALL']);
    storesGeo.features.forEach((f) => {
      const props = f.properties;
      if ((division === 'All' || props.division === division)) {
        set.add(props.dc_id);
      }
    });
    return Array.from(set);
  }, [division]);

  // --- Map bootstrap (run once) --------------------------------------------
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-97, 37],       // USA
      zoom: 3.25,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });

    mapRef.current = map;

    // Ensure the canvas resizes to our container
    map.once('load', () => {
      map.resize();
    });

    // On every (re)style load, (re)attach our sources/layers
    const ensure = () => {
      if (!map.getSource('regions')) {
        map.addSource('regions', { type: 'geojson', data: regionsGeo });
      }
      if (!map.getLayer('region-lines')) {
        map.addLayer({
          id: 'region-lines',
          type: 'line',
          source: 'regions',
          paint: {
            'line-color': '#2BC4FF',
            'line-width': 1.5,
            'line-opacity': 0.15
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
      }
      // bright “glow” outline we toggle for the selected region
      if (!map.getLayer('region-glow')) {
        map.addLayer({
          id: 'region-glow',
          type: 'line',
          source: 'regions',
          paint: {
            'line-color': '#2BC4FF',
            'line-width': 2.5,
            'line-opacity': 0.85,
            'line-blur': 0.6
          },
          layout: { visibility: 'none' } // default: hidden; we toggle it
        });
      }

      if (!map.getSource('stores')) {
        map.addSource('stores', { type: 'geojson', data: filteredStores });
      } else {
        map.getSource('stores').setData(filteredStores);
      }

      // glow halo
      if (!map.getLayer('stores-glow')) {
        map.addLayer({
          id: 'stores-glow',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              1, 3, 3, 4, 6, 7.5, 12, 10, 14, 18
            ],
            'circle-color': [
              'case',
              ['>=', ['get', 'health'], 80], '#28FFA0',
              ['>=', ['get', 'health'], 60], '#FFB54C',
              '#FF5A72'
            ],
            'circle-opacity': 0.85,
            'circle-blur': 0.6
          }
        });
      }

      // core dot
      if (!map.getLayer('stores-core')) {
        map.addLayer({
          id: 'stores-core',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              1, 1.8, 3, 2.2, 6, 3.2, 12, 6.2, 18, 7.8
            ],
            'circle-color': [
              'case',
              ['>=', ['get', 'health'], 80], '#28FFA0',
              ['>=', ['get', 'health'], 60], '#FFB54C',
              '#FF5A72'
            ],
            'circle-opacity': 1.0
          }
        });
      }

      // Cursor + interaction
      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

      // Hover tooltip (dark)
      let popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -10],
        className: 'tt-dark'
      });

      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const lngLat = e.lngLat;

        popup
          .setLngLat(lngLat)
          .setHTML(`
            <div class="tt">
              <div class="tt-title">
                <span class="tt-id">${p.store_id}</span> ${p.store_name || ''}
              </div>
              <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
              <div class="tt-line"><span>Turnover</span><b>${(p.turnover ?? 0).toFixed(1)}x</b></div>
              <div class="tt-line"><span>Returns</span><b>${p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '—'}</b></div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'stores-core', () => popup.remove());

      // Click → store detail
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        navigate(`/store/${f.properties.store_id}`);
      });

      readyRef.current = true;
      map.resize();
      // after style ready, apply current highlight/zoom once
      highlightAndZoom(map, division, dc);
    };

    map.on('style.load', ensure);
    // (older events) also fire ensure on first 'load' just in case
    map.on('load', ensure);

    // cleanup
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, [navigate, filteredStores, division, dc]);

  // When filters change: update stores source + zoom/highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    const src = map.getSource('stores');
    if (src && src.type === 'geojson') {
      src.setData(filteredStores);
    }
    highlightAndZoom(map, division, dc);
  }, [filteredStores, division, dc]);

  // --------------------------------- UI -------------------------------------
  return (
    <div className="home-shell">
      <div className="home-header">
        <span className="pulse-dot" /> <span>Pulse · Inventory Insights</span>
      </div>

      <div className="filters">
        <label>Division</label>
        <div className="pills">
          {DIVISIONS.map((d) => (
            <button
              key={d}
              className={division === d ? 'is-active' : ''}
              onClick={() => setDivision(d)}
            >
              {d}
            </button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dc} onChange={(e) => setDc(e.target.value)}>
          {dcOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <label className="chk">
          <input
            type="checkbox"
            checked={onlyAssigned}
            onChange={(e) => setOnlyAssigned(e.target.checked)}
          />
          Show only my assigned stores
        </label>
      </div>

      <div ref={containerRef} className="mapbox" />

      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot amber" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}

// ---------------------- helpers: highlight + zoom ---------------------------
function highlightAndZoom(map, division, dc) {
  // toggle region glow for the selected division
  const showGlow = (division !== 'All');
  map.setLayoutProperty('region-glow', 'visibility', showGlow ? 'visible' : 'none');
  if (showGlow) {
    map.setFilter('region-glow', ['==', ['get', 'division'], division]);
    map.setPaintProperty('region-glow', 'line-color', '#2BC4FF');
  }

  // zoom: DC > division > all
  if (dc !== 'ALL') {
    const dcFeat = map.querySourceFeatures('regions', { filter: ['all', ['==', ['get', 'type'], 'DC'], ['==', ['get', 'dc_id'], dc]] })[0];
    if (dcFeat) {
      const [minX, minY, maxX, maxY] = bbox(dcFeat);
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 80, maxZoom: 7.5, duration: 700, pitch: 40, bearing: 10 });
      return;
    }
  }
  if (division !== 'All') {
    const divFeat = map.querySourceFeatures('regions', { filter: ['all', ['==', ['get', 'type'], 'Division'], ['==', ['get', 'division'], division]] })[0];
    if (divFeat) {
      const [minX, minY, maxX, maxY] = bbox(divFeat);
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 80, maxZoom: 5.5, duration: 600, pitch: 30, bearing: 8 });
      return;
    }
  }
  // default: USA
  map.easeTo({ center: [-97, 37], zoom: 3.2, pitch: 0, bearing: 0, duration: 500 });
}

// simple bbox util for a GeoJSON polygon/multi
function bbox(feature) {
  const coords = feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates.flat()
    : feature.geometry.coordinates.flat(2);
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
