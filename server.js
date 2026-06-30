/* ============================================================
   AyudaVE — Servidor escalable (Cloud Run / VM)
   Persistencia intercambiable: SQLite (local) o PostgreSQL (DATABASE_URL).
   Imágenes: disco local o Cloud Storage (GCS_BUCKET).
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');       // SQLite o Postgres según DATABASE_URL
const storage = require('./storage');   // disco o GCS según GCS_BUCKET
const { importDtvPersons, insertPersonsBatch, upsertPersons, mapDtvPerson, ensurePersonsSourceId, DTV_API } = require('./import-dtv'); // importación de desaparecidos del sismo
const { getAuditSummary, auditPersons, ensureAuditColumns } = require('./audit-dtv'); // auditoría/depuración de duplicados
const { importAcopio } = require('./import-acopio'); // centros de acopio desde acopiovenezuela.vercel.app (auto-actualizable)
const { importCentrosApis } = require('./import-centros-apis'); // centros desde APIs públicas AcopioVE + ResponseGrid (dedup)
const { searchOcrHospitals, ocrHospitalsSummary, primeOcrHospitals } = require('./import-ocr-hospitals'); // pacientes en hospitales (OCR, repo abierto)
const { getReportes, primeReportes, SOURCE: REP_SOURCE, CATS: REP_CATS } = require('./import-reportes'); // reportes de servicios (luz/agua/medicinas...) desde reporte-ve
const { getEdificios, primeEdificios, edificiosCount, SOURCE: EDIF_SOURCE } = require('./import-edificios'); // edificios afectados desde terremotovenezuela.com
const { getSupplies, primeSupplies, suppliesCount, SOURCE: SUP_SOURCE, ATTRIBUTION: SUP_ATTR } = require('./import-supplies'); // catálogo maestro de insumos (ReliefHub/ResponseGrid)
const { importDirectorio, getDirectorio } = require('./import-directorio'); // directorio de emergencia (hospitales/ambulancias/bomberos) desde redayudavenezuela.com
const { getSismos, primeSismos } = require('./import-sismos'); // sismos/réplicas recientes (USGS)
const assistant = require('./assistant-gemini'); // asistente IA: buscar persona por foto (Gemini)
// Carga opcional de módulos de extensión privados (no incluidos en el repo open source).
function optionalModule(name) { try { return require(name); } catch { return null; } }
const ext = optionalModule('./extension'); // módulo de extensión opcional (rutas/tablas propias); ausente en la versión open source

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const PORT = process.env.PORT || 4599;
const BUILD = process.env.BUILD || String(Date.now());  // versión para cache-busting de JS/CSS
const VISIT_SALT = process.env.AYUDAVE_METRICS_SALT || ('ayudave-metrics-' + BUILD);  // anonimiza visitantes (sin guardar IP)
fs.mkdirSync(UPLOADS, { recursive: true });

const now = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 8);
const num = v => Number(v) || 0;

/* ---------------- Autenticación (PIN + sesión por token) ---------------- */
// Pepper del hash de PIN: obligatorio por env en producción (con DATABASE_URL). En local cae a un valor de desarrollo.
const PIN_PEPPER = process.env.AYUDAVE_PIN_PEPPER || (process.env.DATABASE_URL ? null : 'dev-pepper-local');
if (!PIN_PEPPER) throw new Error('Falta AYUDAVE_PIN_PEPPER en producción');
function loadAdmins() {
  const set = new Set();
  (process.env.AYUDAVE_ADMINS || '').split(',').map(s => s.trim()).filter(Boolean).forEach(p => set.add(p));
  try { JSON.parse(fs.readFileSync(path.join(DATA, 'admins.json'), 'utf8')).forEach(p => set.add(String(p).trim())); } catch {}
  return [...set];
}
const ADMINS = loadAdmins();
// Reconoce al admin sin importar el formato del teléfono (0414…, 414…, +58414…, 58414…).
const isAdmin = phone => { const n = normPhone(phone); return ADMINS.some(a => a === phone || normPhone(a) === n); };
function loadConfig() { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8')); } catch { return {}; } }
// Teléfono Venezuela: el 0 inicial es indiferente. 0414…, 414…, +58414…, 58414… → +58414…
function normPhone(raw) {
  let d = (raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.startsWith('58')) d = d.slice(2).replace(/^0+/, '');
  return d ? '+58' + d : '';
}
// PIN con scrypt + sal aleatoria (resistente a fuerza bruta si se filtra la BD).
function hashPin(phone, pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(PIN_PEPPER + '|' + phone + '|' + pin, salt, 32).toString('hex');
}
function verifyPin(phone, pin, stored) {
  if (!stored) return false;
  const [, salt, h] = stored.split('$');
  if (!salt || !h) return false;
  const calc = crypto.scryptSync(PIN_PEPPER + '|' + phone + '|' + pin, salt, 32).toString('hex');
  const a = Buffer.from(h, 'hex'), b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function createSession(userId) { const token = crypto.randomBytes(24).toString('hex'); await store.run('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)', [token, userId, now()]); return token; }
async function authUser(req) {
  const token = ((req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')).trim();
  if (!token) return null;
  const s = await store.get('SELECT * FROM sessions WHERE token=?', [token]); if (!s) return null;
  const r = await store.get('SELECT * FROM users WHERE id=?', [s.user_id]); if (!r) return null;
  const u = oUser(r); u.admin = isAdmin(u.phone); return u;
}
const loginAttempts = new Map();
const tooManyAttempts = phone => { const a = loginAttempts.get(phone); return a && a.count >= 5 && Date.now() < a.until; };
const noteFail = phone => { const a = loginAttempts.get(phone) || { count: 0, until: 0 }; a.count++; a.until = Date.now() + 6e5; loginAttempts.set(phone, a); };
const clearFail = phone => loginAttempts.delete(phone);

/* ---------------- Mapeo filas → objetos ---------------- */
const oCenter = r => { const o = JSON.parse(r.data); o.id = r.id; return o; };
const oDon = r => { const o = JSON.parse(r.data); o.id = r.id; o.centerId = r.center_id; o.centerName = r.center_name; o.estado = r.estado; o.createdAt = num(r.created_at); return o; };
const oPerson = r => { const o = JSON.parse(r.data); o.id = r.id; o.status = r.status; return o; };
/* Proyección PÚBLICA (allowlist): SOLO los campos que la lista/tarjeta/mapa muestran.
   Excluye PII de contacto (contactoTel, contactoNombre, relacion) y descripcion para que
   el listado público NO sea volcable en masa. El detalle /:id sigue usando oPerson (completo)
   para que Llamar/WhatsApp funcionen. Allowlist (no denylist): campos nuevos no se filtran por defecto. */
const PERSON_PUBLIC_FIELDS = ['nombre', 'apellido', 'edad', 'sexo', 'nacionalidad', 'estado', 'municipio', 'parroquia', 'lugar', 'fecha', 'foto', 'demo', 'coords'];
const publicPerson = o => { const out = { id: o.id, status: o.status }; for (const k of PERSON_PUBLIC_FIELDS) if (o[k] !== undefined && o[k] !== null) out[k] = o[k]; return out; };
const oPersonPublic = r => publicPerson(oPerson(r));
// Datos de contacto de la familia: NO van en el detalle enumerable; se revelan aparte (con rate-limit).
const PERSON_CONTACT_FIELDS = ['contactoTel', 'contactoNombre', 'relacion'];
const oSight = r => { const o = JSON.parse(r.data); o.id = r.id; return o; };
const oVol = r => { const o = JSON.parse(r.data); o.id = r.id; return o; };
const oApp = r => ({ id: r.id, volunteer_id: r.volunteer_id, center_id: r.center_id, center_name: r.center_name, task: r.task, status: r.status });
const oUser = r => { const o = JSON.parse(r.data); o.id = r.id; o.phone = r.phone; return o; };
// Versión pública del centro: oculta datos internos del dueño.
function publicCenter(c) { const o = { ...c }; delete o.ownerId; delete o.ownerPhone; return o; }
// ¿Este usuario es dueño del centro (o admin)?
const ownsCenter = (me, c) => !!(me && (me.admin || (c && c.ownerId && c.ownerId === me.id) || (c && Array.isArray(c.adminPhones) && me.phone && c.adminPhones.includes(me.phone))));
function err(code, msg) { const e = new Error(msg || 'error'); e.code = code; throw e; }
/* ---- Logística por centro (entradas/salidas/beneficiarios) ---- */
const oMovement = r => { const o = JSON.parse(r.data); o.id = r.id; o.centerId = r.center_id; o.type = r.type; o.createdAt = num(r.created_at); return o; };
const r2 = n => Math.round(n * 100) / 100;
function summarizeMovements(movs) {
  const inv = {}; let entradas = 0, salidas = 0, despachos = 0, familias = 0, personas = 0;
  let kgEntrada = 0, kgSalida = 0; const porCat = {}; // peso por categoría (neto en stock)
  const today = new Date().toISOString().slice(0, 10);
  const hoy = { entradas: 0, salidas: 0, familias: 0, personas: 0, kgEntrada: 0, kgSalida: 0 };
  for (const m of movs) {
    const isToday = new Date(m.createdAt || 0).toISOString().slice(0, 10) === today;
    if (m.type === 'entrada' || m.type === 'salida') {
      const sign = m.type === 'entrada' ? 1 : -1;
      for (const it of (m.items || [])) {
        const insumo = (it.insumo || '').trim(); if (!insumo) continue;
        const conc = (it.concentracion || '').trim();
        const cat = it.categoria || 'otros';
        // clave de inventario: distingue concentración (Acetaminofén 600 ≠ 500) y unidad
        const key = (insumo + (conc ? ' ' + conc : '')).toLowerCase() + '|' + (it.unidad || '').toLowerCase();
        inv[key] = inv[key] || { insumo, concentracion: conc, presentacion: it.presentacion || '', forma: it.forma || '', categoria: cat, unidad: it.unidad || '', cantidad: 0, kg: 0 };
        inv[key].cantidad += sign * num(it.cantidad);
        inv[key].kg += sign * num(it.pesoKg);
        if (it.unidad && !inv[key].unidad) inv[key].unidad = it.unidad;
        const kg = num(it.pesoKg);
        porCat[cat] = (porCat[cat] || 0) + sign * kg;
        if (m.type === 'entrada') { kgEntrada += kg; if (isToday) hoy.kgEntrada += kg; }
        else { kgSalida += kg; if (isToday) hoy.kgSalida += kg; }
      }
      if (m.type === 'entrada') { entradas++; if (isToday) hoy.entradas++; }
      else { salidas++; if (m.destino) despachos++; if (isToday) hoy.salidas++; }
    } else if (m.type === 'beneficiarios') {
      familias += num(m.familias); personas += num(m.personas);
      if (isToday) { hoy.familias += num(m.familias); hoy.personas += num(m.personas); }
    }
  }
  const inventario = Object.values(inv).filter(x => x.cantidad !== 0 || Math.abs(x.kg) > 0.001)
    .map(x => ({ ...x, kg: r2(x.kg) })).sort((a, b) => b.cantidad - a.cantidad);
  const kgStock = kgEntrada - kgSalida;
  Object.keys(porCat).forEach(k => porCat[k] = r2(porCat[k]));
  return {
    inventario,
    totals: {
      entradas, salidas, despachos, familias, personas, items: inventario.length,
      kgStock: r2(kgStock), kgEntrada: r2(kgEntrada), kgSalida: r2(kgSalida),
      toneladasStock: r2(kgStock / 1000), toneladasEntrada: r2(kgEntrada / 1000), toneladasSalida: r2(kgSalida / 1000),
      porCategoria: porCat,
    },
    hoy: { ...hoy, kgEntrada: r2(hoy.kgEntrada), kgSalida: r2(hoy.kgSalida) },
  };
}

/* Recursos compartidos (enlaces a grupos, bases de datos, galería) */
const RESOURCE_TYPES = ['whatsapp', 'telegram', 'database', 'image', 'video', 'link'];
const oResource = r => ({ id: r.id, type: r.type, title: r.title, url: r.url, descr: r.descr || '', estado: r.estado || '' });
const oHelp = r => { const o = JSON.parse(r.data); o.id = r.id; o.tipo = r.tipo; o.urgencia = r.urgencia; o.status = r.status; o.estado = r.estado; o.municipio = r.municipio; return o; };
const oPet = r => { const o = JSON.parse(r.data); o.id = r.id; o.status = r.status; o.tipo = r.tipo; o.zona = r.zona; o.estado = r.estado; o.createdAt = num(r.created_at); return o; };
// Descarga una imagen (solo http/https) a base64 con tope de tamaño, para el asistente IA.
async function fetchImageB64(url) {
  if (!/^https?:\/\//i.test(url || '')) return null;
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal }); clearTimeout(to);
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//.test(mime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return null; // 4MB máx
    return { mime, data: buf.toString('base64') };
  } catch { return null; }
}
// Solo permite http/https (acepta wa.me, t.me, etc. sin protocolo). Evita javascript:/data: (XSS).
function safeUrl(u) {
  u = ('' + (u || '')).trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) {
    if (/^(wa\.me|t\.me|chat\.whatsapp\.com|[\w-]+\.[\w.-]+\/?)/i.test(u)) u = 'https://' + u; else return '';
  }
  try { const p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : ''; } catch { return ''; }
}

/* ---------------- Semillas (solo con AYUDAVE_SEED=on) ---------------- */
const SEED_CENTERS = require('./seed-centers.js');
const SEED_PERSONS = [
  { status: 'desaparecido', nombre: 'José Antonio', apellido: 'Pérez', edad: 34, sexo: 'Masculino', estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Maiquetía', lugar: 'Cerca del río en Maiquetía', fecha: '23/06/2026', descripcion: 'Estatura media, contextura delgada. Vestía franela azul y jean.', contactoNombre: 'María Pérez (hermana)', contactoTel: '0414-1112233', relacion: 'Hermana', foto: null },
  { status: 'desaparecido', nombre: 'Carmen', apellido: 'Rodríguez', edad: 19, sexo: 'Femenino', estado: 'Miranda', municipio: 'Sucre', parroquia: 'Petare', lugar: 'Última vez vista saliendo de su casa', fecha: '24/06/2026', descripcion: 'Cabello castaño largo. Llevaba suéter gris.', contactoNombre: 'Luis Rodríguez (padre)', contactoTel: '0424-9998877', relacion: 'Padre', foto: null },
];
async function seed() {
  if (num((await store.get('SELECT COUNT(*) c FROM centers')).c) === 0) {
    for (const c of SEED_CENTERS) { c.demo = true; await store.insert('centers', { id: c.id, name: c.name, status: c.status, estado: c.estado, municipio: c.municipio, parroquia: c.parroquia, distance: c.distance, data: JSON.stringify(c), created_at: now() }); }
  }
  if (num((await store.get('SELECT COUNT(*) c FROM persons')).c) === 0) {
    for (const p of SEED_PERSONS) { p.demo = true; await store.insert('persons', { status: p.status, nombre: `${p.nombre} ${p.apellido}`, estado: p.estado, municipio: p.municipio, data: JSON.stringify(p), created_at: now() }); }
  }
}

/* ---------------- API ---------------- */
const api = {
  // ---- centros ----
  'GET /api/centers': async () => (await store.all('SELECT * FROM centers')).map(oCenter).map(publicCenter),
  'GET /api/centers/mine': async (p, q, body, req) => {
    const me = await authUser(req); if (!me) return err(401, 'inicia sesión');
    return (await store.all('SELECT * FROM centers ORDER BY created_at DESC')).map(oCenter).filter(c => me.admin || c.ownerId === me.id);
  },
  'GET /api/centers/:id': async (p) => { const r = await store.get('SELECT * FROM centers WHERE id=?', [p.id]); return r ? publicCenter(oCenter(r)) : err(404); },
  'POST /api/centers': async (p, q, body, req) => {
    const me = await authUser(req); if (!me) return err(401, 'inicia sesión para registrar un centro');
    const id = 'c-' + now() + '-' + rid();
    const c = Object.assign({}, body, { id, status: 'pendiente', distance: body.distance || 0.5, ownerId: me.id, ownerPhone: me.phone, stats: body.stats || { reportadas: 0, confirmadas: 0, entregadas: 0, voluntarios: 0 } });
    await store.insert('centers', { id, name: c.name || 'Centro', status: c.status, estado: c.estado || '', municipio: c.municipio || '', parroquia: c.parroquia || '', distance: c.distance, data: JSON.stringify(c), created_at: now() });
    return c;
  },
  'PATCH /api/centers/:id': async (p, q, body, req) => {
    const me = await authUser(req);
    const r = await store.get('SELECT * FROM centers WHERE id=?', [p.id]); if (!r) return err(404);
    const c0 = oCenter(r); if (!ownsCenter(me, c0)) return err(403, 'no autorizado');
    const c = Object.assign(c0, body, { ownerId: c0.ownerId, ownerPhone: c0.ownerPhone }); // no permitir cambiar dueño
    await store.run('UPDATE centers SET name=?,status=?,estado=?,municipio=?,parroquia=?,data=? WHERE id=?', [c.name, c.status, c.estado || '', c.municipio || '', c.parroquia || '', JSON.stringify(c), p.id]);
    return c;
  },
  'POST /api/centers/:id/updates': async (p, q, body, req) => {
    const me = await authUser(req);
    const r = await store.get('SELECT * FROM centers WHERE id=?', [p.id]); if (!r) return err(404);
    const c = oCenter(r); if (!ownsCenter(me, c)) return err(403, 'no autorizado');
    c.updates = [{ type: body.type || 'aviso', text: body.text || '', photo: body.photo || null, date: 'Ahora' }, ...(c.updates || [])];
    await store.run('UPDATE centers SET data=? WHERE id=?', [JSON.stringify(c), p.id]);
    return c;
  },

  // ---- logística del centro: movimientos (entradas/salidas/beneficiarios) ----
  'GET /api/centers/:id/movements': async (p, q, body, req) => {
    const me = await authUser(req);
    const r = await store.get('SELECT * FROM centers WHERE id=?', [p.id]); if (!r) return err(404);
    const c = oCenter(r); if (!ownsCenter(me, c)) return err(403, 'no autorizado');
    const movs = (await store.all('SELECT * FROM movements WHERE center_id=? ORDER BY id DESC LIMIT 500', [p.id])).map(oMovement);
    return { center: { id: c.id, name: c.name }, movements: movs, ...summarizeMovements(movs) };
  },
  'POST /api/centers/:id/movements': async (p, q, body, req) => {
    const me = await authUser(req);
    const r = await store.get('SELECT * FROM centers WHERE id=?', [p.id]); if (!r) return err(404);
    const c = oCenter(r); if (!ownsCenter(me, c)) return err(403, 'no autorizado');
    const type = ['entrada', 'salida', 'beneficiarios'].includes(body.type) ? body.type : err(400, 'tipo inválido');
    const data = { quien: (me && me.nombre) || '', nota: (body.nota || '').slice(0, 400) };
    if (type === 'beneficiarios') { data.familias = num(body.familias); data.personas = num(body.personas); }
    else {
      data.items = (Array.isArray(body.items) ? body.items : []).map(it => ({
        insumo: ('' + (it.insumo || '')).slice(0, 80), cantidad: num(it.cantidad), unidad: ('' + (it.unidad || '')).slice(0, 24),
        categoria: ['seco', 'refrigerado', 'medicina', 'higiene', 'agua', 'otros'].includes(it.categoria) ? it.categoria : 'otros',
        pesoKg: num(it.pesoKg),
        concentracion: ('' + (it.concentracion || '')).slice(0, 40), presentacion: ('' + (it.presentacion || '')).slice(0, 40),
        forma: ['solido', 'liquido'].includes(it.forma) ? it.forma : '',
      })).filter(it => it.insumo && it.cantidad > 0);
      if (!data.items.length) return err(400, 'agrega al menos un insumo con cantidad');
      if (type === 'entrada') data.origen = ('' + (body.origen || '')).slice(0, 120);
      if (type === 'salida') { data.destino = ('' + (body.destino || '')).slice(0, 120); data.estado = body.destino ? 'enviado' : ''; }
    }
    const id = await store.insert('movements', { center_id: p.id, type, data: JSON.stringify(data), created_at: now() });
    return oMovement(await store.get('SELECT * FROM movements WHERE id=?', [id]));
  },
  'POST /api/movements/:id/estado': async (p, q, body, req) => {
    const me = await authUser(req);
    const r = await store.get('SELECT * FROM movements WHERE id=?', [p.id]); if (!r) return err(404);
    const cr = await store.get('SELECT * FROM centers WHERE id=?', [r.center_id]);
    if (!ownsCenter(me, cr ? oCenter(cr) : null)) return err(403, 'no autorizado');
    const m = oMovement(r); m.estado = ['enviado', 'entregado', 'recibido'].includes(body.estado) ? body.estado : m.estado;
    delete m.id; delete m.centerId; delete m.createdAt; delete m.type;
    await store.run('UPDATE movements SET data=? WHERE id=?', [JSON.stringify(m), p.id]);
    return oMovement(await store.get('SELECT * FROM movements WHERE id=?', [p.id]));
  },

  // ---- donaciones ----
  'GET /api/donations': async (p, q, body, req) => {
    const me = await authUser(req); if (!me) return err(401, 'inicia sesión');
    if (q.center) {
      const r = await store.get('SELECT * FROM centers WHERE id=?', [q.center]); if (!r) return err(404);
      if (!ownsCenter(me, oCenter(r))) return err(403, 'no autorizado');
      return (await store.all('SELECT * FROM donations WHERE center_id=? ORDER BY id DESC', [q.center])).map(oDon);
    }
    if (!me.admin) return err(403, 'no autorizado');
    return (await store.all('SELECT * FROM donations ORDER BY id DESC')).map(oDon);
  },
  'POST /api/donations': async (p, q, body) => {
    const ts = now();
    const id = await store.insert('donations', { center_id: body.centerId || null, center_name: body.centerName || 'Fondo general', estado: 'Reportada', data: JSON.stringify(body), created_at: ts });
    if (body.centerId) {
      const r = await store.get('SELECT * FROM centers WHERE id=?', [body.centerId]);
      if (r) { const c = oCenter(r); c.stats = c.stats || {}; c.stats.reportadas = (c.stats.reportadas || 0) + 1; await store.run('UPDATE centers SET data=? WHERE id=?', [JSON.stringify(c), body.centerId]); }
      // Donación de insumos físicos → entra al inventario del centro como "entrada".
      const items = (Array.isArray(body.items) ? body.items : []).map(it => ({ insumo: ('' + (it.insumo || '')).slice(0, 80), cantidad: num(it.cantidad), unidad: ('' + (it.unidad || '')).slice(0, 24) })).filter(it => it.insumo && it.cantidad > 0);
      if (items.length) {
        const donante = body.anonimo ? 'Donante anónimo' : (('' + (body.donante || '')).slice(0, 80) || 'Donante');
        const movData = { items, origen: donante, donante, source: 'donacion', donationId: id, nota: ('' + (body.mensaje || '')).slice(0, 200) };
        await store.insert('movements', { center_id: body.centerId, type: 'entrada', data: JSON.stringify(movData), created_at: ts });
      }
    }
    return oDon(await store.get('SELECT * FROM donations WHERE id=?', [id]));
  },
  'PATCH /api/donations/:id': async (p, q, body, req) => {
    const me = await authUser(req);
    const r = await store.get('SELECT * FROM donations WHERE id=?', [p.id]); if (!r) return err(404);
    const c = r.center_id ? await store.get('SELECT * FROM centers WHERE id=?', [r.center_id]) : null;
    if (!ownsCenter(me, c ? oCenter(c) : null)) return err(403, 'no autorizado');
    await store.run('UPDATE donations SET estado=? WHERE id=?', [body.estado, p.id]);
    if (body.estado && body.estado.startsWith('Confirmada') && r.center_id) {
      const c = await store.get('SELECT * FROM centers WHERE id=?', [r.center_id]);
      if (c) { const o = oCenter(c); o.stats = o.stats || {}; o.stats.confirmadas = (o.stats.confirmadas || 0) + 1; await store.run('UPDATE centers SET data=? WHERE id=?', [JSON.stringify(o), r.center_id]); }
    }
    return oDon(await store.get('SELECT * FROM donations WHERE id=?', [p.id]));
  },

  // ---- voluntarios ----
  'POST /api/volunteers': async (p, q, body) => {
    const id = await store.insert('volunteers', { whatsapp: body.whatsapp || '', cedula: body.cedula || '', nombre: `${body.nombre || ''} ${body.apellido || ''}`.trim(), data: JSON.stringify(body), created_at: now() });
    return oVol(await store.get('SELECT * FROM volunteers WHERE id=?', [id]));
  },
  'GET /api/volunteers/lookup': async (p, q) => {
    const term = (q.q || '').trim(); if (!term) return { volunteer: null };
    const r = await store.get('SELECT * FROM volunteers WHERE whatsapp=? OR cedula=? OR whatsapp LIKE ? OR cedula LIKE ? ORDER BY id DESC LIMIT 1', [term, term, '%' + term + '%', '%' + term + '%']);
    return { volunteer: r ? oVol(r) : null };
  },
  'PATCH /api/volunteers/:id': async (p, q, body) => {
    const r = await store.get('SELECT * FROM volunteers WHERE id=?', [p.id]); if (!r) return err(404);
    const v = Object.assign(oVol(r), body);
    await store.run('UPDATE volunteers SET data=? WHERE id=?', [JSON.stringify(v), p.id]);
    return v;
  },

  // ---- postulaciones ----
  'POST /api/applications': async (p, q, body) => {
    const id = await store.insert('applications', { volunteer_id: body.volunteer_id || null, center_id: body.center_id || null, center_name: body.center_name || '', task: body.task || '', status: 'pending', created_at: now() });
    return oApp(await store.get('SELECT * FROM applications WHERE id=?', [id]));
  },
  'GET /api/applications': async (p, q) => {
    let rows;
    if (q.volunteer) rows = await store.all('SELECT * FROM applications WHERE volunteer_id=? ORDER BY id DESC', [q.volunteer]);
    else if (q.center) rows = await store.all('SELECT * FROM applications WHERE center_id=? ORDER BY id DESC', [q.center]);
    else rows = await store.all('SELECT * FROM applications ORDER BY id DESC');
    return rows.map(oApp);
  },

  // ---- personas (desaparecidos / encontrados) ----
  'GET /api/persons': async (p, q) => {
    // Filtrado y paginación en SQL: la tabla puede tener decenas de miles de filas.
    // Por defecto ocultamos duplicados (dup_of != NULL); ?dups=1 los incluye.
    const where = ['lower(data) NOT LIKE ?']; const params = ['%"hidden":true%'];
    if (!q.dups) where.push('dup_of IS NULL');
    if (q.status) { where.push('status = ?'); params.push(q.status); }
    if (q.q) { where.push('lower(data) LIKE ?'); params.push('%' + String(q.q).toLowerCase() + '%'); }
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 60, 1), 200);
    const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
    const sql = `SELECT * FROM persons WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`;
    return (await store.all(sql, [...params, limit, offset])).map(oPersonPublic); // allowlist: sin PII de contacto
  },
  'GET /api/persons/stats': async () => {
    // Conteos ya depurados (sin duplicados): dup_of IS NULL.
    const rows = await store.all("SELECT status, COUNT(*) c FROM persons WHERE dup_of IS NULL AND lower(data) NOT LIKE ? GROUP BY status", ['%"hidden":true%']);
    const by = {}; let total = 0;
    for (const r of rows) { by[r.status] = num(r.c); total += num(r.c); }
    return { total, desaparecidos: by.desaparecido || 0, encontrados: by.encontrado || 0 };
  },
  'GET /api/persons/:id': async (p) => {
    const r = await store.get('SELECT * FROM persons WHERE id=?', [p.id]); if (!r) return err(404);
    const person = oPerson(r);
    // El contacto de la familia NO se incluye aquí (endpoint enumerable): se revela aparte con rate-limit.
    person.tieneContacto = !!(person.contactoTel || person.contactoNombre);
    for (const k of PERSON_CONTACT_FIELDS) delete person[k];
    person.sightings = (await store.all('SELECT * FROM sightings WHERE person_id=? ORDER BY id DESC', [p.id])).map(oSight);
    return person;
  },
  // Revela el contacto de la familia bajo petición explícita y con límite estricto (anti-scraping).
  'GET /api/persons/:id/contacto': async (p, q, body, req) => {
    if (revealLimited(clientIp(req))) return err(429, 'Demasiadas solicitudes de contacto. Intenta en unos minutos.');
    const r = await store.get('SELECT * FROM persons WHERE id=?', [p.id]); if (!r) return err(404);
    const o = oPerson(r);
    return { contactoTel: o.contactoTel || '', contactoNombre: o.contactoNombre || '', relacion: o.relacion || '' };
  },
  'POST /api/persons': async (p, q, body) => {
    const id = await store.insert('persons', { status: body.status || 'desaparecido', nombre: `${body.nombre || ''} ${body.apellido || ''}`.trim(), estado: body.estado || '', municipio: body.municipio || '', data: JSON.stringify(body), created_at: now() });
    return oPerson(await store.get('SELECT * FROM persons WHERE id=?', [id]));
  },
  'PATCH /api/persons/:id': async (p, q, body) => {
    const r = await store.get('SELECT * FROM persons WHERE id=?', [p.id]); if (!r) return err(404);
    const o = Object.assign(oPerson(r), body);
    await store.run('UPDATE persons SET status=?,data=? WHERE id=?', [o.status, JSON.stringify(o), p.id]);
    return o;
  },
  'POST /api/persons/:id/sightings': async (p, q, body) => {
    const r = await store.get('SELECT * FROM persons WHERE id=?', [p.id]); if (!r) return err(404);
    const id = await store.insert('sightings', { person_id: p.id, data: JSON.stringify({ ...body, date: 'Ahora' }), created_at: now() });
    return oSight(await store.get('SELECT * FROM sightings WHERE id=?', [id]));
  },

  // ---- cuentas / sesión (teléfono + PIN de 4 dígitos) ----
  'GET /api/users/check': async (p, q) => {
    const phone = normPhone(q.phone);
    const r = phone ? await store.get('SELECT nombre FROM users WHERE phone=?', [phone]) : null;
    return { exists: !!r, nombre: r ? r.nombre : '' };
  },
  'POST /api/users': async (p, q, body) => {
    const phone = normPhone(body.phone); const pin = (body.pin || '').trim();
    if (!phone) return err(400, 'falta el teléfono');
    if (!/^\d{4}$/.test(pin)) return err(400, 'PIN inválido (4 dígitos)');
    if (await store.get('SELECT id FROM users WHERE phone=?', [phone])) return err(409, 'ya existe una cuenta con ese número');
    const data = { ...body }; delete data.pin;
    const id = await store.insert('users', { phone, nombre: body.nombre || '', apellido: body.apellido || '', estado: body.estado || '', municipio: body.municipio || '', parroquia: body.parroquia || '', pin_hash: hashPin(phone, pin), data: JSON.stringify(data), created_at: now() });
    const u = oUser(await store.get('SELECT * FROM users WHERE id=?', [id])); u.admin = isAdmin(phone);
    return { user: u, token: await createSession(u.id) };
  },
  'POST /api/users/login': async (p, q, body) => {
    const phone = normPhone(body.phone); const pin = (body.pin || '').trim();
    if (tooManyAttempts(phone)) return err(429, 'Demasiados intentos. Espera unos minutos.');
    const r = await store.get('SELECT * FROM users WHERE phone=?', [phone]);
    if (!r || !verifyPin(phone, pin, r.pin_hash)) { noteFail(phone); return err(401, 'PIN incorrecto'); }
    clearFail(phone);
    const u = oUser(r); u.admin = isAdmin(phone);
    return { user: u, token: await createSession(u.id) };
  },
  'PATCH /api/users/:id': async (p, q, body, req) => {
    const me = await authUser(req); if (!me) return err(401, 'inicia sesión');
    if (String(me.id) !== String(p.id) && !me.admin) return err(403, 'no autorizado');
    const r = await store.get('SELECT * FROM users WHERE id=?', [p.id]); if (!r) return err(404);
    const data = Object.assign(oUser(r), body); delete data.pin; delete data.admin; delete data.token;
    const pin_hash = (body.pin && /^\d{4}$/.test(body.pin)) ? hashPin(r.phone, body.pin) : r.pin_hash;
    await store.run('UPDATE users SET nombre=?,apellido=?,estado=?,municipio=?,parroquia=?,pin_hash=?,data=? WHERE id=?', [data.nombre || '', data.apellido || '', data.estado || '', data.municipio || '', data.parroquia || '', pin_hash, JSON.stringify(data), p.id]);
    const u = oUser(await store.get('SELECT * FROM users WHERE id=?', [p.id])); u.admin = isAdmin(u.phone); return u;
  },

  // ---- administrador / verificador ----
  'GET /api/admin/overview': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const pendientes = (await store.all("SELECT * FROM centers WHERE status='pendiente' ORDER BY created_at DESC")).map(oCenter);
    const persons = (await store.all('SELECT * FROM persons ORDER BY id DESC LIMIT 200')).map(oPerson);
    const personsTotal = num((await store.get('SELECT COUNT(*) c FROM persons')).c);
    return { pendientes, persons, totals: { centers: num((await store.get('SELECT COUNT(*) c FROM centers')).c), persons: personsTotal, users: num((await store.get('SELECT COUNT(*) c FROM users')).c) }, metrics: await getMetrics(), admin: me.nombre };
  },
  'GET /api/admin/dashboard': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const count = async t => num((await store.get(`SELECT COUNT(*) c FROM ${t}`)).c);
    const toArr = o => Object.entries(o).map(([k, c]) => ({ k, c })).sort((a, b) => b.c - a.c);
    const grp = async (t, col) => toArr((await store.all(`SELECT ${col} AS k, COUNT(*) AS c FROM ${t} GROUP BY ${col}`)).reduce((a, r) => { a[r.k || '(sin dato)'] = num(r.c); return a; }, {}));
    // centros: estado/status por columna, necesidades desde el JSON
    const centers = await store.all('SELECT status, estado, data FROM centers');
    const byEstado = {}, byStatus = {}, needCount = {};
    for (const r of centers) {
      byEstado[r.estado || '(sin estado)'] = (byEstado[r.estado || '(sin estado)'] || 0) + 1;
      byStatus[r.status || '(sin)'] = (byStatus[r.status || '(sin)'] || 0) + 1;
      try { for (const n of (JSON.parse(r.data).needs || [])) needCount[n.key] = (needCount[n.key] || 0) + 1; } catch {}
    }
    // donaciones: status en columna 'estado', método en el JSON
    const dons = await store.all('SELECT estado, data FROM donations');
    const donStatus = {}, donMethod = {};
    for (const r of dons) {
      donStatus[r.estado || '(sin)'] = (donStatus[r.estado || '(sin)'] || 0) + 1;
      try { const d = JSON.parse(r.data); const m = d.metodo || d.tipo || d.method || '(sin método)'; donMethod[m] = (donMethod[m] || 0) + 1; } catch {}
    }
    // ---- Serie temporal (hora local de Venezuela, UTC-4) + actividad reciente ----
    const OFF = 4 * 3600 * 1000;                       // Caracas = UTC-4 (sin horario de verano)
    const localISO = ms => new Date(ms - OFF).toISOString();
    const tnow = now();
    const dayKeys = [], hourKeys = [];
    for (let i = 13; i >= 0; i--) dayKeys.push(localISO(tnow - i * 864e5).slice(0, 10));   // últimos 14 días
    for (let i = 23; i >= 0; i--) hourKeys.push(localISO(tnow - i * 3600e3).slice(0, 13)); // últimas 24 horas
    const since = tnow - 14 * 864e5;
    const tsOf = async t => (await store.all(`SELECT created_at FROM ${t} WHERE created_at >= ?`, [since])).map(r => num(r.created_at));
    const bucket = (list, keys, len) => { const m = {}; keys.forEach(k => m[k] = 0); for (const ms of list) { const k = localISO(ms).slice(0, len); if (k in m) m[k]++; } return keys.map(k => m[k]); };
    const [tsCenters, tsUsers, tsDons, tsVols, tsPersons] = await Promise.all([tsOf('centers'), tsOf('users'), tsOf('donations'), tsOf('volunteers'), tsOf('persons')]);
    const mm = {}; for (const r of await store.all('SELECT k, v FROM metrics')) mm[r.k] = num(r.v);
    const series = {
      dayLabels: dayKeys.map(d => d.slice(5)), hourLabels: hourKeys.map(h => h.slice(11) + 'h'),
      daily: { views: dayKeys.map(d => mm['vd_' + d] || 0), centers: bucket(tsCenters, dayKeys, 10), users: bucket(tsUsers, dayKeys, 10), donations: bucket(tsDons, dayKeys, 10), volunteers: bucket(tsVols, dayKeys, 10), persons: bucket(tsPersons, dayKeys, 10) },
      hourly: { views: hourKeys.map(h => mm['vh_' + h] || 0), centers: bucket(tsCenters, hourKeys, 13), users: bucket(tsUsers, hourKeys, 13), donations: bucket(tsDons, hourKeys, 13), volunteers: bucket(tsVols, hourKeys, 13), persons: bucket(tsPersons, hourKeys, 13) },
    };
    const c1 = l => l.filter(ms => ms >= tnow - 864e5).length, c7 = l => l.filter(ms => ms >= tnow - 7 * 864e5).length;
    const newCounts = {
      centers: { d1: c1(tsCenters), d7: c7(tsCenters) }, users: { d1: c1(tsUsers), d7: c7(tsUsers) },
      donations: { d1: c1(tsDons), d7: c7(tsDons) }, volunteers: { d1: c1(tsVols), d7: c7(tsVols) },
      persons: { d1: c1(tsPersons), d7: c7(tsPersons) },
      views: { d1: hourKeys.reduce((s, h) => s + (mm['vh_' + h] || 0), 0), d7: dayKeys.reduce((s, d) => s + (mm['vd_' + d] || 0), 0) },
    };
    const recentCenters = (await store.all('SELECT id, name, status, estado, municipio, created_at, data FROM centers ORDER BY created_at DESC LIMIT 12'))
      .map(r => { let d = {}; try { d = JSON.parse(r.data); } catch {} return { id: r.id, name: r.name || d.name || 'Centro', estado: r.estado || d.estado, municipio: r.municipio || d.municipio, parroquia: d.parroquia || '', status: r.status, created_at: num(r.created_at) }; });
    const recentPersons = (await store.all('SELECT id, status, nombre, estado, municipio, created_at, data FROM persons ORDER BY id DESC LIMIT 12'))
      .map(r => { let d = {}; try { d = JSON.parse(r.data); } catch {} return { id: r.id, nombre: r.nombre || [d.nombre, d.apellido].filter(Boolean).join(' ') || 'Persona', estado: r.estado || d.estado, municipio: r.municipio || d.municipio, status: r.status, created_at: num(r.created_at) }; });
    const pendientes = (await store.all("SELECT * FROM centers WHERE status='pendiente' ORDER BY created_at DESC LIMIT 20")).map(oCenter);
    return {
      centers: { total: centers.length, byStatus: toArr(byStatus), byEstado: toArr(byEstado), topNeeds: toArr(needCount).slice(0, 10) },
      donations: { total: dons.length, byStatus: toArr(donStatus), byMethod: toArr(donMethod) },
      volunteers: await count('volunteers'),
      applications: await count('applications'),
      persons: { total: await count('persons'), byStatus: await grp('persons', 'status') },
      users: await count('users'),
      visits: await getMetrics(),
      series, newCounts, pendientes,
      recent: { centers: recentCenters, persons: recentPersons },
    };
  },
  // ---- Usuarios registrados (admin): lista con su data ----
  'GET /api/admin/users': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const out = [];
    for (const r of await store.all('SELECT * FROM users ORDER BY id DESC LIMIT 1000')) {
      let d = {}; try { d = JSON.parse(r.data || '{}') || {}; } catch {}
      out.push({
        id: r.id, nombre: r.nombre || d.nombre || '', apellido: r.apellido || d.apellido || '', phone: r.phone,
        estado: r.estado || d.estado || '', municipio: r.municipio || d.municipio || '', parroquia: r.parroquia || d.parroquia || '',
        aporte: d.aporte || d.rol || '', admin: isAdmin(r.phone), created_at: num(r.created_at),
      });
    }
    return out;
  },
  // ---- Donaciones (admin): todas las donaciones reportadas ----
  // Resiliente: si una fila tiene JSON malformado, se omiten sus extras (NO rompe la lista entera).
  'GET /api/admin/donations': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const out = [];
    for (const r of await store.all('SELECT * FROM donations ORDER BY id DESC LIMIT 1000')) {
      let d = {}; try { d = JSON.parse(r.data || '{}') || {}; } catch {}
      out.push({
        id: r.id, centerName: r.center_name || 'Fondo general', centerId: r.center_id || null, estado: r.estado || '',
        donante: d.anonimo ? 'Anónimo' : (d.donante || d.nombre || ''),
        metodo: d.metodo || d.tipo || d.method || '', monto: d.monto || '', moneda: d.moneda || '',
        items: Array.isArray(d.items) ? d.items : [], mensaje: d.mensaje || '', created_at: num(r.created_at),
      });
    }
    return out;
  },
  // ---- Insumos físicos (admin): inventario real agregado (derivado de movimientos: entradas − salidas) + por centro ----
  'GET /api/admin/inventory': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const movsAll = (await store.all('SELECT * FROM movements ORDER BY id DESC')).map(oMovement);
    const byCenter = {}; for (const m of movsAll) (byCenter[m.centerId] = byCenter[m.centerId] || []).push(m);
    const centers = await store.all('SELECT id,name,estado,municipio FROM centers');
    const agg = {}; const centros = [];
    for (const c of centers) {
      const sum = summarizeMovements(byCenter[c.id] || []);
      const positivos = sum.inventario.filter(x => x.cantidad > 0);
      if (!positivos.length) continue;
      let total = 0;
      for (const it of positivos) {
        agg[it.insumo] = agg[it.insumo] || { insumo: it.insumo, unidad: it.unidad || '', cantidad: 0 };
        agg[it.insumo].cantidad += it.cantidad; if (it.unidad && !agg[it.insumo].unidad) agg[it.insumo].unidad = it.unidad;
        total += it.cantidad;
      }
      centros.push({ id: c.id, name: c.name, estado: c.estado, municipio: c.municipio, items: positivos.length, total });
    }
    const insumos = Object.values(agg).sort((a, b) => b.cantidad - a.cantidad);
    centros.sort((a, b) => b.total - a.total);
    return { insumos, centros, totalUnidades: insumos.reduce((s, i) => s + i.cantidad, 0), tiposInsumo: insumos.length, centrosConInventario: centros.length };
  },
  // ---- Actividad en vivo (admin): historial global unificado de lo más reciente ----
  'GET /api/admin/activity': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const ev = [];
    const itemsTxt = arr => (Array.isArray(arr) ? arr : []).map(i => `${i.cantidad || ''} ${i.insumo || i.label || ''} ${i.unidad || ''}`.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ');
    const parse = s => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
    const det = (...pairs) => pairs.filter(x => x && x[1] != null && x[1] !== '').map(x => ({ k: x[0], v: String(x[1]) }));
    for (const r of await store.all('SELECT id,name,estado,municipio,status,data,created_at FROM centers ORDER BY id DESC LIMIT 30')) {
      const d = parse(r.data);
      ev.push({ kind: 'centro', icon: 'building', color: '#173e72', title: 'Nuevo centro de acopio', text: r.name || 'Centro', zona: [r.municipio, r.estado].filter(Boolean).join(', '), created_at: num(r.created_at), link: { screen: 'center-public', id: r.id },
        details: det(['Centro', r.name], ['Estado', r.estado], ['Municipio', r.municipio], ['Parroquia', d.parroquia], ['Verificación', r.status], ['Dirección', d.address || d.direccion]) });
    }
    for (const r of await store.all('SELECT id,center_name,estado,data,created_at FROM donations ORDER BY id DESC LIMIT 30')) {
      const d = parse(r.data); const it = itemsTxt(d.items); const mo = d.monto ? `${d.monto} ${d.moneda || ''}`.trim() : '';
      ev.push({ kind: 'donacion', icon: 'money', color: '#0e3a8c', title: 'Nueva donación', text: `${it || mo || 'Donación'} → ${r.center_name || 'Fondo general'}`, zona: '', created_at: num(r.created_at),
        details: det(['Destino', r.center_name || 'Fondo general'], ['Donante', d.anonimo ? 'Anónimo' : (d.donante || d.nombre)], ['Insumos', it], ['Monto', mo], ['Método', d.metodo || d.tipo || d.method], ['Estado', r.estado], ['Mensaje', d.mensaje]) });
    }
    for (const r of await store.all('SELECT id,nombre,status,estado,municipio,data,created_at FROM persons ORDER BY id DESC LIMIT 30')) {
      const d = parse(r.data);
      ev.push({ kind: 'persona', icon: 'usersearch', color: '#5b6675', title: r.status === 'encontrado' ? 'Persona localizada' : 'Persona reportada', text: r.nombre || 'Persona', zona: [r.municipio, r.estado].filter(Boolean).join(', '), created_at: num(r.created_at), link: { action: 'open-person', id: r.id },
        details: det(['Nombre', r.nombre], ['Estado', r.status], ['Edad', d.edad], ['Sexo', d.sexo], ['Zona', [d.parroquia, r.municipio, r.estado].filter(Boolean).join(', ')], ['Lugar', d.lugar], ['Contacto', d.contactoTel], ['Descripción', d.descripcion]) });
    }
    for (const r of await store.all('SELECT id,nombre,phone,estado,municipio,data,created_at FROM users ORDER BY id DESC LIMIT 30')) {
      const d = parse(r.data);
      ev.push({ kind: 'usuario', icon: 'user', color: '#0e7490', title: 'Nuevo usuario', text: [r.nombre, d.apellido].filter(Boolean).join(' ') || 'Usuario', zona: [r.municipio, r.estado].filter(Boolean).join(', '), created_at: num(r.created_at),
        details: det(['Nombre', [r.nombre, d.apellido].filter(Boolean).join(' ')], ['Teléfono', r.phone], ['Aporte', d.aporte], ['Zona', [d.parroquia, r.municipio, r.estado].filter(Boolean).join(', ')]) });
    }
    for (const r of await store.all('SELECT id,nombre,data,created_at FROM volunteers ORDER BY id DESC LIMIT 30')) {
      const d = parse(r.data);
      ev.push({ kind: 'voluntario', icon: 'users', color: '#214e89', title: 'Nuevo voluntario', text: r.nombre || 'Voluntario', zona: '', created_at: num(r.created_at),
        details: det(['Nombre', r.nombre], ['WhatsApp', d.whatsapp], ['Cédula', d.cedula]) });
    }
    for (const r of await store.all('SELECT id,tipo,nombre,contacto,urgencia,estado,municipio,data,created_at FROM help_requests ORDER BY id DESC LIMIT 30')) {
      const d = parse(r.data);
      ev.push({ kind: 'solicitud', icon: 'alert', color: '#cf142b', title: 'Solicitud de ayuda' + (r.urgencia ? ' · ' + r.urgencia : ''), text: [r.tipo, r.nombre].filter(Boolean).join(' — ') || d.descripcion || 'Solicitud', zona: [r.municipio, r.estado].filter(Boolean).join(', '), created_at: num(r.created_at), link: { action: 'open-help-requests' },
        details: det(['Tipo', r.tipo], ['Urgencia', r.urgencia], ['Nombre', r.nombre], ['Teléfono', r.contacto || d.contacto], ['Zona', [d.parroquia, r.municipio, r.estado].filter(Boolean).join(', ')], ['Lugar', d.lugar], ['Descripción', d.descripcion]) });
    }
    for (const r of await store.all('SELECT id,center_id,type,data,created_at FROM movements ORDER BY id DESC LIMIT 30')) {
      const d = parse(r.data); const it = itemsTxt(d.items);
      const t = r.type === 'entrada' ? 'Entrada de insumos' : r.type === 'salida' ? 'Salida de insumos' : 'Movimiento';
      ev.push({ kind: 'movimiento', icon: 'box', color: '#0e7490', title: t, text: it || (d.familias ? d.familias + ' familias atendidas' : 'Movimiento'), zona: '', created_at: num(r.created_at), link: { action: 'open-admin-center', id: r.center_id },
        details: det(['Tipo', r.type], ['Insumos', it], ['Familias', d.familias], ['Personas', d.personas], ['Origen', d.origen], ['Destino', d.destino], ['Nota', d.nota]) });
    }
    ev.sort((a, b) => b.created_at - a.created_at);
    return { events: ev.slice(0, Math.min(Number(q.limit) || 70, 120)), now: now() };
  },
  // ---- Detalle completo de un centro (admin): inventario + donaciones + movimientos ----
  'GET /api/admin/centers/:id/detail': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const r = await store.get('SELECT * FROM centers WHERE id=?', [p.id]); if (!r) return err(404);
    const c = oCenter(r);
    const movs = (await store.all('SELECT * FROM movements WHERE center_id=? ORDER BY id DESC', [p.id])).map(oMovement);
    const sum = summarizeMovements(movs);
    const donations = (await store.all('SELECT id,estado,data,created_at FROM donations WHERE center_id=? ORDER BY id DESC LIMIT 100', [p.id]))
      .map(dr => { const d = (() => { try { return JSON.parse(dr.data); } catch { return {}; } })(); return { id: dr.id, estado: dr.estado, donante: d.anonimo ? 'Anónimo' : (d.donante || d.nombre || ''), items: Array.isArray(d.items) ? d.items : [], monto: d.monto || '', moneda: d.moneda || '', metodo: d.metodo || d.tipo || '', created_at: num(dr.created_at) }; });
    return {
      center: { id: c.id, name: c.name, estado: c.estado, municipio: c.municipio, parroquia: c.parroquia, status: c.status, needs: c.needs || [], stats: c.stats || {} },
      inventario: sum.inventario, totals: sum.totals, hoy: sum.hoy,
      movements: movs.slice(0, 40).map(m => ({ id: m.id, type: m.type, items: m.items || [], familias: m.familias, personas: m.personas, origen: m.origen, destino: m.destino, created_at: m.createdAt })),
      donations,
    };
  },
  'POST /api/admin/centers/:id': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const r = await store.get('SELECT * FROM centers WHERE id=?', [p.id]); if (!r) return err(404);
    const c = oCenter(r); c.status = body.status || c.status; c.verifiedBy = me.nombre;
    await store.run('UPDATE centers SET status=?,data=? WHERE id=?', [c.status, JSON.stringify(c), p.id]);
    return c;
  },
  'POST /api/admin/persons/:id': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const r = await store.get('SELECT * FROM persons WHERE id=?', [p.id]); if (!r) return err(404);
    const o = oPerson(r); o.hidden = !!body.hidden;
    await store.run('UPDATE persons SET data=? WHERE id=?', [JSON.stringify(o), p.id]);
    return o;
  },
  // Coordinador: resumen de logística de TODA la red (entradas/salidas/inventario/beneficiarios por centro).
  'GET /api/admin/logistics': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const movsAll = (await store.all('SELECT * FROM movements ORDER BY id DESC')).map(oMovement);
    const byCenter = {}; for (const m of movsAll) (byCenter[m.centerId] = byCenter[m.centerId] || []).push(m);
    const centers = (await store.all('SELECT id,name,estado,municipio FROM centers')).map(c => ({ id: c.id, name: c.name, estado: c.estado, municipio: c.municipio }));
    const rows = centers.map(c => ({ ...c, ...summarizeMovements(byCenter[c.id] || []) }))
      .filter(c => c.totals.entradas || c.totals.salidas || c.totals.familias || c.totals.items)
      .sort((a, b) => (b.totals.entradas + b.totals.salidas) - (a.totals.entradas + a.totals.salidas));
    const red = rows.reduce((t, c) => ({ entradas: t.entradas + c.totals.entradas, salidas: t.salidas + c.totals.salidas, despachos: t.despachos + c.totals.despachos, familias: t.familias + c.totals.familias, personas: t.personas + c.totals.personas, kgStock: t.kgStock + (c.totals.kgStock || 0) }), { entradas: 0, salidas: 0, despachos: 0, familias: 0, personas: 0, kgStock: 0 });
    red.kgStock = r2(red.kgStock); red.toneladasStock = r2(red.kgStock / 1000);
    return { centros: rows, red, activos: rows.length };
  },
  // Coordinador: asigna (o quita) el admin de un centro por teléfono.
  'POST /api/admin/centers/:id/assign': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const r = await store.get('SELECT * FROM centers WHERE id=?', [p.id]); if (!r) return err(404);
    const c = oCenter(r); const phone = normPhone(body.phone);
    if (!phone) return err(400, 'teléfono inválido');
    c.adminPhones = Array.isArray(c.adminPhones) ? c.adminPhones : [];
    if (body.remove) c.adminPhones = c.adminPhones.filter(x => x !== phone);
    else if (!c.adminPhones.includes(phone)) c.adminPhones.push(phone);
    await store.run('UPDATE centers SET data=? WHERE id=?', [JSON.stringify(c), p.id]);
    return publicCenter(c);
  },
  // Importación masiva desde desaparecidosterremotovenezuela.com (gated por token de un solo uso).
  // Desactivado si no existe AYUDAVE_IMPORT_TOKEN. Header requerido: X-Import-Token.
  'POST /api/admin/import-persons': async (p, q, body, req) => {
    const token = process.env.AYUDAVE_IMPORT_TOKEN;
    if (!token) return err(404, 'no disponible');
    if ((req.headers['x-import-token'] || '') !== token) return err(403, 'token inválido');
    const max = q.max ? Number(q.max) : Infinity;
    const pageSize = q.pageSize ? Math.min(Number(q.pageSize) || 100, 100) : 100;
    console.log('[import] iniciando desde', DTV_API, 'max=' + max);
    const result = await importDtvPersons(store, { max, pageSize, log: m => console.log('[import]', m) });
    console.log('[import] terminado', JSON.stringify(result));
    return result;
  },
  // Importación por lotes: recibe filas ya mapeadas desde un cliente de confianza
  // (p.ej. la laptop, que SÍ alcanza la fuente cuando el datacenter está bloqueado).
  // body: { reset?: bool, rows: [{status,nombre,estado,municipio,data,created_at}, ...] }
  'POST /api/admin/import-batch': async (p, q, body, req) => {
    const token = process.env.AYUDAVE_IMPORT_TOKEN;
    if (!token) return err(404, 'no disponible');
    if ((req.headers['x-import-token'] || '') !== token) return err(403, 'token inválido');
    let deleted = 0;
    if (body.reset) { const r = await store.run('DELETE FROM persons WHERE data LIKE ?', ['%"source":"desaparecidosterremotovenezuela.com"%']); deleted = r.changes || 0; }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const clean = rows.filter(r => r && typeof r.data === 'string').map(r => ({
      status: r.status || 'desaparecido', nombre: r.nombre || 'Sin nombre',
      estado: r.estado || '', municipio: r.municipio || '', data: r.data, created_at: Number(r.created_at) || now(),
    }));
    for (let i = 0; i < clean.length; i += 500) await insertPersonsBatch(store, clean.slice(i, i + 500));
    const total = num((await store.get('SELECT COUNT(*) c FROM persons')).c);
    return { inserted: clean.length, deleted, total };
  },
  // Ingesta colaborativa: recibe registros CRUDOS de la fuente (tal cual la API de
  // desaparecidosterremotovenezuela.com) desde el navegador de un usuario en Venezuela
  // (bookmarklet), que sí pasa el geo-bloqueo. Mapea y upsert por source_id (idempotente).
  // CORS abierto + token. ?audit=1 dispara la depuración al terminar.
  'POST /api/admin/ingest': async (p, q, body, req) => {
    const token = process.env.AYUDAVE_IMPORT_TOKEN;
    if (!token) return err(404, 'no disponible');
    if ((req.headers['x-import-token'] || q.token || '') !== token) return err(403, 'token inválido');
    const items = Array.isArray(body.items) ? body.items : [];
    const seen = new Set(); const rows = [];
    for (const src of items) { if (src && src.id && !seen.has(src.id)) { seen.add(src.id); rows.push(mapDtvPerson(src)); } }
    for (let i = 0; i < rows.length; i += 500) await upsertPersons(store, rows.slice(i, i + 500));
    let audited = null;
    if (q.audit) { try { audited = await auditPersons(store, { apply: true }); } catch (e) { console.error('[ingest] audit', e.message); } }
    const total = num((await store.get('SELECT COUNT(*) c FROM persons')).c);
    console.log(`[ingest] recibidos ${items.length} · upsert ${rows.length} · total ${total}${q.audit ? ' · auditado' : ''}`);
    return { received: items.length, upserted: rows.length, total, audited };
  },

  // ---- configuración pública ----
  'GET /api/config': () => ({ googleMapsKey: process.env.AYUDAVE_GOOGLE_MAPS_KEY || loadConfig().googleMapsKey || '', gaId: process.env.AYUDAVE_GA_ID || loadConfig().gaId || '', aiPhoto: assistant.hasKey() }),

  // ---- auditoría de duplicados de la fuente (resultados reales) ----
  'GET /api/audit': async () => getAuditSummary(store),

  // ---- métricas públicas (visitas + agregados, sin datos sensibles) ----
  'GET /api/metrics': async () => {
    const c = async (t, w) => num((await store.get(`SELECT COUNT(*) c FROM ${t}${w ? ' WHERE ' + w : ''}`)).c);
    const rows = await store.all("SELECT status, COUNT(*) c FROM persons WHERE dup_of IS NULL AND lower(data) NOT LIKE ? GROUP BY status", ['%"hidden":true%']);
    const pby = {}; let ptotal = 0; for (const r of rows) { pby[r.status] = num(r.c); ptotal += num(r.c); }
    return {
      visits: await getMetrics(),
      centers: { total: await c('centers'), verificados: await c('centers', "status LIKE 'verificado%'") },
      persons: { total: ptotal, desaparecidos: pby.desaparecido || 0, encontrados: pby.encontrado || 0 },
      volunteers: await c('volunteers'),
      hospitals: { total: ocrHospitalsSummary().total },
      edificios: { total: edificiosCount() },
    };
  },

  // ---- personas en hospitales (datos OCR, repo abierto de @ecrespo) ----
  // Búsqueda por nombre/hospital/zona (y por cédula, que NO se devuelve).
  'GET /api/hospitals': async (p, q) => searchOcrHospitals(q.q, parseInt(q.limit, 10) || 60, q.hospital),
  'GET /api/hospitals/summary': async () => ocrHospitalsSummary(),

  // ---- solicitudes de ayuda (una persona pide ayuda) ----
  'POST /api/help-requests': async (p, q, body) => {
    const id = await store.insert('help_requests', {
      tipo: body.tipo || 'otro', nombre: (body.nombre || '').trim(), contacto: (body.contacto || '').trim(),
      estado: body.estado || '', municipio: body.municipio || '', urgencia: body.urgencia || 'Alta',
      status: 'abierta', data: JSON.stringify(body), created_at: now(),
    });
    return oHelp(await store.get('SELECT * FROM help_requests WHERE id=?', [id]));
  },
  'GET /api/help-requests': async (p, q) => {
    let list = (await store.all('SELECT * FROM help_requests ORDER BY id DESC LIMIT 300')).map(oHelp).filter(x => !x.hidden);
    if (q.status) list = list.filter(x => x.status === q.status);
    if (q.estado) list = list.filter(x => x.estado === q.estado);
    if (q.tipo) list = list.filter(x => x.tipo === q.tipo);
    if (q.q) { const t = q.q.toLowerCase(); list = list.filter(x => [x.nombre, x.lugar, x.estado, x.municipio, x.descripcion].filter(Boolean).join(' ').toLowerCase().includes(t)); }
    return list.slice(0, Math.min(parseInt(q.limit, 10) || 100, 300));
  },
  'PATCH /api/help-requests/:id': async (p, q, body, req) => {
    const me = await authUser(req); if (!me) return err(401, 'inicia sesión');
    const r = await store.get('SELECT * FROM help_requests WHERE id=?', [p.id]); if (!r) return err(404);
    const o = Object.assign(oHelp(r), body);
    await store.run('UPDATE help_requests SET status=?,data=? WHERE id=?', [o.status || 'abierta', JSON.stringify(o), p.id]);
    return o;
  },

  // ---- mascotas (perdidas / encontradas / refugio / veterinario) ----
  'POST /api/pets': async (p, q, body) => {
    const status = ['perdida', 'encontrada', 'refugio', 'veterinario'].includes(body.status) ? body.status : 'perdida';
    const clean = {
      status, tipo: ('' + (body.tipo || 'Otro')).slice(0, 30), nombre: ('' + (body.nombre || '')).slice(0, 80),
      descripcion: ('' + (body.descripcion || '')).slice(0, 600), foto: safeUrl(body.foto) || '',
      estado: ('' + (body.estado || '')).slice(0, 60), municipio: ('' + (body.municipio || '')).slice(0, 80),
      parroquia: ('' + (body.parroquia || '')).slice(0, 80), lugar: ('' + (body.lugar || '')).slice(0, 160),
      destino: ('' + (body.destino || '')).slice(0, 160), contacto: ('' + (body.contacto || '')).slice(0, 60),
      whatsapp: ('' + (body.whatsapp || '')).slice(0, 30),
    };
    const id = await store.insert('pets', { status: clean.status, tipo: clean.tipo, zona: clean.municipio || clean.estado, estado: clean.estado, data: JSON.stringify(clean), created_at: now() });
    return oPet(await store.get('SELECT * FROM pets WHERE id=?', [id]));
  },
  'GET /api/pets': async (p, q) => {
    let list = (await store.all('SELECT * FROM pets ORDER BY id DESC LIMIT 500')).map(oPet).filter(x => !x.hidden);
    if (q.status) list = list.filter(x => x.status === q.status);
    if (q.estado) list = list.filter(x => x.estado === q.estado);
    if (q.q) { const t = q.q.toLowerCase(); list = list.filter(x => [x.nombre, x.tipo, x.descripcion, x.estado, x.municipio, x.lugar].filter(Boolean).join(' ').toLowerCase().includes(t)); }
    return list.slice(0, Math.min(parseInt(q.limit, 10) || 200, 500));
  },
  'PATCH /api/pets/:id': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'no autorizado');
    const r = await store.get('SELECT * FROM pets WHERE id=?', [p.id]); if (!r) return err(404);
    const o = Object.assign(oPet(r), body);
    await store.run('UPDATE pets SET status=?,data=? WHERE id=?', [o.status || r.status, JSON.stringify(o), p.id]);
    return o;
  },

  // ---- reportes de servicios (luz/agua/medicinas/comida/combustible) desde reporte-ve ----
  'GET /api/reportes': async () => { const reportes = await getReportes(); return { reportes, source: REP_SOURCE, cats: REP_CATS, count: reportes.length }; },

  // ---- edificios afectados (daños estructurales) desde terremotovenezuela.com ----
  'GET /api/edificios': async () => { const edificios = await getEdificios(); return { edificios, source: EDIF_SOURCE, count: edificios.length }; },
  'GET /api/supplies': async () => { const { items, categories } = await getSupplies(); return { supplies: items, categories, total: items.length, source: SUP_SOURCE, attribution: SUP_ATTR }; },

  // ---- directorio de emergencia (hospitales/ambulancias/bomberos) y sismos USGS ----
  'GET /api/directorio': async () => getDirectorio(store),
  'GET /api/sismos': async () => { const sismos = await getSismos(); return { sismos, source: 'USGS', count: sismos.length }; },

  // ---- asistente IA: buscar persona por nombre o foto (Gemini) ----
  'POST /api/assistant': async (p, q, body) => {
    const name = ('' + (body.name || '')).trim();
    const hasImg = !!body.image && /^data:image\//.test(body.image);
    if (!name && !hasImg) return err(400, 'Escribe un nombre o sube una foto');
    let analysis = null, usedPhoto = false, aiError = null;
    if (hasImg && assistant.hasKey()) {
      try { analysis = await assistant.analyzePhoto(body.image); usedPhoto = true; } catch (e) { aiError = e.message; }
    }
    // Pool de candidatos: por nombre si lo hay; si no, recientes filtrados por sexo/edad del análisis.
    let persons = [];
    if (name) {
      persons = (await store.all("SELECT * FROM persons WHERE dup_of IS NULL AND lower(nombre) LIKE ? LIMIT 80", ['%' + name.toLowerCase() + '%'])).map(oPerson);
    } else if (analysis) {
      const rows = (await store.all("SELECT * FROM persons WHERE dup_of IS NULL ORDER BY id DESC LIMIT 500")).map(oPerson);
      const sx = (analysis.sexo || '').toLowerCase()[0];
      persons = rows.filter(x => {
        if (sx && x.sexo && (('' + x.sexo).toLowerCase()[0] !== sx)) return false;
        const e = parseInt(x.edad, 10);
        if (e && analysis.edadMin && analysis.edadMax && (e < analysis.edadMin - 8 || e > analysis.edadMax + 8)) return false;
        return true;
      });
    }
    persons = persons.filter(x => !x.hidden).slice(0, 60);
    // Re-rank por foto: comparar contra candidatos con foto (cap 8).
    let bestId = null, match = null;
    if (usedPhoto) {
      const withPhoto = persons.filter(x => /^https?:\/\//i.test(x.foto || '')).slice(0, 8);
      if (withPhoto.length) {
        try {
          const imgs = [];
          for (const c of withPhoto) { const im = await fetchImageB64(c.foto); if (im) imgs.push({ id: c.id, ...im }); }
          if (imgs.length) {
            const r = await assistant.matchPhotos(body.image, imgs);
            if (r && r.bestIndex >= 0 && imgs[r.bestIndex]) { bestId = imgs[r.bestIndex].id; match = r; }
          }
        } catch (e) { aiError = aiError || e.message; }
      }
    }
    if (bestId != null) persons.sort((a, b) => (b.id === bestId ? 1 : 0) - (a.id === bestId ? 1 : 0));
    // Hospitales por nombre (si lo hay).
    let hospitals = [];
    if (name) { try { const h = await searchOcrHospitals(name, 15); hospitals = Array.isArray(h) ? h : (h.results || h.items || []); } catch {} }
    return { analysis, usedPhoto, needsKey: hasImg && !assistant.hasKey(), aiError, match, bestId, persons: persons.slice(0, 30).map(publicPerson), hospitals }; // allowlist: sin PII de contacto
  },

  // ---- recursos (bases de datos, grupos WhatsApp/Telegram, galería, enlaces) ----
  'GET /api/resources': async () => (await store.all('SELECT * FROM resources ORDER BY created_at DESC')).map(oResource),
  'POST /api/resources': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    const type = RESOURCE_TYPES.includes(body.type) ? body.type : 'link';
    const title = (body.title || '').trim().slice(0, 120);
    const url = safeUrl(body.url);
    if (!title) return err(400, 'falta el título');
    if (!url) return err(400, 'enlace inválido (usa https://, http://, wa.me, t.me)');
    const id = await store.insert('resources', { type, title, url, descr: (body.descr || '').trim().slice(0, 400), estado: (body.estado || '').trim().slice(0, 60), created_at: now() });
    return { id, type, title, url, descr: (body.descr || '').trim(), estado: (body.estado || '').trim() };
  },
  'POST /api/admin/resources/:id/delete': async (p, q, body, req) => {
    const me = await authUser(req); if (!me || !me.admin) return err(403, 'solo administradores');
    await store.run('DELETE FROM resources WHERE id=?', [p.id]); return { ok: true };
  },

  // ---- subida de imágenes (disco o Cloud Storage) ----
  'POST /api/upload': async (p, q, body) => {
    const url = await storage.save(body.image);
    if (!url) return err(400, 'imagen inválida');
    return { url };
  },
};

