#!/bin/bash
# ============================================================
# GymFlow Track — VPS Bootstrap Script (Enterprise)
# ============================================================
# Run this ONCE on a fresh Hetzner CAX11 ARM64 VPS (Ubuntu 24.04)
#
# Usage:
#   scp scripts/server-setup.sh root@YOUR_VPS_IP:/tmp/
#   ssh root@YOUR_VPS_IP 'bash /tmp/server-setup.sh'
#
# Security hardening:
#   - SSH key-only auth, no password login
#   - UFW firewall (only 80, 443, SSH)
#   - fail2ban with custom jail configs
#   - Docker daemon hardening
#   - Sysctl tuning for TCP stack
#   - Swap for OOM protection
#   - Automatic security updates
#   - Non-root deploy user
# ============================================================

set -euo pipefail

APP_USER="${APP_USER:-gymflowtrack}"
APP_DIR="/opt/gymflowtrack"
SSH_PORT="${SSH_PORT:-22}"
REPO_URL="${REPO_URL:-https://github.com/mdshoaibumer/gym-management-system.git}"

echo "============================================="
echo "GymFlow Track — Enterprise Server Setup"
echo "Target: Hetzner CAX11 ARM64 (4GB RAM)"
echo "============================================="

# ── 1. System update ─────────────────────────────────────────
echo "[1/12] Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y
apt-get install -y \
    curl git unzip htop ncdu fail2ban ufw awscli \
    ca-certificates gnupg lsb-release \
    logrotate jq tree \
    libpq-dev openssl

# ── 2. Create deploy user ───────────────────────────────────
echo "[2/12] Creating deploy user: $APP_USER"
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash -G sudo "$APP_USER"
    echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$APP_USER"
    chmod 0440 "/etc/sudoers.d/$APP_USER"

    # Copy root SSH keys to deploy user
    mkdir -p "/home/$APP_USER/.ssh"
    if [ -f /root/.ssh/authorized_keys ]; then
        cp /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
    fi
    chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh"
    chmod 700 "/home/$APP_USER/.ssh"
    chmod 600 "/home/$APP_USER/.ssh/authorized_keys" 2>/dev/null || true
    echo "  Created user: $APP_USER (with sudo, SSH keys copied)"
else
    echo "  User $APP_USER already exists"
fi

# ── 3. SSH Hardening ─────────────────────────────────────────
echo "[3/12] Hardening SSH..."
SSHD_CONFIG="/etc/ssh/sshd_config"
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak"

# Disable password authentication — key-only
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' "$SSHD_CONFIG"
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#\?UsePAM.*/UsePAM yes/' "$SSHD_CONFIG"

# Security improvements
cat >> "$SSHD_CONFIG" <<'SSHEOF'

# === GymFlow Security Hardening ===
# Idle timeout (5 minutes)
ClientAliveInterval 300
ClientAliveCountMax 2

# Limit authentication attempts
MaxAuthTries 3
MaxSessions 3

# Disable unused features
X11Forwarding no
AllowAgentForwarding no
PermitEmptyPasswords no

# Only allow specific user
AllowUsers gymflowtrack root
SSHEOF

# Validate and reload
sshd -t && systemctl reload sshd
echo "  SSH hardened: key-only, timeout=5min, max-tries=3"

# ── 4. UFW Firewall ─────────────────────────────────────────
echo "[4/12] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT/tcp" comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Caddy redirect)'
ufw allow 443/tcp comment 'HTTPS (Caddy)'
ufw allow 443/udp comment 'HTTP/3 QUIC'

# Rate limit SSH
ufw limit "$SSH_PORT/tcp" comment 'SSH rate limit'

ufw --force enable
echo "  Firewall active:"
ufw status numbered

# ── 5. fail2ban Configuration ───────────────────────────────
echo "[5/12] Configuring fail2ban..."

# SSH jail (stricter than default)
cat > /etc/fail2ban/jail.local <<'F2BEOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
banaction = ufw
backend = systemd

[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 3
bantime = 7200
findtime = 600

# Ban repeated 4xx/5xx on API (custom filter)
[gymflowtrack-api]
enabled = true
port = http,https
filter = gymflowtrack-api
logpath = /var/log/gymflowtrack-api.log
maxretry = 20
findtime = 60
bantime = 600
F2BEOF

# Custom filter for API abuse
cat > /etc/fail2ban/filter.d/gymflowtrack-api.conf <<'FILTEREOF'
[Definition]
failregex = ^.*"client_ip":\s*"<HOST>".*"status_code":\s*(401|403|429).*$
ignoreregex =
FILTEREOF

systemctl enable fail2ban
systemctl restart fail2ban
echo "  fail2ban configured with SSH + API jails"

# ── 6. Install Docker ───────────────────────────────────────
echo "[6/12] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker "$APP_USER"
    systemctl enable docker
    systemctl start docker
    echo "  Docker installed: $(docker --version)"
else
    echo "  Docker already installed: $(docker --version)"
fi

# Docker daemon hardening
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'DOCKEREOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65536,
      "Soft": 32768
    },
    "nproc": {
      "Name": "nproc",
      "Hard": 4096,
      "Soft": 2048
    }
  },
  "storage-driver": "overlay2"
}
DOCKEREOF

