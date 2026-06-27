/* ============================================================
   AyudaVE — Lógica de la app (router + pantallas)
   Datos REALES vía API (backend Node + SQLite). Sesión local
   ("quién soy") en localStorage. Caché de servidor en DB.
   ============================================================ */

/* ---------------- Estado ---------------- */
const App = { stack: [], current: { screen: 'home', params: {} }, ctx: {}, _apps: [], _person: null };
// Escala de azules de la bandera de Venezuela (sin colores de partidos).
const COLORS = { help: '#003893', donate: '#0e3a8c', vol: '#214e89', myvol: '#2a5fa6', center: '#173e72', create: '#3b82c4', person: '#0a2f72', admin: '#0a2f72' };

/* ---------------- Sesión local ---------------- */
function load(key, def) { try { const v = JSON.parse(localStorage.getItem('ayudave_' + key)); return v == null ? def : v; } catch { return def; } }
function save(key, val) { localStorage.setItem('ayudave_' + key, JSON.stringify(val)); }

/* ---------------- Sesión de usuario (login por teléfono +58) ---------------- */
function session() { return load('session', null); }
function setSession(u) { save('session', u); }
function clearSession() { localStorage.removeItem('ayudave_session'); }
// El 0 inicial es indiferente: 0414…, 414…, +58414…, 58414… → +58414…
function phoneDigits(raw) { let d = (raw || '').replace(/\D/g, '').replace(/^0+/, ''); if (d.startsWith('58')) d = d.slice(2).replace(/^0+/, ''); return d; }
function normPhone(raw) { const d = phoneDigits(raw); return d ? '+58' + d : ''; }
function roleLabel(aporte) {
  aporte = aporte || [];
  if (aporte.includes('centro')) return 'Centro de acopio';
  if (aporte.includes('voluntario')) return 'Voluntario';
  if (aporte.includes('transporte')) return 'Transporte';
  if (aporte.includes('dinero') || aporte.includes('insumos')) return 'Donante';
  if (aporte.includes('difundir')) return 'Difusión';
  return 'Colaborador';
}
function roleIcon(aporte) {
  aporte = aporte || [];
  if (aporte.includes('centro')) return 'building';
  if (aporte.includes('voluntario')) return 'users';
  if (aporte.includes('transporte')) return 'truck';
  if (aporte.includes('difundir')) return 'megaphone';
  return 'heart';
}
function phoneField(id, value) {
  return `<div class="field"><label>Número de teléfono</label>
    <div class="phone-row">
      <span class="phone-prefix"><svg width="20" height="14" viewBox="0 0 9 6"><rect width="9" height="2" y="0" fill="#fcd116"/><rect width="9" height="2" y="2" fill="#00247d"/><rect width="9" height="2" y="4" fill="#cf142b"/></svg> +58</span>
      <input class="input" id="${id}" inputmode="tel" placeholder="414 1234567" value="${value || ''}"></div></div>`;
}

/* ---------------- Caché de datos del servidor ---------------- */
const DB = { centers: [], donations: [], persons: [] };
function getCenters() { return DB.centers; }
function getCenter(id) { return DB.centers.find(c => c.id === id); }
async function refreshCenters() { try { DB.centers = await API.centers(); } catch (e) { console.error('centers', e); } }
async function refreshMetrics() { try { App._metrics = await API.metrics(); } catch (e) { console.error('metrics', e); } }
async function refreshAudit() { try { App._audit = await API.audit(); } catch (e) { console.error('audit', e); } }
async function refreshPersons(opts) {
  opts = opts || {};
  const status = opts.status != null ? opts.status : (App.ctx.personFilter || '');
  const q = opts.q != null ? opts.q : (App.ctx.personQuery || '');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('limit', String(opts.limit || 60));
  try { DB.persons = await API.persons(params.toString()); } catch (e) { console.error('persons', e); }
}
async function refreshPets() {
  const qs = [];
  if (App.ctx.petFilter) qs.push('status=' + encodeURIComponent(App.ctx.petFilter));
  if (App.ctx.petQuery) qs.push('q=' + encodeURIComponent(App.ctx.petQuery));
  try { App._pets = await API.pets(qs.join('&')); } catch (e) { App._pets = App._pets || []; }
}
// Donaciones de UN centro (solo su dueño autenticado puede verlas). Se guardan en App._centerDons.
async function loadCenterDons(id) { try { App._centerDons = await API.donations(id); } catch { App._centerDons = []; } return App._centerDons; }

/* ---------------- Íconos ---------------- */
function icon(name, size) {
  const p = ICONS[name] || '<circle cx="12" cy="12" r="4"/>';
  const s = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<span class="ico"${s}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`;
}

/* Escapa HTML para contenido libre (formularios), evita romper layout / XSS. */
function esc(s) { return ('' + (s == null ? '' : s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------------- Navegación ---------------- */
function nav(screen, params) { return `data-go="${screen}"${params ? ` data-params='${JSON.stringify(params)}'` : ''}`; }
function go(screen, params) { App.stack.push(App.current); App.current = { screen, params: params || {} }; render(); }
function back() { if (App.stack.length) { App.current = App.stack.pop(); render(); } else home(); }
function home() { App.stack = []; App.current = { screen: 'home', params: {} }; App.ctx = {}; render(); }

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg, ok = true) {
  let w = document.getElementById('toast-wrap');
  if (!w) { w = document.createElement('div'); w.id = 'toast-wrap'; w.className = 'toast-wrap'; document.body.appendChild(w); }
  w.innerHTML = `<div class="toast">${ok ? icon('check') : icon('info')}<span>${msg}</span></div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { w.innerHTML = ''; }, 2800);
}

/* ---------------- Sheet (modal) ---------------- */
function openSheet(title, body) {
  closeSheet();
  const back = document.createElement('div');
  back.className = 'sheet-back'; back.id = 'sheet-back';
  back.innerHTML = `<div class="sheet"><div class="grip"></div><h3>${title}</h3>${body}</div>`;
  back.addEventListener('click', e => { if (e.target === back) closeSheet(); });
  document.body.appendChild(back);
}
function closeSheet() { const s = document.getElementById('sheet-back'); if (s) s.remove(); }

/* ---------------- Utilidades ---------------- */
function copyText(text, label) {
  const done = () => toast((label || 'Datos') + ' copiados');
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch { toast('No se pudo copiar', false); }
  ta.remove();
}
function mapsUrl(c) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.address, c.parroquia, c.municipio, c.estado].filter(Boolean).join(', ')); }
function openMaps(c) { window.open(mapsUrl(c), '_blank'); }
function shareCenter(c) {
  const needs = c.needs.map(n => NEED_MAP[n.key]?.label).filter(Boolean).join(', ');
  const text = `${c.name} necesita: ${needs}. Ayuda en AyudaVE.`;
  if (navigator.share) navigator.share({ title: c.name, text }).catch(() => {});
  else copyText(text, 'Mensaje');
}
function sharePerson(p) {
  const st = PERSON_STATUS[p.status]?.label || '';
  const text = `${st}: ${p.nombre} ${p.apellido || ''}. Visto en ${p.lugar || p.municipio || ''}. Si tienes información, repórtala en AyudaVE.`;
  if (navigator.share) navigator.share({ title: p.nombre, text }).catch(() => {});
  else copyText(text, 'Mensaje');
}
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function today() { try { return new Date().toLocaleDateString('es-VE'); } catch { return 'Hoy'; } }
function need(key) { return NEED_MAP[key] || { label: key, icon: 'box' }; }
function initials(name) { return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }

/* ---------------- Geografía (estado → municipio → parroquia) ---------------- */
// Solo los estados afectados por el sismo (orden por nivel de afectación).
const AFFECTED_ESTADOS = ['La Guaira', 'Distrito Capital', 'Miranda', 'Anzoátegui', 'Carabobo', 'Aragua', 'Falcón', 'Trujillo', 'Lara', 'Táchira', 'Zulia', 'Bolívar', 'Barinas', 'Mérida', 'Monagas'];
function geoEstados() { return window.GEO_VE ? AFFECTED_ESTADOS.filter(e => GEO_VE.data[e]) : []; }
function geoMunis(estado) { return (window.GEO_VE && GEO_VE.data[estado]) ? GEO_VE.data[estado].map(x => x.m) : []; }
function geoParrs(estado, municipio) { if (!window.GEO_VE) return []; const m = (GEO_VE.data[estado] || []).find(x => x.m === municipio); return m ? m.p : []; }
function geoFields(prefix, sel, opts) {
  sel = sel || {}; opts = opts || {};
  const opt = (arr, cur) => arr.map(v => `<option ${cur === v ? 'selected' : ''}>${v}</option>`).join('');
  const muns = sel.estado ? geoMunis(sel.estado) : [];
  const pars = (sel.estado && sel.municipio) ? geoParrs(sel.estado, sel.municipio) : [];
  return `
    <div class="field"><label>Estado</label>
      <select class="select" id="${prefix}-estado" data-geo="estado" data-prefix="${prefix}">
        <option value="">Selecciona estado</option>${opt(geoEstados(), sel.estado)}</select></div>
    <div class="two-col">
      <div class="field"><label>Municipio</label>
        <select class="select" id="${prefix}-municipio" data-geo="municipio" data-prefix="${prefix}">
          <option value="">${sel.estado ? 'Selecciona' : 'Elige el estado'}</option>${opt(muns, sel.municipio)}</select></div>
      <div class="field"><label>Parroquia</label>
        <select class="select" id="${prefix}-parroquia" data-geo="parroquia" data-prefix="${prefix}">
          <option value="">${sel.municipio ? 'Selecciona' : 'Elige el municipio'}</option>${opt(pars, sel.parroquia)}</select></div>
    </div>
    ${opts.alcaldia ? `<div class="field"><label>Alcaldía <span class="opt-note">(según el municipio)</span></label><input class="input" id="${prefix}-alcaldia" placeholder="Se completa al elegir municipio" value="${sel.municipio ? 'Alcaldía de ' + sel.municipio : ''}"></div>` : ''}`;
}
function geoUpdateCascade(e) {
  const g = e.target.dataset.geo; if (!g) return;
  const prefix = e.target.dataset.prefix;
  const list = (arr, ph) => `<option value="">${ph}</option>` + arr.map(v => `<option>${v}</option>`).join('');
  if (g === 'estado') {
    const estado = e.target.value;
    const mun = document.getElementById(prefix + '-municipio');
    if (mun) mun.innerHTML = list(geoMunis(estado), estado ? 'Selecciona' : 'Elige el estado');
    const par = document.getElementById(prefix + '-parroquia'); if (par) par.innerHTML = list([], 'Elige el municipio');
    const alc = document.getElementById(prefix + '-alcaldia'); if (alc) alc.value = '';
  } else if (g === 'municipio') {
    const estado = (document.getElementById(prefix + '-estado') || {}).value || '';
    const municipio = e.target.value;
    const par = document.getElementById(prefix + '-parroquia');
    if (par) par.innerHTML = list(geoParrs(estado, municipio), municipio ? 'Selecciona' : 'Elige el municipio');
    const alc = document.getElementById(prefix + '-alcaldia'); if (alc) alc.value = municipio ? 'Alcaldía de ' + municipio : '';
  }
}
function getGeo() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 });
  });
}
function parseCoords(co) {
  if (!co) return null;
  if (typeof co === 'object' && isFinite(co.lat)) return { lat: +co.lat, lng: +co.lng };
  const m = String(co).split(','); const lat = parseFloat(m[0]), lng = parseFloat(m[1]);
  return (isFinite(lat) && isFinite(lng)) ? { lat, lng } : null;
}

/* ---------------- Filtrado real por ubicación ---------------- */
function haversine(a, b) {
  if (!a || !b) return null;
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}
// Ubicación del usuario: la elegida en el flujo, o la de su perfil de sesión.
function getUserLoc() {
  if (App.ctx.loc && (App.ctx.loc.coords || App.ctx.loc.estado)) return App.ctx.loc;
  const u = session();
  if (u && (u.estado || u.coords)) return { estado: u.estado, municipio: u.municipio, parroquia: u.parroquia, coords: u.coords || null };
  return null;
}
function annotateDistance(list, loc) {
  const uc = loc && loc.coords;
  return list.map(c => Object.assign({}, c, { _dist: uc ? haversine(uc, parseCoords(c.coords)) : null }));
}
// Filtra DB.centers por zona administrativa y/o necesidad; ordena por distancia real si hay coords.
function filterCenters(opts) {
  opts = opts || {};
  let list = DB.centers.slice();
  if (opts.needKey) list = list.filter(c => c.needs.some(n => n.key === opts.needKey));
  if (opts.parroquia) list = list.filter(c => c.parroquia === opts.parroquia);
  else if (opts.municipio) list = list.filter(c => c.municipio === opts.municipio);
  else if (opts.estado) list = list.filter(c => c.estado === opts.estado);
  list = annotateDistance(list, opts.loc);
  list.sort((a, b) => {
    if (a._dist != null && b._dist != null) return a._dist - b._dist;
    if (a._dist != null) return -1; if (b._dist != null) return 1;
    return (a.status === 'pendiente') - (b.status === 'pendiente');
  });
  return list;
}
/* Ranking de necesidades calculado a partir de los centros REALES (no datos inventados). */
function urgentNeeds() {
  const order = { critica: 3, alta: 2, media: 1, baja: 0 };
  const map = {};
  for (const c of getCenters()) {
    if (c.status === 'cerrado') continue;
    for (const n of (c.needs || [])) {
      const m = map[n.key] || (map[n.key] = { key: n.key, centers: 0, level: 'baja' });
      m.centers++;
      if ((order[n.level] || 0) > (order[m.level] || 0)) m.level = n.level;
    }
  }
  return Object.values(map).sort((a, b) => (order[b.level] - order[a.level]) || (b.centers - a.centers));
}
function fmtDist(c) {
  if (c._dist != null) return `${c._dist} km`;
  return [c.municipio, c.estado].filter(Boolean).join(', ') || 'Zona no indicada';
}
/* Mapa: usa Google Maps si hay API key (tus créditos); si no, Leaflet con tiles limpios (CARTO). */
function googleKey() { return (window.MAPS && window.MAPS.googleMapsKey) || ''; }
function ensureGoogle() {
  if (window.google && window.google.maps) return Promise.resolve();
  if (window.__gmapsP) return window.__gmapsP;
  window.__gmapsP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(googleKey()) + '&v=quarterly&language=es&region=VE';
    s.async = true; s.defer = true; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.__gmapsP;
}
async function mountMap(elId, points, opts) {
  opts = opts || {};
  const el = document.getElementById(elId); if (!el) return;
  const center = opts.center || (points[0] ? [points[0].lat, points[0].lng] : [10.49, -66.87]);
  if (googleKey()) { try { await ensureGoogle(); return mountGoogle(el, points, center, opts); } catch (e) { console.warn('Google Maps no disponible, uso OSM', e); } }
  mountLeaflet(el, points, center, opts);
}
function mountGoogle(el, points, center, opts) {
  const map = new google.maps.Map(el, { center: { lat: center[0], lng: center[1] }, zoom: opts.zoom || 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
  const bounds = new google.maps.LatLngBounds();
  points.forEach(p => {
    const color = p.color || '#003893';
    const m = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, title: p.title || '', icon: { path: google.maps.SymbolPath.CIRCLE, scale: p.r || 7, fillColor: color, fillOpacity: .9, strokeColor: '#fff', strokeWeight: 1.5 } });
    bounds.extend(m.getPosition());
    const html = p.html || (`<b>${p.title || ''}</b>` + (p.id ? `<br><a href="#" onclick="mapGo('${p.id}');return false;">Ver centro →</a>` : ''));
    const iw = new google.maps.InfoWindow({ content: html });
    m.addListener('click', () => iw.open(map, m));
  });
  if (points.length > 1) map.fitBounds(bounds, 40);
}
function mountLeaflet(el, points, center, opts) {
  if (!window.L) return;
  if (el._lmap) { try { el._lmap.remove(); } catch (e) {} el._lmap = null; } // re-montaje idempotente (último gana)
  const map = L.map(el, { scrollWheelZoom: false }).setView(center, opts.zoom || 12);
  el._lmap = map;
  // tiles limpios estilo Google (CARTO Voyager), sin API key
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO' }).addTo(map);
  const pts = [];
  points.forEach(p => {
    pts.push([p.lat, p.lng]);
    const color = p.color || '#003893';
    const html = p.html || (`<b>${p.title || ''}</b>` + (p.id ? `<br><a href="#" onclick="mapGo('${p.id}');return false;">Ver centro →</a>` : ''));
    L.circleMarker([p.lat, p.lng], { radius: p.r || 8, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: .92 }).addTo(map).bindPopup(html);
  });
  const fit = () => { if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 13 }); };
  fit();
  // Re-encuadra cuando el contenedor ya tiene su tamaño real (evita caer al maxZoom con altura 0).
  setTimeout(() => { map.invalidateSize(); fit(); }, 130);
}
window.mapGo = function (id) { go('center-public', { id }); };

/* ---------------- Componentes reutilizables ---------------- */
function statusBadge(status) { const s = STATUS_LABELS[status] || STATUS_LABELS.pendiente; return `<span class="badge ${s.cls}">${s.cls === 'ok' ? icon('badge') : icon('info')}${s.label}</span>`; }
function levelTag(level) { const l = LEVEL_LABELS[level] || LEVEL_LABELS.media; return `<span class="lvl ${l.cls}">${l.label}</span>`; }
function needPills(needs) { return `<div class="need-pills">${needs.map(n => `<span class="need-pill">${icon(need(n.key).icon)}${need(n.key).label}${n.level ? ' ' + levelTag(n.level) : ''}</span>`).join('')}</div>`; }
function personStatusBadge(status) { const s = PERSON_STATUS[status] || PERSON_STATUS.desaparecido; return `<span class="badge ${s.cls}">${icon(s.icon)}${s.label}</span>`; }
function avatar(p, cls) { return `<div class="avatar ${cls || ''}">${p.foto ? `<img src="${p.foto}" alt="${p.nombre || ''}">` : initials((p.nombre || '') + ' ' + (p.apellido || ''))}</div>`; }