/* ---------------- Router ---------------- */
const compiled = Object.entries({ ...api, ...(ext && ext.routes ? ext.routes : {}) }).map(([k, fn]) => { const [method, pat] = k.split(' '); return { method, parts: pat.split('/').filter(Boolean), fn }; });
function matchRoute(method, parts) {
  for (const r of compiled) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params = {}; let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (r.parts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { fn: r.fn, params };
  }
  return null;
}

/* ---------------- Estáticos ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.pdf': 'application/pdf' };
function serveStatic(res, baseDir, rel) {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(baseDir, safe);
  if (!file.startsWith(baseDir)) return send(res, 403, 'Forbidden', 'text/plain');
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { return send(res, 404, 'No encontrado', 'text/plain'); }
  fs.readFile(file, (e, buf) => {
    if (e) return send(res, 404, 'No encontrado', 'text/plain');
    const ext = path.extname(file);
    // JS/CSS llevan ?v=BUILD (cambian al desplegar) -> cache inmutable largo.
    const cache = ['.js', '.css'].includes(ext) ? 'public, max-age=31536000, immutable'
      : ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2'].includes(ext) ? 'public, max-age=86400'
        : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(buf);
  });
}
// Sirve index.html añadiendo ?v=BUILD a los JS/CSS locales (cache-busting) y sin caché del HTML.
function serveHtml(res, req) {
  if (req) recordVisit(req);  // contador de visitas (no bloquea la respuesta)
  fs.readFile(path.join(PUBLIC, 'index.html'), 'utf8', (e, html) => {
    if (e) return send(res, 404, 'No encontrado', 'text/plain');
    html = html.replace(/(src|href)="((?:vendor\/)?[\w./-]+\.(?:js|css))"/g, `$1="$2?v=${BUILD}"`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  });
}

/* ---- Contador de visitas propio (anónimo, sin cookies, sin terceros) ---- */
async function recordVisit(req) {
  try {
    const day = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD (UTC)
    const bump = k => store.run('INSERT INTO metrics(k,v) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET v = metrics.v + 1', [k]);
    await bump('views_total'); await bump('views_' + day);
    // serie temporal en hora local de Venezuela (UTC-4) para el dashboard del admin
    const loc = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
    await bump('vd_' + loc.slice(0, 10));   // vistas por día (YYYY-MM-DD)
    await bump('vh_' + loc.slice(0, 13));   // vistas por hora (YYYY-MM-DDTHH)
    // visitante único: hash diario de IP+UA con salt (NO se guarda la IP)
    const h = crypto.createHash('sha256')
      .update(VISIT_SALT + '|' + day + '|' + clientIp(req) + '|' + (req.headers['user-agent'] || ''))
      .digest('hex').slice(0, 32);
    const seen = await store.get('SELECT 1 AS x FROM visitor_days WHERE day=? AND h=?', [day, h]);
    if (!seen) {
      await store.run('INSERT INTO visitor_days(day,h) VALUES(?,?) ON CONFLICT DO NOTHING', [day, h]);
      await bump('uniq_total'); await bump('uniq_' + day);
    }
  } catch { /* las métricas nunca deben romper el render */ }
}
async function getMetrics() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const g = async k => num(((await store.get('SELECT v FROM metrics WHERE k=?', [k])) || {}).v);
    return { viewsTotal: await g('views_total'), viewsToday: await g('views_' + day), uniqTotal: await g('uniq_total'), uniqToday: await g('uniq_' + day) };
  } catch { return { viewsTotal: 0, viewsToday: 0, uniqTotal: 0, uniqToday: 0 }; }
}
function send(res, code, body, type) { res.writeHead(code, { 'Content-Type': type || 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); }

/* ---------------- Seguridad / límites ---------------- */
const RL = new Map();
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'local';
function rateLimited(ip) {
  const t = Date.now(); const w = RL.get(ip);
  if (!w || t > w.reset) { if (RL.size > 5000) RL.clear(); RL.set(ip, { count: 1, reset: t + 60000 }); return false; }
  w.count++; return w.count > 120;
}
// Limitador estricto para revelar contactos de familias: máx 25 por IP cada 10 min (evita scraping masivo).
const REVEAL = new Map();
function revealLimited(ip) {
  const t = Date.now(); const w = REVEAL.get(ip);
  if (!w || t > w.reset) { if (REVEAL.size > 5000) REVEAL.clear(); REVEAL.set(ip, { count: 1, reset: t + 600000 }); return false; }
  w.count++; return w.count > 25;
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.googleapis.com https://*.gstatic.com https://storage.googleapis.com https://maps.google.com https://*.amazonaws.com https://*.supabase.co https://*.google-analytics.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com https://www.googletagmanager.com https://*.google-analytics.com",
    "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "frame-src https://maps.google.com https://www.google.com",
    "worker-src 'self' blob:",
  ].join('; '));
}
// Lecturas públicas cacheables por el CDN (sin sesión).
const isCacheableGet = pathname => (pathname.startsWith('/api/centers') || pathname === '/api/persons' || pathname === '/api/metrics' || pathname === '/api/audit' || pathname.startsWith('/api/hospitals') || pathname === '/api/reportes' || pathname === '/api/edificios' || pathname === '/api/supplies');

