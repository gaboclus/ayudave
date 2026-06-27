/* ============================================================
   AyudaVE · Puente de sincronización (bookmarklet)
   ------------------------------------------------------------
   Corre en el NAVEGADOR de un voluntario en Venezuela, ESTANDO
   en https://desaparecidosterremotovenezuela.com (su origen es
   el que la API de la fuente acepta vía CORS; su IP venezolana
   y su navegador real pasan el geo-bloqueo + WAF de CloudFront).

   Recorre la API pública de la fuente y reenvía cada página al
   endpoint colaborativo de AyudaVE (/api/admin/ingest), que mapea
   y hace upsert idempotente por source_id (no duplica).

   Este archivo es la versión LEGIBLE. La versión "javascript:"
   lista para arrastrar a marcadores se genera en sincronizar.html.

   Sustituye __ENDPOINT__ y __TOKEN__ antes de usar.
   ============================================================ */
(async () => {
  const ENDPOINT = '__ENDPOINT__';   // p.ej. https://ayudahumanitariavenezuela.com/api/admin/ingest
  const TOKEN    = '__TOKEN__';      // AYUDAVE_IMPORT_TOKEN
  const API      = 'https://desaparecidos-terremoto-api.theempire.tech/api';
  const PAGE     = 100;

  // --- mini panel de progreso flotante ---
  const old = document.getElementById('ayudave-sync'); if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'ayudave-sync';
  box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:340px;max-width:90vw;background:#0b1020;color:#e8eefc;font:13px/1.45 system-ui,sans-serif;border:1px solid #2a3a66;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);padding:14px 16px';
  box.innerHTML = '<div style="font-weight:700;margin-bottom:6px">AyudaVE · sincronizando…</div><div id="ayudave-log" style="white-space:pre-wrap;max-height:40vh;overflow:auto"></div>';
  document.body.appendChild(box);
  const logEl = box.querySelector('#ayudave-log');
  const log = m => { logEl.textContent += (logEl.textContent ? '\n' : '') + m; logEl.scrollTop = logEl.scrollHeight; };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let page = 1, totalPages = 1, total = 0, sent = 0;
  try {
    do {
      // 1) leer una página de la fuente (mismo llamado que hace su propio frontend)
      const fr = await fetch(`${API}/personas?page=${page}&pageSize=${PAGE}`, { headers: { Accept: 'application/json' } });
      if (!fr.ok) { log(`✖ La fuente respondió HTTP ${fr.status}. ¿Estás en Venezuela y con la web de la fuente abierta?`); break; }
      const j = await fr.json();
      totalPages = j.totalPages || 1;
      total = j.total || total;
      const items = j.items || [];

      // 2) reenviar a AyudaVE (audita solo en la última página)
      const last = page >= totalPages;
      const url = `${ENDPOINT}?token=${encodeURIComponent(TOKEN)}${last ? '&audit=1' : ''}`;
      const sr = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      if (!sr.ok) { log(`✖ AyudaVE respondió HTTP ${sr.status} (¿token correcto? ¿endpoint público?)`); break; }
      const sj = await sr.json();
      sent += items.length;
      log(`Página ${page}/${totalPages} · enviados ${sent}/${total} · en servidor ${sj.total}${last && sj.audited ? ' · auditado' : ''}`);

      page++;
      await sleep(250); // suave con ambos servidores
    } while (page <= totalPages);

    if (page > totalPages) log('✅ Listo. Sincronización completa, sin duplicados.');
  } catch (e) {
    log('⚠️ ' + (e && e.message || e));
  }
})();