/* Dirección lo más completa posible (calle/avenida + parroquia, municipio, estado) para diferenciar centros */
function centerAddr(c) {
  const zona = [c.parroquia, c.municipio, c.estado].filter(Boolean).map(s => ('' + s).trim()).filter(Boolean).join(', ');
  const calle = (c.address || '').trim();
  return [calle, zona].filter(Boolean).join(' · ');
}
function centerCard(c, mode) {
  const needTxt = c.needs.map(n => need(n.key).label).join(', ');
  const acc = c.accepts.map(a => a === 'fisico' ? 'insumos físicos' : a === 'pagomovil' ? 'Pago Móvil' : a === 'cripto' ? 'USDT' : a === 'voluntarios' ? 'voluntarios' : a === 'transporte' ? 'transporte' : a).join(', ');
  let buttons;
  if (mode === 'donate') {
    buttons = `<div class="btn-row mt-16">
      <button class="btn sm" ${nav('center-public', { id: c.id })}>Ver centro</button>
      <button class="btn sm" ${nav('center-donate', { id: c.id })}>Donar</button></div>`;
  } else {
    const offer = c.needs.some(n => n.key === 'voluntarios' || n.key === 'transporte')
      ? `<button class="btn sm outline" data-action="offer" data-id="${c.id}">Ofrecer ayuda</button>` : '';
    buttons = `<div class="btn-row mt-16">
      <button class="btn sm" ${nav('center-public', { id: c.id })}>Ver centro</button>
      <button class="btn sm" ${nav('center-donate', { id: c.id })}>Donar</button></div>
      <div class="btn-row mt-8">
      <button class="btn sm ghost" data-action="maps" data-id="${c.id}">${icon('route')}Cómo llegar</button>
      ${offer || `<button class="btn sm ghost" data-action="share" data-id="${c.id}">${icon('share')}Compartir</button>`}</div>`;
  }
  const addr = centerAddr(c);
  const ref = (c.reference || '').trim();
  const wa = (c.whatsapp || '').trim(), ig = (c.instagram || '').trim();
  const social = (wa || ig) ? `<div class="btn-row mt-8 social-row">
    ${wa ? `<a class="btn sm wa" href="https://wa.me/${encodeURIComponent(wa)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>` : ''}
    ${ig ? `<a class="btn sm ig" href="${ig}" target="_blank" rel="noopener">${icon('instagram')}Instagram</a>` : ''}</div>` : '';
  return `<div class="card center-card">
    <div class="cc-top"><div style="flex:1">
      <div class="cc-name">${c.name}</div>
      <div class="cc-meta">${statusBadge(c.status)} ${c.demo ? '<span class="badge muted">Ejemplo</span>' : ''}${c.type ? ` <span class="badge muted">${c.type}</span>` : ''}${(wa || ig) ? ` <span class="badge ok">${icon('check')}Contacto directo</span>` : ''}${c._dist != null ? ` <span class="badge dist">${icon('pin')}${c._dist} km</span>` : ''}</div></div></div>
    ${addr ? `<div class="cc-addr">${icon('pin')}<span>${addr}</span></div>` : ''}
    ${ref ? `<div class="cc-ref">${icon('info')}<span>Referencia: ${ref}</span></div>` : ''}
    <div class="needs-line"><b>Necesita:</b> ${needTxt}</div>
    <div class="accepts">Acepta: ${acc}</div>
    ${social}
    ${buttons}</div>`;
}

function personCard(p) {
  const where = [p.lugar, [p.parroquia, p.municipio, p.estado].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return `<div class="card person-card">
    ${avatar(p)}
    <div class="pc-main">
      <div class="pc-name">${p.nombre} ${p.apellido || ''}</div>
      <div class="pc-sub">${[p.edad ? p.edad + ' años' : '', p.sexo].filter(Boolean).join(' · ')}</div>
      <div style="margin-top:7px">${personStatusBadge(p.status)}${p.demo ? ' <span class="badge muted">Ejemplo</span>' : ''}</div>
      <div class="pc-where">${icon('pin')}<span>${where || 'Zona no especificada'}${p.fecha ? ' · ' + p.fecha : ''}</span></div>
      <div class="btn-row mt-16">
        <button class="btn sm" data-action="open-person" data-id="${p.id}">Ver</button>
        <button class="btn sm ghost" data-action="person-share" data-id="${p.id}">${icon('share')}Compartir</button>
      </div>
    </div></div>`;
}

function petCard(p) {
  const s = (window.PET_STATUS || {})[p.status] || { label: p.status, cls: 'muted' };
  const wa = (p.whatsapp || '').replace(/\D/g, '');
  const tel = (p.contacto || '').replace(/[^\d]/g, '');
  const where = [p.lugar, [p.parroquia, p.municipio, p.estado].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return `<div class="card" style="margin-bottom:10px">
    <div style="display:flex;gap:12px">
      ${p.foto ? `<img src="${p.foto}" alt="" style="width:64px;height:64px;border-radius:12px;object-fit:cover;flex:none">` : `<div style="width:64px;height:64px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;flex:none;font-size:28px">🐾</div>`}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="badge ${s.cls}">${s.label}</span><span class="muted" style="font-size:13px">${esc(p.tipo || '')}</span></div>
        ${p.nombre ? `<div style="font-weight:600;margin-top:3px">${esc(p.nombre)}</div>` : ''}
        ${p.descripcion ? `<div style="font-size:13.5px;margin-top:3px">${esc(p.descripcion)}</div>` : ''}
        <div class="muted" style="font-size:12.5px;margin-top:4px">${icon('pin')}${esc(where || 'Zona no especificada')}</div>
        ${p.destino ? `<div class="muted" style="font-size:12.5px">Estará en: ${esc(p.destino)}</div>` : ''}
      </div>
    </div>
    ${(wa || tel) ? `<div class="btn-row mt-12" style="gap:6px">${wa ? `<a class="btn sm wa" href="https://wa.me/${wa}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>` : `<a class="btn sm" href="tel:${tel}">📞 Llamar</a>`}</div>` : ''}
  </div>`;
}

/* ---------------- RENDER ---------------- */
function render() {
  const cur = App.current && App.current.screen;
  if (cur && cur !== App._lastGa) { App._lastGa = cur; gaPage(cur); }  // page_view por pantalla (SPA)
  const root = document.getElementById('root');
  const def = screens[App.current.screen](App.current.params || {});
  let header;
  if (App.current.screen === 'home') {
    header = `<header class="appbar">
      <img class="brand-escudo" src="escudo.png" alt="Escudo de Venezuela">
      <div class="bar-title" style="font-size:19px;letter-spacing:-.02em">Ayuda<span style="color:var(--primary)">VE</span></div>
      <button class="iconbtn" data-action="account" aria-label="Mi perfil">${icon('user')}</button>
      <button class="iconbtn" data-action="emergency" aria-label="Emergencia" style="color:var(--critica)">${icon('alert')}</button>
    </header>`;
  } else {
    const tint = def.tint;
    header = `<header class="appbar ${tint ? 'tint' : ''}"${tint ? ` style="background:${tint}"` : ''}>
      <button class="iconbtn" data-back aria-label="Volver">${icon('back')}</button>
      <div class="bar-title">${def.title || ''}</div>
      <button class="iconbtn" data-home aria-label="Inicio">${icon('home')}</button>
    </header>`;
  }
  root.innerHTML = header + `<main class="screen">${def.html}</main>`;
  window.scrollTo(0, 0);
}

/* ============================================================
   PANTALLAS
   ============================================================ */
const screens = {};

/* ---------- HOME ---------- */
screens.home = () => {
  const choices = [
    { t: 'Ver centros de acopio', s: 'Busca y filtra por estado o municipio', ic: 'list', col: COLORS.center, go: 'centers-all' },
    { t: 'Quiero ayudar', s: 'Te guiamos paso a paso', ic: 'heart', col: COLORS.help, go: 'help-location' },
    { t: 'Quiero donar', s: 'Insumos, Pago Móvil o cripto', ic: 'box', col: COLORS.donate, go: 'donate-what' },
    { t: 'Quiero ser voluntario', s: 'Regístrate en un minuto', ic: 'users', col: COLORS.vol, go: 'vol-skills' },
    { t: 'Ya soy voluntario', s: 'Ver mis tareas', ic: 'user', col: COLORS.myvol, go: 'vol-login' },
    { t: 'Soy un centro de acopio', s: 'Entra a tu panel', ic: 'building', col: COLORS.center, act: 'open-centers' },
    { t: 'Quiero crear un centro', s: 'Publícalo y verifícalo', ic: 'plus', col: COLORS.create, act: 'open-create' },
  ];
  const grid = choices.map(c => `<button class="choice" ${c.act ? `data-action="${c.act}"` : nav(c.go)}>
    <span class="ch-ico" style="background:${c.col}">${icon(c.ic)}</span>
    <span class="ch-txt"><b>${c.t}</b><span>${c.s}</span></span>
    <span class="ch-go">${icon('chevron')}</span></button>`).join('');

  const u = session();
  const greet = u ? `<button class="session-greet" data-action="account">
      <span class="sg-ava">${initials(u.nombre + ' ' + (u.apellido || ''))}</span>
      <span class="sg-txt"><b>Hola, ${u.nombre}</b><span>${roleLabel(u.aporte)} · Ver mi perfil</span></span>
      <span class="ch-go">${icon('chevron')}</span></button>` : '';
  // Resumen en vivo (centros, desaparecidos, localizados, voluntarios) — se carga al iniciar.
  const m = App._metrics;
  if (!m) refreshMetrics().then(() => { if (App.current.screen === 'home') render(); });
  if (!App._audit) refreshAudit().then(() => { if (App.current.screen === 'home') render(); });
  const fmtN = n => (n == null ? '—' : Number(n).toLocaleString('es'));
  // Alerta: duplicados detectados en la fuente → lleva a la auditoría.
  const au = App._audit;
  const alertBanner = (au && au.duplicados > 0) ? `
    <button class="alert-banner" data-action="open-audit">
      <span class="ab-ico">${icon('alert')}</span>
      <span class="ab-txt"><b>Alerta:</b> detectamos <b>${fmtN(au.duplicados)} reportes duplicados</b> (${au.porcentajeDuplicados}%) en desaparecidosterremotovenezuela.com — la misma persona publicada varias veces. <u>Ver auditoría</u></span>
      <span class="ch-go">${icon('chevron')}</span>
    </button>` : '';
  const homeStats = `
    <div class="stat-grid home-stats">
      <button class="stat" ${nav('centers-all')}><div class="num">${fmtN(m && m.centers && m.centers.total)}</div><div class="lab">Centros de acopio</div></button>
      <button class="stat" data-action="open-hospitals"><div class="num" style="color:var(--primary)">${fmtN(m && m.hospitals && m.hospitals.total)}</div><div class="lab">Personas en hospitales</div></button>
      <button class="stat" data-action="open-persons"><div class="num" style="color:var(--bad,#cf142b)">${fmtN(m && m.persons && m.persons.desaparecidos)}</div><div class="lab">Desaparecidos</div></button>
      <button class="stat" data-action="open-persons"><div class="num" style="color:var(--ok,#1c7a3e)">${fmtN(m && m.persons && m.persons.encontrados)}</div><div class="lab">Localizados</div></button>
      <button class="stat" data-action="open-edificios" style="grid-column:1/-1"><div class="num" style="color:var(--alta,#ea580c)">${fmtN(m && m.edificios && m.edificios.total)}</div><div class="lab">Edificios con daños del sismo</div></button>
    </div>`;
  return { html: `
    ${alertBanner}
    ${greet}
    <div class="home-hero">
      <div class="kicker">Ayuda humanitaria · Venezuela</div>
      <h1>¿Qué quieres hacer?</h1>
      <p>${u ? 'Elige una opción para ayudar.' : 'Elige una opción y ayuda en menos de un minuto. <b>Inicia sesión</b> con tu teléfono para guardar tu perfil.'}</p>
    </div>
    ${homeStats}
        <button class="help-cta" data-action="open-help-request">
      <span class="hc-ico">${icon('alert')}</span>
      <span class="hc-txt"><b>Solicitar ayuda</b><span>¿Necesitas ayuda? Pídela aquí — rescate, médica, agua, refugio</span></span>
      <span class="ch-go">${icon('chevron')}</span>
    </button>
<div class="choice-grid">${grid}</div>

    <div class="section-label">Personas: desaparecidos y encontrados</div>
    <div class="strip">
      <button class="strip-row" ${nav('asistente')}>🤖<span class="lbl">Asistente: buscar por nombre o foto</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" data-action="open-persons">${icon('usersearch')}<span class="lbl">Buscar personas reportadas</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" ${nav('person-type')}>${icon('usersearch')}<span class="lbl">Reportar una persona</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" data-action="open-pets">🐾<span class="lbl">Mascotas perdidas y encontradas</span><span class="ch-go">${icon('chevron')}</span></button>
    </div>

    <div class="section-label">Explora</div>
    <div class="strip">
      <button class="strip-row" ${nav('map-view')}>${icon('map')}<span class="lbl">Mapa de la situación (centros + servicios)</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" data-action="open-edificios">${icon('building')}<span class="lbl">Edificios afectados (daños del sismo)</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" data-action="open-directorio">${icon('alert')}<span class="lbl">Emergencias: hospitales, ambulancias, bomberos</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" data-action="open-resources">${icon('link')}<span class="lbl">Recursos: grupos, bases de datos, galería</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" ${nav('donate-urgent')}>${icon('alert')}<span class="lbl">Necesidades urgentes</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" data-action="near-centers">${icon('pin')}<span class="lbl">Centros más cercanos</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" ${nav('search')}>${icon('search')}<span class="lbl">Buscar por municipio o parroquia</span><span class="ch-go">${icon('chevron')}</span></button>
            <button class="strip-row" data-action="open-help-requests">${icon('hand')}<span class="lbl">Ver solicitudes de ayuda</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" data-action="open-metrics">${icon('trend')}<span class="lbl">Estadísticas del sitio</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row" data-action="open-audit">${icon('list')}<span class="lbl">Auditoría de duplicados</span><span class="ch-go">${icon('chevron')}</span></button>
      <button class="strip-row danger" data-action="emergency">${icon('alert')}<span class="lbl">Emergencia: números importantes</span><span class="ch-go">${icon('chevron')}</span></button>
    </div>

    ${disclaimer()}
  ` };
};

/* Disclaimer (al final de las pantallas clave): sin fines de lucro, data comunitaria, no oficial. */
function disclaimer() {
  return `<div class="disclaimer">
    <b>AyudaVE — iniciativa sin fines de lucro.</b> Los reportes de personas los colocan los propios usuarios y se recopilan de forma automática.
    <b>No es una fuente oficial del Estado</b> ni de ningún organismo: es simplemente la comunidad ayudándose. Verifica la información por tus propios medios.
    <div class="foot-links">
      <a href="/docs.html">${icon('info')}Documentación</a>
      <a href="/docs.html#guia-integrar-una-nueva-fuente-api">${icon('link')}Para desarrolladores</a>
    </div>
  </div>`;
}

/* ========== CUENTA: login por teléfono + perfil ========== */
screens['login'] = () => ({
  tint: COLORS.donate, title: 'Iniciar sesión', html: `
    <div class="center-txt" style="margin:8px 0 14px"><img src="escudo.png" alt="Escudo de Venezuela" style="width:78px;height:78px;object-fit:contain"></div>
    <div class="screen-head center-txt"><h1>Entra con tu teléfono</h1><p class="sub">Te identificamos por tu número y un PIN de 4 dígitos.</p></div>
    ${phoneField('login-phone', '')}
    <button class="btn" data-action="login-continue">${icon('chevron')}Continuar</button>
    <p class="muted center-txt mt-16" style="font-size:13px">Si es tu primera vez, crearás tu perfil y tu PIN en un momento.</p>
  ` });

screens['register'] = () => {
  const u = App.ctx.regUser || {};
  const sel = new Set(App.ctx.aporte || []);
  const chips = APORTES.map(a => `<button class="chip ${sel.has(a.key) ? 'sel' : ''}" data-action="toggle" data-group="aporte" data-key="${a.key}">${icon(a.icon)}${a.label}</button>`).join('');
  return { tint: COLORS.donate, title: u.id ? 'Editar perfil' : 'Crear perfil', html: `
    <div class="screen-head"><h1>Tu perfil</h1><p class="sub">Teléfono: ${App.ctx.regPhone || u.phone || ''}</p></div>
    <div class="two-col">
      <div class="field"><label>Nombre</label><input class="input" id="reg-nombre" placeholder="Nombre" value="${u.nombre || ''}"></div>
      <div class="field"><label>Apellido</label><input class="input" id="reg-apellido" placeholder="Apellido" value="${u.apellido || ''}"></div>
    </div>
    <div class="section-label" style="margin-top:6px">Ubicación</div>
    ${geoFields('reg', { estado: u.estado, municipio: u.municipio, parroquia: u.parroquia })}
    <div class="section-label">¿Qué puedes aportar?</div>
    <p class="muted" style="font-size:13px;margin:0 0 10px">Esto define tu rol. Puedes elegir varios.</p>
    <div class="chips">${chips}</div>
    <div class="sticky-cta"><button class="btn" data-action="register-submit">${icon('check')}Guardar y entrar</button></div>
  ` };
};

screens['profile'] = () => {
  const u = session();
  if (!u) return { tint: COLORS.donate, title: 'Mi perfil', html: `<div class="empty">${icon('user')}<p>No has iniciado sesión.</p><button class="btn mt-16" data-go="login">Iniciar sesión</button></div>` };
  const aporte = u.aporte || [];
  const quick = [];
  if (aporte.includes('dinero') || aporte.includes('insumos')) quick.push({ l: 'Donar a un centro', go: 'donate-what', ic: 'heart' });
  if (aporte.includes('voluntario')) quick.push({ l: 'Ser voluntario / ver tareas', go: 'vol-skills', ic: 'users' });
  if (aporte.includes('transporte')) quick.push({ l: 'Centros que necesitan transporte', a: 'transport-centers', ic: 'truck' });
  if (aporte.includes('centro')) quick.push({ l: 'Entrar al panel de mi centro', a: 'open-centers', ic: 'building' });
  if (aporte.includes('difundir')) quick.push({ l: 'Ver centros para difundir', go: 'map-view', ic: 'megaphone' });
  return { tint: COLORS.donate, title: 'Mi perfil', html: `
    <div class="card">
      <div style="display:flex;align-items:center;gap:13px">
        <div class="avatar">${initials(u.nombre + ' ' + (u.apellido || ''))}</div>
        <div style="flex:1"><div class="cc-name">${u.nombre} ${u.apellido || ''}</div>
          <div class="muted" style="font-size:13.5px">${u.phone}</div>
          <div class="mt-8"><span class="role-pill">${icon(roleIcon(aporte))}${roleLabel(aporte)}</span>${u.admin ? ' <span class="badge ok">Admin</span>' : ''}</div></div>
      </div>
      <div class="kv mt-16"><span class="k">Ubicación</span><span class="v">${[u.parroquia, u.municipio, u.estado].filter(Boolean).join(', ') || '—'}</span></div>
      <div class="kv"><span class="k">Puede aportar</span><span class="v">${aporte.map(k => APORTE_MAP[k]?.label || k).join(', ') || '—'}</span></div>
    </div>
    <div class="section-label">Acciones para ti</div>
    <div class="opt-list">
      ${quick.map(x => x.go ? `<button class="opt" data-go="${x.go}">${icon(x.ic)}<span class="lbl">${x.l}</span><span class="ch-go">${icon('chevron')}</span></button>` : `<button class="opt" data-action="${x.a}">${icon(x.ic)}<span class="lbl">${x.l}</span><span class="ch-go">${icon('chevron')}</span></button>`).join('')}
      <button class="opt" data-action="open-persons">${icon('usersearch')}<span class="lbl">Personas reportadas</span><span class="ch-go">${icon('chevron')}</span></button>
    </div>
    <div class="sticky-cta">
      ${u.admin ? `<button class="btn block" style="background:#0a2f72" data-action="open-admin">${icon('badge')}Panel de administrador</button>` : ''}
      <button class="btn ghost block ${u.admin ? 'mt-8' : ''}" data-action="edit-profile">${icon('edit')}Editar perfil</button>
      <button class="btn outline block mt-8" data-action="logout">Cerrar sesión</button>
    </div>
  ` };
};

screens['passcode'] = () => {
  const mode = App.ctx.pinMode; const cur = App.ctx.pin || '';
  let title, sub;
  if (mode === 'login') { title = 'Ingresa tu PIN'; sub = (App.ctx.loginName ? 'Hola, ' + App.ctx.loginName + '. ' : '') + 'Escribe tu PIN de 4 dígitos.'; }
  else { const first = App.ctx.pin1 == null; title = first ? 'Crea tu PIN' : 'Confirma tu PIN'; sub = first ? 'Elige 4 dígitos para proteger tu cuenta.' : 'Escríbelo otra vez.'; }
  const dots = [0, 1, 2, 3].map(i => `<span class="pin-dot ${i < cur.length ? 'on' : ''}"></span>`).join('');
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map(k =>
    k === '' ? '<span></span>'
      : k === 'del' ? `<button class="pin-key del" data-action="pin-del" aria-label="Borrar">${icon('back')}</button>`
        : `<button class="pin-key" data-action="pin-digit" data-d="${k}">${k}</button>`).join('');
  return { tint: COLORS.donate, title: 'Acceso', html: `
    <div class="passcode">
      <div class="center-txt"><h1 style="font-size:23px">${title}</h1><p class="sub" style="margin-top:8px">${sub}</p></div>
      <div class="pin-dots ${App.ctx.pinShake ? 'shake' : ''}">${dots}</div>
      <div class="pin-pad">${keys}</div>
      ${mode === 'login' ? `<p class="muted center-txt mt-16" style="font-size:13px">¿Otro número? <a href="#" data-go="login">Cambiar</a></p>` : ''}
    </div>
  ` };
};

/* ========== ADMINISTRADOR / VERIFICADOR ========== */
function adminCenterCard(c) {
  return `<div class="card">
    <div class="cc-name">${c.name}</div>
    <div class="cc-meta mt-8">${statusBadge(c.status)} <span class="badge dist">${[c.parroquia, c.municipio, c.estado].filter(Boolean).join(', ') || 'Zona no indicada'}</span></div>
    <div class="di-meta mt-8" style="font-size:13px">Responsable: ${c.responsable || '—'} ${c.responsableApellido || ''} · ${c.whatsapp || 'sin contacto'}</div>
    <div class="needs-line mt-8">Necesita: ${(c.needs || []).map(n => need(n.key).label).join(', ') || '—'}</div>
    <div class="btn-row mt-16">
      <button class="btn sm ghost" ${nav('center-public', { id: c.id })}>Ver</button>
      <button class="btn sm success" data-action="admin-verify" data-id="${c.id}" data-st="verificado">${icon('check')}Verificar</button>
    </div>
    <div class="btn-row mt-8">
      <button class="btn sm ghost" data-action="admin-verify" data-id="${c.id}" data-st="verificado-operativo">Operativo</button>
      <button class="btn sm ghost" data-action="admin-verify" data-id="${c.id}" data-st="sospechoso" style="color:var(--bad)">Sospechoso</button>
    </div></div>`;
}
function adminPersonRow(p) {
  return `<div class="card person-card">
    ${avatar(p)}
    <div class="pc-main"><div class="pc-name">${p.nombre} ${p.apellido || ''}</div>
      <div style="margin-top:6px">${personStatusBadge(p.status)}${p.hidden ? ' <span class="badge bad">Oculto</span>' : ''}</div>
      <div class="pc-where">${icon('pin')}<span>${[p.lugar, p.municipio, p.estado].filter(Boolean).join(' · ') || '—'}</span></div>
      <div class="btn-row mt-16"><button class="btn sm ghost" data-action="open-person" data-id="${p.id}">Ver</button>
        ${p.hidden ? `<button class="btn sm" data-action="admin-person" data-id="${p.id}" data-h="0">Restaurar</button>` : `<button class="btn sm ghost" data-action="admin-person" data-id="${p.id}" data-h="1" style="color:var(--bad)">Ocultar</button>`}</div>
    </div></div>`;
}
screens['admin'] = () => {
  const u = session();
  if (!u || !u.admin) return { tint: '#0a2f72', title: 'Admin', html: `<div class="empty">${icon('info')}<p>Acceso solo para administradores.</p><button class="btn mt-16" data-home>Inicio</button></div>` };
  const tab = App.ctx.adminTab || 'centros';
  const data = App._admin || { pendientes: [], persons: [], totals: {} };
  return { tint: '#0a2f72', title: 'Panel admin', html: `
    <div class="screen-head"><h1>Panel de administrador</h1><p class="sub">Hola, ${u.nombre}. Verifica centros y modera reportes.</p></div>
    <div class="stat-grid">
      <div class="stat"><div class="num">${data.totals.centers || 0}</div><div class="lab">Centros</div></div>
      <div class="stat"><div class="num" style="color:var(--pend)">${data.pendientes.length}</div><div class="lab">Por verificar</div></div>
      <div class="stat"><div class="num">${data.totals.persons || 0}</div><div class="lab">Personas</div></div>
      <div class="stat"><div class="num">${data.totals.users || 0}</div><div class="lab">Usuarios</div></div>
    </div>
    <div class="section-label">Visitas del sitio</div>
    <div class="stat-grid">
      <div class="stat"><div class="num">${(data.metrics && data.metrics.viewsToday) || 0}</div><div class="lab">Vistas hoy</div></div>
      <div class="stat"><div class="num">${(data.metrics && data.metrics.uniqToday) || 0}</div><div class="lab">Visitantes hoy</div></div>
      <div class="stat"><div class="num">${(data.metrics && data.metrics.viewsTotal) || 0}</div><div class="lab">Vistas totales</div></div>
      <div class="stat"><div class="num">${(data.metrics && data.metrics.uniqTotal) || 0}</div><div class="lab">Visitantes totales</div></div>
    </div>
    <button class="btn block mt-16" style="background:var(--primary)" data-action="open-dashboard">${icon('trend')}Ver dashboard de métricas</button>
    <button class="btn block mt-8" style="background:var(--c-center,#173e72)" data-action="open-admin-logistica">${icon('box')}Logística de la red (entradas / salidas)</button>
    <div class="section-label">Monitoreo</div>
    <button class="btn block" style="background:#0e7490" data-action="open-admin-users">${icon('users')}Usuarios registrados</button>
    <button class="btn block mt-8" style="background:#0e3a8c" data-action="open-admin-donations">${icon('money')}Donaciones reportadas</button>
    <button class="btn block mt-8" style="background:#173e72" data-action="open-admin-inventory">${icon('box')}Insumos físicos (inventario)</button>
    <button class="btn block mt-8" style="background:#0a2f72" data-action="open-admin-activity">${icon('bell')}Actividad en vivo</button>
    <button class="btn block mt-8" style="background:#cf142b" data-action="open-help-requests">${icon('hand')}Solicitudes de ayuda</button>
    <div class="tabs mt-16">
      <button class="tab ${tab === 'centros' ? 'active' : ''}" data-action="admin-tab" data-k="centros">Por verificar (${data.pendientes.length})</button>
      <button class="tab ${tab === 'personas' ? 'active' : ''}" data-action="admin-tab" data-k="personas">Personas (${data.persons.length})</button>
    </div>
    ${tab === 'centros'
      ? (data.pendientes.length ? data.pendientes.map(adminCenterCard).join('') : `<div class="empty">${icon('check')}<p>No hay centros pendientes. ¡Todo al día!</p></div>`)
      : (data.persons.length ? data.persons.map(adminPersonRow).join('') : `<div class="empty">${icon('usersearch')}<p>No hay reportes de personas.</p></div>`)}
  ` };
};

/* ===== ADMIN: actividad en vivo + detalle de centro ===== */
function activityRow(e, i) {
  const lk = e.link ? (e.link.screen ? ` ${nav(e.link.screen, { id: e.link.id })}` : ` data-action="${e.link.action}"${e.link.id ? ` data-id="${e.link.id}"` : ''}`) : '';
  return `<button class="act-row" data-action="open-activity" data-i="${i}">
    <span class="act-ic" style="background:${e.color || '#5b6675'}">${icon(e.icon || 'bell')}</span>
    <span class="act-tx"><b>${e.title}</b><span>${e.text || ''}${e.zona ? ' · ' + e.zona : ''}</span></span>
    <small class="act-time">${timeAgo(e.created_at)}</small>
  </button>`;
}

screens['activity-detail'] = () => {
  const u = session(); if (!u || !u.admin) return notFound();
  const e = App._actDetail; if (!e) return notFound();
  const det = (e.details || []).filter(x => x && x.v != null && x.v !== '');
  const linkBtn = e.link ? `<button class="btn block mt-16" style="background:var(--primary)" ${e.link.screen ? nav(e.link.screen, { id: e.link.id }) : `data-action="${e.link.action}"${e.link.id ? ` data-id="${e.link.id}"` : ''}`}>${icon('chevron')}Abrir ${e.kind || 'detalle'}</button>` : '';
  return { tint: '#0a2f72', title: e.title || 'Actividad', html: `
    <div class="screen-head" style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <span class="act-ic" style="background:${e.color || '#5b6675'};width:46px;height:46px;border-radius:13px">${icon(e.icon || 'bell')}</span>
      <div><h1 style="font-size:20px">${e.title || 'Actividad'}</h1><p class="sub" style="margin-top:2px">${timeAgo(e.created_at)} · ${fmtDate(e.created_at)}</p></div>
    </div>
    <div class="card">${det.length ? det.map(x => `<div class="kv"><span class="k">${x.k}</span><span class="v" style="text-align:right;max-width:62%">${x.v}</span></div>`).join('') : `<div class="muted" style="font-size:13px">${e.text || 'Sin detalles adicionales.'}</div>`}</div>
    ${linkBtn}
    <div class="sticky-cta"><button class="btn ghost block" data-action="open-admin-activity">${icon('back')}Volver a actividad</button></div>
  ` };
};

screens['admin-activity'] = () => {
  const u = session(); if (!u || !u.admin) return notFound();
  const data = App._activity;
  const events = (data && data.events) || [];
  return { tint: '#0a2f72', title: 'Actividad en vivo', html: `
    <div class="screen-head"><h1>Actividad en vivo <span class="live-dot"></span></h1><p class="sub">Lo último de toda la red, actualizándose en tiempo real.</p></div>
    <div id="activity-res">${events.length ? events.map((e, i) => activityRow(e, i)).join('') : `<div class="empty">${icon('bell')}<p>${data ? 'Sin actividad reciente.' : 'Cargando…'}</p></div>`}</div>
    <div class="sticky-cta"><button class="btn ghost block" data-action="open-admin">${icon('back')}Volver al panel</button></div>
  ` };
};

screens['admin-center'] = () => {
  const u = session(); if (!u || !u.admin) return notFound();
  const d = App._adminCenter; if (!d) return { tint: '#0a2f72', title: 'Centro', html: `<div class="empty">${icon('building')}<p>Cargando centro…</p></div>` };
  const c = d.center; const t = d.totals || {}; const fmt = n => (n || 0).toLocaleString('es');
  return { tint: '#0a2f72', title: c.name || 'Centro', html: `
    <div class="screen-head"><h1>${c.name || 'Centro'}</h1><p class="sub">${[c.parroquia, c.municipio, c.estado].filter(Boolean).join(', ') || ''}${c.status ? ' · ' + c.status : ''}</p></div>
    <div class="stat-grid">
      <div class="stat"><div class="num">${fmt(t.entradas)}</div><div class="lab">Entradas</div></div>
      <div class="stat"><div class="num">${fmt(t.salidas)}</div><div class="lab">Salidas</div></div>
      <div class="stat"><div class="num">${fmt(t.familias)}</div><div class="lab">Familias atendidas</div></div>
      <div class="stat"><div class="num">${(d.donations || []).length}</div><div class="lab">Donaciones</div></div>
    </div>
    <div class="section-label">Inventario actual</div>
    <div class="card">${(d.inventario || []).length ? d.inventario.map(i => `<div class="kv"><span class="k">${i.insumo}</span><span class="v">${fmt(i.cantidad)}${i.unidad ? ' ' + i.unidad : ''}</span></div>`).join('') : '<div class="muted" style="font-size:13px">Sin inventario registrado.</div>'}</div>
    <div class="section-label">Donaciones recibidas</div>
    <div class="card">${(d.donations || []).length ? d.donations.slice(0, 20).map(dn => { const it = (dn.items || []).map(i => `${i.cantidad || ''} ${i.insumo || ''}`.trim()).filter(Boolean).join(', '); const mo = dn.monto ? `${dn.monto} ${dn.moneda || ''}`.trim() : ''; return `<div class="kv"><span class="k">${it || mo || 'Donación'}${dn.donante ? ' · ' + dn.donante : ''}</span><span class="v"><small>${dn.estado || ''}</small></span></div>`; }).join('') : '<div class="muted" style="font-size:13px">Sin donaciones registradas.</div>'}</div>
    <div class="section-label">Movimientos recientes</div>
    <div class="card">${(d.movements || []).length ? d.movements.slice(0, 15).map(m => { const it = (m.items || []).map(i => `${i.cantidad || ''} ${i.insumo || ''}`.trim()).filter(Boolean).join(', '); const lbl = m.type === 'entrada' ? '⬇ Entrada' : m.type === 'salida' ? '⬆ Salida' : '•'; return `<div class="kv"><span class="k">${lbl} ${it || (m.familias ? m.familias + ' familias' : '')}</span><span class="v"><small>${timeAgo(m.created_at)}</small></span></div>`; }).join('') : '<div class="muted" style="font-size:13px">Sin movimientos.</div>'}</div>
    <div class="sticky-cta"><button class="btn ghost block" data-action="open-admin-inventory">${icon('back')}Volver a insumos</button></div>
  ` };
};


/* ===== ADMIN: usuarios, donaciones, insumos físicos ===== */
function fmtDate(ms) { if (!ms) return '—'; try { return new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '—'; } }
function aporteLabel(k) { try { return (window.APORTE_MAP && APORTE_MAP[k] && APORTE_MAP[k].label) || k || ''; } catch { return k || ''; } }

function adminUserRow(u) {
  const tel = (u.phone || '').replace(/[^0-9+]/g, '');
  const zona = [u.parroquia, u.municipio, u.estado].filter(Boolean).join(', ');
  return `<div class="card adm-row">
    <div class="ar-top"><b>${[u.nombre, u.apellido].filter(Boolean).join(' ') || '(sin nombre)'}</b>${u.admin ? '<span class="badge ok">Admin</span>' : ''}</div>
    <div class="ar-meta">${icon('phone')}<span>${u.phone || '—'}</span>${tel ? ` · <a href="https://wa.me/58${tel.replace(/^\\+?58/, '').replace(/^0/, '')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>
    ${(u.aporte || zona) ? `<div class="ar-sub">${[aporteLabel(u.aporte), zona].filter(Boolean).join(' · ')}</div>` : ''}
    <div class="ar-date">Registrado: ${fmtDate(u.created_at)}</div>
  </div>`;
}
function filterAdminUsers(q) {
  q = (q || '').toLowerCase().trim();
  const list = (App._adminUsers || []).filter(u => !q || [u.nombre, u.apellido, u.phone, u.estado, u.municipio].filter(Boolean).join(' ').toLowerCase().includes(q));
  const el = document.getElementById('users-res');
  if (el) el.innerHTML = list.length ? list.map(adminUserRow).join('') : `<div class="empty">${icon('users')}<p>Sin resultados.</p></div>`;
}
function adminDonRow(d) {
  const items = (d.items || []).map(i => `${i.cantidad || i.qty || ''} ${i.insumo || i.label || ''} ${i.unidad || ''}`.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ');
  const monto = d.monto ? `${d.monto} ${d.moneda || ''}`.trim() : '';
  return `<div class="card adm-row">
    <div class="ar-top"><b>${d.centerName || 'Fondo general'}</b><span class="badge">${d.estado || 'Reportada'}</span></div>
    ${(items || monto || d.metodo) ? `<div class="ar-sub">${[items, monto, d.metodo].filter(Boolean).join(' · ')}</div>` : ''}
    <div class="ar-date">${d.donante ? 'Por ' + d.donante + ' · ' : ''}${fmtDate(d.created_at)}</div>
  </div>`;
}

screens['admin-users'] = () => {
  const u = session(); if (!u || !u.admin) return notFound();
  const list = App._adminUsers; if (!list) return { tint: '#0a2f72', title: 'Usuarios', html: `<div class="empty">${icon('users')}<p>Cargando usuarios…</p></div>` };
  return { tint: '#0a2f72', title: 'Usuarios', html: `
    <div class="screen-head"><h1>Usuarios registrados</h1><p class="sub">${list.length} usuarios con cuenta en AyudaVE.</p></div>
    <div class="field"><input class="input" id="usrch" placeholder="Buscar por nombre, teléfono o zona" oninput="filterAdminUsers(this.value)"></div>
    <div id="users-res">${list.length ? list.map(adminUserRow).join('') : `<div class="empty">${icon('users')}<p>Aún no hay usuarios registrados.</p></div>`}</div>
    <div class="sticky-cta"><button class="btn ghost block" data-action="open-admin">${icon('back')}Volver al panel</button></div>
  ` };
};

screens['admin-donations'] = () => {
  const u = session(); if (!u || !u.admin) return notFound();
  const list = App._adminDons; if (!list) return { tint: '#0a2f72', title: 'Donaciones', html: `<div class="empty">${icon('money')}<p>Cargando donaciones…</p></div>` };
  return { tint: '#0a2f72', title: 'Donaciones', html: `
    <div class="screen-head"><h1>Donaciones reportadas</h1><p class="sub">${list.length} donaciones registradas en la red.</p></div>
    <div id="dons-res">${list.length ? list.map(adminDonRow).join('') : `<div class="empty">${icon('money')}<p>Aún no hay donaciones reportadas.</p></div>`}</div>
    <div class="sticky-cta"><button class="btn ghost block" data-action="open-admin">${icon('back')}Volver al panel</button></div>
  ` };
};

screens['admin-inventory'] = () => {
  const u = session(); if (!u || !u.admin) return notFound();
  const inv = App._adminInv; if (!inv) return { tint: '#0a2f72', title: 'Insumos', html: `<div class="empty">${icon('box')}<p>Cargando inventario…</p></div>` };
  const fmt = n => (n || 0).toLocaleString('es');
  return { tint: '#0a2f72', title: 'Insumos físicos', html: `
    <div class="screen-head"><h1>Insumos físicos</h1><p class="sub">Inventario agregado de toda la red de centros.</p></div>
    <div class="stat-grid">
      <div class="stat"><div class="num">${fmt(inv.totalUnidades)}</div><div class="lab">Unidades en inventario</div></div>
      <div class="stat"><div class="num">${inv.tiposInsumo || 0}</div><div class="lab">Tipos de insumo</div></div>
    </div>
    <div class="section-label">Insumos por tipo (toda la red)</div>
    <div class="card">${(inv.insumos || []).length ? inv.insumos.map(i => `<div class="kv"><span class="k">${i.insumo}</span><span class="v">${fmt(i.cantidad)}${i.unidad?" "+i.unidad:""}</span></div>`).join('') : '<div class="muted" style="font-size:13px">Aún no hay inventario cargado en los centros.</div>'}</div>
    <div class="section-label">Por centro de acopio (${inv.centrosConInventario || 0})</div>
    <div class="card">${(inv.centros || []).length ? inv.centros.map(c => `<button class="kv kv-btn" data-action="open-admin-center" data-id="${c.id}"><span class="k">${c.name} ${c.estado ? `<small style="color:var(--muted)">· ${c.estado}</small>` : ''}</span><span class="v">${fmt(c.total)} · ${c.items} tipos</span></button>`).join('') : '<div class="muted" style="font-size:13px">Ningún centro tiene inventario cargado todavía.</div>'}</div>
    <div class="sticky-cta"><button class="btn ghost block" data-action="open-admin">${icon('back')}Volver al panel</button></div>
  ` };
};


/* ========== DASHBOARD DE MÉTRICAS (admin) ========== */
function dashLabel(k) {
  if (typeof NEED_MAP !== 'undefined' && NEED_MAP[k]) return NEED_MAP[k].label;
  if (typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[k]) return STATUS_LABELS[k].label;
  if (typeof PERSON_STATUS !== 'undefined' && PERSON_STATUS[k]) return PERSON_STATUS[k].label;
  return k;
}
function dashBars(arr, color) {
  arr = arr || [];
  if (!arr.length) return '<div class="muted" style="font-size:13px;padding:4px 0">Sin datos aún.</div>';
  const max = Math.max(1, ...arr.map(x => x.c));
  return arr.map(x => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0">
    <span style="width:118px;font-size:12px;color:var(--faint,#5b6675);text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dashLabel(x.k)}</span>
    <span style="flex:1;height:15px;background:#eef2f8;border-radius:8px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(3, Math.round(x.c / max * 100))}%;background:${color || 'var(--primary)'};border-radius:8px"></span></span>
    <span style="width:30px;font-weight:700;font-size:12.5px;text-align:right">${x.c}</span>
  </div>`).join('');
}
/* ---- Gráficos de línea de tiempo (SVG propio, sin librerías) ---- */
function timeAgo(ms) {
  if (!ms) return '';
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'hace ' + s + ' s';
  const m = Math.floor(s / 60); if (m < 60) return 'hace ' + m + ' min';
  const h = Math.floor(m / 60); if (h < 24) return 'hace ' + h + ' h';
  const dd = Math.floor(h / 24); return 'hace ' + dd + (dd === 1 ? ' día' : ' días');
}
function tlArea(values, labels, color) {
  values = values || []; labels = labels || [];
  const n = values.length;
  if (!n || values.every(x => !x)) return '<div class="muted" style="font-size:13px;padding:16px 0;text-align:center">Sin datos en este periodo todavía.</div>';
  const W = 320, H = 110, pad = 8, bottom = 16, max = Math.max(1, ...values);
  const x = i => pad + (n === 1 ? (W - 2 * pad) / 2 : i * (W - 2 * pad) / (n - 1));
  const y = val => (H - bottom) - val / max * (H - bottom - pad);
  const pts = values.map((val, i) => `${x(i).toFixed(1)},${y(val).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${H - bottom} ${pts} ${x(n - 1).toFixed(1)},${H - bottom}`;
  const ticks = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const xl = ticks.map(i => `<text x="${x(i).toFixed(1)}" y="${H - 4}" font-size="7.5" fill="#74819a" text-anchor="middle">${labels[i] || ''}</text>`).join('');
  const top = values.indexOf(max);
  return `<svg viewBox="0 0 ${W} ${H}" class="tl-chart">
    <polygon points="${area}" fill="${color}" fill-opacity="0.12"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(top).toFixed(1)}" cy="${y(max).toFixed(1)}" r="2.6" fill="${color}"/>
    <text x="${pad}" y="9" font-size="7.5" fill="#74819a">máx ${max}</text>${xl}</svg>`;
}
function tlStack(seriesList, labels) {
  labels = labels || [];
  const n = labels.length;
  const totals = labels.map((_, i) => seriesList.reduce((a, se) => a + ((se.values || [])[i] || 0), 0));
  if (!n || totals.every(t => !t)) return '<div class="muted" style="font-size:13px;padding:16px 0;text-align:center">Sin registros en este periodo todavía.</div>';
  const W = 320, H = 118, bottom = 16, top = 10, gap = n > 16 ? 1 : 2, max = Math.max(1, ...totals), bw = W / n;
  let bars = '';
  for (let i = 0; i < n; i++) {
    let yAcc = H - bottom; const cx = i * bw + gap;
    for (const se of seriesList) {
      const val = (se.values || [])[i] || 0; if (!val) continue;
      const h = val / max * (H - bottom - top); yAcc -= h;
      bars += `<rect x="${cx.toFixed(1)}" y="${yAcc.toFixed(1)}" width="${(bw - 2 * gap).toFixed(1)}" height="${h.toFixed(1)}" fill="${se.color}" rx="1"><title>${labels[i]} · ${se.name}: ${val}</title></rect>`;
    }
  }
  const step = Math.max(1, Math.ceil(n / 7));
  let xl = ''; for (let i = 0; i < n; i += step) xl += `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 4}" font-size="7.5" fill="#74819a" text-anchor="middle">${labels[i]}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="tl-chart"><text x="2" y="9" font-size="7.5" fill="#74819a">máx ${max}</text>${bars}${xl}</svg>`;
}
function tlLegend(seriesList) {
  return `<div class="tl-legend">${seriesList.map(s => `<span class="tl-lg"><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
}
function recentCenterRow(c) {
  return `<button class="rec-row" ${nav('center-public', { id: c.id })}>
    <span class="rec-ic" style="background:var(--c-center)">${icon('building')}</span>
    <span class="rec-tx"><b>${c.name}</b><span>${[c.parroquia, c.municipio, c.estado].filter(Boolean).join(', ') || 'Zona no indicada'}</span></span>
    <span class="rec-meta">${statusBadge(c.status)}<small>${timeAgo(c.created_at)}</small></span></button>`;
}
function recentPersonRow(p) {
  return `<button class="rec-row" data-action="open-person" data-id="${p.id}">
    <span class="rec-ic" style="background:#5b6675">${icon('usersearch')}</span>
    <span class="rec-tx"><b>${p.nombre}</b><span>${[p.municipio, p.estado].filter(Boolean).join(', ') || '—'}</span></span>
    <span class="rec-meta">${personStatusBadge(p.status)}<small>${timeAgo(p.created_at)}</small></span></button>`;
}
screens['dashboard'] = () => {
  const u = session();
  if (!u || !u.admin) return notFound();
  const d = App._dash;
  if (!d) return { tint: '#0a2f72', title: 'Dashboard', html: `<div class="empty">${icon('trend')}<p>Cargando métricas…</p></div>` };
  const v = d.visits || {}, nc = d.newCounts || {};
  const s = d.series || { dayLabels: [], hourLabels: [], daily: {}, hourly: {} };
  const range = App.ctx.dashRange || 'dia';
  const labels = range === 'hora' ? (s.hourLabels || []) : (s.dayLabels || []);
  const set = range === 'hora' ? (s.hourly || {}) : (s.daily || {});
  const word = range === 'hora' ? 'últimas 24 horas' : 'últimos 14 días';
  const card = (n, l, color) => `<div class="stat"><div class="num"${color ? ` style="color:${color}"` : ''}>${(Number(n) || 0).toLocaleString('es')}</div><div class="lab">${l}</div></div>`;
  const nrow = (label, o, color) => `<div class="nc-row"><span class="nc-l">${label}</span><span class="nc-v"><b style="color:${color}">+${(o && o.d1) || 0}</b> 24h&nbsp;·&nbsp;<b>+${(o && o.d7) || 0}</b> 7d</span></div>`;
  const sec = (title, bars) => `<div class="section-label">${title}</div><div class="card">${bars}</div>`;
  const reg = [
    { name: 'Usuarios', color: '#003893', values: set.users || [] },
    { name: 'Centros', color: '#1c7a3e', values: set.centers || [] },
    { name: 'Donaciones', color: '#b9770e', values: set.donations || [] },
    { name: 'Voluntarios', color: '#2a5fa6', values: set.volunteers || [] },
  ];
  const pend = d.pendientes || [], rc = (d.recent && d.recent.centers) || [], rp = (d.recent && d.recent.persons) || [];
  return { tint: '#0a2f72', title: 'Dashboard', html: `
    <div class="screen-head"><h1>Dashboard de métricas</h1><p class="sub">Actividad y difusión de AyudaVE.</p></div>

    <div class="section-label">Resumen</div>
    <div class="stat-grid">
      ${card(d.centers.total, 'Centros de acopio')}
      ${card(d.volunteers, 'Voluntarios')}
      ${card(d.donations.total, 'Donaciones')}
      ${card(d.persons.total, 'Personas reportadas')}
      ${card(d.users, 'Usuarios registrados')}
      ${card(v.viewsTotal, 'Vistas totales')}
    </div>

    <div class="section-label">Nuevos · ¿está funcionando?</div>
    <div class="card nc-card">
      ${nrow('Vistas del sitio', nc.views, 'var(--primary)')}
      ${nrow('Usuarios', nc.users, '#003893')}
      ${nrow('Centros', nc.centers, '#1c7a3e')}
      ${nrow('Donaciones', nc.donations, '#b9770e')}
      ${nrow('Voluntarios', nc.volunteers, '#2a5fa6')}
      ${nrow('Personas', nc.persons, '#5b6675')}
    </div>

    <div class="tabs mt-16">
      <button class="tab ${range === 'dia' ? 'active' : ''}" data-action="dash-range" data-k="dia">Por día (14d)</button>
      <button class="tab ${range === 'hora' ? 'active' : ''}" data-action="dash-range" data-k="hora">Por hora (24h)</button>
    </div>

    <div class="section-label">Tráfico — difusión · ${word}</div>
    <div class="card">${tlArea(set.views || [], labels, 'var(--primary)')}
      <div class="tl-foot"><b>${(set.views || []).reduce((a, b) => a + b, 0).toLocaleString('es')}</b> vistas · ${word}</div></div>

    <div class="section-label">Registros nuevos · ${word}</div>
    <div class="card">${tlStack(reg, labels)}${tlLegend(reg)}</div>

    <div class="section-label">Centros por verificar (${pend.length})</div>
    ${pend.length ? pend.map(adminCenterCard).join('') : `<div class="empty sm">${icon('check')}<p>Todo verificado. ¡Al día!</p></div>`}

    <div class="section-label">Últimos centros registrados</div>
    <div class="strip">${rc.length ? rc.map(recentCenterRow).join('') : `<div class="empty sm">${icon('inbox')}<p>Aún no hay centros.</p></div>`}</div>

    <div class="section-label">Últimas personas reportadas</div>
    <div class="strip">${rp.length ? rp.map(recentPersonRow).join('') : `<div class="empty sm">${icon('usersearch')}<p>Aún no hay reportes.</p></div>`}</div>

    <div class="section-label">Desglose general</div>
    ${sec('Centros por estado', dashBars(d.centers.byEstado, 'var(--primary)'))}
    ${sec('Centros por verificación', dashBars(d.centers.byStatus, '#1c7a3e'))}
    ${sec('Necesidades más pedidas', dashBars(d.centers.topNeeds, 'var(--critica,#cf142b)'))}
    ${sec('Donaciones por método', dashBars(d.donations.byMethod, '#8a6500'))}
    ${sec('Personas por estado', dashBars(d.persons.byStatus, '#5b6675'))}
  ` };
};

/* Dashboard de métricas PÚBLICO (visitas + agregados), accesible desde el home. */
/* Personas en hospitales (datos OCR del repo abierto de @ecrespo). Buscable por nombre/zona/cédula. */
screens['hospitals'] = () => {
  const s = App._hospSummary || {};
  const r = App._hospitals;
  const list = (r && r.items) || [];
  const card = hospCard;
  const activeH = App.ctx.hospHospital || '';
  const byH = s.byHospital || [];
  const chips = `<div class="chips hosp-chips">
    <button class="chip ${!activeH ? 'active' : ''}" data-action="hosp-filter" data-h="">Todos · ${(s.total || 0).toLocaleString('es')}</button>
    ${byH.map(h => `<button class="chip ${activeH === h.hospital ? 'active' : ''}" data-action="hosp-filter" data-h="${h.hospital.replace(/"/g, '&quot;')}">${hospShort(h.hospital)} · ${h.count}</button>`).join('')}
  </div>`;
  const activeCount = activeH ? (byH.find(h => h.hospital === activeH) || {}).count : null;
  return { tint: COLORS.person, title: 'Personas en hospitales', html: `
    <div class="screen-head"><h1>Personas en hospitales</h1><p class="sub">Pacientes atendidos en hospitales tras el sismo. Busca a tu familiar por nombre, zona o cédula.</p></div>
    <div class="stat-grid">
      <div class="stat"><div class="num">${(s.total || 0).toLocaleString('es')}</div><div class="lab">Pacientes registrados</div></div>
      <div class="stat"><div class="num">${s.hospitales || 0}</div><div class="lab">Hospitales / centros</div></div>
    </div>
    <div class="section-label">Filtrar por centro</div>
    ${chips}
    <div class="field mt-16"><input class="input" id="hsrch" value="${(App.ctx.hospQuery || '').replace(/"/g, '&quot;')}" placeholder="Buscar por nombre, hospital, zona o cédula" oninput="doHospitalSearch(this.value)"></div>
    <a class="alert-banner" href="https://hospitalesenvenezuela.com/" target="_blank" rel="noopener">
      <span class="ab-ico">${icon('medkit')}</span>
      <span class="ab-txt">¿No encuentras a tu familiar aquí? Busca también en <b>hospitalesenvenezuela.com</b></span>
      <span class="ch-go">${icon('chevron')}</span>
    </a>
    ${activeH ? `<p class="muted" style="font-size:13px;margin:0 2px 8px"><b>${hospShort(activeH)}</b> · ${(activeCount || 0).toLocaleString('es')} pacientes${App.ctx.hospQuery ? ` · ${(r && r.matched || 0).toLocaleString('es')} con "${App.ctx.hospQuery}"` : ''}</p>`
      : (r && r.matched != null && App.ctx.hospQuery ? `<p class="muted" style="font-size:13px;margin:0 2px 8px">${r.matched.toLocaleString('es')} resultado(s)${r.matched > list.length ? ' (mostrando ' + list.length + ')' : ''}</p>` : '')}
    <div id="hosp-res">${list.length ? list.map(card).join('') : `<div class="empty">${icon('usersearch')}<p>${(App.ctx.hospQuery || activeH) ? 'Sin resultados.' : 'Escribe un nombre para buscar.'}</p></div>`}</div>
    <div class="card mt-16" style="font-size:12.5px;color:var(--muted);line-height:1.6">${icon('info')} La cédula no se muestra por privacidad (pero sí se puede buscar). Datos: transcripción OCR de listas de hospitales del repo abierto <b>OCR-data_Terremoto_Venezuela</b> de @ecrespo. <a href="${s.source || 'https://github.com/ecrespo/OCR-data_Terremoto_Venezuela_24062026'}" target="_blank" rel="noopener">Ver fuente ↗</a></div>
    <div class="sticky-cta"><button class="btn ghost block" data-home>${icon('home')}Volver al inicio</button></div>
  ` };
};

/* ===== SOLICITAR AYUDA (una persona pide ayuda) ===== */
const HELP_TYPES = [
  { key: 'rescate', label: 'Rescate / personas atrapadas', icon: 'alert', col: '#cf142b' },
  { key: 'medica', label: 'Atención médica', icon: 'medkit', col: '#dc2626' },
  { key: 'medicinas', label: 'Medicinas', icon: 'medkit', col: '#b45309' },
  { key: 'agua-comida', label: 'Agua y comida', icon: 'droplet', col: '#0e7490' },
  { key: 'refugio', label: 'Refugio / alojamiento', icon: 'home', col: '#7c3aed' },
  { key: 'transporte', label: 'Transporte', icon: 'truck', col: '#1d4ed8' },
  { key: 'otro', label: 'Otra ayuda', icon: 'hand', col: '#475569' },
];
const URGENCIAS = ['Crítica', 'Alta', 'Media'];
const helpType = k => HELP_TYPES.find(t => t.key === k) || HELP_TYPES[HELP_TYPES.length - 1];

screens['help-request'] = () => ({
  tint: '#cf142b', title: 'Solicitar ayuda', html: `
    <div class="screen-head"><h1>Solicitar ayuda</h1><p class="sub">Cuéntanos qué necesitas y dónde estás. Tu solicitud será visible para voluntarios y centros que puedan ayudar.</p></div>
    <div class="field"><label>¿Qué tipo de ayuda necesitas?</label><select class="select" id="h-tipo">${HELP_TYPES.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}</select></div>
    <div class="field"><label>Urgencia</label><select class="select" id="h-urg">${URGENCIAS.map(u => `<option>${u}</option>`).join('')}</select></div>
    <div class="two-col">
      <div class="field"><label>Tu nombre</label><input class="input" id="h-nombre" placeholder="Nombre"></div>
      <div class="field"><label>Teléfono / WhatsApp</label><input class="input" id="h-contacto" placeholder="04xx-xxxxxxx" inputmode="tel"></div>
    </div>
    ${geoFields('h', {})}
    <div class="field"><label>Lugar exacto</label><input class="input" id="h-lugar" placeholder="Dirección, referencia, edificio..."></div>
    <div class="field"><label>Describe tu situación</label><textarea class="textarea" id="h-desc" placeholder="¿Qué necesitas? ¿Cuántas personas? ¿Hay heridos?"></textarea></div>
    <div class="notice">${icon('info')}<div>En una emergencia que ponga en riesgo la vida, llama también a los servicios de emergencia. Esta herramienta NO los reemplaza.</div></div>
    <div class="sticky-cta"><button class="btn" style="background:#cf142b" data-action="help-request-submit">${icon('check')}Enviar solicitud</button></div>
  ` });

screens['help-request-done'] = () => ({
  tint: '#cf142b', title: 'Solicitud enviada', html: `
    <div class="success-hero"><div class="check-circle" style="background:#cf142b">${icon('check')}</div><h2>Solicitud enviada</h2><p>Tu solicitud de ayuda ya es visible para voluntarios y centros. Si puedes, compártela también por tus grupos.</p></div>
    <div class="sticky-cta">
      <button class="btn block" style="background:#cf142b" data-action="open-help-requests">${icon('list')}Ver solicitudes de ayuda</button>
      <button class="btn ghost block mt-8" data-home>Volver al inicio</button>
    </div>
  ` });

function helpCard(h) {
  const t = helpType(h.tipo);
  const tel = (h.contacto || '').replace(/[^0-9]/g, '');
  const zona = [h.parroquia, h.municipio, h.estado].filter(Boolean).join(', ');
  const urg = (h.urgencia || '').toLowerCase();
  return `<div class="card help-card ${urg === 'crítica' ? 'urg-crit' : urg === 'alta' ? 'urg-alta' : ''}">
    <div class="hr-top"><span class="hr-tipo" style="background:${t.col}">${icon(t.icon)}${t.label}</span>${h.urgencia ? `<span class="hr-urg">${h.urgencia}</span>` : ''}</div>
    ${h.nombre ? `<div class="hr-name">${h.nombre}</div>` : ''}
    ${h.descripcion ? `<div class="hr-desc">${h.descripcion}</div>` : ''}
    ${(zona || h.lugar) ? `<div class="hr-zona">${icon('pin')}<span>${[h.lugar, zona].filter(Boolean).join(' · ')}</span></div>` : ''}
    ${tel ? `<div class="btn-row mt-8"><a class="btn sm" href="tel:${tel}">${icon('phone')}Llamar</a><a class="btn sm ghost" href="https://wa.me/58${tel.replace(/^0/, '')}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a></div>` : ''}
  </div>`;
}

screens['help-requests'] = () => {
  const list = App._helpList || [];
  return { tint: '#cf142b', title: 'Solicitudes de ayuda', html: `
    <div class="screen-head"><h1>Solicitudes de ayuda</h1><p class="sub">Personas que necesitan ayuda ahora. Si puedes apoyar, contáctalas directamente.</p></div>
    <div id="help-res">${list.length ? list.map(helpCard).join('') : `<div class="empty">${icon('hand')}<p>No hay solicitudes abiertas ahora mismo.</p></div>`}</div>
    <div class="sticky-cta"><button class="btn block" style="background:#cf142b" data-action="open-help-request">${icon('plus')}Solicitar ayuda</button></div>
  ` };
};


screens['metrics'] = () => {
  const m = App._metrics;
  if (!m) return { tint: '#0a2f72', title: 'Estadísticas', html: `<div class="empty">${icon('trend')}<p>Cargando estadísticas…</p></div>` };
  const v = m.visits || {};
  const card = (n, l, color) => `<div class="stat"><div class="num"${color ? ` style="color:${color}"` : ''}>${(n || 0).toLocaleString('es')}</div><div class="lab">${l}</div></div>`;
  return { tint: '#0a2f72', title: 'Estadísticas del sitio', html: `
    <div class="screen-head"><h1>Estadísticas del sitio</h1><p class="sub">Visitas y actividad de AyudaVE. Datos anónimos, sin guardar IP.</p></div>
    <div class="section-label">Visitas</div>
    <div class="stat-grid">
      ${card(v.viewsToday, 'Vistas hoy')}
      ${card(v.uniqToday, 'Visitantes hoy')}
      ${card(v.viewsTotal, 'Vistas totales')}
      ${card(v.uniqTotal, 'Visitantes totales')}
    </div>
    <div class="section-label">Personas reportadas</div>
    <div class="stat-grid">
      ${card(m.persons.total, 'Total')}
      ${card(m.persons.desaparecidos, 'Aún sin contacto', 'var(--bad,#cf142b)')}
      ${card(m.persons.encontrados, 'Localizados', 'var(--ok,#1c7a3e)')}
    </div>
    <div class="section-label">Red de ayuda</div>
    <div class="stat-grid">
      ${card(m.centers.total, 'Centros de acopio')}
      ${card(m.centers.verificados, 'Centros verificados')}
      ${card(m.volunteers, 'Voluntarios')}
    </div>
    <div class="sticky-cta"><button class="btn ghost block" data-home>${icon('home')}Volver al inicio</button></div>
  ` };
};

/* Auditoría de duplicados de la fuente (desaparecidosterremotovenezuela.com) — resultados reales. */
screens['audit'] = () => {
  const a = App._audit;
  if (!a) return { tint: '#0a2f72', title: 'Auditoría', html: `<div class="empty">${icon('list')}<p>Auditando datos…</p></div>` };
  const fmt = n => (n == null ? '—' : (typeof n === 'string' ? n : Number(n).toLocaleString('es')));
  const fecha = a.ultimaAuditoria ? new Date(a.ultimaAuditoria).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const card = (n, l, color) => `<div class="stat"><div class="num"${color ? ` style="color:${color}"` : ''}>${fmt(n)}</div><div class="lab">${l}</div></div>`;
  return { tint: '#0a2f72', title: 'Auditoría de datos', html: `
    <div class="screen-head"><h1>Auditoría de duplicados</h1><p class="sub">Revisión automática de los reportes de <b>${a.source || 'la fuente'}</b> para detectar publicaciones repetidas de la misma persona.</p></div>
    <div class="stat-grid">
      ${card(a.total, 'Reportes en la fuente')}
      ${card(a.unicos, 'Personas únicas (estimado)', 'var(--ok,#1c7a3e)')}
      ${card(a.duplicados, 'Reportes duplicados', 'var(--bad,#cf142b)')}
      ${card(a.porcentajeDuplicados != null ? a.porcentajeDuplicados + '%' : null, '% de duplicados')}
    </div>
    <div class="notice">${icon('info')}<div>Detectamos <b>${fmt(a.grupos)}</b> grupos de reportes repetidos (la misma persona publicada varias veces). El listado público ya muestra <b>solo un reporte por persona</b>; aquí ves el conteo real de la fuente.</div></div>
    ${a.ejemplos && a.ejemplos.length ? `<div class="section-label">Más reportados (mismas personas)</div><div class="card">${a.ejemplos.map(e => `<div class="kv"><span class="k">${(e.nombre || '(sin nombre)')}</span><span class="v">${fmt(e.copias)} reportes</span></div>`).join('')}</div>` : ''}
    <div class="section-label">¿Cómo se detecta?</div>
    <div class="card"><div style="font-size:13.5px;color:var(--muted);line-height:1.6">Se agrupan los reportes por el <b>nombre del desaparecido</b> (ignorando mayúsculas, acentos y orden de los apellidos) y por <b>nombres muy parecidos</b> (erratas) cuando coinciden edad o zona. El teléfono <b>no</b> se usa para agrupar, porque es el del reportante (varias personas reportan a la misma persona). Última auditoría: <b>${fecha}</b>.</div></div>
    <div class="sticky-cta"><button class="btn ghost block" data-home>${icon('home')}Volver al inicio</button></div>
  ` };
};

/* ========== RECURSOS (grupos WhatsApp/Telegram, bases de datos, galería) ========== */
function resourceCard(r, u) {
  const k = (window.RESOURCE_MAP && RESOURCE_MAP[r.type]) || RESOURCE_MAP.link;
  const thumb = r.type === 'image'
    ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="res-thumb"><img src="${esc(r.url)}" alt="${esc(r.title)}" loading="lazy" onerror="this.closest('.res-thumb').style.display='none'"></a>` : '';
  return `<div class="card">${thumb}<div class="res-card">
    <span class="res-ico" style="background:${k.color}">${icon(k.icon)}</span>
    <div class="res-main">
      <div class="res-title">${esc(r.title)}</div>
      ${r.descr ? `<div class="res-desc">${esc(r.descr)}</div>` : ''}
      <div class="btn-row mt-8">
        <a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener">${icon(k.icon)}Abrir</a>
        ${u && u.admin ? `<button class="btn sm ghost" data-action="resource-delete" data-id="${r.id}" style="color:var(--bad)">${icon('close')}Borrar</button>` : ''}
      </div>
    </div></div></div>`;
}
screens['resources'] = () => {
  const u = session();
  const list = App._resources;
  if (!list) return { tint: COLORS.center, title: 'Recursos', html: `<div class="empty">${icon('link')}<p>Cargando recursos…</p></div>` };
  const byKind = {};
  for (const r of list) (byKind[r.type] || (byKind[r.type] = [])).push(r);
  const sections = RESOURCE_KINDS.filter(k => (byKind[k.key] || []).length).map(k =>
    `<div class="section-label">${k.label} (${byKind[k.key].length})</div>${byKind[k.key].map(r => resourceCard(r, u)).join('')}`).join('');
  return { tint: COLORS.center, title: 'Recursos', html: `
    <div class="screen-head"><h1>Recursos y enlaces</h1><p class="sub">Grupos de WhatsApp y Telegram, bases de datos, galería de imágenes y videos útiles.</p></div>
    ${u && u.admin ? `<button class="btn block" data-action="resource-add">${icon('plus')}Agregar recurso</button>` : ''}
    ${list.length ? sections : `<div class="empty">${icon('inbox')}<p>Aún no hay recursos publicados.${u && u.admin ? ' Agrega el primero.' : ''}</p></div>`}
  ` };
};
screens['resource-new'] = () => {
  if (!session() || !session().admin) return notFound();
  const cur = App.ctx.newRes || (App.ctx.newRes = { type: 'whatsapp' });
  const opts = RESOURCE_KINDS.map(k => `<option value="${k.key}" ${cur.type === k.key ? 'selected' : ''}>${k.label}</option>`).join('');
  return { tint: COLORS.center, title: 'Agregar recurso', html: `
    <div class="screen-head"><h1>Agregar recurso</h1><p class="sub">Grupo, base de datos, galería o enlace. Aparece al instante para todos.</p></div>
    <div class="field"><label>Tipo</label><select class="select" id="r-type">${opts}</select></div>
    <div class="field"><label>Título</label><input class="input" id="r-title" placeholder="Ej. Grupo WhatsApp Voluntarios Caracas"></div>
    <div class="field"><label>Enlace</label><input class="input" id="r-url" inputmode="url" placeholder="https://chat.whatsapp.com/… · t.me/… · enlace"></div>
    <div class="field"><label>Descripción <span class="opt-note">(opcional)</span></label><textarea class="textarea" id="r-descr" placeholder="¿De qué trata? ¿A quién sirve?"></textarea></div>
    <button class="btn block" data-action="resource-save">${icon('check')}Publicar recurso</button>
  ` };
};

