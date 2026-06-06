# GymFlow Track — Feature Gap Analysis & Implementation Specs

## Competitive Gap Analysis

| Feature | Gymdesk | Zen Planner | Mindbody | WellnessLiving | GymMaster | GymFlow |
|---------|---------|-------------|----------|----------------|-----------|---------|
| Member Portal | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Class/Batch Scheduling | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Lead Management | ✓ | ✓ | ✓ | ✓ | Basic | ✗ |
| Due/Balance Tracking | ✓ | ✓ | ✓ | ✓ | ✓ | Partial |
| Online Payments (Member) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| WhatsApp Integration | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Biometric Attendance | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Expense Management | ✗ | ✗ | ✗ | ✗ | Basic | ✓ |
| Multi-branch | ✓ | ✓ | ✓ | ✓ | ✓ | Partial |

**Verdict**: The 4 modules below close the **highest-ROI gaps** that every Indian competitor offers but GymFlow lacks. These are table-stakes features — not enterprise bloat.

---

## Priority & ROI Ranking

| Priority | Module | Revenue Impact | Churn Prevention | Effort |
|----------|--------|---------------|-----------------|--------|
| P0 | Due Management | High (direct ₹ recovery) | High | 1 week |
| P1 | Member Portal | Medium (self-service renewal) | Very High | 1.5 weeks |
| P2 | Batch/Class Scheduling | High (batch fees, utilization) | Medium | 2 weeks |
| P3 | Lead Management | Very High (new revenue) | Low | 1.5 weeks |

---

# MODULE 1: MEMBER PORTAL

## 1. Business Value

- **Churn reduction**: Members check expiry and renew without calling gym
- **Self-service**: Reduces front-desk load by 40% (industry benchmark)
- **Revenue**: Enables online renewal → immediate ₹ collection
- **Competitive parity**: Every competitor offers this

## 2. Screens Required

| Screen | Route | Description |
|--------|-------|-------------|
| Member Login | `/member/login` | Phone + OTP login |
| Dashboard | `/member/dashboard` | Status, expiry countdown, quick actions |
| Attendance History | `/member/attendance` | Calendar view + list |
| Payment History | `/member/payments` | All payments + download invoice |
| Renew Membership | `/member/renew` | Plan selection + Razorpay checkout |
| Profile | `/member/profile` | View/edit basic info |

## 3. API Design

### Authentication (New Router: `/api/v1/member-auth`)

```
POST /api/v1/member-auth/request-otp
  Body: { phone: string, gym_slug: string }
  Response: { message: "OTP sent", expires_in: 300 }
  Rate limit: 3 requests/phone/5min

POST /api/v1/member-auth/verify-otp
  Body: { phone: string, gym_slug: string, otp: string }
  Response: { access_token, refresh_token, member: MemberPortalResponse }
  Sets HttpOnly cookies (same pattern as staff auth)

POST /api/v1/member-auth/refresh
  Cookie: refresh_token
  Response: { access_token }

POST /api/v1/member-auth/logout
  Clears cookies
```

### Member Portal Endpoints (New Router: `/api/v1/portal`)

```
GET /api/v1/portal/me
  Auth: Member JWT
  Response: { name, phone, membership_status, membership_end, plan_name, photo_url, gym_name }

GET /api/v1/portal/attendance?page=1&per_page=20
  Auth: Member JWT
  Response: { items: AttendanceResponse[], total, page }

GET /api/v1/portal/payments?page=1&per_page=20
  Auth: Member JWT
  Response: { items: PaymentResponse[], total, page }

GET /api/v1/portal/invoices/{payment_id}/pdf
  Auth: Member JWT
  Response: PDF binary

GET /api/v1/portal/plans
  Auth: Member JWT
  Response: { plans: GymMembershipPlan[] }

POST /api/v1/portal/renew
  Auth: Member JWT
  Body: { plan_id: UUID, payment_method: "online" }
  Response: { razorpay_order_id, amount, currency }

POST /api/v1/portal/renew/verify
  Auth: Member JWT
  Body: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
  Response: { success: true, new_expiry: date }
```

