# GymFlow Track — Production Deployment Guide

**Target:** Hetzner CAX11 ARM64 / 4GB RAM / Ubuntu 24.04
**Architecture:** Docker Compose + Caddy (auto-TLS) + Cloudflare DNS

---

## Pre-Deployment Checklist

```
[ ] Hetzner VPS provisioned (CAX11 ARM64)
[ ] SSH key added to VPS
[ ] Domain gymflowtrack.in purchased
[ ] Cloudflare account configured
[ ] GitHub repo access configured
[ ] Razorpay production keys obtained
[ ] Sentry project created (optional)
```

---

## Step 1: DNS Configuration (Cloudflare)

Add these A records pointing to your VPS IP:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | app | YOUR_VPS_IP | DNS Only (gray cloud) |
| A | admin | YOUR_VPS_IP | DNS Only (gray cloud) |
| A | api | YOUR_VPS_IP | DNS Only (gray cloud) |
| A | @ | YOUR_VPS_IP | DNS Only (gray cloud) |

**Important:** Set proxy status to "DNS Only" initially so Caddy can obtain Let's Encrypt certificates. You can enable Cloudflare proxy later after certificates are issued.

### Verify DNS:
```bash
dig +short app.gymflowtrack.in
dig +short api.gymflowtrack.in
dig +short admin.gymflowtrack.in
# All should return your VPS IP
```

---

## Step 2: VPS Bootstrap

### 2.1 Upload and run server setup
```bash
# From your local machine
scp scripts/server-setup.sh root@YOUR_VPS_IP:/tmp/
ssh root@YOUR_VPS_IP 'bash /tmp/server-setup.sh'
```

### 2.2 Verify setup
```bash
ssh gymflow@YOUR_VPS_IP
sudo ufw status           # Should show 22, 80, 443 only
sudo fail2ban-client status sshd  # Should be active
docker --version           # Should be installed
free -h                    # Should show 2GB swap
```

### Expected output:
```
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     LIMIT       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
443/udp                    ALLOW       Anywhere
```

---

## Step 3: Clone & Configure

```bash
# As gymflow user
ssh gymflow@YOUR_VPS_IP
cd /opt/gymflow

# Clone repository
git clone https://github.com/YOUR_ORG/gym-management-system.git .
# Or if already cloned:
git pull origin main

# Create production environment file
cp .env.example.production .env
nano .env
```

### Generate secrets:
```bash
# JWT Secret (64 hex chars)
python3 -c "import secrets; print(secrets.token_hex(32))"

# PostgreSQL password
openssl rand -base64 24

# Redis password
openssl rand -base64 24

# Backup encryption key
openssl rand -hex 32

# Grafana password
openssl rand -base64 16
```

### Validate environment:
```bash
python3 scripts/validate_prod_env.py --env-file .env
# Should output: RESULT: PASS
```

---

## Step 4: First Deployment

```bash
cd /opt/gymflow

# Source environment
set -a; source .env; set +a

# Build and start core services
docker compose -f docker-compose.prod.yml up -d --build

# Watch build progress
docker compose -f docker-compose.prod.yml logs -f --tail=20

# Wait for all services to be healthy (1-2 minutes)
docker compose -f docker-compose.prod.yml ps

# Run database migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Seed super admin (if applicable)
docker compose -f docker-compose.prod.yml exec backend python -m app.scripts.seed_super_admin
```

### Expected container status:
```
NAME                 STATUS
gymflow-caddy-1      Up (healthy)
gymflow-db-1         Up (healthy)
gymflow-redis-1      Up (healthy)
gymflow-backend-1    Up (healthy)
gymflow-frontend-1   Up (healthy)
```

---

## Step 5: Start Monitoring Stack

```bash
# Start Prometheus + Grafana + Loki + Node Exporter
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d

# Verify monitoring
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml ps
```

### Access Grafana:
- URL: `https://api.gymflowtrack.in/grafana/`
- Default credentials: admin / (your GRAFANA_PASSWORD)
- Dashboard: "GymFlow Track — Production Overview" should auto-load

---

## Step 6: Verification

### 6.1 API Health
```bash
# From VPS (internal)
curl -s http://localhost:8000/health | python3 -m json.tool
# Expected: {"status": "healthy", "service": "GymFlow Track", "environment": "production"}

curl -s http://localhost:8000/health/ready | python3 -m json.tool
# Expected: {"status": "ready", "checks": {"database": "ok", "scheduler": "running"}}

# From external (your laptop)
curl -s https://api.gymflowtrack.in/health | python3 -m json.tool
```

### 6.2 SSL Certificate
```bash
# Check certificate validity
echo | openssl s_client -connect api.gymflowtrack.in:443 -servername api.gymflowtrack.in 2>/dev/null | \
    openssl x509 -noout -dates

# Test HTTPS redirect
curl -I http://api.gymflowtrack.in 2>/dev/null | head -5
# Expected: 308 Permanent Redirect → https://
```

### 6.3 Security Headers
```bash
curl -sI https://api.gymflowtrack.in/health | grep -iE "strict-transport|content-type-options|x-frame|referrer-policy"
# Expected:
# strict-transport-security: max-age=63072000; includeSubDomains; preload
# x-content-type-options: nosniff
# x-frame-options: DENY
# referrer-policy: strict-origin-when-cross-origin
```

