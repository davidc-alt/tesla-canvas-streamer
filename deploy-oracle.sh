#!/bin/bash
# Tesla Canvas Streamer — Automated Oracle Cloud Deployment Script
set -e

echo "🚀 Installing dependencies & Docker on Oracle Cloud Ubuntu VM..."
sudo apt-get update
sudo apt-get install -y docker.io git curl

echo "🔧 Starting Docker service..."
sudo systemctl enable --now docker

echo "📥 Cloning latest Tesla Canvas Streamer repository..."
if [ -d "/opt/tesla-canvas-streamer" ]; then
  sudo rm -rf /opt/tesla-canvas-streamer
fi

sudo git clone https://github.com/davidc-alt/tesla-canvas-streamer.git /opt/tesla-canvas-streamer
cd /opt/tesla-canvas-streamer

echo "🛠️ Building Docker container image..."
sudo docker build -t tesla-canvas-streamer .

echo "🧹 Stopping any existing container..."
sudo docker stop tesla-streamer 2>/dev/null || true
sudo docker rm tesla-streamer 2>/dev/null || true

echo "⚡ Starting Tesla Canvas Streamer container on port 80..."
sudo docker run -d \
  --name tesla-streamer \
  --restart unless-stopped \
  -p 80:3000 \
  -v tesla_storage:/app/storage \
  tesla-canvas-streamer

echo "🔓 Opening HTTP port 80 in iptables firewall..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo netfilter-persistent save 2>/dev/null || true

echo "=================================================="
echo "✅ Tesla Canvas Streamer Successfully Deployed!"
echo "🌐 Server URL: http://$(curl -s ifconfig.me)"
echo "=================================================="
