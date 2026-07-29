# This Dockerfile supports multi-arch builds (linux/amd64, linux/arm64)
# relying on multi-arch base images from Node and Playwright.
FROM node:22-bullseye AS build

WORKDIR /app

# Install deps (include dev deps for build)
COPY package*.json ./
COPY scripts ./scripts
ENV FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --include=dev

# Build frontend
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.57.0-jammy AS runtime

WORKDIR /app

# Install VNC + noVNC tooling for containerized headful viewer (optional for CI)
ARG INSTALL_VNC=1
ENV DEBIAN_FRONTEND=noninteractive
RUN if [ "$INSTALL_VNC" = "1" ]; then \
    apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update \
    && apt-get install -y --no-install-recommends \
    novnc \
    websockify \
    x11vnc \
    xvfb \
    curl \
    openssl \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    dbus-x11 \
    && rm -rf /var/lib/apt/lists/*; \
    fi

# Install production deps only
COPY package*.json ./
COPY scripts ./scripts
ENV FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

# Ensure Playwright browsers + OS deps are available
RUN npx playwright install --with-deps chromium chrome firefox webkit

# Copy server and built assets
COPY --from=build /app/dist /app/dist
COPY --from=build /app/public /app/public
COPY --from=build /app/*.js /app/
COPY --from=build /app/src /app/src
COPY --from=build /app/start-vnc.sh /app/start-vnc.sh
RUN sed -i 's/\r$//' /app/start-vnc.sh && chmod +x /app/start-vnc.sh

EXPOSE 11345
ENV NODE_ENV=production

CMD ["/app/start-vnc.sh"]
