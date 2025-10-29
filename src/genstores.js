/**
 * Generates src/data/stores.geo.json with:
 * - 200 stores for ATL-DC (Georgia)
 * - Other DCs with ~25-40 stores across US
 * Properties match HomeMap.jsx expectations.
 *
 * Run: node scripts/genStores.js
 */
const fs = require('fs');
const path = require('path');

function fc(features) { return { type: 'FeatureCollection', features }; }
function pt([lng, lat], props) { return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props }; }
function rand(n, m) { return Math.random() * (m - n) + n; }
function pick(a) { return a[Math.floor(Math.random()*a.length)]; }
function health() { return Math.round(rand(45, 100)); }

const DIVS = ['Northern','Southern','Eastern','Midwestern'];

/** Scatter points inside a bounding box (lngMin,lngMax,latMin,latMax) */
function scatterBox(box, count, mkProps) {
  const [lngMin, lngMax, latMin, latMax] = box;
  const out = [];
  for (let i = 0; i < count; i++) {
    const lng = rand(lngMin, lngMax);
    const lat = rand(latMin, latMax);
    out.push(pt([lng, lat], mkProps(i, [lng, lat])));
  }
  return out;
}

/** Slight jitter around a center (lng,lat), within given radius in degrees */
function scatterRad(center, count, radiusDeg, mkProps) {
  const [clng, clat] = center;
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random() * radiusDeg;
    const theta = Math.random() * Math.PI * 2;
    const lng = clng + Math.cos(theta) * r;
    const lat = clat + Math.sin(theta) * r;
    out.push(pt([lng, lat], mkProps(i, [lng, lat])));
  }
  return out;
}

let id = 1000;
const features = [];

/* ----------------- ATL-DC (Georgia) ~200 stores ----------------- */
const ATL_CENTER = [-84.39, 33.75];      // Atlanta
const GA_BOX = [-85.61, -80.75, 30.36, 35.00]; // Envelope we used in regions

const ATL_COUNT = 200;
features.push(
  ...scatterBox(GA_BOX, ATL_COUNT, (i) => ({
    store_id: id++,
    country: 'USA',
    state: 'GA',
    division: 'Southern',
    dc_id: 'ATL-DC',
    assigned: Math.random() < 0.6,
    health: health()
  }))
);

/* ----------------- Other DCs with realistic clusters ------------- */
const OTHER = [
  { name: 'CHI-DC', div: 'Midwestern', state: 'IL', center: [-87.65, 41.88], n: 35 },
  { name: 'DAL-DC', div: 'Southern',   state: 'TX', center: [-96.80, 32.78], n: 40 },
  { name: 'DEN-DC', div: 'Midwestern', state: 'CO', center: [-104.99, 39.74], n: 28 },
  { name: 'PHX-DC', div: 'Southern',   state: 'AZ', center: [-112.07, 33.45], n: 25 },
  { name: 'SEA-DC', div: 'Northern',   state: 'WA', center: [-122.33, 47.61], n: 25 },
  { name: 'BOS-DC', div: 'Eastern',    state: 'MA', center: [-71.06, 42.36], n: 30 },
  { name: 'NYC-DC', div: 'Eastern',    state: 'NY', center: [-74.00, 40.71], n: 30 }
];

OTHER.forEach(({name, div, state, center, n}) => {
  features.push(
    ...scatterRad(center, n, 0.8, () => ({
      store_id: id++,
      country: 'USA',
      state,
      division: div,
      dc_id: name,
      assigned: Math.random() < 0.5,
      health: health()
    }))
  );
});

/* ----------------- Sprinkle national singletons ------------------ */
const NATIONAL_BOX = [-123, -67, 25.5, 48.5];
features.push(
  ...scatterBox(NATIONAL_BOX, 40, () => ({
    store_id: id++,
    country: 'USA',
    state: pick(['CA','OR','UT','NV','NM','OK','MO','AL','NC','SC','VA','PA','OH']),
    division: pick(DIVS),
    dc_id: pick(['ATL-DC','CHI-DC','DAL-DC','DEN-DC','PHX-DC','SEA-DC','BOS-DC','NYC-DC']),
    assigned: Math.random() < 0.35,
    health: health()
  }))
);

/* ----------------- Write file ----------------------------------- */
const out = fc(features);
const outPath = path.join(__dirname, '..', 'src', 'data', 'stores.geo.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote ${features.length} stores to ${outPath}`);
