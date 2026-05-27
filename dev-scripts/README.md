# Dev Scripts

> **These scripts are NOT part of the production application.**  
> They exist for local development, debugging, and one-time operations only.

## Contents

| Script | Purpose |
|--------|---------|
| `test_auth_flow.py` | Playwright-based auth E2E test (local dev) |

## Untracked Scripts (in `.gitignore`)

The following directories contain ad-hoc debug/test scripts that are
excluded from version control:

- `scratch_tests/` — Security audit scripts, manual API tests
- `backend/scratch_tests/` — Distribution analysis
- `backend/*.py` (root-level) — One-off DB check scripts

These should never be committed to the main branch.
