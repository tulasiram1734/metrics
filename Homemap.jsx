import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';

import storesGeo from '../data/stores.geo.json';
import divisionsGeo from '../data/divisions.geo.json';
import dcsGeo from '../data/dcs.json';

import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// ---------- helpers
const USA_BOUNDS = [
  [-124.9, 24.4],   // SW
  [-66.7, 49.5],    // NE
];

const healthColor = (h) => (h >= 80 ? '#2BFFA0' : h >= 60 ? '#FFB454' : '#FF5A72');

// compute bounds for a feature collection
function featureBounds(fc) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  fc.features.forEach(f => {
    const c = f.geometry.coordinates;
    const addPoint = ([x, y]) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };
    if (f.geometry.type === 'Point') addPoint(c);
    if (f.geometry.type === 'MultiPoint') c.forEach(addPoint);
    if (f.geometry.type === 'Polygon') c.flat().forEach(addPoint);
    if (f.geometry.type === 'MultiPolygon') c.flat(2).forEach(addPoint);
  });
  return [[minX, minY], [maxX, maxY]];
}

export default function HomeMap() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const sourcesReady = useRef(false);

  // UI state
  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyMine, setOnlyMine] = useState(false);

  // mock assigned stores; replace when auth is wired
  const myStoreIds = useMemo(() => new Set(['ATL-007', 'TPA-002', 'PHI-012', 'BUF-003']), []);

  // filtered stores
  const filteredStores = useMemo(() => {
    const feats = storesGeo.features.filter(f => {
      const p = f.properties;
      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      if (onlyMine && !myStoreIds.has(p.store_id)) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyMine, myStoreIds]);

  // DC dropdown options
  const dcOptions = useMemo(() => {
    const set = new Set();
    storesGeo.features.forEach(f => {
      const p = f.properties;
      if (division === 'All' || p.division === division) set.add(p.dc_id);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [division]);

  // ---------- init map once
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      bounds: USA_BOUNDS,
      fitBoundsOptions: { padding: 50, animate: false },
      dragRotate: true,
      projection: 'mercator',
      cooperativeGestures: true
    });
    mapRef.current = map;

    // resize guard (safari race fix)
    const ro = new ResizeObserver(() => {
      if (map && map._canvas) map.resize();
    });
    ro.observe(containerRef.current);

    map.on('load', () => {
      // add sources once
      map.addSource('stores', { type: 'geojson', data: filteredStores });
      map.addSource('divisions', { type: 'geojson', data: divisionsGeo });
      map.addSource('dcs', { type: 'geojson', data: dcsGeo });

      // divisions outline (glow if selected)
      map.addLayer({
        id: 'div-outline',
        type: 'line',
        source: 'divisions',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'name'], division], '#1FB8FF',
            'rgba(255,255,255,0.06)'
          ],
          'line-width': [
            'case',
            ['==', ['get', 'name'], division], 4.0,
            1.2
          ],
          'line-blur': [
            'case',
            ['==', ['get', 'name'], division], 2.0,
            0.2
          ],
          'line-opacity': 0.9
        }
      });

      // DC markers (subtle)
      map.addLayer({
        id: 'dc-core',
        type: 'circle',
        source: 'dcs',
        paint: {
          'circle-radius': 3.5,
          'circle-color': '#8EC9FF',
          'circle-opacity': 0.8
        },
        filter: ['in', ['get', 'division'], ['literal', ['All', 'Northern', 'Southern', 'Eastern', 'Midwestern']]] // always on
      });

      // store glow
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 3, 5, 5, 7, 7, 10, 12
          ],
          'circle-color': ['case',
            ['>=', ['get', 'health'], 80], '#2BFFA0',
            ['>=', ['get', 'health'], 60], '#FFB454',
            '#FF5A72'
          ],
          'circle-blur': 0.7,
          'circle-opacity': 0.35
        }
      });

      // store core
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 1.8, 5, 2.6, 7, 3.2, 10, 4.5
          ],
          'circle-color': ['case',
            ['>=', ['get', 'health'], 80], '#2BFFA0',
            ['>=', ['get', 'health'], 60], '#FFB454',
            '#FF5A72'
          ],
          'circle-opacity': 0.95
        }
      });

      // pointer and click → route
      map.on('mouseenter', 'stores-core', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'stores-core', () => { map.getCanvas().style.cursor = ''; });

      // Tooltip (custom dark HTML, no Mapbox default style)
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -12], className: 'pulse-tt' });

      map.on('mousemove', 'stores-core', (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const p = f.properties;
        const health = Number(p.health);
        popup
          .setLngLat(f.geometry.coordinates)
          .setHTML(`
            <div class="tt">
              <div class="tt-title"><span class="tt-dot" style="background:${healthColor(health)}"></span>${p.store_name}</div>
              <div class="tt-line"><span>ID</span><b>${p.store_id}</b></div>
              <div class="tt-line"><span>Health</span><b>${Math.round(health)}</b></div>
              <div class="tt-line"><span>Turnover</span><b>${Number(p.turnover || 0).toFixed(1)}x</b></div>
              <div class="tt-line"><span>Returns</span><b>${p.return_pct != null ? (Number(p.return_pct)*100).toFixed(1)+'%' : '—'}</b></div>
              <div class="tt-line"><span>Division</span><b>${p.division}</b></div>
              <div class="tt-foot">Click to open dashboard</div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'stores-core', () => popup.remove());

      map.on('click', 'stores-core', (e) => {
        if (!e.features?.length) return;
        const id = e.features[0].properties.store_id;
        navigate(`/store/${id}`);
      });

      sourcesReady.current = true;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update sources when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourcesReady.current) return;
    const stores = map.getSource('stores');
    if (stores) stores.setData(filteredStores);

    // update division glow
    if (map.getLayer('div-outline')) {
      map.setPaintProperty('div-outline', 'line-color', [
        'case', ['==', ['get', 'name'], division], '#1FB8FF', 'rgba(255,255,255,0.06)'
      ]);
      map.setPaintProperty('div-outline', 'line-width', [
        'case', ['==', ['get', 'name'], division], 4.0, 1.2
      ]);
      map.setPaintProperty('div-outline', 'line-blur', [
        'case', ['==', ['get', 'name'], division], 2.0, 0.2
      ]);
    }

    // zoom behavior
    if (division !== 'All') {
      // zoom to division polygon
      const poly = divisionsGeo.features.find(f => f.properties.name === division);
      if (poly) {
        const b = featureBounds({ type: 'FeatureCollection', features: [poly] });
        map.fitBounds(b, { padding: 60, duration: 700, pitch: 30, bearing: 0 });
      }
    } else if (dc !== 'ALL') {
      // zoom to this DC + neighborhood (buffered by degree)
      const point = dcsGeo.features.find(f => f.properties.dc_id === dc);
      if (point) {
        map.flyTo({
          center: point.geometry.coordinates,
          zoom: 7.2,
          duration: 700,
          pitch: 35
        });
      }
    } else {
      // back to USA
      map.fitBounds(USA_BOUNDS, { padding: 60, duration: 600, pitch: 0, bearing: 0 });
    }
  }, [filteredStores, division, dc]);

  return (
    <div className="home-shell">
      {/* Top brand/header (dark, visible) */}
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" /> <span>Pulse · Inventory Insights</span>
        </div>
      </div>

      {/* Filters panel */}
      <div className="filters">
        <label>Division</label>
        <div className="pills">
          {['All','Northern','Southern','Eastern','Midwestern'].map(d => (
            <button
              key={d}
              className={`pill ${division === d ? 'is-active' : ''}`}
              onClick={() => { setDivision(d); setDc('ALL'); }}
            >
              {d}
            </button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dc} onChange={(e) => setDc(e.target.value)}>
          {dcOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>

        <label className="chk">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
          Show only my assigned stores
        </label>
      </div>

      {/* Map container */}
      <div ref={containerRef} className="map-container" />

      {/* Legend */}
      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot amber" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
