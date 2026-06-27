/* ============================================================
   Asistente con IA (Google Gemini) — "buscar persona por foto".
   - analyzePhoto: describe rasgos visibles (sexo, edad aprox, vestimenta)
     para ayudar a filtrar las listas de desaparecidos/hospitalizados.
   - matchPhotos: compara la foto buscada contra fotos candidatas y elige
     la más probable (conservador: -1 si duda).
   Requiere AYUDAVE_GEMINI_KEY. Si no está, hasKey()=false y la app cae a
   búsqueda por nombre (degradación elegante).
   ============================================================ */
'use strict';

const KEY = process.env.AYUDAVE_GEMINI_KEY || process.env.GEMINI_API_KEY || '';
const MODEL = process.env.AYUDAVE_GEMINI_MODEL || 'gemini-2.5-flash';
const URL = m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`;

function hasKey() { return !!KEY; }

// data URL -> { mime, data(base64) }
function parseDataUrl(d) { const m = /^data:([^;]+);base64,(.+)$/.exec(d || ''); return m ? { mime: m[1], data: m[2] } : null; }

async function gemini(parts) {
  const body = { contents: [{ parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } };
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(URL(MODEL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('gemini ' + res.status + ' ' + t.slice(0, 160)); }
    const j = await res.json();
    const txt = ((((j.candidates || [])[0] || {}).content || {}).parts || [])[0]?.text || '';
    try { return JSON.parse(txt); } catch { return JSON.parse((txt.match(/\{[\s\S]*\}/) || ['{}'])[0]); }
  } finally { clearTimeout(to); }
}

// Describe rasgos visibles de la persona en la foto (sin inventar identidad).
async function analyzePhoto(dataUrl) {
  const img = parseDataUrl(dataUrl); if (!img) throw new Error('imagen inválida');
  const parts = [
    { text: 'Eres un asistente humanitario tras un terremoto en Venezuela. Analiza SOLO características visibles de la persona en la foto para ayudar a localizarla en listas de desaparecidos u hospitalizados. Responde EXCLUSIVAMENTE un JSON con esta forma exacta: {"sexo":"Masculino|Femenino|","edadMin":<entero>,"edadMax":<entero>,"descripcion":"1-2 frases con edad aparente, vestimenta y rasgos","rasgos":["..."]}. No inventes nombres ni identidad. Si no hay una persona clara, descripcion="" .' },
    { inline_data: { mime_type: img.mime, data: img.data } },
  ];
  return gemini(parts);
}

// Compara la foto buscada contra fotos candidatas. candidates: [{mime,data}] en orden.
// Devuelve {bestIndex:-1|0..n, confianza, motivo}. Conservador.
async function matchPhotos(queryDataUrl, candidates) {
  const q = parseDataUrl(queryDataUrl); if (!q || !candidates.length) return null;
  const parts = [{ text: 'Foto de REFERENCIA de la persona buscada:' }, { inline_data: { mime_type: q.mime, data: q.data } }, { text: 'Fotos CANDIDATAS numeradas desde 0:' }];
  candidates.forEach((c, i) => { parts.push({ text: 'Candidato ' + i + ':' }); parts.push({ inline_data: { mime_type: c.mime, data: c.data } }); });
  parts.push({ text: 'Indica si algún candidato es MUY probablemente la MISMA persona que la referencia. Responde EXCLUSIVAMENTE JSON: {"bestIndex":<entero, -1 si ninguno con alta probabilidad>,"confianza":"alta|media|baja","motivo":"breve"}. Sé conservador: ante la duda, bestIndex=-1.' });
  return gemini(parts);
}

module.exports = { hasKey, analyzePhoto, matchPhotos, MODEL };
