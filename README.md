# AyudaVE 🇻🇪

**Plataforma humanitaria para Venezuela** tras el sismo de La Guaira (24–25 jun 2026).
En vivo: **https://ayudahumanitariavenezuela.com**

AyudaVE reúne, en un solo lugar y en tiempo real, la información dispersa que una familia necesita en la emergencia: **centros de acopio**, **edificios afectados**, **cortes de servicios**, **directorio de emergencia**, **catálogo de insumos** y **réplicas sísmicas** — todo buscable y en un mapa.

La clave del proyecto: **no inventamos datos**. Agregamos y normalizamos fuentes abiertas de otras iniciativas (con atribución), las mantenemos sincronizadas solas. Por protección de las personas, la plataforma **no maneja datos personales**: se enfoca en información no personal de la emergencia.

---

## Documentación

| Documento | Para quién | Contenido |
|---|---|---|
| **[docs/DOCUMENTACION.md](docs/DOCUMENTACION.md)** | Devs | **Documento técnico maestro** (12 capítulos): resumen, funcionalidades, arquitectura, fuentes de datos, modelo de datos, API/endpoints, seguridad, despliegue, escalabilidad, runbook, repo, roadmap. → también en **PDF**. |
| **[docs/INTEGRACIONES.md](docs/INTEGRACIONES.md)** | Devs | **Cómo integrar una nueva API/fuente de otra página** (paso a paso + plantilla). |
| **[docs/DESARROLLO.md](docs/DESARROLLO.md)** | Devs | Correr en local, estructura del código, convenciones, variables de entorno. |
| **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)** | Devs/Ops | Infraestructura, cómo desplegar, escalado, montaje inicial. |
| **[docs/MANUAL-USUARIO.md](docs/MANUAL-USUARIO.md)** | Usuarios | Cómo usar la app (buscar, donar, difundir). → también en **PDF**. |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Devs | Cómo contribuir: setup, reglas (privacidad/secretos), estilo, flujo de PR. |

**PDFs** (en `docs/`): `AyudaVE-Documentacion.pdf` (técnico, con índice + diagrama) y `AyudaVE-Manual-Usuario.pdf`. Se regeneran con `node docs/build-pdfs.js` + Chrome `--print-to-pdf`. Diagrama: `docs/arquitectura.svg`.

> **Nota de seguridad:** esta documentación **no contiene secretos** (contraseñas de base de datos, claves de API, teléfonos de administradores, IDs de facturación). Esos valores viven solo en variables de entorno de producción y en notas privadas (`data/`, fuera del repo).

---

## Qué hace, en una pantalla

- **Centros de acopio** — buscar/filtrar por estado, municipio o parroquia; ver qué necesitan; cómo llegar; contacto directo (WhatsApp/Instagram).
- **Edificios afectados** — daños estructurales con nivel y ubicación.
- **Mapa de la situación** — centros + cortes de servicios + edificios con daños.
- **Directorio de emergencia** — hospitales, bomberos, ambulancias, protección civil.
- **Catálogo de insumos** — referencia de insumos para la respuesta a la emergencia.
- **Recursos** — grupos de WhatsApp/Telegram, bases de datos, galerías (los administra el equipo).
- **Acciones** — donar (insumos, Pago Móvil, transferencia, cripto), registrar/gestionar un centro de acopio.

## Stack en 10 segundos

- **Backend:** Node.js (módulo `http` nativo, **sin framework**), `server.js`.
- **Frontend:** JavaScript **vanilla** (sin build, sin npm en el cliente) en `public/`.
- **Base de datos:** **intercambiable** — SQLite en local, **PostgreSQL** en producción (se elige solo con `DATABASE_URL`).
- **Imágenes:** **intercambiables** — disco en local, **Google Cloud Storage** en producción (`GCS_BUCKET`).
- **Infra:** Google **Cloud Run** (autoescala) + **Cloud SQL** (Postgres) + **Cloud Storage**, detrás de **Cloudflare**.
- **Dependencias:** solo 3 (`pg`, `@google-cloud/storage`, `undici`).

## Arrancar en local (30 segundos)

```bash
npm install
npm start              # http://localhost:4599  (SQLite local, datos reales)
npm run start:demo     # con datos de ejemplo (AYUDAVE_SEED=on)
```

Sin `DATABASE_URL` ni `GCS_BUCKET`, todo corre en local con SQLite + disco. **No necesitas Google Cloud para desarrollar.**

## Para los nuevos devs

Si te uniste para **integrar la API/datos de otra página** (centros, daños, servicios, insumos, etc.), empieza aquí: **[docs/INTEGRACIONES.md](docs/INTEGRACIONES.md)**. En ~30 líneas de un archivo nuevo `import-<fuente>.js` tienes una fuente más, auto-sincronizada y en el mapa.

## Autor y créditos

### Autor
AyudaVE fue creado y es desarrollado por **Gabriel Massarelli**
([@gaboclus](https://x.com/gaboclus)). El proyecto se mantiene y actualiza de forma
continua en este mismo repositorio: https://github.com/gaboclus/ayudave

### Objetivo
Centralizar en un solo lugar la información humanitaria dispersa durante emergencias
en Venezuela, agregando y normalizando fuentes abiertas con atribución.

### Fuentes y plataformas integradas
AyudaVE integra datos de múltiples iniciativas. Cada plataforma o fuente integrada
mantiene su crédito. (Lista de fuentes actuales: por completar.)
Toda nueva integración debe acreditar a su plataforma de origen.

### Contribuidores
Gracias a todas las personas que aportan al proyecto. Las contribuciones quedan
registradas en el historial de Git. Si contribuyes, puedes añadirte a esta sección.

### Licencia
Apache 2.0 (ver LICENSE). Uso, modificación y redistribución libres, conservando la
atribución al autor y a las fuentes integradas (ver NOTICE). Si integras AyudaVE en
otro proyecto, agradezco el crédito y un enlace de vuelta.
