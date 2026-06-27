/* Captura pantallas del SPA AyudaVE (server local :4599) vía Chrome DevTools Protocol.
   Inyecta datos de EJEMPLO solo para ilustrar el manual (no toca la BD real). */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const APP = 'http://localhost:4599/';
const OUT = '/Users/gabrielmassarelli/Projects/AyudaVE/docs/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = path => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

// Datos de ejemplo (se inyectan en memoria del navegador)
const DATA = `
window.__c1 = { id:'ej1', name:'Centro de Acopio Ejemplo (Chacao)', type:'Fundación', status:'verificado', distance:1.2,
  estado:'Miranda', municipio:'Chacao', parroquia:'Chacao', address:'Av. Francisco de Miranda, C.C. El Parque, PB',
  reference:'Al lado del Metro Chacao', responsable:'María', responsableApellido:'González', whatsapp:'',
  needs:[{key:'agua',level:'critica'},{key:'gasas',level:'critica'},{key:'panales',level:'alta'},{key:'voluntarios',level:'media'}],
  accepts:['fisico','pagomovil','cripto','voluntarios'], notAccepts:['Comida vencida','Medicinas vencidas'],
  pagomovil:{banco:'Banesco (0134)',telefono:'0414-1234567',cedula:'V-12.345.678',titular:'Asoc. Civil Ejemplo',concepto:'Donación AyudaVE'},
  transferencia:{banco:'Banesco',cuenta:'0134-0000-00-0000000000',titular:'Asoc. Civil Ejemplo'},
  crypto:[{red:'USDT TRC20',wallet:'TXk9aH4mC2pQ7rL8vN3sD6fG1bW5eY0uJq'}], horario:'Lun a Sáb, 8:00 AM - 6:00 PM',
  inventory:[{key:'agua',label:'Agua (botellones)',qty:24},{key:'comida',label:'Cajas de comida',qty:60}],
  stats:{reportadas:8,confirmadas:5,entregadas:3,voluntarios:6},
  updates:[{type:'urgente',text:'Urgente: necesitamos gasas y pañales para mañana.',date:'Hace 1 h'},{type:'recibido',text:'Hoy recibimos 40 cajas de agua. ¡Gracias!',date:'Hace 4 h'}],
  tasks:[{id:'t1',title:'Clasificar comida',needLabel:'Necesita 3 voluntarios para clasificar comida',horario:'2 PM - 6 PM',skill:'clasificar'}] };
window.__c2 = { id:'ej2', name:'Centro de Acopio Ejemplo (Santa Mónica)', type:'Universidad', status:'verificado-operativo', distance:1.5,
  estado:'Distrito Capital', municipio:'Libertador', parroquia:'Santa Mónica', address:'Av. Principal de Santa Mónica',
  reference:'Cerca de la UCV', responsable:'Ana', responsableApellido:'Rodríguez',
  needs:[{key:'comida',level:'alta'},{key:'voluntarios',level:'critica'}], accepts:['fisico','pagomovil','voluntarios'], notAccepts:[],
  pagomovil:{banco:'Banco de Venezuela (0102)',telefono:'0412-1112233',cedula:'V-15.222.333',titular:'Voluntariado Ejemplo'},
  transferencia:{}, crypto:[], horario:'Lun a Vie, 1:00 PM - 7:00 PM', inventory:[{key:'comida',label:'Cajas de comida',qty:30}],
  stats:{reportadas:5,confirmadas:3,entregadas:2,voluntarios:3}, updates:[], tasks:[] };
window.__person = { id:'pj1', nombre:'Juan', apellido:'Pérez', status:'desaparecido', edad:34, sexo:'Masculino', fecha:'24/06/2026',
  lugar:'Cerca del terminal', estado:'La Guaira (Vargas)', municipio:'Vargas', parroquia:'Maiquetía',
  descripcion:'Estatura media, camisa azul. Visto por última vez el 24/06.', contactoNombre:'Familiar', relacion:'Hermano', contactoTel:'', sightings:[] };
window.__person2 = { id:'pj2', nombre:'Rosa', apellido:'Martínez', status:'encontrado', edad:28, sexo:'Femenino', fecha:'24/06/2026', estado:'Miranda', municipio:'Sucre', sightings:[] };
window.__dons = [ {id:'d1',monto:'Bs. 500',donante:'Donante anónimo',metodo:'Pago Móvil',estado:'Reportada',banco:'Banesco',fecha:'Hoy',comprobante:true},
  {id:'d2',monto:'$20 USDT',donante:'Carlos',metodo:'Cripto (USDT)',estado:'Confirmada por el centro',fecha:'Ayer',comprobante:true} ];
window.__admin = { id:'me1', nombre:'María', apellido:'González', phone:'+584141234567', admin:true, aporte:['centro'] };
true;`;