## 4. Database Design

### New Table: `member_otps`

```sql
CREATE TABLE member_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    phone VARCHAR(15) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,  -- bcrypt hash (never store plaintext)
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ix_member_otps_phone_gym ON member_otps(phone, gym_id);
-- Auto-cleanup: cron deletes rows older than 1 hour
```

### New Table: `member_sessions`

```sql
CREATE TABLE member_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    token_jti VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ix_member_sessions_member ON member_sessions(member_id);
```

**No changes to existing tables.** Reuses `members`, `payments`, `attendance`, `member_invoices`.

## 5. Migration Strategy

```
Migration: 032_member_portal
- Creates member_otps table
- Creates member_sessions table
- Adds indexes
- Non-destructive, no existing table modifications
```

## 6. RBAC Impact

New role concept: **MEMBER** (separate JWT claim: `role: "member"`, `member_id: UUID`)

| Endpoint | MEMBER | Staff | Admin | Owner |
|----------|--------|-------|-------|-------|
| Portal endpoints | ✓ (own data only) | ✗ | ✗ | ✗ |
| Staff dashboard | ✗ | ✓ | ✓ | ✓ |

**Implementation**: New dependency `get_current_member()` that:
1. Extracts JWT from cookie/header
2. Validates `token_type: "member"`
3. Returns `CurrentMember(member_id, gym_id)`
4. Checks member_sessions for revocation

**Isolation**: Member tokens CANNOT access staff endpoints (different token_type claim).

## 7. Testing Strategy

```
Unit tests:
- test_member_auth.py: OTP generation, verification, rate limiting, expiry
- test_member_portal.py: All portal endpoints, authorization checks

Integration tests:
- test_member_renewal.py: Full renewal flow with Razorpay mock

E2E (Playwright):
- member-login.spec.ts: OTP flow
- member-dashboard.spec.ts: View status, attendance, payments
- member-renewal.spec.ts: Plan selection → payment → updated expiry
```

## 8. Effort Estimate

| Task | Days |
|------|------|
| Backend: Auth + OTP service | 2 |
| Backend: Portal endpoints | 1 |
| Backend: Renewal + Razorpay | 1 |
| Frontend: 6 screens | 3 |
| Testing | 1.5 |
| **Total** | **8.5 days** |

## 9. Launch Priority: **P1** (ship after Due Management)

---

# MODULE 2: BATCH / CLASS SCHEDULING

## 1. Business Value

- **Revenue**: Enables batch-based pricing (₹500 morning vs ₹300 evening)
- **Utilization**: Prevents overcrowding, manages capacity
- **Trainer accountability**: Tracks who trained which batch
- **Waitlist**: Creates urgency → faster conversions
- **Indian market**: 80%+ gyms operate on fixed batch model (6AM, 7AM, 5PM, 6PM)

## 2. Screens Required

| Screen | Route | Description |
|--------|-------|-------------|
| Batch List | `/dashboard/batches` | All batches with capacity/enrolled count |
| Create/Edit Batch | `/dashboard/batches/new` | Form: name, trainer, time, capacity, days |
| Batch Detail | `/dashboard/batches/[id]` | Enrolled members, waitlist, attendance |
| Batch Attendance | `/dashboard/batches/[id]/attendance` | Mark batch attendance (bulk) |
| Member Enrollment | (within member form) | Assign member to batch(es) |
| Schedule View | `/dashboard/schedule` | Weekly calendar view of all batches |

## 3. API Design

### New Router: `/api/v1/batches`

