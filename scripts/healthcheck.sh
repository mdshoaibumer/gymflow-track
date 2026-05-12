#!/bin/bash
# ============================================================
# GymFlow Track — Health Check Script
# ============================================================
# Usage:
#   ./scripts/healthcheck.sh          # Full health check
#   ./scripts/healthcheck.sh --quick  # Quick check (no DB)
#
# Exit codes:
#   0 = all healthy
#   1 = one or more checks failed
# ============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gymflow}"
COMPOSE_FILE="docker-compose.prod.yml"
QUICK_MODE=false
FAILURES=0

if [ "${1:-}" = "--quick" ]; then
    QUICK_MODE=true
fi

cd "$APP_DIR" 2>/dev/null || true

check() {
    local name=$1
    local result=$2
    if [ "$result" = "ok" ]; then
        echo "  [OK] $name"
    else
        echo "  [FAIL] $name: $result"
        FAILURES=$((FAILURES + 1))
    fi
}

echo "=== GymFlow Health Check ==="
echo ""

# ── Container Status ─────────────────────────────────────────
echo "Containers:"
for svc in caddy db redis backend frontend; do
    STATUS=$(docker compose -f "$COMPOSE_FILE" ps "$svc" --format "{{.Status}}" 2>/dev/null || echo "not found")
    if echo "$STATUS" | grep -qi "up\|healthy"; then
        check "$svc" "ok"
    else
        check "$svc" "$STATUS"
    fi
done

# ── API Health ───────────────────────────────────────────────
echo ""
echo "API Endpoints:"

# Liveness
LIVE=$(curl -sf --max-time 5 http://localhost:8000/health/live 2>/dev/null && echo "ok" || echo "unreachable")
check "Backend liveness" "$LIVE"

if [ "$QUICK_MODE" = false ]; then
    # Readiness (includes DB check)
    READY=$(curl -sf --max-time 10 http://localhost:8000/health/ready 2>/dev/null && echo "ok" || echo "not ready")
    check "Backend readiness" "$READY"

    # Full health (backward compat)
    HEALTH=$(curl -sf --max-time 10 http://localhost:8000/health 2>/dev/null && echo "ok" || echo "unhealthy")
    check "Backend health" "$HEALTH"
fi

# ── External Access ──────────────────────────────────────────
echo ""
echo "External Access:"

HTTPS_API=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" https://api.gymflowtrack.in/health/live 2>/dev/null || echo "000")
if [ "$HTTPS_API" = "200" ]; then
    check "api.gymflowtrack.in (HTTPS)" "ok"
else
    check "api.gymflowtrack.in (HTTPS)" "HTTP $HTTPS_API"
fi

HTTPS_APP=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" https://app.gymflowtrack.in 2>/dev/null || echo "000")
if [ "$HTTPS_APP" = "200" ]; then
    check "app.gymflowtrack.in (HTTPS)" "ok"
else
    check "app.gymflowtrack.in (HTTPS)" "HTTP $HTTPS_APP"
fi

# ── SSL Certificate ─────────────────────────────────────────
if [ "$QUICK_MODE" = false ]; then
    echo ""
    echo "SSL Certificate:"
    SSL_EXPIRY=$(echo | openssl s_client -connect api.gymflowtrack.in:443 -servername api.gymflowtrack.in 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "unknown")
    if [ "$SSL_EXPIRY" != "unknown" ]; then
        EXPIRY_EPOCH=$(date -d "$SSL_EXPIRY" +%s 2>/dev/null || echo "0")
        NOW_EPOCH=$(date +%s)
        DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
        if [ $DAYS_LEFT -gt 14 ]; then
            check "SSL certificate" "ok (expires in ${DAYS_LEFT} days)"
        else
            check "SSL certificate" "EXPIRING in ${DAYS_LEFT} days!"
        fi
    else
        check "SSL certificate" "could not verify"
    fi
fi

# ── Disk & Memory ───────────────────────────────────────────
echo ""
echo "System Resources:"
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USAGE" -lt 85 ]; then
    check "Disk usage" "ok (${DISK_USAGE}%)"
else
    check "Disk usage" "HIGH (${DISK_USAGE}%)"
fi

MEM_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')
if [ "$MEM_USAGE" -lt 90 ]; then
    check "Memory usage" "ok (${MEM_USAGE}%)"
else
    check "Memory usage" "HIGH (${MEM_USAGE}%)"
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
if [ $FAILURES -eq 0 ]; then
    echo "=== ALL CHECKS PASSED ==="
    exit 0
else
    echo "=== $FAILURES CHECK(S) FAILED ==="
    exit 1
fi
