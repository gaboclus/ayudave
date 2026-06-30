/* ============================================================
   Catálogo MAESTRO de insumos (ReliefHub / ResponseGrid).
   Fuente: API pública https://api.crisis-logistics.org/api
     - GET /supplies    → catálogo (id, code INS-xxx, name, unit, notes, category)
     - GET /categories  → categorías (id, name)
   Caché en memoria con refresco automático (no toca la BD; solo lectura).
   Si la fuente falla, conserva la última copia buena (degradación elegante).
   La API está tras Cloudflare: se usa User-Agent de navegador.
   ============================================================ */
'use strict';

const API_BASE = process.env.SUPPLIES_API || 'https://api.crisis-logistics.org/api';
const SOURCE = 'crisis-logistics.org';
const ATTRIBUTION = 'Catálogo maestro de insumos — ReliefHub / ResponseGrid (crisis-logistics.org)';
const TTL = 12 * 60 * 60 * 1000;   // el catálogo es estable: refresca como máximo cada 12 h
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let _items = [];
let _cats = [];
let _at = 0;
let _inflight = null;

async function fetchJson(path) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'es,en;q=0.8', 'Referer': 'https://ayudahumanitariavenezuela.com/' },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status);
  return r.json();
}

function normItem(s) {
  return {
    id: s.id,
    code: ('' + (s.code || '')).slice(0, 20),
    name: ('' + (s.name || '')).slice(0, 160),
    unit: ('' + (s.unit || '')).slice(0, 24),
    notes: s.notes ? ('' + s.notes).slice(0, 240) : '',
    category: ('' + (s.category || 'Otros')).slice(0, 80),
  };
}

async function fetchNow() {
  const sup = await fetchJson('/supplies');
  const items = (Array.isArray(sup) ? sup : (sup.data || sup.items || [])).map(normItem);
  let cats = [];
  try {
    const cj = await fetchJson('/categories');
    cats = (Array.isArray(cj) ? cj : (cj.data || cj.items || [])).map(c => ('' + (c.name || c)).trim()).filter(Boolean);
  } catch { /* fallback: derivar categorías de los ítems */ }
  if (!cats.length) cats = [...new Set(items.map(i => i.category))];
  cats.sort((a, b) => a.localeCompare(b, 'es'));
  if (items.length) { _items = items; _cats = cats; _at = Date.now(); }   // solo reemplaza si llegó algo
  return { items: _items, categories: _cats };
}

// Devuelve la caché; refresca en segundo plano si está vencida.
async function getSupplies() {
  if (_items.length && Date.now() - _at < TTL) return { items: _items, categories: _cats };
  if (_inflight) return _inflight;
  _inflight = fetchNow().catch(e => { console.warn('[supplies]', e.message); return { items: _items, categories: _cats }; }).finally(() => { _inflight = null; });
  return _items.length ? { items: _items, categories: _cats } : _inflight;
}

function primeSupplies() {
  getSupplies().then(d => console.log('[supplies] ' + d.items.length + ' insumos · ' + d.categories.length + ' categorías (' + SOURCE + ')')).catch(() => {});
  setInterval(() => { _at = 0; getSupplies().catch(() => {}); }, TTL).unref();
}

function suppliesCount() { return _items.length; }   // síncrono, no dispara fetch

module.exports = { getSupplies, primeSupplies, suppliesCount, SOURCE, ATTRIBUTION, API_BASE };

/* CLI: node import-supplies.js */
if (require.main === module) {
  fetchNow().then(d => {
    const by = {}; for (const i of d.items) by[i.category] = (by[i.category] || 0) + 1;
    console.log(d.items.length + ' insumos · ' + d.categories.length + ' categorías');
    for (const c of d.categories) console.log('  ' + (by[c] || 0) + '  ' + c);
    console.log(JSON.stringify(d.items[0], null, 1));
  }).catch(e => { console.error(e); process.exit(1); });
}
