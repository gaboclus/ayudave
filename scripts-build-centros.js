/* Convierte el CSV del Google Sheet de centros de acopio -> centros-acopio.json
   con el esquema que usa la app. Uso: node scripts-build-centros.js /tmp/centros.csv */
'use strict';
const fs = require('fs');

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Ciudad -> estado de Venezuela (los afectados ya tienen prioridad de filtro)
const CITY_ESTADO = {
  'barinas': 'Barinas',
  'barquisimeto': 'Lara', 'cabudare': 'Lara', 'carora': 'Lara',
  'ciudad guayana': 'Bolívar', 'puerto ordaz': 'Bolívar', 'caroní': 'Bolívar', 'caroni': 'Bolívar', 'upata': 'Bolívar', 'ciudad bolívar': 'Bolívar', 'ciudad bolivar': 'Bolívar',
  'maracaibo': 'Zulia', 'cabimas': 'Zulia',
  'maracay': 'Aragua', 'la victoria': 'Aragua', 'turmero': 'Aragua', 'cagua': 'Aragua',
  'san cristóbal': 'Táchira', 'san cristobal': 'Táchira', 'táchira': 'Táchira', 'tachira': 'Táchira', 'tariba': 'Táchira', 'táriba': 'Táchira', 'rubio': 'Táchira',
  'mérida': 'Mérida', 'merida': 'Mérida',
  'valencia': 'Carabobo', 'puerto cabello': 'Carabobo', 'naguanagua': 'Carabobo',
  'trujillo': 'Trujillo', 'valera': 'Trujillo',
  'punto fijo': 'Falcón', 'coro': 'Falcón',
  'el hatillo': 'Miranda', 'los teques': 'Miranda', 'guarenas': 'Miranda', 'guatire': 'Miranda', 'miranda': 'Miranda',
  'caracas': 'Distrito Capital', 'distrito capital': 'Distrito Capital',
  'la guaira': 'La Guaira', 'vargas': 'La Guaira',
  'maturín': 'Monagas', 'maturin': 'Monagas',
  'bolívar': 'Bolívar', 'bolivar': 'Bolívar', 'ciudad ojeda': 'Zulia',
  'anzoategui': 'Anzoátegui', 'anzoátegui': 'Anzoátegui', 'lecheria': 'Anzoátegui', 'lechería': 'Anzoátegui', 'barcelona': 'Anzoátegui', 'puerto la cruz': 'Anzoátegui',
  'san antonio': 'Táchira',
};
const VE_ESTADOS = ['Distrito Capital', 'Miranda', 'La Guaira', 'Aragua', 'Carabobo', 'Zulia', 'Lara', 'Táchira', 'Mérida', 'Trujillo', 'Barinas', 'Bolívar', 'Falcón', 'Monagas', 'Anzoátegui', 'Sucre', 'Portuguesa', 'Yaracuy', 'Cojedes', 'Guárico', 'Apure', 'Nueva Esparta'];
const noAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function resolveEstado(city) {
  if (!city) return '';
  const direct = CITY_ESTADO[city.toLowerCase()];
  if (direct) return direct;
  const c = noAccent(city);
  for (const e of VE_ESTADOS) if (c.includes(noAccent(e))) return e;
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
  [/herramient/i, 'herramientas'],
  [/gasolina|combustible/i, 'gasolina'],
  [/agua|higiene|aseo|kit/i, 'agua'],
];

function inferType(name) {
  const n = (name || '').toLowerCase();
  if (/colegio|universidad|escuela|liceo|u\.?c\.?a\.?b/i.test(n)) return 'Universidad';
  if (/iglesia|parroquia|capilla|catedral/i.test(n)) return 'Iglesia';
  if (/fundaci[óo]n|funda/i.test(n)) return 'Fundación';
  if (/voluntariad|voluntario/i.test(n)) return 'Voluntariado';
  if (/comando|consejo|comuna|comunidad|colectiv/i.test(n)) return 'Comunidad';
  if (/alcald[íi]a|gobernaci[óo]n/i.test(n)) return 'Alcaldía';
  if (/empresa|comercio|restaurant|tienda|food/i.test(n)) return 'Empresa privada';
  if (/ong/i.test(n)) return 'ONG';
  return 'Otro';
}

