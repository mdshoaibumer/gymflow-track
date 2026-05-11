# GymFlow Track — Production Deployment Guide

## Target Architecture

```
Internet → Cloudflare DNS → Hetzner CAX11 (ARM64)
                                  │
                              UFW Firewall (80, 443, 22 only)
                                  │
                              Caddy (auto HTTPS)
                                  │
                    ┌─────────────┼─────────────┐
                    │             │              │
              app.gymflowtrack.in │    api.gymflowtrack.in
             admin.gymflowtrack.in│
                    │             │              │
                Frontend:3000   Backend:8000    │
                    │             │              │
                    └──────┬──────┘              │
                           │                     │
                    ┌──────┼──────┐              │
                    │             │              │
               PostgreSQL:5432  Redis:6379      │
               (internal only)  (internal only)  │
```

**Subdomains:**
| Subdomain | Target | Purpose |
|---|---|---|
| `gymflowtrack.in` | Redirect → app | Marketing site (future) |
| `app.gymflowtrack.in` | Frontend:3000 | Customer app |
| `admin.gymflowtrack.in` | Frontend:3000 | Super admin portal |
| `api.gymflowtrack.in` | Backend:8000 | REST API |

---

## Server Specifications

| Resource | CAX11 | Usage |
|---|---|---|
| CPU | 2 vCPU (ARM64) | Sufficient for 10 gyms |
| RAM | 4 GB | ~2.5 GB used by stack |
| Disk | 40 GB NVMe | ~10 GB for app + backups |
| Cost | ~€3.79/mo | |

---

## Step-by-Step Deployment

### 1. Create VPS

1. Hetzner Cloud Console → Create Server
2. **Location:** Nuremberg/Falkenstein (closest to India: Helsinki)
3. **Image:** Ubuntu 24.04
4. **Type:** CAX11 (ARM64, 2 vCPU, 4 GB)
5. **SSH Key:** Add your public key
6. **Name:** `gymflow-prod-1`

### 2. Initial Server Setup

```bash
# SSH in
ssh root@YOUR_VPS_IP

# Run setup script
bash /tmp/server-setup.sh
# Or manually:
apt update && apt upgrade -y
apt install -y curl git unzip htop fail2ban ufw

# Install Docker
curl -fsSL https://get.docker.com | sh

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw enable

# Create deploy user
useradd -m -s /bin/bash -G sudo,docker gymflow
passwd gymflow
```

### 3. Configure Cloudflare DNS

In Cloudflare Dashboard → DNS → Add records:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | YOUR_VPS_IP | DNS only (gray cloud) |
| A | `app` | YOUR_VPS_IP | DNS only (gray cloud) |
| A | `admin` | YOUR_VPS_IP | DNS only (gray cloud) |
| A | `api` | YOUR_VPS_IP | DNS only (gray cloud) |

> **IMPORTANT:** Set Proxy status to "DNS only" (gray cloud) initially so Caddy can obtain Let's Encrypt certificates. You can enable Cloudflare proxy later after HTTPS is working.

### 4. Deploy Application

```bash
# Switch to deploy user
su - gymflow

# Clone repository
git clone https://github.com/YOUR_ORG/gym-management-system.git /opt/gymflow
cd /opt/gymflow

# Configure environment
cp .env.example.production .env

# Generate secrets and fill in .env
python3 -c "import secrets; print(secrets.token_hex(32))"  # For JWT_SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(24))"  # For POSTGRES_PASSWORD

nano .env  # Edit all REQUIRED values

# Create backup directory
mkdir -p /opt/gymflow/backups

# Build and start (first time takes ~5 minutes on ARM64)
docker compose -f docker-compose.prod.yml up -d --build

# Wait for services to be healthy
docker compose -f docker-compose.prod.yml ps

# Run database migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### 5. Verify Deployment

```bash
# Health check
curl -s https://api.gymflowtrack.in/health | python3 -m json.tool

# Frontend
curl -s -o /dev/null -w "%{http_code}" https://app.gymflowtrack.in

# Admin portal
curl -s -o /dev/null -w "%{http_code}" https://admin.gymflowtrack.in

# Container status
docker compose -f docker-compose.prod.yml ps
```

---

## ARM64 Compatibility

All Docker images used are ARM64-compatible:

| Image | ARM64 Support |
|---|---|
| `python:3.12-slim` | Multi-arch (amd64/arm64) |
| `node:20-alpine` | Multi-arch (amd64/arm64) |
| `postgres:16-alpine` | Multi-arch (amd64/arm64) |
| `redis:7-alpine` | Multi-arch (amd64/arm64) |
| `caddy:2-alpine` | Multi-arch (amd64/arm64) |

### Building for ARM64 from non-ARM machines

If building images on your local x86 machine for ARM64 deployment:

```bash
# Create a buildx builder
docker buildx create --name arm64builder --use

# Build for ARM64
docker buildx build --platform linux/arm64 -t gymflow-backend:latest ./backend --load
docker buildx build --platform linux/arm64 -t gymflow-frontend:latest ./frontend --load
```

> **Recommended:** Build directly on the VPS to avoid cross-compilation issues.

---

## Backup & Restore

### Automated Backups

Cron job runs daily at 2 AM (configured by server-setup.sh):

```
0 2 * * * cd /opt/gymflow && bash scripts/backup-db.sh >> /var/log/gymflow-backup.log 2>&1
```

### Manual Backup

```bash
cd /opt/gymflow
./scripts/backup-db.sh
```

### Restore from Backup

```bash
# List available backups
ls -la backups/

