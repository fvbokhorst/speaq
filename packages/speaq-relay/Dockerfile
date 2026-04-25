# Cache-buster 2026-04-25T15:30: PQ-AUTH hybrid + @noble deps in root.
# Cloud Build was reusing a 2026-04-18 layer where workspaces was absent.
# Single `npm ci` resolves all workspace deps when root package.json has
# "workspaces": ["packages/*"] - simpler and avoids the explicit --workspace flag.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/speaq-core/package.json packages/speaq-core/
COPY packages/speaq-relay/package.json packages/speaq-relay/
RUN npm ci
COPY packages/speaq-core/ packages/speaq-core/
COPY packages/speaq-relay/ packages/speaq-relay/
RUN npm run build --workspace=packages/speaq-core
RUN npm run build --workspace=packages/speaq-relay

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/packages/speaq-core/dist packages/speaq-core/dist
COPY --from=builder /app/packages/speaq-core/package.json packages/speaq-core/
COPY --from=builder /app/packages/speaq-relay/dist packages/speaq-relay/dist
COPY --from=builder /app/packages/speaq-relay/package.json packages/speaq-relay/
COPY --from=builder /app/node_modules node_modules
EXPOSE 8080
CMD ["node", "packages/speaq-relay/dist/server.js"]
