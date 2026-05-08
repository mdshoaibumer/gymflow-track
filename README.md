# GymFlow — Gym Management SaaS

> Gym software that works in 10 minutes.

Modern, WhatsApp-first gym management platform for small and medium Indian gyms.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens) |
| Infra | Docker, docker-compose |

## Architecture

- **Multi-tenant SaaS** — shared database, tenant isolation via `gym_id`
- **Clean architecture** — routers → services → repositories
- **UUID primary keys** everywhere
- **Mobile-first** responsive dashboard

## Project Structure

```
├── backend/          # FastAPI application
├── frontend/         # Next.js application
├── docs/             # Architecture & design documentation
├── docker-compose.yml
└── Makefile
```

## Quick Start

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Phase 1 Status

- [x] Project structure
- [x] Backend skeleton
- [x] Frontend shell
- [x] Auth architecture
- [x] Database schema design
- [x] API design
- [ ] Runtime testing (requires PostgreSQL + Docker)

## License

Proprietary — All rights reserved.
