# GymFlow Track — Production Deployment Checklist

## Pre-Deployment Checklist

### Configuration
- [ ] `APP_ENV=production` is set
- [ ] `DEBUG=false` is set
- [ ] `JWT_SECRET_KEY` is a unique 64+ character random string
- [ ] `CORS_ORIGINS` is set to your frontend domain (not localhost)
- [ ] `DATABASE_URL` points to the production PostgreSQL instance
- [ ] `WHATSAPP_PROVIDER` is set correctly (log_only for testing, aisensy for live)
- [ ] `WHATSAPP_API_KEY` is set if using aisensy provider
- [ ] `LOG_LEVEL=INFO` (not DEBUG in production)

### Database
- [ ] PostgreSQL 16+ is provisioned
- [ ] Database user has appropriate permissions (not superuser)
- [ ] Connection string uses SSL (`?sslmode=require` for cloud PostgreSQL)
- [ ] Run migrations: `alembic upgrade head`
- [ ] Verify migration applied: `alembic current`
- [ ] Backup strategy is configured (daily pg_dump or platform backups)

### Security
- [ ] HTTPS is enabled (via platform or reverse proxy)
- [ ] JWT secret is unique to this environment (not shared with staging)
- [ ] Default/test accounts are removed
- [ ] Rate limiting is active (check /health endpoint returns security headers)

### Docker / Deployment
- [ ] `docker-compose.prod.yml` environment variables are set
- [ ] Docker images build successfully: `docker compose -f docker-compose.prod.yml build`
- [ ] Health checks pass: `curl http://localhost:8000/health`
- [ ] Frontend can reach backend: `curl http://localhost:8000/api/v1/auth/me` (should return 401)

### Monitoring
- [ ] `/health` endpoint is monitored (UptimeRobot, Betterstack, or platform health check)
- [ ] Log aggregation is accessible (Railway logs, Render logs, or stdout capture)
- [ ] Error alerting is configured (email on 5xx spike)

---

## Smoke Test Checklist (Post-Deploy)

Run these manually after each deployment:

### Auth Flow
- [ ] Register a new gym → tokens returned
- [ ] Login with credentials → tokens returned
- [ ] Access /auth/me with token → profile returned
- [ ] Invalid credentials → 401 error
- [ ] Expired token → 401 error

### Member Management
- [ ] Create a member → 201
- [ ] List members → returns created member
- [ ] Update member → changes reflected
- [ ] Search members → returns correct results

### Payments
- [ ] Record a payment → 201
- [ ] Dashboard metrics reflect the payment
- [ ] Member status updates correctly

### Notifications
- [ ] Trigger notification scan → reminders created
- [ ] Process notifications → pending count decreases
- [ ] Stats endpoint returns correct counts

### Attendance
- [ ] Manual check-in → 201
- [ ] QR check-in → works with valid QR
- [ ] Duplicate check-in → rejected
- [ ] Check-out → status updated

### Equipment
- [ ] Create an asset → 201
- [ ] Record maintenance → status changes
- [ ] Complete maintenance → back to active
- [ ] Dashboard stats reflect equipment counts

### Health
- [ ] GET /health → 200 healthy
- [ ] GET /health/live → 200 alive
- [ ] GET /health/ready → 200 ready with all checks passing

---

## Platform-Specific Notes

### Railway
- Set environment variables in Railway dashboard
- DATABASE_URL is auto-injected for Railway PostgreSQL
- Use `railway run alembic upgrade head` for migrations
- Health check: Configure in service settings → /health

### Render
- Set environment variables in Render dashboard
- Add a PostgreSQL database from Render
- Set Build Command: `pip install -r requirements.txt`
- Set Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: /health

### Fly.io
- Set secrets: `fly secrets set JWT_SECRET_KEY=... DATABASE_URL=...`
- Deploy: `fly deploy`
- Run migrations: `fly ssh console -C "alembic upgrade head"`
- Health check: Configure in fly.toml

### VPS (Hetzner/DigitalOcean)
- Use `docker-compose.prod.yml`
- Set up Caddy or nginx as reverse proxy for HTTPS
- Configure systemd service for auto-restart
- Set up cron for database backups: `0 2 * * * /path/to/scripts/backup-db.sh`
- Monitor with UptimeRobot (free tier)
