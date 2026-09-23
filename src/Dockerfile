# syntax=docker/dockerfile:1
#
# Build context is the repo root, not this directory — see docker-compose.yml
# (`context: ..`). This project depends on "tamp-backend": "file:../Tamp-backend"
# (package.json) purely for the AppRouter type import in src/lib/trpc.ts;
# `npm ci` needs that sibling directory present to resolve it, even though
# it's erased at compile time and never reaches the runtime image.

FROM node:24-alpine AS deps
WORKDIR /workspace

# Install Tamp-backend's own deps first (this runs its "postinstall": "prisma
# generate", producing the real @prisma/client types) — src's
# `file:../Tamp-backend` dependency needs that fully resolved for
# TypeScript to infer AppRouter, and a nested/transitive install of
# tamp-backend would skip its devDependencies (including the prisma CLI)
# entirely, so this can't happen implicitly via src's own npm ci.
COPY Tamp-backend ./Tamp-backend
WORKDIR /workspace/Tamp-backend
RUN npm ci

WORKDIR /workspace
COPY src/package.json src/package-lock.json ./src/
WORKDIR /workspace/src
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /workspace
COPY --from=deps /workspace/Tamp-backend ./Tamp-backend
COPY src ./src
COPY --from=deps /workspace/src/node_modules ./src/node_modules
WORKDIR /workspace/src

ARG NEXT_PUBLIC_APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Standalone Next.js server (output: "standalone" in next.config.ts) — a
# pruned node_modules + server.js, run directly by Node behind nginx (see
# nginx.conf.template for the /api/* proxy and the catch-all to this app).
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

COPY --from=build /workspace/src/public ./public
COPY --from=build --chown=nextjs:nodejs /workspace/src/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /workspace/src/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1

CMD ["node", "server.js"]
