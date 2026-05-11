# GymFlow Track — Gym Management SaaS

> Gym software that works in 10 minutes.

Modern, WhatsApp-first gym management platform for small and medium Indian gyms.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Pydantic v2 |
| Database | PostgreSQL (async via asyncpg) |
| Auth | JWT (access + refresh tokens), bcrypt, RBAC (Owner/Admin/Staff) |
| Payments | Razorpay integration (with mock provider for dev) |
| Notifications | WhatsApp via AiSensy (with log-only provider for dev) |
| Background Jobs | APScheduler (in-process, zero infra) |
| Infra | Docker, docker-compose (dev + production configs) |

## Architecture

- **Multi-tenant SaaS** — shared database, tenant isolation via `gym_id` on every query
- **Clean architecture** — routers → services → repositories → models
- **Domain exceptions** — transport-agnostic error handling (no HTTP in services)
- **Event system** — domain events for future WhatsApp/SMS/email hooks
- **RBAC** — Owner / Admin / Staff roles enforced at route level
- **Subscription billing** — Razorpay integration with trial, grace period, and feature gating
- **UUID primary keys** everywhere
- **Mobile-first** responsive dashboard

## Project Structure

```
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── core/             # Config, DB, auth, security, scheduler, events
│   │   ├── middleware/       # Rate limit, security headers, request context
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── repositories/     # Data access layer (tenant-scoped queries)
│   │   ├── routers/          # API route handlers
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   └── services/         # Business logic layer
│   ├── alembic/              # Database migrations
│   └── tests/                # Pytest test suite
├── frontend/                 # Next.js application
│   └── src/
│       ├── app/              # Pages (App Router)
│       ├── components/       # Reusable UI components
│       ├── hooks/            # React Query hooks
│       ├── lib/              # API client, utilities, validations
│       ├── services/         # API service layer
│       ├── store/            # Zustand state stores
│       └── types/            # Shared TypeScript types
├── docs/                     # Architecture & design documentation
├── scripts/                  # Backup/restore scripts
├── docker-compose.yml        # Development environment
├── docker-compose.prod.yml   # Production environment
└── Makefile                  # Common commands
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (or Docker)

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
npm run dev
```

### Environment Variables

Copy `backend/.env.example` for the full list. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL async connection | `postgresql+asyncpg://...` |
| `JWT_SECRET_KEY` | JWT signing key (change in production!) | `change-me` |
| `APP_ENV` | `development` / `staging` / `production` | `development` |
| `RAZORPAY_KEY_ID` | Razorpay API key (`mock` for dev) | `mock` |
| `WHATSAPP_PROVIDER` | `log_only` or `aisensy` | `log_only` |

## Features

### Core
- **Member Management** — CRUD, search, soft-delete, profile pages
- **Payment Recording** — Track payments, auto-renew memberships
- **Membership Lifecycle** — Active/expired/frozen/cancelled with date-driven status
- **Dashboard** — Real-time metrics, revenue tracking, expiring alerts

### Operations
- **QR Attendance** — HMAC-signed QR codes, manual check-in, dedup
- **Equipment Tracking** — Asset lifecycle, maintenance records, warranty alerts
- **WhatsApp Reminders** — Expiry, overdue, welcome notifications (scheduled)

### Platform
- **Subscription Billing** — Razorpay checkout, invoices, trial period, feature gating
- **Staff Management** — Create admin/staff accounts with role-based access
- **CSV Import** — Smart column detection (Hindi/Hinglish support), preview, validation
- **Onboarding Wizard** — Demo data seeding, setup progress tracking

### Security & Production
- **Rate Limiting** — Per-IP sliding window (auth: 10/min, API: 100/min)
- **Security Headers** — X-Frame-Options, X-Content-Type-Options, etc.
- **Structured Logging** — JSON logs with request IDs and tenant context
- **Health Checks** — Liveness + readiness probes for container orchestration
- **Password Policy** — NIST-compliant (length + complexity, no special char requirement)

## Running Tests

```bash
cd backend
pytest -v
```

## Deployment

See [docs/deployment-checklist.md](docs/deployment-checklist.md) for production deployment guide.

Supported platforms: Railway, Render, Fly.io, VPS (Hetzner/DigitalOcean).

## License

Proprietary — All rights reserved.
