/* ============================================================
   Importador: desaparecidosterremotovenezuela.com → tabla `persons`.
   Réplica del registro ciudadano de desaparecidos del sismo.
   Mapea: estado "sin-contacto" → desaparecido, "localizado" → encontrado.
   Idempotente por `sourceId` (no duplica al re-ejecutar).

   Uso como módulo:  const { importDtvPersons } = require('./import-dtv');
                     await importDtvPersons(store, { max, pageSize, log });
   Uso como CLI:     node import-dtv.js [--max N] [--page-size 100]
                     (usa ./store; SQLite local salvo que haya DATABASE_URL)
   ============================================================ */
'use strict';

const DTV_API = (process.env.DTV_API || 'https://desaparecidos-terremoto-api.theempire.tech/api').replace(/\/+$/, '');
const now = () => Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { searchFields } = require('./text-normalize');
const { ensurePersonSearchColumns } = require('./person-search');

/* Salida por proxy (necesario porque la fuente está geo-bloqueada a Venezuela).
   Si DTV_PROXY está definido (http://user:pass@host:port), enrutamos por undici;
   si no, fetch global directo. Carga undici de forma perezosa para no exigirlo sin proxy. */
let _undici = null, _agent = null, _proxyWarned = false;
function pickFetch() {
  const px = process.env.DTV_PROXY;
  if (!px) return { fetch: globalThis.fetch, opts: {} };
  try {
    if (!_undici) { _undici = require('undici'); _agent = new _undici.ProxyAgent(px); }
    return { fetch: _undici.fetch, opts: { dispatcher: _agent } };
  } catch (e) {
    if (!_proxyWarned) { console.error('[dtv] DTV_PROXY definido pero no se pudo cargar undici:', e.message); _proxyWarned = true; }
    return { fetch: globalThis.fetch, opts: {} };
  }
}

async function dtvFetch(url, tries = 6) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const { fetch: doFetch, opts } = pickFetch();
      const r = await doFetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'AyudaVE-importer/1.0 (+humanitario)' }, ...opts });
      if (r.ok) return await r.json();
      if (r.status === 429 || r.status >= 500) { lastErr = new Error('HTTP ' + r.status); await sleep(800 * (i + 1)); continue; }
      throw new Error('HTTP ' + r.status);
    } catch (e) { lastErr = e; await sleep(800 * (i + 1)); }
  }
  throw lastErr || new Error('sin respuesta de ' + url); // nunca devolver undefined
}

function fmtFecha(f) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : (f ? String(f) : ''); }

function mapDtvPerson(src) {
  const status = src.estado === 'localizado' ? 'encontrado' : 'desaparecido';
  const data = {
    sourceId: src.id, source: 'desaparecidosterremotovenezuela.com', sourceUpdatedAt: Number(src.updatedAt) || null,
    status, nombre: (src.nombre || '').trim(), apellido: '',
    edad: src.edad ?? '', sexo: '', estado: '', municipio: '', parroquia: '',
    lugar: src.ubicacion || '', fecha: fmtFecha(src.fecha), descripcion: src.descripcion || '',
    contactoNombre: '', contactoTel: src.contacto || '', relacion: '', foto: src.foto || null,
  };
  if (status === 'encontrado') data.localizado = { por: src.localizadoPor || '', contacto: src.localizadoContacto || '', relacion: src.localizadoRelacion || '', nota: src.localizadoNota || '' };
  return { status, nombre: data.nombre || 'Sin nombre', estado: '', municipio: '', data: JSON.stringify(data), created_at: Number(src.createdAt) || now(), sourceId: src.id };
}

async function insertPersonsBatch(store, rows) {
  if (!rows.length) return;
  const cols = ['status', 'nombre', 'estado', 'municipio', 'data', 'created_at', 'name_norm', 'name_sig'];
  const tuples = rows.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
  const params = [];
  for (const r of rows) {
    const { name_norm, name_sig } = searchFields(r.nombre);
    params.push(r.status, r.nombre, r.estado, r.municipio, r.data, r.created_at, name_norm, name_sig);
  }
  await store.run(`INSERT INTO persons (${cols.join(',')}) VALUES ${tuples}`, params);
}

