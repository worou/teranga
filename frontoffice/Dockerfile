FROM node:20-alpine AS client-builder

WORKDIR /app/client

RUN apk add --no-cache openssl

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npx vite build --outDir ../public --emptyOutDir

# ——— API builder ———
FROM node:20-alpine AS api-builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# ——— Production ———
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
RUN npx prisma generate

COPY --from=api-builder /app/dist ./dist
COPY --from=client-builder /app/public ./public

# Photos des membres. Le système de fichiers d'un conteneur est éphémère :
# sans volume monté ici, toutes les photos disparaissent au redéploiement.
# La déclaration ne suffit pas — il reste à monter un volume persistant côté
# orchestrateur (docker run -v, volume Compose, PVC Kubernetes…).
ENV UPLOAD_DIR=/app/uploads
RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
