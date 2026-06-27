/* ============================================================
   AyudaVE — Catálogos y constantes de UI (íconos, necesidades,
   habilidades, métodos de donación, estados, etc.)
   NO contiene datos de centros/personas: esos vienen de la API real.
   ============================================================ */

/* ---------- Íconos (línea, 24x24, currentColor) ---------- */
window.ICONS = {
  pin:        '<path d="M12 22s7-5.5 7-12A7 7 0 0 0 5 10c0 6.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  locate:     '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
  heart:      '<path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z"/>',
  droplet:    '<path d="M12 22a7 7 0 0 1-7-7c0-3 4-8.5 7-11 3 2.5 7 8 7 11a7 7 0 0 1-7 7z"/>',
  box:        '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  money:      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  coin:       '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.2h3.2a1.6 1.6 0 0 1 0 3.2H9.6h3.4a1.6 1.6 0 0 1 0 3.2H9.5"/>',
  truck:      '<path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  users:      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="8" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user:       '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  medkit:     '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M12 11v6M9 14h6"/>',
  share:      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  route:      '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
  phone:      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  check:      '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
  badge:      '<path d="M12 2l2.4 1.7 2.9-.2 1 2.7 2.4 1.6-.9 2.8.9 2.8-2.4 1.6-1 2.7-2.9-.2L12 22l-2.4-1.7-2.9.2-1-2.7L3.3 16l.9-2.8L3.3 10.4l2.4-1.6 1-2.7 2.9.2z"/><path d="M9 12l2 2 4-4"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus:       '<path d="M12 5v14M5 12h14"/>',
  search:     '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  usersearch: '<circle cx="10" cy="8" r="3.4"/><path d="M3.5 20a6.5 6.5 0 0 1 10.3-5.2"/><circle cx="17" cy="16.5" r="3"/><path d="M22 21.5l-2.8-2.8"/>',
  calendar:   '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  ribbon:     '<circle cx="12" cy="8.5" r="5.5"/><path d="M9.2 13.2 6 21l6-3 6 3-3.2-7.8"/>',
  idcard:     '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2.2"/><path d="M5.5 16c.6-1.6 4.4-1.6 5 0M14 9.5h5M14 13.5h5"/>',
  shirt:      '<path d="M16 3l4 2-2 4-2-1v11H8V8L6 9 4 5l4-2 2 2h4z"/>',
  diaper:     '<path d="M3 8h18l-2 4.5A6 6 0 0 1 13.6 16h-3.2A6 6 0 0 1 5 12.5z"/><path d="M3 8c4 1 14 1 18 0"/>',
  flashlight: '<path d="M7 3h10v3l-2 3v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V9L7 6z"/><path d="M9 14h6"/>',
  battery:    '<rect x="2" y="8" width="17" height="9" rx="2"/><path d="M22 11v3"/><path d="M6.5 11l-1.5 3h2.5l-1.5 3"/>',
  tools:      '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.1-.6-.6-2.1z"/>',
  fuel:       '<path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17"/><path d="M3 13h10"/><path d="M13 8h3a2 2 0 0 1 2 2v6a2 2 0 0 0 4 0V9l-3-3"/>',
  blanket:    '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10c4 2 8-2 12 0s4 0 4 0"/>',
  building:   '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 11h.01M15 11h.01"/>',
  megaphone:  '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8a4 4 0 0 1 0 8"/>',
  camera:     '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3"/>',
  car:        '<path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M3 13h18v5H3z"/><path d="M7 18v1M17 18v1"/>',
  food:       '<path d="M5 3v7a2 2 0 0 0 2 2v9M7 3v6M11 3v6M11 3a2 2 0 0 1-2 2"/><path d="M18 3c-1.6 0-3 1.8-3 5v4h3v9"/>',
  upload:     '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5"/><path d="M12 4v12"/>',
  copy:       '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  back:       '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  chevron:    '<path d="M9 18l6-6-6-6"/>',
  home:       '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  alert:      '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  map:        '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>',
  info:       '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  edit:       '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  bell:       '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  clipboard:  '<rect x="6" y="4" width="12" height="18" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  inbox:      '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l3 7v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z"/>',
  pkgcheck:   '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5"/><path d="M16 16l2 2 4-4"/>',
  hand:       '<path d="M18 11V7a2 2 0 0 0-4 0M14 7V5a2 2 0 0 0-4 0v2M10 7v5"/><path d="M6 10a2 2 0 0 1 4 0v3l-2-1"/><path d="M18 11a2 2 0 1 1 4 0c0 4-2 9-7 9-3 0-5-1-7-4l-3-5a2 2 0 0 1 3-2l2 3"/>',
  message:    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  bank:       '<path d="M3 21h18M4 10h16M5 21V10M19 21V10M9 21V10M15 21V10"/><path d="M12 3 3 8h18z"/>',
  close:      '<path d="M18 6 6 18M6 6l12 12"/>',
  cross:      '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  list:       '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  trend:      '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  whatsapp:   '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.7 9c.3 2.6 2.4 4.7 5 5l1-1.4 1.9.8a4.5 4.5 0 0 1-7.1-4.4z"/>',
  instagram:  '<rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1.1"/>',
  telegram:   '<path d="M21.5 4.5 2.5 11.8l5.4 1.8 1.9 5.6 2.8-3.1 4.6 3.4z"/><path d="M7.9 13.6 17 7.5l-7.7 7.4"/>',
  database:   '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  video:      '<rect x="2.5" y="6" width="14" height="12" rx="2"/><path d="M16.5 10l5-3v10l-5-3z"/>',
  gallery:    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/>',
  link:       '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
};

