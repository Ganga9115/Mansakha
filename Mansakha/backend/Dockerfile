# Cloud Run/Render target. Full (non-slim) Debian base - reportPdf.js's
# puppeteer.launch() uses puppeteer's own downloaded Chromium (no
# executablePath override), so the image needs Chromium's runtime shared
# libraries present on the OS even though npm never compiles Chromium
# itself; the "allowScripts" entry in package.json already permits
# puppeteer's postinstall download to run during npm ci below.
# Node 22+ (not 20) - @supabase/supabase-js's realtime-js dependency
# requires a native global WebSocket, which only exists from Node 22
# onward; confirmed live on Render, which crashed on Node 20 with
# "Node.js detected but native WebSocket not found."
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libpangocairo-1.0-0 libasound2 libx11-xcb1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Cloud Run injects PORT at runtime - server.js already reads
# process.env.PORT and binds 0.0.0.0 (see server.js's own listen() call).
EXPOSE 8080

CMD ["node", "server.js"]