async function importDtvPersons(store, { max = Infinity, pageSize = 100, log = () => {} } = {}) {
  await ensurePersonSearchColumns(store, { log });
  // Idempotencia: junta los sourceId ya presentes para no reinsertar.
  const existing = new Set();
  for (const r of await store.all('SELECT data FROM persons')) {
    try { const d = JSON.parse(r.data); if (d && d.sourceId) existing.add(d.sourceId); } catch {}
  }
  let page = 1, totalPages = 1, inserted = 0, skipped = 0, seen = 0, totalSource = 0, buffer = [];
  const flush = async () => { if (buffer.length) { const n = buffer.length; await insertPersonsBatch(store, buffer); inserted += n; buffer = []; } };
  let stoppedEarly = false;
  do {
    let res;
    try {
      res = await dtvFetch(`${DTV_API}/personas?page=${page}&pageSize=${pageSize}`);
    } catch (e) {
      // Fallo sostenido de la fuente: paramos limpio y conservamos lo insertado.
      // Re-ejecutar el import es idempotente (salta sourceId ya presentes) y reanuda.
      await flush();
      log(`página ${page} falló tras reintentos (${e.message}); detención segura — reanudable`);
      stoppedEarly = true;
      break;
    }
    totalPages = res.totalPages || 1; totalSource = res.total || totalSource;
    for (const src of res.items || []) {
      seen++;
      if (!src || !src.id || existing.has(src.id)) { skipped++; continue; }
      existing.add(src.id); buffer.push(mapDtvPerson(src));
      if (buffer.length >= 500) await flush();
      if (inserted + buffer.length >= max) break;
    }
    log(`página ${page}/${totalPages} · insertadas ${inserted + buffer.length} · ya existían ${skipped}`);
    if (inserted + buffer.length >= max) break;
    page++; await sleep(200);
  } while (page <= totalPages);
  await flush();
  return { inserted, skipped, seen, totalSource, pages: page - 1, complete: !stoppedEarly, source: DTV_API };
}

/* ---------------- Refresco incremental (columna source_id + upsert) ---------------- */

