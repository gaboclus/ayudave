/* Capturas actualizadas (datos reales): personas con métricas, centro con contacto,
   lista con filtro de ubicación, y dashboard. -> docs/shots/p-*.png */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'); const http = require('http');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9355; const APP = 'http://localhost:4599/';
const OUT = '/Users/gabrielmassarelli/Projects/AyudaVE/docs/shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });

const DASH = `App._dash={centers:{total:68,byStatus:[{k:'verificado',c:68}],byEstado:[{k:'Bolívar',c:12},{k:'Distrito Capital',c:11},{k:'Táchira',c:8},{k:'Aragua',c:7},{k:'Zulia',c:7},{k:'Lara',c:5}],topNeeds:[{k:'comida',c:60},{k:'medicinas',c:52},{k:'agua',c:48},{k:'ropa',c:40},{k:'mantas',c:18}]},donations:{total:24,byStatus:[{k:'Reportada',c:14},{k:'Confirmada por el centro',c:10}],byMethod:[{k:'Pago Móvil',c:12},{k:'Cripto (USDT)',c:7},{k:'Transferencia',c:5}]},volunteers:31,applications:12,persons:{total:42211,byStatus:[{k:'desaparecido',c:39071},{k:'encontrado',c:3140}]},users:47,visits:{viewsToday:120,uniqToday:74,viewsTotal:1860,uniqTotal:980}};`;

const SHOTS = [
  ['p-personas.png',  `(async()=>{App.ctx.personFilter='';App.ctx.personQuery='';App._personStats=await API.personStats();await refreshPersons({status:'',q:''});go('persons-list');})()`, 1500],
  ['p-centro-contacto.png', `go('center-public',{id:'imp-2'})`, 1700],
  ['p-centros-filtro.png',  `App.ctx.cfEstado='';App.ctx.cfMunicipio='';go('donate-centers',{all:true,title:'Centros de acopio'})`, 1600],
  ['p-dashboard.png', `localStorage.setItem('ayudave_session',JSON.stringify({id:'me1',nombre:'María',admin:true}));${DASH}go('dashboard')`, 1900],
];

(async () => {
  const ch = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--remote-debugging-port=' + PORT,'--user-data-dir=/tmp/ay-shoot2-' + process.pid, APP], { stdio: 'ignore' });
  let tabs; for (let i = 0; i < 60; i++) { try { tabs = await getJSON('/json/list'); if (tabs.find(t => t.type === 'page')) break; } catch {} await sleep(300); }
  const page = tabs.find(t => t.type === 'page'); const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; }); let id = 0; const pend = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (me, pa) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); return new Promise(r => pend[i] = r); };
  const ev = async x => { const m = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return m.result && m.result.result ? m.result.result.value : undefined; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 920, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: APP }); await sleep(3000);
  for (let i = 0; i < 50; i++) { if (await ev('typeof go') === 'function') break; await sleep(200); }
  for (const [file, setup, wait] of SHOTS) {
    try {
      await ev('try{window.scrollTo(0,0)}catch(e){};' + setup); await sleep(wait); await ev('window.scrollTo(0,0)');
      const full = await ev('Math.ceil(Math.max(document.body.scrollHeight,document.documentElement.scrollHeight))') || 920;
      const h = Math.min(1180, full);  // recorte tipo pantalla (top con lo importante)
      const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 430, height: h, scale: 1 } });
      fs.writeFileSync(OUT + '/' + file, Buffer.from(cap.result.data, 'base64')); console.log('OK', file, h + 'px');
    } catch (e) { console.error('FALLO', file, e.message); }
  }
  ws.close(); ch.kill(); await sleep(300); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
