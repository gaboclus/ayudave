/* ============================================================
   Auditoría / depuración de reportes duplicados de
   desaparecidosterremotovenezuela.com (tabla `persons`).

   Detecta duplicados "por semejanza": mismo teléfono, mismo nombre
   normalizado (acentos/mayúsc/orden de palabras) o nombres muy
   parecidos (typos) con edad/zona compatible. Agrupa con union-find,
   elige un registro canónico por grupo y marca el resto en la columna
   `dup_of` (= source_id del canónico). El listado público oculta los
   `dup_of != NULL`; la auditoría reporta los números reales.

   Módulo:  const { auditPersons, getAuditSummary, ensureAuditColumns } = require('./audit-dtv');
   CLI:     node audit-dtv.js            (solo audita, no escribe)
            node audit-dtv.js --apply    (marca dup_of + guarda timestamp)
   ============================================================ */
'use strict';

const SOURCE = 'desaparecidosterremotovenezuela.com';
const now = () => Date.now();

/* ---------- normalización ---------- */
const stripAccents = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normName = s => stripAccents(String(s || '').toLowerCase()).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const nameTokens = s => normName(s).split(' ').filter(Boolean);
// clave de nombre = palabras ordenadas (insensible al orden); null si es muy pobre para bloquear
function fullNameKey(s) {
  const t = nameTokens(s);
  if (!t.length) return null;
  const key = [...t].sort().join(' ');
  // evita fusionar por una sola palabra corta y común (p.ej. "maria")
  if (t.length < 2 && key.length < 6) return null;
  return key;
}
// firma para bloque difuso: primeras 3 letras de cada palabra, ordenadas
function nameSignature(s) {
  const t = nameTokens(s).map(w => w.slice(0, 3)).sort();
  return t.length ? t.join('') : null;
}
function phoneKey(s) {
  const d = String(s || '').replace(/\D/g, '').replace(/^58/, '').replace(/^0+/, '');
  return d.length >= 9 ? d.slice(-10) : '';
}
const locTokens = s => new Set(normName(s).split(' ').filter(w => w.length >= 4));

/* ---------- similitud (Levenshtein normalizado) ---------- */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1); for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
function similarity(a, b) {
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 1;
}

/* ---------- union-find ---------- */
function makeUF(n) {
  const p = new Array(n); for (let i = 0; i < n; i++) p[i] = i;
  const find = x => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) p[a] = b; };
  return { find, union };
}

/* ---------- migración: columna dup_of ---------- */
async function ensureAuditColumns(store) {
  try { await store.run('ALTER TABLE persons ADD COLUMN dup_of TEXT'); } catch (e) { /* ya existe */ }
  try { await store.run('CREATE INDEX IF NOT EXISTS idx_persons_dup_of ON persons(dup_of)'); } catch (e) {}
}

