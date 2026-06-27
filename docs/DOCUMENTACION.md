# Documentación técnica

> Documento técnico y operativo de AyudaVE. **No contiene secretos** (contraseñas, claves de API, teléfonos de administradores, IDs de facturación): esos valores viven solo en las variables de entorno de producción y en notas privadas fuera del repositorio.

## 1. Resumen ejecutivo

**AyudaVE** es una aplicación web *mobile-first* de coordinación de ayuda humanitaria para Venezuela, creada para responder al **sismo de La Guaira (24–25 de junio de 2026)**, donde la rapidez y la accesibilidad son críticas. En vivo: **ayudahumanitariavenezuela.com**.

| Objetivo | Principios de diseño |
|---|---|
| Reunir en un solo lugar, en tiempo real, la información dispersa que una familia o un voluntario necesita en la emergencia, y conectar a quien necesita ayuda con quien puede darla. | **Sin fricción:** buscar y donar no requieren registro; cuenta solo cuando es imprescindible. **Resistente a picos** de tráfico (no caerse en plena emergencia). **No inventamos datos:** agregamos fuentes abiertas con atribución. **Privacidad primero:** se publica el mínimo útil para reunificación. **Identidad de Venezuela**, neutral, sin colores de partidos. |

**Qué resuelve hoy:** centros de acopio, personas desaparecidas, personas en hospitales, edificios afectados, cortes de servicios, directorio de emergencia y réplicas sísmicas — todo buscable y en un mapa, alimentado por **ocho fuentes externas** que se sincronizan solas.

**Cobertura geográfica:** la base de datos incluye los 24 estados de Venezuela con municipios y parroquias en selectores en cascada; el selector destaca los estados afectados por el sismo.

## 2. Funcionalidades

### 2.1 Buscar información (sin cuenta)
| Módulo | Qué permite |
|---|---|
| **Centros de acopio** | Buscar/filtrar por estado, municipio o parroquia; tabla de conteos por zona; ver necesidades, dirección, cómo llegar y contacto directo (WhatsApp/Instagram). Los que tienen contacto aparecen primero. |
| **Personas desaparecidas** | Registro buscable (desaparecido/encontrado/fallecido) con auditoría de duplicados (se muestra un solo registro por persona). |
| **Personas en hospitales** | Registro buscable para reunificación familiar; búsqueda por nombre y por cédula (sin mostrar la cédula). |
| **Edificios afectados** | Daños estructurales con nivel (parcial/severo/total), estado, ubicación y "cómo llegar". |
| **Mapa de la situación** | Capas combinables: centros, cortes de servicios y edificios con daños. |
| **Directorio de emergencia** | Hospitales, bomberos, ambulancias y protección civil con teléfonos. |
| **Recursos** | Grupos de WhatsApp/Telegram, bases de datos y galerías curadas por el equipo. |
| **Réplicas sísmicas** | Sismos recientes (fuente USGS). |

### 2.2 Dar ayuda
- **Donar:** insumos físicos, Pago Móvil, transferencia bancaria, cripto (USDT/USDC) o fondo general. Donación anónima disponible. Las donaciones son **privadas** (solo el dueño del centro o un admin las ve).
- **Ser voluntario:** registro con habilidades (carro, cargar, médico, etc.) y zona; acceso a tareas de centros que piden voluntarios.
- **Centro de acopio:** panel para gestionar necesidades, inventario, métodos de pago, horario, pedir voluntarios/transporte, registrar **movimientos** logísticos y cerrar el centro.
- **Pedir ayuda:** solicitudes de personas (rescate, insumos, etc.).
- **Reportar:** personas (desaparecida/fallecida/encontrada), avistamientos y mascotas.

### 2.3 Administración / verificación
Rol **Admin/Verificador** para verificar centros, moderar reportes, asignar admins a centros, ver el **panel de logística** y un **dashboard de métricas** (visitas, registros por hora/día, actividad). Se designa por la variable de entorno `AYUDAVE_ADMINS` (o `data/admins.json`).

### 2.4 Roles del usuario, permisos y orientación

**No hay registro obligatorio.** Cualquiera usa lo esencial sin cuenta; el rol aparece solo cuando hace falta guardar algo o gestionar.

| Rol | Cómo se obtiene | Qué puede hacer |
|---|---|---|
| **Visitante (anónimo)** | Sin cuenta | Buscar todo (centros, personas, hospitales, edificios, mapa, directorio); **donar** (incl. anónimo); **reportar** persona/mascota; **pedir ayuda**; difundir. |
| **Usuario registrado** | Teléfono +58 + PIN | Lo anterior + guardar perfil y ver sus reportes. Al registrarse elige **"¿Qué puedes aportar?"** (`aporte`), que define su rol y sus atajos. |
| **Donante** | `aporte` = insumos/dinero | Atajo "Donar a un centro"; métodos de pago de cada centro. |
| **Voluntario** | `aporte` = voluntario | Registra habilidades + zona; ve y se postula a **tareas** de centros; panel de voluntario. |
| **Transporte** | `aporte` = transporte | Atajo "Centros que necesitan transporte". |
| **Difusión** | `aporte` = difundir | Atajo "Ver centros para difundir" + compartir. |
| **Dueño de centro** | `aporte` = centro, o crea un centro | **Panel del centro**: necesidades, inventario, métodos de pago, horario, movimientos logísticos, pedir voluntarios/transporte, cerrar. Solo edita **sus** centros (`ownerId`). |
| **Admin / Verificador** | Variable `AYUDAVE_ADMINS` | Verificar/moderar centros y reportes, asignar admins a centros, panel de logística, dashboard de métricas, gestionar recursos, **auditar duplicados**. |