// Migración idempotente: añade `source_id` indexado y rellena los ya existentes.
async function ensurePersonsSourceId(store) {
  try { await store.run('ALTER TABLE persons ADD COLUMN source_id TEXT'); } catch (e) { /* ya existe */ }
  const backfill = store.kind === 'pg'
    ? "UPDATE persons SET source_id = (data::jsonb->>'sourceId') WHERE source_id IS NULL AND data LIKE '%\"sourceId\":%'"
    : "UPDATE persons SET source_id = json_extract(data,'$.sourceId') WHERE source_id IS NULL AND data LIKE '%\"sourceId\":%'";
  try { await store.run(backfill); } catch (e) { /* json_extract/jsonb no disponible: se ignora */ }
  // UNIQUE permite múltiples NULL en SQLite y Postgres → no choca con filas sin origen.
  try { await store.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_source_id ON persons(source_id)'); } catch (e) {}
}

// ¿Cambió el contenido relevante respecto a lo guardado?
function personChanged(storedData, mapped) {
  let s; try { s = JSON.parse(storedData); } catch { return true; }
  const m = JSON.parse(mapped.data);
  if (s.sourceUpdatedAt && m.sourceUpdatedAt) return s.sourceUpdatedAt !== m.sourceUpdatedAt;
  const keys = ['status', 'nombre', 'lugar', 'fecha', 'descripcion', 'contactoTel', 'foto', 'edad'];
  if (keys.some(k => (s[k] ?? '') !== (m[k] ?? ''))) return true;
  return JSON.stringify(s.localizado || null) !== JSON.stringify(m.localizado || null);
}

// Inserta filas nuevas y actualiza cambiadas en un solo statement (ON CONFLICT por source_id).
async function upsertPersons(store, rows) {
  if (!rows.length) return;
  const cols = ['source_id', 'status', 'nombre', 'estado', 'municipio', 'data', 'created_at', 'name_norm', 'name_sig'];
  const tuples = rows.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
  const params = [];
  for (const r of rows) {
    const { name_norm, name_sig } = searchFields(r.nombre);
    params.push(r.sourceId, r.status, r.nombre, r.estado, r.municipio, r.data, r.created_at, name_norm, name_sig);
  }
  const sql = `INSERT INTO persons (${cols.join(',')}) VALUES ${tuples}
    ON CONFLICT(source_id) DO UPDATE SET status=excluded.status, nombre=excluded.nombre, data=excluded.data, name_norm=excluded.name_norm, name_sig=excluded.name_sig`;
  await store.run(sql, params);
}

// Refresco incremental: recorre las páginas más nuevas (orden updatedAt desc en la fuente)
// hasta tocar una página ya sincronizada (early-stop) o el tope maxPages. Suave con la fuente.
async function refreshDtvPersons(store, { pageSize = 100, maxPages = 60, stopWhenClean = true, log = () => {} } = {}) {
  await ensurePersonsSourceId(store);
  await ensurePersonSearchColumns(store, { log });
  let page = 1, inserted = 0, updated = 0, unchanged = 0, scanned = 0, stoppedEarly = false;
  for (; page <= maxPages; page++) {
    let res;
    try { res = await dtvFetch(`${DTV_API}/personas?page=${page}&pageSize=${pageSize}`); }
    catch (e) { log(`página ${page} falló (${e.message}); detención segura — reanudable`); stoppedEarly = true; break; }
    const items = res.items || [];
    if (!items.length) break;
    // map + dedupe por sourceId dentro del lote (la fuente puede repetir entre páginas)
    const mappedById = new Map();
    for (const src of items) { if (src && src.id) mappedById.set(src.id, mapDtvPerson(src)); }
    const ids = [...mappedById.keys()];
    scanned += ids.length;
    // estado actual de esos ids en la BD
    const existing = new Map();
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      for (const r of await store.all(`SELECT source_id, data FROM persons WHERE source_id IN (${ph})`, ids)) existing.set(r.source_id, r.data);
    }
    const toUpsert = [];
    let pageNew = 0, pageChanged = 0;
    for (const [id, m] of mappedById) {
      if (!existing.has(id)) { pageNew++; toUpsert.push(m); }
      else if (personChanged(existing.get(id), m)) { pageChanged++; toUpsert.push(m); }
      else unchanged++;
    }
    if (toUpsert.length) await upsertPersons(store, toUpsert);
    inserted += pageNew; updated += pageChanged;
    log(`página ${page}: nuevos ${pageNew}, actualizados ${pageChanged}, sin cambios ${ids.length - pageNew - pageChanged}`);
    if (stopWhenClean && pageNew === 0 && pageChanged === 0) { page++; break; } // territorio ya sincronizado
    await sleep(400);
  }
  const total = Number((await store.get('SELECT COUNT(*) c FROM persons')).c) || 0;
  return { inserted, updated, unchanged, scanned, pagesScanned: page - 1, stoppedEarly, total, source: DTV_API };
}

module.exports = { importDtvPersons, mapDtvPerson, insertPersonsBatch, upsertPersons, refreshDtvPersons, ensurePersonsSourceId, DTV_API };

/* ---------------- CLI ---------------- */
if (require.main === module) {
  (async () => {
    const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
    const store = require('./store');
    await store.init();
    const max = Number(arg('--max', Infinity)) || Infinity;
    const pageSize = Math.min(Number(arg('--page-size', 100)) || 100, 100);
    console.log(`[import] origen=${DTV_API} store=${store.kind} max=${max}`);
    const t0 = Date.now();
    const res = await importDtvPersons(store, { max, pageSize, log: m => console.log('[import]', m) });
    console.log(`[import] LISTO en ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(res));
    process.exit(0);
  })().catch(e => { console.error('[import] ERROR', e); process.exit(1); });
}
