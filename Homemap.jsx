import React, {useEffect, useMemo, useRef, useState} from 'react';
import mapboxgl from 'mapbox-gl';
import {useNavigate} from 'react-router-dom';
import storesGeo from '../data/stores.geo.json';
import '../styles/HomeMap.css';

// Mapbox token (CRA style .env -> REACT_APP_MAPBOX_TOKEN)
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// --- USA + divisions (fast, fixed bounds) ---
const USA_BOUNDS = [[-125.0, 24.5], [-66.8, 49.5]]; // lon/lat
const DIVISION_BOUNDS = {
  Northern: [[-104.6, 41.5], [-82.0, 49.5]],   // MT/ND/MN/MI band
  Southern: [[-106.7, 25.5], [-80.0, 36.8]],   // TX/LA/MS/AL/GA/FL band
  Eastern:  [[-80.5, 36.0],  [-66.8, 47.0]],   // PA/NY/New England
  Midwestern:[[ -104.0, 36.8],[-80.5, 44.5]],  // CO/KS/MO/IL/IN/OH band
};

// Mock DC centers (key appears in store properties.dc)
const DC_INFO = {
  'ATL-DC': { name: 'Atlanta DC',    lngLat: [-84.39, 33.75]},
  'CHI-DC': { name: 'Chicago DC',    lngLat: [-87.63, 41.88]},
  'DAL-DC': { name: 'Dallas DC',     lngLat: [-96.80, 32.78]},
  'DEN-DC': { name: 'Denver DC',     lngLat: [-104.99,39.74]},
  'LAS-DC': { name: 'Las Vegas DC',  lngLat: [-115.14,36.17]},
  'SEA-DC': { name: 'Seattle DC',    lngLat: [-122.33,47.60]},
  'BOS-DC': { name: 'Boston DC',     lngLat: [-71.06,42.36]},
  'MIA-DC': { name: 'Miami DC',      lngLat: [-80.19,25.76]},
};

// Neon color from health score
const healthColor = (h) => (h >= 80 ? '#28F7A0' : h >= 60 ? '#FFB54C' : '#FF5A72');

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // UI state
  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false); // wire later if needed

  // Filtered features per division/DC
  const filteredGeo = useMemo(() => {
    const feats = storesGeo.features.filter((f) => {
      const p = f.properties || {};
      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc !== dc) return false;
      if (onlyAssigned && !p.assigned) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned]);

  // DC options list for current division
  const dcOptions = useMemo(() => {
    const set = new Set();
    storesGeo.features.forEach(f => {
      const p = f.properties;
      if (!p) return;
      if (division !== 'All' && p.division !== division) return;
      set.add(p.dc);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [division]);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      bounds: USA_BOUNDS,
      fitBoundsOptions: { padding: 40, duration: 0 },
      pitch: 35, // subtle 3D
      bearing: 0,
      antialias: true
    });

    mapRef.current = map;

    map.on('load', () => {
      // source
      map.addSource('stores', { type: 'geojson', data: filteredGeo });

      // soft background grid (optional)
      // Glow layer (under)
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 1.5, 4, 2.5, 6, 5, 8, 8, 10, 12
          ],
          'circle-color': ['case',
            ['>=', ['get', 'health'], 80], '#28F7A0',
            ['>=', ['get', 'health'], 60], '#FFB54C',
            '#FF5A72'
          ],
          'circle-opacity': 0.35,
          'circle-blur': 0.6
        }
      });

      // Core neon dot (above)
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 2, 4, 3, 6, 4.5, 8, 6.5, 10, 8.5
          ],
          'circle-color': ['case',
            ['>=', ['get', 'health'], 80], '#28F7A0',
            ['>=', ['get', 'health'], 60], '#FFB54C',
            '#FF5A72'
          ],
          'circle-opacity': 0.95
        }
      });

      // Cursor feedback
      map.on('mouseenter', 'stores-core', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'stores-core', () => map.getCanvas().style.cursor = '');

      // Click -> navigate to detail
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        navigate(`/store/${f.properties.store_id}`);
      });

      // Hover tooltip (dark)
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -10],
        className: 'pulse-map-tt'
      });

      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt">
              <div class="tt-title">
                <span>${p.store_name}</span>
                <span class="tt-id">${p.store_id}</span>
              </div>
              <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
              <div class="tt-line"><span>Turnover</span><b>${(p.turnover ?? 0).toFixed(1)}×</b></div>
              <div class="tt-line"><span>Returns</span><b>${(p.return_pct ?? 0 * 100).toFixed(1)}%</b></div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'stores-core', () => popup.remove());
    });

    // Resize when container becomes visible
    const r = () => map.resize();
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, [navigate, filteredGeo]);

  // Update source when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('stores');
    if (src) src.setData(filteredGeo);
  }, [filteredGeo]);

  // Zoom/tilt when division/DC changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Remove previous region highlight
    if (map.getLayer('region-mask')) map.removeLayer('region-mask');
    if (map.getSource('region')) map.removeSource('region');

    // Compute target bounds
    let bounds = null;
    if (dc !== 'ALL' && DC_INFO[dc]) {
      const [lng, lat] = DC_INFO[dc].lngLat;
      const delta = 2.5; // degrees extent around DC
      bounds = [[lng - delta, lat - delta], [lng + delta, lat + delta]];
    } else if (division !== 'All') {
      bounds = DIVISION_BOUNDS[division];
    } else {
      bounds = USA_BOUNDS;
    }

    // Subtle 3D glow mask for region
    if (division !== 'All') {
      const [[w, s],[e, n]] = bounds;
      const regionPoly = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [w, s],[e, s],[e, n],[w, n],[w, s]
            ]]
          }
        }]
      };
      map.addSource('region', { type: 'geojson', data: regionPoly });
      map.addLayer({
        id: 'region-mask',
        type: 'fill',
        source: 'region',
        paint: {
          'fill-color': '#2BC4FF',
          'fill-opacity': 0.06
        }
      });
    }

    map.fitBounds(bounds, { padding: 60, duration: 800, pitch: 45, bearing: 0 });
  }, [division, dc]);

  return (
    <div className="home-shell">
      {/* Top bar */}
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" /> <span>Pulse · Inventory Insights</span>
        </div>

        {/* segmentation removed per your note (USA only) */}
        <div />
      </div>

      {/* Filters card */}
      <div className="filters">
        <div className="filters_group">
          <label>Division</label>
          <div className="filters_pills">
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
        </div>

        <div className="filters_group">
          <label>Distribution Center</label>
          <select value={dc} onChange={(e) => setDc(e.target.value)}>
            {dcOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned}
                 onChange={e => setOnlyAssigned(e.target.checked)} />
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