/* ---------------- Servidor ---------------- */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;
  securityHeaders(res);

  if (pathname === '/healthz') return send(res, 200, { ok: true });

  if (pathname.startsWith('/api/')) {
    // CORS abierto para la ingesta colaborativa (bookmarklet desde el dominio de la fuente).
    if (pathname === '/api/admin/ingest') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Import-Token');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    }
    const parts = pathname.split('/').filter(Boolean);
    const route = matchRoute(req.method, parts);
    if (!route) return send(res, 404, { error: 'ruta no encontrada' });
    // La ingesta envía muchos lotes seguidos; la protege el token, no el rate-limit.
    if (req.method !== 'GET' && pathname !== '/api/admin/ingest' && rateLimited(clientIp(req))) return send(res, 429, { error: 'Demasiadas solicitudes. Intenta en un minuto.' });
    const q = Object.fromEntries(u.searchParams);
    if (req.method === 'GET') {
      Promise.resolve().then(() => route.fn(route.params, q, undefined, req))
        .then(out => { if (isCacheableGet(pathname) && !req.headers['authorization']) res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=30, stale-while-revalidate=60'); send(res, 200, out); })
        .catch(e => send(res, e.code || 500, { error: e.message }));
      return;
    }
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 14 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'JSON inválido' }); } }
      Promise.resolve().then(() => route.fn(route.params, q, body, req))
        .then(out => send(res, 200, out))
        .catch(e => send(res, e.code || 500, { error: e.message }));
    });
    return;
  }

  // Fotos subidas (personas/mascotas/centros): legibles por la app, pero NO indexables por buscadores ni rastreadores.
  if (pathname.startsWith('/uploads/')) { res.setHeader('X-Robots-Tag', 'noindex, noimageindex, nofollow'); return serveStatic(res, UPLOADS, pathname.slice('/uploads/'.length)); }
  if (pathname.startsWith('/img/') && storage.kind === 'gcs') {
    const objectName = decodeURIComponent(pathname.slice('/img/'.length)).replace(/^\/+/, '');
    if (!objectName || objectName.includes('..')) return send(res, 400, 'Bad request', 'text/plain');
    res.setHeader('X-Robots-Tag', 'noindex, noimageindex, nofollow');
    storage.bucket.file(objectName).createReadStream()
      .on('error', () => { if (!res.headersSent) send(res, 404, 'No encontrado', 'text/plain'); })
      .on('response', () => { res.setHeader('Content-Type', MIME[path.extname(objectName)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); })
      .pipe(res);
    return;
  }
  // Punto de extensión opcional: si un módulo privado registra rutas/estáticos propios, los atiende.
  if (ext && typeof ext.serve === 'function' && ext.serve(req, res, pathname, { PUBLIC, BUILD })) return;

  if (pathname === '/') return serveHtml(res, req);
  // Sirve páginas .html propias (flyer, sincronizar, …) por su nombre real si existen.
  // index.html mantiene su cache-busting vía serveHtml; rutas .html sin archivo caen al SPA.
  if (pathname.endsWith('.html') && pathname !== '/index.html') {
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(PUBLIC, safe);
    if (file.startsWith(PUBLIC) && fs.existsSync(file)) return serveStatic(res, PUBLIC, pathname);
    return serveHtml(res, req);
  }
  if (pathname.endsWith('.html')) return serveHtml(res, req);
  serveStatic(res, PUBLIC, pathname);
});

