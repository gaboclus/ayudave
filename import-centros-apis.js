/* ============================================================
   Importador de centros de acopio desde DOS APIs públicas:
     1) AcopioVE   — https://api.acopiove.org/v1/centros   (hub curado, CC-BY-4.0)
     2) ResponseGrid — https://api.responsegrid.app/emergencies/{id}/public/resources
   Unifica ambas en la tabla `centers` SIN duplicados:
     - dedup entre APIs y contra lo ya existente por cercanía (Haversine < 150 m)
       y/o similitud de nombre + ciudad.  AcopioVE tiene prioridad (es un hub ya curado).
     - upsert idempotente por id estable (acv-<uuid> / rg-<uuid>).
     - reconciliación SOLO de estas fuentes (no toca el sheet ni los centros de usuario).
     - si una API cae o devuelve muy poco, no se reconcilia (protección de datos).
   Uso CLI:  node import-centros-apis.js
   ============================================================ */
'use strict';
const { resolveEstado, inferType, parseContact, NEED_RULES, noAccent } = require('./import-acopio');

const ACV_BASE = process.env.ACOPIOVE_API || 'https://api.acopiove.org/v1';
const RG_BASE  = process.env.RESPONSEGRID_API || 'https://api.responsegrid.app';
const RG_EMERGENCY = process.env.RESPONSEGRID_EMERGENCY || 'terremoto-venezuela-2026';
const ACV_SOURCE = 'acopiove.org';
const RG_SOURCE  = 'responsegrid.app';
const API_SOURCES = [ACV_SOURCE, RG_SOURCE];
const DEDUP_METERS = 150;     // dos puntos a < 150 m con nombre parecido = el mismo centro
const MIN_OK = 20;            // si entre las dos APIs hay menos que esto, asumimos caída

// UA de navegador real: las APIs están tras Cloudflare y rechazan UAs "bot" desde IPs de datacenter (Cloud Run).
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchJson(url, ms = 20000) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'es,en;q=0.8', 'Referer': 'https://ayudahumanitariavenezuela.com/' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(url.split('?')[0] + ' -> ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}

/* ---------- helpers de dedup ---------- */
function haversine(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'y', 'centro', 'acopio', 'cc', 'av', 'calle']);
function nameTokens(s) {
  return new Set(noAccent(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !STOP.has(t)));
}
function nameSimilar(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.size || !B.size) return false;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  const jacc = inter / (A.size + B.size - inter);
  return inter >= 2 || jacc >= 0.5;                   // comparten >=2 palabras clave o 50% de solapamiento
}
function needsFromText(text) {
  const keys = [...new Set(NEED_RULES.filter(([re]) => re.test(text || '')).map(([, k]) => k))];
  return keys.map(k => ({ key: k, level: 'alta' }));
}
const isVE = c => { const v = noAccent(c || ''); return v === 'venezuela' || v === 've'; };
// Nombres de país canónicos (evita grupos duplicados tipo "USA" vs "Estados Unidos").
const PAIS_CANON = { 've': 'Venezuela', venezuela: 'Venezuela', usa: 'Estados Unidos', us: 'Estados Unidos', eeuu: 'Estados Unidos', 'united states': 'Estados Unidos', 'estados unidos': 'Estados Unidos', espana: 'España', 'spain': 'España' };
const canonPais = p => { if (!p) return ''; const k = noAccent(p); return PAIS_CANON[k] || p.trim(); };
// Resuelve agrupación: dentro de VE -> estado venezolano; fuera de VE -> el país (para la diáspora).
function resolveRegion(pais, ciudad) {
  pais = canonPais(pais);
  if (pais && !isVE(pais)) return { estado: pais, pais };                     // diáspora: agrupa por país
  const est = resolveEstado(ciudad);
  return { estado: est, pais: pais || (est ? 'Venezuela' : '') };
}

/* ---------- mapeo a modelo de centro de la app ---------- */
function baseCenter(id, name, source, source_url, nowMs, extra) {
  const data = Object.assign({
    id, name, type: inferType(name), status: 'verificado',
    estado: '', municipio: '', parroquia: '',
    address: '', reference: '', coords: null,
    needs: [], needsText: '',
    accepts: ['fisico'], notAccepts: [],
    horario: '', responsable: '', responsableApellido: '',
    whatsapp: '', phones: [], instagram: '', contacto: '',
    foto: '', crypto: [], inventory: [],
    stats: { reportadas: 0, confirmadas: 0, entregadas: 0, voluntarios: 0 }, updates: [],
    estadoOperativo: 'abierto', source, source_url, imported: true,
  }, extra || {});
  return { id, name, status: 'verificado', estado: data.estado, municipio: data.municipio, parroquia: '', distance: 0.5, created_at: nowMs, data };
}

