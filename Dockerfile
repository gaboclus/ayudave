# AyudaVE — imagen para Cloud Run / contenedores
FROM node:22-slim

WORKDIR /app

# Instala dependencias (pg, @google-cloud/storage) de forma cacheable
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
# Cloud Run inyecta PORT (8080). En local usa 4599 por defecto.
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