/* Importa una vez los centros de acopio iniciales (planilla de coordinación).
   Idempotente: marca en 'metrics' + ON CONFLICT(id) DO NOTHING. */
async function importInitialCenters() {
  try {
    if (await store.get("SELECT v FROM metrics WHERE k='centers_seed_v2'")) return;
    let list = [];
    try { list = require('./data/centros-acopio.json'); } catch { return; }
    let aplicados = 0;
    for (const c of list) {
      const r = await store.run(
        `INSERT INTO centers (id,name,status,estado,municipio,parroquia,distance,data,created_at) VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, status=excluded.status, estado=excluded.estado, municipio=excluded.municipio, parroquia=excluded.parroquia, distance=excluded.distance, data=excluded.data`,
        [c.id, c.name || 'Centro', c.status || 'verificado', c.estado || '', c.municipio || '', c.parroquia || '', c.distance || 0.5, JSON.stringify(c.data || {}), c.created_at || now()]);
      aplicados += (r && r.changes) || 0;
    }
    await store.run("INSERT INTO metrics(k,v) VALUES('centers_seed_v2',1) ON CONFLICT(k) DO NOTHING");
    console.log('[seed] centros de acopio aplicados:', aplicados, 'de', list.length);
  } catch (e) { console.error('[seed] import centros falló:', e.message); }
}