function mapAcopio(c, nowMs) {
  if (!c || !c.name) return null;
  if (c.tipo && c.tipo !== 'acopio') return null;
  const ciudad = c.ciudad || '';
  const recibeArr = Array.isArray(c.recibe) ? c.recibe : [];
  const needsText = [recibeArr.join(', '), c.necesita_ahora].filter(Boolean).join(' · ');
  const ct = parseContact(c.contacto || '');
  const coords = (typeof c.lat === 'number' && typeof c.lng === 'number') ? { lat: c.lat, lng: c.lng } : null;
  const reg = resolveRegion(c.pais, ciudad);
  return baseCenter('acv-' + c.id, c.name, ACV_SOURCE, 'https://acopiove.org', nowMs, {
    estado: reg.estado, pais: reg.pais, municipio: ciudad, address: c.address || '', coords,
    needs: needsFromText(recibeArr.join(' ') + ' ' + (c.necesita_ahora || '')), needsText,
    horario: c.horario || '', responsable: c.responsable || '',
    whatsapp: ct.whatsapp, phones: ct.phones, instagram: ct.instagram, contacto: ct.contacto,
    estadoOperativo: c.estado || 'abierto', fuenteOriginal: c.fuente || '',
  });
}

const RG_TYPES = new Set(['collection_point', 'collection_and_delivery', 'warehouse']);
function mapResponseGrid(r, nowMs) {
  if (!r || !r.name || !RG_TYPES.has(r.type)) return null;
  const loc = r.location || {};
  const ciudad = r.city || '';
  const accepts = Array.isArray(r.accepts) ? r.accepts : [];
  const needsText = accepts.join(', ');
  const ct = parseContact(r.contact || '');
  const coords = (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') ? { lat: loc.latitude, lng: loc.longitude } : null;
  const op = r.publicStatus === 'saturated' ? 'lleno' : (r.publicStatus === 'closed' ? 'cerrado' : 'abierto');
  const reg = resolveRegion(r.country, ciudad);
  return baseCenter('rg-' + r.id, r.name, RG_SOURCE, 'https://responsegrid.app', nowMs, {
    estado: reg.estado, pais: reg.pais, municipio: ciudad, address: loc.address || '', coords,
    needs: needsFromText(accepts.join(' ') + ' ' + (r.description || '')), needsText,
    horario: r.schedule || '', responsable: r.manager || '',
    whatsapp: ct.whatsapp, phones: ct.phones, instagram: ct.instagram, contacto: ct.contacto || (r.contact || ''),
    estadoOperativo: op, fuenteOriginal: r.sourceName || '',
  });
}

/* ---------- descarga paginada ---------- */
async function fetchAcopio(log) {
  // AcopioVE topa en 500 por respuesta e ignora `page`. Para no perder cobertura, unimos dos
  // consultas por id: todos los países (diáspora) + Venezuela explícito (garantiza los ~398 VE).
  const seen = new Map();
  for (const qs of ['tipo=acopio&limit=600', 'tipo=acopio&pais=Venezuela&limit=2000']) {
    try {
      const j = await fetchJson(`${ACV_BASE}/centros?${qs}`);
      for (const c of (j && j.data) || []) if (c && c.id) seen.set(c.id, c);
    } catch (e) { log(`AcopioVE (${qs}) falló: ${e.message}`); }
  }
  const out = [...seen.values()];
  log(`AcopioVE: ${out.length} acopios (Venezuela + diáspora)`);
  return out;
}
// El endpoint de recursos requiere el UUID de la emergencia (no el slug); lo resolvemos.
async function resolveEmergencyId() {
  if (/^[0-9a-f-]{36}$/i.test(RG_EMERGENCY)) return RG_EMERGENCY;
  const j = await fetchJson(`${RG_BASE}/emergencies`);
  const list = Array.isArray(j) ? j : (j.items || j.data || []);
  const m = list.find(e => e.slug === RG_EMERGENCY || e.id === RG_EMERGENCY)
         || list.find(e => (e.country === 'VE' || e.country === 'Venezuela') && e.status === 'active');
  if (!m) throw new Error('emergencia no encontrada: ' + RG_EMERGENCY);
  return m.id;
}
async function fetchResponseGrid(log) {
  const eid = await resolveEmergencyId();
  const out = []; const limit = 100;
  for (let page = 1; page <= 30; page++) {
    const j = await fetchJson(`${RG_BASE}/emergencies/${eid}/public/resources?limit=${limit}&page=${page}`);
    const items = (j && j.items) || [];
    out.push(...items);
    const total = (j && j.total) || 0;
    if (items.length < limit || page * limit >= total) break;
  }
  log(`ResponseGrid: ${out.length} recursos (emergencia ${eid})`);
  return out;
}

/* ---------- dedup ---------- */
function isDup(cand, list) {
  const cc = cand.data.coords, cm = noAccent(cand.municipio || '');
  for (const ex of list) {
    const ec = ex.coords;
    if (cc && ec && haversine(cc, ec) < DEDUP_METERS && nameSimilar(cand.name, ex.name)) return true;
    if ((!cc || !ec) && cm && cm === noAccent(ex.municipio || '') && nameSimilar(cand.name, ex.name)) return true;
  }
  return false;
}

async function importCentrosApis(store, opts = {}) {
  const log = opts.log || (() => {});
  const nowMs = Date.now();

  // 1) descargar ambas fuentes (toleramos que una falle)
  let acv = [], rg = [];
  try { acv = await fetchAcopio(log); } catch (e) { log('AcopioVE falló: ' + e.message); }
  try { rg = await fetchResponseGrid(log); } catch (e) { log('ResponseGrid falló: ' + e.message); }

  // 2) mapear (AcopioVE primero: tiene prioridad por ser hub curado)
  const acvC = acv.map(c => mapAcopio(c, nowMs)).filter(Boolean);
  const rgC = rg.map(r => mapResponseGrid(r, nowMs)).filter(Boolean);

  // 3) dedup contra lo que ya existe de OTRAS fuentes (sheet/usuarios) — no duplicar lo ya mostrado
  const existing = (await store.all('SELECT id, name, estado, municipio, data FROM centers')).map(row => {
    let d = {}; try { d = JSON.parse(row.data); } catch {}
    return { id: row.id, name: row.name, municipio: row.municipio, coords: d.coords || null, source: d.source };
  });
  const existingOther = existing.filter(e => !API_SOURCES.includes(e.source));

  const accepted = []; const acceptedSlim = [];        // acepta evitando duplicados internos y contra otras fuentes
  const push = (c) => { accepted.push(c); acceptedSlim.push({ name: c.name, municipio: c.municipio, coords: c.data.coords }); };
  let skipAcv = 0, skipRg = 0;
  for (const c of acvC) {
    if (isDup(c, acceptedSlim) || isDup(c, existingOther)) { skipAcv++; continue; }
    push(c);
  }
  for (const c of rgC) {                                 // ResponseGrid solo si no está ya (AcopioVE lo agrega parcialmente)
    if (isDup(c, acceptedSlim) || isDup(c, existingOther)) { skipRg++; continue; }
    push(c);
  }
  log(`mapeados acv=${acvC.length} rg=${rgC.length} · aceptados=${accepted.length} (dup acv=${skipAcv}, rg=${skipRg})`);

  if (accepted.length < MIN_OK) {
    log(`solo ${accepted.length} centros (< ${MIN_OK}): abortando para no dañar datos`);
    return { ok: false, acopiove: acvC.length, responsegrid: rgC.length, accepted: accepted.length, reason: 'fuente_insuficiente' };
  }

  // 4) upsert idempotente
  for (const c of accepted) {
    await store.run(
      `INSERT INTO centers (id,name,status,estado,municipio,parroquia,distance,data,created_at) VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, status=excluded.status, estado=excluded.estado, municipio=excluded.municipio, parroquia=excluded.parroquia, distance=excluded.distance, data=excluded.data`,
      [c.id, c.name, c.status, c.estado, c.municipio, c.parroquia, c.distance, JSON.stringify(c.data), c.created_at]);
  }

  // 5) reconciliación SOLO de estas APIs (no toca el sheet ni centros de usuario)
  const keep = new Set(accepted.map(c => c.id));
  let deleted = 0;
  for (const row of await store.all('SELECT id, data FROM centers')) {
    if (keep.has(row.id)) continue;
    let d = {}; try { d = JSON.parse(row.data); } catch {}
    if (d && d.imported === true && !d.ownerId && API_SOURCES.includes(d.source)) {
      await store.run('DELETE FROM centers WHERE id=?', [row.id]); deleted++;
    }
  }
  log(`upsert=${accepted.length} borrados(obsoletos de APIs)=${deleted}`);
  return { ok: true, acopiove: acvC.length, responsegrid: rgC.length, accepted: accepted.length, skipped: skipAcv + skipRg, deleted };
}

module.exports = { importCentrosApis, mapAcopio, mapResponseGrid, haversine, nameSimilar, ACV_SOURCE, RG_SOURCE };

/* ---------------- CLI ---------------- */
if (require.main === module) {
  (async () => {
    const store = require('./store');
    await store.init();
    const t0 = Date.now();
    console.log(`[centros-apis] store=${store.kind}`);
    const res = await importCentrosApis(store, { log: m => console.log('[centros-apis]', m) });
    console.log(`[centros-apis] LISTO en ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(res));
    process.exit(res.ok ? 0 : 1);
  })().catch(e => { console.error('[centros-apis] ERROR', e); process.exit(1); });
}