/* ========== 1. QUIERO AYUDAR ========== */
screens['help-location'] = () => {
  const opts = [
    { k: 'gps', ic: 'locate', l: 'Usar mi ubicación actual' },
    { k: 'estado', ic: 'map', l: 'Seleccionar estado' },
    { k: 'municipio', ic: 'map', l: 'Seleccionar municipio' },
    { k: 'parroquia', ic: 'map', l: 'Seleccionar parroquia' },
    { k: 'buscar', ic: 'search', l: 'Buscar otra zona' },
  ];
  return { tint: COLORS.help, title: 'Quiero ayudar', html: `
    <div class="screen-head"><h1>¿Dónde estás?</h1><p class="sub">Así te mostramos lo que se necesita cerca de ti.</p></div>
    <div class="opt-list">${opts.map(o => `<button class="opt" data-action="set-zone" data-k="${o.k}">${icon(o.ic)}<span class="lbl">${o.l}</span><span class="ch-go">${icon('chevron')}</span></button>`).join('')}</div>
  ` };
};

screens['help-how'] = () => {
  const opts = HELP_WAYS.map(w => `<button class="opt" data-action="help-way" data-k="${w.key}">${icon(w.icon)}<span class="lbl">${w.label}</span><span class="ch-go">${icon('chevron')}</span></button>`).join('');
  return { tint: COLORS.help, title: 'Quiero ayudar', html: `
    <div class="screen-head"><h1>¿Cómo quieres ayudar?</h1><p class="sub">${App.ctx.zone ? 'Zona: ' + App.ctx.zone : 'Elige lo que más te provoque.'}</p></div>
    <div class="opt-list">${opts}</div>
  ` };
};

screens['help-reco'] = () => {
  const loc = getUserLoc();
  // Filtra por zona del usuario; si su municipio no tiene centros, amplía a su estado.
  let list = filterCenters({ loc, municipio: loc && loc.municipio });
  if (!list.length && loc && loc.estado) list = filterCenters({ loc, estado: loc.estado });
  if (!loc) list = filterCenters({ loc: null });
  const zona = loc ? [loc.parroquia, loc.municipio, loc.estado].filter(Boolean).join(', ') : '';
  return { tint: COLORS.help, title: 'Cerca de ti', html: `
    <div class="urgent-banner">${icon('alert')}<div>${zona ? `En <b>${zona}</b> y alrededores se necesita ayuda.` : 'Se necesita con <b>urgencia</b>: agua, gasas, pañales y voluntarios.'}</div></div>
    <div class="section-label">Centros ${zona ? 'en tu zona' : 'disponibles'} (${list.length})</div>
    ${list.length ? list.map(c => centerCard(c)).join('')
      : `<div class="empty">${icon('inbox')}<p>No hay centros cerca todavía.</p><button class="btn mt-16 ghost" data-action="change-zone">Buscar en otra zona</button></div>`}
  ` };
};

screens['help-zone'] = () => ({
  tint: COLORS.help, title: '¿Dónde estás?', html: `
    <div class="screen-head"><h1>Selecciona tu zona</h1><p class="sub">Elige tu estado, municipio y parroquia.</p></div>
    ${geoFields('z', {})}
    <button class="btn ghost sm mt-8" data-action="geo-here" data-prefix="z">${icon('locate')}Usar mi ubicación actual</button>
    <div id="z-coords" class="muted" style="font-size:13px;margin-top:8px"></div>
    <input type="hidden" id="z-coords-val">
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.help}" data-action="zone-continue">Continuar</button></div>
  ` });

/* ========== 2. QUIERO DONAR ========== */
screens['donate-what'] = () => ({
  tint: COLORS.donate, title: 'Quiero donar', html: `
    <div class="screen-head"><h1>¿Qué quieres donar?</h1></div>
    <div class="opt-list">${DONATE_TYPES.map(d => `<button class="opt" data-action="donate-type" data-k="${d.key}">${icon(d.icon)}<span class="lbl">${d.label}</span><span class="ch-go">${icon('chevron')}</span></button>`).join('')}</div>
  ` });

screens['donate-where'] = () => ({
  tint: COLORS.donate, title: 'Quiero donar', html: `
    <div class="screen-head"><h1>¿Dónde quieres donar?</h1><p class="sub">${App.ctx.donateType ? 'Vas a donar: ' + (DONATE_TYPES.find(d => d.key === App.ctx.donateType)?.label || '') : ''}</p></div>
    <div class="opt-list">${DONATE_WHERE.map(d => `<button class="opt" data-action="donate-where" data-k="${d.key}">${icon(d.icon)}<span class="lbl">${d.label}</span><span class="ch-go">${icon('chevron')}</span></button>`).join('')}</div>
  ` });

screens['donate-urgent'] = () => {
  const ranking = urgentNeeds();
  return { tint: COLORS.donate, title: 'Necesidades urgentes', html: `
    <div class="screen-head"><h1>Necesidad más urgente</h1><p class="sub">Toca una necesidad para ver los centros que la requieren.</p></div>
    ${ranking.length ? ranking.map(r => `<button class="card" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;margin-bottom:10px" data-action="urgent-need" data-k="${r.key}">
      <span class="m-ico" style="width:42px;height:42px;border-radius:11px;display:grid;place-items:center;background:var(--primary-soft);color:var(--primary)">${icon(need(r.key).icon)}</span>
      <span style="flex:1"><b style="font-size:16px">${need(r.key).label}</b><div class="muted" style="font-size:13px">${r.centers} centro(s) la necesita(n)</div></span>
      ${levelTag(r.level)}<span class="ch-go" style="color:var(--faint)">${icon('chevron')}</span></button>`).join('')
      : `<div class="empty">${icon('inbox')}<p>Aún no hay centros con necesidades publicadas.</p>
         <div class="btn-row mt-16"><button class="btn ghost" data-action="donate-where" data-k="especifico">Ver todos los centros</button></div></div>`}
  ` };
};