```
POST /api/v1/batches
  Auth: Admin+
  Body: { name, trainer_id?, capacity, start_time, end_time, days_of_week: int[], gym_membership_plan_id? }
  Response: BatchResponse

GET /api/v1/batches
  Auth: All staff
  Query: ?active_only=true&trainer_id=...
  Response: { items: BatchResponse[], total }

GET /api/v1/batches/{id}
  Auth: All staff
  Response: BatchDetailResponse (includes enrolled_count, waitlist_count)

PATCH /api/v1/batches/{id}
  Auth: Admin+
  Body: Partial<BatchCreateRequest>
  Response: BatchResponse

DELETE /api/v1/batches/{id}
  Auth: Owner
  Response: 204 (soft-delete)

POST /api/v1/batches/{id}/enroll
  Auth: Admin+
  Body: { member_id: UUID }
  Response: { status: "enrolled" | "waitlisted", position?: number }

DELETE /api/v1/batches/{id}/enroll/{member_id}
  Auth: Admin+
  Response: 204 (promotes waitlist)

GET /api/v1/batches/{id}/members
  Auth: All staff
  Response: { enrolled: MemberBrief[], waitlist: MemberBrief[] }

POST /api/v1/batches/{id}/attendance
  Auth: All staff
  Body: { date: date, present_member_ids: UUID[] }
  Response: { marked: number, absent: number }

GET /api/v1/batches/{id}/attendance?date=2026-06-06
  Auth: All staff
  Response: { members: [{ member_id, name, status: "present"|"absent" }] }
```

## 4. Database Design

### New Table: `batches`

```sql
CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    trainer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    capacity INTEGER NOT NULL DEFAULT 30,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}', -- 1=Mon, 7=Sun
    gym_membership_plan_id UUID REFERENCES gym_membership_plans(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX ix_batches_gym ON batches(gym_id);
CREATE INDEX ix_batches_trainer ON batches(trainer_id);
```

### New Table: `batch_enrollments`

```sql
CREATE TABLE batch_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'enrolled', -- enrolled | waitlisted | dropped
    waitlist_position INTEGER,
    enrolled_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    dropped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(batch_id, member_id)
);

CREATE INDEX ix_batch_enrollments_gym ON batch_enrollments(gym_id);
CREATE INDEX ix_batch_enrollments_batch ON batch_enrollments(batch_id, status);
CREATE INDEX ix_batch_enrollments_member ON batch_enrollments(member_id);
```

### New Table: `batch_attendance`

```sql
CREATE TABLE batch_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'present', -- present | absent
    marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(batch_id, member_id, attendance_date)
);

CREATE INDEX ix_batch_attendance_batch_date ON batch_attendance(batch_id, attendance_date);
CREATE INDEX ix_batch_attendance_member ON batch_attendance(member_id, attendance_date);
```

## 5. Migration Strategy

```
Migration: 033_batch_scheduling
- Creates batches, batch_enrollments, batch_attendance tables
- Adds indexes and constraints
- Non-destructive
- Existing Member.batch field (morning/afternoon/evening) preserved for backward compat
  (can be deprecated later, not removed)
```

## 6. RBAC Impact

| Endpoint | Staff | Admin | Owner |
|----------|-------|-------|-------|
| View batches/schedule | ✓ | ✓ | ✓ |
| Create/edit batch | ✗ | ✓ | ✓ |
| Delete batch | ✗ | ✗ | ✓ |
| Enroll/unenroll members | ✗ | ✓ | ✓ |
| Mark batch attendance | ✓ | ✓ | ✓ |

## 7. Testing Strategy

```
Unit tests:
- test_batches.py: CRUD, capacity enforcement, waitlist promotion
- test_batch_enrollment.py: Enroll, waitlist, drop, auto-promote
- test_batch_attendance.py: Bulk marking, dedup, date validation

Integration:
- Waitlist promotion when enrolled member drops
- Capacity check on enrollment
- Trainer assignment validation (must be staff/admin of same gym)

E2E:
- batch-management.spec.ts: Create batch, set schedule, assign trainer
- batch-enrollment.spec.ts: Enroll member, hit capacity, verify waitlist
- batch-attendance.spec.ts: Mark attendance for a session
```