/* ---------- núcleo de la auditoría ---------- */
async function auditPersons(store, { apply = false, log = () => {} } = {}) {
  await ensureAuditColumns(store);
  const rows = await store.all('SELECT id, source_id, created_at, data FROM persons WHERE source_id IS NOT NULL');
  const recs = [];
  for (const r of rows) {
    let d; try { d = JSON.parse(r.data); } catch { continue; }
    recs.push({
      id: r.id, sourceId: r.source_id, createdAt: Number(r.created_at) || 0,
      nombre: d.nombre || '', edad: Number(d.edad) || null, foto: d.foto || null,
      desc: d.descripcion || '', tel: d.contactoTel || '', lugar: d.lugar || '',
      nkey: fullNameKey(d.nombre), nsig: nameSignature(d.nombre), pkey: phoneKey(d.contactoTel),
      nnorm: normName(d.nombre),
    });
  }
  const N = recs.length;
  const uf = makeUF(N);

  // Unir por nombre-clave exacto, PERO sin fusionar si las edades difieren
  // claramente (>10 años): mismo nombre + edades muy distintas = personas
  // distintas (ej. dos "Carlos González" de 78 y 45). Edad ausente = compatible.
  // OJO: NO unimos por teléfono: el teléfono es del REPORTANTE, y un mismo
  // reportante puede reportar a varias personas distintas. El teléfono solo
  // corrobora en el bloque difuso (typos del mismo nombre).
  const ageCompatible = (a, b) => !(a.edad && b.edad) || Math.abs(a.edad - b.edad) <= 10;
  const byKey = (sel) => { const m = new Map(); recs.forEach((r, i) => { const k = sel(r); if (k) (m.get(k) || m.set(k, []).get(k)).push(i); }); return m; };
  for (const [, idx] of byKey(r => r.nkey)) {
    if (idx.length < 2) continue;
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      if (ageCompatible(recs[idx[a]], recs[idx[b]])) uf.union(idx[a], idx[b]);
    }
  }

  // Bloque difuso por firma de nombre → unir typos con corroboración (edad/zona)
  let fuzzy = 0;
  for (const [, idx] of byKey(r => r.nsig)) {
    if (idx.length < 2 || idx.length > 250) continue; // bloques enormes ya cubiertos por exactos
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      const ra = recs[idx[a]], rb = recs[idx[b]];
      if (uf.find(idx[a]) === uf.find(idx[b])) continue;
      if (similarity(ra.nnorm, rb.nnorm) < 0.9) continue;
      if (!ageCompatible(ra, rb)) continue; // edades muy distintas = persona distinta
      const ageOk = ra.edad && rb.edad && Math.abs(ra.edad - rb.edad) <= 2;
      const sameTel = ra.pkey && ra.pkey === rb.pkey;
      let sharedLoc = false; if (ra.lugar && rb.lugar) { const la = locTokens(ra.lugar); for (const t of locTokens(rb.lugar)) if (la.has(t)) { sharedLoc = true; break; } }
      if (ageOk || sameTel || sharedLoc) { uf.union(idx[a], idx[b]); fuzzy++; }
    }
  }

  // Agrupar
  const groups = new Map();
  for (let i = 0; i < N; i++) { const root = uf.find(i); (groups.get(root) || groups.set(root, []).get(root)).push(i); }

  const score = r => (r.foto ? 2 : 0) + (r.desc ? 1 : 0) + (r.tel ? 1 : 0) + (r.edad ? 1 : 0) + (r.lugar ? 1 : 0);
  const dupOf = new Map(); // sourceId duplicado -> sourceId canónico
  let dupGroups = 0, dupRecords = 0;
  const examples = [];
  for (const [, idx] of groups) {
    if (idx.length < 2) continue;
    dupGroups++;
    // canónico = más completo; desempate por más antiguo (id menor)
    let canon = idx[0];
    for (const i of idx) { const s = score(recs[i]) - score(recs[canon]); if (s > 0 || (s === 0 && recs[i].id < recs[canon].id)) canon = i; }
    for (const i of idx) { if (i !== canon) { dupOf.set(recs[i].sourceId, recs[canon].sourceId); dupRecords++; } }
    if (examples.length < 12) examples.push({ nombre: recs[canon].nombre || '(sin nombre)', tel: recs[canon].tel || '', copias: idx.length });
  }
  examples.sort((a, b) => b.copias - a.copias);

  const total = N;
  const unicos = total - dupRecords;
  const summary = {
    source: SOURCE, total, duplicados: dupRecords, unicos, grupos: dupGroups,
    porcentajeDuplicados: total ? +(100 * dupRecords / total).toFixed(1) : 0,
    fuzzyMerges: fuzzy, ejemplos: examples.slice(0, 8),
  };
  log(`total ${total} · duplicados ${dupRecords} (${summary.porcentajeDuplicados}%) · únicos ${unicos} · grupos ${dupGroups} · typos unidos ${fuzzy}`);

  if (apply) {
    await store.run('UPDATE persons SET dup_of = NULL WHERE dup_of IS NOT NULL');
    const entries = [...dupOf.entries()]; // [dupSourceId, canonSourceId]
    for (let i = 0; i < entries.length; i += 500) {
      const batch = entries.slice(i, i + 500);
      // CASE WHEN ... para actualizar muchas filas en un statement
      const ph = batch.map(() => '?').join(',');
      const cases = batch.map(() => 'WHEN source_id = ? THEN ?').join(' ');
      const params = [];
      for (const [dup, canon] of batch) params.push(dup, canon); // para el CASE
      for (const [dup] of batch) params.push(dup);                // para el IN
      await store.run(`UPDATE persons SET dup_of = CASE ${cases} END WHERE source_id IN (${ph})`, params);
    }
    await store.run('INSERT INTO metrics(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', ['audit_at', now()]);
    log(`aplicado: ${dupRecords} registros marcados como duplicados`);
  }
  return summary;
}

/* ---------- resumen en vivo (para el endpoint /api/audit) ---------- */
async function getAuditSummary(store) {
  await ensureAuditColumns(store);
  const n = async (w) => Number((await store.get(`SELECT COUNT(*) c FROM persons WHERE source_id IS NOT NULL${w ? ' AND ' + w : ''}`)).c) || 0;
  const total = await n();
  const duplicados = await n('dup_of IS NOT NULL');
  const grupos = Number((await store.get('SELECT COUNT(*) c FROM (SELECT dup_of FROM persons WHERE dup_of IS NOT NULL GROUP BY dup_of) t')).c) || 0;
  const at = await store.get("SELECT v FROM metrics WHERE k='audit_at'");
  // ejemplos: grupos con más copias
  const top = await store.all('SELECT dup_of, COUNT(*) c FROM persons WHERE dup_of IS NOT NULL GROUP BY dup_of ORDER BY c DESC LIMIT 8');
  const ejemplos = [];
  for (const t of top) {
    const r = await store.get('SELECT data FROM persons WHERE source_id=?', [t.dup_of]);
    let nombre = '(sin nombre)'; try { nombre = JSON.parse(r.data).nombre || nombre; } catch {}
    ejemplos.push({ nombre, copias: Number(t.c) + 1 }); // +1 por el canónico
  }
  return {
    source: SOURCE, total, duplicados, unicos: total - duplicados, grupos,
    porcentajeDuplicados: total ? +(100 * duplicados / total).toFixed(1) : 0,
    ultimaAuditoria: at ? Number(at.v) : null, ejemplos,
  };
}

module.exports = { auditPersons, getAuditSummary, ensureAuditColumns, normName, phoneKey };

/* ---------------- CLI ---------------- */
if (require.main === module) {
  (async () => {
    const store = require('./store');
    await store.init();
    const apply = process.argv.includes('--apply');
    console.log(`[audit] store=${store.kind} apply=${apply}`);
    const t0 = Date.now();
    const res = await auditPersons(store, { apply, log: m => console.log('[audit]', m) });
    console.log(`[audit] LISTO en ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(res, null, 1));
    process.exit(0);
  })().catch(e => { console.error('[audit] ERROR', e); process.exit(1); });
}
