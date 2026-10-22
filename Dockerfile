# syntax=docker/dockerfile:1.7

# Base image (all stages): pinned Node.js release on Debian 13 (trixie), locked to its
# digest so a rebuild never silently picks up an older or tampered image. Dependabot bumps both.

# ---- Build: compile the web UI and the server -------------------------------
FROM node:26.11.1-trixie-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npm run build

# ---- Production dependencies of the server only ----------------------------
FROM node:26.11.1-trixie-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace server --no-audit --no-fund

# ---- Runtime ------------------------------------------------------------------
FROM node:26.11.1-trixie-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS runtime
# Release tag (empty = package.json version), commit SHA and repository URL, injected by CI.
ARG APP_VERSION=
ARG GIT_COMMIT=
ARG SOURCE_URL=
LABEL org.opencontainers.image.title="uptime-monitor" \
      org.opencontainers.image.description="Self-hosted multi-project uptime monitoring" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="${SOURCE_URL}"

# Upgrade the OS packages (ca-certificates, openssl…) to the latest Debian security
# fixes. No curl or wget is installed: the health check uses Node's own fetch.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends iputils-ping ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT} \
    SOURCE_URL=${SOURCE_URL} \
    PORT=3000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web/dist

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/web/dist ./web/dist

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/index.js"]
