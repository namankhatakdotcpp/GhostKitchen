# Quick Reference: Deployment Checklist

## Pre-Deployment Verification (Local)

```bash
# 1. Install dependencies
cd food-delivery-backend
npm install
npm install compression  # Verify compression is installed

# 2. Check backend configuration
cat src/app.js | grep -A 2 "compression"  # Should show compression middleware

# 3. Verify frontend build
cd ../ghost-kitchen-frontend
npm install
npm run build

# 4. Run backend tests (if available)
cd ../food-delivery-backend
npm test  # or npm run test:e2e

# 5. Check for unused dependencies
npm audit
```

---

## Backend Deployment Steps (Render)

### 1. Prepare Repository

```bash
# Ensure .env.example is committed
git add .env.example
git commit -m "chore: add environment configuration template"

# Ensure no .env files in git
git status | grep "\.env$"  # Should show nothing
```

### 2. Create Render Service

```
1. Go to https://render.com/dashboard
2. Click "New" → "Web Service"
3. Connect GitHub repository
4. Configuration:
   - Name: ghostkitchen-api
   - Environment: Node
   - Root Dir: food-delivery-backend
   - Build Command: npm install
   - Start Command: npm start
5. Click "Create Web Service"
```

### 3. Add Environment Variables

```
In Render Dashboard → Environment:

NODE_ENV=production
PORT=5000
LOG_LEVEL=info

DATABASE_URL=postgresql://user:password@host/db
REDIS_URL=redis://default:password@host:port

JWT_SECRET=<32-char random string>
JWT_REFRESH_SECRET=<32-char random string>
JWT_EXPIRES_IN=7d

FRONTEND_URL=https://ghostkitchen.vercel.app,https://www.ghostkitchen.vercel.app
BACKEND_URL=https://<render-url>.onrender.com

CASHFREE_APP_ID=<production-id>
CASHFREE_SECRET_KEY=<production-key>
CASHFREE_WEBHOOK_SECRET=<webhook-secret>
CASHFREE_ENV=PRODUCTION
```

### 4. Monitor Deployment

```bash
# Watch deployment logs
# Via Render Dashboard → Logs

# Once deployed, test health endpoint:
curl https://<your-render-url>.onrender.com/health

# Expected response (200 OK):
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "environment": "production",
  "redis": { "status": "healthy" }
}
```

### 5. Run Database Migrations

```bash
# Via Render Shell (in dashboard) or SSH:
cd food-delivery-backend
npm run db:push  # Using prisma
# OR
prisma migrate deploy

# Seed database (optional):
npm run seed
# OR
curl https://<your-render-url>.onrender.com/seed
```

---

## Frontend Deployment Steps (Vercel)

### 1. Prepare Repository

```bash
# Ensure all code is committed
git status

# No .env files should be committed
git ls-files | grep "\.env$"  # Should be empty
```

### 2. Create Vercel Project

```
1. Go to https://vercel.com/new
2. Import GitHub repository
3. Configuration:
   - Framework Preset: Next.js
   - Root Directory: ghost-kitchen-frontend
   - Build Command: next build (auto-detected)
   - Output Directory: .next (auto-detected)
4. Click "Deploy"
```

### 3. Add Environment Variables

```
In Vercel Dashboard → Settings → Environment Variables:

NEXT_PUBLIC_API_URL=https://<your-render-url>.onrender.com/api
NEXT_PUBLIC_SOCKET_URL=https://<your-render-url>.onrender.com

NEXT_PUBLIC_APP_NAME=GhostKitchen
NEXT_PUBLIC_APP_ENVIRONMENT=production

NEXTAUTH_SECRET=<32-char random string>
NEXTAUTH_URL=https://<your-vercel-domain>.vercel.app
```

### 4. Redeploy with Environment Variables

```
In Vercel Dashboard:
1. Go to Deployments
2. Click latest deployment
3. Click "Redeploy"
4. Confirm redeploy with new environment variables
```

### 5. Test Frontend

```bash
# Visit frontend URL
https://<your-vercel-domain>.vercel.app

# Test API connectivity (browser console):
fetch('https://<render-url>.onrender.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'test123'
  })
}).then(r => r.json()).then(console.log)
```

---

## Post-Deployment Verification

### Health Checks

