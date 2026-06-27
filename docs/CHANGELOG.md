# Historial de versiones — Documentación AyudaVE

Control de versiones de los manuales (técnico y de usuario). Esquema **MAYOR.MENOR.PARCHE**.
Al editar la documentación: subir la versión en `docs/build-pdfs.js` (`VER`), añadir aquí los cambios y regenerar los PDF (quedan nombrados con su versión, p. ej. `AyudaVE-Documentacion2.0.1.pdf`).

---

## 2.0.1 — Junio 2026

**Documentación para desarrolladores: completada.**

- **Nuevo §2.4 — Roles del usuario, permisos y orientación:** tabla de roles (visitante, registrado, donante, voluntario, transporte, difusión, dueño de centro, admin) con qué puede hacer cada uno, y cómo la app guía a quien **puede ayudar** vs quien **necesita ayuda**.
- **Nuevo §4.1 — Flujo de una fuente de punta a punta** y **§4.2 — Auditoría y depuración de duplicados** (algoritmo completo: normalización, bloques exacto/difuso, union-find, registro canónico, `dup_of`).
- **Nuevo §8.1 — Servidores y capacidad:** Cloud Run (mín 1/máx 100, conc. 80, 1 vCPU, 1 GiB), Cloud SQL (Postgres 16, db-g1-small, 10 GB), Storage, CDN/WAF.
- **Nuevo §3.4 — El frontend por dentro** (SPA, pantallas, cómo añadir una) y **§6.6 — Convenciones de la API** (auth, errores, caché).
- **Nuevo cap. 14 — Apéndice de vocabularios controlados** (enums válidos).
- **Nuevo `CONTRIBUTING.md`** — guía de contribución (setup, reglas, estilo, flujo de PR).
- **Modelo de datos (cap. 5)** ampliado a referencia completa de BD: DDL, contenido del JSON `data` por tabla, relaciones, índices, migraciones.
- **Capturas de pantalla** de las funciones nuevas (cap. 13).
- **Infraestructura:** se **activaron los respaldos automáticos de Cloud SQL** (diarios 03:00 + PITR, 7 retenidos).

## 2.0 — Junio 2026

- **Reescritura completa** de la documentación con estructura profesional (portada + índice + capítulos numerados): resumen, funcionalidades, arquitectura, fuentes de datos (8 integraciones), API/endpoints, seguridad, despliegue, escalabilidad, runbook, repositorio, hoja de ruta.
- **Diagrama** de arquitectura y flujo de datos (`docs/arquitectura.svg`).
- Set modular en `docs/`: DOCUMENTACION, INTEGRACIONES, DESARROLLO, DESPLIEGUE, MANUAL-USUARIO + PDFs.
- **Sin secretos** en la documentación (claves, contraseñas, teléfonos admin, IDs → solo en variables de entorno).

## 1.0 — 25 de junio de 2026

- Primera documentación oficial: resumen ejecutivo, funcionalidades, arquitectura técnica, modelo de datos, API/endpoints, seguridad y privacidad, despliegue en Google Cloud, dominio y DNS, escalabilidad, runbook, hoja de ruta.
