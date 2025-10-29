import React, {useEffect, useMemo, useRef, useState} from 'react';
import mapboxgl from 'mapbox-gl';
import { useNavigate } from 'react-router-dom';
import storesGeo from '../data/stores.geo.json';
import regionsGeo from '../data/regions.geo.json';
import '../styles/HomeMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN; // keep your .env

// UI divisions
const DIVISIONS = ['All','Northern','Southern','Eastern','Midwestern'];

// hard US bounds – keeps us off the globe
const US_BOUNDS = [
  [-127.0, 23.0], // SW
  [-65.0, 50.0],  // NE
];

// health → neon color
function healthToColor(h=0){
  if (h>=80) return '#28FFA0';
  if (h>=60) return '#FFAB54';
  return '#FF5A72';
}

export default function HomeMap(){
  const mapRef = useRef(null);
  const mapReady = useRef(false);          // <- critical: don’t touch style until ready
  const navigate = useNavigate();

  // filters
  const [division, setDivision]   = useState('All');     // All | Northern | …
  const [dcId, setDcId]           = useState('ALL');     // ALL or a DC id string
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  // filtered store features
  const filteredStores = useMemo(() => {
    const feats = storesGeo.features.filter(f=>{
      const p = f.properties;
      if (p.country !== 'USA') return false;
      if (division !== 'All' && p.division !== division) return false;
      if (dcId !== 'ALL' && p.dc_id !== dcId) return false;
      if (onlyAssigned && !p.assigned) return false;
      return true;
    });
    return {type:'FeatureCollection', features:feats};
  }, [division, dcId, onlyAssigned]);

  // DC options for the current division
  const dcOptions = useMemo(()=>{
    const s = new Set();
    filteredStores.features.forEach(f=> s.add(f.properties.dc_id));
    return ['ALL', ...Array.from(s).sort()];
  }, [filteredStores]);

  // ---- init map once ----
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: 'map-root',
      style: 'mapbox://styles/mapbox/dark-v11',
      projection: 'mercator',
      center: [-98.5, 38.0],
      zoom: 3.3,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });

    // keep in the US, disable world wrap/globe
    map.setMaxBounds(US_BOUNDS);
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on('load', () => {
      mapReady.current = true;

      // --- sources ---
      map.addSource('regions', { type:'geojson', data: regionsGeo });
      map.addSource('stores',  { type:'geojson', data: filteredStores });

      // --- region outline (invisible by default; shown on highlight) ---
      map.addLayer({
        id:'region-outline',
        type:'line',
        source:'regions',
        paint:{
          'line-color':'#2BC4FF',
          'line-width':2.5,
          'line-opacity':0.0
        }
      });

      // subtle fill-extrusion glow (appears on highlight)
      map.addLayer({
        id:'region-extrude',
        type:'fill-extrusion',
        source:'regions',
        paint:{
          'fill-extrusion-color':'#2BC4FF',
          'fill-extrusion-height': 2000,      // thin wall
          'fill-extrusion-opacity': 0.0
        }
      });

      // --- store dots: glow ---
      map.addLayer({
        id:'stores-glow',
        type:'circle',
        source:'stores',
        paint:{
          'circle-radius': ['interpolate',['linear'],['zoom'],   1,3,  4,6,  6,7.5,  12,10,  14,13],
          'circle-color': [
            'case',
            ['>=',['get','health'],80], '#28FFA0',
            ['>=',['get','health'],60], '#FFAB54',
            '#FF5A72'
          ],
          'circle-opacity': 0.85,
          'circle-blur': 0.6
        }
      });

      // --- store dots: core ---
      map.addLayer({
        id:'stores-core',
        type:'circle',
        source:'stores',
        paint:{
          'circle-radius': ['interpolate',['linear'],['zoom'], 1,1.8, 3,2.2, 6,3.2, 12,4.5, 14,6.2],
          'circle-color': [
            'case',
            ['>=',['get','health'],80], '#28FFA0',
            ['>=',['get','health'],60], '#FFAB54',
            '#FF5A72'
          ],
          'circle-opacity': 1.0
        }
      });

      // cursor
      map.on('mouseenter','stores-core', ()=> map.getCanvas().style.cursor='pointer');
      map.on('mouseleave','stores-core', ()=> map.getCanvas().style.cursor='');

      // tooltip (dark)
      const popup = new mapboxgl.Popup({closeButton:false, closeOnClick:false, offset:[0,-10], className:'tt'});
      map.on('mousemove','stores-core', (e)=>{
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="tt-wrap">
              <div class="tt-title"><b>${p.store_name}</b> <span class="tt-id">#${p.store_id}</span></div>
              <div class="tt-line"><span>Health</span><b>${Math.round(p.health)}</b></div>
              <div class="tt-line"><span>Turnover</span><b>${(p.turnover??0).toFixed(1)}%</b></div>
              <div class="tt-line"><span>Returns</span><b>${p.return_pct!=null?(p.return_pct*100).toFixed(1)+'%':'-'}</b></div>
            </div>
          `)
          .addTo(map);
      });
      map.on('mouseleave','stores-core', ()=> popup.remove());

      // click → navigate
      map.on('click','stores-core',(e)=>{
        const f = e.features?.[0];
        if (!f) return;
        navigate(`/store/${f.properties.store_id}`);
      });

      // initial focus
      fitToCurrent(map, filteredStores, division, dcId);
    });

    mapRef.current = map;
    return () => map.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- update source data when filters change ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady.current) return;

    const src = map.getSource('stores');
    if (src && 'setData' in src) src.setData(filteredStores);

    // update region highlight + camera
    highlightRegion(map, division, dcId);
    fitToCurrent(map, filteredStores, division, dcId);
  }, [filteredStores, division, dcId]);

  // helpers
  function highlightRegion(map, div, dc){
    if (!mapReady.current) return;

    // start hidden
    map.setPaintProperty('region-outline','line-opacity',0.0);
    map.setPaintProperty('region-extrude','fill-extrusion-opacity',0.0);

    // show the selected division polygon
    if (div !== 'All'){
      map.setFilter('region-outline', ['all',['==',['get','type'],'Division'],['==',['get','division'],div]]);
      map.setFilter('region-extrude', ['all',['==',['get','type'],'Division'],['==',['get','division'],div]]);
      map.setPaintProperty('region-outline','line-opacity',0.85);
      map.setPaintProperty('region-extrude','fill-extrusion-opacity',0.14);
    }

    // show DC polygon if chosen
    if (dc !== 'ALL'){
      map.setFilter('region-outline', ['all',['==',['get','type'],'DC'],['==',['get','dc_id'],dc]]);
      map.setFilter('region-extrude', ['all',['==',['get','type'],'DC'],['==',['get','dc_id'],dc]]);
      map.setPaintProperty('region-outline','line-opacity',0.95);
      map.setPaintProperty('region-extrude','fill-extrusion-opacity',0.18);
    }
  }

  function fitToCurrent(map, storesFC, div, dc){
    if (!mapReady.current) return;

    // DC focus
    if (dc !== 'ALL'){
      const hit = regionsGeo.features.find(f => f.properties.type==='DC' && f.properties.dc_id===dc);
      if (hit){
        const b = new mapboxgl.LngLatBounds();
        hit.geometry.coordinates[0].forEach(([lng,lat]) => b.extend([lng,lat]));
        map.fitBounds(b, {padding:60, curve:1.4, speed:0.8, pitch:35, bearing:15, duration:700});
        return;
      }
    }

    // Division focus
    if (div !== 'All'){
      const hit = regionsGeo.features.find(f => f.properties.type==='Division' && f.properties.division===div);
      if (hit){
        const b = new mapboxgl.LngLatBounds();
        hit.geometry.coordinates[0].forEach(([lng,lat]) => b.extend([lng,lat]));
        map.fitBounds(b, {padding:60, curve:1.3, speed:0.8, pitch:25, bearing:8, duration:650});
        return;
      }
    }

    // default: fit stores
    if (storesFC.features.length){
      const b = new mapboxgl.LngLatBounds();
      storesFC.features.forEach(f=>b.extend(f.geometry.coordinates));
      map.fitBounds(b, {padding:60, maxZoom:5.5, duration:600});
    }else{
      map.fitBounds(US_BOUNDS, {padding:50, duration:500});
    }
  }

  // UI
  return (
    <div className="home-shell">
      {/* Top bar (kept like before) */}
      <div className="home-header">
        <div className="brand"><span className="pulse-dot"/> <span>Pulse · Inventory Insights</span></div>
      </div>

      {/* Filters */}
      <div className="filters">
        <label>Division</label>
        <div className="pills">
          {DIVISIONS.map(d=>(
            <button key={d}
              className={division===d ? 'is-active':''}
              onClick={()=> setDivision(d)}>{d}</button>
          ))}
        </div>

        <label>Distribution Center</label>
        <select value={dcId} onChange={e=> setDcId(e.target.value)}>
          {dcOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>

        <label className="chk">
          <input type="checkbox" checked={onlyAssigned} onChange={e=>setOnlyAssigned(e.target.checked)}/>
          Show only my assigned stores
        </label>
      </div>

      {/* Map container */}
      <div id="map-root" className="mapbox"/>

      {/* Legend */}
      <div className="legend">
        <span className="dot green"/> Healthy (80–100)
        <span className="dot orange"/> Watch (60–79)
        <span className="dot red"/> At Risk (&lt;60)
      </div>
    </div>
  );
}