const SHOTS = [
  ['01-inicio.png',        `home(); 1`],
  ['02-login.png',         `go('login'); 1`],
  ['03-pin.png',           `App.ctx.pinMode='login'; App.ctx.loginName='María'; App.ctx.pin='27'; go('passcode'); 1`],
  ['04-quiero-ayudar.png', `go('help-location'); 1`],
  ['05-donar-que.png',     `go('donate-what'); 1`],
  ['06-donar-donde.png',   `App.ctx.donateType='fisico'; go('donate-where'); 1`],
  ['07-urgentes.png',      `DB.centers=[__c1,__c2]; go('donate-urgent'); 1`],
  ['08-lista-centros.png', `DB.centers=[__c1,__c2]; go('donate-centers',{all:true,title:'Centros de acopio'}); 1`],
  ['09-perfil-centro.png', `DB.centers=[__c1,__c2]; go('center-public',{id:'ej1'}); 1`],
  ['10-voluntario.png',    `go('vol-skills'); 1`],
  ['11-vol-tareas.png',    `DB.centers=[__c1,__c2]; go('vol-tasks'); 1`],
  ['12-panel-centro.png',  `DB.centers=[__c1,__c2]; App._centerDons=__dons; go('center-panel',{id:'ej1'}); 1`],
  ['13-reportar-persona.png', `go('person-type'); 1`],
  ['14-personas-lista.png',`DB.persons=[__person,__person2]; go('persons-list'); 1`],
  ['15-admin.png',         `localStorage.setItem('ayudave_session',JSON.stringify(__admin)); DB.centers=[__c1]; App._admin={pendientes:[__c1],persons:[__person],totals:{centers:12,persons:8,users:34}}; App.ctx.adminTab='centros'; go('admin'); 1`],
];

(async () => {
  const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port='+PORT,'--user-data-dir=/tmp/ayudave-shot-'+process.pid, APP], { stdio:'ignore' });
  let tabs;
  for (let i=0;i<60;i++){ try { tabs = await getJSON('/json/list'); if (tabs.find(t=>t.type==='page')) break; } catch{} await sleep(300); }
  const page = tabs.find(t=>t.type==='page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r=>{ ws.onopen=r; });
  let id=0; const pend={};
  ws.onmessage = e => { const m=JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method,params) => { const i=++id; ws.send(JSON.stringify({id:i,method,params:params||{}})); return new Promise(r=>pend[i]=r); };
  const evaluate = async expr => { const m=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); return m.result && m.result.result ? m.result.result.value : undefined; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:430,height:920,deviceScaleFactor:2,mobile:true});
  await send('Page.navigate',{url:APP});
  await sleep(2800);
  for (let i=0;i<50;i++){ if (await evaluate('typeof go') === 'function') break; await sleep(200); }
  await evaluate(DATA);

  for (const [file, setup] of SHOTS) {
    try {
      await evaluate('try{window.scrollTo(0,0)}catch(e){}; ' + setup);
      await sleep(550);
      await evaluate('window.scrollTo(0,0)');
      const h = Math.min(2600, Math.max(920, await evaluate('Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))') || 920));
      const cap = await send('Page.captureScreenshot',{ format:'png', captureBeyondViewport:true, clip:{ x:0, y:0, width:430, height:h, scale:1 } });
      fs.writeFileSync(OUT + '/' + file, Buffer.from(cap.result.data,'base64'));
      console.log('OK', file, h+'px');
    } catch (e) { console.error('FALLO', file, e.message); }
  }
  ws.close(); chrome.kill();
  await sleep(300);
  console.log('LISTO ->', OUT);
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
