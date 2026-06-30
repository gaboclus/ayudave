/* ============================================================
   Importador de centros de acopio desde acopiovenezuela.vercel.app
   (Google Sheet expuesto vía sheet2api). Idempotente y reconciliable:
   - upsert por id estable derivado del contenido (nombre|ciudad|dirección)
   - borra los centros IMPORTADOS que ya no están en la hoja (preserva los
     creados por usuarios, que tienen ownerId)
   - NO toca nada si la fuente devuelve muy pocos registros (protección ante caídas)
   Uso CLI:  node import-acopio.js        (usa el store: SQLite local o Postgres si DATABASE_URL)
   ============================================================ */
'use strict';
const crypto = require('crypto');

// URL de la fuente (sheet2api). Sin ella, la importación se omite (no hay default con token en el repo).
const SHEET_URL = process.env.ACOPIO_SHEET_URL || '';
const SOURCE = 'acopiovenezuela.vercel.app';
const MIN_OK = 10; // si la hoja devuelve menos que esto, asumimos error de fuente y no reconciliamos

/* ---------- Mapeo ciudad -> estado (mismo criterio que scripts-build-centros.js) ---------- */
const CITY_ESTADO = {
  'barinas': 'Barinas',
  'barquisimeto': 'Lara', 'cabudare': 'Lara', 'carora': 'Lara',
  'ciudad guayana': 'Bolívar', 'puerto ordaz': 'Bolívar', 'caroní': 'Bolívar', 'caroni': 'Bolívar', 'upata': 'Bolívar', 'ciudad bolívar': 'Bolívar', 'ciudad bolivar': 'Bolívar',
  'maracaibo': 'Zulia', 'cabimas': 'Zulia', 'ciudad ojeda': 'Zulia',
  'maracay': 'Aragua', 'la victoria': 'Aragua', 'turmero': 'Aragua', 'cagua': 'Aragua',
  'san cristóbal': 'Táchira', 'san cristobal': 'Táchira', 'táchira': 'Táchira', 'tachira': 'Táchira', 'tariba': 'Táchira', 'táriba': 'Táchira', 'rubio': 'Táchira', 'san antonio': 'Táchira',
  'mérida': 'Mérida', 'merida': 'Mérida',
  'valencia': 'Carabobo', 'puerto cabello': 'Carabobo', 'naguanagua': 'Carabobo',
  'trujillo': 'Trujillo', 'valera': 'Trujillo',
  'punto fijo': 'Falcón', 'coro': 'Falcón',
  'el hatillo': 'Miranda', 'los teques': 'Miranda', 'guarenas': 'Miranda', 'guatire': 'Miranda', 'miranda': 'Miranda',
  'caracas': 'Distrito Capital', 'distrito capital': 'Distrito Capital',
  'la guaira': 'La Guaira', 'vargas': 'La Guaira',
  'maturín': 'Monagas', 'maturin': 'Monagas',
  'bolívar': 'Bolívar', 'bolivar': 'Bolívar',
  'anzoategui': 'Anzoátegui', 'anzoátegui': 'Anzoátegui', 'el tigre': 'Anzoátegui', 'el tigrito': 'Anzoátegui', 'guanipa': 'Anzoátegui', 'pariaguan': 'Anzoátegui', 'pariaguán': 'Anzoátegui', 'lecheria': 'Anzoátegui', 'lechería': 'Anzoátegui', 'barcelona': 'Anzoátegui', 'puerto la cruz': 'Anzoátegui',
};
const VE_ESTADOS = ['Distrito Capital', 'Miranda', 'La Guaira', 'Aragua', 'Carabobo', 'Zulia', 'Lara', 'Táchira', 'Mérida', 'Trujillo', 'Barinas', 'Bolívar', 'Falcón', 'Monagas', 'Anzoátegui', 'Sucre', 'Portuguesa', 'Yaracuy', 'Cojedes', 'Guárico', 'Apure', 'Nueva Esparta'];
const noAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function resolveEstado(city) {
  if (!city) return '';
  const direct = CITY_ESTADO[city.toLowerCase().trim()];
  if (direct) return direct;
  const c = noAccent(city);
  // 1) ¿el texto contiene el nombre de un estado? (ej. "El tigre anzoategui")
  for (const e of VE_ESTADOS) if (c.includes(noAccent(e))) return e;
  // 2) ¿contiene una ciudad conocida? (ej. "El Tigrito (Guanipa)")
  for (const k in CITY_ESTADO) if (c.includes(noAccent(k))) return CITY_ESTADO[k];
  return '';
}

