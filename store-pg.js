/* Driver PostgreSQL (producción — Cloud SQL). Misma interfaz async que SQLite.
   Usa DATABASE_URL. En Cloud SQL por socket: postgres://user:pass@/db?host=/cloudsql/INSTANCE */
'use strict';
const { Pool } = require('pg');

const ssl = process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false };
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL || 5), ssl });

// Convierte placeholders '?' (estilo SQLite) a '$1,$2,...' (Postgres)
function conv(sql) { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); }

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS centers (
      id TEXT PRIMARY KEY, name TEXT, status TEXT, estado TEXT, municipio TEXT, parroquia TEXT,
      distance DOUBLE PRECISION, data TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS donations (
      id SERIAL PRIMARY KEY, center_id TEXT, center_name TEXT, estado TEXT, data TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS volunteers (
      id SERIAL PRIMARY KEY, whatsapp TEXT, cedula TEXT, nombre TEXT, data TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY, volunteer_id INTEGER, center_id TEXT, center_name TEXT, task TEXT, status TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS persons (
      id SERIAL PRIMARY KEY, status TEXT, nombre TEXT, estado TEXT, municipio TEXT, data TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS sightings (
      id SERIAL PRIMARY KEY, person_id INTEGER, data TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, phone TEXT UNIQUE, nombre TEXT, apellido TEXT,
      estado TEXT, municipio TEXT, parroquia TEXT, pin_hash TEXT, data TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS metrics (
      k TEXT PRIMARY KEY, v BIGINT );
    CREATE TABLE IF NOT EXISTS visitor_days (
      day TEXT, h TEXT, PRIMARY KEY (day, h) );
    CREATE TABLE IF NOT EXISTS resources (
      id SERIAL PRIMARY KEY, type TEXT, title TEXT, url TEXT, descr TEXT, estado TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS movements (
      id SERIAL PRIMARY KEY, center_id TEXT, type TEXT, data TEXT, created_at BIGINT );
    CREATE INDEX IF NOT EXISTS idx_mov_center ON movements (center_id, created_at);
    CREATE TABLE IF NOT EXISTS directory (
      id TEXT PRIMARY KEY, category TEXT, name TEXT, zona TEXT, estado TEXT, data TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS help_requests (
      id SERIAL PRIMARY KEY, tipo TEXT, nombre TEXT, contacto TEXT,
      estado TEXT, municipio TEXT, urgencia TEXT, status TEXT, data TEXT, created_at BIGINT );
    CREATE TABLE IF NOT EXISTS pets (
      id SERIAL PRIMARY KEY, status TEXT, tipo TEXT, zona TEXT, estado TEXT, data TEXT, created_at BIGINT );
  `);
}
async function get(sql, params = []) { const r = await pool.query(conv(sql), params); return r.rows[0]; }
async function all(sql, params = []) { const r = await pool.query(conv(sql), params); return r.rows; }
async function run(sql, params = []) { const r = await pool.query(conv(sql), params); return { changes: r.rowCount }; }
async function insert(table, obj) {
  const cols = Object.keys(obj);
  const ph = cols.map((_, i) => '$' + (i + 1)).join(',');
  const r = await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph}) RETURNING id`, cols.map(c => obj[c]));
  return r.rows[0].id;
}
module.exports = { kind: 'pg', init, get, all, run, insert };
