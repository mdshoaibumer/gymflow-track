# GymFlow Track — Gym Management SaaS

[![CI/CD Pipeline](https://github.com/mdshoaibumer/gymflow-track/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/mdshoaibumer/gymflow-track/actions/workflows/ci-cd.yml)

> Gym software that works in 10 minutes.

Modern, WhatsApp-first gym management platform for small and medium Indian gyms. Multi-tenant SaaS with enterprise-grade security, observability, and automated deployments.

**Live:** [gymflowtrack.in](https://gymflowtrack.in)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS, shadcn/ui, TanStack Query, Zustand |
| Backend | FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2 |
| Database | PostgreSQL 16 (async via asyncpg) |
| Cache | Redis (production rate limiting + subscription status cache) |
| Auth | JWT (HttpOnly cookie transport), bcrypt, RBAC (Super Admin/Owner/Admin/Staff) |
| Payments | Razorpay integration (with mock provider for dev) |
| Notifications | WhatsApp via AiSensy (with log-only provider for dev), Email via Resend |
| Background Jobs | APScheduler (in-process, zero infra) |
| Reverse Proxy | Caddy 2 (automatic TLS, HTTP/3, gzip/zstd compression) |
| Observability | Prometheus metrics, Grafana dashboards, Loki log aggregation, Sentry error tracking |
| CI/CD | GitHub Actions (lint → test → security scan → Docker build → deploy) |
| Infra | Docker, docker-compose (dev + prod + monitoring), Hetzner CAX11 ARM64 VPS |

## Architecture

- **Multi-tenant SaaS** — shared database, tenant isolation via `gym_id` on every query
- **Clean architecture** — routers → services → repositories → models
- **Domain exceptions** — transport-agnostic error handling (no HTTP in services)
- **Event system** — domain events for WhatsApp/SMS/email hooks
- **RBAC** — Super Admin / Owner / Admin / Staff roles enforced at route level
- **Subscription billing** — Razorpay integration with trial, grace period, and feature gating
- **Subscription enforcement middleware** — read-only mode for expired gyms (can't bypass)
- **UUID primary keys** everywhere — prevents enumeration attacks
- **Money stored as integers** — INR paise (₹500 = 50000) to avoid float precision issues
- **Mobile-first** responsive dashboard

## Project Structure

```
├── .github/workflows/        # CI/CD pipeline (GitHub Actions)
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── core/             # Config, DB, auth, security, scheduler, events
│   │   ├── middleware/       # Rate limit, security headers, subscription enforcement
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── repositories/     # Data access layer (tenant-scoped queries)
│   │   ├── routers/          # API route handlers (19 modules)
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   └── services/         # Business logic layer (27 services)
│   ├── alembic/              # Database migrations (31 versioned migrations)
│   └── tests/                # Pytest test suite (60+ test files)
├── frontend/                 # Next.js 15 application
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/       # Login, register, forgot/reset password
│   │   │   ├── (dashboard)/  # Member management, payments, attendance, reports
│   │   │   ├── (admin)/      # Super Admin: gym management, analytics, audit logs
│   │   │   ├── check-in/     # Self-service check-in kiosk
│   │   │   └── gym-display/  # Public gym display page
│   │   ├── components/       # Reusable UI components (shadcn/ui based)
│   │   ├── hooks/            # React Query hooks
│   │   ├── lib/              # API client, utilities, validations
│   │   ├── services/         # API service layer
│   │   ├── store/            # Zustand state stores
│   │   └── types/            # Shared TypeScript types
│   └── e2e/                  # Playwright E2E tests
├── infra/                    # Monitoring configs (Prometheus, Grafana, Loki)
├── docs/                     # Architecture & design documentation
├── scripts/                  # Backup, deploy, healthcheck, import scripts
├── Caddyfile                 # Reverse proxy config (auto-TLS, HTTP/3)
├── docker-compose.yml        # Development environment
├── docker-compose.prod.yml   # Production environment (memory-budgeted for 4GB VPS)
├── docker-compose.monitoring.yml  # Observability stack
└── Makefile                  # Common commands
```

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 22+
- PostgreSQL 16+ (or Docker)

### Using Docker (Recommended)
```bash
docker-compose up -d
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

### Manual Setup

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env      # Configure your database URL and secrets
alembic upgrade head      # Run database migrations
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
cp .env.example .env.local  # Configure API URL
npm run dev
```

### Environment Variables

Copy `.env.example` (dev) or `.env.example.production` (prod) for the full list. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL async connection | `postgresql+asyncpg://...` |
| `JWT_SECRET_KEY` | JWT signing key (change in production!) | `change-me` |
| `APP_ENV` | `development` / `staging` / `production` | `development` |
| `REDIS_URL` | Redis connection (required in production) | _(empty)_ |
| `RAZORPAY_KEY_ID` | Razorpay API key (`mock` for dev) | `mock` |
| `WHATSAPP_PROVIDER` | `log_only` or `aisensy` | `log_only` |
| `SENTRY_DSN` | Sentry error tracking DSN | _(empty)_ |
| `RESEND_API_KEY` | Resend email service API key | _(empty)_ |
| `COOKIE_SECURE` | `true` in production (HTTPS required) | `false` |
| `BIOMETRIC_ENCRYPTION_KEY` | AES-256 key for biometric templates (base64, 32 bytes) | _(empty)_ |

## Features

### Core
- **Member Management** — CRUD, search, soft-delete, profile photos, custom fields
- **Payment Recording** — Track payments, auto-renew memberships, void/refund
- **Membership Lifecycle** — Active/expired/frozen/cancelled with date-driven status
- **Dashboard** — Real-time metrics, revenue tracking, expiring alerts
- **Invoices** — Auto-generated PDF invoices (ReportLab) with download

### Operations
- **QR Attendance** — HMAC-signed QR codes, manual check-in, dedup
- **Self-Service Check-in** — Kiosk mode for gyms (public URL per gym)
- **WhatsApp QR Attendance** — Check-in via WhatsApp message
- **Biometric Attendance** — Fingerprint & face recognition device integration (AES-256-GCM encrypted templates, device-side 1:N matching, vendor-agnostic)
- **Equipment Tracking** — Asset lifecycle, maintenance records, warranty alerts
- **WhatsApp Reminders** — Expiry, overdue, welcome notifications (scheduled)
- **Gym Display** — Public-facing gym information page

### Platform
- **Subscription Billing** — Razorpay checkout, invoices, trial period, feature gating
- **Super Admin Control Center** — Platform-wide gym management, analytics, audit logs, health monitoring
- **Staff Management** — Create admin/staff accounts with role-based access
- **Admin Impersonation** — Super admin can impersonate gym owners for support
- **CSV Import** — Smart column detection (Hindi/Hinglish support), preview, validation, image compression
- **Onboarding Wizard** — Demo data seeding, setup progress tracking
- **Custom Fields** — Per-gym configurable member data fields
- **Password Reset** — Email-based reset flow via Resend
- **Per-Gym WhatsApp Config** — Each gym configures their own AiSensy credentials

### Security & Production
- **Rate Limiting** — Per-IP sliding window (auth: 10/min, API: 100/min)
- **Security Headers** — HSTS preload, CSP, X-Frame-Options, Permissions-Policy
- **Subscription Enforcement** — Middleware blocks writes for expired subscriptions
- **Structured Logging** — JSON logs with request IDs and tenant context
- **Health Checks** — Liveness + readiness probes for container orchestration
- **Password Policy** — NIST-compliant (length + complexity, no special char requirement)
- **Prometheus Metrics** — Request latency, error rates, business metrics
- **Sentry Integration** — Production error tracking with context
- **Container Hardening** — `cap_drop: ALL`, `no-new-privileges`, memory limits
- **Trivy Security Scanning** — CVE scanning in CI for both images and dependencies
- **TruffleHog Secret Detection** — Prevents accidental credential commits

## CI/CD Pipeline

Automated via GitHub Actions on every push to `main`:

1. **Backend Tests** — Ruff lint + pytest with coverage (≥63% threshold)
2. **Frontend Tests** — ESLint + Vitest unit tests + Next.js build validation
3. **Security Scanning** — Trivy (CVE) + TruffleHog (secrets)
4. **Docker Build** — Multi-stage build validation + image scanning
5. **Deploy** — SSH to production VPS, git pull, rolling restart
6. **Health Verification** — Post-deploy health check with auto-alert
7. **Manual Rollback** — One-click rollback via workflow dispatch

## Infrastructure

```
                    ┌─── app.gymflowtrack.in ──── Next.js (Frontend)
Internet ── Caddy ──┼─── api.gymflowtrack.in ──── FastAPI (Backend) ── PostgreSQL
       (TLS/HTTP3)  └─── admin.gymflowtrack.in ── Next.js (Admin)        │
                                                       │                Redis
                                                       │
                                          Prometheus ── Grafana
                                              │
                                            Loki (logs)
```

**Production target:** Hetzner CAX11 ARM64 VPS (4GB RAM), memory-budgeted:
- PostgreSQL: ~640MB | Backend (2 workers): ~400MB | Frontend: ~200MB
- Redis: ~80MB | Caddy: ~50MB | Monitoring: ~400MB

## Running Tests

```bash
# Backend (requires PostgreSQL)
cd backend
pytest -v                    # All tests
pytest tests/ --cov=app      # With coverage report

# Frontend
cd frontend
npm test                     # Vitest unit tests
npm run test:e2e             # Playwright E2E tests
```

## Deployment

See [docs/deployment-checklist.md](docs/deployment-checklist.md) for the full production deployment guide.

```bash
# Production (Hetzner VPS)
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# With monitoring stack
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d
```

**Supported platforms:** Hetzner, DigitalOcean, Railway, Render, Fly.io, any VPS with Docker.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, layer responsibilities, decision records |
| [API Design](docs/api-design.md) | REST API conventions, versioning, error format |
| [Auth Design](docs/auth-design.md) | JWT flow, RBAC model, token refresh |
| [Database Schema](docs/database-schema.md) | ER diagram, indexing strategy, multi-tenancy |
| [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) | Step-by-step production setup |
| [Deployment Checklist](docs/deployment-checklist.md) | Pre-launch verification |

## License

Proprietary — All rights reserved.