screens['donate-centers'] = (p) => {
  const loc = getUserLoc();
  const opts = { loc, needKey: p.needKey };
  let heading = p.title || 'Centros';
  if (p.all) heading = p.title || 'Todos los centros';
  else if (p.scope === 'cerca') {
    if (loc && loc.coords) heading = 'Centros más cercanos a ti';
    else if (loc && loc.estado) { opts.estado = loc.estado; heading = 'Centros en ' + loc.estado; }  // sin GPS: filtra por estado (el municipio del perfil puede no coincidir)
  } else if (p.scope === 'municipio') { opts.municipio = loc && loc.municipio; heading = 'Centros en ' + ((loc && loc.municipio) || 'tu municipio'); }
  else if (p.scope === 'parroquia') { opts.parroquia = loc && loc.parroquia; heading = 'Centros en ' + ((loc && loc.parroquia) || 'la parroquia'); }
  else if (p.scope === 'estado') { opts.estado = loc && loc.estado; heading = 'Centros en ' + ((loc && loc.estado) || 'el estado'); }
  else if (p.needKey) heading = 'Centros que necesitan ' + need(p.needKey).label.toLowerCase();
  const baseList = filterCenters(opts);
  // Filtro de ubicación en la propia lista (estado → municipio)
  const fe = App.ctx.cfEstado || '', fm = App.ctx.cfMunicipio || '';
  let list = baseList;
  if (fe) list = list.filter(c => c.estado === fe);
  if (fm) list = list.filter(c => c.municipio === fm);
  const estados = [...new Set(baseList.map(c => c.estado).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const municipios = fe ? [...new Set(baseList.filter(c => c.estado === fe).map(c => c.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')) : [];
  const showFilter = baseList.length > 6 || fe || fm;
  const filterBar = showFilter ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    <select class="select" style="flex:1;min-width:150px" onchange="setCenterFilter('estado',this.value)"><option value="">Todos los estados</option>${estados.map(e => `<option ${e === fe ? 'selected' : ''}>${e}</option>`).join('')}</select>
    ${fe && municipios.length ? `<select class="select" style="flex:1;min-width:150px" onchange="setCenterFilter('municipio',this.value)"><option value="">Todos los municipios</option>${municipios.map(m => `<option ${m === fm ? 'selected' : ''}>${m}</option>`).join('')}</select>` : ''}
  </div>` : '';
  const zona = loc ? [loc.parroquia, loc.municipio, loc.estado].filter(Boolean).join(', ') : '';
  return { tint: COLORS.donate, title: heading, html: `
    <div class="screen-head"><h1>${heading}</h1><p class="sub">${list.length} centro(s)${(fe || fm) ? ' en ' + [fm, fe].filter(Boolean).join(', ') : ''}.${zona && !fe ? ' Tu zona: ' + zona + '.' : ''} <a href="#" data-action="change-zone">Cambiar zona</a></p></div>
    ${filterBar}
    ${list.length ? list.map(c => centerCard(c, 'donate')).join('')
      : `<div class="empty">${icon('inbox')}<p>No hay centros ${(fe || fm) ? 'en esa ubicación' : 'en esta zona'} todavía.${(p.needKey || fe || fm) ? '' : ' Sé el primero en <b>crear uno</b>.'}</p>
         <div class="btn-row mt-16">${(fe || fm) ? `<button class="btn ghost" onclick="setCenterFilter('estado','')">Ver todos</button>` : `<button class="btn ghost" data-action="change-zone">Buscar en otra zona</button><button class="btn" ${nav('create-1')}>Crear centro</button>`}</div></div>`}
  ` };
};

/* ============================================================
   DIRECTORIO DE CENTROS — lista + buscador + tabla por zona
   (cuántos centros hay en cada estado / municipio / parroquia)
   ============================================================ */
const DIR_LEVELS = [
  { key: 'estado', label: 'Estado' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'parroquia', label: 'Parroquia' },
];
function dirState() { return App.dir || (App.dir = { q: '', estado: '', municipio: '', parroquia: '', group: 'estado' }); }

/* Centros que cumplen los filtros activos (zona + texto libre) */
function hasContact(c) { return !!((c.whatsapp || '').trim() || (c.instagram || '').trim()); }
function dirFiltered() {
  const s = dirState();
  const q = (s.q || '').trim().toLowerCase();
  const list = getCenters().filter(c => {
    if (s.estado && c.estado !== s.estado) return false;
    if (s.municipio && c.municipio !== s.municipio) return false;
    if (s.parroquia && (c.parroquia || '') !== s.parroquia) return false;
    if (q && ![c.name, c.estado, c.municipio, c.parroquia, c.address].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  // Los que tienen WhatsApp o Instagram (grupo de contacto) van primero.
  return list.sort((a, b) => (hasContact(b) ? 1 : 0) - (hasContact(a) ? 1 : 0));
}

/* Cuenta los centros por un campo (estado/municipio/parroquia), ordenado por cantidad */
function dirCounts(list, field) {
  const map = new Map();
  for (const c of list) {
    const v = ((c[field] || '') + '').trim() || '— Sin especificar';
    map.set(v, (map.get(v) || 0) + 1);
  }
  return [...map.entries()].map(([val, n]) => ({ val, n }))
    .sort((a, b) => b.n - a.n || a.val.localeCompare(b.val, 'es'));
}

function dirChipsHtml() {
  const s = dirState();
  const chips = [];
  ['estado', 'municipio', 'parroquia'].forEach(f => {
    if (s[f]) chips.push(`<button class="dir-chip" data-action="dir-clear" data-field="${f}">${s[f]} ${icon('close', 14)}</button>`);
  });
  if ((s.q || '').trim()) chips.push(`<button class="dir-chip" data-action="dir-clear" data-field="q">“${s.q.trim()}” ${icon('close', 14)}</button>`);
  if (!chips.length) return '';
  return `<div class="dir-chips">${chips.join('')}<button class="dir-chip clear-all" data-action="dir-clearall">Limpiar todo</button></div>`;
}

function dirTableHtml() {
  const s = dirState();
  const list = dirFiltered();
  const rows = dirCounts(list, s.group);
  const lvl = DIR_LEVELS.find(l => l.key === s.group) || DIR_LEVELS[0];
  const seg = DIR_LEVELS.map(l => `<button class="chip ${l.key === s.group ? 'sel' : ''}" data-action="dir-group" data-group="${l.key}">${l.label}</button>`).join('');
  const body = rows.length ? rows.map(r => {
    const pickable = r.val.charAt(0) !== '—';
    return `<button class="dir-row" ${pickable ? `data-action="dir-pick" data-field="${s.group}" data-val="${encodeURIComponent(r.val)}"` : 'disabled'}>
      <span class="dr-name">${r.val}</span>
      <span class="dr-count">${r.n}</span>
      ${pickable ? `<span class="dr-go">${icon('chevron', 16)}</span>` : ''}
    </button>`;
  }).join('') : `<div class="empty sm">${icon('inbox')}<p>Sin centros con estos filtros.</p></div>`;
  return `<div class="section-label">Centros por ${lvl.label.toLowerCase()} · ${rows.length} ${s.group === 'estado' ? 'estado(s)' : s.group === 'municipio' ? 'municipio(s)' : 'parroquia(s)'}</div>
    <div class="dir-seg">${seg}</div>
    <div class="dir-table">${body}</div>`;
}

function dirListHtml() {
  const list = dirFiltered();
  return `<div class="section-label">${list.length} centro(s)</div>
    ${list.length ? list.map(c => centerCard(c, 'donate')).join('')
      : `<div class="empty">${icon('inbox')}<p>No hay centros con estos filtros.</p></div>`}`;
}

function dirPaintBody() {
  const ch = document.getElementById('dir-chips'); if (ch) ch.innerHTML = dirChipsHtml();
  const t = document.getElementById('dir-table'); if (t) t.innerHTML = dirTableHtml();
  const l = document.getElementById('dir-list'); if (l) l.innerHTML = dirListHtml();
}

let _dirT;
function dirSearch(v) {
  dirState().q = v || '';
  clearTimeout(_dirT);
  _dirT = setTimeout(dirPaintBody, 180);
}

screens['centers-all'] = () => {
  const s = dirState();
  const total = getCenters().length;
  return { tint: COLORS.center, title: 'Centros de acopio', html: `
    <div class="screen-head"><h1>Centros de acopio</h1><p class="sub">${total} centro(s) registrados. Busca por nombre o zona, o mira cuántos hay en cada estado, municipio o parroquia.</p></div>
    <div class="field"><input class="input" id="dir-q" value="${(s.q || '').replace(/"/g, '&quot;')}" placeholder="Buscar por nombre, estado, municipio o parroquia…" oninput="dirSearch(this.value)"></div>
    <div id="dir-chips">${dirChipsHtml()}</div>
    <div id="dir-table">${dirTableHtml()}</div>
    <div id="dir-list">${dirListHtml()}</div>
  ` };
};

screens['loc-pick'] = (p) => ({
  tint: COLORS.donate, title: p.pickOther ? 'Elegir zona' : 'Tu zona', html: `
    <div class="screen-head"><h1>${p.pickOther ? '¿En qué zona quieres donar?' : '¿Dónde estás?'}</h1><p class="sub">Filtraremos los centros por esa zona.</p></div>
    ${geoFields('lp', getUserLoc() || {})}
    <button class="btn ghost sm mt-8" data-action="geo-here" data-prefix="lp">${icon('locate')}Usar mi ubicación actual</button>
    <div id="lp-coords" class="muted" style="font-size:13px;margin-top:8px"></div>
    <input type="hidden" id="lp-coords-val">
    <div class="sticky-cta"><button class="btn" data-action="loc-continue" data-then="${p.then || 'donate-centers'}" data-scope="${p.scope || 'municipio'}">${icon('search')}Ver centros</button></div>
  ` });

/* ---------- Perfil público del centro ---------- */
screens['center-public'] = (p) => {
  const c = getCenter(p.id); if (!c) return notFound();
  const methods = c.accepts.filter(a => a !== 'transporte').map(a => `<span class="badge muted">${icon(a === 'fisico' ? 'box' : a === 'pagomovil' ? 'money' : a === 'cripto' ? 'coin' : 'users')}${a === 'fisico' ? 'Insumos' : a === 'pagomovil' ? 'Pago Móvil' : a === 'cripto' ? 'Cripto' : 'Voluntarios'}</span>`).join(' ');
  const offerVol = c.needs.some(n => n.key === 'voluntarios') ? `<div class="mt-8"><button class="btn outline block" data-action="offer" data-id="${c.id}">${icon('users')}Ofrecer ayuda como voluntario</button></div>` : '';
  const contactHtml = (() => {
    const phones = c.phones || [], ig = c.instagram || '', wa = c.whatsapp || '';
    if (!phones.length && !ig && !wa) return '';
    const igLabel = ig.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, '');
    let rows = '';
    if (phones.length) rows += `<div class="kv"><span class="k">Teléfono</span><span class="v">${phones.join(' · ')}</span></div>`;
    if (ig) rows += `<div class="kv"><span class="k">Instagram</span><span class="v"><a href="${ig}" target="_blank" rel="noopener">${igLabel}</a></span></div>`;
    const btns = [];
    if (phones.length) btns.push(`<a class="btn sm" href="tel:${phones[0]}">${icon('phone')}Llamar</a>`);
    if (wa) btns.push(`<a class="btn sm ghost" href="https://wa.me/${wa}" target="_blank" rel="noopener">${icon('message')}WhatsApp</a>`);
    if (ig) btns.push(`<a class="btn sm ghost" href="${ig}" target="_blank" rel="noopener">${icon('share')}Instagram</a>`);
    return `<div class="section-label">Contacto</div><div class="card">${rows}${btns.length ? `<div class="btn-row mt-16">${btns.join('')}</div>` : ''}</div>`;
  })();
  return { tint: COLORS.center, title: c.name, html: `
    ${c.demo ? `<div class="notice" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412;margin-bottom:12px">${icon('info')}<div>Centro de <b>demostración</b>. No envíes donaciones reales aquí.</div></div>` : ''}
    ${c.photo ? `<img class="person-photo" style="max-height:200px;margin-bottom:14px" src="${c.photo}" alt="${c.name}">` : ''}
    <div class="card">
      <div class="cc-top"><div style="flex:1"><h1 style="font-size:21px">${c.name}</h1>
      <div class="cc-meta mt-8">${statusBadge(c.status)} <span class="badge dist">${c.type || 'Centro'}</span> <span class="badge dist">${icon('pin')}${[c.parroquia, c.municipio, c.estado].filter(Boolean).join(', ') || 'Zona no indicada'}</span></div></div></div>
      <div class="kv mt-16"><span class="k">Dirección</span><span class="v">${c.address}</span></div>
      <div class="kv"><span class="k">Referencia</span><span class="v">${c.reference || '—'}</span></div>
      <div class="kv"><span class="k">Horario</span><span class="v">${c.horario || 'Por confirmar'}</span></div>
      <button class="btn ghost sm mt-16" data-action="maps" data-id="${c.id}">${icon('route')}Ver en Google Maps</button>
    </div>

    ${(() => { const co = parseCoords(c.coords); if (!co) return ''; setTimeout(() => mountMap('center-map', [{ lat: co.lat, lng: co.lng, title: c.name }], { zoom: 15 }), 40); return `<div id="center-map" style="height:200px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);margin-top:8px"></div>`; })()}

    ${contactHtml}

    <div class="section-label">Qué necesita</div>
    ${needPills(c.needs)}

    <div class="section-label">Métodos disponibles</div>
    <div style="display:flex;flex-wrap:wrap;gap:7px">${methods || '<span class="muted">Por configurar</span>'}</div>

    <div class="section-label">Qué no recibe</div>
    <div class="card"><div class="muted" style="font-size:14px">${(c.notAccepts || []).join(' · ') || '—'}</div></div>

    <div class="section-label">Transparencia</div>
    <div class="stat-grid">
      <div class="stat"><div class="num">${c.stats.reportadas}</div><div class="lab">Donaciones reportadas</div></div>
      <div class="stat"><div class="num">${c.stats.confirmadas}</div><div class="lab">Confirmadas</div></div>
      <div class="stat"><div class="num">${c.stats.entregadas}</div><div class="lab">Entregas evidenciadas</div></div>
      <div class="stat"><div class="num">${c.stats.voluntarios}</div><div class="lab">Voluntarios activos</div></div>
    </div>
    ${(c.inventory && c.inventory.length) ? `<div class="card mt-16"><div class="section-label" style="margin-top:0">Inventario disponible</div>
      ${c.inventory.map(i => `<div class="kv"><span class="k">${i.label}</span><span class="v">${i.qty}</span></div>`).join('')}</div>` : ''}

    <div class="section-label">Actualizaciones</div>
    <div class="card"><div class="thread">${(c.updates || []).map(u => `<div class="thread-item ${u.type === 'urgente' ? 'urgente' : ''}"><div class="ti-date">${u.date}</div><div class="ti-text">${u.text}</div></div>`).join('') || '<span class="muted">Sin actualizaciones aún.</span>'}</div></div>

    <div class="sticky-cta">
      <button class="btn block" ${nav('center-donate', { id: c.id })}>${icon('heart')}Donar a este centro</button>
      <div class="btn-row mt-8">
        <button class="btn ghost" data-action="going" data-id="${c.id}">Avisar que voy</button>
        <button class="btn ghost" data-action="share" data-id="${c.id}">${icon('share')}Compartir</button>
      </div>
      ${offerVol}
    </div>
  ` };
};

/* ---------- Métodos de donación del centro ---------- */
screens['center-donate'] = (p) => {
  const c = getCenter(p.id); if (!c) return notFound();
  const m = [];
  if (c.accepts.includes('pagomovil')) m.push({ k: 'pagomovil', ic: 'money', t: 'Pago Móvil', s: 'Bolívares al instante' });
  if (c.transferencia) m.push({ k: 'transferencia', ic: 'bank', t: 'Transferencia bancaria', s: c.transferencia.banco });
  if (c.crypto && c.crypto.length) m.push({ k: 'cripto', ic: 'coin', t: 'USDT / USDC', s: c.crypto.map(x => x.red).join(' · ') });
  if (c.accepts.includes('fisico')) m.push({ k: 'fisico', ic: 'box', t: 'Insumos físicos', s: 'Llévalos al centro' });
  if (c.accepts.includes('voluntarios')) m.push({ k: 'voluntarios', ic: 'users', t: 'Voluntariado', s: 'Dona tu tiempo' });
  return { tint: COLORS.donate, title: 'Donar', html: `
    <div class="card"><div class="cc-name">${c.name}</div><div class="cc-meta mt-8">${statusBadge(c.status)}</div>
      <div class="needs-line"><b>Necesita:</b> ${c.needs.map(n => need(n.key).label).join(', ')}</div></div>
    <div class="section-label">Elige cómo donar</div>
    <div class="method-grid">${m.map(x => `<button class="method" ${nav('method-' + x.k, { id: c.id })}><span class="m-ico">${icon(x.ic)}</span><span class="m-txt"><b>${x.t}</b><span>${x.s}</span></span><span class="ch-go">${icon('chevron')}</span></button>`).join('')}</div>
  ` };
};

screens['method-pagomovil'] = (p) => {
  const c = getCenter(p.id); const d = c && c.pagomovil;
  if (!d || !d.banco) return methodMissing(c, 'Pago Móvil');
  const all = `Banco: ${d.banco}\nTeléfono: ${d.telefono}\nCédula/RIF: ${d.cedula}\nTitular: ${d.titular}\nConcepto: ${d.concepto}`;
  return { tint: COLORS.donate, title: 'Pago Móvil', html: `
    <div class="screen-head"><h1>Pago Móvil</h1><p class="sub">${c.name}</p></div>
    ${copyField('Banco', d.banco, d.banco)}${copyField('Teléfono', d.telefono, d.telefono)}${copyField('Cédula / RIF', d.cedula, d.cedula)}${copyField('Titular', d.titular, d.titular)}${copyField('Concepto sugerido', d.concepto, d.concepto)}
    <button class="btn ghost mt-16" data-action="copy" data-copy="${encodeURIComponent(all)}" data-label="Datos de Pago Móvil">${icon('copy')}Copiar todos los datos</button>
    <div class="sticky-cta"><button class="btn" ${nav('donate-upload', { id: c.id, method: 'Pago Móvil' })}>${icon('upload')}Ya pagué, subir comprobante</button></div>
  ` };
};

screens['method-transferencia'] = (p) => {
  const c = getCenter(p.id); const d = c && c.transferencia;
  if (!d || !d.banco) return methodMissing(c, 'Transferencia');
  const all = `Banco: ${d.banco}\nCuenta: ${d.cuenta}\nTitular: ${d.titular}\nCédula/RIF: ${d.cedula}`;
  return { tint: COLORS.donate, title: 'Transferencia', html: `
    <div class="screen-head"><h1>Transferencia bancaria</h1><p class="sub">${c.name}</p></div>
    ${copyField('Banco', d.banco, d.banco)}${copyField('Número de cuenta', d.cuenta, d.cuenta)}${copyField('Titular', d.titular, d.titular)}${copyField('Cédula / RIF', d.cedula, d.cedula)}
    <button class="btn ghost mt-16" data-action="copy" data-copy="${encodeURIComponent(all)}" data-label="Datos bancarios">${icon('copy')}Copiar todos los datos</button>
    <div class="sticky-cta"><button class="btn" ${nav('donate-upload', { id: c.id, method: 'Transferencia' })}>${icon('upload')}Subir comprobante</button></div>
  ` };
};

screens['method-cripto'] = (p) => {
  const c = getCenter(p.id);
  if (!c || !c.crypto || !c.crypto.length) return methodMissing(c, 'Cripto');
  const wallets = c.crypto.map(w => `<div class="card">
    <div class="cc-meta" style="margin-bottom:6px"><span class="badge muted">${icon('coin')}${w.red}</span></div>
    <div class="qr"></div>${copyField('Wallet', w.wallet, w.wallet)}</div>`).join('');
  return { tint: COLORS.donate, title: 'Cripto', html: `
    <div class="screen-head"><h1>Donar USDT / USDC</h1><p class="sub">${c.name} · wallets verificadas</p></div>
    ${wallets}
    <div class="field mt-16"><label>TX hash (opcional)<span class="opt-note"> — pega el hash de tu transacción</span></label>
      <input class="input" id="txhash" placeholder="0x... o hash TRON"></div>
    <div class="sticky-cta"><button class="btn" ${nav('donate-upload', { id: c.id, method: 'Cripto' })}>${icon('upload')}Registrar donación</button></div>
  ` };
};

screens['method-fisico'] = (p) => {
  const c = getCenter(p.id);
  return { tint: COLORS.donate, title: 'Insumos físicos', html: `
    <div class="screen-head"><h1>Llevar insumos</h1><p class="sub">${c.name}</p></div>
    <div class="card"><div class="kv"><span class="k">Dirección</span><span class="v">${c.address}</span></div>
      <div class="kv"><span class="k">Horario</span><span class="v">${c.horario || 'Por confirmar'}</span></div></div>
    <div class="section-label">Qué recibe</div><div class="card"><div class="muted">${c.needs.map(n => need(n.key).label).join(' · ')}</div></div>
    <div class="section-label">Qué no recibe</div><div class="card"><div class="muted">${(c.notAccepts || []).join(' · ') || '—'}</div></div>
    <div class="sticky-cta">
      <button class="btn success block" data-action="donate-insumos-open" data-id="${c.id}">${icon('box')}Ya doné: registrar lo que entregué</button>
      <div class="btn-row mt-8">
        <button class="btn ghost" data-action="going" data-id="${c.id}">${icon('check')}Avisar que voy</button>
        <button class="btn ghost" data-action="maps" data-id="${c.id}">${icon('route')}Cómo llegar</button>
      </div>
    </div>
  ` };
};

screens['method-voluntarios'] = (p) => {
  const c = getCenter(p.id);
  return { tint: COLORS.donate, title: 'Voluntariado', html: `
    <div class="screen-head"><h1>Dona tu tiempo</h1><p class="sub">${c.name} necesita voluntarios.</p></div>
    <div class="card"><p style="margin:0">Regístrate como voluntario y este centro verá tu solicitud.</p></div>
    <div class="sticky-cta"><button class="btn" ${nav('vol-skills')}>${icon('users')}Registrarme como voluntario</button></div>
  ` };
};

/* ---------- Subir comprobante ---------- */
screens['donate-upload'] = (p) => {
  const c = p.id ? getCenter(p.id) : null;
  const centerName = c ? c.name : (p.centerName || 'Fondo general verificado');
  return { tint: COLORS.donate, title: 'Subir comprobante', html: `
    <div class="screen-head"><h1>Reportar mi donación</h1><p class="sub">Esto ayuda al centro a confirmar que llegó.</p></div>
    <div class="field"><label>Centro de acopio</label><input class="input" id="d-center" value="${centerName}" readonly></div>
    <div class="field"><label>Método de pago</label><input class="input" id="d-method" value="${p.method || 'Pago Móvil'}" readonly></div>
    <div class="two-col">
      <div class="field"><label>Monto</label><input class="input" id="d-amount" placeholder="Ej. Bs. 500 / $20" inputmode="decimal"></div>
      <div class="field"><label>Banco o red</label><input class="input" id="d-bank" placeholder="Banesco / TRC20"></div>
    </div>
    <div class="field"><label>Captura del comprobante</label>
      <label class="uploader" id="d-up">${icon('upload')}<div>Toca para subir la captura</div><input type="file" accept="image/*" id="d-file"></label></div>
    <label class="check-row"><input type="checkbox" id="d-anon"><span>Donar de forma anónima</span></label>
    <div class="field" id="d-name-field"><label>Nombre <span class="opt-note">(opcional)</span></label><input class="input" id="d-name" placeholder="Tu nombre" value="${(session() && session().nombre) || ''}"></div>
    <div class="field"><label>Teléfono <span class="opt-note">(opcional)</span></label><input class="input" id="d-phone" placeholder="04xx-xxxxxxx"></div>
    <div class="field"><label>Mensaje <span class="opt-note">(opcional)</span></label><textarea class="textarea" id="d-msg" placeholder="Un mensaje para el centro"></textarea></div>
    <div class="sticky-cta"><button class="btn success" data-action="submit-donation" data-id="${p.id || ''}" data-center="${centerName}" data-method="${p.method || 'Pago Móvil'}">${icon('check')}Reportar donación</button></div>
  ` };
};

screens['donate-insumos'] = (p) => {
  const c = getCenter(p.id); if (!c) return notFound();
  const items = (App.ctx.movItems && App.ctx.movItems.length) ? App.ctx.movItems : (App.ctx.movItems = [{}]);
  const itemsHtml = items.map((it, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
    <input class="input" id="mi-${i}-insumo" list="insumos-dl" placeholder="Insumo" value="${(it.insumo || '').replace(/"/g, '&quot;')}" style="flex:2;min-width:0">
    <input class="input" id="mi-${i}-cant" type="number" inputmode="decimal" placeholder="Cant." value="${it.cantidad || ''}" style="width:70px">
    <input class="input" id="mi-${i}-uni" placeholder="Unid." value="${(it.unidad || '').replace(/"/g, '&quot;')}" style="width:76px">
    ${items.length > 1 ? `<button class="iconbtn" data-action="mov-del-item" data-i="${i}" aria-label="Quitar" style="width:36px;height:36px;min-width:36px">${icon('close')}</button>` : ''}
  </div>`).join('');
  return { tint: COLORS.donate, title: 'Registrar donación', html: `
    <div class="screen-head"><h1>¿Qué donaste?</h1><p class="sub">${c.name} · queda registrado con fecha/hora y suma al inventario del centro.</p></div>
    <div class="section-label">Insumos donados</div>
    <datalist id="insumos-dl">${NEEDS.map(n => `<option value="${n.label}">`).join('')}</datalist>
    ${itemsHtml}
    <button class="btn ghost sm" data-action="mov-add-item">${icon('plus')}Agregar otro insumo</button>
    <label class="check-row mt-16"><input type="checkbox" id="di-anon"><span>Donar de forma anónima</span></label>
    <div class="field"><label>Tu nombre <span class="opt-note">(opcional)</span></label><input class="input" id="di-name" placeholder="Tu nombre" value="${(session() && session().nombre) || ''}"></div>
    <div class="field"><label>Mensaje <span class="opt-note">(opcional)</span></label><input class="input" id="di-msg" placeholder="Un mensaje para el centro"></div>
    <div class="sticky-cta"><button class="btn success" data-action="submit-donacion-insumos" data-id="${c.id}" data-center="${c.name}">${icon('check')}Registrar donación</button></div>
  ` };
};

screens['my-donations'] = () => {
  const list = myDonations();
  return { tint: COLORS.donate, title: 'Mis donaciones', html: `
    <div class="screen-head"><h1>Mis donaciones</h1><p class="sub">Guardadas en este dispositivo.</p></div>
    ${list.length ? list.map(d => `<div class="card" style="margin-bottom:10px">
      <div class="cc-name">${d.centerName || 'Centro'}</div>
      <div class="muted" style="font-size:12.5px">${d.metodo || ''} · ${new Date(d.ts).toLocaleString('es')}</div>
      ${(d.items && d.items.length) ? `<div style="font-size:13.5px;margin-top:6px">${d.items.map(i => i.insumo + ' ' + i.cantidad + (i.unidad ? ' ' + i.unidad : '')).join(', ')}</div>` : (d.monto ? `<div style="font-size:13.5px;margin-top:6px">${d.monto}</div>` : '')}
    </div>`).join('') : `<div class="empty">${icon('heart')}<p>Aún no has registrado donaciones en este dispositivo.</p><button class="btn mt-16" data-go="donate-what">Donar ahora</button></div>`}
  ` };
};

screens['donation-status'] = (p) => {
  const d = (App._donation && String(App._donation.id) === String(p.id)) ? App._donation : DB.donations.find(x => String(x.id) === String(p.id));
  if (!d) return notFound();
  const states = DONATION_STATES;
  const curIdx = Math.max(0, states.indexOf(d.estado));
  const steps = states.map((s, i) => `<div class="dstep ${i < curIdx ? 'done' : i === curIdx ? 'cur' : 'todo'}"><span class="dot">${i <= curIdx ? icon('check') : ''}</span><div class="dlabel">${s}</div></div>`).join('');
  return { tint: COLORS.donate, title: 'Donación #' + d.id, html: `
    <div class="success-hero"><div class="check-circle">${icon('check')}</div><h2>¡Gracias por tu donación!</h2><p>Quedó registrada en el servidor. El centro la confirmará pronto.</p></div>
    <div class="card">
      <div class="kv"><span class="k">Donación</span><span class="v">#${d.id}</span></div>
      <div class="kv"><span class="k">Centro</span><span class="v">${d.centerName}</span></div>
      <div class="kv"><span class="k">Método</span><span class="v">${d.metodo}</span></div>
      ${(d.items && d.items.length) ? `<div class="kv"><span class="k">Donado</span><span class="v">${d.items.map(i => i.insumo + ' ' + i.cantidad + (i.unidad ? ' ' + i.unidad : '')).join(', ')}</span></div>` : `<div class="kv"><span class="k">Monto</span><span class="v">${d.monto || '—'}</span></div>`}
      <div class="kv"><span class="k">Donante</span><span class="v">${d.donante || 'Donante anónimo'}</span></div>
      <div class="kv"><span class="k">Fecha y hora</span><span class="v">${d.createdAt ? new Date(d.createdAt).toLocaleString('es') : (d.fecha || today())}</span></div>
      ${(d.items && d.items.length) ? `<div class="kv"><span class="k">Inventario</span><span class="v" style="color:var(--ok)">Sumado al centro ✓</span></div>` : `<div class="kv"><span class="k">Comprobante</span><span class="v">${d.comprobante ? 'Subido' : 'Pendiente'}</span></div>`}
    </div>
    <div class="section-label">Estado de la donación</div>
    <div class="card">${steps}</div>
    <div class="sticky-cta">
      ${d.centerId ? `<button class="btn ghost block" ${nav('center-public', { id: d.centerId })}>Ver centro</button>` : ''}
      <button class="btn ghost block mt-8" data-go="my-donations">${icon('heart')}Ver mis donaciones</button>
      <button class="btn block mt-8" data-home>Volver al inicio</button>
    </div>
  ` };
};

/* ========== 3. QUIERO SER VOLUNTARIO ========== */
screens['vol-skills'] = () => {
  const sel = new Set(App.ctx.skills || []);
  const chips = VOL_SKILLS.map(s => `<button class="chip ${sel.has(s.key) ? 'sel' : ''}" data-action="toggle" data-group="skills" data-key="${s.key}">${icon(s.icon)}${s.label}</button>`).join('');
  return { tint: COLORS.vol, title: 'Ser voluntario', html: `
    <div class="screen-head"><h1>¿Cómo puedes ayudar?</h1><p class="sub">Toca todo lo que apliques. Puedes elegir varios.</p></div>
    <div class="chips">${chips}</div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.vol}" data-action="skills-next">Continuar</button></div>
  ` };
};

screens['vol-data'] = () => {
  const sel = (App.ctx.skills || []).map(k => SKILL_MAP[k]?.label).filter(Boolean).join(', ') || 'Ninguna seleccionada';
  return { tint: COLORS.vol, title: 'Tus datos', html: `
    <div class="screen-head"><h1>Datos mínimos</h1><p class="sub">Solo lo necesario para conectarte con un centro.</p></div>
    <div class="two-col">
      <div class="field"><label>Nombre</label><input class="input" id="v-nombre" placeholder="Nombre"></div>
      <div class="field"><label>Apellido</label><input class="input" id="v-apellido" placeholder="Apellido"></div>
    </div>
    <div class="field"><label>Cédula <span class="opt-note">(opcional / privada)</span></label><input class="input" id="v-cedula" placeholder="V-..."></div>
    <div class="field"><label>WhatsApp</label><input class="input" id="v-whatsapp" placeholder="04xx-xxxxxxx" inputmode="tel"></div>
    ${geoFields('v', { estado: 'Miranda' })}
    <div class="field"><label>Disponibilidad</label><select class="select" id="v-disp"><option>Mañanas</option><option>Tardes</option><option>Noches</option><option>Fines de semana</option><option>Tiempo completo</option></select></div>
    <div class="field"><label>Habilidades seleccionadas</label><div class="card" style="padding:12px"><div class="muted" style="font-size:14px">${sel}</div></div></div>
    <div class="two-col">
      <div class="field"><label>¿Tienes vehículo?</label><select class="select" id="v-veh"><option>No</option><option>Carro</option><option>Moto</option><option>Camioneta</option></select></div>
      <div class="field"><label>¿Puedes movilizarte?</label><select class="select" id="v-mov"><option>Sí</option><option>Solo en mi zona</option><option>No</option></select></div>
    </div>
    <div class="field"><label>Foto <span class="opt-note">(opcional)</span></label><label class="uploader" id="v-up">${icon('camera')}<div>Toca para subir una foto</div><input type="file" accept="image/*" id="v-file"></label></div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.vol}" data-action="register-vol">${icon('check')}Registrarme</button></div>
  ` };
};

screens['vol-tasks'] = () => {
  const tasks = getCenters().filter(c => c.tasks && c.tasks.length).flatMap(c => c.tasks.map(t => ({ ...t, center: c })));
  return { tint: COLORS.vol, title: 'Tareas para ti', html: `
    <div class="success-hero"><div class="check-circle">${icon('check')}</div><h2>¡Gracias por registrarte!</h2><p>Estos centros cerca de ti necesitan voluntarios.</p></div>
    ${tasks.map(t => `<div class="card">
      <div class="cc-name">${t.center.name}</div>
      <div class="needs-line">${t.needLabel}</div>
      <div class="cc-meta mt-8">${icon('clock')}<span>Horario: ${t.horario}</span> · ${icon('pin')}<span>${t.center.distance} km</span></div>
      <button class="btn sm mt-16" style="background:${COLORS.vol}" data-action="apply-task" data-center="${t.center.id}" data-task="${t.title}">${t.skill === 'transporte' ? 'Ofrecer transporte' : 'Quiero ayudar aquí'}</button>
    </div>`).join('')}
    <div class="sticky-cta"><button class="btn ghost" data-action="open-vol-panel">Ir a mi panel de voluntario</button></div>
  ` };
};

/* ========== 4. YA SOY VOLUNTARIO ========== */
screens['vol-login'] = () => ({
  tint: COLORS.myvol, title: 'Ya soy voluntario', html: `
    <div class="screen-head"><h1>Busca tu perfil</h1><p class="sub">Sin contraseña. Ingresa tu WhatsApp o cédula.</p></div>
    <div class="field"><label>WhatsApp o cédula</label><input class="input" id="vl-id" placeholder="04xx-xxxxxxx o V-..."></div>
    <button class="btn" style="background:${COLORS.myvol}" data-action="vol-find">${icon('search')}Buscar mi perfil</button>
    <p class="muted center-txt mt-16" style="font-size:13px">Prueba con <b>0414-1234567</b> (perfil de demostración).</p>
  ` });

screens['vol-panel'] = () => {
  const v = load('volunteer', null) || { nombre: 'Voluntario', apellido: 'Demo', estado: 'Miranda', municipio: 'Chacao', parroquia: 'Chacao', disp: 'Tardes', skills: ['cargar', 'clasificar', 'entregar'] };
  const skills = (v.skills || []).map(k => SKILL_MAP[k]?.label || k).join(', ');
  const sol = App._apps || [];
  return { tint: COLORS.myvol, title: 'Mi panel', html: `
    <div class="card">
      <div style="display:flex;align-items:center;gap:13px">
        ${avatar(v)}
        <div><div class="cc-name">${v.nombre} ${v.apellido || ''}</div><div class="muted" style="font-size:13.5px">${v.parroquia || ''}, ${v.municipio || ''} · ${v.disp || ''}</div></div>
      </div>
      <div class="kv mt-16"><span class="k">Habilidades</span><span class="v">${skills || '—'}</span></div>
      <div class="kv"><span class="k">Ubicación</span><span class="v">${v.estado || '—'}</span></div>
      <button class="btn ghost sm mt-16" data-action="update-disp">${icon('edit')}Actualizar disponibilidad</button>
    </div>

    <div class="section-label">Mis solicitudes enviadas</div>
    <div class="card">
      ${sol.length ? sol.map(s => `<div class="list-row">${icon('clipboard')}<div class="lr-main"><b>${s.task}</b><span>${s.center_name} · ${s.status === 'pending' ? 'Pendiente de revisión' : s.status}</span></div><span class="badge ${s.status === 'pending' ? 'pend' : 'ok'}">${s.status === 'pending' ? 'Pendiente' : 'Aceptada'}</span></div>`).join('') : `<div class="muted" style="font-size:14px">Aún no has enviado solicitudes.</div>`}
    </div>

    <div class="section-label">Historial de ayudas</div>
    <div class="card"><div class="list-row">${icon('pkgcheck')}<div class="lr-main"><b>Entrega de agua — 20 cajas</b><span>Evidencia subida</span></div><span class="badge ok">Completada</span></div></div>

    <div class="section-label">Centros cercanos que necesitan ayuda</div>
    ${getCenters().filter(c => c.needs.some(n => n.key === 'voluntarios')).slice(0, 2).map(c => centerCard(c, 'donate')).join('') || '<div class="muted" style="font-size:14px">—</div>'}

    <div class="sticky-cta"><button class="btn" style="background:${COLORS.myvol}" data-action="vol-evidence">${icon('upload')}Subir evidencia de una ayuda</button></div>
  ` };
};

/* ========== 5. SOY UN CENTRO DE ACOPIO ========== */
screens['my-centers'] = () => {
  const list = App._myCenters || [];
  return { tint: COLORS.center, title: 'Mis centros', html: `
    <div class="screen-head"><h1>Mis centros de acopio</h1><p class="sub">Solo tú (su responsable) puedes gestionarlos.</p></div>
    ${list.length ? list.map(c => `<div class="card">
        <div class="cc-name">${c.name}</div>
        <div class="cc-meta mt-8">${statusBadge(c.status)} <span class="badge dist">${[c.municipio, c.estado].filter(Boolean).join(', ') || '—'}</span></div>
        <button class="btn sm mt-16" style="background:${COLORS.center}" data-action="open-center-panel" data-id="${c.id}">Entrar al panel</button>
      </div>`).join('')
      : `<div class="empty">${icon('building')}<p>Aún no tienes centros registrados.</p></div>`}
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.create}" data-action="open-create">${icon('plus')}Registrar un centro</button></div>
  ` };
};

screens['center-panel'] = (p) => {
  const c = getCenter(p.id) || getCenters()[0];
  if (!c) return notFound();
  const dons = App._centerDons || [];
  const pend = dons.filter(d => d.estado === 'Reportada' || d.estado === 'Pendiente de confirmar').length;
  const acts = [
    { ic: 'inbox', l: 'Ver perfil público', go: true },
    { ic: 'edit', l: 'Actualizar qué necesito', a: 'edit-needs' },
    { ic: 'box', l: 'Actualizar inventario', a: 'edit-inventory' },
    { ic: 'upload', l: 'Subir evidencia', a: 'center-evidence' },
    { ic: 'message', l: 'Publicar actualización', a: 'center-update' },
    { ic: 'users', l: 'Ver voluntarios ofrecidos', a: 'center-apps' },
    { ic: 'users', l: 'Solicitar voluntarios', a: 'request-vol' },
    { ic: 'truck', l: 'Solicitar transporte', a: 'request-transp' },
    { ic: 'money', l: 'Editar métodos de donación', a: 'edit-methods' },
    { ic: 'clock', l: 'Cambiar horario', a: 'edit-horario' },
    { ic: 'close', l: 'Marcar como cerrado temporalmente', a: 'close-center' },
  ];
  const rows = acts.map(x => x.go
    ? `<button class="strip-row" ${nav('center-public', { id: c.id })}>${icon(x.ic)}<span class="lbl">${x.l}</span><span class="ch-go">${icon('chevron')}</span></button>`
    : `<button class="strip-row" data-action="${x.a}" data-id="${c.id}">${icon(x.ic)}<span class="lbl">${x.l}</span><span class="ch-go">${icon('chevron')}</span></button>`).join('');
  return { tint: COLORS.center, title: c.name, html: `
    <div class="card">
      <div class="cc-name">${c.name}</div>
      <div class="cc-meta mt-8">${statusBadge(c.status)}</div>
      <p class="muted mt-16" style="margin:0;font-size:14px">Resumen de hoy:</p>
      <div class="stat-grid mt-8">
        <div class="stat"><div class="num">${dons.length}</div><div class="lab">Donaciones recibidas</div></div>
        <div class="stat"><div class="num">${dons.filter(d => (d.metodo || '').toLowerCase().includes('usdt') || (d.metodo || '').toLowerCase().includes('cripto')).length}</div><div class="lab">Donaciones en cripto</div></div>
        <div class="stat"><div class="num">${c.stats.voluntarios}</div><div class="lab">Personas ofrecieron ayuda</div></div>
        <div class="stat"><div class="num">${pend}</div><div class="lab">Comprobantes por confirmar</div></div>
      </div>
    </div>
    <button class="btn block mt-16" style="background:${COLORS.center}" data-action="open-logistica" data-id="${c.id}">${icon('box')}Logística e inventario (entradas / salidas)</button>
    <div class="btn-row mt-8">
      <button class="btn ghost" ${nav('center-confirm', { id: c.id })}>${icon('check')}Confirmar donaciones</button>
      <button class="btn ghost" data-action="center-update" data-id="${c.id}">${icon('message')}Publicar</button>
    </div>
    <div class="section-label">Gestión del centro</div>
    <div class="strip">${rows}</div>
    ${session() && session().admin ? `<button class="btn ghost block mt-12" data-action="assign-admin" data-id="${c.id}">${icon('user')}Asignar admin a este centro (coordinador)</button>` : ''}
  ` };
};

/* ===== Logística por centro: entradas / salidas / beneficiarios ===== */
function captureMovItems() {
  const n = (App.ctx.movItems || []).length; const items = [];
  for (let i = 0; i < n; i++) items.push({ insumo: val('mi-' + i + '-insumo'), cantidad: val('mi-' + i + '-cant'), unidad: val('mi-' + i + '-uni') });
  App.ctx.movItems = items.length ? items : [{}]; return App.ctx.movItems;
}
// Identidad anónima por dispositivo (para que un usuario sin registro vea sus donaciones)
function deviceId() { let d = load('did', null); if (!d) { d = 'd-' + Math.random().toString(36).slice(2, 10); save('did', d); } return d; }
function myDonations() { return load('misdon', []) || []; }
function pushMyDonation(d) { try { const a = myDonations(); a.unshift({ id: d.id, centerName: d.centerName, metodo: d.metodo, monto: d.monto || '', items: d.items || [], ts: Date.now() }); save('misdon', a.slice(0, 60)); } catch {} }
screens['center-logistica'] = (p) => {
  const m = App._mov;
  if (!m) return { tint: COLORS.center, title: 'Logística', html: `<div class="empty">${icon('box')}<p>Cargando…</p></div>` };
  const inv = m.inventario || [], h = m.hoy || {}, movs = m.movements || [];
  const movRow = x => {
    const dt = x.createdAt ? new Date(x.createdAt) : null;
    const fecha = dt ? dt.toLocaleDateString('es') + ' ' + dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';
    if (x.type === 'beneficiarios') return `<div class="don-item"><b>👨‍👩‍👧 Beneficiarios</b> · ${x.familias || 0} familias, ${x.personas || 0} personas<div class="muted" style="font-size:12px">${fecha}${x.nota ? ' · ' + x.nota : ''}</div></div>`;
    const its = (x.items || []).map(i => `${i.insumo} ${i.cantidad}${i.unidad ? ' ' + i.unidad : ''}`).join(', ');
    const head = x.type === 'entrada' ? `📥 Entrada${x.origen ? ' · de ' + x.origen : ''}` : `📤 Salida${x.destino ? ' · → ' + x.destino : ''}`;
    const est = (x.type === 'salida' && x.destino) ? `<div class="mt-8">${statusBadgeMov(x.estado)} ${x.estado !== 'entregado' ? `<button class="btn sm ghost" data-action="mov-estado" data-id="${x.id}" data-center="${m.center.id}" data-estado="entregado">Marcar entregado</button>` : ''}</div>` : '';
    return `<div class="don-item"><b>${head}</b><div style="font-size:13.5px;margin-top:2px">${its}</div><div class="muted" style="font-size:12px">${fecha}${x.nota ? ' · ' + x.nota : ''}</div>${est}</div>`;
  };
  return { tint: COLORS.center, title: 'Logística', html: `
    <div class="screen-head"><h1>Logística e inventario</h1><p class="sub">${m.center.name}</p></div>
    <div class="section-label">Resumen de hoy</div>
    <div class="stat-grid">
      <div class="stat"><div class="num" style="color:var(--ok)">${h.entradas || 0}</div><div class="lab">Entradas hoy</div></div>
      <div class="stat"><div class="num" style="color:var(--bad)">${h.salidas || 0}</div><div class="lab">Salidas hoy</div></div>
      <div class="stat"><div class="num">${h.familias || 0}</div><div class="lab">Familias hoy</div></div>
      <div class="stat"><div class="num">${(m.totals && m.totals.items) || 0}</div><div class="lab">Insumos en stock</div></div>
    </div>
    <div class="btn-row mt-16">
      <button class="btn" style="background:var(--ok,#059669)" data-action="mov-open" data-id="${m.center.id}" data-type="entrada">${icon('plus')}Entrada</button>
      <button class="btn" style="background:var(--bad,#cf142b)" data-action="mov-open" data-id="${m.center.id}" data-type="salida">${icon('truck')}Salida</button>
    </div>
    <button class="btn ghost block mt-8" data-action="mov-open" data-id="${m.center.id}" data-type="beneficiarios">${icon('users')}Registrar beneficiarios (familias atendidas)</button>
    <div class="section-label">Inventario actual</div>
    <div class="card">${inv.length ? inv.map(x => `<div class="kv"><span class="k">${x.insumo}</span><span class="v"><b>${x.cantidad}</b>${x.unidad ? ' ' + x.unidad : ''}</span></div>`).join('') : '<div class="muted" style="font-size:14px">Aún sin movimientos. Registra una entrada.</div>'}</div>
    <button class="btn outline block mt-8" data-action="logi-report">${icon('share')}Compartir reporte del día</button>
    <div class="section-label">Movimientos recientes</div>
    <div class="card">${movs.length ? movs.slice(0, 40).map(movRow).join('') : '<div class="muted" style="font-size:14px">Sin movimientos todavía.</div>'}</div>
  ` };
};
function statusBadgeMov(e) { return `<span class="badge ${e === 'entregado' ? 'ok' : 'pend'}">${e || 'enviado'}</span>`; }

screens['mov-form'] = (p) => {
  const type = p.type, id = p.id;
  const titles = { entrada: 'Registrar entrada', salida: 'Registrar salida / despacho', beneficiarios: 'Registrar beneficiarios' };
  const items = (App.ctx.movItems && App.ctx.movItems.length) ? App.ctx.movItems : (App.ctx.movItems = [{}]);
  const itemsHtml = items.map((it, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
    <input class="input" id="mi-${i}-insumo" list="insumos-dl" placeholder="Insumo" value="${(it.insumo || '').replace(/"/g, '&quot;')}" style="flex:2;min-width:0">
    <input class="input" id="mi-${i}-cant" type="number" inputmode="decimal" placeholder="Cant." value="${it.cantidad || ''}" style="width:70px">
    <input class="input" id="mi-${i}-uni" placeholder="Unid." value="${(it.unidad || '').replace(/"/g, '&quot;')}" style="width:76px">
    ${items.length > 1 ? `<button class="iconbtn" data-action="mov-del-item" data-i="${i}" aria-label="Quitar" style="width:36px;height:36px;min-width:36px">${icon('close')}</button>` : ''}
  </div>`).join('');
  return { tint: COLORS.center, title: titles[type] || 'Registrar', html: `
    <div class="screen-head"><h1>${titles[type] || 'Registrar'}</h1><p class="sub">Queda guardado al instante (adiós al lápiz).</p></div>
    ${type === 'beneficiarios' ? `
      <div class="two-col">
        <div class="field"><label>Familias atendidas</label><input class="input" id="mov-familias" type="number" inputmode="numeric" placeholder="0"></div>
        <div class="field"><label>Personas (aprox.)</label><input class="input" id="mov-personas" type="number" inputmode="numeric" placeholder="0"></div>
      </div>` : `
      <div class="section-label">Insumos</div>
      <datalist id="insumos-dl">${NEEDS.map(n => `<option value="${n.label}">`).join('')}</datalist>
      ${itemsHtml}
      <button class="btn ghost sm" data-action="mov-add-item">${icon('plus')}Agregar otro insumo</button>
      ${type === 'entrada' ? `<div class="field mt-16"><label>¿De dónde viene? (origen)</label><input class="input" id="mov-origen" placeholder="Donante, ministerio, otro centro…"></div>` : ''}
      ${type === 'salida' ? `<div class="field mt-16"><label>¿A dónde va? (destino — para despacho)</label><input class="input" id="mov-destino" placeholder="La Guaira, Parque de la Primera, familia…"></div>` : ''}
    `}
    <div class="field mt-8"><label>Nota (opcional)</label><input class="input" id="mov-nota" placeholder="Detalle, responsable, etc."></div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.center}" data-action="mov-submit" data-id="${id}" data-type="${type}">${icon('check')}Guardar</button></div>
  ` };
};

screens['admin-logistica'] = () => {
  const d = App._logi;
  if (!d) return { tint: '#0a2f72', title: 'Logística', html: `<div class="empty">${icon('box')}<p>Cargando…</p></div>` };
  const red = d.red || {}, card = (n, l) => `<div class="stat"><div class="num">${n || 0}</div><div class="lab">${l}</div></div>`;
  return { tint: '#0a2f72', title: 'Logística de la red', html: `
    <div class="screen-head"><h1>Logística de la red</h1><p class="sub">${d.activos || 0} centro(s) con movimientos registrados.</p></div>
    <div class="stat-grid">
      ${card(red.entradas, 'Entradas')}${card(red.salidas, 'Salidas')}${card(red.despachos, 'Despachos')}${card(red.familias, 'Familias atendidas')}
    </div>
    <div class="section-label">Por centro</div>
    ${(d.centros || []).length ? (d.centros || []).map(c => `<div class="card" style="margin-bottom:10px">
      <div class="cc-name">${c.name}</div>
      <div class="muted" style="font-size:12.5px">${[c.municipio, c.estado].filter(Boolean).join(', ') || '—'}</div>
      <div class="stat-grid mt-8">
        <div class="stat"><div class="num">${c.totals.entradas}</div><div class="lab">Entradas</div></div>
        <div class="stat"><div class="num">${c.totals.salidas}</div><div class="lab">Salidas</div></div>
        <div class="stat"><div class="num">${c.totals.items}</div><div class="lab">Insumos</div></div>
        <div class="stat"><div class="num">${c.totals.familias}</div><div class="lab">Familias</div></div>
      </div>
      <div class="btn-row mt-8"><button class="btn ghost sm" data-action="open-center-panel" data-id="${c.id}">${icon('building')}Ver panel</button><button class="btn ghost sm" data-action="assign-admin" data-id="${c.id}">${icon('user')}Asignar admin</button></div>
    </div>`).join('') : `<div class="empty">${icon('box')}<p>Aún no hay movimientos. Cuando los centros registren entradas/salidas, aparecerán aquí.</p></div>`}
  ` };
};

screens['center-confirm'] = (p) => {
  const c = getCenter(p.id) || getCenters()[0];
  const dons = App._centerDons || [];
  return { tint: COLORS.center, title: 'Confirmar donaciones', html: `
    <div class="screen-head"><h1>Donaciones reportadas</h1><p class="sub">${c.name}</p></div>
    ${dons.length ? dons.map(d => `<div class="don-item" id="don-${d.id}">
      <div class="di-top"><div><div class="di-amount">${d.monto || '—'}</div><div class="di-meta">${d.donante || 'Donante anónimo'} · ${d.metodo}</div></div>
        <span class="badge ${d.estado.startsWith('Confirmada') ? 'ok' : (d.estado === 'Rechazada' || d.estado === 'No recibida') ? 'bad' : 'pend'}">${d.estado}</span></div>
      <div class="di-meta mt-8">${d.banco ? d.banco + ' · ' : ''}${d.fecha || ''} · Comprobante ${d.comprobante ? 'subido' : 'pendiente'}</div>
      ${d.comprobanteUrl ? `<img class="person-photo" style="max-height:160px;margin-top:10px" src="${d.comprobanteUrl}" alt="comprobante">` : ''}
      <div class="don-actions">
        <button class="accept" data-action="confirm-don" data-id="${d.id}" data-center="${c.id}" data-st="Confirmada por el centro">Recibida</button>
        <button data-action="confirm-don" data-id="${d.id}" data-center="${c.id}" data-st="No recibida">No recibida</button>
        <button data-action="confirm-don" data-id="${d.id}" data-center="${c.id}" data-st="Duplicada">Duplicada</button>
        <button class="reject" data-action="confirm-don" data-id="${d.id}" data-center="${c.id}" data-st="Rechazada">Rechazada</button>
        <button data-action="confirm-don" data-id="${d.id}" data-center="${c.id}" data-st="Necesita revisión">Necesita revisión</button>
      </div></div>`).join('') : `<div class="empty">${icon('inbox')}<p>Aún no hay donaciones reportadas para este centro.<br>Cuando alguien done, aparecerá aquí.</p></div>`}
  ` };
};

/* ---------- Edición del centro (panel real) ---------- */
screens['center-needs'] = (p) => {
  const c = getCenter(p.id); const sel = App.ctx.editNeeds || {};
  const grid = NEEDS.map(n => `<button class="chip ${sel[n.key] ? 'sel' : ''}" data-action="toggle-edit-need" data-key="${n.key}">${icon(n.icon)}${n.label}</button>`).join('');
  const keys = Object.keys(sel);
  const levels = keys.length ? `<div class="section-label">Nivel de cada necesidad</div>${keys.map(k => `<div class="kv"><span class="k">${icon(need(k).icon)} ${need(k).label}</span>
    <select class="select" style="width:130px;min-height:40px" data-action="edit-need-level" data-key="${k}">${['baja', 'media', 'alta', 'critica'].map(l => `<option value="${l}" ${sel[k] === l ? 'selected' : ''}>${LEVEL_LABELS[l].label}</option>`).join('')}</select></div>`).join('')}` : '';
  return { tint: COLORS.center, title: 'Qué necesito', html: `
    <div class="screen-head"><h1>Actualizar necesidades</h1><p class="sub">${c.name}</p></div>
    <div class="chips">${grid}</div>${levels}
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.center}" data-action="save-needs" data-id="${p.id}">${icon('check')}Guardar necesidades</button></div>
  ` };
};

screens['center-inventory'] = (p) => {
  const c = getCenter(p.id); const inv = App.ctx.inv || [];
  return { tint: COLORS.center, title: 'Inventario', html: `
    <div class="screen-head"><h1>Inventario disponible</h1><p class="sub">${c.name}</p></div>
    ${inv.length ? inv.map((i, idx) => `<div class="card" style="display:flex;gap:8px;align-items:center;padding:10px">
      <input class="input inv-label" value="${(i.label || '').replace(/"/g, '&quot;')}" placeholder="Insumo (ej. Agua, cajas)" style="flex:1">
      <input class="input inv-qty" value="${i.qty || 0}" inputmode="numeric" style="width:74px;text-align:center">
      <button class="iconbtn" data-action="inv-del" data-idx="${idx}" aria-label="Eliminar" style="color:var(--bad)">${icon('close')}</button></div>`).join('')
      : `<div class="empty" style="padding:24px">${icon('box')}<p>Sin insumos aún. Agrega lo que tienes disponible.</p></div>`}
    <button class="btn ghost mt-8" data-action="inv-add">${icon('plus')}Agregar insumo</button>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.center}" data-action="save-inv" data-id="${p.id}">${icon('check')}Guardar inventario</button></div>
  ` };
};

screens['center-methods'] = (p) => {
  const c = getCenter(p.id); const pm = c.pagomovil || {}, tr = c.transferencia || {}, cr = (c.crypto && c.crypto[0]) || {};
  return { tint: COLORS.center, title: 'Métodos de donación', html: `
    <div class="screen-head"><h1>Métodos de donación</h1><p class="sub">${c.name}. Completa solo los que uses.</p></div>
    <div class="section-label" style="margin-top:0">Pago Móvil</div>
    <div class="field"><input class="input" id="em-pm-banco" value="${pm.banco || ''}" placeholder="Banco"></div>
    <div class="two-col"><div class="field"><input class="input" id="em-pm-tel" value="${pm.telefono || ''}" placeholder="Teléfono"></div><div class="field"><input class="input" id="em-pm-ci" value="${pm.cedula || ''}" placeholder="Cédula/RIF"></div></div>
    <div class="field"><input class="input" id="em-pm-tit" value="${pm.titular || ''}" placeholder="Titular"></div>
    <div class="section-label">Transferencia</div>
    <div class="two-col"><div class="field"><input class="input" id="em-tr-banco" value="${tr.banco || ''}" placeholder="Banco"></div><div class="field"><input class="input" id="em-tr-cta" value="${tr.cuenta || ''}" placeholder="Nº de cuenta"></div></div>
    <div class="field"><input class="input" id="em-tr-tit" value="${tr.titular || ''}" placeholder="Titular"></div>
    <div class="section-label">Cripto</div>
    <div class="field"><input class="input" id="em-cr-red" value="${cr.red || ''}" placeholder="Red (USDT TRC20, USDC Polygon...)"></div>
    <div class="field"><input class="input" id="em-cr-wallet" value="${cr.wallet || ''}" placeholder="Dirección de wallet"></div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.center}" data-action="save-methods" data-id="${p.id}">${icon('check')}Guardar métodos</button></div>
  ` };
};

/* ========== 6. CREAR CENTRO (wizard) ========== */
function stepsBar(cur) { return `<div class="steps">${[1, 2, 3, 4, 5, 6].map(i => `<div class="step ${i < cur ? 'done' : i === cur ? 'cur' : ''}"></div>`).join('')}</div>`; }

screens['create-1'] = () => ({
  tint: COLORS.create, title: 'Crear centro · 1/6', html: `${stepsBar(1)}
    <div class="screen-head"><h1>Datos básicos</h1></div>
    <div class="field"><label>Nombre del centro</label><input class="input" id="c-nombre" placeholder="Centro de Acopio..."></div>
    <div class="field"><label>Tipo de centro</label><select class="select" id="c-tipo">${CENTER_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
    <div class="two-col">
      <div class="field"><label>Responsable</label><input class="input" id="c-resp" placeholder="Nombre"></div>
      <div class="field"><label>Apellido</label><input class="input" id="c-resp-ap" placeholder="Apellido"></div>
    </div>
    <div class="field"><label>Cédula o RIF</label><input class="input" id="c-rif" placeholder="V- / J-"></div>
    <div class="field"><label>WhatsApp</label><input class="input" id="c-wa" placeholder="04xx-xxxxxxx" inputmode="tel"></div>
    <div class="field"><label>Instagram o web <span class="opt-note">(opcional)</span></label><input class="input" id="c-web" placeholder="@... o https://"></div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.create}" data-action="create-next" data-step="1">Continuar</button></div>
  ` });

screens['create-2'] = () => ({
  tint: COLORS.create, title: 'Crear centro · 2/6', html: `${stepsBar(2)}
    <div class="screen-head"><h1>Ubicación</h1></div>
    ${geoFields('c', {}, { alcaldia: true })}
    <div class="field"><label>Dirección exacta</label><input class="input" id="c-dir" placeholder="Av., calle, edificio..."></div>
    <div class="field"><label>Referencia</label><input class="input" id="c-ref" placeholder="Punto de referencia"></div>
    <div class="field"><label>Ubicación en el mapa</label>
      <button class="btn ghost sm" data-action="geo-here" data-prefix="c">${icon('locate')}Usar mi ubicación actual</button>
      <div id="c-coords" class="muted" style="font-size:13px;margin-top:6px"></div>
      <input type="hidden" id="c-coords-val"></div>
    <div class="field"><label>Pin de Google Maps <span class="opt-note">(opcional)</span></label><input class="input" id="c-pin" placeholder="https://maps.google.com/..."></div>
    <div class="field"><label>Foto del lugar <span class="opt-note">(opcional)</span></label><label class="uploader" id="c-up">${icon('camera')}<div>Toca para subir una foto</div><input type="file" accept="image/*" id="c-file"></label></div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.create}" data-action="create-next" data-step="2">Continuar</button></div>
  ` });

screens['create-3'] = () => {
  const sel = App.ctx.cNeeds || {};
  const grid = NEEDS.map(n => `<button class="chip ${sel[n.key] ? 'sel' : ''}" data-action="toggle-need" data-key="${n.key}">${icon(n.icon)}${n.label}</button>`).join('');
  const selected = Object.keys(sel);
  const levels = selected.length ? `<div class="section-label">Nivel de cada necesidad</div>
    ${selected.map(k => `<div class="kv"><span class="k">${icon(need(k).icon)} ${need(k).label}</span>
      <select class="select" style="width:130px;min-height:40px" data-action="need-level" data-key="${k}">
        ${['baja', 'media', 'alta', 'critica'].map(l => `<option value="${l}" ${sel[k] === l ? 'selected' : ''}>${LEVEL_LABELS[l].label}</option>`).join('')}
      </select></div>`).join('')}` : '';
  return { tint: COLORS.create, title: 'Crear centro · 3/6', html: `${stepsBar(3)}
    <div class="screen-head"><h1>¿Qué necesita?</h1><p class="sub">Toca los insumos que necesitas y asigna un nivel.</p></div>
    <div class="chips">${grid}</div>${levels}
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.create}" data-action="create-next" data-step="3">Continuar</button></div>
  ` };
};

screens['create-4'] = () => {
  const rec = new Set(App.ctx.cRecibe || ['fisico']);
  const noRec = new Set(App.ctx.cNoRecibe || []);
  const recibe = [['fisico', 'Insumos físicos'], ['medicinas', 'Medicinas'], ['ropa', 'Ropa'], ['comida', 'Alimentos'], ['pagomovil', 'Pago Móvil'], ['cripto', 'Cripto'], ['voluntarios', 'Voluntarios'], ['transporte', 'Transporte']];
  const noRecibe = ['Medicinas vencidas', 'Comida vencida', 'Ropa en mal estado', 'Efectivo físico sin registro', 'Otros'];
  return { tint: COLORS.create, title: 'Crear centro · 4/6', html: `${stepsBar(4)}
    <div class="screen-head"><h1>Qué recibe y qué no</h1></div>
    <div class="section-label" style="margin-top:0">Qué recibe</div>
    <div class="chips">${recibe.map(([k, l]) => `<button class="chip ${rec.has(k) ? 'sel' : ''}" data-action="toggle" data-group="cRecibe" data-key="${k}">${l}</button>`).join('')}</div>
    <div class="section-label">Qué no recibe</div>
    <div class="chips">${noRecibe.map(l => `<button class="chip ${noRec.has(l) ? 'sel' : ''}" data-action="toggle" data-group="cNoRecibe" data-key="${l}">${l}</button>`).join('')}</div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.create}" data-action="create-next" data-step="4">Continuar</button></div>
  ` };
};

screens['create-5'] = () => ({
  tint: COLORS.create, title: 'Crear centro · 5/6', html: `${stepsBar(5)}
    <div class="screen-head"><h1>Métodos de donación</h1><p class="sub">Completa solo los que uses.</p></div>
    <div class="section-label" style="margin-top:0">Pago Móvil</div>
    <div class="field"><input class="input" id="m-pm-banco" placeholder="Banco"></div>
    <div class="two-col"><div class="field"><input class="input" id="m-pm-tel" placeholder="Teléfono"></div><div class="field"><input class="input" id="m-pm-ci" placeholder="Cédula/RIF"></div></div>
    <div class="field"><input class="input" id="m-pm-tit" placeholder="Titular"></div>
    <div class="section-label">Transferencia</div>
    <div class="two-col"><div class="field"><input class="input" id="m-tr-banco" placeholder="Banco"></div><div class="field"><input class="input" id="m-tr-cta" placeholder="Nº de cuenta"></div></div>
    <div class="field"><input class="input" id="m-tr-tit" placeholder="Titular"></div>
    <div class="section-label">Cripto</div>
    <div class="field"><input class="input" id="m-cr-red" placeholder="Red (USDT TRC20, USDC Polygon...)"></div>
    <div class="field"><input class="input" id="m-cr-wallet" placeholder="Dirección de wallet"></div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.create}" data-action="create-next" data-step="5">Continuar</button></div>
  ` });

screens['create-6'] = () => {
  const d = App.ctx.cData || {};
  const needs = Object.entries(App.ctx.cNeeds || {});
  return { tint: COLORS.create, title: 'Crear centro · 6/6', html: `${stepsBar(6)}
    <div class="screen-head"><h1>Revisar y enviar</h1></div>
    <div class="card">
      <div class="kv"><span class="k">Centro</span><span class="v">${d.nombre || '—'}</span></div>
      <div class="kv"><span class="k">Tipo</span><span class="v">${d.tipo || '—'}</span></div>
      <div class="kv"><span class="k">Responsable</span><span class="v">${((d.resp || '') + ' ' + (d.respAp || '')).trim() || '—'}</span></div>
      <div class="kv"><span class="k">Ubicación</span><span class="v">${[d.parroquia, d.municipio, d.estado].filter(Boolean).join(', ') || '—'}</span></div>
      <div class="kv"><span class="k">Necesita</span><span class="v">${needs.length ? needs.map(([k]) => need(k).label).join(', ') : '—'}</span></div>
    </div>
    <div class="card mt-16" style="background:var(--primary-soft);border-color:#c5d6f5">
      <p style="margin:0;font-size:14.5px">Tu centro se publicará como <b>pendiente de verificación</b>. Nuestro equipo revisará tus datos. Mientras tanto, podrás compartir tu perfil.</p>
    </div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.create}" data-action="create-submit">${icon('check')}Publicar y enviar a revisión</button></div>
  ` };
};

screens['create-done'] = (p) => {
  const c = getCenter(p.id);
  return { tint: COLORS.create, title: 'Centro publicado', html: `
    <div class="success-hero"><div class="check-circle">${icon('check')}</div><h2>¡Centro publicado!</h2><p>${c ? c.name : 'Tu centro'} quedó como <b>pendiente de verificación</b> y guardado en el servidor.</p></div>
    <div class="card"><div class="cc-meta">${statusBadge('pendiente')}</div></div>
    <div class="sticky-cta">
      <button class="btn block" style="background:${COLORS.create}" ${nav('center-public', { id: p.id })}>Ver perfil público</button>
      <div class="btn-row mt-8">
        <button class="btn ghost" data-action="share" data-id="${p.id}">${icon('share')}Compartir</button>
        <button class="btn ghost" data-action="open-center-panel" data-id="${p.id}">Ir al panel</button>
      </div>
      <button class="btn ghost block mt-8" data-home>Volver al inicio</button>
    </div>
  ` };
};

/* ========== PERSONAS (desaparecidos / encontrados) ========== */
screens['persons-list'] = () => {
  const f = App.ctx.personFilter || '';
  const list = DB.persons.slice(); // el servidor ya filtra por estado/búsqueda
  const s = App._personStats || { total: 0, desaparecidos: 0, encontrados: 0 };
  const loc = getUserLoc();
  const zona = (loc && (loc.estado || loc.municipio)) ? ' · ' + (loc.municipio || loc.estado) : '';
  const tabs = PERSON_FILTERS.map(t => `<button class="tab ${f === t.key ? 'active' : ''}" data-action="person-filter" data-k="${t.key}">${t.label}</button>`).join('');
  return { tint: COLORS.person, title: 'Personas reportadas', html: `
    <div class="screen-head"><h1>Personas reportadas</h1><p class="sub">Busca por nombre o zona. Si tienes información de alguien, compártela.</p></div>
    <div class="stat-grid">
      <div class="stat"><div class="num">${s.total}</div><div class="lab">Personas reportadas</div></div>
      <div class="stat"><div class="num" style="color:var(--bad,#cf142b)">${s.desaparecidos}</div><div class="lab">Aún sin contacto</div></div>
      <div class="stat"><div class="num" style="color:var(--ok,#1c7a3e)">${s.encontrados}</div><div class="lab">Localizados</div></div>
    </div>
    <div class="section-label">Teléfonos de emergencia${zona}</div>
    <div class="card">${EMERGENCY.map(e => `<div class="kv"><span class="k">${e.label}</span><span class="v"><a href="tel:${e.number.replace(/[^0-9*]/g, '')}">${e.number}</a></span></div>`).join('')}</div>
    <div class="field mt-16"><input class="input" id="psrch" value="${(App.ctx.personQuery || '').replace(/"/g, '&quot;')}" placeholder="Buscar por nombre o zona" oninput="doPersonSearch(this.value)"></div>
    <div class="tabs">${tabs}</div>
    <div id="persons-res">${list.length ? list.map(personCard).join('') : `<div class="empty">${icon('usersearch')}<p>${(App.ctx.personQuery || f) ? 'Sin resultados.' : 'Aún no hay reportes.'}</p></div>`}</div>
    ${disclaimer()}
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.person}" ${nav('person-type')}>${icon('plus')}Reportar una persona</button></div>
  ` };
};

screens['person-detail'] = () => {
  const p = App._person; if (!p) return notFound();
  const tel = (p.contactoTel || '').replace(/[^0-9]/g, '');
  const sightings = p.sightings || [];
  return { tint: COLORS.person, title: `${p.nombre} ${p.apellido || ''}`, html: `
    ${p.foto ? `<img class="person-photo" src="${p.foto}" alt="${p.nombre}">` : `<div class="avatar lg">${initials((p.nombre || '') + ' ' + (p.apellido || ''))}</div>`}
    <div class="center-txt mt-16"><h1 style="font-size:22px">${p.nombre} ${p.apellido || ''}</h1>
      <div class="mt-8">${personStatusBadge(p.status)}</div></div>
    <div class="card mt-16">
      <div class="kv"><span class="k">Edad</span><span class="v">${p.edad ? p.edad + ' años' : '—'}</span></div>
      <div class="kv"><span class="k">Sexo</span><span class="v">${p.sexo || '—'}</span></div>
      <div class="kv"><span class="k">Visto por última vez</span><span class="v">${p.fecha || '—'}</span></div>
      <div class="kv"><span class="k">Lugar</span><span class="v">${p.lugar || '—'}</span></div>
      <div class="kv"><span class="k">Zona</span><span class="v">${[p.parroquia, p.municipio, p.estado].filter(Boolean).join(', ') || '—'}</span></div>
    </div>
    ${p.descripcion ? `<div class="section-label">Descripción</div><div class="card"><div style="font-size:14.5px">${p.descripcion}</div></div>` : ''}
    <div class="section-label">Contacto</div>
    <div class="card">
      <div class="kv"><span class="k">${p.relacion || 'Contacto'}</span><span class="v">${p.contactoNombre || '—'}</span></div>
      ${p.contactoTel ? `<div class="btn-row mt-16"><a class="btn sm" href="tel:${tel}">${icon('phone')}Llamar</a><a class="btn sm ghost" href="https://wa.me/58${tel.replace(/^0/, '')}" target="_blank" rel="noopener">WhatsApp</a></div>` : ''}
    </div>
    <div class="section-label">Avistamientos e información</div>
    <div class="card">${sightings.length ? `<div class="thread">${sightings.map(s => `<div class="thread-item"><div class="ti-date">${s.date || ''} · ${s.lugar || ''}</div><div class="ti-text">${s.detalle || ''}${s.contacto ? ' — ' + s.contacto : ''}</div></div>`).join('')}</div>` : '<div class="muted" style="font-size:14px">Aún no hay reportes de avistamiento.</div>'}</div>
    <div class="sticky-cta">
      <button class="btn block" style="background:${COLORS.person}" data-action="person-sighting" data-id="${p.id}">${icon('pin')}Tengo información / lo vi</button>
      <div class="btn-row mt-8">
        <button class="btn ghost" data-action="person-share" data-id="${p.id}">${icon('share')}Compartir</button>
        ${p.status === 'desaparecido' ? `<button class="btn ghost" data-action="person-status" data-id="${p.id}" data-st="encontrado">Marcar encontrado</button>` : ''}
      </div>
    </div>
  ` };
};

/* ---------- Mascotas (perdidas / encontradas / refugio / veterinario) ---------- */
screens['pets'] = () => {
  const f = App.ctx.petFilter || '';
  const tabs = PET_FILTERS.map(t => `<button class="tab ${f === t.key ? 'active' : ''}" data-action="pet-filter" data-k="${t.key}">${t.label}</button>`).join('');
  const list = App._pets;
  const body = list == null
    ? `<div class="empty">${icon('inbox')}<p>Cargando…</p></div>`
    : (list.length ? list.map(petCard).join('') : `<div class="empty"><div style="font-size:34px">🐾</div><p>Aún no hay mascotas reportadas${f ? ' en esta categoría' : ''}. ¡Sé el primero!</p></div>`);
  return { tint: COLORS.person, title: 'Mascotas', html: `
    <div class="screen-head"><h1>Mascotas perdidas y encontradas</h1><p class="sub">¿Encontraste o perdiste una mascota? Repórtala con foto, dónde la viste y dónde estará.</p></div>
    <div class="field"><input class="input" id="pet-q" placeholder="Buscar (tipo, zona, descripción)" oninput="doPetSearch(this.value)"></div>
    <div class="tabs">${tabs}</div>
    <div id="pets-res" class="mt-12">${body}</div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.person}" data-action="pet-report" data-st="${f === 'encontrada' ? 'encontrada' : 'perdida'}">${icon('plus')}Reportar mascota</button></div>
  ` };
};

screens['pet-new'] = () => {
  const st = App.ctx.petStatus || 'perdida';
  const opts = Object.entries(PET_STATUS).map(([k, v]) => `<option value="${k}" ${k === st ? 'selected' : ''}>${v.label}</option>`).join('');
  return { tint: COLORS.person, title: 'Reportar mascota', html: `
    <div class="screen-head"><h1>Reportar mascota</h1><p class="sub">Sube una foto, di dónde la viste y dónde estará.</p></div>
    <div class="field"><label>Foto <span class="opt-note">(muy útil)</span></label><label class="uploader" id="pet-up">${icon('camera')}<div>Toca para subir una foto</div><input type="file" accept="image/*" id="pet-file"></label></div>
    <div class="two-col">
      <div class="field"><label>Situación</label><select class="select" id="pet-status">${opts}</select></div>
      <div class="field"><label>Tipo</label><select class="select" id="pet-tipo">${PET_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Nombre <span class="opt-note">(si lo sabes)</span></label><input class="input" id="pet-nombre" placeholder="Nombre de la mascota"></div>
    <div class="field"><label>Descripción</label><textarea class="textarea" id="pet-desc" placeholder="Raza, color, tamaño, collar, señas particulares..."></textarea></div>
    ${geoFields('pet', {})}
    <div class="field"><label>Lugar exacto</label><input class="input" id="pet-lugar" placeholder="¿Dónde la perdiste / encontraste?"></div>
    <div class="field"><label>¿Dónde estará? <span class="opt-note">(si la tienes)</span></label><input class="input" id="pet-destino" placeholder="Refugio, tu casa, veterinario..."></div>
    <div class="section-label">Contacto</div>
    <div class="two-col">
      <div class="field"><label>Tu nombre</label><input class="input" id="pet-cnombre" placeholder="Tu nombre"></div>
      <div class="field"><label>WhatsApp / teléfono</label><input class="input" id="pet-wa" placeholder="04xx-xxxxxxx" inputmode="tel"></div>
    </div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.person}" data-action="submit-pet">${icon('check')}Publicar</button></div>
  ` };
};

/* ---------- Asistente IA: buscar persona por nombre o foto ---------- */
screens['asistente'] = () => {
  const ai = !!(window.MAPS && window.MAPS.aiPhoto);
  return { tint: COLORS.person, title: 'Asistente', html: `
    <div class="screen-head"><h1>Asistente de búsqueda</h1><p class="sub">Escribe el nombre de quien buscas o sube una foto, y te digo si aparece en desaparecidos, hospitales o a salvo.</p></div>
    <div class="field"><label>Nombre</label><input class="input" id="as-name" placeholder="Nombre y/o apellido"></div>
    <div class="field"><label>Foto ${ai ? '<span class="opt-note">(la IA la compara con los reportes)</span>' : '<span class="opt-note">(búsqueda por foto: se activa pronto)</span>'}</label>
      <label class="uploader" id="as-up">${icon('camera')}<div>Toca para subir una foto</div><input type="file" accept="image/*" id="as-file"></label></div>
    <button class="btn block" style="background:${COLORS.person}" data-action="asistente-search">${icon('usersearch')}Buscar</button>
    <div id="asis-res" class="mt-16"></div>
  ` };
};
function renderAsistente(r) {
  const el = document.getElementById('asis-res'); if (!el) return;
  let h = '';
  if (r.needsKey) h += `<div class="notice">${icon('info')}<div>La búsqueda por foto se activará pronto. Por ahora busca por nombre.</div></div>`;
  if (r.aiError && !r.analysis) h += `<div class="notice">${icon('info')}<div>No pude analizar la foto en este momento. Te muestro resultados por nombre.</div></div>`;
  if (r.analysis && r.analysis.descripcion) h += `<div class="card" style="background:#eef2ff;border-color:#c7d2fe">🤖 <b>Según la foto:</b> ${esc(r.analysis.descripcion)}</div>`;
  if (r.match && r.bestId != null) h += `<div class="card" style="background:#ecfdf5;border-color:#a7f3d0"><b>✅ Posible coincidencia</b> (confianza ${esc(r.match.confianza || '—')})${r.match.motivo ? `<br><span class="muted">${esc(r.match.motivo)}</span>` : ''}<br><span class="muted" style="font-size:12px">Verifícalo tú: compara la foto y los datos del primer resultado.</span></div>`;
  const persons = r.persons || [], hospitals = r.hospitals || [];
  if (persons.length) h += `<div class="section-label">Personas reportadas (${persons.length})</div>` + persons.map(p => personCard(p)).join('');
  if (hospitals.length) h += `<div class="section-label">En hospitales (${hospitals.length})</div>` + hospitals.map(hospCard).join('');
  if (!persons.length && !hospitals.length) h += `<div class="empty">${icon('usersearch')}<p>No encontré coincidencias. Prueba con otro nombre${r.usedPhoto ? '' : ' o agrega una foto'}.</p></div>`;
  el.innerHTML = h;
}

screens['person-type'] = () => ({
  tint: COLORS.person, title: 'Reportar persona', html: `
    <div class="screen-head"><h1>¿Qué deseas reportar?</h1></div>
    <div class="notice">${icon('info')}<div>Usa esta herramienta con responsabilidad. Los datos son visibles para ayudar a localizar o identificar personas en la emergencia.</div></div>
    <div class="opt-list mt-16">${PERSON_TYPES.map(t => `<button class="opt" data-action="person-type" data-k="${t.key}">${icon(t.icon)}<span class="lbl">${t.label}<div class="muted" style="font-weight:500;font-size:13px">${t.desc}</div></span><span class="ch-go">${icon('chevron')}</span></button>`).join('')}</div>
  ` });

screens['person-create'] = () => {
  const type = App.ctx.personType || 'desaparecido';
  const st = PERSON_STATUS[type];
  return { tint: COLORS.person, title: st.label, html: `
    <div class="screen-head"><h1>Reportar: ${st.label.toLowerCase()}</h1><p class="sub">Mientras más datos, más fácil será ayudar.</p></div>
    <div class="field"><label>Foto <span class="opt-note">(muy útil)</span></label><label class="uploader" id="p-up">${icon('camera')}<div>Toca para subir una foto</div><input type="file" accept="image/*" id="p-file"></label></div>
    <div class="two-col">
      <div class="field"><label>Nombre</label><input class="input" id="p-nombre" placeholder="Nombre"></div>
      <div class="field"><label>Apellido</label><input class="input" id="p-apellido" placeholder="Apellido"></div>
    </div>
    <div class="two-col">
      <div class="field"><label>Edad</label><input class="input" id="p-edad" placeholder="Años" inputmode="numeric"></div>
      <div class="field"><label>Sexo</label><select class="select" id="p-sexo">${SEXOS.map(s => `<option>${s}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Fecha visto por última vez</label><input class="input" id="p-fecha" placeholder="Ej. 24/06/2026"></div>
    ${geoFields('p', {})}
    <div class="field"><label>Lugar exacto</label><input class="input" id="p-lugar" placeholder="¿Dónde fue visto/a por última vez?"></div>
    <div class="field"><label>Descripción <span class="opt-note">(vestimenta, señas)</span></label><textarea class="textarea" id="p-desc" placeholder="Estatura, contextura, ropa, señas particulares..."></textarea></div>
    <div class="section-label">Contacto de quien reporta</div>
    <div class="field"><label>Nombre del contacto</label><input class="input" id="p-cnombre" placeholder="Tu nombre"></div>
    <div class="two-col">
      <div class="field"><label>Teléfono / WhatsApp</label><input class="input" id="p-ctel" placeholder="04xx-xxxxxxx" inputmode="tel"></div>
      <div class="field"><label>Relación</label><input class="input" id="p-rel" placeholder="Familiar, amigo..."></div>
    </div>
    <div class="notice">${icon('info')}<div>Al publicar declaras que la información es verídica. Reportes falsos pueden perjudicar la búsqueda de otras personas.</div></div>
    <div class="sticky-cta"><button class="btn" style="background:${COLORS.person}" data-action="person-submit" data-type="${type}">${icon('check')}Publicar reporte</button></div>
  ` };
};

