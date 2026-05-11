#!/bin/bash
# ============================================================
# GymFlow Track — Initial Server Setup Script
# ============================================================
# Run this ONCE on a fresh Hetzner CAX11 ARM64 VPS (Ubuntu 24.04)
#
# Usage:
#   scp scripts/server-setup.sh root@YOUR_VPS_IP:/tmp/
#   ssh root@YOUR_VPS_IP 'bash /tmp/server-setup.sh'
#
# What this does:
#   1. System updates
#   2. Creates non-root deploy user
#   3. Installs Docker Engine
#   4. Configures UFW firewall
#   5. Installs basic monitoring tools
#   6. Sets up backup cron
#   7. Clones the repository
# ============================================================

set -euo pipefail

APP_USER="${APP_USER:-gymflow}"
APP_DIR="/opt/gymflow"
REPO_URL="${REPO_URL:-https://github.com/YOUR_ORG/gym-management-system.git}"

echo "============================================="
echo "GymFlow Track — Server Setup"
echo "============================================="

# ── 1. System update ─────────────────────────────────────────
echo "[1/7] Updating system..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git unzip htop ncdu fail2ban ufw awscli

# ── 2. Create deploy user ───────────────────────────────────
echo "[2/7] Creating deploy user: $APP_USER"
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash -G sudo "$APP_USER"
    echo "  Created user: $APP_USER"
    echo "  Set password: passwd $APP_USER"
else
    echo "  User $APP_USER already exists"
fi

# ── 3. Install Docker ───────────────────────────────────────
echo "[3/7] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker "$APP_USER"
    systemctl enable docker
    systemctl start docker
    echo "  Docker installed: $(docker --version)"
else
    echo "  Docker already installed: $(docker --version)"
fi

# ── 4. Configure UFW firewall ────────────────────────────────
echo "[4/7] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # Port 22
ufw allow http         # Port 80 (Caddy HTTP → HTTPS redirect)
ufw allow https        # Port 443 (Caddy HTTPS)
# NOTE: PostgreSQL (5432) and Redis (6379) are NOT exposed
ufw --force enable
echo "  Firewall rules:"
ufw status verbose

# ── 5. Configure fail2ban ────────────────────────────────────
echo "[5/7] Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# ── 6. Setup app directory ───────────────────────────────────
echo "[6/7] Setting up application directory..."
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/backups"

if [ ! -d "$APP_DIR/.git" ]; then
    echo "  Clone your repo:"
    echo "    git clone $REPO_URL $APP_DIR"
else
    echo "  Repository already cloned"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 7. Setup backup cron ────────────────────────────────────
echo "[7/7] Setting up backup cron..."
CRON_LINE="0 2 * * * cd $APP_DIR && /bin/bash scripts/backup-db.sh >> /var/log/gymflow-backup.log 2>&1"
(crontab -u "$APP_USER" -l 2>/dev/null; echo "$CRON_LINE") | sort -u | crontab -u "$APP_USER" -

echo ""
echo "============================================="
echo "Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Clone repo:      git clone YOUR_REPO $APP_DIR"
echo "  2. Configure env:   cp $APP_DIR/.env.example.production $APP_DIR/.env"
echo "  3. Edit secrets:    nano $APP_DIR/.env"
echo "  4. Point DNS:       A records → $(curl -s4 ifconfig.me 2>/dev/null || echo 'YOUR_VPS_IP')"
echo "     - app.gymflowtrack.in"
echo "     - admin.gymflowtrack.in"
echo "     - api.gymflowtrack.in"
echo "     - gymflowtrack.in"
echo "  5. Deploy:          cd $APP_DIR && ./scripts/deploy.sh"
echo "  6. Run migrations:  docker compose -f docker-compose.prod.yml exec backend alembic upgrade head"
echo "============================================="
