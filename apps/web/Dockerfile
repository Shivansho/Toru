FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@9

# Copy workspace configs
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

COPY packages/shared packages/shared
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/web apps/web

# Build shared and web
RUN pnpm -r run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app
RUN npm install -g pnpm@9
ENV NODE_ENV production

# Add non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "apps/web/server.js"]