/* Auto-actualiza los centros desde acopiovenezuela.vercel.app (Google Sheet).
   Candado por timestamp en 'metrics' para que solo UNA instancia importe por intervalo. */
const ACOPIO_ENABLED = String(process.env.ACOPIO_IMPORT || 'on').toLowerCase() !== 'off';
const ACOPIO_INTERVAL = Math.max(10, Number(process.env.ACOPIO_REFRESH_MIN || 60)) * 60 * 1000;
async function maybeRefreshAcopio() {
  if (!ACOPIO_ENABLED) return;
  try {
    const last = num(((await store.get("SELECT v FROM metrics WHERE k='acopio_refreshed_at'")) || {}).v);
    if (Date.now() - last < ACOPIO_INTERVAL) return;            // aún no toca
    // reclama el turno antes de importar (evita que varias instancias lo hagan a la vez)
    await store.run("INSERT INTO metrics(k,v) VALUES('acopio_refreshed_at',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", [now()]);
    const res = await importAcopio(store, { log: m => console.log('[acopio]', m) });
    console.log('[acopio] refresco:', JSON.stringify(res));
  } catch (e) { console.error('[acopio] refresco falló:', e.message); }
}

/* Centros desde APIs públicas (AcopioVE + ResponseGrid) — candado/cadencia propios. */
async function maybeRefreshCentrosApis() {
  if (!ACOPIO_ENABLED) return;
  try {
    const last = num(((await store.get("SELECT v FROM metrics WHERE k='centros_apis_at'")) || {}).v);
    if (Date.now() - last < ACOPIO_INTERVAL) return;            // aún no toca
    await store.run("INSERT INTO metrics(k,v) VALUES('centros_apis_at',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", [now()]);
    const res = await importCentrosApis(store, { log: m => console.log('[centros-apis]', m) });
    console.log('[centros-apis] refresco:', JSON.stringify(res));
  } catch (e) { console.error('[centros-apis] refresco falló:', e.message); }
}

