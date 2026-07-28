#!/bin/bash
# ==============================================================================
# Tesla Canvas Streamer — Automated Oracle Cloud Always Free Setup Script
# ==============================================================================

set -e

echo "🚀 Starting Tesla Canvas Streamer Server Setup on Oracle Cloud..."

# 1. System updates & package installation
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates gnupg lsb-release iptables-persistent ufw

# 2. Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

# 3. Open Firewall Port 3000 in Ubuntu iptables
echo "🔓 Opening Port 3000 in OS Firewall..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save

# 4. Clone or update repository
APP_DIR="$HOME/tesla-canvas-streamer"
if [ -d "$APP_DIR" ]; then
    echo "🔄 Updating existing codebase..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "📥 Cloning Tesla Canvas Streamer from GitHub..."
    git clone https://github.com/davidc-alt/tesla-canvas-streamer.git "$APP_DIR"
    cd "$APP_DIR"
fi

# 5. Build and launch Docker container
echo "🏗️ Building Docker container for Tesla Canvas Streamer..."
sudo docker build -t tesla-canvas-streamer .

# Stop any running instance
sudo docker stop tesla-streamer || true
sudo docker rm tesla-streamer || true

echo "⚡ Starting Tesla Canvas Streamer container..."
sudo docker run -d \
  --name tesla-streamer \
  --restart always \
  -p 3000:3000 \
  -v tesla_storage:/app/storage \
  tesla-canvas-streamer

echo "=================================================="
echo "✅ Tesla Canvas Streamer is Live!"
echo "🌐 Server Public URL: http://$(curl -s ifconfig.me):3000"
echo "=================================================="
