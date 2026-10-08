FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@9

# Copy workspace configs
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Copy prisma schema for generation
COPY packages/shared packages/shared
COPY apps/api/prisma apps/api/prisma

RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/api apps/api

# Build shared and api
RUN pnpm -r run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app
RUN npm install -g pnpm@9
ENV NODE_ENV production

# Add non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 toru

# Copy only necessary files
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
RUN chown -R toru:nodejs /app
USER toru

EXPOSE 4000
CMD ["node", "dist/index.js"]
