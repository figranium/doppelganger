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
    git \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*; \
    fi

# Embedded captcha-solving service (ohmycaptcha) — used by default for the `solve_captcha`
# agent action; skipped at runtime if OHMYCAPTCHA_URL points at an external instance.
# PLAYWRIGHT_BROWSERS_PATH is scoped to this one command so ohmycaptcha's own (Python)
# Playwright install writes to its own cache directory instead of the base image's shared
# /ms-playwright, whose pre-baked Node.js browser build it would otherwise garbage-collect
# as "unreferenced" when it installs its own (mismatched) browser version there.
# Only fastapi/uvicorn/httpx/pydantic/playwright/openai/Pillow are installed — the upstream
# requirements.txt also pins mkdocs* (their docs-site generator) and pytest (their own test
# suite), neither used at runtime. docs/, tests/, skills/ (Claude/Cursor skill docs), and
# typings/ (pyright stubs) are likewise dev/doc-only and stripped after cloning, along with
# .git itself, to keep this layer from carrying content the running service never touches.
RUN git clone --depth 1 https://github.com/shenhao-stu/ohmycaptcha.git /opt/ohmycaptcha \
    && rm -rf /opt/ohmycaptcha/.git /opt/ohmycaptcha/docs /opt/ohmycaptcha/tests \
    /opt/ohmycaptcha/skills /opt/ohmycaptcha/typings /opt/ohmycaptcha/mkdocs.yml \
    /opt/ohmycaptcha/*.md /opt/ohmycaptcha/render.yaml /opt/ohmycaptcha/Dockerfile.render \
    /opt/ohmycaptcha/pyrightconfig.json \
    && grep -viE '^(mkdocs|pymdown-extensions|pytest)' /opt/ohmycaptcha/requirements.txt \
    > /opt/ohmycaptcha/requirements.runtime.txt \
    && pip3 install --no-cache-dir -r /opt/ohmycaptcha/requirements.runtime.txt \
    && PLAYWRIGHT_BROWSERS_PATH=/opt/ohmycaptcha-browsers python3 -m playwright install --with-deps chromium

# Install production deps only
COPY package*.json ./
COPY scripts ./scripts
ENV FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

# Copy server and built assets
COPY --from=build /app/dist /app/dist
COPY --from=build /app/public /app/public
COPY --from=build /app/*.js /app/
COPY --from=build /app/src /app/src
COPY --from=build /app/start-vnc.sh /app/start-vnc.sh
COPY --from=build /app/start-captcha.sh /app/start-captcha.sh
COPY --from=build /app/entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/start-vnc.sh /app/start-captcha.sh /app/entrypoint.sh \
    && chmod +x /app/start-vnc.sh /app/start-captcha.sh /app/entrypoint.sh

EXPOSE 11345
ENV NODE_ENV=production

CMD ["/app/entrypoint.sh"]
