# Product Roadmap

## Phase 1 — Foundation (Current)
**Goal:** Production-grade engineering scaffold

- [x] Project structure (monorepo)
- [x] Backend skeleton (FastAPI + clean architecture)
- [x] Frontend shell (Next.js + shadcn/ui)
- [x] Authentication architecture (JWT)
- [x] Database schema design
- [x] API design documentation
- [ ] Local development setup (PostgreSQL + Docker)
- [ ] Run first migration
- [ ] End-to-end auth flow working

## Phase 2 — Core Features
**Goal:** Minimum viable product for first paying gym

- [ ] Member CRUD (full working flow)
- [ ] Member search and filter
- [ ] Payment recording
- [ ] Membership renewal flow
- [ ] Dashboard with real data (active members, revenue, expiring)
- [ ] Basic attendance marking

## Phase 3 — WhatsApp Integration
**Goal:** Automated member communication

- [ ] WhatsApp Business API integration
- [ ] Renewal reminder (7 days before expiry)
- [ ] Payment confirmation message
- [ ] Welcome message on new member join
- [ ] Birthday wishes (optional)

## Phase 4 — Operations Polish
**Goal:** Daily gym operations made smooth

- [ ] Bulk member import (CSV/Excel)
- [ ] Receipt generation (PDF)
- [ ] Staff accounts (admin/staff roles)
- [ ] Membership plan management
- [ ] Expense tracking (basic)

## Phase 5 — Growth
**Goal:** Scale and monetize

- [ ] Multi-plan pricing tiers
- [ ] Onboarding wizard
- [ ] Usage analytics
- [ ] Payment gateway integration (Razorpay)
- [ ] Custom domain per gym

---

## What We Will NOT Build

- Workout planning / exercise tracking
- Calorie / nutrition tracking
- AI chatbot or recommendations
- Native mobile apps (responsive web only)
- Social features / community
- Video content / streaming

**Rationale:** Our target users are non-technical gym owners who need simple ops tools. Every feature we add must serve the "manage members + collect money + track attendance" workflow.

---

## Completed (Beyond Original Roadmap)

- [x] QR Attendance (HMAC-signed, staff scan)
- [x] Self-Service Check-in (kiosk mode, rotating codes)
- [x] WhatsApp QR Attendance
- [x] Biometric Attendance Integration (fingerprint + face recognition)
- [x] Equipment & Asset Tracking
- [x] Subscription Billing (Razorpay)
- [x] Multi-branch management (Elite plan)
- [x] Expense Tracking
- [x] Custom Fields per Gym
- [x] CSV/Excel Import (Hindi/Hinglish support)
- [x] Super Admin Control Center