const NEED_RULES = [
  [/agua/i, 'agua'],
  [/aliment|comida|perecede|v[íi]ver/i, 'comida'],
  [/medicin|medicament|insumo.?\s*m[ée]dic|f[áa]rmac/i, 'medicinas'],
  [/gasa/i, 'gasas'],
  [/primeros\s*auxilios/i, 'primeros-auxilios'],
  [/ropa|abrigo|vestiment/i, 'ropa'],
  [/cobij|manta|colch|s[áa]bana|frazad/i, 'mantas'],
  [/p[aña]ñal/i, 'panales'],
  [/f[óo]rmula/i, 'formula'],
  [/linterna/i, 'linternas'],
  [/bater[íi]a|pila/i, 'baterias'],
  [/herramient|equipami/i, 'herramientas'],
  [/gasolina|combustible/i, 'gasolina'],
  [/voluntari/i, 'voluntarios'],
];
function inferType(name) {
  const n = (name || '').toLowerCase();
  if (/colegio|universidad|escuela|liceo|u\.?c\.?a\.?b/i.test(n)) return 'Universidad';
  if (/iglesia|parroquia|capilla|catedral/i.test(n)) return 'Iglesia';
  if (/fundaci[óo]n|funda/i.test(n)) return 'Fundación';
  if (/voluntariad|voluntario/i.test(n)) return 'Voluntariado';
  if (/comando|consejo|comuna|comunidad|colectiv/i.test(n)) return 'Comunidad';
  if (/alcald[íi]a|gobernaci[óo]n/i.test(n)) return 'Alcaldía';
  if (/empresa|comercio|restaurant|tienda|food|hipermercado|c\.?c\.?/i.test(n)) return 'Empresa privada';
  if (/ong/i.test(n)) return 'ONG';
  return 'Otro';
}
function parseContact(raw) {
  raw = (raw || '').trim();
  const out = { contacto: raw, phones: [], whatsapp: '', instagram: '' };
  if (!raw || /^no hay$/i.test(raw)) { out.contacto = ''; return out; }
  if (/instagram/i.test(raw)) {
    let ig = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw.replace(/^@/, '');
    out.instagram = ig.split('?')[0].replace(/\/+$/, ''); return out;
  }
  if (/https?:\/\//i.test(raw)) { out.instagram = raw.split('?')[0]; return out; }
  const groups = raw.split(/[—–/,;|]| y /i).map(s => s.replace(/\D/g, '')).filter(d => d.length >= 7);
  out.phones = [...new Set(groups)];
  if (out.phones.length) {
    let d = out.phones[0].replace(/^0/, '');
    if (!d.startsWith('58')) d = '58' + d;
    out.whatsapp = d;
  }
  return out;
}

/* lee una columna de la fila ignorando mayúsculas y espacios sobrantes en la cabecera */
function col(row, name) {
  for (const k in row) if (k.trim().toLowerCase() === name) return ('' + (row[k] ?? '')).trim();
  return '';
}
function stableId(name, city, addr) {
  const key = noAccent([name, city, addr].join('|')).replace(/\s+/g, ' ').trim();
  return 'acopio-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

/* fila del sheet -> objeto centro con el esquema de la app */
function mapRow(row, nowMs) {
  const name = col(row, 'quién') || col(row, 'quien');
  if (!name) return null;
  const addr = col(row, 'dirección') || col(row, 'direccion');
  const city = col(row, 'ciudad');
  const reciben = col(row, 'qué reciben') || col(row, 'que reciben');
  const ct = parseContact(col(row, 'contacto'));
  const foto = col(row, 'foto');
  const estado = resolveEstado(city);
  const needKeys = [...new Set(NEED_RULES.filter(([re]) => re.test(reciben)).map(([, k]) => k))];
  const needs = needKeys.map(k => ({ key: k, level: 'alta' }));
  const id = stableId(name, city, addr);
  const data = {
    id, name, type: inferType(name), status: 'verificado',
    estado, municipio: city, parroquia: '',
    address: addr, reference: '', coords: null,
    needs, needsText: reciben,
    accepts: ['fisico'], notAccepts: [],
    horario: '', responsable: '', responsableApellido: '',
    whatsapp: ct.whatsapp, phones: ct.phones, instagram: ct.instagram, contacto: ct.contacto,
    foto: foto || '', crypto: [], inventory: [],
    stats: { reportadas: 0, confirmadas: 0, entregadas: 0, voluntarios: 0 }, updates: [],
    source: SOURCE, imported: true,
  };
  return { id, name, status: 'verificado', estado, municipio: city, parroquia: '', distance: 0.5, created_at: nowMs, data };
}

async function fetchSheet(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'AyudaVE/1.0 (+ayudahumanitariavenezuela.com)', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('sheet2api ' + r.status);
  const j = await r.json();
  return Array.isArray(j) ? j : (j.rows || j.data || []);
}

/* Importa/actualiza los centros de la hoja en `store`. Devuelve estadísticas. */
async function importAcopio(store, opts = {}) {
  const log = opts.log || (() => {});
  const url = opts.url || SHEET_URL;
  if (!url) { log('ACOPIO_SHEET_URL no configurada; omito la importación de acopio'); return { skipped: true, imported: 0 }; }
  const nowMs = Date.now();
  const rows = await fetchSheet(url);
  log(`fuente: ${rows.length} filas`);
  const mapped = rows.map(r => mapRow(r, nowMs)).filter(Boolean);
  // de-dup por id estable (filas idénticas en la hoja)
  const byId = new Map();
  for (const c of mapped) byId.set(c.id, c);
  const centers = [...byId.values()];
  if (centers.length < MIN_OK) {
    log(`solo ${centers.length} centros válidos (< ${MIN_OK}): abortando para no dañar datos`);
    return { ok: false, fetched: rows.length, valid: centers.length, upserted: 0, deleted: 0, reason: 'fuente_insuficiente' };
  }

  // upsert idempotente (no toca created_at de los existentes)
  let upserted = 0;
  for (const c of centers) {
    const r = await store.run(
      `INSERT INTO centers (id,name,status,estado,municipio,parroquia,distance,data,created_at) VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, status=excluded.status, estado=excluded.estado, municipio=excluded.municipio, parroquia=excluded.parroquia, distance=excluded.distance, data=excluded.data`,
      [c.id, c.name, c.status, c.estado, c.municipio, c.parroquia, c.distance, JSON.stringify(c.data), c.created_at]);
    upserted += (r && r.changes) || 0;
  }

  // reconciliación: borra centros IMPORTADOS que ya no están en la hoja.
  // Preserva los creados por usuarios (tienen ownerId) y los no importados.
  const keep = new Set(centers.map(c => c.id));
  const existing = await store.all('SELECT id, data FROM centers');
  let deleted = 0;
  for (const row of existing) {
    if (keep.has(row.id)) continue;
    let d = {}; try { d = JSON.parse(row.data); } catch {}
    // Solo reconcilia los centros importados DE ESTA FUENTE (no toca otras APIs ni los de usuario).
    const isImported = d && d.imported === true && !d.ownerId && d.source === SOURCE;
    if (isImported) { await store.run('DELETE FROM centers WHERE id=?', [row.id]); deleted++; }
  }
  log(`upsert=${centers.length} borrados(importados obsoletos)=${deleted}`);
  return { ok: true, fetched: rows.length, valid: centers.length, upserted: centers.length, deleted };
}

module.exports = { importAcopio, mapRow, resolveEstado, SHEET_URL, SOURCE, inferType, parseContact, NEED_RULES, noAccent, stableId };

/* ---------------- CLI ---------------- */
if (require.main === module) {
  (async () => {
    const store = require('./store');
    await store.init();
    const t0 = Date.now();
    console.log(`[acopio] store=${store.kind} fuente=${SHEET_URL}`);
    const res = await importAcopio(store, { log: m => console.log('[acopio]', m) });
    console.log(`[acopio] LISTO en ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(res));
    process.exit(res.ok ? 0 : 1);
  })().catch(e => { console.error('[acopio] ERROR', e); process.exit(1); });
}
