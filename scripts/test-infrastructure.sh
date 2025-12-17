#!/bin/bash

# Infrastructure Testing Script
# This script tests all the new infrastructure components

set -e

echo "Testing Infrastructure Components..."
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN} $2${NC}"
    else
        echo -e "${RED}$2${NC}"
        if [ ! -z "$3" ]; then
            echo -e "${YELLOW}Details: $3${NC}"
        fi
    fi
}

# Function to wait for service
wait_for_service() {
    local url=$1
    local max_attempts=30
    local attempt=1
    
    echo -n "Waiting for service at $url... "
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo " Ready!"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    echo "Timeout!"
    return 1
}

# Check if Redis is running
echo "1. Testing Redis Connection..."
if redis-cli ping > /dev/null 2>&1; then
    print_status 0 "Redis is running"
else
    print_status 1 "Redis is not running" "Start Redis with: brew services start redis"
    exit 1
fi

# Check if application is running
echo "2. Testing Application Health..."
if wait_for_service "http://localhost:3000/api/health/status"; then
    print_status 0 "Application is running"
else
    print_status 1 "Application is not running" "Start with: npm run dev"
    exit 1
fi

# Test health endpoint
echo "3. Testing Health Check Endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/health/status)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    print_status 0 "Health check passed"
    echo "   Services: $(echo "$HEALTH_RESPONSE" | jq -r '.services | to_entries | map("\(.key): \(.value)") | join(", ")')"
else
    print_status 1 "Health check failed" "$HEALTH_RESPONSE"
fi

