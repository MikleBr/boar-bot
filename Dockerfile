FROM oven/bun:1-alpine

WORKDIR /app

COPY package*.json ./

RUN bun install

COPY . .

RUN bunx prisma generate
RUN bunx prisma migrate deploy

EXPOSE 5005

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5005/ || exit 1

CMD ["bun", "run", "start"]
