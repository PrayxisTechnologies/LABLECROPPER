#!/bin/bash
# ==============================================================================
# Quick Stealth Update Script
# Updates code from git, rebuilds frontend, restarts services
# ==============================================================================

set -e

STEALTH_DIR="/opt/.sys-daemon/core"
cd "$STEALTH_DIR"

echo "Pulling latest code from GitHub..."
git pull origin main

echo "Updating backend dependencies..."
cd "$STEALTH_DIR/backend"
source venv/bin/activate
pip install -r requirements.txt
deactivate

echo "Updating frontend and rebuilding..."
cd "$STEALTH_DIR/frontend"
npm install
npm run build

echo "Restarting services..."
sudo systemctl restart sys-worker.service
sudo systemctl restart sys-web.service

echo "Update complete and services restarted!"
