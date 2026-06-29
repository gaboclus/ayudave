/* Búsqueda tolerante de personas (tabla `persons`): columnas name_norm/name_sig
   portables (SQLite/Postgres, sin extensiones de motor) + ranking por relevancia.
   Normalización compartida con la auditoría vía text-normalize.js. */
'use strict';

const { searchFields, nameTokens, nameMatchRank } = require('./text-normalize');

// migración idempotente: añade name_norm/name_sig + índices y rellena lo existente
async function ensurePersonSearchColumns(store, { log = () => {} } = {}) {
  try { await store.run('ALTER TABLE persons ADD COLUMN name_norm TEXT'); } catch (e) { /* ya existe */ }
  try { await store.run('ALTER TABLE persons ADD COLUMN name_sig TEXT'); } catch (e) { /* ya existe */ }
  try { await store.run('CREATE INDEX IF NOT EXISTS idx_persons_name_norm ON persons(name_norm)'); } catch (e) {}
  try { await store.run('CREATE INDEX IF NOT EXISTS idx_persons_name_sig ON persons(name_sig)'); } catch (e) {}
  await backfillPersonSearch(store, { log });
}

// rellena name_norm/name_sig donde sea NULL, en lotes (idempotente)
async function backfillPersonSearch(store, { batch = 500, log = () => {} } = {}) {
  let done = 0;
  for (;;) {
    const rows = await store.all('SELECT id, nombre FROM persons WHERE name_norm IS NULL LIMIT ?', [batch]);
    if (!rows.length) break;
    const whenN = [], whenS = [], pN = [], pS = [], ids = [];
    for (const r of rows) {
      const { name_norm, name_sig } = searchFields(r.nombre);
      whenN.push('WHEN ? THEN ?'); pN.push(r.id, name_norm);
      whenS.push('WHEN ? THEN ?'); pS.push(r.id, name_sig);
      ids.push(r.id);
    }
    const ph = ids.map(() => '?').join(',');
    await store.run(
      `UPDATE persons SET name_norm = CASE id ${whenN.join(' ')} END, name_sig = CASE id ${whenS.join(' ')} END WHERE id IN (${ph})`,
      [...pN, ...pS, ...ids],
    );
    done += rows.length;
    if (rows.length < batch) break;
  }
  if (done) log(`backfill name_norm/name_sig: ${done} filas`);
  return done;
}

// ordena por relevancia; descarta candidatos de firma sin coincidencia real, pero
// conserva (al final) los que solo casan por subcadena en `data` (compatibilidad)
function rankPersons(rows, qnorm, rawLower) {
  const qt = nameTokens(qnorm);
  const out = [];
  for (const r of rows) {
    let rank = nameMatchRank(r.name_norm || '', qnorm, qt);
    if (rank === 5) {
      if (rawLower && String(r.data || '').toLowerCase().includes(rawLower)) rank = 4;
      else continue;
    }
    out.push({ r, rank });
  }
  out.sort((a, b) => a.rank - b.rank || (b.r.id - a.r.id)); // desempate: más reciente primero
  return out.map(x => x.r);
}

module.exports = { ensurePersonSearchColumns, backfillPersonSearch, rankPersons };
