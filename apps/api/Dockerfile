# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @agentops/api...

# 로컬 개발용 — docker compose가 src를 볼륨 마운트하고 watch 모드로 돈다.
FROM deps AS development
COPY apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["pnpm", "start:dev"]

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter @agentops/api build && pnpm prune --prod

# Cloud Run 배포용
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["node", "dist/main.js"]
