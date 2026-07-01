# Guía: integrar una nueva fuente / API

> Para los devs que se suman a traer datos de otras páginas (centros, daños, servicios, insumos, refugios, etc.).
> Si traes una API o un dataset de otra iniciativa, este es **todo** lo que necesitas. Una fuente nueva son ~30 líneas + 3 enganches.

## Antes de empezar: 2 reglas

1. **Solo fuentes públicas/abiertas, con permiso o de uso abierto.** APIs documentadas, CSV/Sheets públicos, repos abiertos. **No** scrapear backends privados ni usar claves de otros que no estén pensadas para uso público. Si dudas, pregunta en el equipo.
2. **Sin datos personales.** Por protección de las personas, la plataforma **no maneja información personal**. No integres fuentes de personas ni publiques datos personales de nadie. Trae solo información no personal de la emergencia (centros, daños, servicios, insumos, sismos…).

## Decisión: ¿en memoria o en BD?

| Usa **caché en memoria** si… | Usa **tabla en BD** si… |
|---|---|
| Es solo lectura (no se edita en la app). | Se mezcla con datos creados por usuarios. |
| Cambia seguido y se puede recargar entero. | Necesitas búsqueda/paginación SQL a gran escala. |
| Ej.: edificios, reportes de servicios, sismos, insumos. | Ej.: centros de acopio. |

La mayoría de fuentes nuevas → **en memoria** (más simple). Esta guía cubre ese caso; al final está la variante BD.

---

## Patrón A — fuente en memoria (lo más común)

### Paso 1 — crea `import-mifuente.js`

Copia esta plantilla (es el patrón real de `import-edificios.js` / `import-reportes.js`):

```js
/* ============================================================
   Importador de <QUÉ> desde <FUENTE>.
   - Fuente: <URL pública / repo / doc>
   - Caché en memoria con refresco automático (no toca la BD).
   - Si la fuente falla, conserva la última copia buena.
   PRIVACIDAD: publica solo <campos seguros>; NO <campos sensibles>.
   ============================================================ */
'use strict';

const SOURCE_URL = process.env.MIFUENTE_URL || 'https://ejemplo.com/api/datos';
const SOURCE = 'ejemplo.com';
const TTL = 60 * 60 * 1000;        // refresca como máximo cada 1h

let _cache = [];
let _at = 0;
let _inflight = null;

// Normaliza un registro de la fuente al esquema mínimo y seguro de AyudaVE.
function norm(r) {
  const lat = Number(r.lat), lng = Number(r.lng);
  const hasLL = isFinite(lat) && isFinite(lng) && lat > 0.5 && lat < 12.5 && lng > -73.5 && lng < -59.5; // dentro de Venezuela
  return {
    id: r.id || '',
    name: ('' + (r.nombre || '')).slice(0, 160),
    // ...solo los campos seguros que vas a mostrar...
    lat: hasLL ? lat : null,
    lng: hasLL ? lng : null,
  };
}

async function fetchNow() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'AyudaVE/1.0 (+ayudahumanitariavenezuela.com)', 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('mifuente ' + res.status);
  const j = await res.json();
  const arr = Array.isArray(j) ? j : (j.data || j.items || []);
  const out = arr.map(norm).filter(Boolean);
  if (out.length) { _cache = out; _at = Date.now(); }  // solo reemplaza si llegó algo válido
  return _cache;
}

async function getMiFuente() {
  if (_cache.length && Date.now() - _at < TTL) return _cache;
  if (_inflight) return _inflight;
  _inflight = fetchNow().catch(e => { console.warn('[mifuente]', e.message); return _cache; }).finally(() => { _inflight = null; });
  return _cache.length ? _cache : _inflight;     // si no hay nada aún, espera; si hay, devuelve lo viejo y refresca atrás
}
function primeMiFuente() {
  getMiFuente().then(a => console.log('[mifuente] ' + a.length + ' cargados (' + SOURCE + ')')).catch(() => {});
  setInterval(() => { _at = 0; getMiFuente().catch(() => {}); }, TTL).unref();
}

module.exports = { getMiFuente, primeMiFuente, SOURCE, SOURCE_URL };

/* CLI de prueba: node import-mifuente.js */
if (require.main === module) {
  fetchNow().then(a => { console.log(a.length + ' registros'); console.log(JSON.stringify(a.slice(0, 2), null, 1)); })
    .catch(e => { console.error(e); process.exit(1); });
}
```