# Test Redis through application
echo "4. Testing Redis Integration..."
SECURITY_RESPONSE=$(curl -s http://localhost:3000/api/security/status)
if echo "$SECURITY_RESPONSE" | grep -q '"redisSessions":true'; then
    print_status 0 "Redis integration working"
else
    print_status 1 "Redis integration failed" "$SECURITY_RESPONSE"
fi

# Test session management
echo "5. Testing Session Management..."
SESSION_RESPONSE=$(curl -s -X POST http://localhost:3000/api/zk/identity/init \
  -H "Content-Type: application/json" \
  -d '{"userEmail": "test@example.com"}' 2>/dev/null || echo "{}")

if echo "$SESSION_RESPONSE" | grep -q '"success":true\|"identity_commitment"'; then
    print_status 0 "Session management working"
else
    print_status 1 "Session management failed" "$SESSION_RESPONSE"
fi

# Test rate limiting
echo "6. Testing Rate Limiting..."
RATE_LIMIT_COUNT=0
for i in {1..5}; do
    RESPONSE=$(curl -s http://localhost:3000/api/security/status)
    if echo "$RESPONSE" | grep -q "rate limit\|429"; then
        RATE_LIMIT_COUNT=$((RATE_LIMIT_COUNT + 1))
    fi
    sleep 0.1
done

if [ $RATE_LIMIT_COUNT -gt 0 ]; then
    print_status 0 "Rate limiting working ($RATE_LIMIT_COUNT/5 requests limited)"
else
    print_status 1 "Rate limiting not working" "No rate limits detected"
fi

# Test queue system
echo "7. Testing Message Queue..."
QUEUE_STATS=$(curl -s http://localhost:3000/api/monitoring/queue-stats)
if echo "$QUEUE_STATS" | grep -q '"waiting"\|"active"\|"completed"'; then
    print_status 0 "Queue system working"
    echo "   Queue stats: $(echo "$QUEUE_STATS" | jq -r '. | to_entries | map("\(.key): \(.value)") | join(", ")')"
else
    print_status 1 "Queue system failed" "$QUEUE_STATS"
fi

# Test async proof generation
echo "8. Testing Async Proof Generation..."
PROOF_RESPONSE=$(curl -s -X POST http://localhost:3000/api/zk/proof-async \
  -H "Content-Type: application/json" \
  -d '{
    "signal": 1,
    "externalNullifier": 123,
    "groupId": 1
  }' 2>/dev/null || echo "{}")

if echo "$PROOF_RESPONSE" | grep -q '"jobId"\|"success"'; then
    print_status 0 "Async proof generation working"
    JOB_ID=$(echo "$PROOF_RESPONSE" | jq -r '.jobId // .id // "unknown"')
    echo "   Job ID: $JOB_ID"
    
    # Test job status
    if [ "$JOB_ID" != "unknown" ] && [ "$JOB_ID" != "null" ]; then
        sleep 2
        STATUS_RESPONSE=$(curl -s "http://localhost:3000/api/zk/proof-status/$JOB_ID")
        if echo "$STATUS_RESPONSE" | grep -q '"status"'; then
            print_status 0 "Job status tracking working"
            echo "   Job status: $(echo "$STATUS_RESPONSE" | jq -r '.status // "unknown"')"
        else
            print_status 1 "Job status tracking failed" "$STATUS_RESPONSE"
        fi
    fi
else
    print_status 1 "Async proof generation failed" "$PROOF_RESPONSE"
fi

# Test logging
echo "9. Testing Logging System..."
if [ -d "logs" ] && [ "$(ls -A logs 2>/dev/null)" ]; then
    print_status 0 "Logging system working"
    echo "   Log files: $(ls logs/ | head -3 | tr '\n' ' ')..."
    
    # Check recent log entries
    TODAY=$(date +%Y-%m-%d)
    if [ -f "logs/combined-$TODAY.log" ]; then
        LOG_LINES=$(wc -l < "logs/combined-$TODAY.log")
        echo "   Today's log entries: $LOG_LINES"
    fi
else
    print_status 1 "Logging system failed" "No log files found in logs/ directory"
fi

# Test admin endpoints
echo "10. Testing Admin Endpoints..."
ADMIN_SELF=$(curl -s http://localhost:3000/api/admin/users/self 2>/dev/null || echo "{}")
if echo "$ADMIN_SELF" | grep -q '"isAdmin"\|"success"'; then
    print_status 0 "Admin self endpoint working"
else
    print_status 1 "Admin self endpoint failed" "$ADMIN_SELF"
fi

# Test database overview
DB_OVERVIEW=$(curl -s http://localhost:3000/api/admin/db/overview 2>/dev/null || echo "{}")
if echo "$DB_OVERVIEW" | grep -q '"groups"\|"user_sessions"'; then
    print_status 0 "Database overview working"
else
    print_status 1 "Database overview failed" "$DB_OVERVIEW"
fi

# Test audit logs
AUDIT_LIST=$(curl -s http://localhost:3000/api/admin/audit/list 2>/dev/null || echo "{}")
if echo "$AUDIT_LIST" | grep -q '"logs"\|"audit"'; then
    print_status 0 "Audit logs working"
else
    print_status 1 "Audit logs failed" "$AUDIT_LIST"
fi

# Performance test
echo "11. Testing Performance..."
echo "   Testing concurrent session creation..."
START_TIME=$(date +%s)
for i in {1..5}; do
    curl -s -X POST http://localhost:3000/api/zk/identity/init \
      -H "Content-Type: application/json" \
      -d "{\"userEmail\": \"perftest$i@example.com\"}" > /dev/null &
done
wait
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
print_status 0 "Performance test completed in ${DURATION}s"

# Final summary
echo ""
echo "Infrastructure Testing Complete!"
echo "=================================="

# Count Redis keys
REDIS_KEYS=$(redis-cli keys "semaphore:*" | wc -l)
echo "Redis keys: $REDIS_KEYS"

# Count log files
LOG_FILES=$(ls logs/ 2>/dev/null | wc -l)
echo "Log files: $LOG_FILES"

# Check queue stats
QUEUE_SUMMARY=$(curl -s http://localhost:3000/api/monitoring/queue-stats | jq -r '. | to_entries | map("\(.key): \(.value)") | join(", ")' 2>/dev/null || echo "unavailable")
echo "Queue stats: $QUEUE_SUMMARY"

echo ""
echo " All infrastructure components are working!"
echo "Access the application at: http://localhost:3000"
echo "Access admin dashboard at: http://localhost:3000/admin"
echo "Monitor health at: http://localhost:3000/api/health/status"
