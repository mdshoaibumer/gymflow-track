# API Design

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

---

## Auth Endpoints

### POST /auth/register

Register a new gym + owner account.

**Request:**
```json
{
  "gym_name": "Iron Paradise Gym",
  "owner_name": "Rajesh Kumar",
  "phone": "9876543210",
  "email": "rajesh@gmail.com",
  "password": "securepass123",
  "city": "Mumbai"
}
```

**Response (201):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Errors:**
- `409` — Email already registered

---

### POST /auth/login

**Request:**
```json
{
  "email": "rajesh@gmail.com",
  "password": "securepass123"
}
```

**Response (200):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Errors:**
- `401` — Invalid credentials
- `403` — Account disabled

---

### POST /auth/refresh

**Request:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response (200):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

---

## Gym Endpoints

### GET /gyms/me
🔒 Authenticated

Returns the current user's gym.

**Response:**
```json
{
  "id": "uuid",
  "name": "Iron Paradise Gym",
  "slug": "iron-paradise-gym",
  "phone": "9876543210",
  "email": "rajesh@gmail.com",
  "address": null,
  "city": "Mumbai",
  "is_active": true
}
```

### PATCH /gyms/me
🔒 Authenticated

Update gym details. Only send fields you want to change.

**Request:**
```json
{
  "address": "123 Main Road, Andheri West"
}
```

---

## Member Endpoints

### GET /members
🔒 Authenticated

List members for the current gym.

**Query params:** `skip` (default 0), `limit` (default 50, max 100)

**Response:**
```json
{
  "members": [
    {
      "id": "uuid",
      "name": "Amit Sharma",
      "phone": "9123456789",
      "email": null,
      "gender": "male",
      "membership_status": "active",
      "membership_plan": "3 months",
      "membership_start": "2026-01-15",
      "membership_end": "2026-04-15",
      "amount_paid": 300000
    }
  ],
  "total": 1
}
```

### POST /members
🔒 Authenticated

Add a new member.

**Request:**
```json
{
  "name": "Amit Sharma",
  "phone": "9123456789",
  "gender": "male",
  "membership_plan": "3 months",
  "membership_start": "2026-01-15",
  "membership_end": "2026-04-15",
  "amount_paid": 300000
}
```

**Errors:**
- `409` — Member with this phone already exists

### GET /members/{id}
🔒 Authenticated

Get single member. Only returns member if it belongs to the authenticated gym.

### PATCH /members/{id}
🔒 Authenticated

Update member details. Partial updates supported.

---

## Error Format

All errors return:
```json
{
  "detail": "Human-readable error message"
}
```

## Auth Flow Overview

```
1. Gym owner visits /register
2. Fills form → POST /auth/register
3. Backend creates gym + user, returns tokens
4. Frontend stores tokens in localStorage
5. All subsequent requests include Authorization header
6. Token carries gym_id → all queries scoped to that gym
7. On 401, frontend uses refresh token to get new access token
8. On refresh failure, redirect to /login
```

## Tenant Isolation

Every protected endpoint extracts `gym_id` from the JWT token. All database queries include `WHERE gym_id = :gym_id`. A user can NEVER access another gym's data — the API physically cannot return it.

---

## Attendance Endpoints

### POST /attendance/check-in
🔒 Authenticated (Pro plan — QR feature gate)

QR-based check-in (staff scans member's QR code).

**Request:**
```json
{
  "qr_token": "a1b2c3:d4e5f6:hmac_signature"
}
```

### POST /attendance/check-in/manual
🔒 Authenticated

Manual check-in by staff (member forgot QR card).

**Request:**
```json
{
  "member_id": "uuid"
}
```

### GET /attendance/today
🔒 Authenticated

Reception dashboard — who checked in today.

### GET /attendance/stats
🔒 Authenticated

Dashboard metrics: `checked_in_today`, `currently_in_gym`, `total_this_week`.

### GET /attendance/trend?days=14
🔒 Authenticated

Daily attendance counts for charting.

---

## Biometric Attendance Endpoints

### Device Management (Admin routes — JWT auth, ADMIN+ role)

#### POST /biometric/devices
🔒 Admin

Register a new biometric device. Returns API key ONCE.

**Request:**
```json
{
  "device_name": "Main Entrance Scanner",
  "biometric_type": "fingerprint",
  "device_model": "ZKTeco ZK9500",
  "serial_number": "ZK-2024-001",
  "location": "Front Desk",
  "min_match_score": 0.85
}
```

**Response (201):**
```json
{
  "device": {
    "id": "uuid",
    "gym_id": "uuid",
    "device_name": "Main Entrance Scanner",
    "biometric_type": "fingerprint",
    "status": "active",
    "min_match_score": 0.85,
    "api_key_prefix": "gfbio_abc123"
  },
  "api_key": "gfbio_abc123...full_key_here"
}
```

#### GET /biometric/devices
🔒 Admin

List all devices registered to this gym.

#### PATCH /biometric/devices/{id}
🔒 Admin

Update device name, location, threshold, or status.

#### POST /biometric/devices/{id}/rotate-key
🔒 Admin

Regenerate device API key (invalidates old key immediately).

#### GET /biometric/members/{member_id}/templates
🔒 Admin

List enrolled biometric templates for a member.

#### DELETE /biometric/templates/{template_id}
🔒 Admin

Deactivate a biometric template (soft delete for audit trail).

---

### Device Operations (X-Device-Key header auth)

These endpoints are called by the physical biometric device, NOT by human users.
Authentication is via `X-Device-Key` header (API key issued at device registration).

#### POST /biometric/device/check-in

Record a biometric attendance. Device performs 1:N matching locally, sends result.

**Headers:** `X-Device-Key: gfbio_abc123...`

**Request:**
```json
{
  "member_id": "uuid",
  "match_score": 0.92,
  "template_id": "uuid"
}
```

**Response (200):**
```json
{
  "attendance_id": "uuid",
  "member_id": "uuid",
  "member_name": "Amit Sharma",
  "check_in_at": "2026-06-05T09:15:00Z",
  "status": "checked_in",
  "message": "Welcome, Amit Sharma!"
}
```

**Errors:**
- `401` — Invalid or revoked device API key
- `422` — Match score below device threshold
- `422` — No active template for member
- `422` — Membership expired/frozen

#### POST /biometric/device/enroll

Enroll a member's biometric template (captured at device).

**Request:**
```json
{
  "member_id": "uuid",
  "template_data_b64": "base64_encoded_template",
  "biometric_type": "fingerprint",
  "quality_score": 0.95,
  "template_format": "ISO_19794_2"
}
```

#### POST /biometric/device/heartbeat

Periodic health signal from device.

#### GET /biometric/device/sync-templates

Download active templates for device-side 1:N matching. Returns encrypted template data (decrypted for transport over HTTPS).

---

### Supported Biometric Types

| Type | Value | Use Case |
|------|-------|----------|
| Fingerprint | `fingerprint` | Capacitive/optical scanners (ZKTeco, Suprema, Mantra, etc.) |
| Face Recognition | `face` | Camera-based devices (HikVision, Suprema FaceStation, etc.) |

**Architecture:** Vendor-agnostic. Any device that can perform local 1:N matching and make HTTP calls can integrate via the `X-Device-Key` API.
