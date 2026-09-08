# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Policy Gate 검사 도구 (설계서 Part 2 §6.1).
# 호스트에 설치하지 않고 이미지에 넣는다 — 개발과 프로덕션이 같은 버전으로 돌고,
# Cloud Run에서도 별도 준비 없이 동작한다. 버전은 고정한다: 검사 도구가 조용히
# 올라가면 어제 통과하던 구성이 오늘 막히고, 그 이유를 추적할 수 없다.
ARG TRIVY_VERSION=0.74.0
ARG CONFTEST_VERSION=0.69.0
RUN apk add --no-cache --virtual .fetch curl tar gzip \
    # 릴리스 아카이브를 직접 받는다. 설치 스크립트는 실패해도 어디서 죽었는지 알기 어렵다.
    # 두 도구가 아키텍처 표기를 다르게 쓴다: trivy는 ARM64/64bit, conftest는 arm64/x86_64.
    && case "$(uname -m)" in \
         aarch64) TRIVY_ARCH=ARM64;  CONFTEST_ARCH=arm64  ;; \
         x86_64)  TRIVY_ARCH=64bit;  CONFTEST_ARCH=x86_64 ;; \
         *) echo "지원하지 않는 아키텍처: $(uname -m)" >&2; exit 1 ;; \
       esac \
    && curl -sfL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${TRIVY_ARCH}.tar.gz" \
       | tar -xz -C /usr/local/bin trivy \
    && curl -sfL "https://github.com/open-policy-agent/conftest/releases/download/v${CONFTEST_VERSION}/conftest_${CONFTEST_VERSION}_Linux_${CONFTEST_ARCH}.tar.gz" \
       | tar -xz -C /usr/local/bin conftest \
    && apk del .fetch \
    && trivy --version && conftest --version

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @muster/api...

# 로컬 개발용 — docker compose가 src를 볼륨 마운트하고 watch 모드로 돈다.
#
# 기동 전에 마이그레이션을 돌린다. 안 그러면 새 컬럼을 쓰는 코드가 "코드는 맞는데 500"을
# 내고, 원인이 스키마라는 것을 서버 로그를 봐야 안다. 마이그레이션이 실패하면 서버도
# 뜨지 않는다 — 반쯤 맞는 스키마 위에서 도는 것보다 낫다.
#
# 프로덕션(아래 production 타겟)은 일부러 이렇게 하지 않는다. 배포와 스키마 변경을
# 한 명령에 묶으면 롤백이 어려워지고, 인스턴스가 여럿일 때 동시에 돌 수 있다.
FROM deps AS development
COPY apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["pnpm", "start:dev:migrate"]

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter @muster/api build && pnpm prune --prod

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
