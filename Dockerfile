# Image du hub Nohriancons (SvelteKit + adapter-node + SQLite).
# Les polices Avenir Next (licence commerciale) ne sont pas dans le dépôt :
# dépose-les dans static/fonts/ avant de construire l'image.

FROM node:22-bookworm-slim AS base
WORKDIR /app
# npm 10 plante sur cet arbre de dépendances : on utilise npm 11.
RUN npm install -g npm@11.6.2 && apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/hub.db \
    MIGRATIONS_PATH=/app/drizzle \
    BODY_SIZE_LIMIT=1M
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY drizzle ./drizzle
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
