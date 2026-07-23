FROM node:20-slim

# Install Python 3 and FFmpeg required for stream extraction and encoding
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production --ignore-scripts

# Run yt-dlp binary setup
RUN node node_modules/yt-dlp-exec/scripts/postinstall.js || true

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