screens['person-done'] = () => {
  const p = App._person;
  return { tint: COLORS.person, title: 'Reporte publicado', html: `
    <div class="success-hero"><div class="check-circle">${icon('check')}</div><h2>Reporte publicado</h2><p>${p ? p.nombre + ' ' + (p.apellido || '') : 'La persona'} ya aparece en la lista. Compártelo para llegar a más gente.</p></div>
    <div class="sticky-cta">
      <button class="btn block" style="background:${COLORS.person}" data-action="open-person" data-id="${p ? p.id : ''}">Ver reporte</button>
      <button class="btn ghost block mt-8" data-action="person-share" data-id="${p ? p.id : ''}">${icon('share')}Compartir</button>
      <button class="btn ghost block mt-8" data-home>Volver al inicio</button>
    </div>
  ` };
};

/* ---------- Mapa / Búsqueda / 404 ---------- */
/* Reportes de servicios (luz/agua/medicinas...) — capa de reporte-ve (ve.crafter.run) */
const REP_CAT = {
  electricity: { label: 'Electricidad', color: '#f59e0b', emoji: '⚡' },
  water: { label: 'Agua', color: '#0ea5e9', emoji: '💧' },
  medicine: { label: 'Medicinas', color: '#ef4444', emoji: '➕' },
  food: { label: 'Comida', color: '#16a34a', emoji: '🍚' },
  fuel: { label: 'Combustible', color: '#7c3aed', emoji: '⛽' },
  telecoms: { label: 'Telecom', color: '#0891b2', emoji: '📶' },
  gas: { label: 'Gas', color: '#ea580c', emoji: '🔥' },
  'Gas doméstico': { label: 'Gas', color: '#ea580c', emoji: '🔥' },
  'Recolección de basura': { label: 'Basura', color: '#65a30d', emoji: '🗑️' },
  'Transporte público': { label: 'Transporte', color: '#475569', emoji: '🚌' },
  other: { label: 'Otro', color: '#94a3b8', emoji: '•' },
};
function repCat(c) { return REP_CAT[c] || REP_CAT.other; }
function repFecha(iso) { try { return new Date(iso).toLocaleDateString('es'); } catch { return ''; } }
function popupReporte(r) {
  const cat = repCat(r.category);
  const cats = (r.categories && r.categories.length ? r.categories : [r.category]).map(c => repCat(c).label).join(', ');
  const zona = [r.municipio, r.estado].filter(Boolean).join(', ');
  const sev = r.severity === 'high' ? 'Alta' : r.severity === 'medium' ? 'Media' : r.severity === 'low' ? 'Baja' : '';
  return `<b style="color:${cat.color}">${cat.emoji} ${cats}</b>${sev ? ' · ' + sev : ''}<br>${r.summary ? r.summary + '<br>' : ''}<span style="color:#64748b">${zona || 'Venezuela'}${r.createdAt ? ' · ' + repFecha(r.createdAt) : ''}</span>`;
}
function legendDot(color) { return `<i style="width:11px;height:11px;border-radius:50%;background:${color};border:1.5px solid #fff;box-shadow:0 0 0 1px ${color};display:inline-block"></i>`; }