> Los permisos se **hacen cumplir en el servidor** (no solo en la UI): `ownerId` para centros, rol admin para `/api/admin/*`. Ver capítulo 7.

**Cómo la app orienta al usuario** — dos caminos desde el inicio:

- **Quiero ayudar** (flujo guiado): *ubicación* (`help-location`) → *"¿cómo quieres ayudar?"* (`help-how`, catálogo `HELP_WAYS`: donar insumos / Pago Móvil / cripto, ser voluntario, transporte, difundir, "no sé, muéstrame qué se necesita cerca") → **recomendación de centros en su zona** (`help-reco`, filtra por municipio→estado). El que elige *voluntario* va directo a registrarse como tal.
- **¿Qué puedes aportar?** (al registrarse): el `aporte` se mapea a un **rol** (`roleLabel`) y el inicio muestra **atajos personalizados** (donar, ver tareas, transporte, panel de centro, difundir).
- **Necesito ayuda**: botón **"Solicitar ayuda"** (`help-request` → tabla `help_requests`); o **reportar/buscar** a una persona (desaparecidos) o encontrarla en **hospitales**. Estas vías no requieren cuenta.

En resumen: el usuario **no tiene que entender la estructura** — la app lo lleva, según si **puede ayudar** (y cómo) o **necesita ayuda**, a la acción correcta en uno o dos toques.

## 3. Arquitectura técnica

Diseño deliberadamente **simple y portable**: sin framework de frontend, sin paso de build, y con componentes **intercambiables** que permiten correr igual en local (cero dependencias externas) que en producción gestionada.

| Capa | Tecnología |
|---|---|
| **Backend** | Node.js (módulo `http` nativo, **sin Express**), CommonJS, Node ≥ 22.5 — todo en `server.js`. |
| **Frontend** | SPA *vanilla* JS sin build: router de pantallas en `app.js`, `styles.css`, `index.html`. |
| **Persistencia** | Intercambiable — `node:sqlite` en local / **PostgreSQL** (`pg`) si hay `DATABASE_URL`. |
| **Imágenes** | Intercambiable — disco local / **Google Cloud Storage** si hay `GCS_BUCKET` (servidas vía `/img/`). |
| **Mapa** | Leaflet + tiles CARTO (sin key) por defecto, o Google Maps (con key). |
| **Datos geográficos** | `public/geo-ve.js` — estados, municipios y parroquias. |
| **HTTP** | `undici` para las llamadas a fuentes externas. |
| **Dependencias** | Solo 3: `pg`, `@google-cloud/storage`, `undici`. |

**Patrón de intercambio** — un único punto de decisión elige la implementación según el entorno, sin tocar el resto del código:

```js
// store.js
module.exports = process.env.DATABASE_URL
  ? require('./store-pg')      // producción: PostgreSQL
  : require('./store-sqlite'); // local: node:sqlite

// storage.js → Google Cloud Storage si GCS_BUCKET, si no disco local
```

> **Ventaja:** la misma base de código corre sin dependencias externas en una laptop y, con dos variables de entorno, en infraestructura gestionada escalable. Probado en SQLite y en PostgreSQL real.

El diagrama de arquitectura y flujo de datos está en `docs/arquitectura.svg` (y en la portada de este documento).

### 3.4 El frontend por dentro (cómo añadir una pantalla)

El cliente es una SPA sin framework. Conceptos:

- **Estado global** `App = { stack, current:{screen,params}, ctx, _… }`. `ctx` guarda estado efímero de flujos; `App._x` cachea respuestas de la API (p. ej. `App._edificios`).
- **Pantallas** — un objeto `screens`. Cada pantalla es una función que recibe `params` y devuelve `{ tint, title, html }`:
  ```js
  screens['mi-pantalla'] = (p) => ({ tint: COLORS.center, title: 'Título', html: `…` });
  ```
- **Navegación** — `go('mi-pantalla', params)` apila la actual y renderiza; `back()` vuelve; `home()` resetea; `nav('x', p)` devuelve los atributos `data-go` para un botón. `render()` busca `screens[App.current.screen](params)`, arma el header (inicio vs volver/inicio) y escribe `#root`.
- **Acciones** — los clics se delegan en `document`: un elemento con `data-go="x"` navega; con `data-action="y"` ejecuta `actions['y'](el, event)`; `data-back`/`data-home` también. Los `<select>` usan el listener de `change`.
  ```js
  actions['mi-accion'] = async (t) => { App._x = await API.x(); render(); };
  ```