### 6.4 Frontend
```bash
curl -sI https://app.gymflowtrack.in | head -5
# Expected: HTTP/2 200
```

### 6.5 Full health check script
```bash
./scripts/healthcheck.sh
# Expected: === ALL CHECKS PASSED ===
```

---

## Step 7: Post-Deployment

### Verify backup cron
```bash
crontab -l
# Should show: 0 2 * * * cd /opt/gymflow && /bin/bash scripts/backup-db.sh ...
```

### Test manual backup
```bash
./scripts/backup-db.sh
ls -la backups/
# Should show: gymflow_YYYYMMDD_HHMMSS.dump (or .dump.enc if encryption is configured)
```

### Quick status command
```bash
gymflow-status
```

---

## Ongoing Operations

### Deploy new version
```bash
cd /opt/gymflow
./scripts/deploy.sh
```

### Quick restart (no rebuild)
```bash
./scripts/deploy.sh --quick
```

### Rollback
```bash
# Automatic rollback to last deploy point
./scripts/deploy.sh --rollback

# Rollback to specific commit
./scripts/rollback.sh abc1234

# Rollback with database restore
./scripts/rollback.sh abc1234 --with-db backups/gymflow_20260512_020000.dump
```

### View logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f --tail=50

# Backend only
docker compose -f docker-compose.prod.yml logs backend -f --tail=100

# Filter errors
docker compose -f docker-compose.prod.yml logs backend 2>&1 | grep -i error
```

### Database access
```bash
# Connect to PostgreSQL shell
docker compose -f docker-compose.prod.yml exec db psql -U gymflow -d gymflow

# Check active connections
docker compose -f docker-compose.prod.yml exec db psql -U gymflow -d gymflow \
    -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

---

## Troubleshooting

### Backend won't start
```bash
docker compose -f docker-compose.prod.yml logs backend --tail=100
# Common issues:
# - CONFIG ERROR: JWT_SECRET_KEY is insecure → set a proper JWT secret
# - DB connection refused → check db container health
# - Migration error → check alembic logs
```

### Certificate issues
```bash
# Check Caddy logs
docker compose -f docker-compose.prod.yml logs caddy --tail=50

# Common: DNS not propagated → wait 5-10 minutes
# Common: Cloudflare proxy enabled → set to DNS Only for initial cert
# Test: Use staging CA first (uncomment in Caddyfile)
```

### Out of memory
```bash
free -h
docker stats --no-stream
# If memory is full, check which container is using most:
# - Reduce backend workers to 1 (edit Dockerfile CMD)
# - Reduce shared_buffers to 128MB
# - Disable monitoring stack temporarily
```

### Container restart loop
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs <service> --tail=50
# Check for: OOMKilled, configuration errors, dependency failures
```

---

## Disaster Recovery

### Complete system restore
```bash
# 1. Provision new VPS
# 2. Run server setup
bash /tmp/server-setup.sh

# 3. Clone repo
cd /opt/gymflow
git clone YOUR_REPO .
cp .env.backup .env  # Restore from secure backup

# 4. Restore database
docker compose -f docker-compose.prod.yml up -d db redis
sleep 10
./scripts/restore-db.sh backups/gymflow_latest.dump

# 5. Start application
docker compose -f docker-compose.prod.yml up -d

# 6. Verify
./scripts/healthcheck.sh
```

### Time estimates:
- New VPS provisioning: 2-5 minutes
- Server setup: 5-10 minutes
- Docker image build: 5-15 minutes
- Database restore (100 gyms): 1-5 minutes
- **Total recovery: 15-35 minutes**

---

## Cost Estimates

### Monthly VPS Costs (Hetzner)
| Resource | Spec | Cost |
|----------|------|------|
| CAX11 (ARM64) | 4 vCPU, 4GB RAM, 40GB SSD | ~€4.50/month |
| Extra storage (if needed) | 100GB block storage | ~€4.80/month |
| Snapshots | Weekly automated | ~€0.50/month |
| **Total** | | **~€5-10/month** |

### Additional Services
| Service | Cost |
|---------|------|
| Domain (.in) | ~₹700/year (~€8/year) |
| Cloudflare (free tier) | Free |
| Sentry (free tier, 5k errors/month) | Free |
| GitHub Actions (2000 min/month free) | Free |
| Cloudflare R2 (10GB free) | Free |
| **Total additional** | **~€1/month** |

### Capacity Estimates (CAX11)
| Metric | Estimate |
|--------|----------|
| Concurrent users | 50-100 |
| Gyms supported | 100-200 |
| Members in DB | 20,000-50,000 |
| API requests/second | 30-50 sustained |
| Database size | Up to 5-10 GB |

---

## Scaling Path

### When to scale (signs):
- CPU consistently > 80% for 30+ minutes
- Memory > 90% with swap usage
- P95 latency > 2 seconds
- Database connections near 50

### Scale Up (vertical):
1. Upgrade to CAX21 (8GB RAM, 4 vCPU) — ~€8/month
2. Increase backend workers to 3-4
3. Increase shared_buffers to 512MB
4. Increase DB pool_size to 10

### Scale Out (horizontal):
1. Add PgBouncer for connection pooling
2. Move to managed PostgreSQL (Hetzner, Neon, Supabase)
3. Add Redis Sentinel for HA
4. Move static assets to Cloudflare CDN
5. Add Celery/ARQ for background job processing
6. Load balance multiple backend containers
