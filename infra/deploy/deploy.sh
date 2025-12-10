#!/usr/bin/env bash
set -e

PROJECT_DIR="/opt/mcshiftbot"

echo "[deploy] using project dir: $PROJECT_DIR"
cd "$PROJECT_DIR"

echo "[deploy] pulling latest code..."
git pull origin main

echo "[deploy] restarting bot service (if present)..."
if systemctl list-units --full -all | grep -q "mcshiftbot-bot.service"; then
  systemctl restart mcshiftbot-bot.service
else
  echo "[deploy] bot service not found (mcshiftbot-bot.service), skipping"
fi

echo "[deploy] done."