# Restore (DESTRUCTIVE — replaces all data)
./scripts/restore-db.sh backups/gymflow_YYYYMMDD_HHMMSS.dump
```

### Backup Verification

```bash
# Verify a backup file
pg_restore --list backups/gymflow_YYYYMMDD_HHMMSS.dump | head -20
```

### Offsite Backups (Cloudflare R2)

1. Create R2 bucket in Cloudflare dashboard
2. Generate R2 API token with read/write permissions
3. Add to `.env`:
   ```
   R2_BUCKET=gymflow-backups
   R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=your_access_key
   R2_SECRET_ACCESS_KEY=your_secret_key
   ```
4. Install AWS CLI: `apt install awscli`
5. Backups will auto-upload to R2

---

## Monitoring

### Health Endpoints

| Endpoint | Purpose | Used By |
|---|---|---|
| `GET /health` | Full health (DB check) | Docker healthcheck, UptimeRobot |
| `GET /health/live` | Process alive? | Container liveness |
| `GET /health/ready` | Ready for traffic? | Load balancer readiness |

### UptimeRobot Setup

1. Create account at [uptimerobot.com](https://uptimerobot.com)
2. Add monitors:
   - **API Health:** `https://api.gymflowtrack.in/health` (HTTP, 5 min)
   - **App Frontend:** `https://app.gymflowtrack.in` (HTTP, 5 min)
   - **Admin Portal:** `https://admin.gymflowtrack.in` (HTTP, 5 min)
3. Configure alert contacts (email, Telegram, etc.)

### Sentry Error Tracking

1. Create project at [sentry.io](https://sentry.io)
2. Copy DSN and add to `.env`:
   ```
   SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx
   ```
3. Restart backend: `docker compose -f docker-compose.prod.yml restart backend`

### Log Viewing

```bash
# All logs
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend --tail=50
docker compose -f docker-compose.prod.yml logs -f caddy --tail=50

# Backup logs
tail -f /var/log/gymflow-backup.log
```

---

## Routine Operations

### Deploy Updates

```bash
cd /opt/gymflow
./scripts/deploy.sh
```

### Quick Restart (config change, no rebuild)

```bash
./scripts/deploy.sh --quick
```

### Rollback

```bash
# Find the previous commit
git log --oneline -5

# Reset to it
git reset --hard <commit_hash>

# Quick restart
./scripts/deploy.sh --quick

# Restore database if needed
./scripts/restore-db.sh backups/<pre_deploy_backup>.dump
```

### SSL Certificate Renewal

Caddy handles this automatically. No action needed.

Verify: `docker compose -f docker-compose.prod.yml logs caddy | grep -i "certificate"`.

---

## Security Checklist

- [ ] UFW enabled (only 22, 80, 443 open)
- [ ] SSH key auth only (disable password auth)
- [ ] fail2ban running
- [ ] PostgreSQL NOT exposed (internal Docker network only)
- [ ] Redis NOT exposed (internal Docker network only)
- [ ] Strong POSTGRES_PASSWORD (32+ random chars)
- [ ] Strong JWT_SECRET_KEY (64+ random chars)
- [ ] COOKIE_SECURE=true
- [ ] DEBUG=false
- [ ] No wildcard CORS (specific origins only)
- [ ] TRUST_PROXY_HEADERS=true (behind Caddy)
- [ ] ALLOWED_HOSTS set to api.gymflowtrack.in
- [ ] HSTS headers enabled
- [ ] Swagger docs disabled in production (DEBUG=false)
- [ ] Sentry configured for error alerting
- [ ] Backup cron active and verified
- [ ] .env NOT committed to git

### Disable SSH Password Auth

```bash
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

---

## Production Validation Checklist

After deployment, verify each item:

- [ ] `https://api.gymflowtrack.in/health` returns `{"status": "healthy"}`
- [ ] `https://app.gymflowtrack.in` loads the login page
- [ ] `https://admin.gymflowtrack.in` loads the admin portal
- [ ] HTTPS certificates valid (check browser padlock)
- [ ] Register a new gym (tests full auth + DB + multi-tenant flow)
- [ ] Login → Dashboard → Members (tests auth cookies + CORS)
- [ ] Create/edit a member (tests write operations)
- [ ] Docker healthchecks passing: `docker compose -f docker-compose.prod.yml ps`
- [ ] Backup runs: `./scripts/backup-db.sh`
- [ ] Restore works: test on a staging copy
- [ ] `docker compose -f docker-compose.prod.yml logs backend` — no errors
- [ ] UptimeRobot monitors active and green

---

## Cost Summary (First 10 Gyms)

| Service | Monthly Cost |
|---|---|
| Hetzner CAX11 | ~€3.79 |
| Cloudflare DNS | Free |
| Cloudflare R2 (10 GB) | Free tier |
| Let's Encrypt SSL | Free |
| UptimeRobot (free tier) | Free |
| Sentry (free tier) | Free |
| **Total** | **~€3.79/mo** |

---

## Scaling Plan

When you outgrow CAX11:

1. **CAX21 (4 vCPU, 8 GB):** ~€7.49/mo — handles 50+ gyms
2. **CAX31 (8 vCPU, 16 GB):** ~€14.99/mo — handles 200+ gyms
3. **Managed PostgreSQL:** When DB needs exceed single-server capacity
4. **Multiple workers:** Increase uvicorn `--workers` to match CPU count
5. **CDN:** Enable Cloudflare proxy (orange cloud) for frontend assets

No Kubernetes needed until 500+ gyms or multi-region requirements.
