# syntax=docker/dockerfile:1

# ---- deps: full dependency install, needed to run tsc -----------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript ----------------------------------------------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: production-only dependency install --------------------------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: final image ----------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    LOG_LEVEL=info \
    PORT=48040 \
    HOSTNAME=0.0.0.0

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Baked-in default device config; overridden by mounting a volume at /app/devices
# (see README) — findDevicesDirectory() checks /app/devices before this fallback.
COPY src/devices/devices.json ./dist/devices/devices.json
COPY scripts/docker-healthcheck.cjs ./scripts/docker-healthcheck.cjs

EXPOSE 48040

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node scripts/docker-healthcheck.cjs

# Exec form (not shell form): Node runs as PID 1 and receives SIGTERM directly from
# `docker stop`, which src/index.ts's graceful-shutdown handler depends on.
CMD ["node", "dist/index.js"]
