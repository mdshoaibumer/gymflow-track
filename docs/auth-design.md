# Authentication Design

## Overview

GymFlow Track uses JWT-based stateless authentication with short-lived access tokens and long-lived refresh tokens.

## Token Strategy

| Token | Lifetime | Purpose |
|-------|----------|---------|
| Access Token | 30 minutes | Authorizes API requests |
| Refresh Token | 7 days | Gets new access token without re-login |

## JWT Payload Structure

### Access Token
```json
{
  "sub": "user-uuid",
  "gym_id": "gym-uuid",
  "exp": 1717200000,
  "type": "access"
}
```

### Refresh Token
```json
{
  "sub": "user-uuid",
  "gym_id": "gym-uuid",
  "exp": 1717800000,
  "type": "refresh"
}
```

## Flow: Gym Registration

```
1. Owner fills registration form (gym name, name, phone, email, password)
2. POST /api/v1/auth/register
3. Backend:
   a. Validate email not taken
   b. Generate slug from gym name
   c. Create Gym record
   d. Hash password (bcrypt)
   e. Create User record (role=owner, gym_id=new gym)
   f. Generate access + refresh tokens
   g. Return tokens
4. Frontend stores tokens → redirect to /dashboard
```

## Flow: Login

```
1. POST /api/v1/auth/login {email, password}
2. Backend:
   a. Find user by email
   b. Verify password hash
   c. Check user.is_active
   d. Generate tokens with user_id + gym_id
   e. Return tokens
3. Frontend stores tokens → redirect to /dashboard
```

## Flow: Token Refresh

```
1. Frontend detects 401 response
2. POST /api/v1/auth/refresh {refresh_token}
3. Backend:
   a. Decode refresh token
   b. Verify type == "refresh" and not expired
   c. Issue new access + refresh tokens
4. Frontend stores new tokens → retry original request
```

## Tenant Isolation via JWT

The critical security property:

- `gym_id` is embedded in the JWT at login/registration time
- Every protected endpoint extracts `gym_id` from the token
- All database queries include `WHERE gym_id = <token.gym_id>`
- Users can NEVER manipulate gym_id — it's server-signed in the JWT
- No endpoint accepts gym_id as a URL or body parameter

This means: even if a user knows another gym's UUID, the API will never return that gym's data.

## Security Practices

1. **bcrypt** for password hashing (cost factor auto-adjusts)
2. **Short access token lifetime** (30 min) limits exposure if stolen
3. **HTTPS only** in production (enforced at infra level)
4. **No token in URL** — always in Authorization header
5. **CORS restricted** to frontend origin
6. **Secrets via environment variables** — never in code
7. **Input validation** — Pydantic enforces schemas before any logic runs

## Future Enhancements

- Token blacklist (for forced logout)
- Rate limiting on auth endpoints
- OTP-based login (WhatsApp OTP)
- Role-based access control (RBAC) per endpoint