/* ---------- Tipos de recurso (sección Recursos / enlaces) ---------- */
window.RESOURCE_KINDS = [
  { key: 'whatsapp', label: 'Grupos de WhatsApp', icon: 'whatsapp', color: '#25d366' },
  { key: 'telegram', label: 'Grupos de Telegram', icon: 'telegram', color: '#229ED9' },
  { key: 'database', label: 'Bases de datos', icon: 'database', color: '#0e3a8c' },
  { key: 'image',    label: 'Galería de imágenes', icon: 'gallery', color: '#b5179e' },
  { key: 'video',    label: 'Videos', icon: 'video', color: '#cf142b' },
  { key: 'link',     label: 'Otros enlaces', icon: 'link', color: '#50607a' },
];
window.RESOURCE_MAP = Object.fromEntries(window.RESOURCE_KINDS.map(k => [k.key, k]));

/* ---------- Catálogo de necesidades / insumos ---------- */
window.NEEDS = [
  { key: 'agua', label: 'Agua', icon: 'droplet' },
  { key: 'comida', label: 'Comida', icon: 'food' },
  { key: 'medicinas', label: 'Medicinas', icon: 'medkit' },
  { key: 'primeros-auxilios', label: 'Primeros auxilios', icon: 'medkit' },
  { key: 'gasas', label: 'Gasas', icon: 'medkit' },
  { key: 'ropa', label: 'Ropa', icon: 'shirt' },
  { key: 'mantas', label: 'Mantas', icon: 'blanket' },
  { key: 'panales', label: 'Pañales', icon: 'diaper' },
  { key: 'formula', label: 'Fórmula infantil', icon: 'diaper' },
  { key: 'linternas', label: 'Linternas', icon: 'flashlight' },
  { key: 'baterias', label: 'Baterías', icon: 'battery' },
  { key: 'powerbanks', label: 'Power banks', icon: 'battery' },
  { key: 'herramientas', label: 'Herramientas', icon: 'tools' },
  { key: 'transporte', label: 'Transporte', icon: 'truck' },
  { key: 'gasolina', label: 'Gasolina', icon: 'fuel' },
  { key: 'voluntarios', label: 'Voluntarios', icon: 'users' },
  { key: 'pagomovil', label: 'Pago Móvil', icon: 'money' },
  { key: 'cripto', label: 'USDT / USDC', icon: 'coin' },
];
window.NEED_MAP = Object.fromEntries(window.NEEDS.map(n => [n.key, n]));

