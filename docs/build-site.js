/* Genera un sitio de documentación estilo GitBook (sidebar + buscador) a partir de los .md.
   Salida: public/docs.html  (autocontenido, se sirve en /docs.html).
   Uso: node docs/build-site.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const VER = (read('docs/build-pdfs.js').match(/const VER = '([^']+)'/) || [, '2.0'])[1];

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return 'CODE_TOKEN_' + (codes.length - 1) + '_END'; });
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => '<a href="' + u + '">' + t + '</a>');
  s = s.replace(/CODE_TOKEN_(\d+)_END/g, (m, i) => '<code>' + esc(codes[+i]) + '</code>');
  return s;
}
// Convierte md → html, asigna ids (prefijados por doc) a h1-h3 y devuelve el índice de capítulos (h2).
function mdToHtml(md, prefix) {
  const lines = md.replace(/\r/g, '').split('\n'); const out = []; const toc = []; let i = 0; const para = [];
  const flush = () => { if (para.length) out.push('<p>' + inline(para.join(' ')) + '</p>'); para.length = 0; };
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln)) { flush(); i++; const c = []; while (i < lines.length && !/^```/.test(lines[i])) c.push(lines[i++]); i++; out.push('<pre><code>' + esc(c.join('\n')) + '</code></pre>'); continue; }
    if (/^\|(.+)\|\s*$/.test(ln) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      flush(); const cells = r => r.replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim());
      const head = cells(ln); i += 2; const rows = [];
      while (i < lines.length && /^\|(.+)\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push('<div class="tw"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'); continue;
    }
    let m;
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) {
      flush(); const L = m[1].length, txt = m[2], id = prefix + '--' + slug(txt);
      out.push('<h' + L + ' id="' + id + '">' + inline(txt) + '</h' + L + '>');
      if (L === 2) toc.push({ id, txt });
      i++; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(ln)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(ln)) { flush(); const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, '')); out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>'); continue; }
    if (/^\s*[-*]\s+/.test(ln)) { flush(); const it = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) it.push(lines[i++].replace(/^\s*[-*]\s+/, '')); out.push('<ul>' + it.map(t => '<li>' + inline(t) + '</li>').join('') + '</ul>'); continue; }
    if (/^\s*\d+\.\s+/.test(ln)) { flush(); const it = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) it.push(lines[i++].replace(/^\s*\d+\.\s+/, '')); out.push('<ol>' + it.map(t => '<li>' + inline(t) + '</li>').join('') + '</ol>'); continue; }
    if (/^\s*$/.test(ln)) { flush(); i++; continue; }
    para.push(ln); i++;
  }
  flush(); return { html: out.join('\n'), toc };
}

// diagrama + galería de capturas (base64, autocontenidos)
const diagram = '<figure class="fig"><img alt="Arquitectura" src="data:image/svg+xml;base64,' + Buffer.from(read('docs/arquitectura.svg')).toString('base64') + '"></figure>';
function gallery() {
  const caps = { '01-inicio.png': 'Inicio', '02-centros-directorio.png': 'Centros de acopio', '03-hospitales.png': 'Personas en hospitales', '04-edificios.png': 'Edificios afectados', '05-recursos.png': 'Recursos', '06-mapa.png': 'Mapa de la situación' };
  let f = '';
  for (const [file, cap] of Object.entries(caps)) { const p = path.join(__dirname, 'shots-nuevas', file); if (fs.existsSync(p)) f += '<figure class="shot"><img src="data:image/png;base64,' + fs.readFileSync(p).toString('base64') + '"><figcaption>' + cap + '</figcaption></figure>'; }
  return '<div class="shots">' + f + '</div>';
}

// documentos a incluir (orden del sidebar). chapters: mostrar capítulos en el sidebar.
const DOCS = [
  { file: 'docs/MANUAL-USUARIO.md', group: 'Usuarios' },
  { file: 'docs/DOCUMENTACION.md', group: 'Desarrolladores', chapters: true, lead: diagram },
  { file: 'docs/INTEGRACIONES.md', group: 'Desarrolladores' },
  { file: 'docs/DESARROLLO.md', group: 'Desarrolladores' },
  { file: 'docs/DESPLIEGUE.md', group: 'Desarrolladores' },
  { file: 'CONTRIBUTING.md', group: 'Desarrolladores' },
  { file: 'docs/CHANGELOG.md', group: 'Desarrolladores' },
];

let sections = '', nav = '', lastGroup = '';
for (const d of DOCS) {
  const md = read(d.file).replace(/^#\s+.+\n/, m => m); // conserva el H1 como título de la sección
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : d.file;
  const secId = slug(title);
  const { html, toc } = mdToHtml(md.replace(/^#\s+.+\n/, ''), secId);
  let body = (d.lead || '') + html.replace('<p>SHOTS_GALLERY_PLACEHOLDER</p>', gallery());
  sections += '<section id="' + secId + '"><h1>' + inline(title) + '</h1>' + body + '</section>';
  if (d.group !== lastGroup) { nav += '<div class="nav-group">' + d.group + '</div>'; lastGroup = d.group; }
  nav += '<a class="nav-doc" href="#' + secId + '">' + inline(title) + '</a>';
  if (d.chapters) for (const c of toc) nav += '<a class="nav-sub" href="#' + c.id + '">' + inline(c.txt) + '</a>';
}

const HTML = `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AyudaVE — Documentación</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'%3E%3Crect width='3' height='2' fill='%23fcd116'/%3E%3Crect width='3' height='2' y='0.667' fill='%23003893'/%3E%3Crect width='3' height='2' y='1.333' fill='%23cf142b'/%3E%3C/svg%3E">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--p:#003893;--pd:#0a2f72;--ink:#0f1b2d;--mut:#5b6675;--bd:#e3e9ef;--bg:#fff;--sb:#f7f9fc}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6}
a{color:var(--p);text-decoration:none}a:hover{text-decoration:underline}
#sidebar{position:fixed;top:0;left:0;width:286px;height:100vh;overflow-y:auto;background:var(--sb);border-right:1px solid var(--bd);padding:18px 14px 40px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:18px;color:var(--pd);padding:4px 8px 12px}
.stripe{height:6px;border-radius:4px;background:linear-gradient(90deg,#fcd116 0 33%,#003893 33% 66%,#cf142b 66%);margin:0 8px 14px}
#q{width:100%;padding:9px 12px;border:1px solid var(--bd);border-radius:9px;font:inherit;font-size:14px;margin-bottom:10px}
.nav-group{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8a97a8;margin:16px 8px 6px}
.nav-doc{display:block;padding:7px 8px;border-radius:7px;font-weight:700;font-size:14.5px;color:var(--ink)}
.nav-sub{display:block;padding:4px 8px 4px 18px;border-radius:7px;font-size:13px;color:var(--mut)}
.nav-doc:hover,.nav-sub:hover{background:#e8eef7;text-decoration:none}
.nav-doc.active,.nav-sub.active{background:var(--p);color:#fff}
main{margin-left:286px;padding:34px 40px 80px;max-width:860px}
h1{font-size:30px;color:var(--pd);border-bottom:3px solid #fcd116;padding-bottom:8px;margin:46px 0 18px}
section:first-child h1{margin-top:6px}
h2{font-size:22px;color:var(--pd);margin:34px 0 10px;border-top:2px solid #eef2f8;padding-top:18px}
h3{font-size:17px;color:#173e72;margin:22px 0 8px}h4{font-size:15px;color:#173e72}
p{margin:10px 0}ul,ol{padding-left:22px}li{margin:4px 0}
code{background:#eef2f8;border-radius:5px;padding:1px 6px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:.88em}
pre{background:#0f1b2d;color:#e7eefb;border-radius:10px;padding:14px 16px;overflow:auto}
pre code{background:none;color:inherit;padding:0;font-size:13px;line-height:1.5}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14px}
th,td{border:1px solid var(--bd);padding:8px 11px;text-align:left;vertical-align:top}
th{background:var(--p);color:#fff}tr:nth-child(even) td{background:#f6f9fd}
blockquote{border-left:4px solid #fcd116;background:#fffaf0;margin:14px 0;padding:8px 16px;color:#5b4a1a;border-radius:0 8px 8px 0}
hr{border:none;border-top:1px solid var(--bd);margin:26px 0}
.fig img{width:100%;border:1px solid var(--bd);border-radius:12px;margin:8px 0 18px}
.shots{display:flex;flex-wrap:wrap;gap:18px;margin:14px 0}
.shots .shot{margin:0;width:240px}.shots img{width:100%;border:1px solid var(--bd);border-radius:10px}
.shots figcaption{font-size:12px;color:var(--mut);margin-top:6px;text-align:center}
#menu{display:none;position:fixed;top:12px;left:12px;z-index:50;width:44px;height:44px;border:none;border-radius:10px;background:var(--p);color:#fff;font-size:20px;box-shadow:0 4px 14px rgba(0,0,0,.2)}
.back{display:inline-block;margin-bottom:8px;font-size:13px}
@media(max-width:880px){
  #menu{display:block}
  #sidebar{transform:translateX(-100%);transition:transform .2s;z-index:40;box-shadow:0 0 40px rgba(0,0,0,.2)}
  #sidebar.open{transform:none}
  main{margin-left:0;padding:64px 18px 70px}
}
</style></head><body>
<button id="menu" aria-label="Menú">☰</button>
<aside id="sidebar">
  <div class="brand">AyudaVE 🇻🇪</div><div class="stripe"></div>
  <a class="back" href="/">← Volver a la app</a>
  <input id="q" placeholder="Buscar en la documentación…">
  <nav id="nav">${nav}</nav>
  <div style="color:#8a97a8;font-size:11px;margin:18px 8px">Versión ${VER}</div>
</aside>
<main id="content">${sections}</main>
<script>
var sb=document.getElementById('sidebar');
document.getElementById('menu').onclick=function(){sb.classList.toggle('open')};
document.querySelectorAll('#nav a').forEach(function(a){a.onclick=function(){sb.classList.remove('open')}});
// buscador: filtra los enlaces del sidebar
document.getElementById('q').addEventListener('input',function(e){
  var q=e.target.value.toLowerCase().trim();
  document.querySelectorAll('#nav a').forEach(function(a){a.style.display=(!q||a.textContent.toLowerCase().includes(q))?'':'none'});
  document.querySelectorAll('.nav-group').forEach(function(g){g.style.display=q?'none':''});
});
// scrollspy: resalta la sección activa
var links=[].slice.call(document.querySelectorAll('#nav a'));
var ids=links.map(function(a){return a.getAttribute('href').slice(1)});
var spy=function(){
  var y=window.scrollY+90,cur=ids[0];
  ids.forEach(function(id){var el=document.getElementById(id);if(el&&el.offsetTop<=y)cur=id});
  links.forEach(function(a){a.classList.toggle('active',a.getAttribute('href')==='#'+cur)});
};
window.addEventListener('scroll',spy,{passive:true});spy();
</script></body></html>`;

fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public', 'docs.html'), HTML);
console.log('Sitio de documentación generado: public/docs.html (' + (HTML.length / 1024 | 0) + ' KB) · v' + VER);
