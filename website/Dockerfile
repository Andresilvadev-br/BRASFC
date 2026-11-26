FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY scripts/build.mjs ./scripts/build.mjs
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    WEBSITE_HOST=0.0.0.0 \
    WEBSITE_PORT=4175 \
    WEBSITE_DATA=/app/data/community.sqlite
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN install -d -o node -g node /app/data
USER node
EXPOSE 4175
CMD ["node", "dist/server.mjs"]