/* ---------- Habilidades de voluntario ---------- */
window.VOL_SKILLS = [
  { key: 'carro', label: 'Tengo carro', icon: 'car' },
  { key: 'moto', label: 'Tengo moto', icon: 'truck' },
  { key: 'cargar', label: 'Puedo cargar cajas', icon: 'box' },
  { key: 'clasificar', label: 'Clasificar insumos', icon: 'clipboard' },
  { key: 'entregar', label: 'Entregar donaciones', icon: 'truck' },
  { key: 'llamadas', label: 'Hacer llamadas', icon: 'phone' },
  { key: 'verificar', label: 'Verificar centros', icon: 'check' },
  { key: 'fotos', label: 'Tomar fotos', icon: 'camera' },
  { key: 'evidencias', label: 'Subir evidencias', icon: 'upload' },
  { key: 'medico', label: 'Soy médico', icon: 'medkit' },
  { key: 'enfermero', label: 'Soy enfermero', icon: 'medkit' },
  { key: 'paramedico', label: 'Soy paramédico', icon: 'medkit' },
  { key: 'psicologo', label: 'Soy psicólogo', icon: 'users' },
  { key: 'cocinar', label: 'Puedo cocinar', icon: 'food' },
  { key: 'ninos', label: 'Cuidar niños', icon: 'users' },
  { key: 'tecnologia', label: 'Ayudar con tecnología', icon: 'tools' },
  { key: 'redes', label: 'Redes sociales', icon: 'megaphone' },
  { key: 'gasolina', label: 'Donar gasolina', icon: 'fuel' },
];
window.SKILL_MAP = Object.fromEntries(window.VOL_SKILLS.map(s => [s.key, s]));

/* ---------- Cómo quiero ayudar ---------- */
window.HELP_WAYS = [
  { key: 'insumos', label: 'Donar insumos', icon: 'box' },
  { key: 'pagomovil', label: 'Donar por Pago Móvil', icon: 'money' },
  { key: 'cripto', label: 'Donar cripto', icon: 'coin' },
  { key: 'voluntario', label: 'Ser voluntario', icon: 'users' },
  { key: 'transporte', label: 'Ofrecer transporte', icon: 'truck' },
  { key: 'difundir', label: 'Difundir centros', icon: 'megaphone' },
  { key: 'nose', label: 'No sé, muéstrame qué se necesita cerca', icon: 'info' },
];

/* ---------- Qué quiero donar ---------- */
window.DONATE_TYPES = [
  { key: 'fisico', label: 'Insumos físicos', icon: 'box' },
  { key: 'pagomovil', label: 'Bolívares (Pago Móvil)', icon: 'money' },
  { key: 'transferencia', label: 'Transferencia bancaria', icon: 'bank' },
  { key: 'cripto', label: 'USDT / USDC', icon: 'coin' },
  { key: 'comida', label: 'Comida', icon: 'food' },
  { key: 'agua', label: 'Agua', icon: 'droplet' },
  { key: 'medicinas', label: 'Medicinas', icon: 'medkit' },
  { key: 'ropa', label: 'Ropa', icon: 'shirt' },
  { key: 'panales', label: 'Pañales', icon: 'diaper' },
  { key: 'herramientas', label: 'Herramientas', icon: 'tools' },
  { key: 'transporte', label: 'Transporte', icon: 'truck' },
  { key: 'otro', label: 'Otro', icon: 'plus' },
];

/* ---------- Dónde quiero donar ---------- */
window.DONATE_WHERE = [
  { key: 'cerca', label: 'Cerca de mí', icon: 'pin' },
  { key: 'municipio', label: 'En mi municipio', icon: 'map' },
  { key: 'parroquia', label: 'En otra parroquia', icon: 'map' },
  { key: 'estado', label: 'En otro estado', icon: 'map' },
  { key: 'especifico', label: 'A un centro específico', icon: 'building' },
  { key: 'urgente', label: 'A la necesidad más urgente', icon: 'alert' },
];

/* ---------- Tipos de centro ---------- */
window.CENTER_TYPES = ['Iglesia', 'Universidad', 'Fundación', 'ONG', 'Alcaldía', 'Condominio', 'Comunidad', 'Consejo comunal', 'Comuna', 'Voluntariado', 'Empresa privada', 'Otro'];

/* ---------- Estados de Venezuela (resumen) ---------- */
window.ESTADOS = ['Distrito Capital', 'Miranda', 'La Guaira (Vargas)', 'Aragua', 'Carabobo', 'Zulia', 'Lara', 'Táchira', 'Mérida', 'Bolívar', 'Anzoátegui', 'Falcón', 'Otro'];

