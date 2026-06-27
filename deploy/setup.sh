#!/usr/bin/env bash
# ============================================================
# AyudaVE — instalación turnkey en una VM Ubuntu 22.04/24.04
# (Google Compute Engine, DigitalOcean, Hetzner, etc.)
#
# Uso (como root):
#   sudo DOMAIN=tudominio.org REPO=https://github.com/tu/ayudave.git bash setup.sh
# o, si ya copiaste el código a /opt/ayudave:
#   sudo DOMAIN=tudominio.org bash /opt/ayudave/deploy/setup.sh
# ============================================================
set -euo pipefail

DOMAIN="${DOMAIN:-}"
APP_DIR="${APP_DIR:-/opt/ayudave}"
REPO="${REPO:-}"

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root (sudo)."; exit 1; }
[ -n "$DOMAIN" ] || { echo "Falta DOMAIN. Ej: sudo DOMAIN=tudominio.org bash setup.sh"; exit 1; }

echo "==> 1/6 Node 22 + git"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git

echo "==> 2/6 Caddy (HTTPS automático)"
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

echo "==> 3/6 Usuario y código en $APP_DIR"
id ayudave &>/dev/null || adduser --disabled-password --gecos "" ayudave
mkdir -p "$APP_DIR"
if [ -n "$REPO" ]; then
  if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO" "$APP_DIR"; fi
fi
[ -f "$APP_DIR/server.js" ] || { echo "No encuentro server.js en $APP_DIR. Sube el código o pasa REPO=..."; exit 1; }
mkdir -p "$APP_DIR/data/uploads"
chown -R ayudave:ayudave "$APP_DIR"

echo "==> 4/6 Servicio systemd (corre siempre, reinicia solo)"
sed "s#/opt/ayudave#$APP_DIR#g" "$APP_DIR/deploy/ayudave.service" > /etc/systemd/system/ayudave.service
systemctl daemon-reload
systemctl enable --now ayudave

echo "==> 5/6 Caddy para $DOMAIN"
sed "s/tudominio.org/$DOMAIN/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> 6/6 Comprobación"
sleep 2
curl -fsS "http://localhost:4599/healthz" && echo " <- app OK"

echo
echo "============================================================"
echo " AyudaVE desplegada. Abre:  https://$DOMAIN"
echo " (Asegúrate de que el DNS A de $DOMAIN apunte a la IP de esta VM)"
echo "============================================================"
systemctl --no-pager status ayudave | head -n 6
