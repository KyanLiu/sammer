FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/server/package.json packages/server/package.json
RUN pnpm install --frozen-lockfile --prod --filter @sammer/server...
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist packages/web/dist

ENV WEB_DIST=/app/packages/web/dist
ENV DATA_DIR=/app/data
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000
CMD ["node", "packages/server/dist/main.js"]
