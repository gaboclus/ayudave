/* Entrypoint del refresco incremental (Cloud Run Job / cron / CLI).
   Recorre las páginas más nuevas de la fuente (updatedAt desc) e inserta/actualiza
   en la BD del `store` (Postgres en prod vía DATABASE_URL, SQLite en local).
   Suave con la fuente: solo unas pocas páginas, con early-stop al tocar lo ya sincronizado.
   Config por env: REFRESH_PAGES (tope de páginas, def 60), REFRESH_PAGE_SIZE (def 100).
   Uso: node refresh-dtv.js */
'use strict';
const store = require('./store');
const { refreshDtvPersons } = require('./import-dtv');
const { auditPersons } = require('./audit-dtv');

(async () => {
  await store.init();
  const maxPages = Math.max(1, Math.min(Number(process.env.REFRESH_PAGES || 60), 500));
  const pageSize = Math.min(Number(process.env.REFRESH_PAGE_SIZE || 100), 100);
  // REFRESH_STOP_WHEN_CLEAN=off → pasada completa (reconciliación, cierra huecos interiores).
  const stopWhenClean = String(process.env.REFRESH_STOP_WHEN_CLEAN || 'on').toLowerCase() !== 'off';
  const t0 = Date.now();
  console.log(`[refresh] store=${store.kind} maxPages=${maxPages} pageSize=${pageSize} earlyStop=${stopWhenClean}`);
  const res = await refreshDtvPersons(store, { maxPages, pageSize, stopWhenClean, log: m => console.log('[refresh]', m) });
  console.log(`[refresh] LISTO en ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(res));
  // Tras refrescar, re-auditar y marcar duplicados (a menos que AUDIT_ON_REFRESH=off).
  // Throttle: como mucho cada AUDIT_MIN_MINUTES (def 55) para no reescribir miles de
  // filas en cada ciclo de 15 min; la dedup no necesita ser al minuto.
  if (String(process.env.AUDIT_ON_REFRESH || 'on').toLowerCase() !== 'off') {
    const minMs = Math.max(0, Number(process.env.AUDIT_MIN_MINUTES || 55)) * 60000;
    let last = 0; try { last = Number((await store.get("SELECT v FROM metrics WHERE k='audit_at'") || {}).v) || 0; } catch {}
    if (Date.now() - last >= minMs) {
      try { const a = await auditPersons(store, { apply: true, log: m => console.log('[audit]', m) }); console.log('[audit] resumen', JSON.stringify(a)); }
      catch (e) { console.error('[audit] ERROR (no crítico)', e.message); }
    } else { console.log(`[audit] omitido (última hace ${Math.round((Date.now() - last) / 60000)} min)`); }
  }
  process.exit(0);
})().catch(e => { console.error('[refresh] ERROR', e); process.exit(1); });