/* Centroides de los estados de Venezuela (para ubicar en el mapa los centros que no traen GPS). */
const EST_LL = {
  'amazonas': [5.0, -67.6], 'anzoategui': [9.8, -64.5], 'apure': [7.6, -68.4], 'aragua': [10.18, -67.4],
  'barinas': [8.5, -70.2], 'bolivar': [7.0, -63.3], 'carabobo': [10.18, -68.0], 'cojedes': [9.4, -68.3],
  'delta amacuro': [8.8, -61.4], 'distrito capital': [10.5, -66.92], 'falcon': [11.2, -69.7], 'guarico': [9.0, -66.4],
  'lara': [10.05, -69.4], 'merida': [8.59, -71.14], 'miranda': [10.25, -66.4], 'monagas': [9.6, -63.0],
  'nueva esparta': [11.0, -63.9], 'portuguesa': [9.2, -69.7], 'sucre': [10.45, -63.6], 'tachira': [7.77, -72.2],
  'trujillo': [9.35, -70.5], 'la guaira': [10.6, -66.93], 'vargas': [10.6, -66.93], 'yaracuy': [10.34, -68.7], 'zulia': [10.2, -71.6],
};
function normEst(s) {
  s = ('' + (s || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (/caracas|capital|dtto|libertador/.test(s)) return 'distrito capital';
  if (/guaira|vargas/.test(s)) return 'la guaira';
  return s.replace(/^estado\s+/, '').trim();
}
function hashStr(s) { let h = 0; s = '' + s; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
// Ubicación aproximada de un centro: GPS real si lo tiene; si no, centroide de su estado + dispersión estable.
function centerLL(c) {
  const co = parseCoords(c.coords); if (co) return { lat: co.lat, lng: co.lng, exact: true };
  const base = EST_LL[normEst(c.estado)]; if (!base) return null;
  const h = hashStr(c.id || c.name);
  const jx = ((h % 1000) / 1000 - 0.5) * 0.22, jy = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.22;
  return { lat: base[0] + jy, lng: base[1] + jx, exact: false };
}

/* Edificios afectados (daños estructurales) — capa de terremotovenezuela.com */
const EDIF_DMG = {
  parcial: { label: 'Daño parcial', color: '#ca8a04' },
  severo: { label: 'Daño severo', color: '#ea580c' },
  total: { label: 'Daño total / colapso', color: '#dc2626' },
};
function edifDmg(d) { return EDIF_DMG[d] || { label: 'Sin evaluar', color: '#64748b' }; }
function popupEdificio(e) {
  const dm = edifDmg(e.damage);
  const zona = [e.zone, e.city].filter(Boolean).join(', ');
  return `<b>🏢 ${esc(e.name)}</b><br><span style="color:${dm.color};font-weight:700">${dm.label}</span>${e.missing ? ' · <span style="color:#dc2626">⚠ atrapados reportados</span>' : ''}<br><span style="color:#64748b">${esc(zona || 'Venezuela')}</span>`;
}

/* Sismos / réplicas (USGS) — color y tamaño por magnitud */
function sismoColor(m) { m = +m || 0; return m >= 5 ? '#7f1d1d' : m >= 4 ? '#dc2626' : m >= 3 ? '#ea580c' : '#f59e0b'; }
function sismoR(m) { return Math.max(5, Math.round((+m || 2) * 2)); }
function popupSismo(s) { const t = s.time ? new Date(s.time).toLocaleString('es') : ''; return `<b style="color:${sismoColor(s.mag)}">🌐 Magnitud ${s.mag != null ? s.mag : '—'}</b><br>${esc(s.place || '')}<br><span style="color:#64748b">${t}${s.depth != null ? ' · ' + Math.round(s.depth) + ' km prof.' : ''}</span>`; }

/* ---------- Directorio de emergencia (hospitales / ambulancias / bomberos / líneas) ---------- */
screens['directorio'] = () => {
  const d = App._directorio;
  if (!d) return { tint: '#b91c1c', title: 'Emergencias', html: `<div class="empty">${icon('alert')}<p>Cargando directorio…</p></div>` };
  const groups = d.groups || {};
  const order = [['emergencia', 'Líneas de emergencia', '📞'], ['ambulancia', 'Ambulancias', '🚑'], ['bomberos', 'Bomberos por zona', '🚒'], ['hospital', 'Hospitales en Caracas', '🏥']];
  const callBtn = p => `<a class="btn sm" href="tel:${p.tel}" style="white-space:nowrap">📞 ${esc(p.label)}${p.shared ? ' ⚠' : ''}</a>`;
  const card = it => `<div class="card" style="margin-bottom:8px"><div style="font-weight:600">${esc(it.name)}${it.zona ? ` <span class="muted" style="font-weight:400">· ${esc(it.zona)}</span>` : ''}</div><div class="btn-row mt-8" style="flex-wrap:wrap;gap:6px">${(it.phones || []).map(callBtn).join('')}</div></div>`;
  const sections = order.filter(([k]) => groups[k] && groups[k].length).map(([k, label, emoji]) => `<div class="section-label">${emoji} ${label}</div>${groups[k].map(card).join('')}`).join('');
  const dup = (d.audit && d.audit.duplicatePhones) || [];
  return { tint: '#b91c1c', title: 'Emergencias', html: `
    <div class="screen-head"><h1>Emergencias y directorio</h1><p class="sub">Líneas oficiales, ambulancias, bomberos y hospitales (Caracas). Toca un número para llamar.</p></div>
    <div class="card" style="background:#fef2f2;border-color:#fecaca"><b style="color:#b91c1c">Ante una emergencia médica o de rescate, llama siempre a los organismos oficiales.</b></div>
    ${sections}
    ${dup.length ? `<p class="muted mt-16" style="font-size:11.5px">⚠ ${dup.length} número(s) compartido(s) entre servicios (detectado por nuestra auditoría de duplicados). Fuente: redayudavenezuela.com.</p>` : ''}
  ` };
};

screens['map-view'] = () => {
  const layer = App.ctx.mapLayer || 'todo';
  const centers = getCenters().filter(c => c.status !== 'pendiente');
  const cPts = centers.map(c => { const ll = centerLL(c); return ll ? { lat: ll.lat, lng: ll.lng, title: c.name, id: c.id, color: '#003893', r: 8 } : null; }).filter(Boolean);
  // Capa de reportes de servicios: se sincroniza sola con reporte-ve.
  if (App._reportes == null && !App._reportesLoading) {
    App._reportesLoading = true;
    API.reportes().then(d => { App._reportes = (d && d.reportes) || []; App._reportesLoading = false; if (document.getElementById('leaflet-map')) render(); })
      .catch(() => { App._reportes = []; App._reportesLoading = false; });
  }
  // Capa de edificios afectados: se sincroniza sola con terremotovenezuela.com.
  if (App._edificios == null && !App._edifLoading) {
    App._edifLoading = true;
    API.edificios().then(d => { App._edificios = (d && d.edificios) || []; App._edifLoading = false; if (document.getElementById('leaflet-map')) render(); })
      .catch(() => { App._edificios = []; App._edifLoading = false; });
  }
  // Capa de sismos/réplicas: USGS, se sincroniza sola.
  if (App._sismos == null && !App._sismosLoading) {
    App._sismosLoading = true;
    API.sismos().then(d => { App._sismos = (d && d.sismos) || []; App._sismosLoading = false; if (document.getElementById('leaflet-map')) render(); })
      .catch(() => { App._sismos = []; App._sismosLoading = false; });
  }
  const reps = App._reportes || [];
  const edifs = (App._edificios || []).filter(e => e.lat);
  const sis = (App._sismos || []).filter(s => s.lat);
  const rPts = reps.map(r => ({ lat: r.lat, lng: r.lng, color: repCat(r.category).color, r: 7, html: popupReporte(r) }));
  const ePts = edifs.map(e => ({ lat: e.lat, lng: e.lng, color: edifDmg(e.damage).color, r: 7, html: popupEdificio(e) }));
  const sPts = sis.map(s => ({ lat: s.lat, lng: s.lng, color: sismoColor(s.mag), r: sismoR(s.mag), html: popupSismo(s) }));
  const points = layer === 'centros' ? cPts : layer === 'reportes' ? rPts : layer === 'edificios' ? ePts : layer === 'sismos' ? sPts : cPts.concat(rPts).concat(ePts).concat(sPts);
  setTimeout(() => mountMap('leaflet-map', points.length ? points : cPts, { zoom: 6, center: [8.0, -66.2] }), 50);
  const present = [...new Set(reps.map(r => r.category))];
  const legend = `<div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:10px">
    ${(layer === 'todo' || layer === 'centros') ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px">${legendDot('#003893')}Centros de acopio</span>` : ''}
    ${(layer === 'todo' || layer === 'reportes') ? present.map(c => { const k = repCat(c); return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px">${legendDot(k.color)}${k.label}</span>`; }).join('') : ''}
    ${(layer === 'todo' || layer === 'edificios') ? Object.values(EDIF_DMG).map(k => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px">${legendDot(k.color)}${k.label}</span>`).join('') : ''}
    ${(layer === 'todo' || layer === 'sismos') ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px">${legendDot('#dc2626')}Sismo/réplica</span>` : ''}
  </div>`;
  const seg = `<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
    ${[['todo', 'Todo'], ['centros', 'Centros'], ['reportes', 'Servicios'], ['edificios', 'Daños'], ['sismos', 'Sismos']].map(([k, l]) => `<button class="btn sm ${layer === k ? '' : 'ghost'}" data-action="map-layer" data-layer="${k}" style="flex:1;min-width:60px">${l}</button>`).join('')}
  </div>`;
  return { tint: COLORS.center, title: 'Mapa de la situación', html: `
    ${seg}
    <div id="leaflet-map" style="height:60vh;min-height:340px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)"></div>
    ${legend}
    <p class="muted mt-8" style="font-size:12px">${cPts.length} centros · ${reps.length} reportes de servicios · ${edifs.length} edificios con daños · ${sis.length} sismos${(App._reportesLoading || App._edifLoading || App._sismosLoading) ? ' (cargando…)' : ''}. Daños: <a href="https://terremotovenezuela.com" target="_blank" rel="noopener">terremotovenezuela.com</a> · servicios: <a href="https://ve.crafter.run" target="_blank" rel="noopener">reporte-ve</a> · sismos: USGS — se actualizan solos.</p>
    ${layer === 'edificios' ? `<button class="btn block mt-8" data-action="open-edificios">${icon('building')}Ver lista de edificios afectados</button>` : ''}
    ${layer === 'sismos' ? `<div class="section-label">Sismos recientes (USGS)</div>${sis.slice(0, 20).map(s => `<div class="card" style="margin-bottom:8px"><div style="display:flex;align-items:center;gap:10px"><span style="font-weight:800;font-size:18px;color:${sismoColor(s.mag)}">${s.mag != null ? s.mag.toFixed(1) : '—'}</span><div style="flex:1"><div style="font-weight:600;font-size:14px">${esc(s.place || '')}</div><div class="muted" style="font-size:12px">${s.time ? new Date(s.time).toLocaleString('es') : ''}${s.depth != null ? ' · ' + Math.round(s.depth) + ' km prof.' : ''}</div></div></div></div>`).join('')}` : ''}
    ${(layer === 'todo' || layer === 'centros') ? `<div class="section-label">Centros verificados</div>${centers.map(c => centerCard(c, 'donate')).join('')}` : ''}
  ` };
};

/* Lista buscable de edificios afectados (daños estructurales) */
function edifState() { return App.edif || (App.edif = { q: '', damage: '' }); }
function edifNorm(s) { return ('' + (s || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function edifFiltered() {
  const s = edifState(); const q = edifNorm(s.q).trim();
  return (App._edificios || []).filter(e => {
    if (s.damage && e.damage !== s.damage) return false;
    if (q && !edifNorm([e.name, e.city, e.zone, e.address].filter(Boolean).join(' ')).includes(q)) return false;
    return true;
  });
}
function edifCard(e) {
  const dm = edifDmg(e.damage);
  const zona = [e.zone, e.city].filter(Boolean).join(', ');
  const mapsUrl = e.lat ? `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.name, e.address, e.city].filter(Boolean).join(', '))}`;
  return `<div class="card edif-card">
    <div class="cc-name">${esc(e.name)}</div>
    <div class="cc-meta"><span class="badge" style="background:${dm.color}22;color:${dm.color}">${dm.label}</span>${e.status ? ` <span class="badge muted">${esc(e.status.replace(/_/g, ' '))}</span>` : ''}${e.missing ? ` <span class="badge bad">${icon('alert')}Atrapados reportados</span>` : ''}</div>
    ${zona ? `<div class="cc-addr">${icon('pin')}<span>${esc(zona)}${e.address ? ` · ${esc(e.address)}` : ''}</span></div>` : ''}
    ${e.notes ? `<div class="accepts" style="margin-top:8px">${esc(e.notes)}</div>` : ''}
    <div class="btn-row mt-12"><a class="btn sm" href="${mapsUrl}" target="_blank" rel="noopener">${icon('route')}Cómo llegar</a></div>
  </div>`;
}
function edifChipsHtml() {
  const s = edifState(); const all = App._edificios || [];
  const cnt = d => all.filter(e => !d || e.damage === d).length;
  const chip = (val, label) => `<button class="chip ${s.damage === val ? 'sel' : ''}" data-action="edif-filter" data-d="${val}">${label} <b>${cnt(val)}</b></button>`;
  return `<div class="hosp-chips">${chip('', 'Todos')}${chip('total', 'Daño total')}${chip('severo', 'Severo')}${chip('parcial', 'Parcial')}</div>`;
}
function edifListHtml() {
  const all = edifFiltered(); const shown = all.slice(0, 200);
  const head = `<div class="section-label">${all.length.toLocaleString('es')} edificio(s)${all.length > shown.length ? ` · mostrando ${shown.length}, refina la búsqueda` : ''}</div>`;
  if (!all.length) return head + `<div class="empty">${icon('building')}<p>Sin resultados. Prueba con otra zona.</p></div>`;
  return head + shown.map(edifCard).join('');
}
function edifPaint() {
  const c = document.getElementById('edif-chips'); if (c) c.innerHTML = edifChipsHtml();
  const l = document.getElementById('edif-list'); if (l) l.innerHTML = edifListHtml();
}
let _edifT;
function edifSearch(v) { edifState().q = v || ''; clearTimeout(_edifT); _edifT = setTimeout(edifPaint, 180); }
screens['edificios'] = () => {
  const list = App._edificios;
  if (!list) return { tint: COLORS.center, title: 'Edificios afectados', html: `<div class="empty">${icon('building')}<p>Cargando edificios…</p></div>` };
  const s = edifState();
  return { tint: COLORS.center, title: 'Edificios afectados', html: `
    <div class="screen-head"><h1>Edificios afectados</h1><p class="sub"><b>${list.length.toLocaleString('es')}</b> edificios con daños reportados tras el sismo. Busca por nombre, zona o ciudad.</p></div>
    <div class="field"><input class="input" id="edif-q" value="${esc(s.q)}" placeholder="Buscar edificio, zona o ciudad…" oninput="edifSearch(this.value)"></div>
    <div id="edif-chips">${edifChipsHtml()}</div>
    <div id="edif-list">${edifListHtml()}</div>
    <p class="muted center-txt" style="font-size:12px;margin-top:8px">Fuente: <a href="https://terremotovenezuela.com" target="_blank" rel="noopener">terremotovenezuela.com</a> — datos públicos, se actualizan solos.</p>
  ` };
};

screens['search'] = () => ({
  tint: COLORS.center, title: 'Buscar', html: `
    <div class="screen-head"><h1>Buscar zona</h1></div>
    <div class="field"><input class="input" id="srch" placeholder="Municipio o parroquia (ej. Chacao)" oninput="doSearch(this.value)"></div>
    <div id="srch-res">${getCenters().map(c => centerCard(c, 'donate')).join('')}</div>
  ` });

function doSearch(q) {
  q = (q || '').toLowerCase().trim();
  const list = getCenters().filter(c => !q || [c.municipio, c.parroquia, c.estado, c.name].join(' ').toLowerCase().includes(q));
  const el = document.getElementById('srch-res');
  if (el) el.innerHTML = list.length ? list.map(c => centerCard(c, 'donate')).join('') : `<div class="empty">${icon('inbox')}<p>Sin resultados para "${q}".</p></div>`;
}
/* Filtro de ubicación de la lista de centros (estado → municipio) */
function setCenterFilter(field, value) {
  if (field === 'estado') { App.ctx.cfEstado = value; App.ctx.cfMunicipio = ''; }
  else App.ctx.cfMunicipio = value;
  render();
}
let _personSearchT;
function doPersonSearch(q) {
  App.ctx.personQuery = q || '';
  clearTimeout(_personSearchT);
  _personSearchT = setTimeout(async () => {
    await refreshPersons({ q: App.ctx.personQuery });
    const el = document.getElementById('persons-res');
    if (el) el.innerHTML = DB.persons.length ? DB.persons.map(personCard).join('') : `<div class="empty">${icon('usersearch')}<p>Sin resultados.</p></div>`;
  }, 280);
}
let _petSearchT;
function doPetSearch(q) {
  App.ctx.petQuery = q || '';
  clearTimeout(_petSearchT);
  _petSearchT = setTimeout(async () => {
    await refreshPets();
    const el = document.getElementById('pets-res');
    if (el) el.innerHTML = (App._pets && App._pets.length) ? App._pets.map(petCard).join('') : `<div class="empty"><div style="font-size:34px">🐾</div><p>Sin resultados.</p></div>`;
  }, 280);
}

/* Tarjeta, etiqueta corta y búsqueda de personas en hospitales (datos OCR) */
function hospCard(h) {
  return `<div class="card hosp-card">
    <div class="hc-name">${h.nombre}</div>
    <div class="hc-meta">${icon('medkit')}<span>${h.hospital || '—'}</span></div>
    ${(h.edad || h.zona) ? `<div class="hc-sub">${[h.edad ? h.edad + ' años' : '', h.zona].filter(Boolean).join(' · ')}</div>` : ''}
  </div>`;
}
function hospShort(name) {
  return String(name || '').replace(/^Hosp(ital)?\.?\s*/i, '').replace(/\s*\([^)]*\)\s*/g, '').replace(/^Gral\.?\s*Dr\.?\s*/i, '').replace(/^Dr\.?\s*/i, '').trim() || name;
}
function hospQs() {
  const p = new URLSearchParams();
  if (App.ctx.hospQuery) p.set('q', App.ctx.hospQuery);
  if (App.ctx.hospHospital) p.set('hospital', App.ctx.hospHospital);
  p.set('limit', '60');
  return p.toString();
}
let _hospSearchT;
function doHospitalSearch(q) {
  App.ctx.hospQuery = q || '';
  clearTimeout(_hospSearchT);
  _hospSearchT = setTimeout(async () => {
    try { App._hospitals = await API.hospitals(hospQs()); } catch {}
    const el = document.getElementById('hosp-res');
    const list = (App._hospitals && App._hospitals.items) || [];
    if (el) el.innerHTML = list.length ? list.map(hospCard).join('') : `<div class="empty">${icon('usersearch')}<p>Sin resultados.</p></div>`;
  }, 280);
}

function notFound() { return { title: 'No encontrado', html: `<div class="empty">${icon('info')}<p>No encontramos lo que buscas.</p><button class="btn mt-16" data-home>Volver al inicio</button></div>` }; }
function methodMissing(c, metodo) {
  return { tint: COLORS.donate, title: metodo, html: `<div class="empty">${icon('info')}<p>Este centro aún no tiene <b>${metodo}</b> configurado.</p>
    ${c ? `<button class="btn mt-16" ${nav('center-donate', { id: c.id })}>Ver otros métodos</button>` : `<button class="btn mt-16" data-home>Inicio</button>`}</div>` };
}

function copyField(label, display, copyVal) {
  return `<div class="copyfield"><div class="cf-txt"><small>${label}</small><b>${display}</b></div>
    <button class="copy-btn" data-action="copy" data-copy="${encodeURIComponent(copyVal)}" data-label="${label}" aria-label="Copiar ${label}">${icon('copy')}</button></div>`;
}

/* ---------- Globals para onclick dentro de sheets ---------- */
window.updateDisp = async function () {
  const v = load('volunteer', null); const disp = document.getElementById('ud').value;
  if (v && v.id) { try { await API.patchVolunteer(v.id, { disp }); } catch {} v.disp = disp; save('volunteer', v); }
  closeSheet(); toast('Disponibilidad actualizada');
  if (App.current.screen === 'vol-panel') render();
};
window.submitCenterUpdate = async function (centerId, type) {
  const text = val('cu-text'); if (!text) return toast('Escribe un mensaje', false);
  const photo = await uploadIfAny('cu-file');
  try { await API.addCenterUpdate(centerId, { type: type || val('cu-type') || 'aviso', text, photo }); await refreshCenters(); closeSheet(); toast('¡Actualización publicada!'); render(); }
  catch { toast('No se pudo publicar', false); }
};
window.submitSighting = async function (personId) {
  const lugar = val('s-lugar'), detalle = val('s-detalle'), contacto = val('s-contacto');
  if (!lugar && !detalle) return toast('Cuéntanos qué viste', false);
  try { await API.addSighting(personId, { lugar, detalle, contacto }); App._person = await API.person(personId); closeSheet(); toast('¡Gracias! Tu información se publicó.'); render(); }
  catch { toast('No se pudo enviar', false); }
};
window.saveCenterHorario = async function (centerId) {
  const horario = val('eh-horario');
  try { await API.patchCenter(centerId, { horario }); await refreshCenters(); closeSheet(); toast('Horario actualizado'); render(); }
  catch { toast('No se pudo guardar', false); }
};
window.saveVolEvidence = async function () {
  const v = load('volunteer', null);
  const foto = await uploadIfAny('ev-file');
  const ev = { texto: val('ev-text'), foto, fecha: today() };
  if (v && v.id) { try { const arr = (v.evidencias || []); arr.unshift(ev); await API.patchVolunteer(v.id, { evidencias: arr }); v.evidencias = arr; save('volunteer', v); } catch {} }
  closeSheet(); toast('¡Evidencia registrada! Gracias.');
  if (App.current.screen === 'vol-panel') render();
};
// Lee los inputs del editor de inventario al DOM -> App.ctx.inv
function captureInv() {
  const labels = [...document.querySelectorAll('.inv-label')];
  const qtys = [...document.querySelectorAll('.inv-qty')];
  App.ctx.inv = labels.map((el, i) => ({ label: el.value.trim(), qty: parseInt(qtys[i] && qtys[i].value, 10) || 0 }));
}

/* ---- passcode de 4 dígitos ---- */
function pinShakeReset() {
  App.ctx.pin = ''; App.ctx.pinShake = true; render();
  setTimeout(() => { App.ctx.pinShake = false; if (App.current.screen === 'passcode') render(); }, 450);
}
async function pinComplete() {
  const pin = App.ctx.pin || '';
  if (App.ctx.pinMode === 'login') {
    try {
      const res = await API.loginUser(App.ctx.loginPhone, pin);
      if (res && res.user) { setSession({ ...res.user, token: res.token }); App.ctx.pin = ''; toast('¡Hola de nuevo, ' + res.user.nombre + '!'); return go('profile'); }
      toast(res && res.error === 429 ? 'Demasiados intentos, espera unos minutos' : 'PIN incorrecto', false); pinShakeReset();
    } catch { toast('Error de conexión', false); pinShakeReset(); }
    return;
  }
  // crear PIN: primera vez guarda, segunda confirma
  if (App.ctx.pin1 == null) { App.ctx.pin1 = pin; App.ctx.pin = ''; render(); return; }
  if (App.ctx.pin1 !== pin) { App.ctx.pin1 = null; toast('Los PIN no coinciden, intenta de nuevo', false); pinShakeReset(); return; }
  try {
    const res = await API.registerUser({ ...App.ctx.regData, pin });
    setSession({ ...res.user, token: res.token });
    App.ctx.pin = ''; App.ctx.pin1 = null; App.ctx.regData = null; App.ctx.aporte = null;
    toast('¡Perfil creado!'); go('profile');
  } catch { toast('No se pudo crear la cuenta', false); App.ctx.pin1 = null; pinShakeReset(); }
}

/* ============================================================
   ACCIONES
   ============================================================ */
const actions = {
  emergency() {
    const body = EMERGENCY.map(e => `<a href="tel:${e.number.replace(/[^0-9]/g, '')}" class="list-row" style="text-decoration:none;color:inherit">${icon('phone')}<div class="lr-main"><b>${e.label}</b><span>${e.number}</span></div><span class="badge ok">Llamar</span></a>`).join('');
    openSheet('Números de emergencia', `<div class="card" style="box-shadow:none;border:none;padding:0">${body}</div><button class="btn ghost mt-16" onclick="closeSheet()">Cerrar</button>`);
  },
  /* ----- cuenta / sesión ----- */
  account() { session() ? go('profile') : go('login'); },
  async 'login-continue'() {
    const phone = normPhone(val('login-phone'));
    if (phoneDigits(val('login-phone')).length < 9) return toast('Escribe un número de teléfono válido', false);
    try {
      const chk = await API.checkUser(phone);
      if (chk.exists) { App.ctx.loginPhone = phone; App.ctx.loginName = chk.nombre; App.ctx.pinMode = 'login'; App.ctx.pin = ''; return go('passcode'); }
      App.ctx.regPhone = phone; App.ctx.regUser = null; App.ctx.aporte = [];
      go('register');
    } catch { toast('Error de conexión. ¿Servidor activo?', false); }
  },
  async 'register-submit'() {
    const nombre = val('reg-nombre'); if (!nombre) return toast('Falta tu nombre', false);
    const aporte = App.ctx.aporte || [];
    if (!aporte.length) return toast('Elige al menos qué puedes aportar', false);
    const fields = { nombre, apellido: val('reg-apellido'), estado: val('reg-estado'), municipio: val('reg-municipio'), parroquia: val('reg-parroquia'), aporte, role: roleLabel(aporte) };
    if (App.ctx.regUser && App.ctx.regUser.id) {                 // edición -> PATCH (ya tiene sesión)
      try { const u = await API.patchUser(App.ctx.regUser.id, fields); setSession({ ...session(), ...u }); App.ctx.regUser = null; App.ctx.aporte = null; toast('Perfil actualizado'); return go('profile'); }
      catch { return toast('No se pudo actualizar', false); }
    }
    App.ctx.regData = { phone: App.ctx.regPhone, ...fields };     // registro nuevo -> crear PIN
    App.ctx.pinMode = 'set'; App.ctx.pin = ''; App.ctx.pin1 = null;
    go('passcode');
  },
  'pin-digit'(t) {
    if ((App.ctx.pin || '').length >= 4) return;
    App.ctx.pin = (App.ctx.pin || '') + t.dataset.d; render();
    if (App.ctx.pin.length === 4) setTimeout(pinComplete, 130);
  },
  'pin-del'() { App.ctx.pin = (App.ctx.pin || '').slice(0, -1); render(); },
  async 'open-admin'() { try { App._admin = await API.adminOverview(); App.ctx.adminTab = 'centros'; go('admin'); } catch { toast('Acceso solo para administradores', false); } },
  'open-activity'(t) { const list = (App._activity && App._activity.events) || []; App._actDetail = list[+t.dataset.i] || null; if (App._actDetail) go('activity-detail'); },
  async 'open-admin-activity'() {
    App._activity = null; go('admin-activity');
    const load = async () => {
      if (App.current.screen !== 'admin-activity') { clearInterval(App._actTimer); App._actTimer = null; return; }
      try { App._activity = await API.adminActivity(); } catch { return; }
      if (App.current.screen !== 'admin-activity') return;
      const el = document.getElementById('activity-res');
      const events = (App._activity.events) || [];
      if (el) el.innerHTML = events.length ? events.map((e, i) => activityRow(e, i)).join('') : `<div class="empty">${icon('bell')}<p>Sin actividad reciente.</p></div>`;
    };
    await load();
    clearInterval(App._actTimer); App._actTimer = setInterval(load, 12000);
  },
  async 'open-admin-center'(t) { App._adminCenter = null; go('admin-center'); try { App._adminCenter = await API.adminCenterDetail(t.dataset.id); render(); } catch { toast('Acceso solo para administradores', false); } },
  async 'open-admin-users'() { App._adminUsers = null; go('admin-users'); try { App._adminUsers = await API.adminUsers(); render(); } catch { toast('Acceso solo para administradores', false); } },
  async 'open-admin-donations'() { App._adminDons = null; go('admin-donations'); try { App._adminDons = await API.adminDonations(); render(); } catch { toast('Acceso solo para administradores', false); } },
  async 'open-admin-inventory'() { App._adminInv = null; go('admin-inventory'); try { App._adminInv = await API.adminInventory(); render(); } catch { toast('Acceso solo para administradores', false); } },
  async 'open-dashboard'() { try { App._dash = await API.adminDashboard(); go('dashboard'); } catch { toast('Acceso solo para administradores', false); } },
  'open-help-request'() { go('help-request'); },
  async 'help-request-submit'() {
    const contacto = val('h-contacto'); const desc = val('h-desc'); const lugar = val('h-lugar');
    if (!contacto) return toast('Pon un teléfono para que puedan contactarte', false);
    if (!desc && !lugar) return toast('Cuéntanos qué necesitas y dónde', false);
    const req = {
      tipo: val('h-tipo') || 'otro', urgencia: val('h-urg') || 'Alta',
      nombre: val('h-nombre'), contacto,
      estado: val('h-estado'), municipio: val('h-municipio'), parroquia: val('h-parroquia'),
      lugar, descripcion: desc,
    };
    try { App._help = await API.createHelpRequest(req); toast('Solicitud enviada'); go('help-request-done'); }
    catch { toast('No se pudo enviar. ¿Servidor activo?', false); }
  },
  async 'open-help-requests'() { App._helpList = null; go('help-requests'); try { App._helpList = await API.helpRequests('status=abierta&limit=100'); render(); } catch { toast('No se pudieron cargar las solicitudes', false); } },
  async 'open-metrics'() { App._metrics = null; go('metrics'); try { App._metrics = await API.metrics(); render(); } catch { toast('No se pudieron cargar las estadísticas', false); } },
  async 'open-hospitals'() {
    App.ctx.hospQuery = ''; App.ctx.hospHospital = ''; App._hospitals = null; go('hospitals');
    try { App._hospSummary = await API.hospitalsSummary(); App._hospitals = await API.hospitals('limit=40'); render(); }
    catch { toast('No se pudieron cargar los hospitales', false); }
  },
  async 'hosp-filter'(t) {
    App.ctx.hospHospital = t.dataset.h || '';
    try { App._hospitals = await API.hospitals(hospQs()); } catch {}
    render();
  },
  async 'open-audit'() { App._audit = null; go('audit'); try { App._audit = await API.audit(); render(); } catch { toast('No se pudo cargar la auditoría', false); } },

  async 'open-resources'() { App._resources = null; go('resources'); try { App._resources = await API.resources(); if (App.current.screen === 'resources') render(); } catch { toast('No se pudieron cargar los recursos', false); } },
  'resource-add'() { const u = session(); if (!u || !u.admin) return toast('Solo el administrador puede agregar recursos', false); App.ctx.newRes = { type: 'whatsapp' }; go('resource-new'); },
  async 'resource-save'() {
    const type = val('r-type'), title = (val('r-title') || '').trim(), url = (val('r-url') || '').trim(), descr = (val('r-descr') || '').trim();
    if (!title) return toast('Falta el título', false);
    if (!url) return toast('Falta el enlace', false);
    try { await API.createResource({ type, title, url, descr }); App._resources = await API.resources(); toast('Recurso publicado'); go('resources'); }
    catch { toast('No se pudo publicar. Revisa el enlace (https://, wa.me, t.me).', false); }
  },
  'resource-delete'(t) {
    const id = t.dataset.id;
    openSheet('Borrar recurso', `<p class="muted">¿Seguro que quieres borrar este recurso? No se puede deshacer.</p>
      <button class="btn mt-16" style="background:var(--bad)" onclick="(async()=>{try{await API.deleteResource('${id}');App._resources=await API.resources();}catch(e){};closeSheet();toast('Recurso borrado');render();})()">Borrar</button>
      <button class="btn ghost mt-8" onclick="closeSheet()">Cancelar</button>`);
  },
  'admin-tab'(t) { App.ctx.adminTab = t.dataset.k; render(); },
  'dash-range'(t) { App.ctx.dashRange = t.dataset.k; render(); },
  async 'admin-verify'(t) {
    try {
      await API.adminSetCenter(t.dataset.id, t.dataset.st);
      if (App.current.screen === 'dashboard') App._dash = await API.adminDashboard();
      else App._admin = await API.adminOverview();
      await refreshCenters();
      toast('Centro: ' + (STATUS_LABELS[t.dataset.st] ? STATUS_LABELS[t.dataset.st].label : t.dataset.st)); render();
    }
    catch { toast('No se pudo actualizar', false); }
  },
  async 'admin-person'(t) {
    try { await API.adminModeratePerson(t.dataset.id, t.dataset.h === '1'); App._admin = await API.adminOverview(); await refreshPersons(); toast(t.dataset.h === '1' ? 'Reporte oculto' : 'Reporte restaurado'); render(); }
    catch { toast('No se pudo moderar', false); }
  },
  'edit-profile'() {
    const u = session(); if (!u) return go('login');
    App.ctx.regUser = u; App.ctx.regPhone = u.phone; App.ctx.aporte = [...(u.aporte || [])];
    go('register');
  },
  'transport-centers'() { go('donate-centers', { needKey: 'transporte' }); },
  logout() { clearSession(); toast('Sesión cerrada'); home(); },

  async 'set-zone'(t) {
    if (t.dataset.k === 'gps') {
      toast('Obteniendo tu ubicación…');
      const coords = await getGeo();
      if (coords) { App.ctx.loc = { coords }; App.ctx.zone = 'Tu ubicación actual'; return go('help-how'); }
      toast('No se pudo obtener la ubicación. Elige tu zona.', false);
    }
    go('help-zone');
  },
  'zone-continue'() {
    const estado = val('z-estado'), municipio = val('z-municipio'), parroquia = val('z-parroquia');
    App.ctx.loc = { estado, municipio, parroquia, coords: parseCoords(val('z-coords-val')) };
    App.ctx.zone = [parroquia, municipio, estado].filter(Boolean).join(', ') || 'Venezuela';
    go('help-how');
  },
  async 'geo-here'(t) {
    const prefix = t.dataset.prefix;
    const disp = document.getElementById(prefix + '-coords');
    toast('Obteniendo tu ubicación…');
    const loc = await getGeo();
    if (!loc) { if (disp) disp.textContent = 'No se pudo obtener la ubicación (permítela o selecciona la zona).'; return toast('Ubicación no disponible', false); }
    const hidden = document.getElementById(prefix + '-coords-val'); if (hidden) hidden.value = loc.lat + ',' + loc.lng;
    if (disp) disp.innerHTML = `${icon('check')} Ubicación capturada: ${loc.lat}, ${loc.lng} · <a href="https://www.google.com/maps?q=${loc.lat},${loc.lng}" target="_blank" rel="noopener">ver en mapa</a>`;
    toast('Ubicación capturada');
  },
  'help-way'(t) { App.ctx.way = t.dataset.k; if (t.dataset.k === 'voluntario') return go('vol-skills'); go('help-reco'); },
  'donate-type'(t) { App.ctx.donateType = t.dataset.k; go('donate-where'); },
  'donate-where'(t) {
    const k = t.dataset.k;
    App.ctx.cfEstado = ''; App.ctx.cfMunicipio = '';
    if (k === 'urgente') return go('donate-urgent');
    const loc = getUserLoc();
    if (k === 'cerca' && loc && loc.coords) return go('donate-centers', { scope: 'cerca' });
    if (k === 'cerca') return go('loc-pick', { then: 'donate-centers', scope: 'cerca' });
    // municipio / parroquia / estado / específico → lista completa con filtro por ubicación
    // construido con los datos REALES de los centros (estado → municipio). Evita el cascada
    // de GEO_VE cuyos municipios no coinciden con los de los centros importados.
    go('donate-centers', { all: true, title: 'Centros de acopio' });
  },
  'loc-continue'(t) {
    App.ctx.loc = { estado: val('lp-estado'), municipio: val('lp-municipio'), parroquia: val('lp-parroquia'), coords: parseCoords(val('lp-coords-val')) };
    go(t.dataset.then || 'donate-centers', { scope: t.dataset.scope || 'municipio' });
  },
  'near-centers'() {
    const loc = getUserLoc();
    loc ? go('donate-centers', { scope: 'cerca' }) : go('loc-pick', { then: 'donate-centers', scope: 'cerca' });
  },
  'change-zone'() { go('loc-pick', { then: 'donate-centers', scope: 'municipio', pickOther: true }); },
  'urgent-need'(t) { go('donate-centers', { needKey: t.dataset.k }); },

  /* --- Directorio de centros (tabla por zona + buscador) --- */
  'dir-group'(t) { dirState().group = t.dataset.group; render(); },
  'dir-pick'(t) {
    const s = dirState();
    const order = ['estado', 'municipio', 'parroquia'];
    const i = order.indexOf(t.dataset.field);
    const val = decodeURIComponent(t.dataset.val);
    for (let j = i; j < order.length; j++) s[order[j]] = (j === i ? val : '');
    if (order[i + 1]) s.group = order[i + 1];
    render();
  },
  'dir-clear'(t) {
    const s = dirState(), f = t.dataset.field;
    if (f === 'q') { s.q = ''; }
    else {
      const order = ['estado', 'municipio', 'parroquia'];
      for (let j = order.indexOf(f); j < order.length; j++) s[order[j]] = '';
      s.group = f;
    }
    render();
  },
  'dir-clearall'() { App.dir = { q: '', estado: '', municipio: '', parroquia: '', group: 'estado' }; render(); },

  maps(t) { openMaps(getCenter(t.dataset.id)); },
  share(t) { shareCenter(getCenter(t.dataset.id)); },
  going(t) {
    const c = getCenter(t.dataset.id);
    openSheet('Avisar que voy a donar', `
      <div class="field"><label>Tipo de insumo</label><input class="input" id="g-tipo" placeholder="Agua, comida..."></div>
      <div class="two-col"><div class="field"><label>Cantidad estimada</label><input class="input" id="g-cant" placeholder="Ej. 5 cajas"></div>
      <div class="field"><label>Hora aproximada</label><input class="input" id="g-hora" placeholder="Ej. 3 PM"></div></div>
      <div class="field"><label>Nombre <span class="opt-note">(opcional)</span></label><input class="input" id="g-nom" placeholder="Tu nombre"></div>
      <button class="btn" onclick="closeSheet();toast('¡Avisaste al centro! Te esperan.')">Enviar aviso</button>`);
  },
  offer(t) {
    const c = getCenter(t.dataset.id);
    openSheet('Ofrecer ayuda', `<p class="muted">${c.name} necesita voluntarios y/o transporte. Regístrate y el centro verá tu oferta.</p>
      <button class="btn mt-16" onclick="closeSheet();go('vol-skills')">Registrarme como voluntario</button>
      <button class="btn ghost mt-8" onclick="closeSheet()">Cancelar</button>`);
  },
  copy(t) { copyText(decodeURIComponent(t.dataset.copy), t.dataset.label); },

  toggle(t) {
    const g = t.dataset.group, k = t.dataset.key;
    const set = new Set(App.ctx[g] || []);
    if (set.has(k)) set.delete(k); else set.add(k);
    App.ctx[g] = [...set]; t.classList.toggle('sel');
  },
  'skills-next'() { if (!(App.ctx.skills || []).length) return toast('Elige al menos una opción', false); go('vol-data'); },

  async 'register-vol'() {
    const nombre = val('v-nombre');
    if (!nombre) return toast('Falta tu nombre', false);
    if (!val('v-whatsapp')) return toast('Falta tu WhatsApp', false);
    const foto = await uploadIfAny('v-file');
    const profile = { nombre, apellido: val('v-apellido'), cedula: val('v-cedula'), whatsapp: val('v-whatsapp'), estado: val('v-estado'), municipio: val('v-municipio'), parroquia: val('v-parroquia'), disp: val('v-disp'), veh: val('v-veh'), mov: val('v-mov'), skills: App.ctx.skills || [], foto };
    try { const v = await API.createVolunteer(profile); save('volunteer', v); App._apps = []; toast('¡Perfil creado en el servidor!'); go('vol-tasks'); }
    catch { toast('No se pudo registrar. ¿Servidor activo?', false); }
  },
  async 'apply-task'(t) {
    const v = load('volunteer', null);
    try { await API.createApplication({ volunteer_id: v && v.id, center_id: t.dataset.center, center_name: getCenter(t.dataset.center)?.name || 'Centro', task: t.dataset.task }); toast('¡Solicitud enviada! El centro la revisará.'); }
    catch { toast('No se pudo enviar.', false); }
  },
  async 'open-vol-panel'() {
    const v = load('volunteer', null);
    App._apps = (v && v.id) ? await API.applications('volunteer=' + v.id).catch(() => []) : [];
    go('vol-panel');
  },
  async 'vol-find'() {
    const q = val('vl-id'); if (!q) return toast('Ingresa tu WhatsApp o cédula', false);
    try {
      const { volunteer } = await API.lookupVolunteer(q);
      if (!volunteer) return toast('No encontramos tu perfil. Regístrate primero.', false);
      save('volunteer', volunteer);
      App._apps = await API.applications('volunteer=' + volunteer.id).catch(() => []);
      go('vol-panel');
    } catch { toast('Error al buscar.', false); }
  },
  'update-disp'() {
    openSheet('Actualizar disponibilidad', `
      <div class="field"><label>Disponibilidad</label><select class="select" id="ud"><option>Mañanas</option><option>Tardes</option><option>Noches</option><option>Fines de semana</option><option>Tiempo completo</option></select></div>
      <button class="btn" onclick="updateDisp()">Guardar</button>`);
  },
  'vol-evidence'() {
    openSheet('Subir evidencia', `
      <div class="field"><label>Foto de la entrega</label><label class="uploader" id="ev-up">${icon('upload')}<div>Toca para subir</div><input type="file" accept="image/*" id="ev-file"></label></div>
      <div class="field"><label>Comentario</label><textarea class="textarea" id="ev-text" placeholder="¿Qué entregaste y dónde?"></textarea></div>
      <button class="btn" onclick="saveVolEvidence()">Subir evidencia</button>`);
  },

  async 'submit-donation'(t) {
    const comprobanteUrl = await uploadIfAny('d-file');
    const anon = !!(document.getElementById('d-anon') && document.getElementById('d-anon').checked);
    const donation = { centerId: t.dataset.id || null, centerName: t.dataset.center, metodo: t.dataset.method, monto: val('d-amount'), banco: val('d-bank'), donante: anon ? '' : (val('d-name') || ''), anonimo: anon, telefono: anon ? '' : val('d-phone'), comprobante: !!comprobanteUrl, comprobanteUrl, fecha: today(), mensaje: val('d-msg'), did: deviceId() };
    try { const saved = await API.createDonation(donation); App._donation = saved; pushMyDonation(saved); await refreshCenters(); toast('¡Donación reportada!'); go('donation-status', { id: saved.id }); }
    catch { toast('No se pudo reportar. ¿Servidor activo?', false); }
  },
  // Mapa de la situación: alterna capas (todo / centros / servicios)
  'map-layer'(t) { App.ctx.mapLayer = t.dataset.layer; render(); },
  async 'open-edificios'() { App.edif = { q: '', damage: '' }; go('edificios'); if (Array.isArray(App._edificios)) return; try { const d = await API.edificios(); App._edificios = (d && d.edificios) || []; if (App.current.screen === 'edificios') render(); } catch { toast('No se pudieron cargar los edificios', false); } },
  async 'open-directorio'() { go('directorio'); if (App._directorio) return; try { App._directorio = await API.directorio(); if (App.current.screen === 'directorio') render(); } catch { toast('No se pudo cargar el directorio', false); } },
  'edif-filter'(t) { edifState().damage = t.dataset.d; render(); },
  // Donación de insumos físicos: registra (centro + fecha/hora + donante) y suma al inventario.
  'donate-insumos-open'(t) { App.ctx.movItems = [{}]; go('donate-insumos', { id: t.dataset.id }); },
  async 'submit-donacion-insumos'(t) {
    captureMovItems();
    const items = (App.ctx.movItems || []).filter(x => (x.insumo || '').trim() && +x.cantidad > 0);
    if (!items.length) return toast('Agrega al menos un insumo con cantidad', false);
    const anon = !!(document.getElementById('di-anon') && document.getElementById('di-anon').checked);
    const donation = { centerId: t.dataset.id, centerName: t.dataset.center, metodo: 'Insumos físicos', items, donante: anon ? '' : (val('di-name') || ''), anonimo: anon, mensaje: val('di-msg'), fecha: today(), did: deviceId() };
    try { const saved = await API.createDonation(donation); App._donation = saved; pushMyDonation(saved); App.ctx.movItems = [{}]; await refreshCenters(); toast('¡Donación registrada! Sumada al inventario ✓'); go('donation-status', { id: saved.id }); }
    catch { toast('No se pudo registrar', false); }
  },

  // ----- gestión de centros (requiere login + ser dueño) -----
  async 'open-centers'() {
    if (!session()) { toast('Inicia sesión para gestionar tu centro', false); return go('login'); }
    try { App._myCenters = await API.mineCenters(); } catch { App._myCenters = []; }
    go('my-centers');
  },
  'open-create'() {
    if (!session()) { toast('Inicia sesión para registrar un centro', false); return go('login'); }
    go('create-1');
  },
  async 'open-center-panel'(t) {
    await loadCenterDons(t.dataset.id);
    go('center-panel', { id: t.dataset.id });
  },
  // ---- Logística por centro ----
  async 'open-logistica'(t) {
    const id = t.dataset.id;
    try { App._mov = await API.movements(id); } catch { App._mov = null; toast('No se pudo abrir la logística (¿eres el admin?)', false); return; }
    go('center-logistica', { id });
  },
  'mov-open'(t) { App.ctx.movItems = [{}]; go('mov-form', { id: t.dataset.id, type: t.dataset.type }); },
  'mov-add-item'() { captureMovItems(); App.ctx.movItems.push({}); render(); },
  'mov-del-item'(t) { captureMovItems(); App.ctx.movItems.splice(+t.dataset.i, 1); if (!App.ctx.movItems.length) App.ctx.movItems = [{}]; render(); },
  async 'mov-submit'(t) {
    const id = t.dataset.id, type = t.dataset.type;
    const body = { type, nota: val('mov-nota') };
    if (type === 'beneficiarios') {
      body.familias = val('mov-familias'); body.personas = val('mov-personas');
      if (!(+body.familias) && !(+body.personas)) return toast('Indica familias o personas', false);
    } else {
      captureMovItems();
      body.items = (App.ctx.movItems || []).filter(x => (x.insumo || '').trim() && +x.cantidad > 0);
      if (!body.items.length) return toast('Agrega al menos un insumo con cantidad', false);
      if (type === 'entrada') body.origen = val('mov-origen');
      if (type === 'salida') body.destino = val('mov-destino');
    }
    try { await API.addMovement(id, body); App._mov = await API.movements(id); App.ctx.movItems = [{}]; toast('Registrado ✓'); go('center-logistica', { id }); }
    catch { toast('No se pudo registrar', false); }
  },
  async 'mov-estado'(t) {
    try { await API.movementEstado(t.dataset.id, t.dataset.estado); App._mov = await API.movements(t.dataset.center); render(); toast('Actualizado ✓'); }
    catch { toast('No se pudo actualizar', false); }
  },
  'logi-report'() {
    const m = App._mov; if (!m) return;
    const r = `📊 Reporte del día — ${m.center.name}\nEntradas hoy: ${m.hoy.entradas} · Salidas hoy: ${m.hoy.salidas}\nFamilias atendidas hoy: ${m.hoy.familias} (${m.hoy.personas} personas)\nInventario actual:\n${(m.inventario || []).slice(0, 30).map(x => '· ' + x.insumo + ': ' + x.cantidad + (x.unidad ? ' ' + x.unidad : '')).join('\n') || '—'}\n\nayudahumanitariavenezuela.com`;
    try { navigator.clipboard.writeText(r); toast('Reporte copiado ✓'); } catch { toast('Copia manual:\n' + r); }
  },
  async 'open-admin-logistica'() { try { App._logi = await API.adminLogistics(); go('admin-logistica'); } catch { toast('Solo administradores', false); } },
  async 'assign-admin'(t) {
    const phone = prompt('Teléfono del admin para este centro (ej. 0414-1234567):');
    if (!phone) return;
    try { await API.assignCenterAdmin(t.dataset.id, phone); if (App._logi) App._logi = await API.adminLogistics(); render(); toast('Admin asignado ✓'); }
    catch { toast('No se pudo asignar', false); }
  },
  async 'confirm-don'(t) {
    try { await API.patchDonation(t.dataset.id, { estado: t.dataset.st }); await loadCenterDons(t.dataset.center); await refreshCenters(); toast('Marcada como: ' + t.dataset.st); render(); }
    catch { toast('No se pudo actualizar (¿eres el dueño?)', false); }
  },
  async 'center-apps'(t) {
    const apps = await API.applications('center=' + t.dataset.id).catch(() => []);
    const body = apps.length ? apps.map(a => `<div class="list-row">${icon('user')}<div class="lr-main"><b>${a.task || 'Voluntario'}</b><span>${a.status === 'pending' ? 'Pendiente' : a.status}</span></div></div>`).join('') : '<p class="muted">Nadie se ha ofrecido todavía.</p>';
    openSheet('Voluntarios ofrecidos', `<div class="card" style="box-shadow:none;border:none;padding:0">${body}</div><button class="btn ghost mt-16" onclick="closeSheet()">Cerrar</button>`);
  },
  // ----- gestión real del centro -----
  'edit-needs'(t) {
    const c = getCenter(t.dataset.id); App.ctx.editNeeds = {};
    (c.needs || []).forEach(n => { App.ctx.editNeeds[n.key] = n.level || 'alta'; });
    go('center-needs', { id: t.dataset.id });
  },
  'toggle-edit-need'(t) {
    const k = t.dataset.key; App.ctx.editNeeds = App.ctx.editNeeds || {};
    if (App.ctx.editNeeds[k]) delete App.ctx.editNeeds[k]; else App.ctx.editNeeds[k] = 'alta';
    render();
  },
  async 'save-needs'(t) {
    const needs = Object.entries(App.ctx.editNeeds || {}).map(([key, level]) => ({ key, level }));
    if (!needs.length) return toast('Elige al menos una necesidad', false);
    try { await API.patchCenter(t.dataset.id, { needs }); await refreshCenters(); App.ctx.editNeeds = null; toast('Necesidades actualizadas'); go('center-panel', { id: t.dataset.id }); }
    catch { toast('No se pudo guardar', false); }
  },
  'edit-inventory'(t) {
    const c = getCenter(t.dataset.id); App.ctx.inv = (c.inventory || []).map(i => ({ label: i.label, qty: i.qty }));
    go('center-inventory', { id: t.dataset.id });
  },
  'inv-add'() { captureInv(); App.ctx.inv.push({ label: '', qty: 0 }); render(); },
  'inv-del'(t) { captureInv(); App.ctx.inv.splice(+t.dataset.idx, 1); render(); },
  async 'save-inv'(t) {
    captureInv();
    const inventory = (App.ctx.inv || []).filter(i => i.label);
    try { await API.patchCenter(t.dataset.id, { inventory }); await refreshCenters(); App.ctx.inv = null; toast('Inventario actualizado'); go('center-panel', { id: t.dataset.id }); }
    catch { toast('No se pudo guardar', false); }
  },
  'edit-methods'(t) { go('center-methods', { id: t.dataset.id }); },
  async 'save-methods'(t) {
    const c = getCenter(t.dataset.id);
    const pm = { banco: val('em-pm-banco'), telefono: val('em-pm-tel'), cedula: val('em-pm-ci'), titular: val('em-pm-tit'), concepto: (c.pagomovil && c.pagomovil.concepto) || 'Donación AyudaVE' };
    const tr = { banco: val('em-tr-banco'), cuenta: val('em-tr-cta'), titular: val('em-tr-tit'), cedula: val('em-pm-ci') };
    const wallet = val('em-cr-wallet');
    const crypto = wallet ? [{ red: val('em-cr-red') || 'USDT TRC20', wallet }] : [];
    const accepts = new Set(c.accepts || []);
    if (pm.banco) accepts.add('pagomovil'); else accepts.delete('pagomovil');
    if (crypto.length) accepts.add('cripto'); else accepts.delete('cripto');
    try {
      await API.patchCenter(t.dataset.id, { pagomovil: pm.banco ? pm : c.pagomovil, transferencia: tr.banco ? tr : c.transferencia, crypto, accepts: [...accepts] });
      await refreshCenters(); toast('Métodos actualizados'); go('center-panel', { id: t.dataset.id });
    } catch { toast('No se pudo guardar', false); }
  },
  'edit-horario'(t) {
    const c = getCenter(t.dataset.id);
    openSheet('Cambiar horario', `
      <div class="field"><label>Horario de atención</label><input class="input" id="eh-horario" value="${c.horario || ''}" placeholder="Ej. Lun a Sáb, 8 AM - 6 PM"></div>
      <button class="btn" onclick="saveCenterHorario('${t.dataset.id}')">Guardar horario</button>`);
  },
  async 'request-vol'(t) {
    const c = getCenter(t.dataset.id); const needs = (c.needs || []).slice();
    if (!needs.some(n => n.key === 'voluntarios')) needs.push({ key: 'voluntarios', level: 'alta' });
    try {
      await API.patchCenter(t.dataset.id, { needs });
      await API.addCenterUpdate(t.dataset.id, { type: 'urgente', text: 'Necesitamos voluntarios. ¡Postúlate desde la app!' });
      await refreshCenters(); toast('Solicitud de voluntarios publicada'); render();
    } catch { toast('No se pudo publicar', false); }
  },
  async 'request-transp'(t) {
    const c = getCenter(t.dataset.id); const needs = (c.needs || []).slice();
    if (!needs.some(n => n.key === 'transporte')) needs.push({ key: 'transporte', level: 'alta' });
    const accepts = new Set(c.accepts || []); accepts.add('transporte');
    try {
      await API.patchCenter(t.dataset.id, { needs, accepts: [...accepts] });
      await API.addCenterUpdate(t.dataset.id, { type: 'urgente', text: 'Necesitamos transporte para mover insumos.' });
      await refreshCenters(); toast('Solicitud de transporte publicada'); render();
    } catch { toast('No se pudo publicar', false); }
  },
  'center-update'(t) {
    openSheet('Publicar actualización', `
      <div class="field"><label>Tipo</label><select class="select" id="cu-type"><option value="recibido">Recibimos algo</option><option value="urgente">Urgente</option><option value="entrega">Entrega realizada</option><option value="cierre">Horario / cierre</option></select></div>
      <div class="field"><label>Mensaje</label><textarea class="textarea" id="cu-text" placeholder="Ej. Hoy recibimos 40 cajas de agua."></textarea></div>
      <div class="field"><label>Foto <span class="opt-note">(opcional)</span></label><label class="uploader" id="cu-up">${icon('camera')}<div>Subir foto</div><input type="file" accept="image/*" id="cu-file"></label></div>
      <button class="btn" onclick="submitCenterUpdate('${t.dataset.id}')">Publicar</button>`);
  },
  'center-evidence'(t) {
    openSheet('Subir evidencia', `
      <div class="field"><label>Foto de la entrega</label><label class="uploader" id="cu-up">${icon('upload')}<div>Toca para subir</div><input type="file" accept="image/*" id="cu-file"></label></div>
      <div class="field"><label>Mensaje</label><textarea class="textarea" id="cu-text" placeholder="Ej. Entregamos comida a 20 familias."></textarea></div>
      <button class="btn" onclick="submitCenterUpdate('${t.dataset.id}','entrega')">Publicar evidencia</button>`);
  },
  'close-center'(t) {
    openSheet('Cerrar temporalmente', `<p class="muted">Tu centro aparecerá como cerrado hasta que lo reabras.</p>
      <button class="btn danger mt-16" onclick="(async()=>{try{await API.patchCenter('${t.dataset.id}',{status:'cerrado'});await refreshCenters();}catch(e){};closeSheet();toast('Centro marcado como cerrado');render();})()">Marcar como cerrado</button>
      <button class="btn ghost mt-8" onclick="closeSheet()">Cancelar</button>`);
  },
  todo() { toast('Disponible próximamente'); },

  'toggle-need'(t) {
    const k = t.dataset.key; App.ctx.cNeeds = App.ctx.cNeeds || {};
    if (App.ctx.cNeeds[k]) delete App.ctx.cNeeds[k]; else App.ctx.cNeeds[k] = 'alta';
    render();
  },
  'need-level'(t) { if (App.ctx.cNeeds) App.ctx.cNeeds[t.dataset.key] = t.value; },
  async 'create-next'(t) {
    const step = +t.dataset.step;
    App.ctx.cData = App.ctx.cData || {};
    if (step === 1) {
      if (!val('c-nombre')) return toast('Ponle un nombre al centro', false);
      Object.assign(App.ctx.cData, { nombre: val('c-nombre'), tipo: val('c-tipo'), resp: val('c-resp'), respAp: val('c-resp-ap'), rif: val('c-rif'), wa: val('c-wa'), web: val('c-web') });
      return go('create-2');
    }
    if (step === 2) {
      App.ctx.cData.photo = await uploadIfAny('c-file');
      Object.assign(App.ctx.cData, { estado: val('c-estado'), municipio: val('c-municipio'), parroquia: val('c-parroquia'), alcaldia: val('c-alcaldia'), address: val('c-dir'), reference: val('c-ref'), pin: val('c-pin'), coords: parseCoords(val('c-coords-val')) });
      return go('create-3');
    }
    if (step === 3) { if (!Object.keys(App.ctx.cNeeds || {}).length) return toast('Elige al menos una necesidad', false); return go('create-4'); }
    if (step === 4) return go('create-5');
    if (step === 5) {
      App.ctx.cMethods = {
        pm: { banco: val('m-pm-banco'), telefono: val('m-pm-tel'), cedula: val('m-pm-ci'), titular: val('m-pm-tit') },
        tr: { banco: val('m-tr-banco'), cuenta: val('m-tr-cta'), titular: val('m-tr-tit') },
        cr: { red: val('m-cr-red'), wallet: val('m-cr-wallet') },
      };
      return go('create-6');
    }
  },
  async 'create-submit'() {
    const d = App.ctx.cData || {}, meth = App.ctx.cMethods || {};
    const accepts = (App.ctx.cRecibe && App.ctx.cRecibe.length ? App.ctx.cRecibe : ['fisico']);
    const center = {
      name: d.nombre, type: d.tipo, estado: d.estado, municipio: d.municipio, parroquia: d.parroquia,
      address: d.address || 'Dirección por confirmar', reference: d.reference, photo: d.photo || null, coords: d.coords || null,
      responsable: d.resp, responsableApellido: d.respAp, whatsapp: d.wa,
      needs: Object.entries(App.ctx.cNeeds || { agua: 'alta' }).map(([key, level]) => ({ key, level })),
      accepts: [...new Set([...accepts, ...(meth.pm && meth.pm.banco ? ['pagomovil'] : []), ...(meth.cr && meth.cr.wallet ? ['cripto'] : [])])],
      notAccepts: (App.ctx.cNoRecibe && App.ctx.cNoRecibe.length ? App.ctx.cNoRecibe : ['Comida vencida']),
      pagomovil: meth.pm && meth.pm.banco ? { ...meth.pm, concepto: 'Donación AyudaVE' } : { banco: 'Por configurar', telefono: d.wa || '—', cedula: d.rif || '—', titular: d.nombre, concepto: 'Donación' },
      transferencia: meth.tr && meth.tr.banco ? { ...meth.tr, cedula: d.rif } : null,
      crypto: meth.cr && meth.cr.wallet ? [{ red: meth.cr.red || 'USDT TRC20', wallet: meth.cr.wallet }] : [],
      horario: 'Por confirmar', inventory: [],
      updates: [{ type: 'aviso', text: 'Centro recién publicado. ¡Pronto compartiremos novedades!', date: 'Ahora' }],
    };
    try { const c = await API.createCenter(center); await refreshCenters(); App.ctx = {}; go('create-done', { id: c.id }); }
    catch { toast('No se pudo publicar. ¿Servidor activo?', false); }
  },

  /* ----- personas ----- */
  async 'open-persons'() { App.ctx.personFilter = ''; App.ctx.personQuery = ''; try { App._personStats = await API.personStats(); } catch {} await refreshPersons({ status: '', q: '' }); go('persons-list'); },
  async 'person-filter'(t) { App.ctx.personFilter = t.dataset.k; await refreshPersons({ status: t.dataset.k }); render(); },
  async 'open-person'(t) {
    if (!t.dataset.id) return;
    try { App._person = await API.person(t.dataset.id); go('person-detail'); }
    catch { toast('No se pudo abrir el reporte', false); }
  },
  'person-share'(t) { const p = DB.persons.find(x => String(x.id) === String(t.dataset.id)) || App._person; if (p) sharePerson(p); },
  'person-type'(t) { App.ctx.personType = t.dataset.k; go('person-create'); },
  // ----- mascotas -----
  async 'open-pets'() { App.ctx.petFilter = ''; App.ctx.petQuery = ''; App._pets = null; go('pets'); await refreshPets(); if (App.current.screen === 'pets') render(); },
  async 'pet-filter'(t) { App.ctx.petFilter = t.dataset.k; await refreshPets(); render(); },
  'pet-report'(t) { App.ctx.petStatus = t.dataset.st || 'perdida'; go('pet-new'); },
  async 'submit-pet'() {
    const foto = await uploadIfAny('pet-file');
    const pet = { status: val('pet-status'), tipo: val('pet-tipo'), nombre: val('pet-nombre'), descripcion: val('pet-desc'), foto, estado: val('pet-estado'), municipio: val('pet-municipio'), parroquia: val('pet-parroquia'), lugar: val('pet-lugar'), destino: val('pet-destino'), contacto: val('pet-cnombre'), whatsapp: val('pet-wa') };
    if (!pet.descripcion && !foto) return toast('Agrega una foto o una descripción', false);
    try { await API.createPet(pet); App.ctx.petFilter = ''; App.ctx.petQuery = ''; App._pets = null; toast('¡Mascota publicada!'); go('pets'); await refreshPets(); if (App.current.screen === 'pets') render(); }
    catch { toast('No se pudo publicar. ¿Servidor activo?', false); }
  },
  // ----- asistente IA -----
  async 'asistente-search'() {
    const name = val('as-name');
    const image = await readFileAsDataURL(document.getElementById('as-file'));
    if (!name && !image) return toast('Escribe un nombre o sube una foto', false);
    const el = document.getElementById('asis-res'); if (el) el.innerHTML = `<div class="empty">${icon('inbox')}<p>Buscando${image ? ' y analizando la foto' : ''}…</p></div>`;
    try { const r = await API.assistant({ name, image }); renderAsistente(r); }
    catch { if (el) el.innerHTML = `<div class="empty">${icon('alert')}<p>No se pudo buscar. Intenta de nuevo.</p></div>`; }
  },
  async 'person-submit'(t) {
    const nombre = val('p-nombre'); if (!nombre) return toast('Falta el nombre', false);
    const foto = await uploadIfAny('p-file');
    const person = {
      status: t.dataset.type, nombre, apellido: val('p-apellido'), edad: val('p-edad'), sexo: val('p-sexo'),
      foto, fecha: val('p-fecha'), estado: val('p-estado'), municipio: val('p-municipio'), parroquia: val('p-parroquia'),
      lugar: val('p-lugar'), descripcion: val('p-desc'),
      contactoNombre: val('p-cnombre'), contactoTel: val('p-ctel'), relacion: val('p-rel'),
    };
    try { const saved = await API.createPerson(person); await refreshPersons(); App._person = saved; toast('Reporte publicado'); go('person-done'); }
    catch { toast('No se pudo publicar. ¿Servidor activo?', false); }
  },
  'person-sighting'(t) {
    openSheet('Tengo información', `
      <div class="field"><label>¿Dónde lo/la viste?</label><input class="input" id="s-lugar" placeholder="Lugar o zona"></div>
      <div class="field"><label>Detalles</label><textarea class="textarea" id="s-detalle" placeholder="¿Cuándo? ¿Cómo estaba? Cualquier dato ayuda."></textarea></div>
      <div class="field"><label>Tu contacto <span class="opt-note">(opcional)</span></label><input class="input" id="s-contacto" placeholder="Tel / WhatsApp"></div>
      <button class="btn" onclick="submitSighting('${t.dataset.id}')">Enviar información</button>`);
  },
  'person-status'(t) {
    const st = t.dataset.st;
    openSheet('Cambiar estado', `<p class="muted">¿Confirmas marcar este reporte como <b>${PERSON_STATUS[st].label}</b>? Esto actualiza la información pública.</p>
      <button class="btn mt-16" onclick="(async()=>{try{await API.patchPerson('${t.dataset.id}',{status:'${st}'});App._person=await API.person('${t.dataset.id}');await refreshPersons();}catch(e){};closeSheet();toast('Estado actualizado');render();})()">Confirmar</button>
      <button class="btn ghost mt-8" onclick="closeSheet()">Cancelar</button>`);
  },
};

/* ============================================================
   EVENTOS + INIT
   ============================================================ */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-action],[data-back],[data-home]');
  if (!t) return;
  if (t.dataset.back !== undefined) return back();
  if (t.dataset.home !== undefined) return home();
  if (t.dataset.go) return go(t.dataset.go, t.dataset.params ? JSON.parse(t.dataset.params) : {});
  if (t.dataset.action) { const fn = actions[t.dataset.action]; if (fn) fn(t, e); }
});
document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.geo) geoUpdateCascade(e);
  const act = e.target.dataset && e.target.dataset.action;
  if (act === 'need-level') { App.ctx.cNeeds = App.ctx.cNeeds || {}; App.ctx.cNeeds[e.target.dataset.key] = e.target.value; }
  if (act === 'edit-need-level') { App.ctx.editNeeds = App.ctx.editNeeds || {}; App.ctx.editNeeds[e.target.dataset.key] = e.target.value; }
  if (e.target.id === 'd-anon') { const f = document.getElementById('d-name-field'); if (f) f.style.display = e.target.checked ? 'none' : ''; }
  if (e.target.type === 'file' && e.target.files.length) {
    const lbl = e.target.closest('.uploader');
    if (lbl) { lbl.classList.add('has'); const d = lbl.querySelector('div'); if (d) d.textContent = e.target.files[0].name; }
  }
});

/* Google Analytics 4 — opcional; se activa solo si /api/config trae gaId. */
function initGA(id) {
  if (!id || window.__gaId) return;
  window.__gaId = id;
  const s = document.createElement('script'); s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true, send_page_view: false });
}
function gaPage(screen) {
  if (window.gtag && window.__gaId) gtag('event', 'page_view', { page_title: screen, page_path: '/' + screen });
}

/* ===== Compartir / difundir (botón flotante) ===== */
window.AY_SHARE_URL = 'https://ayudahumanitariavenezuela.com';
window.AY_SHARE_MSG = '🆘 Por favor difundir 🇻🇪\nAyudaVE: centros de acopio, donaciones, personas en hospitales, desaparecidos y toda la información que necesitas tras el sismo en Venezuela.';
function ayToastSafe(m) { try { toast(m); } catch { /* noop */ } }
function ayShareToggle() {
  const m = document.getElementById('share-menu'), f = document.getElementById('share-fab');
  if (!m || !f) return;
  if (m.hasAttribute('hidden')) { m.removeAttribute('hidden'); f.classList.add('open'); }
  else { m.setAttribute('hidden', ''); f.classList.remove('open'); }
}
function ayShareClose() {
  const m = document.getElementById('share-menu'), f = document.getElementById('share-fab');
  if (m) m.setAttribute('hidden', ''); if (f) f.classList.remove('open');
}
// Oculta el botón flotante por completo (cuando el usuario lo cierra con la X). Recuerda la decisión.
function ayShareDismiss(e) {
  if (e) { e.stopPropagation(); }
  try { localStorage.setItem('ay_share_hidden', '1'); } catch { /* noop */ }
  const f = document.getElementById('share-fab'); if (f) f.style.display = 'none';
}
async function ayShare(target) {
  const U = window.AY_SHARE_URL, M = window.AY_SHARE_MSG, full = M + '\n' + U;
  const open = u => window.open(u, '_blank', 'noopener');
  try {
    if (target === 'whatsapp') open('https://wa.me/?text=' + encodeURIComponent(full));
    else if (target === 'facebook') open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(U));
    else if (target === 'x') open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(M) + '&url=' + encodeURIComponent(U));
    else if (target === 'telegram') open('https://t.me/share/url?url=' + encodeURIComponent(U) + '&text=' + encodeURIComponent(M));
    else if (target === 'copy') { try { await navigator.clipboard.writeText(full); ayToastSafe('Enlace copiado ✓'); } catch { open('https://wa.me/?text=' + encodeURIComponent(full)); } }
    else if (target === 'native') { if (navigator.share) { await navigator.share({ title: 'AyudaVE', text: M, url: U }); } else { try { await navigator.clipboard.writeText(full); ayToastSafe('Copiado ✓ — pégalo donde quieras'); } catch {} } }
    else if (target === 'flyer') { await ayShareFlyer(); }
  } catch (e) { /* el usuario canceló el diálogo nativo, etc. */ }
  ayShareClose();
}
async function ayShareFlyer() {
  try {
    const r = await fetch('/flyer.png'); const blob = await r.blob();
    const file = new File([blob], 'AyudaVE-difundir.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: window.AY_SHARE_MSG + '\n' + window.AY_SHARE_URL, title: 'AyudaVE' });
      return;
    }
  } catch (e) { /* sin Web Share de archivos → descargar */ }
  const a = document.createElement('a'); a.href = '/flyer.png'; a.download = 'AyudaVE-difundir.png'; a.target = '_blank';
  document.body.appendChild(a); a.click(); a.remove();
  ayToastSafe('Flyer descargado — compártelo donde quieras');
}
// Cerrar el menú al tocar fuera del botón
document.addEventListener('click', e => { const f = document.getElementById('share-fab'); if (f && !f.contains(e.target)) ayShareClose(); }, true);

async function boot() {
  try { window.MAPS = await API.config(); } catch { window.MAPS = {}; }
  initGA(window.MAPS && window.MAPS.gaId);
  await Promise.all([refreshCenters(), refreshPersons(), refreshMetrics(), refreshAudit()]);
  render();
  // Prefetch de reportes de servicios (reporte-ve) para que el mapa abra con todo cargado.
  API.reportes().then(d => { App._reportes = (d && d.reportes) || []; }).catch(() => {});
}
boot();
