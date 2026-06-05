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

- `plans` — Membership plan definitions
- `whatsapp_messages` — Message delivery logs

---

## Implemented Tables (Not in Original Schema)

The following tables were added through Alembic migrations as features were built:

### payments
Payment records per member. Stores amount in paise (integer), supports void/refund.

### attendance
Check-in/check-out logs with dedup (one per member per day). Supports sources: `qr`, `manual`, `whatsapp_qr`, `self_service`, `biometric`.

### biometric_devices
Registered biometric hardware devices (fingerprint scanners, face cameras) per gym. Each device has a bcrypt-hashed API key for authentication.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| gym_id | UUID | FK → gyms.id, NOT NULL |
| device_name | VARCHAR(100) | NOT NULL |
| device_model | VARCHAR(100) | NULLABLE |
| serial_number | VARCHAR(100) | NULLABLE |
| location | VARCHAR(200) | NULLABLE |
| api_key_hash | VARCHAR(128) | NOT NULL |
| api_key_prefix | VARCHAR(12) | NOT NULL |
| biometric_type | ENUM(fingerprint, face) | NOT NULL |
| status | ENUM(active, inactive, revoked) | NOT NULL, DEFAULT active |
| last_heartbeat_at | TIMESTAMPTZ | NULLABLE |
| min_match_score | FLOAT | NOT NULL, DEFAULT 0.80 |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

### biometric_templates
Encrypted biometric templates (AES-256-GCM) for member enrollment.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| gym_id | UUID | FK → gyms.id, NOT NULL |
| member_id | UUID | FK → members.id, NOT NULL |
| device_id | UUID | FK → biometric_devices.id, NULLABLE |
| template_data | BYTEA | NOT NULL (encrypted) |
| encryption_iv | BYTEA(16) | NOT NULL |
| biometric_type | ENUM(fingerprint, face) | NOT NULL |
| quality_score | FLOAT | NULLABLE |
| template_format | VARCHAR(50) | NULLABLE |
| is_active | BOOLEAN | NOT NULL, DEFAULT true |
| enrolled_at | TIMESTAMPTZ | NOT NULL |
| deactivated_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

### Other implemented tables
- `notifications` — WhatsApp/email notification queue and delivery logs
- `assets` / `maintenance_records` — Equipment lifecycle tracking
- `member_invoices` — Auto-generated invoices with PDF support
- `subscription_plans` / `gym_subscriptions` / `invoices` — Platform billing
- `audit_logs` / `gym_audit_logs` — Full audit trail
- `whatsapp_configs` — Per-gym WhatsApp provider credentials
- `gym_membership_plans` — Per-gym membership plan definitions
- `expenses` / `expense_categories` — Expense tracking with custom fields
- `custom_fields` — Per-gym configurable member data fields
