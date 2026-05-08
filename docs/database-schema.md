# Database Schema

## Design Principles

1. **UUID primary keys** — No auto-increment IDs leaked in URLs
2. **gym_id everywhere** — Every tenant-scoped table has a non-nullable `gym_id` FK
3. **Timestamps** — All tables have `created_at` and `updated_at`
4. **Indexed foreign keys** — `gym_id` is indexed for fast tenant-filtered queries
5. **Money as integers** — Store in paise (smallest unit) to avoid floating point

## Entity Relationship

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│   Gym    │──1:N──│   User   │       │  Member  │
│          │       │(staff/   │       │          │
│          │──1:N──│ owner)   │       │          │
│          │       └──────────┘       │          │
│          │──────────────────────1:N──│          │
└──────────┘                          └──────────┘
```

## Tables

### gyms

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid4 |
| name | VARCHAR(200) | NOT NULL |
| slug | VARCHAR(100) | UNIQUE, NOT NULL, INDEXED |
| phone | VARCHAR(15) | NOT NULL |
| email | VARCHAR(255) | NULLABLE |
| address | VARCHAR(500) | NULLABLE |
| city | VARCHAR(100) | NULLABLE |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

### users

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid4 |
| gym_id | UUID | FK → gyms.id, NOT NULL, INDEXED |
| name | VARCHAR(200) | NOT NULL |
| email | VARCHAR(255) | NOT NULL, INDEXED |
| phone | VARCHAR(15) | NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| role | ENUM(owner,admin,staff) | NOT NULL, DEFAULT owner |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

### members

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid4 |
| gym_id | UUID | FK → gyms.id, NOT NULL, INDEXED |
| name | VARCHAR(200) | NOT NULL |
| phone | VARCHAR(15) | NOT NULL, INDEXED |
| email | VARCHAR(255) | NULLABLE |
| gender | ENUM(male,female,other) | NULLABLE |
| date_of_birth | DATE | NULLABLE |
| emergency_contact | VARCHAR(15) | NULLABLE |
| membership_status | ENUM(active,expired,frozen) | NOT NULL, DEFAULT active |
| membership_start | DATE | NULLABLE |
| membership_end | DATE | NULLABLE |
| membership_plan | VARCHAR(100) | NULLABLE |
| amount_paid | INTEGER | DEFAULT 0 (paise) |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

## Indexing Strategy

- `gyms.slug` — Unique index for URL-friendly gym lookup
- `users.gym_id` — Fast user lookup by tenant
- `users.email` — Login lookup
- `members.gym_id` — Fast member listing by tenant
- `members.phone` — Duplicate check within gym

## Future Tables (Phase 2+)

- `payments` — Payment records per member
- `attendance` — Check-in/check-out logs
- `plans` — Membership plan definitions
- `whatsapp_messages` — Message delivery logs
