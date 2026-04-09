# Production Maintenance & Optimization Guide

## Overview

This guide covers maintaining, monitoring, and optimizing GhostKitchen in production to ensure high performance, reliability, and security.

---

## Part 1: Performance Optimization

### Current Optimizations ✅

The application comes with several optimizations already enabled:

1. **GZIP Compression** (Express.js)
   - Level: 6 (balanced)
   - Reduces response size: 70-80%
   - Applies to all responses

2. **Cache-Control Headers**
   - API responses cached: 60 seconds
   - Reduces repeated requests

3. **Rate Limiting** (Redis-backed)
   - General: 100 req/15min
   - Auth: 20 req/15min
   - Payment: 5 req/1min

4. **Database Connection Pooling**
   - Prisma: 20-30 connections
   - Prevents connection exhaustion

5. **Socket.IO Optimization**
   - Redis adapter (scales horizontally)
   - WebSocket + Polling fallback
   - Efficient room management

### Database Performance

#### Add Indexes for Frequently Queried Fields

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_id ON users(id);

-- Order lookups
CREATE INDEX idx_orders_userId ON orders(userId);
CREATE INDEX idx_orders_restaurantId ON orders(restaurantId);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_createdAt ON orders(createdAt DESC);

-- Restaurant lookups
CREATE INDEX idx_restaurants_name ON restaurants(name);
CREATE INDEX idx_restaurants_slug ON restaurants(slug);

-- Cart lookups
CREATE INDEX idx_cart_items_userId ON cart_items(userId);
CREATE INDEX idx_cart_items_restaurantId ON cart_items(restaurantId);

-- Payment lookups
CREATE INDEX idx_payments_orderId ON payments(orderId);
CREATE INDEX idx_payments_status ON payments(status);

-- Composite indexes for common queries
CREATE INDEX idx_orders_userId_status ON orders(userId, status);
CREATE INDEX idx_orders_restaurantId_createdAt ON orders(restaurantId, createdAt DESC);
```

#### Query Optimization Tips

```prisma
// ❌ Bad: N+1 query problem
const orders = await prisma.order.findMany();
for (const order of orders) {
  const user = await prisma.user.findUnique({ where: { id: order.userId } });
}

// ✅ Good: Single query with relations
const orders = await prisma.order.findMany({
  include: { user: true }
});

// ✅ Better: Only needed fields
const orders = await prisma.order.findMany({
  include: {
    user: { select: { id: true, email: true, name: true } }
  },
  select: {
    id: true,
    status: true,
    total: true,
    user: true
  }
});
```

#### Connection Pool Configuration

In `prisma/.env`:
```env
# Connection string with pool settings
DATABASE_URL="postgresql://user:password@host/db?schema=public&connection_limit=20"