## 8. Effort Estimate

| Task | Days |
|------|------|
| Backend: Models + migration | 1 |
| Backend: Service + repository | 2 |
| Backend: Router + schemas | 1 |
| Frontend: 6 screens | 4 |
| Testing | 2 |
| **Total** | **10 days** |

## 9. Launch Priority: **P2**

---

# MODULE 3: LEAD MANAGEMENT

## 1. Business Value

- **Revenue generation**: Converts walk-ins and inquiries into paying members
- **Source tracking**: Know which channel (WhatsApp, walk-in, Instagram) brings leads
- **Follow-up discipline**: Indian gym owners lose 60%+ leads due to no follow-up
- **Trial → Conversion**: Track trial members and their conversion rate
- **ROI**: Each converted lead = ₹3,000-12,000/year revenue

## 2. Screens Required

| Screen | Route | Description |
|--------|-------|-------------|
| Lead Pipeline | `/dashboard/leads` | Kanban: New → Contacted → Trial → Converted → Lost |
| Add Lead | `/dashboard/leads/new` | Quick capture form |
| Lead Detail | `/dashboard/leads/[id]` | Timeline, notes, follow-ups |
| Follow-up Tasks | `/dashboard/leads/tasks` | Due today, overdue list |
| Conversion Report | `/dashboard/reports/leads` | Source-wise, funnel analytics |

## 3. API Design

### New Router: `/api/v1/leads`

```
POST /api/v1/leads
  Auth: All staff
  Body: { name, phone, email?, source, notes?, interested_plan_id? }
  Response: LeadResponse

GET /api/v1/leads
  Auth: All staff
  Query: ?status=new&source=instagram&page=1&per_page=20&sort=-created_at
  Response: { items: LeadResponse[], total, page }

GET /api/v1/leads/{id}
  Auth: All staff
  Response: LeadDetailResponse (includes follow_ups[], notes)

PATCH /api/v1/leads/{id}
  Auth: Admin+
  Body: { status?, assigned_to?, notes? }
  Response: LeadResponse

POST /api/v1/leads/{id}/follow-ups
  Auth: All staff
  Body: { type: "call"|"whatsapp"|"visit"|"trial", notes?, next_follow_up_at? }
  Response: FollowUpResponse

POST /api/v1/leads/{id}/start-trial
  Auth: Admin+
  Body: { trial_days: int, batch_id? }
  Response: { lead_status: "trial", trial_end: date }

POST /api/v1/leads/{id}/convert
  Auth: Admin+
  Body: { membership_plan_id, amount_paid, payment_method }
  Response: { member_id: UUID, payment_id: UUID }
  (Creates Member + Payment records, marks lead as converted)

GET /api/v1/leads/analytics
  Auth: Admin+
  Response: { total_leads, by_source: {}, by_status: {}, conversion_rate, avg_days_to_convert }

GET /api/v1/leads/tasks
  Auth: All staff
  Query: ?due=today|overdue|upcoming
  Response: { items: FollowUpTaskResponse[] }

POST /api/v1/leads/{id}/send-whatsapp
  Auth: Admin+
  Body: { template: "trial_invite"|"follow_up"|"offer" }
  Response: { sent: true }
```

## 4. Database Design

### New Table: `leads`

```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    email VARCHAR(255),
    source VARCHAR(50) NOT NULL, -- walk_in, instagram, facebook, google, whatsapp, referral, website, other
    status VARCHAR(30) NOT NULL DEFAULT 'new', -- new, contacted, interested, trial, converted, lost
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    interested_plan_id UUID REFERENCES gym_membership_plans(id) ON DELETE SET NULL,
    trial_start DATE,
    trial_end DATE,
    converted_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    lost_reason VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX ix_leads_gym_status ON leads(gym_id, status);
CREATE INDEX ix_leads_gym_source ON leads(gym_id, source);
CREATE INDEX ix_leads_phone ON leads(gym_id, phone);
```

