/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';

// ---- data (local JSON files) ----
// Adjust paths if your folder differs
import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';

import '../styles/HomeMap.css';

// ---------------------------------
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// neon health colors
const healthToColor = (h) => {
  if (h >= 80) return '#28FFA0'; // neon green
  if (h >= 60) return '#FF5A4C'; // neon amber/orange
  return '#FF5A72';             // neon red
};

// US-only bounds (lon/lat)
const US_BOUNDS = [
  [-125.0011, 24.9493], // SW
  [-66.9326, 49.5904]   // NE
];

// Division labels in the same order as the UI pills
const DIVISIONS = ['All', 'Northern', 'Southern', 'Eastern', 'Midwestern'];

// helper: compute DC dropdown options for the current filtered features
const buildDcOptions = (filtered, division, country) => {
  const set = new Set();
  filtered.features.forEach((f) => {
    const p = f.properties;
    if ((division === 'All' || p.division === division) && p.country === country) {
      if (p.dc_id && p.dc_id !== 'ALL') set.add(p.dc_id);
    }
  });
  return ['ALL', ...Array.from(set).sort()];
};

export default function HomeMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // ---- UI State ----
  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [country] = useState('USA'); // locked to USA per requirement

  // ---- Filtering (Memo) ----
  const filteredStores = useMemo(() => {
    const feats = storesGeo.features.filter((f) => {
      const p = f.properties;
      if (country && p.country !== country) return false;
      if (division !== 'All' && p.division !== division) return false;
      if (dc !== 'ALL' && p.dc_id !== dc) return false;
      if (onlyAssigned && p.assigned !== true) return false;
      return true;
    });
    return { type: 'FeatureCollection', features: feats };
  }, [division, dc, onlyAssigned, country]);

  const dcOptions = useMemo(
    () => buildDcOptions({ type: 'FeatureCollection', features: storesGeo.features }, division, country),
    [division, country]
  );

  // ---------- Map init ----------
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-96.9, 38.5], // USA center
      zoom: 3.3,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });

    // lock to mercator (no globe)
    map.on('style.load', () => {
      try {
        // keep it strictly mercator
        map.setProjection('mercator');
      } catch (_) {}
    });

    // hard bounds to USA (with a little padding)
    map.setMaxBounds([
      [US_BOUNDS[0][0] - 3, US_BOUNDS[0][1] - 3],
      [US_BOUNDS[1][0] + 3, US_BOUNDS[1][1] + 3]
    ]);

    // resize if container changes (fix “blank after reload” issues)
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    mapRef.current = map;

    map.on('load', () => {
      // ------- Sources -------
      if (!map.getSource('regions')) {
        map.addSource('regions', { type: 'geojson', data: regionsGeo });
      }
      if (!map.getSource('stores')) {
        map.addSource('stores', { type: 'geojson', data: filteredStores });
      }

      // ------- Region outline + glow (for division/DC highlight) -------
      if (!map.getLayer('region-line-glow')) {
        map.addLayer({
          id: 'region-line-glow',
          type: 'line',
          source: 'regions',
          paint: {
            'line-color': '#2BC4FF',
            'line-width': 3,
            'line-opacity': 0.25
          },
          layout: { visibility: 'none' }
        });
      }
      if (!map.getLayer('region-line-bright')) {
        map.addLayer({
          id: 'region-line-bright',
          type: 'line',
          source: 'regions',
          paint: {
            'line-color': '#2BC4FF',
            'line-width': 1,
            'line-opacity': 0.85
          },
          layout: { visibility: 'none' }
        });
      }

      // ------- Store dots (glow + core) -------
      if (!map.getLayer('stores-glow')) {
        map.addLayer({
          id: 'stores-glow',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 4, 6, 6, 10, 9, 14],
            'circle-color': [
              'case',
              ['>=', ['get', 'health'], 80], '#28FFA0',
              ['>=', ['get', 'health'], 60], '#FF5A4C',
              '#FF5A72'
            ],
            'circle-opacity': 0.28,
            'circle-blur': 1.0
          }
        });
      }

      if (!map.getLayer('stores-core')) {
        map.addLayer({
          id: 'stores-core',
          type: 'circle',
          source: 'stores',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 6, 6.5, 8, 7.8],
            'circle-color': [
              'case',
              ['>=', ['get', 'health'], 80], '#28FFA0',
              ['>=', ['get', 'health'], 60], '#FF5A4C',
              '#FF5A72'
            ],
            'circle-opacity': 1.0
          }
        });
      }

      // cursor
      map.on('mouseenter', 'stores-core', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stores-core', () => (map.getCanvas().style.cursor = ''));

      // dark tooltip
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -10]
      });

      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const html = `
          <div class="tt">
            <div class="tt-title">
              <span>Store</span>
              <span class="tt-id">#${p.store_id}</span>
            </div>
            <div class="tt-line"><span>Division</span><b>${p.division}</b></div>
            <div class="tt-line"><span>DC</span><b>${p.dc_id || '-'}</b></div>
            <div class="tt-line"><span>Health</span><b style="color:${healthToColor(+p.health)}">${Math.round(p.health)}%</b></div>
          </div>
        `;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());

      // click → store dashboard
      map.on('click', 'stores-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties.store_id;
        navigate(`/store/${id}`);
      });

      // first paint of stores at load
      updateStoresSource();
    });

    // cleanup
    return () => {
      ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ---------- helpers ----------
  const setRegionLayersVisibility = (vis) => {
    const map = mapRef.current;
    if (!map) return;
    ['region-line-glow', 'region-line-bright'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
  };

  const updateRegionFilter = (filterExp) => {
    const map = mapRef.current;
    if (!map) return;
    ['region-line-glow', 'region-line-bright'].forEach((id) => {
      if (map.getLayer(id)) map.setFilter(id, filterExp);
    });
  };

  const updateStoresSource = () => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('stores');
    if (src && map.isStyleLoaded()) {
      src.setData(filteredStores);
    }
  };

  const fitToFeature = (feature) => {
    const map = mapRef.current;
    if (!map || !feature) return;

    // compute bounds for polygons or points
    const type = feature.geometry.type;
    if (type === 'Polygon' || type === 'MultiPolygon') {
      const bounds = new mapboxgl.LngLatBounds();
      const addCoords = (coords) => coords.forEach((c) => bounds.extend(c));
      if (type === 'Polygon') feature.geometry.coordinates[0].forEach((c) => bounds.extend(c));
      if (type === 'MultiPolygon')
        feature.geometry.coordinates.forEach((poly) => poly[0].forEach((c) => bounds.extend(c)));

      // subtle 3D while zooming
      map.easeTo({ pitch: 30, bearing: 10, duration: 360 });
      map.fitBounds(bounds, { padding: 60, maxZoom: 6.5, duration: 700 });
    } else if (type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates;
      map.easeTo({ center: [lng, lat], zoom: 7.5, pitch: 25, bearing: 15, duration: 600 });
    }
  };

  // ---------- respond to filter changes ----------
  useEffect(() => {
    updateStoresSource();

    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // decide which region (if any) to highlight + fly to
    // 1) If DC selected → find that DC region polygon
    if (dc !== 'ALL') {
      const feat = regionsGeo.features.find(
        (f) => f.properties.type === 'DC' && f.properties.dc_id === dc
      );
      if (feat) {
        setRegionLayersVisibility('visible');
        updateRegionFilter(['==', ['get', 'dc_id'], dc]);
        fitToFeature(feat);
        return;
      }
    }

    // 2) Else if a Division selected (not All) → highlight division polygon
    if (division !== 'All') {
      const feat = regionsGeo.features.find(
        (f) => f.properties.type === 'Division' && f.properties.division === division
      );
      if (feat) {
        setRegionLayersVisibility('visible');
        updateRegionFilter(['==', ['get', 'division'], division]);
        fitToFeature(feat);
        return;
      }
    }

    // 3) Default – show USA
    setRegionLayersVisibility('none');
    map.easeTo({ center: [-96.9, 38.5], zoom: 3.3, pitch: 0, bearing: 0, duration: 500 });
  }, [division, dc, onlyAssigned, filteredStores]);

  // ---------- Render ----------
  return (
    <div className="home-shell">
      {/* Top bar (unchanged style) */}
      <div className="home-header">
        <span className="brand">
          <span className="pulse-dot" /> Pulse • Inventory Insights
        </span>
      </div>

      {/* Filters card */}
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
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <div className="chk">
          <input
            type="checkbox"
            checked={onlyAssigned}
            onChange={(e) => setOnlyAssigned(e.target.checked)}
            id="onlyAssigned"
          />
          <label htmlFor="onlyAssigned">Show only my assigned stores</label>
        </div>
      </div>

      {/* Map container */}
      <div ref={containerRef} className="mapbox" />

      {/* Legend */}
      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot amber" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