/* Importa una vez el dataset de personas reportadas (idempotente).
   Si la tabla ya está llena, no hace nada; si quedó a medias, limpia el seed y reinserta. */
async function importInitialPersons() {
  try {
    if (await store.get("SELECT v FROM metrics WHERE k='persons_seed_v2'")) { console.log('[seed] personas: marcador v2 ya puesto, omito'); return; }
    let list = [];
    try { list = require('./data/personas-seed.json'); } catch (e) { console.log('[seed] personas: no se pudo leer personas-seed.json:', e.message); return; }
    const existing = num((await store.get('SELECT COUNT(*) c FROM persons')).c);
    console.log('[seed] personas: archivo=' + list.length + ' existentes=' + existing);
    if (!list.length) return;
    if (existing >= list.length) { await store.run("INSERT INTO metrics(k,v) VALUES('persons_seed_v2',1) ON CONFLICT(k) DO NOTHING"); console.log('[seed] personas: ya hay suficientes, marco y omito'); return; }
    if (existing > 0) await store.run('DELETE FROM persons WHERE data LIKE ?', ['%desaparecidosterremotovenezuela.com%']);
    let n = 0;
    for (let i = 0; i < list.length; i += 500) { await insertPersonsBatch(store, list.slice(i, i + 500)); n += Math.min(500, list.length - i); }
    await store.run("INSERT INTO metrics(k,v) VALUES('persons_seed_v2',1) ON CONFLICT(k) DO NOTHING");
    try { delete require.cache[require.resolve('./data/personas-seed.json')]; } catch {}  // libera ~27MB de memoria
    console.log('[seed] personas importadas:', n, 'de', list.length);
  } catch (e) { console.error('[seed] import personas falló:', e.message); }
}

