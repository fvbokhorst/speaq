# Cache-bust: 2026-04-25T15:35 (PQ-AUTH hybrid + @noble deps).
# Cloud Build was reusing a stale layer; minor edit forces rebuild.
FROM node:22-alpine AS builder
WORKDIR /app

COPY packages/speaq-core/package.json packages/speaq-core/
COPY packages/speaq-relay/package.json packages/speaq-relay/
COPY packages/speaq-relay/package-lock.json packages/speaq-relay/

RUN cd packages/speaq-core && npm install
RUN cd /app/packages/speaq-relay && npm install

COPY packages/speaq-core/ packages/speaq-core/
COPY packages/speaq-relay/ packages/speaq-relay/

RUN cd packages/speaq-core && npm run build
RUN cd /app/packages/speaq-relay && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/packages/speaq-core/dist packages/speaq-core/dist
COPY --from=builder /app/packages/speaq-core/package.json packages/speaq-core/
COPY --from=builder /app/packages/speaq-relay/dist packages/speaq-relay/dist
COPY --from=builder /app/packages/speaq-relay/package.json packages/speaq-relay/
COPY --from=builder /app/packages/speaq-core/node_modules packages/speaq-core/node_modules
COPY --from=builder /app/packages/speaq-relay/node_modules packages/speaq-relay/node_modules

EXPOSE 8080
CMD ["node", "packages/speaq-relay/dist/server.js"]
