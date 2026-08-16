#!/usr/bin/env bash
# Exercises the required API contract end to end. Run with:
#   ./scripts/smoke-test.sh            (AUTH_ENABLED=false, no credentials)
#   AUTH_ENABLED=true LOADGEN_API_KEY=x ./scripts/smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
AUTH_ENABLED="${AUTH_ENABLED:-false}"
LOADGEN_API_KEY="${LOADGEN_API_KEY:-}"

AUTH_HEADER=()
if [ "$AUTH_ENABLED" = "true" ] && [ -n "$LOADGEN_API_KEY" ]; then
  AUTH_HEADER=(-H "Authorization: Bearer $LOADGEN_API_KEY")
fi

echo "==> waiting for /health"
for i in $(seq 1 60); do
  if curl -sf "$BASE_URL/health" > /dev/null; then
    echo "healthy after ${i}s"
    break
  fi
  sleep 1
done
curl -sf "$BASE_URL/health" > /dev/null

echo "==> POST /logs (valid + invalid entries)"
RESP=$(curl -s -X POST "$BASE_URL/logs" "${AUTH_HEADER[@]}" \
  -H "Content-Type: application/json" \
  -d '{"logs":[
    {"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'","level":"error","service":"checkout","message":"payment declined","attributes":{"user_id":"42","region":"eu-west","retries":3}},
    {"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'","level":"critical","service":"checkout","message":"bad level"}
  ]}')
echo "$RESP"
echo "$RESP" | grep -q '"accepted":1'
echo "$RESP" | grep -q '"index":1'

if [ "$AUTH_ENABLED" = "true" ]; then
  echo "==> unauthenticated request must be rejected with 401"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/logs")
  [ "$STATUS" = "401" ]
fi

echo "==> GET /logs"
curl -sf "$BASE_URL/logs?service=checkout&limit=10" "${AUTH_HEADER[@]}" | grep -q '"logs"'

echo "==> GET /logs/aggregate"
SINCE=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
UNTIL=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl -sf "$BASE_URL/logs/aggregate?since=$SINCE&until=$UNTIL&bucket=1m" "${AUTH_HEADER[@]}" | grep -q '"buckets"'

echo "==> invalid query param returns 400 with error body"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/logs?level=critical" "${AUTH_HEADER[@]}")
[ "$STATUS" = "400" ]

echo "ALL SMOKE TESTS PASSED (AUTH_ENABLED=$AUTH_ENABLED)"
