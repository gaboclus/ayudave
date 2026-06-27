# Despliegue, infraestructura y escalado

> Cómo está montada la producción y cómo se actualiza. **Sin secretos**: los IDs, regiones, contraseñas e IPs reales viven en las variables de entorno del servicio y en notas privadas (`data/`, fuera del repo). Aquí van con marcadores `<...>`.

## Cómo está en producción hoy

AyudaVE corre detrás de **Cloudflare → balanceador HTTPS de Google Cloud (+ CDN + Cloud Armor) → Cloud Run**, con datos en **Cloud SQL (Postgres)** e imágenes en **Cloud Storage**. Es una arquitectura **lectura-intensiva** (mucha gente buscando, poca reportando), así que el CDN absorbe casi todo el tráfico.

```
Cloudflare → LB HTTPS (Cloud CDN + Cloud Armor) → Cloud Run (Node, autoescala 1→N)
                                                      ↘ Cloud SQL (Postgres)
                                                      ↘ Cloud Storage (imágenes)
            + alertas de presupuesto  + monitoreo de uptime
```

> El `*.run.app` directo responde 404/403 a propósito (ingress restringido): el acceso entra **solo por el dominio** vía Cloudflare/LB.

## Día a día: desplegar un cambio

**No hay CI/CD.** Cada cambio se sube a mano con un comando (construye la imagen con Cloud Build + `Dockerfile` y publica una revisión nueva):

```bash
gcloud run deploy ayudave \
  --source . --region=<region> \
  --update-env-vars "BUILD=$(date +%s)"
```

- **`--update-env-vars`** (solo toca `BUILD`). **Nunca `--set-env-vars`** sin la lista completa: borraría todas las variables (DB, bucket, admins…).
- `BUILD=$(date +%s)` renueva el cache-busting (`?v=BUILD`) para que los navegadores tomen el JS/CSS nuevo.

**Verificar** (por el dominio público, no por el `*.run.app`):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ayudahumanitariavenezuela.com/healthz   # 200
curl -s https://ayudahumanitariavenezuela.com/ | grep -o 'app.js?v=[0-9]*'                # nuevo BUILD
```

## Montaje inicial de la infraestructura (una sola vez)

Solo si hay que recrear el entorno desde cero. Comandos `gcloud` con marcadores (rellena con los valores reales, que **no** van en el repo):

**1. Base de datos — Cloud SQL (Postgres)**
```bash
gcloud sql instances create <instancia> --database-version=POSTGRES_16 \
  --tier=db-g1-small --region=<region> --storage-auto-increase --backup
gcloud sql databases create <db> --instance=<instancia>
gcloud sql users create <usuario> --instance=<instancia> --password='<CLAVE-FUERTE>'
```

**2. Imágenes — bucket de Cloud Storage**
```bash
gcloud storage buckets create gs://<bucket> --location=<region> --uniform-bucket-level-access
```

**3. Desplegar a Cloud Run** (conectando Cloud SQL y las variables; ver nombres en [DESARROLLO.md](DESARROLLO.md#variables-de-entorno)):
```bash
gcloud run deploy ayudave --source . --region=<region> \
  --add-cloudsql-instances=<conexion> \
  --min-instances=1 --max-instances=20 --concurrency=80 --cpu=1 --memory=512Mi \
  --set-env-vars="DATABASE_URL=<...>,PGSSL=off,GCS_BUCKET=<bucket>,AYUDAVE_ADMINS=<...>"
```
> La **primera vez** sí se usa `--set-env-vars` con la lista completa. Para actualizaciones posteriores, **siempre `--update-env-vars`**.

**4. CDN + dominio + anti-DDoS** (resumen): balanceador HTTPS externo con **Serverless NEG** → Cloud Run, **Cloud CDN** activado (`--enable-cdn`, `cache-mode=USE_ORIGIN_HEADERS` para respetar nuestros `Cache-Control`), **Cloud Armor** con rate-limit, y el DNS apuntando al balanceador (vía Cloudflare).

**5. Operación**: alertas de presupuesto (50/90/100%) para no quedarse sin créditos, y un *uptime check* sobre `/healthz`.

## Por qué no se cae en un pico

1. **CDN** absorbe el 90%+ del tráfico (estáticos + lecturas públicas cacheadas 10–30 s). Un pico de búsquedas se sirve desde el borde y **no toca la base**.
2. **Cloud Run autoescala** de 1 a N instancias; backend **sin estado** (no usa disco ni SQLite en prod).
3. **Postgres gestionado** con respaldos en vez de un archivo en un disco.
4. **Imágenes en bucket** (no llenan ni dependen del disco del servidor).
5. **Cloud Armor** frena bots/DDoS; **alertas de presupuesto** evitan quedarse sin créditos.
6. Sin **punto único de falla**: si una instancia muere, el resto sigue.

> El código ya tiene todo lo necesario para esto: persistencia intercambiable (SQLite↔Postgres), imágenes intercambiables (disco↔GCS) y `Cache-Control` en las lecturas públicas. No hace falta refactor.

## Antes del próximo evento

- **Prueba de carga** (k6 / Artillery) simulando miles buscando a la vez; confirmar que el autoescalado sube/baja y que el CDN responde `cache HIT`.
- Subir `--max-instances` y el tier de Cloud SQL si la prueba lo pide.