systemctl restart docker
echo "  Docker daemon hardened"

# ── 7. Sysctl Tuning ────────────────────────────────────────
echo "[7/12] Tuning kernel parameters..."
cat > /etc/sysctl.d/99-gymflowtrack.conf <<'SYSCTLEOF'
# === GymFlow TCP/Network Tuning ===
# Increase connection tracking for high-concurrency
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000

# TCP keepalive (detect dead connections faster)
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15

# TCP performance
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_timestamps = 1

# File descriptor limits
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288

# Memory overcommit (prevent OOM in some cases)
vm.overcommit_memory = 1
vm.swappiness = 10

# Network security
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
SYSCTLEOF

sysctl --system > /dev/null 2>&1
echo "  Kernel tuned"

# ── 8. Swap Configuration ───────────────────────────────────
echo "[8/12] Configuring swap..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "  2GB swap created"
else
    echo "  Swap already configured"
fi

# ── 9. Automatic Security Updates ───────────────────────────
echo "[9/12] Configuring automatic security updates..."
apt-get install -y unattended-upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APTEOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
APTEOF
echo "  Automatic security updates enabled"

# ── 10. Log Rotation ────────────────────────────────────────
echo "[10/12] Configuring log rotation..."
cat > /etc/logrotate.d/gymflowtrack <<'LOGEOF'
/var/log/gymflowtrack-*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    copytruncate
}
LOGEOF
echo "  Log rotation configured (14 days)"

# ── 11. App Directory & Cron ────────────────────────────────
echo "[11/12] Setting up application..."
mkdir -p "$APP_DIR" "$APP_DIR/backups"

if [ ! -d "$APP_DIR/.git" ]; then
    echo "  Clone your repo:"
    echo "    git clone $REPO_URL $APP_DIR"
else
    echo "  Repository already cloned"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Backup cron (daily at 2 AM, weekly full backup at Sunday 3 AM)
DAILY_CRON="0 2 * * * cd $APP_DIR && /bin/bash scripts/backup-db.sh >> /var/log/gymflowtrack-backup.log 2>&1"
PRUNE_CRON="0 4 * * 0 docker system prune -af --filter 'until=168h' >> /var/log/gymflowtrack-prune.log 2>&1"

(crontab -u "$APP_USER" -l 2>/dev/null; echo "$DAILY_CRON"; echo "$PRUNE_CRON") | sort -u | crontab -u "$APP_USER" -
echo "  Cron jobs configured"

# ── 12. Health Check Script ─────────────────────────────────
echo "[12/12] Creating health check helper..."
cat > /usr/local/bin/gymflowtrack-status <<'STATUSEOF'
#!/bin/bash
echo "=== GymFlow Track Status ==="
echo ""
echo "── System ──"
echo "Uptime: $(uptime -p)"
echo "Memory: $(free -h | awk '/Mem:/ {printf "%s used / %s total (%.0f%%)", $3, $2, $3/$2*100}')"
echo "Disk:   $(df -h / | awk 'NR==2 {printf "%s used / %s total (%s)", $3, $2, $5}')"
echo "Swap:   $(free -h | awk '/Swap:/ {printf "%s used / %s total", $3, $2}')"
echo ""
echo "── Docker ──"
cd /opt/gymflowtrack 2>/dev/null && docker compose -f docker-compose.prod.yml ps 2>/dev/null || echo "Not running"
echo ""
echo "── API Health ──"
curl -sf --max-time 5 http://localhost:8000/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "Backend unreachable"
echo ""
echo "── Recent Backups ──"
ls -lh /opt/gymflowtrack/backups/ 2>/dev/null | tail -5
echo ""
echo "── fail2ban ──"
fail2ban-client status sshd 2>/dev/null | grep -E "Currently|Total" || echo "Not running"
STATUSEOF
chmod +x /usr/local/bin/gymflowtrack-status

echo ""
echo "============================================="
echo "Server setup complete!"
echo ""
echo "Security applied:"
echo "  - SSH: key-only, root login restricted, timeout=5min"
echo "  - UFW: only ports 22, 80, 443 open"
echo "  - fail2ban: SSH + API abuse jails"
echo "  - Docker: daemon hardened, no-new-privileges"
echo "  - Kernel: TCP tuned, security parameters set"
echo "  - Swap: 2GB configured"
echo "  - Updates: automatic security patches"
echo ""
echo "Next steps:"
echo "  1. Clone repo:      git clone YOUR_REPO $APP_DIR"
echo "  2. Configure env:   cp $APP_DIR/.env.example.production $APP_DIR/.env"
echo "  3. Edit secrets:    nano $APP_DIR/.env"
echo "  4. Point DNS A records → $(curl -s4 ifconfig.me 2>/dev/null || echo 'YOUR_VPS_IP')"
echo "     - app.gymflowtrack.in"
echo "     - admin.gymflowtrack.in"
echo "     - api.gymflowtrack.in"
echo "     - gymflowtrack.in"
echo "  5. Deploy:          cd $APP_DIR && ./scripts/deploy.sh"
echo ""
echo "Quick status: gymflow-status"
echo "============================================="