- **JS post-render** — para montar cosas tras pintar (mapas Leaflet, foco), se usa `setTimeout(() => mount…(), 40)` con un id presente en el `html`.
- **Helpers** — `icon(name)` (SVG de `data.js`), `esc(s)` (escapar texto de usuario), `toast(msg)`, `openSheet()/closeSheet()` (hojas inferiores), `fmtN`, `nav`.
- **Catálogos** — `data.js` define `ICONS`, `NEEDS`, `CENTER_TYPES`, `STATUS_LABELS`, etc. (ver Apéndice A). `geo-ve.js` define `GEO_VE` (estado→municipio→parroquia, selects en cascada).

**Para añadir una pantalla:** define `screens['x']`, enlázala con `nav('x')` o una acción `open-x`, y si lee datos remotos, cárgalos en `App._x` dentro de la acción y llama `render()`. **Sin build:** editas `public/app.js` y recargas; en producción el `?v=BUILD` evita servir versiones viejas.

## 4. Fuentes de datos e integraciones

El corazón del proyecto: AyudaVE **agrega datos de otras iniciativas** (todas públicas/abiertas, con atribución) y los mantiene sincronizados. Cada fuente vive en su módulo `import-*.js`. Hay **dos patrones**:

- **En base de datos** (idempotente, reconciliable): se escribe a una tabla; para datos que se mezclan con lo creado por usuarios o requieren búsqueda en SQL a gran escala.
- **En memoria** (solo lectura, auto-refresco): caché en el proceso con degradación elegante (si la fuente cae, conserva la última copia buena); para datos que cambian seguido y no se editan localmente.

| Módulo | Fuente | Qué trae | Destino | Refresco |
|---|---|---|---|---|
| `import-dtv.js` + `audit-dtv.js` | desaparecidosterremotovenezuela.com (API) | Personas desaparecidas/encontradas | tabla `persons` | Carga + refresco; auditoría de duplicados. |
| `import-acopio.js` | acopiovenezuela.vercel.app (Google Sheet vía sheet2api) | Centros de acopio | tabla `centers` | Auto ~1 h (en el server). |
| `import-ocr-hospitals.js` | repo GitHub abierto (`ecrespo/OCR-…`, CSV) | Pacientes en hospitales | memoria | ~6 h. |
| `import-reportes.js` | reporte-ve / ve.crafter.run (API) | Cortes de luz/agua/medicinas/comida… | memoria | ~1 h. |
| `import-edificios.js` | terremotovenezuela.com (API documentada) | Edificios afectados | memoria | ~1 h. |
| `import-directorio.js` | redayudavenezuela.com | Directorio de emergencia | tabla `directory` | Según fuente. |
| `import-sismos.js` | USGS (earthquake.usgs.gov) | Sismos/réplicas | memoria | Periódico. |

> **Cómo agregar una fuente nueva** (lo que harán los devs que se suman, en ~30 líneas): ver **`docs/INTEGRACIONES.md`**. Reglas: solo fuentes públicas/abiertas y **privacidad mínima** (no publicar cédula, dirección exacta, diagnósticos ni teléfonos privados; si un dato sensible sirve para buscar, hacerlo buscable **sin devolverlo**).

### 4.1 Flujo de una fuente, de punta a punta

`fetch` (con `User-Agent` propio) → `norm()`/`mapRow()` que **normaliza al esquema mínimo y seguro** de AyudaVE → **caché en memoria** o **upsert en BD** → se sirve por un endpoint público cacheable → **auto-refresco** periódico. Si la fuente cae, se conserva la última copia buena (no se rompe ni se borra nada). La URL de cada fuente es configurable por variable de entorno, y cada módulo trae un **CLI de prueba** (`node import-x.js`).

### 4.2 Auditoría y depuración de duplicados (personas)

La fuente de desaparecidos trae **la misma persona publicada muchas veces** (distintos reportantes). `audit-dtv.js` la depura para mostrar **un solo registro por persona** sin perder información:

1. **Alcance:** solo filas de `persons` con `source_id` (las importadas de esa fuente).
2. **Normalización:** nombre en minúsculas, sin acentos ni puntuación. **Clave de nombre** = palabras **ordenadas** (insensible al orden de los apellidos). **Firma difusa** = primeras 3 letras de cada palabra, ordenadas (para agrupar typos).
3. **El teléfono NO agrupa.** Es el del *reportante*: un reportante reporta a varias personas, y a una persona la reportan varios. El teléfono solo **corrobora** dentro del bloque difuso.
4. **Bloque exacto:** misma clave de nombre → se unen, **salvo** que las edades difieran **>10 años** (mismo nombre, personas distintas).
5. **Bloque difuso (typos):** misma firma + **similitud de Levenshtein ≥ 0.9** + edad compatible, y al menos una corroboración: edad casi igual (≤2), mismo teléfono, o **zona compartida**.
6. **Agrupación con union-find**; por grupo se elige el registro **canónico** = el más completo (foto + descripción + teléfono + edad + lugar; desempate: el más antiguo). El resto se marca con **`dup_of` = `source_id` del canónico**.
7. **Resultado:** el listado público filtra `dup_of IS NULL` (un registro por persona); el endpoint `GET /api/audit` reporta los números reales (total, duplicados, únicos, grupos, %, ejemplos).

