/* ============================================================
   Directorio de emergencia (Caracas) — datos de redayudavenezuela.com
   Hospitales, líneas de emergencia, ambulancias y bomberos por zona.
   - Semilla embebida (siempre se despliega; data/ está excluido del deploy).
   - Upsert idempotente por id estable (categoría|nombre|zona).
   - AUDITORÍA: detecta teléfonos duplicados (mismo número en varias entradas /
     categorías = posible falso positivo o número compartido) y los marca.
   ============================================================ */
'use strict';
const crypto = require('crypto');

const SOURCE = 'redayudavenezuela.com';
const ESTADO = 'Distrito Capital';

// Normaliza teléfono venezolano a dígitos: "(0212) 870.78.97" -> "02128707897"
function normTel(t) { return ('' + (t || '')).replace(/[^\d*]/g, ''); }
function telLabel(t) { return ('' + (t || '')).trim(); }

// Semilla extraída de redayudavenezuela.com (26-06-2026).
const SEED = [
  // ---- Hospitales en Caracas ----
  { category: 'hospital', name: 'Hospital José Gregorio Hernández', zona: 'Los Magallanes', phones: ['(0212) 870.78.97'] },
  { category: 'hospital', name: 'Hospital Miguel Pérez Carreño', zona: 'Bella Vista', phones: ['(0212) 472.84.72'] },
  { category: 'hospital', name: 'Hospital Militar', zona: 'San Martín', phones: ['(0212) 406.12.41'] },
  { category: 'hospital', name: 'Hospital Periférico de Catia', zona: 'Catia', phones: ['(0212) 870.27.71'] },
  { category: 'hospital', name: 'Hospital Periférico de Coche', zona: 'Coche', phones: ['(0212) 681.11.33'] },
  { category: 'hospital', name: 'Policlínica David Lobo', zona: 'Santa Rosalía', phones: ['(0212) 541.54.65'] },
  { category: 'hospital', name: 'Policlínica La Arboleda', zona: 'San Bernardino', phones: ['(0212) 550.18.11'] },
  { category: 'hospital', name: 'Policlínica Las Mercedes', zona: 'Las Mercedes', phones: ['(0212) 993.23.23'] },
  { category: 'hospital', name: 'Policlínica Santiago de León', zona: 'Sabana Grande', phones: ['(0212) 762.90.25'] },
  // ---- Líneas de emergencia (operadores) ----
  { category: 'emergencia', name: 'Cantv (desde fijo)', zona: '', phones: ['171'] },
  { category: 'emergencia', name: 'Movilnet', zona: '', phones: ['*1'] },
  { category: 'emergencia', name: 'Digitel', zona: '', phones: ['112'] },
  { category: 'emergencia', name: 'Movistar', zona: '', phones: ['911'] },
  // ---- Ambulancias ----
  { category: 'ambulancia', name: 'Aeroambulancias', zona: '', phones: ['(0212) 993.25.41', '(0212) 992.89.80', '(0212) 992.89.90', '(0212) 991.79.40'] },
  { category: 'ambulancia', name: 'Rescarven', zona: '', phones: ['(0212) 993.69.11', '(0212) 993.69.91', '(0212) 993.13.10', '(0212) 993.33.67'] },
  { category: 'ambulancia', name: 'Servicio de Ambulancia Metropolitano', zona: '', phones: ['(0212) 545.45.45', '(0212) 545.46.55', '(0212) 577.92.09'] },
  // ---- Bomberos por zona ----
  { category: 'bomberos', name: 'Bomberos de Antímano', zona: 'Antímano', phones: ['(0212) 472.20.54'] },
  { category: 'bomberos', name: 'Bomberos de Catia la Mar', zona: 'Catia la Mar', phones: ['(0212) 351.99.66'] },
  { category: 'bomberos', name: 'Bomberos de Chacao', zona: 'Chacao', phones: ['(0212) 265.32.61'] },
  { category: 'bomberos', name: 'Bomberos del Este', zona: 'Cafetal', phones: ['(0212) 987.43.34', '(0212) 985.50.60'] },
  { category: 'bomberos', name: 'Bomberos de Sucre', zona: 'Sucre', phones: ['(0212) 985.36.40'] },
  { category: 'bomberos', name: 'Bomberos de El Cafetal', zona: 'El Cafetal', phones: ['(0212) 985.36.40', '(0212) 985.29.77'] },
  { category: 'bomberos', name: 'Bomberos de El Paraíso', zona: 'El Paraíso', phones: ['(0212) 481.09.61'] },
  { category: 'bomberos', name: 'Bomberos de El Valle', zona: 'El Valle', phones: ['(0212) 672.01.75', '(0212) 672.06.36'] },
  { category: 'bomberos', name: 'Bomberos de La Guaira', zona: 'La Guaira', phones: ['(0212) 332.76.20', '(0212) 331.04.45'] },
  { category: 'bomberos', name: 'Bomberos de La Trinidad', zona: 'La Trinidad', phones: ['(0212) 943.43.61'] },
  { category: 'bomberos', name: 'Bomberos de La Urbina', zona: 'La Urbina', phones: ['(0212) 241.66.41'] },
  { category: 'bomberos', name: 'Bomberos Metropolitanos', zona: 'Metropolitanos', phones: ['(0212) 545.45.45'] },
  { category: 'bomberos', name: 'Bomberos de Miranda', zona: 'Miranda', phones: ['(0212) 235.69.67'] },
  { category: 'bomberos', name: 'Bomberos de Plaza Venezuela', zona: 'Plaza Venezuela', phones: ['(0212) 793.00.39', '(0212) 793.64.57'] },
  { category: 'bomberos', name: 'Bomberos de San Bernardino', zona: 'San Bernardino', phones: ['(0212) 577.92.09'] },
];