### New Table: `lead_follow_ups`

```sql
CREATE TABLE lead_follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL, -- call, whatsapp, visit, trial, note
    notes TEXT,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    next_follow_up_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX ix_lead_follow_ups_lead ON lead_follow_ups(lead_id);
CREATE INDEX ix_lead_follow_ups_next ON lead_follow_ups(gym_id, next_follow_up_at)
    WHERE completed_at IS NULL;
```

## 5. Migration Strategy

```
Migration: 034_lead_management
- Creates leads, lead_follow_ups tables
- Adds LeadSource and LeadStatus as application-level enums (VARCHAR, not PG ENUM)
  — easier to extend without migrations
- Non-destructive
```

## 6. RBAC Impact

| Endpoint | Staff | Admin | Owner |
|----------|-------|-------|-------|
| View leads | ✓ | ✓ | ✓ |
| Add lead | ✓ | ✓ | ✓ |
| Update lead status | ✗ | ✓ | ✓ |
| Convert lead | ✗ | ✓ | ✓ |
| Start trial | ✗ | ✓ | ✓ |
| View analytics | ✗ | ✓ | ✓ |
| Send WhatsApp | ✗ | ✓ | ✓ |

## 7. Testing Strategy

```
Unit tests:
- test_leads.py: CRUD, status transitions, validation
- test_lead_conversion.py: Lead → Member + Payment creation
- test_lead_analytics.py: Aggregation queries, funnel calculation

Integration:
- Full lead lifecycle: New → Contacted → Trial → Converted
- WhatsApp send via existing AiSensy provider
- Duplicate phone detection (same gym)

E2E:
- lead-pipeline.spec.ts: Add lead, move through stages
- lead-conversion.spec.ts: Convert to member, verify records
```

## 8. Effort Estimate

| Task | Days |
|------|------|
| Backend: Models + migration | 1 |
| Backend: Service (including conversion logic) | 2 |
| Backend: Router + analytics | 1 |
| Frontend: 5 screens + Kanban | 4 |
| WhatsApp integration (reuse provider) | 0.5 |
| Testing | 1.5 |
| **Total** | **10 days** |

## 9. Launch Priority: **P3** (highest revenue potential but longer payback cycle)

---

# MODULE 4: DUE MANAGEMENT

## 1. Business Value

- **Direct revenue recovery**: Indian gyms lose 20-40% revenue to uncollected dues
- **Automation**: WhatsApp reminders collect ₹ without manual follow-up
- **Visibility**: Aging reports show exactly who owes what
- **Partial payments**: Indian members often pay in 2-3 installments
- **Immediate ROI**: Every ₹1 collected from dues is pure profit

## 2. Screens Required

| Screen | Route | Description |
|--------|-------|-------------|
| Dues Overview | `/dashboard/dues` | Summary cards + member list with balances |
| Member Due Detail | `/dashboard/dues/[member_id]` | Payment history, balance breakdown |
| Record Partial Payment | (modal in dues page) | Amount, method, notes |
| Aging Report | `/dashboard/reports/aging` | 0-30, 30-60, 60-90, 90+ days buckets |
| Reminder Settings | `/dashboard/settings/reminders` | Auto-reminder config |

## 3. API Design

### Enhanced Existing + New Router: `/api/v1/dues`

