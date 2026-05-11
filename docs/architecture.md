# GymFlow Track Architecture

## Overview

GymFlow Track is a multi-tenant SaaS application using a **shared database** model with tenant isolation via `gym_id` on every table.

## Why Shared Database Multi-Tenancy?

| Approach | Pros | Cons | Fit for GymFlow Track |
|----------|------|------|-----------------|
| Shared DB + gym_id | Simple ops, cheap, fast queries | Row-level security needed | ✅ Best fit |
| Schema per tenant | Good isolation | Migration complexity | ❌ Overkill |
| DB per tenant | Full isolation | Expensive, complex | ❌ Enterprise only |

**Decision:** For 20–100 member gyms, shared DB with proper indexing on `gym_id` handles load easily. A single PostgreSQL instance can serve 1000+ gyms at this scale.

## System Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Next.js App    │────▶│  FastAPI Backend  │────▶│  PostgreSQL    │
│  (Dashboard)    │     │  (REST API)       │     │  (Shared DB)   │
└─────────────────┘     └──────────────────┘     └────────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │  WhatsApp    │
                        │  (Phase 2)   │
                        └──────────────┘
```

## Backend Architecture (Clean Architecture)

```
Request → Router → Service → Repository → Database
                     ↑
               Business Logic
```

### Layers

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Routers** | HTTP handling, request validation, response formatting | `routers/members.py` |
| **Services** | Business logic, orchestration, validation rules | `services/member_service.py` |
| **Repositories** | Database queries, data access | `repositories/member_repository.py` |
| **Models** | SQLAlchemy ORM models (table definitions) | `models/member.py` |
| **Schemas** | Pydantic models for request/response shapes | `schemas/member.py` |

### Why This Separation?

1. **Routers are thin** — They only translate HTTP to function calls. No business logic leaks into route handlers.
2. **Services are testable** — Business rules live here. Easy to unit test without HTTP layer.
3. **Repositories are swappable** — If you switch from PostgreSQL or add caching, only this layer changes.

### Dependency Injection

FastAPI's `Depends()` system wires everything together:

```python
@router.get("/members")
async def list_members(
    current_user: CurrentUser = Depends(get_current_user),  # Auth
    db: AsyncSession = Depends(get_db),                      # Database
):
    service = MemberService(db)  # Service gets DB session
    return await service.list_members(current_user.gym_id)
```

## Frontend Architecture

```
src/
├── app/              # Next.js App Router pages
│   ├── (auth)/       # Public routes (login, register)
│   └── (dashboard)/  # Protected routes (sidebar layout)
├── components/
│   ├── layout/       # Shell components (sidebar, header)
│   └── ui/           # Reusable UI primitives (shadcn/ui)
├── hooks/            # React hooks (useAuth, etc.)
├── lib/              # Utilities (API client, helpers)
├── services/         # API service functions
└── types/            # TypeScript interfaces
```

## Security Architecture

- **JWT access tokens** — Short-lived (30 min), carry `user_id` + `gym_id`
- **JWT refresh tokens** — Long-lived (7 days), used to get new access tokens
- **Tenant isolation** — Every DB query filters by `gym_id` from the JWT
- **Password hashing** — bcrypt with auto-upgrade
- **CORS** — Restricted to frontend origin only

## Database Design Principles

1. **UUID primary keys** — No sequential IDs exposed in URLs
2. **gym_id on every table** — Mandatory foreign key, indexed
3. **Timestamps everywhere** — `created_at`, `updated_at` on all rows
4. **Soft business rules** — Status enums (active/expired/frozen) over hard deletes
5. **Money in paise** — Store INR as integers (₹500 = 50000 paise) to avoid float issues

## Scalability Path

| Scale | Strategy |
|-------|----------|
| 0–500 gyms | Single server, single DB |
| 500–5000 gyms | Read replicas, connection pooling |
| 5000+ gyms | Consider sharding by region |

This is deliberately simple. Don't optimize for scale you don't have.
