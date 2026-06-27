#!/usr/bin/env bash
# ============================================================
# AyudaVE — respaldo de la base y las imágenes a Google Cloud Storage.
# Crea el bucket una vez:
#   gcloud storage buckets create gs://ayudave-backups --location=us-central1
# Programa un cron diario (en la VM):
#   0 3 * * *  BUCKET=gs://ayudave-backups bash /opt/ayudave/deploy/backup.sh
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ayudave}"
BUCKET="${BUCKET:-gs://ayudave-backups}"
STAMP="$(date +%F-%H%M)"

# Copia consistente de la base (vacía el WAL antes de copiar).
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$APP_DIR/data/ayudave.db" "PRAGMA wal_checkpoint(TRUNCATE);" || true
fi

gcloud storage cp "$APP_DIR/data/ayudave.db" "$BUCKET/db/ayudave-$STAMP.db"
gcloud storage rsync -r "$APP_DIR/data/uploads" "$BUCKET/uploads"

echo "Respaldo $STAMP subido a $BUCKET"
