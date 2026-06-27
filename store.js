/* Selecciona el motor de base de datos:
   - DATABASE_URL definido  -> PostgreSQL (Cloud SQL, escalable, multi-instancia)
   - si no                  -> SQLite local (desarrollo) */
'use strict';
module.exports = process.env.DATABASE_URL ? require('./store-pg') : require('./store-sqlite');