**Ejecución:** `node audit-dtv.js` (solo audita, no escribe) · `node audit-dtv.js --apply` (marca `dup_of` + guarda `audit_at` en `metrics`). En producción puede correr tras cada refresco (`AUDIT_ON_REFRESH`). Es **idempotente y reversible** (limpia `dup_of` y re-evalúa cada vez).

## 5. Modelo de datos (base de datos)

### 5.1 Filosofía del esquema

- **Una sola base**, SQLite (local) o PostgreSQL (producción), con el **mismo esquema**. No hay ORM: SQL directo y portable.
- **Patrón "columnas indexables + `data` JSON"**: cada tabla tiene unas pocas columnas para filtrar/ordenar/unir (id, estado, status, created_at…) y una columna **`data` (TEXT)** con el **objeto completo serializado en JSON**. Los campos del JSON se documentan abajo por tabla.
- **Por qué:** flexibilidad (los objetos evolucionan sin migraciones constantes) + rendimiento donde importa (los `WHERE`/`ORDER BY` van sobre columnas reales, no sobre el JSON).
- **`created_at`**: epoch en **milisegundos** (`Date.now()`). En Postgres es `BIGINT`; en SQLite `INTEGER`.

### 5.2 La capa `store`

`store.js` elige el driver por entorno y expone una **interfaz async común**; el resto del código no sabe qué motor hay debajo:

```js
// interfaz (store-sqlite.js / store-pg.js)
{ kind, init(), get(sql, params), all(sql, params), run(sql, params), insert(table, obj) }
```

- **Placeholders portables:** se escribe `?` siempre; el driver de Postgres los convierte a `$1,$2,…`.
- `insert(table, obj)` arma el `INSERT` a partir de las claves del objeto y devuelve el id.
- `init()` crea el esquema (idempotente, `CREATE TABLE IF NOT EXISTS`) y los índices.
- `get` → una fila · `all` → filas · `run` → `{ changes }`.

Ejemplo de upsert idempotente (usado por los importadores en BD):
```sql
INSERT INTO centers (id,name,status,estado,…,data,created_at) VALUES (?,?,?,?,…,?,?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, status=excluded.status, …, data=excluded.data;
```

### 5.3 Tablas

**15 tablas.** Para cada una: columnas (las indexables) y, cuando aplica, el contenido del JSON `data`.

**`centers`** — centros de acopio (importados + creados por usuarios).
Columnas: `id TEXT PK, name, status, estado, municipio, parroquia, distance, data, created_at`.
`data`: `{ name, type, status, estado, municipio, parroquia, address, reference, coords:{lat,lng}, needs:[{key,level}], needsText, accepts:[], notAccepts:[], horario, responsable, responsableApellido, whatsapp, phones:[], instagram, contacto, foto, crypto:[{red,wallet}], inventory:[{key,label,qty}], stats:{reportadas,confirmadas,entregadas,voluntarios}, updates:[{type,text,date}], pagomovil:{...}, transferencia:{...}, source, imported, ownerId, ownerPhone }`.
> `ownerId`/`ownerPhone` son privados: se ocultan en la lectura pública (`publicCenter`).

**`persons`** — personas reportadas (desaparecida/encontrada/fallecida).
Columnas: `id PK, status, nombre, estado, municipio, data, created_at` (+ migradas: `source_id`, `dup_of`).
`data`: `{ status, nombre, apellido, edad, sexo, estado, municipio, parroquia, lugar, fecha, descripcion, contactoNombre, contactoTel, relacion, foto, source, sourceId, sourceUpdatedAt, localizado:{por,contacto,relacion,nota} }`.

**`sightings`** — avistamientos/pistas sobre una persona. Columnas: `id PK, person_id → persons.id, data, created_at`. `data`: `{ lugar, detalle, contacto, date }`.

**`donations`** — donaciones a un centro o al fondo general (privadas). Columnas: `id PK, center_id → centers.id, center_name, estado (=estado de la donación), data, created_at`. `data`: el reporte (monto, método, donante/anónimo, comprobante, banco, etc.).

**`volunteers`** — voluntarios. Columnas: `id PK, whatsapp, cedula, nombre, data, created_at`. `data`: `{ nombre, apellido, cedula, whatsapp, estado, municipio, parroquia, disp, veh, mov, skills:[], foto }`.

**`applications`** — postulaciones de voluntarios a tareas. Columnas (sin `data`): `id PK, volunteer_id → volunteers.id, center_id → centers.id, center_name, task, status`.

**`users`** — cuentas. Columnas: `id PK, phone (ÚNICO), nombre, apellido, estado, municipio, parroquia, pin_hash, data, created_at`. `pin_hash` = `scrypt$sal$hash`. `data`: perfil (incl. `aporte`).

**`sessions`** — tokens de sesión. Columnas: `token PK, user_id → users.id, created_at`.

**`movements`** — movimientos logísticos de un centro. Columnas: `id PK, center_id → centers.id, type, data, created_at`. (Índice `idx_mov_center`.)

