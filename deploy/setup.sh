#!/usr/bin/env bash
# ==============================================================================
# LabelFlow Hostinger VPS Automated Server Setup Script (Ubuntu / Debian)
# Usage: sudo bash deploy/setup.sh
# ==============================================================================

set -e

echo "🚀 Starting LabelFlow Server Setup on Hostinger VPS..."

# 1. Update OS packages
echo "📦 Updating package lists..."
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git build-essential ufw software-properties-common nginx certbot python3-certbot-nginx

# 2. Install Python 3.11 & tools
echo "🐍 Installing Python 3 and venv..."
sudo apt-get install -y python3 python3-pip python3-venv

# 3. Install Node.js 20 LTS & PM2
echo "🟢 Installing Node.js 20 LTS & PM2..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

sudo npm install -g pm2

# 4. Setup UFW Firewall
echo "🛡️ Configuring Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# 5. Setup Project Python Virtual Environment
echo "📦 Setting up Backend Virtual Environment..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
mkdir -p storage/jobs storage/temp
chmod -R 775 storage
deactivate
cd ..

# 6. Build Frontend
echo "⚛️ Building Frontend Next.js..."
cd frontend
npm install
npm run build
cd ..

# 7. Start PM2 Processes
echo "🚀 Starting services with PM2..."
mkdir -p logs
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root || true

echo "✅ LabelFlow is now running locally on ports 8000 (Backend) and 3000 (Frontend)!"
echo "👉 Next steps:"
echo "1. Configure Nginx: sudo cp deploy/nginx.conf /etc/nginx/sites-available/labelflow"
echo "2. Edit domain in Nginx file: sudo nano /etc/nginx/sites-available/labelflow"
echo "3. Enable site: sudo ln -s /etc/nginx/sites-available/labelflow /etc/nginx/sites-enabled/"
echo "4. Test Nginx: sudo nginx -t && sudo systemctl reload nginx"
echo "5. Issue Free SSL: sudo certbot --nginx -d YOUR_DOMAIN.COM -d www.YOUR_DOMAIN.COM"
