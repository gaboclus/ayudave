/* Capturas de las FUNCIONES NUEVAS del SPA AyudaVE (server local :4599) vía Chrome DevTools.
   Inyecta datos de EJEMPLO (sin PII real) para ilustrar la documentación. */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const APP = 'http://localhost:4599/';
const OUT = __dirname + '/shots-nuevas';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });

// ---- datos de ejemplo (nombres ficticios) ----
const DATA = `
window.__m = { centers:{total:179}, hospitals:{total:4250}, persons:{total:25040,desaparecidos:22936,encontrados:2104}, edificios:{total:803}, volunteers:120 };
window.__centers = [
 {id:'c1',name:'Fundación Manos a Caracas',type:'Fundación',status:'verificado',estado:'Distrito Capital',municipio:'Caracas',parroquia:'Chacao',address:'Av. Francisco de Miranda, C.C. El Parque',whatsapp:'584141234567',instagram:'',needs:[{key:'agua',level:'critica'},{key:'medicinas',level:'alta'}],accepts:['fisico']},
 {id:'c2',name:'Comando Con Venezuela',type:'Comunidad',status:'verificado',estado:'Bolívar',municipio:'Caroní',parroquia:'',address:'Av. Las Américas, Puerto Ordaz',whatsapp:'',instagram:'https://instagram.com/ejemplo',needs:[{key:'comida',level:'alta'},{key:'ropa',level:'media'}],accepts:['fisico']},
 {id:'c3',name:'Voluntariado Higea',type:'Voluntariado',status:'verificado',estado:'Lara',municipio:'Iribarren',parroquia:'',address:'Barquisimeto, entrada El Pedregal',whatsapp:'584249990000',instagram:'',needs:[{key:'medicinas',level:'alta'}],accepts:['fisico']},
 {id:'c4',name:'Colegio Las Colinas',type:'Universidad',status:'verificado',estado:'Lara',municipio:'Palavecino',parroquia:'',address:'Cabudare',whatsapp:'',instagram:'',needs:[{key:'comida',level:'media'}],accepts:['fisico']},
 {id:'c5',name:'Cámara de Comercio',type:'Empresa privada',status:'verificado',estado:'Zulia',municipio:'Maracaibo',parroquia:'',address:'Av. Bella Vista',whatsapp:'584260001122',instagram:'',needs:[{key:'agua',level:'alta'},{key:'panales',level:'media'}],accepts:['fisico']},
 {id:'c6',name:'Iglesia San José',type:'Iglesia',status:'verificado',estado:'Aragua',municipio:'Girardot',parroquia:'',address:'Maracay centro',whatsapp:'',instagram:'',needs:[{key:'comida',level:'alta'}],accepts:['fisico']},
 {id:'c7',name:'Refugio Anzoátegui',type:'Comunidad',status:'verificado',estado:'Anzoátegui',municipio:'Sotillo',parroquia:'',address:'Puerto La Cruz',whatsapp:'584140002233',instagram:'',needs:[{key:'agua',level:'critica'}],accepts:['fisico']},
 {id:'c8',name:'Comando Táchira',type:'Comunidad',status:'verificado',estado:'Táchira',municipio:'San Cristóbal',parroquia:'',address:'Pueblo Nuevo',whatsapp:'',instagram:'',needs:[{key:'medicinas',level:'media'}],accepts:['fisico']},
 {id:'c9',name:'Centro Distrito Capital',type:'ONG',status:'verificado',estado:'Distrito Capital',municipio:'Caracas',parroquia:'El Valle',address:'Av. Intercomunal',whatsapp:'584141239876',instagram:'',needs:[{key:'ropa',level:'alta'}],accepts:['fisico']}
];
window.__hospSummary = { total:4250, hospitales:17, source:'https://github.com/ecrespo/OCR-data_Terremoto_Venezuela_24062026',
 byHospital:[{hospital:'Hospital Pérez Carreño',count:156},{hospital:'Hospital Domingo Luciani',count:127},{hospital:'Seguro Social La Guaira',count:131},{hospital:'Clínica El Ávila',count:34}] };
window.__hospItems = { matched:4250, items:[
  {nombre:'García Pedro',hospital:'Hospital Pérez Carreño',edad:45,zona:'Catia'},
  {nombre:'Rodríguez Ana',hospital:'Hospital Domingo Luciani',edad:30,zona:'Petare'},
  {nombre:'Martínez Luis',hospital:'Seguro Social La Guaira',edad:62,zona:'Maiquetía'},
  {nombre:'Pérez María',hospital:'Clínica El Ávila',edad:8,zona:'Chacao'},
  {nombre:'Sánchez Carlos',hospital:'Hospital Pérez Carreño',edad:51,zona:'La Vega'}
 ] };
window.__edif = [
 {id:'e1',name:'Residencia Ejemplo I',city:'Caracas',zone:'La Candelaria',address:'Av. Urdaneta',damage:'parcial',status:'verificado',notes:'Grietas en paredes internas y parte de la fachada.',lat:10.5,lng:-66.9,missing:false,photos:[]},
 {id:'e2',name:'Edificio Ejemplo II',city:'La Guaira',zone:'Maiquetía',address:'Calle Real',damage:'total',status:'en_revision',notes:'Colapso parcial reportado en coberturas de medios.',lat:10.6,lng:-66.97,missing:true,photos:[]},
 {id:'e3',name:'Torre Ejemplo III',city:'Caraballeda',zone:'',address:'Av. Principal',damage:'severo',status:'verificado',notes:'Daño estructural severo, evacuado.',lat:10.61,lng:-66.85,missing:false,photos:[]}
];
window.__res = [
 {id:1,type:'whatsapp',title:'Voluntarios Caracas',url:'https://chat.whatsapp.com/ejemplo',descr:'Coordinación de voluntarios en el área metropolitana.'},
 {id:2,type:'telegram',title:'Alertas La Guaira',url:'https://t.me/ejemplo',descr:'Canal de alertas y réplicas del sismo.'},
 {id:3,type:'database',title:'Hoja de centros de acopio',url:'https://ejemplo.com',descr:'Listado colaborativo de centros (Google Sheet).'}
];
(function(){var f=document.getElementById('share-fab'); if(f) f.style.display='none';})();
true;`;