```
GET /api/v1/dues
  Auth: Admin+
  Query: ?status=overdue&aging=30-60&sort=-balance&page=1&per_page=20
  Response: { items: DueMemberResponse[], total, total_outstanding_paise, page }

GET /api/v1/dues/{member_id}
  Auth: Admin+
  Response: {
    member: MemberBrief,
    plan_amount_paise: int,
    total_paid_paise: int,
    balance_paise: int,
    last_payment_date: date?,
    payments: PaymentResponse[],
    reminders_sent: ReminderResponse[]
  }

POST /api/v1/dues/{member_id}/pay
  Auth: Admin+
  Body: { amount_in_paise: int, payment_method, notes? }
  Response: PaymentResponse
  (Records partial payment, updates balance. If fully paid, membership activates.)

GET /api/v1/dues/aging-report
  Auth: Admin+
  Response: {
    buckets: [
      { range: "0-30", count: int, total_paise: int },
      { range: "31-60", count: int, total_paise: int },
      { range: "61-90", count: int, total_paise: int },
      { range: "90+", count: int, total_paise: int }
    ],
    total_outstanding_paise: int
  }

POST /api/v1/dues/{member_id}/remind
  Auth: Admin+
  Body: { channel: "whatsapp" }
  Response: { sent: true, next_auto_reminder?: date }

GET /api/v1/dues/reminder-config
  Auth: Owner
  Response: { auto_remind: bool, remind_days: int[], channel: "whatsapp", template_id? }

PUT /api/v1/dues/reminder-config
  Auth: Owner
  Body: { auto_remind: bool, remind_days: [3, 7, 15, 30], channel: "whatsapp" }
  Response: ReminderConfigResponse

GET /api/v1/dues/summary
  Auth: Admin+
  Response: {
    total_members_with_dues: int,
    total_outstanding_paise: int,
    collected_this_month_paise: int,
    avg_days_overdue: float
  }
```

## 4. Database Design

### New Table: `member_dues`

```sql
CREATE TABLE member_dues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    plan_amount_paise INTEGER NOT NULL,
    total_paid_paise INTEGER NOT NULL DEFAULT 0,
    balance_paise INTEGER NOT NULL,  -- plan_amount - total_paid (denormalized for query speed)
    due_date DATE NOT NULL,  -- When the full amount was due
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, partial, paid, waived
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX ix_member_dues_gym_status ON member_dues(gym_id, status);
CREATE INDEX ix_member_dues_member ON member_dues(member_id);
CREATE INDEX ix_member_dues_gym_balance ON member_dues(gym_id, balance_paise DESC)
    WHERE status IN ('pending', 'partial');
CREATE INDEX ix_member_dues_due_date ON member_dues(gym_id, due_date)
    WHERE status IN ('pending', 'partial');
```

### New Table: `due_payments`

```sql
CREATE TABLE due_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    due_id UUID NOT NULL REFERENCES member_dues(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    amount_paise INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX ix_due_payments_due ON due_payments(due_id);
```

### New Table: `due_reminder_config`

```sql
CREATE TABLE due_reminder_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE UNIQUE,
    auto_remind BOOLEAN DEFAULT TRUE NOT NULL,
    remind_days INTEGER[] DEFAULT '{3,7,15,30}' NOT NULL,
    channel VARCHAR(20) DEFAULT 'whatsapp' NOT NULL,
    template_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### Modifications to existing flow:

When a member is created/renewed:
- If `amount_paid < plan_amount`: Create `member_dues` record with `balance_paise = plan_amount - amount_paid`
- Status = `partial` if any payment made, `pending` if zero paid

When a partial payment is recorded via `/dues/{member_id}/pay`:
- Create `payments` record (reuses existing Payment model)
- Create `due_payments` link record
- Update `member_dues.total_paid_paise` and `balance_paise`
- If `balance_paise == 0`: Set status = `paid`

## 5. Migration Strategy

```
Migration: 035_due_management
- Creates member_dues, due_payments, due_reminder_config tables
- Adds indexes
- Data backfill script (optional, run once):
  For each member with membership_plan:
    plan_amount = gym_membership_plans.amount * 100 (to paise)
    total_paid = SUM(payments.amount_in_paise) for that member
    If total_paid < plan_amount: INSERT into member_dues
