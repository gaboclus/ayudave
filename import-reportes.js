/* ============================================================
   Importador de reportes de servicios desde reporte-ve (ve.crafter.run).
   Proyecto abierto: https://github.com/crafter-station/reporte-ve
   Mapea cortes de luz/agua y escasez de medicinas, comida, combustible, etc.
   - Consume la API pública GET /api/reports (JSON con lat/lng).
   - Caché en memoria con refresco automático (no toca la BD; es data de solo lectura).
   - Si la fuente falla, conserva la última copia buena (degradación elegante).
   ============================================================ */
'use strict';

const SOURCE_URL = process.env.REPORTES_URL || 'https://ve.crafter.run/api/reports';
const SOURCE = 've.crafter.run (reporte-ve)';
const TTL = 60 * 60 * 1000; // refresca como máximo cada 1 hora

// Etiquetas legibles por categoría (incluye las que reporte-ve manda en español).
const CATS = {
  electricity: 'Electricidad', water: 'Agua', medicine: 'Medicinas', food: 'Comida',
  fuel: 'Combustible', telecoms: 'Telecom', gas: 'Gas', 'Gas doméstico': 'Gas',
  'Recolección de basura': 'Basura', 'Transporte público': 'Transporte', other: 'Otro',
};

let _cache = [];
let _at = 0;
let _inflight = null;

function norm(r) {
  const lat = Number(r.lat != null ? r.lat : (r.latitude != null ? r.latitude : (r.location || {}).lat));
  const lng = Number(r.lng != null ? r.lng : (r.longitude != null ? r.longitude : (r.location || {}).lng));
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
  // descarta puntos fuera de Venezuela (la fuente a veces trae data de prueba)
  if (lat < 0.5 || lat > 12.5 || lng < -73.5 || lng > -59.5) return null;
  const categories = Array.isArray(r.categories) && r.categories.length ? r.categories : [r.category].filter(Boolean);
  return {
    id: r.id || '',
    category: r.category || categories[0] || 'other',
    categories,
    severity: r.severity || '',
    summary: ('' + (r.summary || '')).slice(0, 240),
    estado: r.estado || '',
    municipio: r.municipio || '',
    parroquia: r.parroquia || '',
    lat, lng,
    createdAt: r.createdAt || r.publishedAt || '',
  };
}

async function fetchNow() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'AyudaVE/1.0 (+ayudahumanitariavenezuela.com)', 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('reportes ' + res.status);
  const j = await res.json();
  const arr = Array.isArray(j) ? j : (j.data || j.reports || j.reportes || []);
  const out = arr.map(norm).filter(Boolean);
  if (out.length) { _cache = out; _at = Date.now(); } // solo reemplaza si llegó algo válido
  return _cache;
}

// Devuelve la caché; refresca en segundo plano si está vencida.
async function getReportes() {
  if (_cache.length && Date.now() - _at < TTL) return _cache;
  if (_inflight) return _inflight;
  _inflight = fetchNow()
    .catch(e => { console.warn('[reportes]', e.message); return _cache; })
    .finally(() => { _inflight = null; });
  // si no hay nada en caché aún, espera; si ya hay, devuelve lo viejo y refresca atrás
  return _cache.length ? _cache : _inflight;
}

function primeReportes() {
  getReportes().then(a => console.log('[reportes] ' + a.length + ' reportes de servicios cargados (' + SOURCE + ')')).catch(() => {});
  setInterval(() => { _at = 0; getReportes().catch(() => {}); }, TTL).unref();
}

module.exports = { getReportes, primeReportes, SOURCE, SOURCE_URL, CATS };

/* CLI: node import-reportes.js  → muestra cuántos reportes trae la fuente */
if (require.main === module) {
  fetchNow().then(a => { console.log(a.length + ' reportes'); console.log(JSON.stringify(a.slice(0, 2), null, 1)); }).catch(e => { console.error(e); process.exit(1); });
}
