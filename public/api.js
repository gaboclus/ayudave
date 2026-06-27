/* ============================================================
   AyudaVE — Capa de API (cliente). Habla con el backend real.
   ============================================================ */
window.API = {
  base: '/api',
  _authHeaders() { try { const s = JSON.parse(localStorage.getItem('ayudave_session')); return (s && s.token) ? { Authorization: 'Bearer ' + s.token } : {}; } catch { return {}; } },
  async _get(p) { const r = await fetch(this.base + p, { headers: this._authHeaders() }); if (!r.ok) throw new Error('GET ' + p + ' → ' + r.status); return r.json(); },
  async _send(method, p, body) {
    const r = await fetch(this.base + p, { method, headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error(method + ' ' + p + ' → ' + r.status);
    return r.json();
  },

  // centros
  centers() { return this._get('/centers'); },
  center(id) { return this._get('/centers/' + id); },
  mineCenters() { return this._get('/centers/mine'); },
  createCenter(d) { return this._send('POST', '/centers', d); },
  patchCenter(id, d) { return this._send('PATCH', '/centers/' + id, d); },
  addCenterUpdate(id, d) { return this._send('POST', `/centers/${id}/updates`, d); },
  // logística del centro
  movements(id) { return this._get('/centers/' + id + '/movements'); },
  addMovement(id, d) { return this._send('POST', '/centers/' + id + '/movements', d); },
  movementEstado(id, estado) { return this._send('POST', '/movements/' + id + '/estado', { estado }); },
  adminLogistics() { return this._get('/admin/logistics'); },
  assignCenterAdmin(id, phone, remove) { return this._send('POST', '/admin/centers/' + id + '/assign', { phone, remove: !!remove }); },

  // donaciones
  donations(centerId) { return this._get('/donations' + (centerId ? '?center=' + encodeURIComponent(centerId) : '')); },
  createDonation(d) { return this._send('POST', '/donations', d); },
  patchDonation(id, d) { return this._send('PATCH', '/donations/' + id, d); },

  // voluntarios
  createVolunteer(d) { return this._send('POST', '/volunteers', d); },
  lookupVolunteer(q) { return this._get('/volunteers/lookup?q=' + encodeURIComponent(q)); },
  patchVolunteer(id, d) { return this._send('PATCH', '/volunteers/' + id, d); },

  // postulaciones
  createApplication(d) { return this._send('POST', '/applications', d); },
  applications(params) { return this._get('/applications' + (params ? '?' + params : '')); },

  // personas (desaparecidos / encontrados)
  persons(qs) { return this._get('/persons' + (qs ? '?' + qs : '')); },
  personStats() { return this._get('/persons/stats'); },
  person(id) { return this._get('/persons/' + id); },
  createPerson(d) { return this._send('POST', '/persons', d); },
  patchPerson(id, d) { return this._send('PATCH', '/persons/' + id, d); },
  addSighting(id, d) { return this._send('POST', `/persons/${id}/sightings`, d); },

  config() { return this._get('/config'); },
  metrics() { return this._get('/metrics'); },
  audit() { return this._get('/audit'); },
  hospitals(qs) { return this._get('/hospitals' + (qs ? '?' + qs : '')); },
  hospitalsSummary() { return this._get('/hospitals/summary'); },

  // solicitudes de ayuda (una persona pide ayuda)
  createHelpRequest(d) { return this._send('POST', '/help-requests', d); },
  helpRequests(qs) { return this._get('/help-requests' + (qs ? '?' + qs : '')); },
  patchHelpRequest(id, d) { return this._send('PATCH', '/help-requests/' + id, d); },
  reportes() { return this._get('/reportes'); }, // reportes de servicios (reporte-ve), auto-sincronizados
  edificios() { return this._get('/edificios'); }, // edificios afectados (terremotovenezuela.com), auto-sincronizados
  directorio() { return this._get('/directorio'); }, // directorio de emergencia (hospitales/ambulancias/bomberos)
  sismos() { return this._get('/sismos'); }, // sismos/réplicas recientes (USGS)

  // mascotas (perdidas / encontradas / refugio / veterinario)
  pets(qs) { return this._get('/pets' + (qs ? '?' + qs : '')); },
  createPet(d) { return this._send('POST', '/pets', d); },
  patchPet(id, d) { return this._send('PATCH', '/pets/' + id, d); },

  // asistente IA: buscar persona por nombre o foto
  assistant(d) { return this._send('POST', '/assistant', d); },

  // recursos (enlaces a grupos, bases de datos, galería)
  resources() { return this._get('/resources'); },
  createResource(d) { return this._send('POST', '/resources', d); },
  deleteResource(id) { return this._send('POST', '/admin/resources/' + id + '/delete', {}); },

  // cuentas / sesión (login por teléfono + PIN)
  checkUser(phone) { return this._get('/users/check?phone=' + encodeURIComponent(phone)); },
  registerUser(d) { return this._send('POST', '/users', d); }, // -> { user, token }
  async loginUser(phone, pin) {
    const r = await fetch(this.base + '/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, pin }) });
    if (r.status === 401 || r.status === 429) return { error: r.status };
    if (!r.ok) throw new Error(r.status);
    return r.json(); // { user, token }
  },
  patchUser(id, d) { return this._send('PATCH', '/users/' + id, d); },

  // administrador / verificador
  adminOverview() { return this._get('/admin/overview'); },
  adminDashboard() { return this._get('/admin/dashboard'); },
  adminUsers() { return this._get('/admin/users'); },
  adminDonations() { return this._get('/admin/donations'); },
  adminInventory() { return this._get('/admin/inventory'); },
  adminActivity() { return this._get('/admin/activity'); },
  adminCenterDetail(id) { return this._get('/admin/centers/' + id + '/detail'); },
  adminSetCenter(id, status) { return this._send('POST', '/admin/centers/' + id, { status }); },
  adminModeratePerson(id, hidden) { return this._send('POST', '/admin/persons/' + id, { hidden }); },

  // subir imagen → devuelve { url }
  upload(dataUrl, name) { return this._send('POST', '/upload', { image: dataUrl, name }); },
};

/* lee un <input type=file> como dataURL */
window.readFileAsDataURL = function (input) {
  return new Promise((resolve) => {
    const f = input && input.files && input.files[0];
    if (!f) return resolve(null);
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(f);
  });
};

/* sube la imagen de un input si hay; devuelve url o null */
window.uploadIfAny = async function (inputId) {
  const el = document.getElementById(inputId);
  if (!el || !el.files || !el.files.length) return null;
  const dataUrl = await readFileAsDataURL(el);
  if (!dataUrl) return null;
  try { const { url } = await API.upload(dataUrl, el.files[0].name); return url; }
  catch { return null; }
};
