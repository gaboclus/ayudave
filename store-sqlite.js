/* Driver SQLite (desarrollo local) — implementa la interfaz async de store. */
'use strict';
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'ayudave.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');

async function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS centers (
      id TEXT PRIMARY KEY, name TEXT, status TEXT, estado TEXT, municipio TEXT, parroquia TEXT,
      distance REAL, data TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, center_id TEXT, center_name TEXT, estado TEXT, data TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, whatsapp TEXT, cedula TEXT, nombre TEXT, data TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, volunteer_id INTEGER, center_id TEXT, center_name TEXT, task TEXT, status TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, nombre TEXT, estado TEXT, municipio TEXT, data TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS sightings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER, data TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, nombre TEXT, apellido TEXT,
      estado TEXT, municipio TEXT, parroquia TEXT, pin_hash TEXT, data TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS metrics (
      k TEXT PRIMARY KEY, v INTEGER );
    CREATE TABLE IF NOT EXISTS visitor_days (
      day TEXT, h TEXT, PRIMARY KEY (day, h) );
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, title TEXT, url TEXT, descr TEXT, estado TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, center_id TEXT, type TEXT, data TEXT, created_at INTEGER );
    CREATE INDEX IF NOT EXISTS idx_mov_center ON movements (center_id, created_at);
    CREATE TABLE IF NOT EXISTS directory (
      id TEXT PRIMARY KEY, category TEXT, name TEXT, zona TEXT, estado TEXT, data TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS help_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, nombre TEXT, contacto TEXT,
      estado TEXT, municipio TEXT, urgencia TEXT, status TEXT, data TEXT, created_at INTEGER );
    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, tipo TEXT, zona TEXT, estado TEXT, data TEXT, created_at INTEGER );
  `);
}
async function get(sql, params = []) { return db.prepare(sql).get(...params); }
async function all(sql, params = []) { return db.prepare(sql).all(...params); }
async function run(sql, params = []) { const i = db.prepare(sql).run(...params); return { changes: i.changes }; }
async function insert(table, obj) {
  const cols = Object.keys(obj);
  const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => obj[c]));
  return Number(info.lastInsertRowid);
}
module.exports = { kind: 'sqlite', init, get, all, run, insert };
