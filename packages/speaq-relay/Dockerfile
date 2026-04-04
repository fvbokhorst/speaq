FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/speaq-core/package.json packages/speaq-core/
COPY packages/speaq-relay/package.json packages/speaq-relay/
RUN npm ci --workspace=packages/speaq-core --workspace=packages/speaq-relay
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
