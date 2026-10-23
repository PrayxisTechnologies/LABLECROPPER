#!/bin/bash
# ==============================================================================
# Stealth Setup & Deployment Script for AWS EC2 (Ubuntu 22.04 / 24.04 LTS)
# Domain: labalecropper.prayxis.in & labelcropper.prayxis.in
# Target Directory: /opt/.sys-daemon (Hidden system-level directory)
# ==============================================================================

set -e

echo "=========================================================="
echo " Starting Stealth Production Deployment on EC2"
echo "=========================================================="

# 1. Update system packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx \
    python3 python3-pip python3-venv build-essential

# 2. Install Node.js 20 LTS (if not installed)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# 3. Create Hidden Discreet Directory
STEALTH_DIR="/opt/.sys-daemon"
sudo mkdir -p "$STEALTH_DIR"
sudo chown -R $USER:$USER "$STEALTH_DIR"
sudo chmod 700 "$STEALTH_DIR"

cd "$STEALTH_DIR"

# 4. Clone or pull code from GitHub
if [ -d "$STEALTH_DIR/core/.git" ]; then
    echo "Updating existing repository..."
    cd "$STEALTH_DIR/core"
    git pull origin main
else
    echo "Cloning repository secretly into $STEALTH_DIR/core..."
    git clone https://github.com/PrayxisTechnologies/LABLECROPPER.git "$STEALTH_DIR/core"
    cd "$STEALTH_DIR/core"
fi

# 5. Set up Backend Python Virtual Environment
echo "Setting up Python Backend environment..."
cd "$STEALTH_DIR/core/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Create Secure Backend .env
cat << 'EOF' > "$STEALTH_DIR/core/backend/.env"
PROJECT_NAME="LabelFlow API"
VERSION="1.0.0"
ENVIRONMENT="production"
DEBUG=False

# Host & Port (Internal only)
BACKEND_HOST="127.0.0.1"
BACKEND_PORT=8000
API_V1_PREFIX="/api/v1"

# CORS Origins
ALLOWED_CORS_ORIGINS="https://labalecropper.prayxis.in,http://labalecropper.prayxis.in,https://labelcropper.prayxis.in,http://labelcropper.prayxis.in,http://localhost:3000,http://127.0.0.1:3000"

# MongoDB Database Configuration
MONGODB_URI="mongodb+srv://prayxistechnologies_db_user:3ELAR327CBt6w8Jy@cluster0.lc8hqsq.mongodb.net/labelflow?retryWrites=true&w=majority"
MONGODB_DATABASE="labelflow"
MONGODB_CONNECT_TIMEOUT_MS=15000

# Authentication & JWT Configuration
AUTH_SECRET_KEY="labelflow-jwt-secret-key-prod-2026-super-secure-token-meesho-cropper"
AUTH_ALGORITHM="HS256"
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=10080
AUTH_COOKIE_NAME="labelflow_token"

# Upload Limits & Safeguards
MAX_UPLOAD_SIZE_MB=50
MAX_UPLOAD_FILES=10
ALLOWED_MIME_TYPES="application/pdf"

# SMTP Mailer Configuration
SMTP_HOST="smtpout.secureserver.net"
SMTP_PORT=465
SMTP_USER="info@prayxis.in"
SMTP_PASS="Prayxis@1234asdfG"
EMAIL_FROM="LabelFlow <info@prayxis.in>"

# Google OAuth2 & Google Drive Configuration
GOOGLE_CLIENT_ID="731856438069-7qij5j2sm71ba19c181qk0evbgabqo80.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="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"
GOOGLE_REDIRECT_URI="https://labalecropper.prayxis.in/auth/google/callback"
GOOGLE_DRIVE_FOLDER_NAME="LabelFlow - Meesho Labels"
EOF

chmod 600 "$STEALTH_DIR/core/backend/.env"
deactivate

# 6. Set up Frontend Next.js Production Build
echo "Building Frontend Next.js..."
cd "$STEALTH_DIR/core/frontend"

# Create Secure Frontend .env.local
cat << 'EOF' > "$STEALTH_DIR/core/frontend/.env.local"
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_USER=info@prayxis.in
SMTP_PASS=Prayxis@1234asdfG
EMAIL_FROM="LabelFlow <info@prayxis.in>"
OTP_EXPIRY_MINUTES=10

MONGODB_URI="mongodb+srv://prayxistechnologies_db_user:3ELAR327CBt6w8Jy@cluster0.lc8hqsq.mongodb.net/labelflow?retryWrites=true&w=majority"
MONGODB_DB="labelflow"

NEXT_PUBLIC_GOOGLE_CLIENT_ID="731856438069-7qij5j2sm71ba19c181qk0evbgabqo80.apps.googleusercontent.com"
NEXT_PUBLIC_API_URL="/api/v1"
EOF

chmod 600 "$STEALTH_DIR/core/frontend/.env.local"

npm install
npm run build

# 7. Configure Systemd Services (Named discreetly as system services)
echo "Configuring Systemd Services..."

# Backend Daemon Service
sudo tee /etc/systemd/system/sys-worker.service > /dev/null << EOF
[Unit]
Description=System Worker Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$STEALTH_DIR/core/backend
ExecStart=$STEALTH_DIR/core/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5
Environment=PATH=$STEALTH_DIR/core/backend/venv/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

# Frontend Web Service
sudo tee /etc/systemd/system/sys-web.service > /dev/null << EOF
[Unit]
Description=System Web Service
After=network.target sys-worker.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$STEALTH_DIR/core/frontend
ExecStart=/usr/bin/npm run start -- -p 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

# Reload & Start Services
sudo systemctl daemon-reload
sudo systemctl enable sys-worker.service
sudo systemctl enable sys-web.service
sudo systemctl restart sys-worker.service
sudo systemctl restart sys-web.service

# 8. Configure Nginx Reverse Proxy
echo "Configuring Nginx..."
sudo cp "$STEALTH_DIR/core/deploy/nginx.conf" /etc/nginx/sites-available/labalecropper
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/labalecropper /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

echo "=========================================================="
echo " Core Services Deployed & Running!"
echo " Backend: http://127.0.0.1:8000 (Active via sys-worker)"
echo " Frontend: http://127.0.0.1:3000 (Active via sys-web)"
echo " Nginx: Reverse proxy active on Port 80"
echo "=========================================================="
echo " NEXT STEP (After GoDaddy DNS A record points to this IP):"
echo " Run Certbot SSL command:"
echo " sudo certbot --nginx -d labalecropper.prayxis.in -d labelcropper.prayxis.in --agree-tos -m prayxistechnologies@gmail.com --redirect --non-interactive"
echo "=========================================================="
