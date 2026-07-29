FROM node:20-slim

# Install Python 3, FFmpeg, curl, and unzip required for stream extraction, encoding, and JS challenge solver
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno JS runtime for yt-dlp EJS challenge solving
RUN curl -fsSL https://deno.land/install.sh | sh && cp /root/.deno/bin/deno /usr/local/bin/deno

# Install latest yt-dlp binary directly
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install --production --ignore-scripts

# Run ffmpeg-static installation
RUN node node_modules/ffmpeg-static/install.js || true

COPY . .

# Ensure storage directory exists
RUN mkdir -p storage/library storage/temp

EXPOSE 3000

CMD ["node", "server.js"]