```bash
# 1. Backend health
curl https://<render-url>.onrender.com/health
# Expected: HTTP 200, with redis status

# 2. API endpoint
curl https://<render-url>.onrender.com/api/restaurants
# Expected: HTTP 200 with restaurant data

# 3. Frontend loads
curl -I https://<vercel-url>.vercel.app
# Expected: HTTP 200

# 4. Check frontend can reach backend
# Open browser console and run:
fetch('https://<render-url>/api/auth/login').then(r => r.text()).then(console.log)
```

### Real-time Verification

```javascript
// In browser console (frontend)
const socket = io('https://<render-url>.onrender.com', {
  auth: { token: 'test-token' }
});

socket.on('connect', () => console.log('✓ Connected'));
socket.on('error', (err) => console.log('✗ Error:', err));
socket.on('connect_error', (err) => console.log('✗ Connection Error:', err));
```

### Performance Check

```bash
# 1. Check response time
time curl https://<render-url>.onrender.com/api/restaurants

# 2. Check compression is working
curl -H "Accept-Encoding: gzip" -I https://<render-url>.onrender.com/api/restaurants
# Look for: Content-Encoding: gzip

# 3. Check security headers
curl -I https://<render-url>.onrender.com/health
# Look for: X-RateLimit-* headers
```

---

## Rollback Procedure

### If Backend Has Issues

```
1. Go to Render Dashboard
2. Select service
3. Click previous deployment
4. Click "Redeploy"
5. Wait for deployment complete
6. Test health endpoint
```

### If Frontend Has Issues

```
1. Go to Vercel Dashboard
2. Go to Deployments
3. Find previous working deployment
4. Click "..." menu
5. Click "Promote to Production"
```

### If Database Has Issues

```
1. Connect to database
2. Check migrations: psql $DATABASE_URL -c "SELECT * FROM _prisma_migrations;"
3. If needed, rollback migration:
   prisma migrate resolve --rolled-back <migration-name>
4. Redeploy backend
```

---

## Common Issues & Quick Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| Database connection failed | 503 error, "cannot connect" | Verify DATABASE_URL, check firewall |
| Redis connection failed | Health check fails | Verify REDIS_URL, test with `redis-cli -u ...` ping |
| CORS errors | "blocked by CORS policy" | Add frontend domain to FRONTEND_URL, redeploy |
| 401 Unauthorized | Auth endpoints fail | Verify JWT_SECRET, regenerate tokens |
| WebSocket not connecting | Real-time features broken | Check socket URL, verify CORS origin |
| Rate limiting too strict | Requests rejected constantly | Check rate limit config, increase max if needed |
| Compression not working | Response size large | Verify compression npm package installed |

---

## Verification Checklist

### Before Going Live

- [ ] Backend deployed to Render
- [ ] Frontend deployed to Vercel
- [ ] Database configured and migrated
- [ ] Redis configured and connected
- [ ] Environment variables all set
- [ ] Health check endpoint returns 200
- [ ] API endpoints respond correctly
- [ ] WebSocket connections work
- [ ] CORS configured properly
- [ ] Payment gateway credentials set (production)

### Production Monitoring

- [ ] Check Render logs daily
- [ ] Monitor error rates < 0.1%
- [ ] Check response times < 200ms (p95)
- [ ] Verify database connections < 20
- [ ] Monitor Redis memory usage
- [ ] Check payment success rate > 99%

### Weekly Tasks

- [ ] Review error logs
- [ ] Check performance metrics
- [ ] Verify backups completed
- [ ] Test authentication flow
- [ ] Monitor disk/memory usage

---

## Critical Passwords & Secrets

**DO NOT commit these files:**
```bash
.env
.env.local
.env.production.local
```

**DO commit these files:**
```bash
.env.example
.env.local.example
```

**Store secrets in:**
- Render: Settings → Environment Variables
- Vercel: Settings → Environment Variables
- Never in Git
- Never in Slack/Email unencrypted

---

## Deployment Summary

**Backend URL**: https://ghostkitchen-api.onrender.com
**Frontend URL**: https://ghostkitchen.vercel.app
**Health Check**: https://ghostkitchen-api.onrender.com/health
**API Docs**: API endpoints at /api/*

**Estimated Deployment Time**: 15-20 minutes
**First-time Setup**: 45-60 minutes (including database/Redis setup)
**Post-deployment Testing**: 10-15 minutes

---

## Support Resources

- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Prisma Docs**: https://www.prisma.io/docs
- **Socket.IO Docs**: https://socket.io/docs
- **Cashfree Docs**: https://docs.cashfree.com

Deploy with confidence! 🚀
