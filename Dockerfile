# Multi-stage build for SecretSentinel-ScannerRotator
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Install security updates
RUN apk --no-cache upgrade

# Create non-root user
RUN addgroup -g 1001 -S sentinel && \
    adduser -u 1001 -S sentinel -G sentinel

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy config defaults
COPY config ./config

# Create directories for runtime data
RUN mkdir -p /app/.sentinel_tmp /app/data && \
    chown -R sentinel:sentinel /app

# Switch to non-root user
USER sentinel

# Set environment variables
ENV NODE_ENV=production \
    SENTINEL_TMP_DIR=/app/.sentinel_tmp

# Expose metrics server port
EXPOSE 9095

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:9095/healthz', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));" || exit 1

# Default command - show help
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