```

## 6. RBAC Impact

| Endpoint | Staff | Admin | Owner |
|----------|-------|-------|-------|
| View dues list | ✗ | ✓ | ✓ |
| View member due detail | ✗ | ✓ | ✓ |
| Record partial payment | ✗ | ✓ | ✓ |
| Send reminder | ✗ | ✓ | ✓ |
| Aging report | ✗ | ✓ | ✓ |
| Reminder config | ✗ | ✗ | ✓ |

## 7. Testing Strategy

```
Unit tests:
- test_dues.py: Balance calculation, partial payment, status transitions
- test_due_aging.py: Bucket calculation, boundary conditions
- test_due_reminders.py: Auto-reminder scheduling, rate limiting

Integration:
- Member creation with partial payment → due record created
- Multiple partial payments → balance decreases → paid status
- Aging report accuracy with various due dates
- WhatsApp reminder via existing notification infrastructure

E2E:
- dues-overview.spec.ts: View outstanding, filter by aging
- partial-payment.spec.ts: Record payment, verify balance update
- aging-report.spec.ts: Verify bucket counts match
```

## 8. Effort Estimate

| Task | Days |
|------|------|
| Backend: Models + migration | 1 |
| Backend: Service (balance engine) | 2 |
| Backend: Router + aging report | 1 |
| Backend: Auto-reminder integration | 0.5 |
| Frontend: 5 screens | 3 |
| Data backfill script | 0.5 |
| Testing | 1.5 |
| **Total** | **9.5 days** (but P0 — ship first) |

## 9. Launch Priority: **P0** (highest immediate ROI)

---

# IMPLEMENTATION PLAN

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Member Portal uses separate JWT type (`token_type: "member"`) | Security isolation — members cannot access staff routes |
| OTP via WhatsApp (reuse AiSensy) | Indian members prefer WhatsApp; no SMS cost |
| VARCHAR for lead/due status (not PG ENUM) | Easy to extend without ALTER TYPE migrations |
| `balance_paise` denormalized in `member_dues` | Avoids SUM() on every query; updated transactionally |
| Batch scheduling uses `days_of_week INTEGER[]` | Flexible; supports Mon-Sat, MWF, etc. |
| Lead conversion creates Member + Payment atomically | Single transaction; no orphaned records |

## File Structure (New Files)

```
backend/app/
├── models/
│   ├── member_otp.py          # Module 1
│   ├── member_session.py      # Module 1
│   ├── batch.py               # Module 2
│   ├── lead.py                # Module 3
│   └── due.py                 # Module 4
├── routers/
│   ├── member_auth.py         # Module 1
│   ├── portal.py              # Module 1
│   ├── batches.py             # Module 2
│   ├── leads.py               # Module 3
│   └── dues.py                # Module 4
├── services/
│   ├── member_auth_service.py # Module 1
│   ├── portal_service.py      # Module 1
│   ├── batch_service.py       # Module 2
│   ├── lead_service.py        # Module 3
│   └── due_service.py         # Module 4
├── repositories/
│   ├── member_otp_repository.py    # Module 1
│   ├── batch_repository.py         # Module 2
│   ├── lead_repository.py          # Module 3
│   └── due_repository.py           # Module 4
├── schemas/
│   ├── member_auth.py         # Module 1
│   ├── portal.py              # Module 1
│   ├── batch.py               # Module 2
│   ├── lead.py                # Module 3
│   └── due.py                 # Module 4
└── alembic/versions/
    ├── 032_member_portal.py
    ├── 033_batch_scheduling.py
    ├── 034_lead_management.py
    └── 035_due_management.py

