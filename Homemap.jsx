/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';

// IMPORTANT: keep this import here so the canvas is styled properly
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/HomeMap.css';

import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// US bounds (lon/lat)
const US_BOUNDS = [
  [-125.0011, 24.9493],
  [-66.9326, 49.5904]
];

const DIVISIONS = ['All', 'Northern', 'Southern', 'Eastern', 'Midwestern'];

const healthToColor = (h) => (h >= 80 ? '#28FFA0' : h >= 60 ? '#FF5A4C' : '#FF5A72');

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [debugMsg, setDebugMsg] = useState('');

  // Filtered stores
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

  // init map (only once)
  useEffect(() => {
    if (mapRef.current) return;

    if (!mapboxgl.accessToken) {
      setDebugMsg('Missing REACT_APP_MAPBOX_TOKEN');
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-96.9, 38.5],
      zoom: 3.3,
      attributionControl: false
    });

    // shrink “blank after reload” cases
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    mapRef.current = map;

    // show any style/token errors directly on screen
    map.on('error', (e) => {
      if (e?.error?.message) setDebugMsg(e.error.message);
    });

    // Wait for the style ONCE, then wire everything
    map.once('style.load', () => {
      try {
        // lock to mercator + US bounds
        map.setProjection('mercator');
        map.setMaxBounds([
          [US_BOUNDS[0][0] - 3, US_BOUNDS[0][1] - 3],
          [US_BOUNDS[1][0] + 3, US_BOUNDS[1][1] + 3]
        ]);

        // sources
        if (!map.getSource('regions')) {
          map.addSource('regions', { type: 'geojson', data: regionsGeo });
        }
        if (!map.getSource('stores')) {
          map.addSource('stores', { type: 'geojson', data: filteredStores });
        }

        // region glow
        if (!map.getLayer('region-line-glow')) {
          map.addLayer({
            id: 'region-line-glow',
            type: 'line',
            source: 'regions',
            paint: { 'line-color': '#2BC4FF', 'line-width': 3, 'line-opacity': 0.25 },
            layout: { visibility: 'none' }
          });
        }
        if (!map.getLayer('region-line-bright')) {
          map.addLayer({
            id: 'region-line-bright',
            type: 'line',
            source: 'regions',
            paint: { 'line-color': '#2BC4FF', 'line-width': 1, 'line-opacity': 0.85 },
            layout: { visibility: 'none' }
          });
        }

        // stores (glow + core)
        if (!map.getLayer('stores-glow')) {
          map.addLayer({
            id: 'stores-glow',
            type: 'circle',
            source: 'stores',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 6, 10, 9, 14],
              'circle-color': [
                'case',
                ['>=', ['get', 'health'], 80],
                '#28FFA0',
                ['>=', ['get', 'health'], 60],
                '#FF5A4C',
                '#FF5A72'
              ],
              'circle-opacity': 0.28,
              'circle-blur': 1
            }
          });
        }
        if (!map.getLayer('stores-core')) {
          map.addLayer({
            id: 'stores-core',
            type: 'circle',
            source: 'stores',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 8, 7.8],
              'circle-color': [
                'case',
                ['>=', ['get', 'health'], 80],
                '#28FFA0',
                ['>=', ['get', 'health'], 60],
                '#FF5A4C',
                '#FF5A72'
              ],
              'circle-opacity': 1
            }
          });
        }

        // cursor + popup
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: [0, -10]
        });

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
                   <b style="color:${healthToColor(+p.health)}">${Math.round(+p.health)}%</b>
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

        // initial paint
        const src = map.getSource('stores');
        if (src) src.setData(filteredStores);
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

  // update sources + zoom/highlight on filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const src = map.getSource('stores');
    if (src) src.setData(filteredStores);

    const showRegions = (vis) => {
      ['region-line-glow', 'region-line-bright'].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
      });
    };
    const setRegionFilter = (exp) => {
      ['region-line-glow', 'region-line-bright'].forEach((id) => {
        if (map.getLayer(id)) map.setFilter(id, exp);
      });
    };

    // DC zoom
    if (dc !== 'ALL') {
      const feat = regionsGeo.features.find(
        (f) => f.properties.type === 'DC' && f.properties.dc_id === dc
      );
      if (feat) {
        showRegions('visible');
        setRegionFilter(['==', ['get', 'dc_id'], dc]);
        flyToFeature(map, feat);
        return;
      }
    }

    // Division zoom
    if (division !== 'All') {
      const feat = regionsGeo.features.find(
        (f) => f.properties.type === 'Division' && f.properties.division === division
      );
      if (feat) {
        showRegions('visible');
        setRegionFilter(['==', ['get', 'division'], division]);
        flyToFeature(map, feat);
        return;
      }
    }

    // Default US view
    showRegions('none');
    map.easeTo({ center: [-96.9, 38.5], zoom: 3.3, pitch: 0, bearing: 0, duration: 450 });
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
        <span className="dot amber" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>

      {debugMsg && <div className="debug-banner">Map error: {debugMsg}</div>}
    </div>
  );
}

// -------- helpers --------
function flyToFeature(map, feature) {
  const t = feature.geometry.type;
  if (t === 'Polygon' || t === 'MultiPolygon') {
    const bounds = new mapboxgl.LngLatBounds();
    const add = (c) => bounds.extend(c);
    if (t === 'Polygon') feature.geometry.coordinates[0].forEach(add);
    else feature.geometry.coordinates.forEach((poly) => poly[0].forEach(add));
    map.easeTo({ pitch: 30, bearing: 10, duration: 360 });
    map.fitBounds(bounds, { padding: 60, maxZoom: 6.5, duration: 700 });
  } else if (t === 'Point') {
    const [lng, lat] = feature.geometry.coordinates;
    map.easeTo({ center: [lng, lat], zoom: 7.5, pitch: 25, bearing: 15, duration: 600 });
  }
}
