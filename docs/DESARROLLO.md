# Guía de desarrollo

> Cómo correr, estructurar y desplegar AyudaVE. Sin secretos.

## Requisitos

- **Node.js ≥ 22.5** (usa `node:sqlite` nativo).
- Para producción: `gcloud` CLI autenticado con permiso al proyecto (solo quien despliega).

## Correr en local

```bash
npm install
npm start              # http://localhost:4599  — SQLite local + disco, datos reales
npm run start:demo     # AYUDAVE_SEED=on — carga datos de ejemplo (marcados "Ejemplo")
```

Sin `DATABASE_URL` ni `GCS_BUCKET`, todo es local:
- Base de datos → `data/ayudave.db` (SQLite, se crea sola).
- Imágenes → `data/uploads/`.

**No necesitas Google Cloud para desarrollar.** Las fuentes externas se cargan solas al arrancar (verás logs como `[edificios] 800 cargados`).

> Para ser **admin** en local, arranca con `AYUDAVE_ADMINS=+58<tu-numero> npm start` y regístrate en la app con ese número.

## Estructura del repo

```
server.js                 # Backend completo (http + rutas + auth + carga de fuentes)
store.js                  # Elige SQLite/Postgres por DATABASE_URL
store-sqlite.js           # Driver SQLite
store-pg.js               # Driver PostgreSQL
storage.js                # Imágenes: disco o Cloud Storage (GCS_BUCKET)
Dockerfile                # Imagen para Cloud Run

import-*.js               # Una fuente de datos externa por archivo (ver INTEGRACIONES.md)
  import-acopio.js        #   centros de acopio → tabla centers
  import-centros-apis.js  #   centros vía APIs (AcopioVE + ResponseGrid) → tabla centers
  import-supplies.js      #   catálogo de insumos (memoria)
  import-reportes.js      #   cortes de servicios (memoria)
  import-edificios.js     #   edificios afectados (memoria)
  import-directorio.js    #   directorio de emergencia → tabla directory
  import-sismos.js        #   sismos USGS (memoria)

public/                   # Frontend (sin build)
  index.html  app.js  api.js  data.js  geo-ve.js  styles.css  vendor/leaflet/

data/                     # Local: BD SQLite, uploads, notas privadas (gitignored)
docs/                     # Esta documentación
```

## Convenciones

- **Sin build, sin TypeScript.** JS vanilla en cliente y servidor. Edita y recarga.
- **Frontend = `screens`.** Cada pantalla es `screens['nombre'] = (params) => ({ tint, title, html })`. Se navega con `go('nombre', params)`. Las acciones de botones son `data-action="x"` → objeto `actions`.
- **SQL portable.** Placeholders `?` (el driver de Postgres los convierte a `$1,$2…`). Patrón columnas indexables + columna `data` (JSON).
- **Cada fuente externa** es un `import-*.js` autocontenido, con su URL configurable por env y un CLI de prueba (`node import-x.js`).
- **Escapa** el texto libre de usuarios con `esc()` antes de meterlo en HTML; valida URLs (solo http/https).
- **Verifica antes de desplegar:** `node --check <archivo>.js` (sintaxis) y prueba en local.

## Variables de entorno

> **Ninguna se pone en el código.** En local exportas las que necesites; en producción son variables del servicio de Cloud Run. Los **valores secretos** (marcados 🔒) no van en el repo ni en esta doc.

### Núcleo
| Variable | Para qué |
|---|---|
| `PORT` | Puerto. Cloud Run lo inyecta; en local por defecto 4599. |
| `BUILD` | Token de cache-busting de JS/CSS (`?v=BUILD`). Se renueva en cada deploy. |
| `DATABASE_URL` 🔒 | Cadena Postgres. Si está → Postgres; si no → SQLite local. |
| `PGSSL` | `off` cuando se conecta a Cloud SQL por socket. |
| `PG_POOL` | Tamaño del pool de Postgres. |
| `GCS_BUCKET` | Bucket de Cloud Storage para imágenes. Si no está → disco local. |

### App
| Variable | Para qué |
|---|---|
| `AYUDAVE_ADMINS` 🔒 | Teléfonos admin separados por coma (PII; no exponer). |
| `AYUDAVE_GOOGLE_MAPS_KEY` 🔒 | API key de Google Maps (opcional; sin ella usa Leaflet/CARTO). |
| `AYUDAVE_GA_ID` | ID de Google Analytics (opcional). |
| `AYUDAVE_METRICS_SALT` 🔒 | Sal para anonimizar visitantes únicos. |
| `AYUDAVE_SEED` | `on` carga datos de demostración. |

### Fuentes de datos (todas opcionales — tienen valor por defecto en su `import-*.js`)
| Variable | Para qué |
|---|---|
| `ACOPIO_SHEET_URL`, `ACOPIO_IMPORT`, `ACOPIO_REFRESH_MIN` | Centros de acopio: URL del sheet, on/off, intervalo. |
| `REPORTES_URL` | API de reportes de servicios. |
| `EDIF_API` | Base de la API de edificios. |
| `PROD_URL` | URL de producción para scripts que empujan datos. |

## Despliegue

**No hay CI/CD.** Producción se actualiza a mano con un solo comando. Construye la imagen (Cloud Build con el `Dockerfile`) y publica una revisión nueva en Cloud Run.

```bash
gcloud run deploy ayudave \
  --source . --region=us-central1 \
  --update-env-vars "BUILD=$(date +%s)"
```

- **Usa `--update-env-vars`** (solo toca `BUILD`) — **nunca `--set-env-vars`** sin la lista completa, porque reemplazaría todas las variables (DB, bucket, admins…).
- `BUILD=$(date +%s)` renueva el cache-busting para que los navegadores tomen el JS/CSS nuevo.
- No pases `--allow-unauthenticated` (el acceso entra por el balanceador/Cloudflare, no por el `*.run.app` directo).

### Verificar el deploy

Por el **dominio público** (no por el `*.run.app`, que responde 404/403 a propósito):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ayudahumanitariavenezuela.com/healthz   # 200
curl -s https://ayudahumanitariavenezuela.com/ | grep -o 'app.js?v=[0-9]*'                # nuevo BUILD
```

## Pruebas manuales

No hay suite automatizada (proyecto de emergencia). El flujo es:
1. `node --check archivo.js` para sintaxis.
2. `npm start` y probar la pantalla afectada en el navegador (móvil 375px).
3. Para fuentes: `node import-x.js` (CLI) antes de enganchar.
4. Desplegar y verificar por el dominio.