**`directory`** — directorio de emergencia. Columnas: `id TEXT PK, category, name, zona, estado, data, created_at`. `data`: `{ name, category, phones, zona, estado, notes }`.

**`help_requests`** — solicitudes de ayuda. Columnas: `id PK, tipo, nombre, contacto, estado, municipio, urgencia, status, data, created_at`.

**`pets`** — reportes de mascotas. Columnas: `id PK, status, tipo, zona, estado, data, created_at`. `data`: `{ status, tipo, nombre, descripcion, foto, estado, municipio, parroquia, lugar, destino, contacto, whatsapp }`.

**`resources`** — recursos compartidos (sin `data`): `id PK, type, title, url, descr, estado, created_at`.

**`metrics`** — contadores clave→valor: `k PK, v`. Usos: `views_total`, `uniq_<día>`, `vd_<día>`/`vh_<hora>` (series), banderas de seed, `acopio_refreshed_at` (candado de refresco).

**`visitor_days`** — visitantes únicos por día: `day, h` (PK compuesta). `h` = hash anónimo diario de IP+UA+sal; **la IP no se guarda**.

### 5.4 Relaciones

```
centers 1───* donations          (donations.center_id)
centers 1───* movements          (movements.center_id)
centers 1───* applications        (applications.center_id)
volunteers 1─* applications        (applications.volunteer_id)
persons 1───* sightings           (sightings.person_id)
persons 0───1 persons             (persons.dup_of → persona "canónica")
users   1───* sessions            (sessions.user_id)
```
No hay claves foráneas declaradas (SQL portable, sin `FK`): la integridad se mantiene en la aplicación.

### 5.5 Índices

`CREATE INDEX idx_mov_center ON movements (center_id, created_at)` — listar movimientos de un centro. `users.phone` y `sessions.token` son únicos/PK. Las lecturas grandes (personas) se paginan en SQL.

### 5.6 Migraciones y evolución

No hay archivos de migración ni herramienta de migraciones. El esquema evoluciona así:
- **Tablas nuevas:** se agregan a `init()` con `CREATE TABLE IF NOT EXISTS` (corre en cada arranque, idempotente).
- **Columnas nuevas en tablas existentes:** funciones `ensure…Columns(store)` que hacen `ALTER TABLE … ADD COLUMN` dentro de `try/catch` (si ya existe, no pasa nada). Ejemplos: `import-dtv.js` agrega `persons.source_id`; `audit-dtv.js` agrega `persons.dup_of`.
- **Datos de fuentes externas:** *upsert* idempotente por id estable + reconciliación (ver `INTEGRACIONES.md`).

### 5.7 Consultar y mapear

Las filas se convierten a objetos con *mappers* `o…()` que parsean `data` y le pegan las columnas (`oCenter`, `oPerson`, `oDon`, `oUser`, …). Ejemplo:
```js
const oCenter = r => { const o = JSON.parse(r.data); o.id = r.id; return o; };
const centros = (await store.all('SELECT * FROM centers WHERE estado=?', ['Lara'])).map(oCenter);
```

> **Privacidad en la BD:** la cédula (voluntarios) y datos de dueño de centro existen en la BD pero **no** se devuelven en lecturas públicas; en hospitales (memoria) la cédula es **buscable sin devolverse**. Ver capítulo 7.

> Las fuentes externas en **memoria** (hospitales OCR, reportes de servicios, edificios, sismos) **no** usan tabla: mantienen la BD liviana y evitan escribir datos de solo lectura que cambian seguido.

## 6. API / Endpoints

API REST servida bajo `/api/`. Las lecturas públicas (centros, personas, hospitales, edificios, reportes, métricas…) son cacheables por el CDN. Las acciones requieren sesión (token Bearer); los endpoints `/api/admin/*` requieren rol admin.

### 6.1 Centros y logística
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/centers` | Listar centros (público; oculta datos del dueño). |
| GET | `/api/centers/:id` | Detalle de un centro. |
| GET | `/api/centers/mine` | Centros del usuario autenticado. |
| POST | `/api/centers` | Crear centro (sesión). |
| PATCH | `/api/centers/:id` | Editar centro (dueño/admin). |
| POST | `/api/centers/:id/updates` | Publicar actualización en el hilo. |
| GET/POST | `/api/centers/:id/movements` | Movimientos logísticos del centro. |
| POST | `/api/movements/:id/estado` | Cambiar estado de un movimiento. |

### 6.2 Donaciones, voluntarios, postulaciones
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/donations` | Listar donaciones (privado: dueño/admin). |
| POST | `/api/donations` | Registrar donación (anónima permitida). |
| PATCH | `/api/donations/:id` | Actualizar estado de donación. |
| POST | `/api/volunteers` | Registrar voluntario. |
| GET | `/api/volunteers/lookup` | Buscar perfil de voluntario. |
| PATCH | `/api/volunteers/:id` | Actualizar voluntario. |
| GET/POST | `/api/applications` | Listar / crear postulaciones. |