process.on('uncaughtException', e => console.error('[uncaughtException]', e));
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));

// Escucha primero (para el health check), luego conecta a la BD con reintentos.
server.listen(PORT, () => console.log(`AyudaVE (${store.kind}/${storage.kind}) escuchando en ${PORT}`));
(async () => {
  for (let i = 1; i <= 12; i++) {
    try {
      await store.init();
      await ensurePersonsSourceId(store); await ensureAuditColumns(store); // columnas source_id + dup_of
      await importInitialCenters(); await importInitialPersons();
      if (process.env.AYUDAVE_SEED === 'on') await seed();
      console.log('Base de datos lista');
      // Auto-actualización de centros de acopio: primera carga a los 20s, luego chequeo cada 10 min.
      if (ACOPIO_ENABLED) {
        setTimeout(maybeRefreshAcopio, 20000);
        setInterval(maybeRefreshAcopio, 10 * 60 * 1000).unref();
        setTimeout(maybeRefreshCentrosApis, 25000);
        setInterval(maybeRefreshCentrosApis, 10 * 60 * 1000).unref();
      }
      primeOcrHospitals(); // pacientes en hospitales (OCR) — carga en memoria + refresco cada 6h
      primeReportes(); // reportes de servicios (reporte-ve) — carga en memoria + refresco cada 1h
      primeEdificios(); // edificios afectados (terremotovenezuela.com) — carga en memoria + refresco cada 1h
      primeSupplies(); // catálogo maestro de insumos (ReliefHub/ResponseGrid) — carga en memoria + refresco cada 12h
      await importDirectorio(store, { log: m => console.log('[directorio]', m) }); // directorio de emergencia → BD (idempotente + auditoría)
      primeSismos(); // sismos/réplicas (USGS) — carga en memoria + refresco cada 15 min
      if (ext && typeof ext.init === 'function') await ext.init(); // módulo de extensión opcional (crea sus tablas si existe)
      return;
    }
    catch (e) { console.error(`init BD intento ${i}: ${e.message}`); await new Promise(r => setTimeout(r, 3000)); }
  }
  console.error('No se pudo inicializar la BD tras 12 intentos');
})();