const SHOTS = [
  ['01-inicio.png',             `App._metrics=__m; home(); 1`],
  ['02-centros-directorio.png', `DB.centers=__centers; App.dir={q:'',estado:'',municipio:'',parroquia:'',group:'estado'}; go('centers-all'); 1`],
  ['03-hospitales.png',         `App._hospSummary=__hospSummary; App._hospitals=__hospItems; App.ctx.hospQuery=''; App.ctx.hospHospital=''; go('hospitals'); 1`],
  ['04-edificios.png',          `App._edificios=__edif; App.edif={q:'',damage:''}; go('edificios'); 1`],
  ['05-recursos.png',           `App._resources=__res; go('resources'); 1`],
  ['06-mapa.png',               `App._edificios=__edif; App._reportes=[]; DB.centers=__centers; App.ctx.mapLayer='edificios'; go('map-view'); 1`],
];

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/ayudave-shotn-' + process.pid, APP], { stdio: 'ignore' });
  let tabs;
  for (let i = 0; i < 60; i++) { try { tabs = await getJSON('/json/list'); if (tabs.find(t => t.type === 'page')) break; } catch {} await sleep(300); }
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 0; const pend = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method, params) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params: params || {} })); return new Promise(r => pend[i] = r); };
  const evaluate = async expr => { const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return m.result && m.result.result ? m.result.result.value : undefined; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 920, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: APP });
  await sleep(2800);
  for (let i = 0; i < 50; i++) { if (await evaluate('typeof go') === 'function') break; await sleep(200); }
  await evaluate(DATA);

  for (const [file, setup] of SHOTS) {
    try {
      await evaluate('try{window.scrollTo(0,0)}catch(e){}; ' + setup);
      await sleep(/mapa/.test(file) ? 2200 : 650);
      await evaluate('window.scrollTo(0,0)');
      const h = Math.min(2400, Math.max(920, (await evaluate('Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))')) || 920));
      const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 430, height: h, scale: 1 } });
      fs.writeFileSync(OUT + '/' + file, Buffer.from(cap.result.data, 'base64'));
      console.log('OK', file, h + 'px');
    } catch (e) { console.error('FALLO', file, e.message); }
  }
  ws.close(); chrome.kill();
  await sleep(300);
  console.log('LISTO ->', OUT);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
