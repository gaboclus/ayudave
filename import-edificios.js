/* ============================================================
   Importador de EDIFICIOS AFECTADOS desde la API pública
   terremotovenezuela.com (gateway LoopBack).
   - API documentada: https://api.terremotovenezuela.com/explorer
   - GET /api/v1/edificios (paginado: page, limit) con lat/lng, nivel de
     daño, estado, foto y notas.
   - Caché en memoria con refresco automático (no toca la BD; solo lectura).
   - Si la fuente falla, conserva la última copia buena (degradación elegante).
   PRIVACIDAD: se publica info estructural pública (nombre/dirección/daño/foto/
   notas) + una BANDERA si hay personas atrapadas/desaparecidas reportadas;
   NO se vuelcan nombres de atrapados ni notas de víctimas.
   ============================================================ */
'use strict';

const API_BASE = process.env.EDIF_API || 'https://api.terremotovenezuela.com/api/v1';
const SOURCE = 'terremotovenezuela.com';
const TTL = 60 * 60 * 1000;       // refresca como máximo cada 1 hora
const MAX_PAGES = 40;             // tope de seguridad (≈4000 edificios)

let _cache = [];
let _at = 0;
let _inflight = null;

function norm(e) {
  const lat = Number(e.lat), lng = Number(e.lng);
  const hasLL = isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)
    && lat > 0.5 && lat < 12.5 && lng > -73.5 && lng < -59.5;
  return {
    id: e.id || '',
    name: ('' + (e.name || 'Edificio')).slice(0, 160),
    address: ('' + (e.address || '')).slice(0, 220),
    city: e.city || '',
    zone: e.zone || '',
    lat: hasLL ? lat : null,
    lng: hasLL ? lng : null,
    damage: (e.damage_level || '').toLowerCase(),     // parcial | severo | total
    status: (e.status || '').toLowerCase(),           // verificado | en_revision | ...
    photo: e.main_photo_url || '',
    photos: Array.isArray(e.media_urls) ? e.media_urls.slice(0, 8) : [],
    notes: ('' + (e.notes || '')).slice(0, 400),
    source: e.general_source || '',
    missing: !!e.has_missing_persons,                 // bandera (no nombres)
    evaluated: !!e.is_technically_evaluated,
    updatedAt: e.last_updated_at || e.updated_at || '',
  };
}

async function fetchNow() {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetch(`${API_BASE}/edificios?page=${page}&limit=100`, {
      headers: { 'User-Agent': 'AyudaVE/1.0 (+ayudahumanitariavenezuela.com)', 'Accept': 'application/json' },
    });
    if (!r.ok) throw new Error('edificios ' + r.status);
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j.data || j.edificios || j.items || []);
    if (!arr.length) break;
    out.push(...arr.map(norm));
    if (arr.length < 100) break;
  }
  if (out.length) { _cache = out; _at = Date.now(); }   // solo reemplaza si llegó algo
  return _cache;
}

// Devuelve la caché; refresca en segundo plano si está vencida.
async function getEdificios() {
  if (_cache.length && Date.now() - _at < TTL) return _cache;
  if (_inflight) return _inflight;
  _inflight = fetchNow().catch(e => { console.warn('[edificios]', e.message); return _cache; }).finally(() => { _inflight = null; });
  return _cache.length ? _cache : _inflight;
}

function primeEdificios() {
  getEdificios().then(a => console.log('[edificios] ' + a.length + ' edificios afectados cargados (' + SOURCE + ')')).catch(() => {});
  setInterval(() => { _at = 0; getEdificios().catch(() => {}); }, TTL).unref();
}

function edificiosCount() { return _cache.length; }   // síncrono, no dispara fetch (para /api/metrics)

module.exports = { getEdificios, primeEdificios, edificiosCount, SOURCE, API_BASE };

/* CLI: node import-edificios.js */
if (require.main === module) {
  fetchNow().then(a => {
    const by = {}; for (const e of a) by[e.damage || '?'] = (by[e.damage || '?'] || 0) + 1;
    console.log(a.length + ' edificios · por daño: ' + JSON.stringify(by) + ' · con GPS: ' + a.filter(e => e.lat).length);
    console.log(JSON.stringify(a[0], null, 1));
  }).catch(e => { console.error(e); process.exit(1); });
}