### 6.3 Personas, avistamientos, mascotas, ayuda
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/persons` | Listar personas (público, cacheable, paginado). |
| GET | `/api/persons/:id` | Detalle de una persona. |
| GET | `/api/persons/stats` | Conteos por estado. |
| POST | `/api/persons` | Crear reporte de persona. |
| PATCH | `/api/persons/:id` | Actualizar reporte. |
| POST | `/api/persons/:id/sightings` | Registrar avistamiento. |
| GET/POST/PATCH | `/api/pets` · `/api/pets/:id` | Reportes de mascotas. |
| GET/POST/PATCH | `/api/help-requests` · `/api/help-requests/:id` | Solicitudes de ayuda. |

### 6.4 Fuentes agregadas (solo lectura, cacheables)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/hospitals` · `/api/hospitals/summary` | Personas en hospitales (búsqueda + resumen). |
| GET | `/api/edificios` | Edificios afectados. |
| GET | `/api/reportes` | Cortes de servicios. |
| GET | `/api/sismos` | Réplicas sísmicas. |
| GET | `/api/directorio` | Directorio de emergencia. |
| GET | `/api/resources` | Recursos compartidos. |
| GET | `/api/audit` | Resumen de auditoría de duplicados. |

### 6.5 Cuentas, admin y utilidades
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/users/check` | ¿Teléfono ya registrado? |
| POST | `/api/users` · `/api/users/login` | Registrar / iniciar sesión (token). |
| PATCH | `/api/users/:id` | Actualizar perfil. |
| GET | `/api/admin/overview` · `/api/admin/dashboard` · `/api/admin/logistics` | Paneles de admin. |
| POST | `/api/admin/centers/:id` · `/api/admin/centers/:id/assign` | Verificar/moderar/asignar centro. |
| POST | `/api/admin/persons/:id` | Moderar reporte. |
| POST | `/api/resources` · `/api/admin/resources/:id/delete` | Crear/borrar recurso (admin). |
| GET | `/api/config` | Configuración pública (p. ej. key de mapa). |
| POST | `/api/upload` | Subir imagen. |
| GET | `/healthz` | Chequeo de salud (`{"ok":true}`). |

> Los endpoints de importación masiva (`/api/admin/import-*`, `/api/admin/ingest`) están **protegidos por token** y normalmente **desactivados**.

### 6.6 Convenciones de la API

- **Formato:** JSON en petición y respuesta. Las rutas se registran en un objeto `{ 'GET /api/centers': fn, … }` con un *dispatcher* simple (sin framework). Los parámetros de ruta (`:id`) y de query llegan a la función.
- **Autenticación:** header `Authorization: Bearer <token>`. El token se obtiene de `POST /api/users/login` y el cliente lo guarda en `localStorage` (`ayudave_session`). `authUser(req)` resuelve el usuario; los `/api/admin/*` exigen `user.admin`.
- **Errores:** se lanzan con `err(code, msg)` y se serializan como `{ "error": "<mensaje>" }` con el código HTTP correspondiente (`400` validación, `401` sin sesión, `403` sin permiso, `404` no existe, `429` rate-limit).
- **Caché:** las lecturas públicas llevan `Cache-Control` corto (10–30 s) para el CDN; las que requieren `Authorization` no se cachean. La función `isCacheableGet(pathname)` define cuáles.
- **Subida de imágenes:** `POST /api/upload` recibe un data-URL y devuelve `{ url }` (disco o Cloud Storage según entorno).
- **Cliente:** todo pasa por `window.API` (en `public/api.js`); añade ahí un método por cada endpoint nuevo.

## 7. Seguridad y privacidad

| Medida | Implementación |
|---|---|
| **Autenticación** | Teléfono +58 + PIN de 4 dígitos. PIN cifrado con **scrypt + sal + pepper** (irrecuperable). Sesión por token (`Authorization: Bearer`). |
| **Normalización de teléfono** | El 0 inicial es indiferente: `0414…`, `414…`, `+58414…` = el mismo número. |
| **Propiedad de centros** | Cada centro tiene `ownerId`; crear/editar/confirmar requiere ser dueño o admin. |
| **Privacidad de donaciones** | `GET /api/donations` no es público: solo dueño o admin. |
| **Exposición mínima** | Las lecturas públicas de centros ocultan `ownerId`/`ownerPhone`. |
| **Contenido de usuarios** | URLs validadas (solo http/https; se bloquea `javascript:`/`data:`); HTML escapado en texto libre. |
| **Endurecimiento HTTP** | CSP estricta, rate-limit por IP, bloqueo por intentos de login. |
| **Integridad de assets** | Cache-busting `?v=BUILD`: nunca se sirven versiones obsoletas tras un deploy. |
| **Borde / red** | Cloud Armor (WAF + rate-limit) y CDN delante del servicio. |
| **Visitas anónimas** | Contador con hash diario de IP+UA + sal; **no se guarda la IP**. |

**Privacidad de datos personales (postura del proyecto):** de registros de personas se publica el **mínimo útil para encontrar a alguien** (nombre, hospital/zona, edad, estado). **No** se publican cédula, dirección/domicilio, diagnósticos médicos ni N° de historia. Cuando un dato sensible sirve para buscar (p. ej. la cédula), se hace **buscable del lado del servidor sin devolverlo**.

## 8. Despliegue e infraestructura

Arquitectura *serverless* y gestionada para escalar ante picos. Descrita por **tipo de servicio** (los identificadores, regiones, IPs y secretos reales no van en el repo):

| Capa | Servicio | Rol |
|---|---|---|
| CDN / WAF | **Cloudflare** + Balanceador HTTPS de Google Cloud (+ Cloud Armor) | TLS, caché de borde, anti-DDoS, rate-limit. |
| Cómputo | **Google Cloud Run** | Contenedor Node; **autoescala** 1→N. |
| Base de datos | **Cloud SQL (PostgreSQL)** | Persistencia gestionada con respaldos. |
| Imágenes | **Cloud Storage** | Fotos subidas por usuarios. |
| Build/Deploy | **Cloud Build** (`gcloud run deploy --source .`) | Construye la imagen con el `Dockerfile`. **No hay CI/CD**: deploy manual. |

### 8.1 Servidores y capacidad

Configuración actual (sizing, no secretos):

| Recurso | Configuración | Capacidad |
|---|---|---|
| **Cloud Run** (cómputo) | región `us-central1`; **mín. 1 / máx. 100** instancias; **concurrencia 80** req/instancia; **1 vCPU**, **1 GiB** RAM por instancia | ~hasta **8.000** peticiones simultáneas (100 × 80) antes de encolar; el CDN absorbe el grueso. `mín 1` evita arranques en frío. |
| **Cloud SQL** (base de datos) | PostgreSQL **16**, tier **`db-g1-small`** (1 vCPU compartida, ~1.7 GB RAM), disco **10 GB** con auto-incremento, disponibilidad **zonal**. **Respaldos automáticos diarios (03:00) + recuperación a un punto en el tiempo (PITR), 7 retenidos.** | Suficiente para la carga actual (lectura-intensiva + CDN). Escala subiendo el tier / agregando réplica de lectura si una prueba de carga lo pide. |
| **Cloud Storage** (imágenes) | bucket privado, servido vía `/img/` | Prácticamente ilimitado. |
| **CDN / WAF** | Cloudflare + Cloud Armor (+ Cloud CDN) | Absorbe el 90%+ del tráfico en el borde. |

### 8.2 Desplegar un cambio

(renueva el cache-busting; nunca usar `--set-env-vars` sin la lista completa):
```bash
gcloud run deploy ayudave --source . --region=<region> --update-env-vars "BUILD=$(date +%s)"
```
**Verificar** (por el dominio público, no por el `*.run.app`):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ayudahumanitariavenezuela.com/healthz   # 200
```
Detalle de montaje inicial de infraestructura y variables de entorno: ver `docs/DESPLIEGUE.md`.

## 9. Escalabilidad y alta disponibilidad

AyudaVE es **lectura-intensiva** (mucha gente buscando, poca reportando), lo que se defiende muy bien con CDN + caché. **Regla de oro:** el tráfico nunca llega directo a un solo servidor; pasa por CDN → balanceador → instancias sin estado → base gestionada.

1. **CDN** absorbe el 90%+ del tráfico (estáticos + lecturas públicas cacheadas 10–30 s): un pico de búsquedas se sirve desde el borde y **no toca la base**.
2. **Cloud Run autoescala** 1→N; backend **sin estado** (no usa disco ni SQLite en prod).
3. **Postgres gestionado** con respaldos en vez de un archivo en disco.
4. **Imágenes en bucket** (no llenan ni dependen del disco del servidor).
5. **Cloud Armor** frena bots/DDoS; **alertas de presupuesto** evitan quedarse sin créditos.
6. Sin **punto único de falla**: si una instancia muere, el resto sigue.

> Antes del próximo evento: prueba de carga (k6/Artillery) y confirmar `cache HIT` en el CDN. Subir `--max-instances` y el tier de Cloud SQL si hace falta.

## 10. Operación (runbook)

| Situación | Acción |
|---|---|
| **Desplegar** | `gcloud run deploy …` (cap. 8). Verificar `/healthz` y el nuevo `?v=BUILD` por el dominio. |
| **Una fuente externa no actualiza** | Probar su CLI: `node import-<fuente>.js`. Si la fuente cambió de formato, ajustar el `norm()` del módulo. La caché conserva la última copia buena, así que no se rompe la app. |
| **Designar un admin** | Añadir el teléfono a la variable `AYUDAVE_ADMINS` (no en código) y redesplegar. |
| **Pico de tráfico** | Cloud Run autoescala solo; si se queda corto, subir `--max-instances`. El CDN absorbe lo demás. |
| **Revisar duplicados de personas** | Endpoint `/api/audit` y pantalla de auditoría (admin). |
| **Métricas / difusión** | Dashboard de admin (visitas por hora/día, registros, actividad). |
| **Quedarse sin créditos** | Alertas de presupuesto (50/90/100%). |

## 11. Estructura del repositorio

```
server.js                 Backend completo (http + rutas + auth + carga de fuentes)
store.js / store-sqlite.js / store-pg.js   Persistencia intercambiable
storage.js                Imágenes: disco o Cloud Storage
Dockerfile                Imagen para Cloud Run
import-*.js               Una fuente de datos externa por archivo (8 fuentes)
audit-dtv.js              Auditoría de duplicados de personas
refresh-dtv.js            Refresco incremental de personas (job/cron/CLI)

public/                   Frontend (sin build)
  index.html app.js api.js data.js geo-ve.js styles.css vendor/leaflet/

data/                     Local: BD SQLite, uploads, notas privadas (gitignored)
docs/                     Documentación (este set) + diagrama + generador de PDFs
```

## 12. Hoja de ruta y pendientes

- **Más fuentes** integradas por los devs que se suman (refugios, agua potable, rutas seguras, etc.) — patrón en `INTEGRACIONES.md`.
- **Reportar a fuentes** que lo permitan (p. ej. la API de edificios acepta `POST` de reportes): contribuir de vuelta, no solo consumir.
- **Alta disponibilidad de la BD:** Cloud SQL está en modo **zonal**; evaluar pasar a **regional** (HA) para un evento grande. (Los respaldos automáticos + PITR **ya están activos** — §8.1.)
- **Login por código** (WhatsApp/SMS) como alternativa al PIN.
- **Optimizaciones**: el escudo SVG pesa ~1.6 MB (optimizable); `npm audit` reporta vulnerabilidades moderadas en dependencias transitivas del SDK de Google Cloud Storage (riesgo bajo; se resuelven cuando Google actualice su SDK).

## 13. Capturas de pantalla

Pantallas principales de las funciones nuevas (con **datos de ejemplo**, sin información personal real). Las capturas se regeneran con `node docs/shoot-nuevas.js`.

SHOTS_GALLERY_PLACEHOLDER

## 14. Apéndice: vocabularios controlados

Valores válidos que usa la app (definidos en `public/data.js` y en los importadores). **Respétalos** al crear/normalizar datos para no romper los filtros, badges ni el mapa.

| Campo | Valores |
|---|---|
| **Centro · `status`** | `verificado`, `verificado-basico`, `verificado-operativo`, `pendiente`, `sospechoso`, `cerrado` |
| **Centro · `type`** | Iglesia, Universidad, Fundación, ONG, Alcaldía, Condominio, Comunidad, Consejo comunal, Comuna, Voluntariado, Empresa privada, Otro |
| **Centro · `accepts[]`** | `fisico`, `pagomovil`, `transferencia`, `cripto`, `voluntarios`, `transporte` |
| **Necesidad · `key`** | `agua`, `comida`, `medicinas`, `primeros-auxilios`, `gasas`, `ropa`, `mantas`, `panales`, `formula`, `linternas`, `baterias`, `powerbanks`, `herramientas`, `transporte`, `gasolina`, `voluntarios`, `pagomovil`, `cripto` |
| **Necesidad · `level`** | `critica`, `alta`, `media`, `baja` |
| **Persona · `status`** | `desaparecido`, `encontrado`, `fallecido` |
| **Donación · estado** | Reportada, Pendiente de confirmar, Confirmada por el centro, Usada para compra, Entregada, Evidenciada |
| **Edificio · `damage`** | `parcial`, `severo`, `total` |
| **Recurso · `type`** | `whatsapp`, `telegram`, `database`, `image`, `video`, `link` |
| **Mascota · `status`** | `perdida`, `encontrada`, `refugio`, `veterinario` |
| **Aporte del usuario** | `insumos`, `dinero`, `voluntario`, `transporte`, `difundir`, `centro` |
| **Geografía** | Estados/municipios/parroquias de `geo-ve.js`; teléfonos normalizados a `+58…` |

> Íconos: catálogo `ICONS` en `data.js` (línea, 24×24, `currentColor`); úsalos con `icon('nombre')`.

## 15. Historial de versiones

Control de versiones de esta documentación. La versión y la fecha aparecen también en la portada. Historial completo en `docs/CHANGELOG.md`.

| Versión | Fecha | Cambios principales |
|---|---|---|
| **2.0.1** | Jun 2026 | **Roles, permisos y orientación del usuario** (§2.4); **auditoría de duplicados** de personas (§4.2); **servidores y capacidad** (§8.1) + **respaldos de Cloud SQL activados** (PITR diario); **el frontend por dentro** (§3.4); **convenciones de la API** (§6.6); **apéndice de vocabularios** (cap. 14); **guía de contribución** (`CONTRIBUTING.md`). Modelo de datos (cap. 5) ampliado a referencia completa de BD; capturas de las funciones nuevas (cap. 13). |
| **2.0** | Jun 2026 | Reescritura completa con estructura profesional (índice + capítulos): arquitectura, **8 fuentes de datos**, API/endpoints, seguridad, despliegue, escalabilidad, runbook. Diagrama `arquitectura.svg`. Set en `docs/` sin secretos. |
| **1.0** | 25 jun 2026 | Primera documentación oficial (resumen, funcionalidades, arquitectura, modelo de datos, API, seguridad, despliegue, DNS, escalabilidad, runbook). |

---

*AyudaVE — iniciativa sin fines de lucro · ayudahumanitariavenezuela.com · v2.0.1*