function stableId(e) {
  const key = [e.category, e.name, e.zona].join('|').toLowerCase();
  return 'dir-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

// Construye la lista normalizada + auditoría de duplicados (mismo teléfono en varias entradas).
function buildAudit(seed) {
  const byPhone = {};
  seed.forEach(e => (e.phones || []).forEach(p => { const n = normTel(p); if (!n) return; (byPhone[n] = byPhone[n] || []).push(e.name + (e.zona ? ' (' + e.zona + ')' : '')); }));
  const dupPhones = Object.entries(byPhone).filter(([, names]) => new Set(names).size > 1);
  // marca cada entrada que comparte teléfono con otra
  const shared = new Set(dupPhones.map(([n]) => n));
  const items = seed.map(e => {
    const phones = (e.phones || []).map(p => ({ label: telLabel(p), tel: normTel(p), shared: shared.has(normTel(p)) }));
    return { id: stableId(e), category: e.category, name: e.name, zona: e.zona || '', estado: ESTADO, phones, source: SOURCE, flagged: phones.some(p => p.shared) };
  });
  const audit = {
    total: items.length,
    duplicatePhones: dupPhones.map(([tel, names]) => ({ tel, label: '0' + tel.replace(/^0/, ''), entries: [...new Set(names)] })),
  };
  return { items, audit };
}

const { items: ITEMS, audit: AUDIT } = buildAudit(SEED);

// Upsert idempotente en la BD + reporte de auditoría.
async function importDirectorio(store, opts = {}) {
  const log = opts.log || (() => {});
  let upserted = 0;
  for (const it of ITEMS) {
    const row = await store.get('SELECT id FROM directory WHERE id=?', [it.id]);
    const data = JSON.stringify(it);
    if (row) await store.run('UPDATE directory SET category=?, name=?, zona=?, estado=?, data=? WHERE id=?', [it.category, it.name, it.zona, it.estado, data, it.id]);
    else { await store.run('INSERT INTO directory (id, category, name, zona, estado, data, created_at) VALUES (?,?,?,?,?,?,?)', [it.id, it.category, it.name, it.zona, it.estado, data, Date.now()]); upserted++; }
  }
  log(`directorio: ${ITEMS.length} entradas (${upserted} nuevas). Teléfonos compartidos: ${AUDIT.duplicatePhones.length}`);
  return { count: ITEMS.length, upserted, audit: AUDIT };
}

// Lectura agrupada por categoría (desde la BD; cae a la semilla si la tabla está vacía).
async function getDirectorio(store) {
  let rows = [];
  try { rows = await store.all('SELECT data FROM directory ORDER BY category, name'); } catch {}
  const items = rows.length ? rows.map(r => JSON.parse(r.data)) : ITEMS;
  const groups = {};
  items.forEach(it => (groups[it.category] = groups[it.category] || []).push(it));
  return { groups, count: items.length, source: SOURCE, audit: AUDIT };
}

module.exports = { importDirectorio, getDirectorio, ITEMS, AUDIT, SOURCE };

/* CLI: node import-directorio.js  → muestra la auditoría */
if (require.main === module) {
  console.log(ITEMS.length + ' entradas');
  console.log('Teléfonos compartidos (auditoría):');
  AUDIT.duplicatePhones.forEach(d => console.log('  ' + d.label + ' → ' + d.entries.join('  |  ')));
}
