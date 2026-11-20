FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Public Firebase web settings are baked into the browser bundle at build time (not secrets).
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
# Build args are visible to RUN as environment variables. An empty one would override a value from a local
# .env.production in the build context (Vite gives real env vars priority), so empty ones are dropped first.
RUN [ -n "$VITE_FIREBASE_API_KEY" ] || unset VITE_FIREBASE_API_KEY; \
    [ -n "$VITE_FIREBASE_AUTH_DOMAIN" ] || unset VITE_FIREBASE_AUTH_DOMAIN; \
    [ -n "$VITE_FIREBASE_PROJECT_ID" ] || unset VITE_FIREBASE_PROJECT_ID; \
    [ -n "$VITE_FIREBASE_APP_ID" ] || unset VITE_FIREBASE_APP_ID; \
    npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# Staging smoke script (tools/vertex-video-smoke.mjs); run only as a short-lived job.
COPY tools ./tools
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/server/index.js"]
