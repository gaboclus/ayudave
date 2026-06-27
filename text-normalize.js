/* Normalización y coincidencia de nombres — módulo compartido por la auditoría
   de duplicados (audit-dtv.js) y la búsqueda de personas/hospitales.
   Funciones puras, sin dependencias.  CLI: node text-normalize.js "José González" */
'use strict';

const stripAccents = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normName = s => stripAccents(String(s || '').toLowerCase()).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const nameTokens = s => normName(s).split(' ').filter(Boolean);

// palabras ordenadas (insensible al orden de apellidos); null si es muy pobre para bloquear
function fullNameKey(s) {
  const t = nameTokens(s);
  if (!t.length) return null;
  const key = [...t].sort().join(' ');
  if (t.length < 2 && key.length < 6) return null;
  return key;
}
// firma del bloque difuso: primeras 3 letras de cada palabra, ordenadas
function nameSignature(s) {
  const t = nameTokens(s).map(w => w.slice(0, 3)).sort();
  return t.length ? t.join('') : null;
}

/* similitud Levenshtein normalizada (0..1) */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1); for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
function similarity(a, b) {
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 1;
}

// columnas indexables de búsqueda, derivadas del nombre (poblado en inserción/upsert)
function searchFields(nombre) {
  return { name_norm: normName(nombre), name_sig: nameSignature(nombre) || '' };
}

// ¿coincide un token de la consulta con uno del nombre? La regla de "misma inicial"
// separa typos/ortografía (gonzales↔gonzalez) de apellidos distintos (hernandez↔fernandez).
function fuzzyTokenMatch(nameTok, qTok) {
  if (!nameTok || !qTok) return false;
  if (nameTok === qTok) return true;
  if (qTok.length >= 4 && nameTok.includes(qTok)) return true;
  if (nameTok[0] === qTok[0] && Math.abs(nameTok.length - qTok.length) <= 2 && similarity(nameTok, qTok) >= 0.85) return true;
  return false;
}

// relevancia (menor = mejor): 0 exacto · 1 prefijo · 2 subcadena · 3 difuso · 5 no coincide
function nameMatchRank(nameNorm, qNorm, qTokens) {
  if (!nameNorm || !qNorm) return 5;
  if (nameNorm === qNorm) return 0;
  if (nameNorm.startsWith(qNorm)) return 1;
  if (nameNorm.includes(qNorm)) return 2;
  const nTokens = nameNorm.split(' ').filter(Boolean);
  const everyHits = qTokens.length > 0 && qTokens.every(qt => nTokens.some(nt => fuzzyTokenMatch(nt, qt)));
  return everyHits ? 3 : 5;
}

module.exports = {
  stripAccents, normName, nameTokens, fullNameKey, nameSignature,
  levenshtein, similarity, searchFields, fuzzyTokenMatch, nameMatchRank,
};

/* ---------------- CLI ---------------- */
if (require.main === module) {
  const a = process.argv[2] || 'José González';
  const b = process.argv[3];
  console.log('normName   :', JSON.stringify(normName(a)));
  console.log('nameSig    :', JSON.stringify(nameSignature(a)));
  console.log('searchFields:', JSON.stringify(searchFields(a)));
  if (b) {
    const qt = nameTokens(b);
    console.log(`similarity("${normName(a)}","${normName(b)}") =`, similarity(normName(a), normName(b)).toFixed(3));
    console.log(`nameMatchRank =`, nameMatchRank(normName(a), normName(b), qt));
  }
}
