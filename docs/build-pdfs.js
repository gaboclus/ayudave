/* Convierte los .md de documentación a HTML con estilo profesional (para imprimir a PDF con Chrome).
   Uso: node docs/build-pdfs.js  → genera docs/AyudaVE-Documentacion.html y docs/AyudaVE-Manual-Usuario.html
   Luego: Chrome --headless --print-to-pdf sobre cada HTML. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const VER = '2.0.1';                                  // ← versión de la documentación (bump en cada edición)
const VERSION = 'Versión ' + VER + ' · Junio 2026';

/* ---------- markdown → html (compacto, suficiente para estos docs) ---------- */
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
function mdToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = []; let i = 0; const para = [];
  const flushPara = () => { if (para.length) out.push('<p>' + inline(para.join(' ')) + '</p>'); para.length = 0; };
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln)) { flushPara(); i++; const code = []; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); i++; out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); continue; }
    if (/^\|(.+)\|\s*$/.test(ln) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      flushPara();
      const cells = r => r.replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim());
      const head = cells(ln); i += 2; const rows = [];
      while (i < lines.length && /^\|(.+)\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push('<table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    let m;
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(ln)) { flushPara(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(ln)) { flushPara(); const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, '')); out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>'); continue; }
    if (/^\s*[-*]\s+/.test(ln)) { flushPara(); const items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, '')); out.push('<ul>' + items.map(t => '<li>' + inline(t) + '</li>').join('') + '</ul>'); continue; }
    if (/^\s*\d+\.\s+/.test(ln)) { flushPara(); const items = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, '')); out.push('<ol>' + items.map(t => '<li>' + inline(t) + '</li>').join('') + '</ol>'); continue; }
    if (/^\s*$/.test(ln)) { flushPara(); i++; continue; }
    para.push(ln); i++;
  }
  flushPara();
  return out.join('\n');
}
// Índice a partir de los encabezados "## N. Título"
function tocFrom(md) {
  const chapters = (md.match(/^##\s+\d+\.\s+.+$/gm) || []).map(l => l.replace(/^##\s+/, ''));
  if (!chapters.length) return '';
  return '<section class="toc"><div class="toc-h">Contenido</div><ol class="toc-list">' +
    chapters.map(c => { const m = c.match(/^(\d+)\.\s+(.+)$/); return '<li><span class="n">' + m[1] + '</span>' + inline(m[2]) + '</li>'; }).join('') +
    '</ol></section>';
}

const CSS = `
  @page { size: A4; margin: 18mm 15mm; }
  *{ box-sizing:border-box; }
  body{ font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Roboto,sans-serif; color:#0f1b2d; font-size:11.5pt; line-height:1.55; margin:0; }
  h1,h2,h3,h4{ color:#0a2f72; line-height:1.25; page-break-after:avoid; }
  h1{ font-size:20pt; border-bottom:3px solid #fcd116; padding-bottom:5px; margin-top:22px; }
  h2{ font-size:16pt; margin-top:22px; }
  h3{ font-size:13pt; margin-top:18px; color:#173e72; }
  h4{ font-size:11.5pt; color:#173e72; }
  a{ color:#003893; text-decoration:none; }
  p{ margin:9px 0; }
  code{ background:#eef2f8; border-radius:4px; padding:1px 5px; font-family:'SF Mono',Menlo,Consolas,monospace; font-size:9.5pt; }
  pre{ background:#0f1b2d; color:#e7eefb; border-radius:8px; padding:12px 14px; overflow:auto; page-break-inside:avoid; }
  pre code{ background:none; color:inherit; padding:0; font-size:9pt; line-height:1.45; }
  table{ border-collapse:collapse; width:100%; margin:12px 0; font-size:9.8pt; page-break-inside:avoid; }
  th,td{ border:1px solid #d8e0ea; padding:7px 10px; text-align:left; vertical-align:top; }
  th{ background:#003893; color:#fff; }
  tr:nth-child(even) td{ background:#f6f9fd; }
  blockquote{ border-left:4px solid #fcd116; background:#fffaf0; margin:12px 0; padding:8px 14px; color:#5b4a1a; border-radius:0 8px 8px 0; }
  ul,ol{ padding-left:22px; } li{ margin:3px 0; }
  hr{ border:none; border-top:1px solid #e3e9ef; margin:20px 0; }

  .cover{ text-align:center; padding:54px 0 24px; page-break-after:always; }
  .cover .stripe{ height:9px; background:linear-gradient(90deg,#fcd116 0 33%,#003893 33% 66%,#cf142b 66%); border-radius:4px; margin:0 auto 30px; width:62%; }
  .cover h1{ border:none; font-size:36pt; margin:6px 0; }
  .cover .sub{ color:#0f1b2d; font-size:14pt; font-weight:600; }
  .cover .ver{ color:#0a2f72; font-weight:700; font-size:11.5pt; margin-top:10px; }
  .cover .meta{ color:#74819a; font-size:10pt; margin-top:6px; }
  .cover img{ width:92%; max-width:740px; margin:30px auto 0; display:block; }

  .toc{ page-break-after:always; padding-top:24px; }
  .toc-h{ font-size:22pt; color:#0a2f72; font-weight:800; border-bottom:3px solid #fcd116; padding-bottom:7px; }
  .toc-list{ list-style:none; padding:0; margin-top:20px; font-size:13.5pt; }
  .toc-list li{ padding:11px 2px; border-bottom:1px solid #eef2f8; color:#0f1b2d; }
  .toc-list .n{ display:inline-block; width:38px; color:#003893; font-weight:800; }

  .doc h2{ page-break-before:always; border-top:3px solid #003893; padding-top:16px; font-size:17pt; }
  .doc > h2:first-of-type{ page-break-before:avoid; }

  .shots{ display:flex; flex-wrap:wrap; gap:16px 18px; justify-content:center; margin-top:16px; }
  .shots figure{ margin:0; text-align:center; page-break-inside:avoid; width:84mm; }
  .shots img{ max-width:84mm; max-height:150mm; width:auto; height:auto; border:1px solid #d8e0ea; border-radius:10px; box-shadow:0 2px 8px rgba(15,27,45,.10); }
  .shots figcaption{ font-size:8.6pt; color:#5b6675; margin-top:6px; line-height:1.3; }
`;

function page(opts) {
  const img = opts.diagram ? '<img src="data:image/svg+xml;base64,' + Buffer.from(read('docs/arquitectura.svg')).toString('base64') + '" alt="Arquitectura">' : '';
  const cover = '<div class="cover"><div class="stripe"></div>' +
    '<h1>AyudaVE 🇻🇪</h1><div class="sub">' + opts.title + '</div>' +
    '<div class="ver">' + VERSION + '</div>' +
    '<div class="meta">ayudahumanitariavenezuela.com · Documento ' + (opts.kind || 'técnico') + '</div>' + img + '</div>';
  const body = opts.docClass ? '<div class="doc">' + opts.body + '</div>' : opts.body;
  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>AyudaVE — ' + opts.title + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' + CSS + '</style></head><body>' + cover + (opts.toc || '') + body + '</body></html>';
}

// galería de capturas (base64, datos de ejemplo)
function shotsGallery() {
  const caps = {
    '01-inicio.png': 'Inicio — resumen en vivo (centros, hospitales, desaparecidos, edificios).',
    '02-centros-directorio.png': 'Centros de acopio — buscador + tabla de conteos por zona.',
    '03-hospitales.png': 'Personas en hospitales — búsqueda para reunificación familiar.',
    '04-edificios.png': 'Edificios afectados — filtro por nivel de daño.',
    '05-recursos.png': 'Recursos — grupos de WhatsApp/Telegram, bases de datos, galería.',
    '06-mapa.png': 'Mapa de la situación — capas de centros, servicios y daños.',
  };
  const dir = path.join(__dirname, 'shots-nuevas');
  let figs = '';
  for (const [f, cap] of Object.entries(caps)) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const b64 = fs.readFileSync(p).toString('base64');
    figs += '<figure><img src="data:image/png;base64,' + b64 + '"><figcaption>' + cap + '</figcaption></figure>';
  }
  return '<div class="shots">' + figs + '</div>';
}

// PDF 1 — Documentación técnica (un solo documento maestro, con índice y capítulos)
const docMd = read('docs/DOCUMENTACION.md').replace(/^#\s+.+\n/, ''); // quita el H1 (ya está en la portada)
const docBody = mdToHtml(docMd).replace('<p>SHOTS_GALLERY_PLACEHOLDER</p>', shotsGallery());
fs.writeFileSync(path.join(__dirname, 'AyudaVE-Documentacion.html'),
  page({ title: 'Documentación técnica', kind: 'técnico y operativo', diagram: true, toc: tocFrom(docMd), docClass: true, body: docBody }));

// PDF 2 — Manual de usuario
const manMd = read('docs/MANUAL-USUARIO.md').replace(/^#\s+.+\n/, '');
fs.writeFileSync(path.join(__dirname, 'AyudaVE-Manual-Usuario.html'),
  page({ title: 'Manual de usuario', kind: 'de usuario', diagram: false, body: mdToHtml(manMd) }));

console.log('HTML generado (' + VERSION + ')');
console.log('VER=' + VER);
