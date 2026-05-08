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
