/* Empuja las personas importadas (SQLite local) → endpoint /api/admin/import-batch de prod.
   Se ejecuta DESDE LA LAPTOP (que sí alcanza la fuente / ya tiene los datos),
   evitando que Cloud Run scrapee una fuente que bloquea las IPs de datacenter.
   Uso: node scripts/push-prod.js
   Lee el token de /tmp/.ayudave_imptok y la URL de prod de PURL (env) o el default. */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PURL = (process.env.PURL || 'https://ayudave-895731528283.us-central1.run.app').replace(/\/+$/, '');
const TOKEN = fs.readFileSync('/tmp/.ayudave_imptok', 'utf8').trim();
const CHUNK = Number(process.env.CHUNK || 2000);

const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'ayudave.db'));
const rows = db.prepare(
  "SELECT status,nombre,estado,municipio,data,created_at FROM persons WHERE data LIKE '%\"source\":\"desaparecidosterremotovenezuela.com\"%' ORDER BY id"
).all();

async function post(payload) {
  const r = await fetch(`${PURL}/api/admin/import-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Import-Token': TOKEN },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

(async () => {
  console.log(`Local: ${rows.length} filas a empujar a ${PURL} en lotes de ${CHUNK}`);
  const t0 = Date.now();
  let sent = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map(r => ({
      status: r.status, nombre: r.nombre, estado: r.estado, municipio: r.municipio,
      data: r.data, created_at: Number(r.created_at),
    }));
    const reset = i === 0; // el primer lote limpia los parciales previos del import server-side
    let res, attempts = 0;
    while (true) {
      try { res = await post({ reset, rows: chunk }); break; }
      catch (e) { if (++attempts >= 4) throw e; console.log(`  reintento lote @${i} (${e.message})`); await new Promise(r => setTimeout(r, 1500 * attempts)); }
    }
    sent += chunk.length;
    console.log(`lote @${i}: +${chunk.length}${reset ? ` (reset borró ${res.deleted})` : ''} → total prod ${res.total} (${sent}/${rows.length} enviadas)`);
  }
  console.log(`LISTO en ${((Date.now() - t0) / 1000).toFixed(1)}s · ${sent} enviadas`);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
