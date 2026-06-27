# Contribuir a AyudaVE

Gracias por sumarte. Esto es para una **emergencia humanitaria**: priorizamos que las cosas funcionen, sean simples y respeten la privacidad de las personas.

## Empezar (5 min)

```bash
npm install
npm start                 # http://localhost:4599  (SQLite local, sin Google Cloud)
# admin en local:
AYUDAVE_ADMINS=+58<tu-numero> npm start
```
No necesitas Google Cloud para desarrollar. Lee primero `docs/DOCUMENTACION.md` (arquitectura, BD, API) y, si traes datos de otra página, `docs/INTEGRACIONES.md`.

## Reglas de oro

1. **Privacidad primero.** Publica el mínimo útil para reunificación (nombre, zona, hospital, edad). **No** publiques cédula, dirección exacta, diagnósticos ni teléfonos privados. Si un dato sensible sirve para buscar, hazlo **buscable sin devolverlo** (filtra en el server).
2. **Solo fuentes públicas/abiertas** y con atribución. No scrapear backends privados ni usar claves ajenas.
3. **No metas secretos en el repo.** Contraseñas, claves de API, teléfonos admin → variables de entorno (ver `docs/DESARROLLO.md`). Si vas a commitear, revisa que no se cuele nada.
4. **No rompas datos:** usa los valores del Apéndice A (estados, niveles, tipos…).

## Estilo de código

- **JS vanilla, sin build, sin TypeScript.** CommonJS en el server, scripts simples en el cliente. Igual estilo que el archivo que tocas (comillas, indentación, densidad de comentarios).
- **Backend:** todo en `server.js`; rutas en el objeto `api` (`'GET /api/x': fn`). SQL portable (placeholders `?`).
- **Frontend:** una pantalla = `screens['x']`; acciones = `actions['x']`. Escapa texto de usuario con `esc()`. Valida URLs (solo http/https).
- **Fuentes externas:** un `import-<fuente>.js` autocontenido con CLI de prueba (`node import-x.js`) y URL configurable por env.

## Flujo de trabajo

1. Rama desde la principal: `feat/<algo>` o `fix/<algo>`.
2. Cambios pequeños y enfocados. Prueba en local (`npm start`) y con `node --check <archivo>.js`.
3. Para fuentes: prueba el CLI antes de enganchar.
4. PR con descripción de **qué** y **por qué**. Incluye captura si tocaste UI.
5. **No hay CI/CD**: tras *merge*, alguien con acceso despliega a mano (`docs/DESPLIEGUE.md`).

## Checklist de PR

- [ ] Probado en local; `node --check` sin errores.
- [ ] Sin secretos ni PII sensible expuesta.
- [ ] Valores dentro de los vocabularios controlados (Apéndice A de `DOCUMENTACION.md`).
- [ ] Si es fuente nueva: CLI ok, atribución visible, degradación elegante (no rompe si la fuente cae).
- [ ] Endpoint público cacheable si aplica; método en `public/api.js`.

## ¿Dónde está cada cosa?

`server.js` (backend) · `store-*.js` (BD) · `storage.js` (imágenes) · `import-*.js` (fuentes) · `public/` (frontend) · `docs/` (documentación). Mapa completo en `docs/DOCUMENTACION.md` §11.
