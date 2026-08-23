# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Fonts for the share-card SVG rasterization (share/ogImage.ts): librsvg
# renders text via fontconfig, and the bare Alpine image ships no fonts.
RUN apk add --no-cache fontconfig ttf-dejavu

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files and install production deps only
COPY package*.json ./
COPY yarn.lock ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER nodejs

ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/health || exit 1

# Start the server
CMD ["node", "dist/index.js"]
