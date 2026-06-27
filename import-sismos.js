/* ============================================================
   Sismos y réplicas recientes — datos oficiales del USGS.
   (redayudavenezuela.com usa la misma fuente; aquí la consumimos directo.)
   - Bounding box de Venezuela, últimos 30 días, magnitud >= 2.5.
   - Caché en memoria + refresco automático cada 15 min.
   ============================================================ */
'use strict';

const SOURCE = 'USGS (earthquake.usgs.gov)';
const TTL = 15 * 60 * 1000;
// Venezuela + zona del sismo de La Guaira/Caribe sur
const BBOX = { minlat: 0.5, maxlat: 13.0, minlng: -74.0, maxlng: -59.0 };

let _cache = [];
let _at = 0;
let _inflight = null;

function buildUrl() {
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson'
    + '&starttime=' + start
    + '&minlatitude=' + BBOX.minlat + '&maxlatitude=' + BBOX.maxlat
    + '&minlongitude=' + BBOX.minlng + '&maxlongitude=' + BBOX.maxlng
    + '&minmagnitude=2.5&orderby=time&limit=100';
}

function norm(f) {
  const p = f.properties || {}, g = f.geometry || {}, c = g.coordinates || [];
  const lng = Number(c[0]), lat = Number(c[1]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return {
    id: f.id, mag: p.mag != null ? Number(p.mag) : null,
    place: p.place || '', time: p.time || null,
    lat, lng, depth: c[2] != null ? Number(c[2]) : null,
    url: p.url || '',
  };
}

async function fetchNow() {
  const res = await fetch(buildUrl(), { headers: { 'User-Agent': 'AyudaVE/1.0 (+ayudahumanitariavenezuela.com)', 'Accept': 'application/geo+json' } });
  if (!res.ok) throw new Error('usgs ' + res.status);
  const j = await res.json();
  const out = (j.features || []).map(norm).filter(Boolean);
  _cache = out; _at = Date.now(); // USGS es autoritativo; reemplaza siempre
  return _cache;
}

async function getSismos() {
  if (_cache.length && Date.now() - _at < TTL) return _cache;
  if (_inflight) return _inflight;
  _inflight = fetchNow().catch(e => { console.warn('[sismos]', e.message); return _cache; }).finally(() => { _inflight = null; });
  return _cache.length ? _cache : _inflight;
}

function primeSismos() {
  getSismos().then(a => console.log('[sismos] ' + a.length + ' sismos recientes (' + SOURCE + ')')).catch(() => {});
  setInterval(() => { _at = 0; getSismos().catch(() => {}); }, TTL).unref();
}

module.exports = { getSismos, primeSismos, SOURCE };

if (require.main === module) {
  fetchNow().then(a => { console.log(a.length + ' sismos'); console.log(JSON.stringify(a.slice(0, 3), null, 1)); }).catch(e => { console.error(e); process.exit(1); });
}
