# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx nest build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --chown=app:app package.json ./
USER app
EXPOSE 8200
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:8200/health || exit 1
# Les migrations s'appliquent au démarrage (une seule instance) ; à sortir dans un job dédié si on passe à plusieurs.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