/* ---------- Números de emergencia ---------- */
window.EMERGENCY = [
  { label: 'Emergencias (VEN 911)', number: '911' },
  { label: 'Bomberos', number: '171' },
  { label: 'Protección Civil', number: '0800-2255272' },
  { label: 'Cruz Roja Venezolana', number: '0212-5714380' },
  { label: 'Policía Nacional (PNB)', number: '0800-1111111' },
];

/* ---------- Estados de verificación / donación ---------- */
window.STATUS_LABELS = {
  'verificado': { label: 'Verificado', cls: 'ok' },
  'verificado-basico': { label: 'Verificado básico', cls: 'ok' },
  'verificado-operativo': { label: 'Verificado operativo', cls: 'ok' },
  'pendiente': { label: 'Pendiente de verificación', cls: 'pend' },
  'sospechoso': { label: 'Sospechoso', cls: 'bad' },
  'cerrado': { label: 'Cerrado', cls: 'muted' },
};
window.LEVEL_LABELS = {
  critica: { label: 'Crítica', cls: 'critica' },
  alta: { label: 'Alta', cls: 'alta' },
  media: { label: 'Media', cls: 'media' },
  baja: { label: 'Baja', cls: 'baja' },
};
window.DONATION_STATES = ['Reportada', 'Pendiente de confirmar', 'Confirmada por el centro', 'Usada para compra', 'Entregada', 'Evidenciada'];

/* ---------- Personas (desaparecidos / encontrados) ---------- */
window.PERSON_STATUS = {
  desaparecido: { label: 'Desaparecido', cls: 'amber', icon: 'usersearch' },
  encontrado:   { label: 'Encontrado', cls: 'ok', icon: 'check' },
  menor_solo:   { label: 'Niño/a sin acompañante', cls: 'bad', icon: 'users' },
};
window.PERSON_TYPES = [
  { key: 'desaparecido', label: 'Persona desaparecida', icon: 'usersearch', desc: 'Buscamos a alguien' },
  { key: 'encontrado', label: 'Persona encontrada', icon: 'check', desc: 'Alguien fue hallado a salvo' },
  { key: 'menor_solo', label: 'Niño/a sin acompañante', icon: 'users', desc: 'Un menor sin un adulto responsable' },
];
window.PERSON_FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'desaparecido', label: 'Desaparecidos' },
  { key: 'encontrado', label: 'Encontrados' },
  { key: 'menor_solo', label: 'Niños solos' },
];
window.SEXOS = ['Femenino', 'Masculino', 'Otro / No especifica'];

/* Mascotas (perdidas / encontradas / refugio / veterinario) */
window.PET_STATUS = {
  perdida:     { label: 'Perdida', cls: 'bad', icon: 'usersearch', color: '#dc2626' },
  encontrada:  { label: 'Encontrada', cls: 'ok', icon: 'check', color: '#16a34a' },
  refugio:     { label: 'En refugio', cls: 'amber', icon: 'home', color: '#d97706' },
  veterinario: { label: 'Veterinario', cls: 'slate', icon: 'plus', color: '#0891b2' },
};
window.PET_FILTERS = [
  { key: '', label: 'Todas' },
  { key: 'perdida', label: 'Perdidas' },
  { key: 'encontrada', label: 'Encontradas' },
  { key: 'refugio', label: 'Refugio' },
  { key: 'veterinario', label: 'Veterinario' },
];
window.PET_TYPES = ['Perro', 'Gato', 'Ave', 'Otro'];

/* ---------- Qué puede aportar (define el rol del usuario) ---------- */
window.APORTES = [
  { key: 'insumos', label: 'Donar insumos', icon: 'box' },
  { key: 'dinero', label: 'Donar dinero', icon: 'money' },
  { key: 'voluntario', label: 'Ser voluntario', icon: 'users' },
  { key: 'transporte', label: 'Ofrecer transporte', icon: 'truck' },
  { key: 'difundir', label: 'Difundir / redes sociales', icon: 'megaphone' },
  { key: 'centro', label: 'Tengo un centro de acopio', icon: 'building' },
];
window.APORTE_MAP = Object.fromEntries(window.APORTES.map(a => [a.key, a]));
