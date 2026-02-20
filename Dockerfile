# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Runtime
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public

USER app

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