frontend/src/
├── app/
│   ├── (member)/              # Module 1 — separate layout (no admin sidebar)
│   │   ├── login/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── attendance/page.tsx
│   │   ├── payments/page.tsx
│   │   ├── renew/page.tsx
│   │   └── profile/page.tsx
│   └── (dashboard)/
│       ├── batches/           # Module 2
│       │   ├── page.tsx
│       │   ├── new/page.tsx
│       │   ├── [id]/page.tsx
│       │   └── [id]/attendance/page.tsx
│       ├── schedule/page.tsx  # Module 2
│       ├── leads/             # Module 3
│       │   ├── page.tsx
│       │   ├── new/page.tsx
│       │   ├── [id]/page.tsx
│       │   └── tasks/page.tsx
│       ├── dues/              # Module 4
│       │   ├── page.tsx
│       │   └── [member_id]/page.tsx
│       └── reports/
│           ├── aging/page.tsx    # Module 4
│           └── leads/page.tsx    # Module 3
├── components/
│   ├── member-portal/         # Module 1
│   ├── batches/               # Module 2
│   ├── leads/                 # Module 3
│   └── dues/                  # Module 4
└── lib/
    └── validations/
        ├── batch.ts           # Module 2
        ├── lead.ts            # Module 3
        └── due.ts             # Module 4
```

## Sprint Plan

```
Sprint 1 (Week 1): Due Management [P0]
  - Day 1-2: Backend (model, migration, service, repository)
  - Day 3: Router + schemas + aging report
  - Day 4-5: Frontend (dues page, partial payment, aging report)
  - Day 5: Tests + auto-reminder integration

Sprint 2 (Week 2-3): Member Portal [P1]
  - Day 1-2: Backend auth (OTP, member JWT, sessions)
  - Day 3: Portal service + renewal flow
  - Day 4-6: Frontend (6 member-facing screens)
  - Day 7: E2E tests + Razorpay integration test

Sprint 3 (Week 3-4): Batch Scheduling [P2]
  - Day 1-2: Backend (models, service, enrollment logic)
  - Day 3: Attendance marking + waitlist
  - Day 4-7: Frontend (schedule view, batch management, enrollment)
  - Day 8: Tests

Sprint 4 (Week 5): Lead Management [P3]
  - Day 1-2: Backend (lead service, conversion logic)
  - Day 3: Analytics + WhatsApp templates
  - Day 4-7: Frontend (Kanban pipeline, conversion flow)
  - Day 8: Tests
```

## Entitlement Gating

| Feature | Starter | Pro | Elite |
|---------|---------|-----|-------|
| Member Portal | ✓ (view only) | ✓ (renewal) | ✓ |
| Batch Scheduling | 3 batches | 10 batches | Unlimited |
| Lead Management | 50 leads/month | 200 leads/month | Unlimited |
| Due Management | ✓ | ✓ | ✓ |
| Auto WhatsApp Reminders | ✗ | ✓ | ✓ |

## Dashboard Widget Additions

```
Dashboard (/dashboard):
  + "Outstanding Dues" card — total ₹ owed, # members
  + "Leads This Week" card — new leads, conversions
  + "Today's Batches" card — batches running today, attendance %
  + "Expiring + Overdue" combined view
```

## WhatsApp Template Reuse

All WhatsApp sends go through existing `whatsapp_provider.py` (AiSensy):
- Due reminder: New template `due_reminder` (amount, member name, gym name)
- Lead follow-up: New template `lead_follow_up` (gym name, offer)
- Trial invite: New template `trial_invite` (gym name, trial days)
- OTP: New template `member_otp` (OTP code, expiry)

Templates registered in AiSensy dashboard (no code change to provider).

---

## Summary

| Module | Tables | Endpoints | Frontend Pages | Priority | Days |
|--------|--------|-----------|---------------|----------|------|
| Due Management | 3 | 7 | 5 | P0 | 9.5 |
| Member Portal | 2 | 10 | 6 | P1 | 8.5 |
| Batch Scheduling | 3 | 9 | 6 | P2 | 10 |
| Lead Management | 2 | 10 | 5 | P3 | 10 |
| **Total** | **10** | **36** | **22** | — | **38 days** |

All modules follow existing patterns:
- Router → Service → Repository
- Pydantic schemas for request/response
- UUID primary keys with BaseModel
- gym_id tenant isolation on every table
- Soft deletes where applicable
- Idempotency keys on financial operations
- HttpOnly JWT cookies
- Playwright E2E tests
