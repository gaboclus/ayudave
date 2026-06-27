/* Importa TODA la data de desaparecidosterremotovenezuela.com a nuestra prod, SIN duplicados.
   - Lee la fuente desde esta máquina (debe haber VPN que NO esté bloqueada por su CloudFront).
   - Sube a prod por el endpoint /api/admin/import-batch (con reset por origen → reemplaza el
     dataset de la fuente; conserva las personas reportadas dentro de la app).
   Uso: node importar-fuente.js            (prueba: node importar-fuente.js --test) */
'use strict';
const fs = require('fs');
const { mapDtvPerson, DTV_API } = require('./import-dtv');

const TOKEN = (process.env.IMP_TOKEN || (fs.existsSync('/tmp/imp_token.txt') ? fs.readFileSync('/tmp/imp_token.txt', 'utf8').trim() : '')).trim();
const PROD = process.env.PROD_URL || 'https://ayudahumanitariavenezuela.com';
const TEST = process.argv.includes('--test');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const HDRS = {
  'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'es-VE,es;q=0.9',
  'Origin': 'https://desaparecidosterremotovenezuela.com', 'Referer': 'https://desaparecidosterremotovenezuela.com/',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(url, { headers: HDRS }); if (r.ok) return r.json(); if (r.status === 403) throw new Error('403 (la VPN sigue bloqueada por la fuente)'); await sleep(800 * (i + 1)); }
    catch (e) { if (String(e.message).includes('403')) throw e; await sleep(800 * (i + 1)); }
  }
  throw new Error('sin respuesta de ' + url);
}

(async () => {
  if (!TOKEN) { console.error('Falta IMP_TOKEN (o /tmp/imp_token.txt).'); process.exit(1); }
  // 0) prueba de alcance
  const probe = await getJSON(`${DTV_API}/personas?page=1&pageSize=2`);
  console.log(`✓ Fuente alcanzable. total=${probe.total} totalPages=${probe.totalPages}`);
  if (TEST) { console.log('Modo --test: solo verifiqué el acceso. Quita --test para importar.'); process.exit(0); }

  // 1) bajar TODAS las páginas, dedup por id
  const byId = new Map();
  let page = 1, totalPages = probe.totalPages || 1;
  do {
    const res = await getJSON(`${DTV_API}/personas?page=${page}&pageSize=100`);
    totalPages = res.totalPages || totalPages;
    for (const s of res.items || []) if (s && s.id) byId.set(s.id, s);
    if (page % 10 === 0 || page === totalPages) console.log(`  fuente ${page}/${totalPages} · únicos ${byId.size}`);
    page++; await sleep(150);
  } while (page <= totalPages);
  const rows = [...byId.values()].map(mapDtvPerson);
  console.log(`✓ Bajados ${rows.length} registros únicos. Subiendo a prod (reset + sin duplicados)…`);

  // 2) subir a prod en lotes; el primero con reset:true (borra el dataset viejo de la fuente)
  let pushed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const body = { rows: batch }; if (i === 0) body.reset = true;
    const r = await fetch(`${PROD}/api/admin/import-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Import-Token': TOKEN }, body: JSON.stringify(body) });
    if (!r.ok) { console.error('Error subiendo lote:', r.status, await r.text().catch(() => '')); process.exit(1); }
    const j = await r.json(); pushed += batch.length;
    console.log(`  subidos ${pushed}/${rows.length}${i === 0 ? ` (reset: borrados ${j.deleted})` : ''} · total en prod: ${j.total}`);
    await sleep(120);
  }
  console.log('🎉 LISTO. Importación completa, sin duplicados.');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
