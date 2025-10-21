import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';
import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const DIVISIONS = ['All', 'Northern', 'Southern', 'Eastern', 'Midwestern'];

function healthToColor(h) {
  if (h >= 80) return '#28FFA0';       // neon green
  if (h >= 60) return '#FFB54C';       // neon amber
  return '#FF5A72';                    // neon red
}

export default function HomeMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  const [division, setDivision] = useState('All');
  const [dc, setDc] = useState('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // --- Build DC options based on the current (filtered) features ---
  const filteredStores = useMemo(() => {
    const country = 'USA';
    const feats = storesGeo.features.filter(f => f.properties.country === country);
    return {
      type: 'FeatureCollection',
      features: feats
        .filter(f => division === 'All' || f.properties.division === division)
        .filter(f => (dc === 'ALL' ? true : f.properties.dc_id === dc))
        .filter(f => (onlyAssigned ? f.properties.assigned === true : true)),
    };
  }, [division, dc, onlyAssigned]);

  const dcOptions = useMemo(() => {
    const set = new Set(['ALL']);
    filteredStores.features.forEach(f => set.add(f.properties.dc_id));
    return Array.from(set);
  }, [filteredStores]);

  // --- Init Map once ---
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-97.5, 39.8],  // USA
      zoom: 3.1,
      projection: 'mercator',
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Divisions polygons (for glow) ------------------------------
      if (!map.getSource('regions')) {
        map.addSource('regions', { type: 'geojson', data: regionsGeo });
      }
      // soft outer glow
      map.addLayer({
        id: 'region-glow',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': '#2BC4FF',
          'line-width': 8,
          'line-opacity': 0.15,
          'line-blur': 6,
        },
        layout: { visibility: 'none' },
      });
      // bright inner line
      map.addLayer({
        id: 'region-stroke',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': '#2BC4FF',
          'line-width': 2.5,
          'line-opacity': 0.85,
        },
        layout: { visibility: 'none' },
      });

      // Stores source ----------------------------------------------
      map.addSource('stores', { type: 'geojson', data: filteredStores });

      // Glow (big soft) circles
      map.addLayer({
        id: 'stores-glow',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            1, 3, 3, 4, 6, 7, 7.5, 12, 10, 14,
          ],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80], '#28FFA0',
            ['>=', ['get', 'health'], 60], '#FFB54C',
            '#FF5A72',
          ],
          'circle-opacity': 0.3,
          'circle-blur': 1.0
        }
      });

      // Core dot
      map.addLayer({
        id: 'stores-core',
        type: 'circle',
        source: 'stores',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            1, 2.2, 3, 2.8, 6, 4.6, 7.5, 6.2, 10, 7.8
          ],
          'circle-color': [
            'case',
            ['>=', ['get', 'health'], 80], '#28FFA0',
            ['>=', ['get', 'health'], 60], '#FFB54C',
            '#FF5A72',
          ],
          'circle-opacity': 0.95
        }
      });

      // Cursor + interactions --------------------------------------
      map.on('mouseenter', 'stores-core', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'stores-core', () => map.getCanvas().style.cursor = '');

      // Hover tooltip (dark)
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'pulse-tooltip',  // see CSS below
        offset: [0, -10]
      });

      map.on('mousemove', 'stores-core', (e) => {
        const f = e.features && e.features[0];
        if (!f) return;

        const p = f.properties;
        const html = `
          <div class="tt">
            <div class="tt-title">
              <span class="tt-id">${p.store_id}</span>
              <span class="tt-chip" style="background:${healthToColor(+p.health)}">${Math.round(p.health)}</span>
            </div>
            <div class="tt-line"><span>DC</span><b>${p.dc_id}</b></div>
            <div class="tt-line"><span>Division</span><b>${p.division}</b></div>
            <div class="tt-line"><span>Turnover</span><b>${(p.turnover ?? 0).toFixed(1)}×</b></div>
            <div class="tt-line"><span>Returns</span><b>${p.return_pct != null ? (p.return_pct * 100).toFixed(1) + '%' : '—'}</b></div>
          </div>`;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('mouseleave', 'stores-core', () => popup.remove());

      // Click → navigate to store page
      map.on('click', 'stores-core', (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const id = f.properties.store_id;
        navigate(`/store/${id}`);
      });

      // First fit
      fitToCurrent(map, filteredStores, division, dc);
    });

    return () => map.remove();
  }, [navigate]);

  // Update source when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('stores');
    if (!src) return;
    src.setData(filteredStores);
    fitToCurrent(map, filteredStores, division, dc);
    toggleRegionLayers(map, division);
    highlightRegion(map, division);
  }, [filteredStores, division, dc]);

  // --- helpers ---
  function toggleRegionLayers(map, div) {
    const vis = div === 'All' ? 'none' : 'visible';
    ['region-glow', 'region-stroke'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
  }

  function highlightRegion(map, div) {
    // filter region lines to the selected division
    if (!map.getLayer('region-glow')) return;
    const filter = div === 'All' ? ['==', ['get', 'division'], ''] : ['==', ['get', 'division'], div];
    map.setFilter('region-glow', filter);
    map.setFilter('region-stroke', filter);
  }

  function fitToCurrent(map, fc, div, dcVal) {
    // If DC selected and exists → fly to it
    if (dcVal !== 'ALL') {
      const dcFeat = regionsGeo.features.find(f => f.properties.type === 'DC' && f.properties.dc_id === dcVal);
      if (dcFeat) {
        const [lng, lat] = dcFeat.geometry.coordinates;
        map.flyTo({ center: [lng, lat], zoom: 7.5, speed: 0.8, curve: 1.4, pitch: 40, bearing: 15, essential: true });
        return;
      }
    }

    // If Division selected → fit to its polygon with a little 3D/pitch
    if (div !== 'All') {
      const poly = regionsGeo.features.find(f => f.properties.type === 'Division' && f.properties.division === div);
      if (poly) {
        const bounds = new mapboxgl.LngLatBounds();
        poly.geometry.coordinates[0].forEach(([lng, lat]) => bounds.extend([lng, lat]));
        map.easeTo({ pitch: 35, bearing: 10, duration: 600 });
        map.fitBounds(bounds, { padding: 80, maxZoom: 6.5, duration: 700 });
        return;
      }
    }

    // Default: fit to visible stores
    if (fc.features.length) {
      const b = new mapboxgl.LngLatBounds();
      fc.features.forEach(f => b.extend(f.geometry.coordinates));
      map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
      map.fitBounds(b, { padding: 60, maxZoom: 5.5, duration: 600 });
    }
  }

  return (
    <div className="home-shell">
      {/* Top bar (unchanged style) */}
      <div className="home-header">
        <div className="brand">
          <span className="pulse-dot" /> <span>Pulse · Inventory Insights</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <label>Division</label>
        <div className="pills">
          {DIVISIONS.map(d => (
            <button
              key={d}
              className={division === d ? 'is-active' : ''}
              onClick={() => setDivision(d)}
            >{d}</button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dc} onChange={(e) => setDc(e.target.value)}>
          {dcOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned} onChange={e => setOnlyAssigned(e.target.checked)} />
          Show only my assigned stores
        </label>
      </div>

      {/* Map container */}
      <div ref={containerRef} className="mapbox" />

      {/* Legend (unchanged style) */}
      <div className="legend">
        <span className="dot green" /> Healthy (80–100)
        <span className="dot amber" /> Watch (60–79)
        <span className="dot red" /> At Risk (&lt;60)
      </div>
    </div>
  );
}