### Paso 2 — pruébalo solo (sin tocar nada más)

```bash
node import-mifuente.js
```

Debe imprimir el conteo y 2 registros normalizados. Ajusta `norm()` hasta que salga limpio. **Trabaja siempre la fuente como CLI primero.**

### Paso 3 — engánchalo en `server.js` (3 líneas)

```js
// 1) arriba, con los otros require:
const { getMiFuente, primeMiFuente } = require('./import-mifuente');

// 2) en el objeto de rutas `api`, junto a las otras lecturas públicas:
'GET /api/mifuente': async () => { const items = await getMiFuente(); return { items, count: items.length }; },

// 3) en el arranque (donde se llama primeReportes(), primeEdificios()…):
primeMiFuente();
```

Si la respuesta debe cachearse en el CDN, añade `/api/mifuente` a `isCacheableGet(...)`.

### Paso 4 — frontend (`public/`)

```js
// public/api.js  → dentro de window.API:
mifuente() { return this._get('/mifuente'); },

// public/app.js → una pantalla nueva (mira screens['edificios'] como ejemplo):
screens['mifuente'] = () => { /* lista buscable con tarjetas */ };

// public/app.js → acción para abrirla:
async 'open-mifuente'() { go('mifuente'); try { const d = await API.mifuente(); App._mifuente = d.items; render(); } catch {} },

// public/app.js → una fila en el "Explora" del home:
<button class="strip-row" data-action="open-mifuente">...</button>
```

Si la fuente trae `lat/lng`, añádela también como **capa del mapa** en `screens['map-view']` (mira la capa de `edificios`: un toggle + puntos con color).

### Paso 5 — probar y desplegar

- Local: `npm start`, abre la pantalla, verifica que carga.
- Despliega (ver [DESARROLLO.md](DESARROLLO.md#despliegue)).

¡Listo! Esa fuente ya se auto-actualiza sola.

---

## Patrón B — fuente en BD (idempotente, reconciliable)

Para cuando el dato se mezcla con lo de usuarios (centros) o necesita SQL. Mira **`import-acopio.js`** como referencia. Idea:

- **ID estable derivado del contenido** (`acopio-<hash>`), para que reimportar **actualice en sitio** y no duplique.
- **Upsert** (`INSERT … ON CONFLICT(id) DO UPDATE`).
- **Reconciliación**: borra los registros importados que ya no están en la fuente, **preservando** los creados por usuarios (los que tienen `ownerId`).
- **Salvaguarda**: si la fuente devuelve muy pocos registros (posible caída), **no borres nada**.
- Refresco con candado entre instancias vía la tabla `metrics` (un timestamp), para que solo una instancia importe por intervalo.

---

## Checklist de PR

- [ ] `node import-mifuente.js` imprime datos limpios.
- [ ] `norm()` publica **solo** información no personal (sin datos personales).
- [ ] URL de la fuente configurable por env (`MIFUENTE_URL`).
- [ ] Atribución a la fuente visible en la pantalla.
- [ ] Degradación elegante (si la fuente cae, no se rompe ni se borra data).
- [ ] Endpoint público cacheable si aplica.
- [ ] Probado en local y desplegado.

## Fuentes ya integradas (para copiar el estilo)

- `import-edificios.js` — API REST documentada (LoopBack), paginada → memoria + capa de mapa.
- `import-reportes.js` — API pública JSON con lat/lng → memoria + capa de mapa.
- `import-sismos.js` — GeoJSON de USGS → memoria.
- `import-supplies.js` — API de crisis-logistics.org/ResponseGrid → memoria (catálogo de insumos).
- `import-acopio.js` — Google Sheet (sheet2api) → tabla `centers` con upsert + reconciliación.
- `import-centros-apis.js` — APIs de AcopioVE + ResponseGrid → tabla `centers` con upsert + reconciliación.