function parseCoords(s) {
  const m = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/.exec(s || '');
  if (!m) return null;
  return { lat: +(+m[1]).toFixed(6), lng: +(+m[2]).toFixed(6) };
}

// Separa el contacto en teléfonos, WhatsApp (para wa.me) e Instagram
function parseContact(raw) {
  raw = (raw || '').trim();
  const out = { contacto: raw, phones: [], whatsapp: '', instagram: '' };
  if (!raw) return out;
  if (/instagram/i.test(raw)) {
    let ig = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw.replace(/^@/, '');
    out.instagram = ig.split('?')[0].replace(/\/+$/, '');
    return out;
  }
  if (/https?:\/\//i.test(raw)) { out.instagram = raw.split('?')[0]; return out; }
  // teléfonos: separar por —, –, /, ',', ';', '|' o ' y '  (NO por guion simple, para no partir números)
  const groups = raw.split(/[—–/,;|]| y /i).map(s => s.replace(/\D/g, '')).filter(d => d.length >= 7);
  out.phones = [...new Set(groups)];
  if (out.phones.length) {
    let d = out.phones[0].replace(/^0/, '');
    if (!d.startsWith('58')) d = '58' + d;
    out.whatsapp = d; // wa.me/<whatsapp>
  }
  return out;
}

const text = fs.readFileSync(process.argv[2] || '/tmp/centros.csv', 'utf8');
const rows = parseCSV(text).filter(r => r.length && r.join('').trim());
const header = rows.shift();
const now = 1750000000000; // timestamp fijo (no usar Date.now para reproducibilidad)
const unknownCities = new Set();
const out = [];

for (const r of rows) {
  const [sid, quien, dir, coordStr, ciudad, , reciben, contacto] = r.map(x => (x || '').trim());
  if (!quien) continue;
  const city = (ciudad || '').trim();
  const estado = resolveEstado(city);
  if (city && !estado) unknownCities.add(city);
  const coords = parseCoords(coordStr);
  const needKeys = [...new Set(NEED_RULES.filter(([re]) => re.test(reciben || '')).map(([, k]) => k))];
  const needs = needKeys.map(k => ({ key: k, level: 'alta' }));
  const ct = parseContact(contacto);
  const data = {
    name: quien,
    type: inferType(quien),
    status: 'verificado',
    estado, municipio: city, parroquia: '',
    address: dir || '', reference: '',
    coords: coords || null,
    needs,
    needsText: reciben || '',
    accepts: ['fisico'], notAccepts: [],
    horario: '', responsable: '', responsableApellido: '',
    whatsapp: ct.whatsapp,
    phones: ct.phones,
    instagram: ct.instagram,
    contacto: ct.contacto,
    crypto: [], inventory: [],
    stats: { reportadas: 0, confirmadas: 0, entregadas: 0, voluntarios: 0 },
    updates: [],
    source: 'Planilla de coordinación', imported: true,
  };
  out.push({
    id: 'imp-' + (sid || out.length + 1),
    name: quien, status: 'verificado',
    estado, municipio: city, parroquia: '',
    distance: 0.5, created_at: now, data,
  });
}

fs.writeFileSync(__dirname + '/data/centros-acopio.json', JSON.stringify(out, null, 1));
console.log('centros generados:', out.length);
console.log('con coordenadas:', out.filter(c => c.data.coords).length);
console.log('con estado mapeado:', out.filter(c => c.estado).length);
console.log('por estado:', JSON.stringify(out.reduce((a, c) => { const e = c.estado || '(sin estado)'; a[e] = (a[e] || 0) + 1; return a; }, {})));
console.log('ciudades sin mapear:', [...unknownCities].join(' | ') || '(ninguna)');
console.log('ejemplo:', JSON.stringify(out[0], null, 1).slice(0, 500));
