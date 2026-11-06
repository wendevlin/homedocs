# Home Assistant app image. Built for amd64 and aarch64 (the platforms Bun supports).
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN bun install --frozen-lockfile
COPY packages packages
RUN bun run build

FROM oven/bun:1.4.2-alpine
WORKDIR /app
ENV NODE_ENV=production \
    DOCS_ROOT=/config \
    LEGACY_DOCS_ROOT=/homeassistant/homedocs \
    DATA_DIR=/data \
    PORT=8099 \
    SHARE_PORT=8098 \
    WEB_DIR=/app/web \
    SAMPLE_DOCS_DIR=/app/sample-docs
# the server is bundled into a single file, no node_modules needed at runtime
COPY --from=build /app/packages/server/dist server
COPY --from=build /app/packages/web/build web
COPY sample-docs sample-docs

LABEL io.hass.type="app" \
      io.hass.name="Homedocs" \
      io.hass.description="Document your home with Markdown" \
      org.opencontainers.image.source="https://github.com/wendevlin/homedocs" \
      org.opencontainers.image.licenses="Apache-2.0"

EXPOSE 8099 8098
CMD ["bun", "server/index.js"]
