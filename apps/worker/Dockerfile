# Multi-stage build: prune monorepo, install, run with tsx.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile --filter=@uchicago-shuttle/worker...

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

WORKDIR /app/apps/worker
EXPOSE 8080
ENV WORKER_HEALTH_PORT=8080
CMD ["pnpm", "start"]
