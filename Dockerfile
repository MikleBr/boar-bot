FROM oven/bun:1-alpine

WORKDIR /app

COPY package*.json bun.lock ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run db:generate

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["bun", "run", "start"]
