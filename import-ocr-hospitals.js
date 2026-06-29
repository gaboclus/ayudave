/* ============================================================
   Personas en hospitales — datos OCR del sismo (24/06/2026).
   Fuente abierta (atribución): repo público en GitHub de @ecrespo,
   transcripción OCR de listas de pacientes de hospitales.
   https://github.com/ecrespo/OCR-data_Terremoto_Venezuela_24062026

   Baja consolidado.csv (raw, sin geo-bloqueo), lo parsea y cachea en
   memoria; refresco perezoso. Privacidad: la cédula se usa SOLO para
   búsqueda (nunca se devuelve al público) y se omiten las notas médicas.
   ============================================================ */
'use strict';

const { normName, nameTokens, nameMatchRank } = require('./text-normalize');
const SOURCE_REPO = 'https://github.com/ecrespo/OCR-data_Terremoto_Venezuela_24062026';
const CSV_URL = process.env.OCR_HOSPITALS_CSV || 'https://raw.githubusercontent.com/ecrespo/OCR-data_Terremoto_Venezuela_24062026/main/consolidado.csv';

let CACHE = { items: [], total: 0, byHospital: [], fetchedAt: 0 };

// Parser CSV robusto (comillas + comas/saltos dentro de campos).
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const digits = s => String(s || '').replace(/\D/g, '');

async function fetchOcrHospitals() {
  const r = await fetch(CSV_URL, { headers: { 'User-Agent': 'AyudaVE/1.0 (+humanitario)' } });
  if (!r.ok) throw new Error('CSV HTTP ' + r.status);
  const rows = parseCSV(await r.text());
  rows.shift(); // cabecera: Hospital/Área, Nombre, Edad, Cédula, Procedencia/Zona, Servicio/Lista, Nota
  const items = [];
  for (const cols of rows) {
    if (!cols || cols.length < 2) continue;
    const nombre = (cols[1] || '').trim();
    if (!nombre || nombre === '—') continue;
    items.push({
      nombre,
      hospital: (cols[0] || '').trim(),
      edad: (cols[2] || '').trim().replace(/^—$/, ''),
      zona: (cols[4] || '').trim().replace(/^—$/, ''),
      ced: digits(cols[3]), // SOLO para búsqueda; nunca se devuelve
      nameNorm: normName(nombre),
    });
  }
  const byH = {};
  for (const it of items) if (it.hospital) byH[it.hospital] = (byH[it.hospital] || 0) + 1;
  const byHospital = Object.entries(byH).map(([hospital, count]) => ({ hospital, count })).sort((a, b) => b.count - a.count);
  CACHE = { items, total: items.length, byHospital, fetchedAt: Date.now() };
  return CACHE;
}

// Versión pública: la cédula (it.ced) nunca se devuelve.
const pub = it => ({ nombre: it.nombre, hospital: it.hospital, edad: it.edad, zona: it.zona });

function searchOcrHospitals(q, limit = 60, hospital = '') {
  const raw = String(q || '').trim();
  let list = CACHE.items;
  if (hospital) list = list.filter(it => it.hospital === hospital); // filtro exacto por centro
  if (raw) {
    const qnorm = normName(raw);
    const qtokens = nameTokens(raw);
    const qd = digits(raw);
    const scored = [];
    list.forEach((it, i) => {
      if (qd.length >= 5 && it.ced && it.ced.includes(qd)) { scored.push({ it, rank: 0, i }); return; } // cédula: buscable, no devuelta
      let rank = qnorm ? nameMatchRank(it.nameNorm, qnorm, qtokens) : 5;
      if (rank === 5) {
        if (qnorm && (normName(it.hospital).includes(qnorm) || normName(it.zona).includes(qnorm))) rank = 4; // por hospital/zona
        else return;
      }
      scored.push({ it, rank, i });
    });
    scored.sort((a, b) => a.rank - b.rank || a.i - b.i); // relevancia; desempate estable
    list = scored.map(x => x.it);
  }
  return { total: CACHE.total, matched: list.length, items: list.slice(0, Math.min(limit, 200)).map(pub), source: SOURCE_REPO };
}

function ocrHospitalsSummary() {
  return { total: CACHE.total, hospitales: CACHE.byHospital.length, byHospital: CACHE.byHospital.slice(0, 24), source: SOURCE_REPO, fetchedAt: CACHE.fetchedAt };
}

async function primeOcrHospitals() {
  try { await fetchOcrHospitals(); console.log(`[ocr-hosp] ${CACHE.total} pacientes en ${CACHE.byHospital.length} centros`); }
  catch (e) { console.error('[ocr-hosp] error inicial:', e.message); }
  const t = setInterval(() => fetchOcrHospitals().catch(e => console.error('[ocr-hosp] refresco:', e.message)), 6 * 3600 * 1000);
  if (t.unref) t.unref();
}

module.exports = { fetchOcrHospitals, searchOcrHospitals, ocrHospitalsSummary, primeOcrHospitals, CSV_URL, SOURCE_REPO };

/* CLI rápido: node import-ocr-hospitals.js [búsqueda] */
if (require.main === module) {
  (async () => {
    await fetchOcrHospitals();
    const s = ocrHospitalsSummary();
    console.log(`total ${s.total} · ${s.hospitales} centros`);
    console.log('top centros:', s.byHospital.slice(0, 8).map(h => `${h.count}× ${h.hospital}`).join(' | '));
    const q = process.argv[2];
    if (q) console.log(`\nbúsqueda "${q}":`, JSON.stringify(searchOcrHospitals(q, 5).items, null, 1));
  })().catch(e => { console.error(e); process.exit(1); });
}