# Explanation:
# connection_limit=20: Max 20 concurrent connections
# Adjust based on:
# - Instance type (free tier: 10-20, standard: 20-50)
# - Concurrent users
# - Query complexity
```

### API Response Optimization

#### Enable Pagination

```javascript
// routes/orders.js
router.get('/api/orders', authMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20; // Default 20 per page
  const skip = (page - 1) * limit;

  const orders = await prisma.order.findMany({
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' }
  });

  const total = await prisma.order.count();

  res.json({
    data: orders,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});
```

#### Implement Caching Layer

```javascript
// utils/cache.js
import redis from '../config/redis.js';

export async function getWithCache(key, fetchFunction, ttl = 300) {
  try {
    // Check cache first
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const data = await fetchFunction();

    // Store in cache
    await redis.setex(key, ttl, JSON.stringify(data));

    return data;
  } catch (error) {
    logger.error('Cache error:', error);
    return fetchFunction(); // Fallback to DB on error
  }
}

// Usage:
router.get('/api/restaurants', async (req, res) => {
  const restaurants = await getWithCache(
    'restaurants:all',
    () => prisma.restaurant.findMany(),
    600 // 10 minute cache
  );
  res.json(restaurants);
});
```

#### Compression Verification

```bash
# Verify GZIP compression is working
curl -H "Accept-Encoding: gzip" -I https://api.example.com/api/restaurants

# Look for:
# Content-Encoding: gzip
# Content-Length: (smaller than original)

# Test with different endpoints
for endpoint in "/api/restaurants" "/api/orders" "/api/menu"; do
  curl -s -H "Accept-Encoding: gzip" \
    https://api.example.com$endpoint | wc -c
done
```

---

## Part 2: Monitoring & Alerting

### Health Check Dashboard

Set up health checks for critical systems:

```bash
#!/bin/bash
# health-check.sh

echo "=== GhostKitchen Health Check ==="
echo ""

# 1. Backend API
echo "1. Backend API Health..."
HEALTH=$(curl -s https://api.example.com/health)
STATUS=$(echo $HEALTH | grep -o '"status":"[^"]*"')
echo "   Status: $STATUS"

# 2. Database
echo "2. Database..."
if echo $HEALTH | grep -q '"status":"healthy"'; then
  echo "   ✓ Connected"
else
  echo "   ✗ Failed"
fi

# 3. Redis
echo "3. Redis..."
if echo $HEALTH | grep -q '"status":"healthy"' && grep -q redis; then
  echo "   ✓ Connected"
else
  echo "   ✗ Failed"
fi

# 4. Frontend
echo "4. Frontend..."
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" https://ghostkitchen.vercel.app)
if [ "$FRONTEND" = "200" ]; then
  echo "   ✓ Running (HTTP $FRONTEND)"
else
  echo "   ✗ Down (HTTP $FRONTEND)"
fi

echo ""
echo "=== End Health Check ==="
```

### Log Aggregation

Store and analyze logs using Winston (already configured):

```javascript
// Monitor specific log patterns
const logsToMonitor = [
  'Rate limit exceeded',
  'Database connection error',
  'Redis connection error',
  'Authentication failed',
  'Payment failed',
  'Socket error'
];

// Set up daily log export for analysis
// via Render logs dashboard or third-party service
```

### Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Response Time (p95) | < 200ms | > 500ms |
| Error Rate | < 0.1% | > 1% |
| Database Queries (p95) | < 50ms | > 200ms |
| Redis Latency | < 10ms | > 50ms |
| CPU Usage | 30-50% | > 80% |
| Memory Usage | 40-60% | > 90% |
| Disk Usage | < 70% | > 90% |
| Payment Success Rate | > 99% | < 98% |
| WebSocket Connected Users | - | Monitor trend |

### Recommended Monitoring Tools

1. **Render**: Built-in metrics dashboard
   - CPU, memory, disk usage
   - Error tracking
   - Deployment history

2. **Vercel**: Built-in analytics
   - Core Web Vitals
   - Error tracking
   - Function performance

3. **Sentry** (Optional, free tier available)
   - Error tracking across platforms
   - Performance monitoring
   - Release tracking

4. **Datadog** (Optional)
   - Advanced metrics
   - Log aggregation
   - APM (Application Performance Monitoring)

---

## Part 3: Security Maintenance

### Regular Security Tasks

#### Weekly

```bash
# Check for new vulnerabilities
npm audit

# Review recent error logs for suspicious activity
# Look for: repeated 401s, rate limit triggers, SQL injection attempts
```

#### Monthly

```bash
# Update dependencies
npm update

# Check for critical security patches
npm audit --audit-level=moderate

# Rotate API keys if exposed
# Regenerate JWT secrets (with backward compatibility)
```

#### Quarterly

```bash
# Full security audit
npm audit --audit-level=moderate
npm audit fix

# Penetration testing (consider hiring)
# Security review of authentication flows
# CORS configuration verification
```

### Secret Rotation Strategy

When rotating secrets (JWT, API keys, etc.):

```javascript
// 1. Deploy with multiple valid secrets
const VALID_SECRETS = [
  process.env.JWT_SECRET, // New secret
  process.env.JWT_SECRET_OLD // Old secret (24-48 hours)
];

function verifyToken(token) {
  for (const secret of VALID_SECRETS) {
    try {
      return jwt.verify(token, secret);
    } catch (e) {
      continue;
    }
  }
  throw new Error('Invalid token');
}

// 2. Issue new tokens immediately
function refreshToken(token) {
  const decoded = verifyToken(token);
  return jwt.sign(decoded, process.env.JWT_SECRET); // New secret
}

// 3. After 24-48 hours, remove old secret
// Update: remove JWT_SECRET_OLD from environment
// Redeploy backend
```

### Database Security

```sql
-- Regular backups (automate this)
-- For Neon/Railway: Use built-in backup features

-- Monitor access logs
-- Check for unusual query patterns

-- Remove test data from production
-- Prune sensitive logs regularly

-- Encrypt columns with sensitive data
-- Credit cards, SSN, etc. (use encryption-at-rest)
```

---

## Part 4: Scaling Strategy

### When to Scale Up

#### Vertical Scaling (Bigger Instance)

Upgrade Render plan when:
- CPU consistently > 70%
- Memory consistently > 80%
- Response times increasing
- Database connections near limit

```
Free tier → Standard → Pro → Premium
```

#### Horizontal Scaling (Multiple Instances)

Scale out when:
- Single instance reaching limits
- Expected traffic spike
- Need for geographic distribution
- Cost optimization opportunity

```javascript
// Enable on Render:
// Settings → Scaling
// Set min instances to 2+
// Auto-scaling based on CPU/Memory
```

### Load Testing

Before production, test with expected traffic:

```bash
# Using Apache Bench
ab -n 10000 -c 100 https://api.example.com/api/restaurants

# Using wrk (better for concurrent connections)
wrk -t4 -c100 -d30s https://api.example.com/api/restaurants

# Interpret results:
# - Requests/sec: should not decrease under load
# - Latency: p95 should stay < 500ms
# - Errors: should be 0 or very low
```

### Cost Optimization

| Component | Free Tier | Paid Tier | Notes |
|-----------|-----------|-----------|-------|
| Backend (Render) | $0 spinning down | $7/month | Upgrade if needed |
| Frontend (Vercel) | Free | Pro $20/month | Usually free is enough |
| Database (Neon) | 3GB/month free | $0.16/GB | Monitor usage |
| Redis (Redis Cloud) | 30MB free | $5-50/month | Use free tier initially |
| Total | $0-5 | $30-100/month | Scale as needed |

Cost-saving tips:
- Use free tiers initially
- Monitor usage closely
- Upgrade only when necessary
- Consider reserved instances for long-term savings

---

## Part 5: Disaster Recovery

### Backup Strategy

```bash
# 1. Database Backups
# Neon: Automatic daily backups (7 days retention)
# Railway: Manual backups recommended
# Schedule: Daily automated backups, 30-day retention

# 2. Redis Backups
# For critical data, backup periodically
redis-cli --rdb /path/to/dump.rdb

# 3. Application Backups
# GitHub: Automatic (software versioning)
# Releases: Tag stable versions
git tag -a v1.0.0 -m "Production release"
git push origin v1.0.0
```

### Disaster Recovery Checklist

**If Database is Down**
```
1. Check Neon/Railway dashboard
2. Attempt restore from backup
3. If backup needed: redeploy backend pointing to backup DB
4. Run migrations on restored DB
5. Validate data integrity
6. Switch traffic back
```

**If Redis is Down**
```
1. Check Redis Cloud/Upstash dashboard
2. Restart Redis instance
3. Monitor reconnection (auto-handled)
4. Reset rate limit counters if needed
5. Backend continues to work (rate limiting disabled)
```

**If Backend is Down**
```
1. Check Render logs for errors
2. If code issue: rollback to previous deployment
3. If infrastructure: Render handles auto-restart
4. Check database and Redis connectivity
5. Redeploy with fixes
```

**If Frontend is Down**
```
1. Check Vercel logs
2. Rollback to previous deployment
3. Check environment variables
4. Redeploy from Vercel dashboard
```

---

## Part 6: Dependency Updates

### Safe Update Strategy

```bash
# 1. Update patch versions (automatic)
npm update  # Updates minor/patch only

# 2. Update minor versions (test first)
npm outdated  # See what's available
npm install package@~latest  # Update minor

# 3. Update major versions (carefully with testing)
npm install package@latest  # Major version update
npm test  # Run full test suite
# Deploy to staging first

# 4. Security-critical updates (urgent)
npm audit fix --force  # If necessary
npm test
Immediate deployment
```

### Testing After Updates

```bash
# 1. Unit tests
npm test

# 2. Integration tests (if available)
npm run test:integration

# 3. Manual testing
# - API endpoints working
# - WebSocket connections
# - Payment flow
# - Authentication

# 4. Performance testing
# - Response times not increased
# - Memory usage not increased
# - Error rates unchanged

# 5. Staging deployment
# Deploy to staging environment
# Run full test suite
# Monitor for 24-48 hours
```

---

## Part 7: Documentation & Runbooks

### Create Runbooks for Common Tasks

**Runbook: Deploy Backend**
```markdown
## Prerequisites
- [ ] GitHub branch up to date
- [ ] All tests passing
- [ ] Environment variables reviewed

## Steps
1. Push to main branch
2. Monitor Render deployment
3. Run health check: GET /health
4. Verify database connectivity
5. Check error logs

## Rollback
If issues: Click previous deployment in Render
```

**Runbook: Reset Database**
```markdown
## Caution: This will delete all data!

## Steps
1. Create backup first
2. Via Render shell: npm run db:reset
3. Run migrations: prisma migrate deploy
4. Seed if needed: npm run seed
5. Verify: npm test:db

## Verify
- [ ] All tables created
- [ ] Sample data seeded
- [ ] No error logs
```

---

## Summary Table

| Task | Frequency | Impact | Automation |
|------|-----------|--------|-----------|
| Monitor health checks | Continuous | Critical | Yes |
| Review error logs | Daily | High | Partial |
| Security patches | Weekly | Critical | No |
| Dependency updates | Monthly | Medium | No |
| Database backups | Daily | Critical | Yes |
| Performance review | Weekly | High | Partial |
| Security audit | Quarterly | High | No |
| Capacity planning | Monthly | Medium | No |

---

## Key Contacts & Resources

- **Render Support**: support@render.com
- **Vercel Support**: support@vercel.com
- **Neon Support**: hello@neon.tech
- **Redis Cloud Support**: support@redis.com

Emergency Procedures:
1. Check status pages first
2. Review error logs
3. Check deployment history
4. Consider rollback
5. Contact support if needed

Keep this guide updated as the application evolves. Good luck! 🚀
