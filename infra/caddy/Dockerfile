FROM caddy:2.11.7-builder AS build
RUN xcaddy build \
    --with github.com/corazawaf/coraza-caddy/v2@v2.6.2 \
    --with github.com/mholt/caddy-ratelimit@5625512f24f6

FROM node:24-alpine AS web
WORKDIR /web
COPY web/ ./
RUN npm ci --no-audit --no-fund && npm run build

FROM caddy:2.11.7
COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY --from=web /web/apps/app/dist /srv/app
COPY --from=web /web/apps/cockpit/dist /srv/cockpit
COPY --from=web /web/apps/admin/dist /srv/admin
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
