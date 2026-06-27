/* Almacenamiento de imágenes:
   - GCS_BUCKET definido -> Google Cloud Storage (escalable, servido por CDN)
   - si no               -> disco local en data/uploads (desarrollo) */
'use strict';
const path = require('path');
const fs = require('fs');

const rid = () => Math.random().toString(36).slice(2, 8);
function decode(dataUrl) {
  const m = /^data:(image\/(\w+));base64,(.+)$/s.exec(dataUrl || '');
  if (!m) return null;
  return { ext: m[2] === 'jpeg' ? 'jpg' : m[2], mime: m[1], buf: Buffer.from(m[3], 'base64') };
}

if (process.env.GCS_BUCKET) {
  const { Storage } = require('@google-cloud/storage');
  const bucket = new Storage().bucket(process.env.GCS_BUCKET);
  // Bucket PRIVADO (la org bloquea acceso público): las imágenes se sirven vía la app en /img/...
  module.exports = {
    kind: 'gcs',
    bucket,
    async save(dataUrl) {
      const d = decode(dataUrl); if (!d) return null;
      const name = `uploads/${Date.now()}-${rid()}.${d.ext}`;
      await bucket.file(name).save(d.buf, { contentType: d.mime, resumable: false, metadata: { cacheControl: 'public, max-age=31536000' } });
      return '/img/' + name;
    },
  };
} else {
  const DIR = path.join(__dirname, 'data', 'uploads');
  fs.mkdirSync(DIR, { recursive: true });
  module.exports = {
    kind: 'local',
    async save(dataUrl) {
      const d = decode(dataUrl); if (!d) return null;
      const file = `${Date.now()}-${rid()}.${d.ext}`;
      fs.writeFileSync(path.join(DIR, file), d.buf);
      return '/uploads/' + file;
    },
  };
}
