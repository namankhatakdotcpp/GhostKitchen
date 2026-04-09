# Environment Configuration Checklist

## Backend Environment Variables (.env)

### Essential Configuration

```env
# ============================================
# Application Configuration
# ============================================
NODE_ENV=production
PORT=5000
LOG_LEVEL=info

# ============================================
# Database Configuration
# ============================================
# PostgreSQL connection string
# Format: postgresql://username:password@host:port/database
# Neon example: postgresql://user:password@ep-XXXX.us-east-1.neon.tech/dbname
# Railway example: postgresql://user:password@railway.app:5432/dbname
DATABASE_URL=postgresql://username:password@host:port/database

# ============================================
# Redis Configuration (Required for Scaling)
# ============================================
# Redis connection string
# Format: redis://default:password@host:port
# Redis Cloud: redis://default:password@redis-host.upstash.io:6379
# Local development: redis://localhost:6379
REDIS_URL=redis://default:password@host:port

# ============================================
# JWT Authentication
# ============================================
# MUST be at least 32 characters for security
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_32_character_random_secret_key_here
JWT_REFRESH_SECRET=your_32_character_random_refresh_key_here
JWT_EXPIRES_IN=7d

# ============================================
# CORS Configuration
# ============================================
# Comma-separated list of allowed origins
# Production: https://ghostkitchen.vercel.app,https://www.ghostkitchen.vercel.app
# Development: http://localhost:3000,http://localhost:3001
FRONTEND_URL=https://ghostkitchen.vercel.app,https://www.ghostkitchen.vercel.app

# ============================================
# Payment Gateway (Cashfree)
# ============================================
# Production or Sandbox credentials
# Get from: https://dashboard.cashfree.com
CASHFREE_APP_ID=your_production_app_id
CASHFREE_SECRET_KEY=your_production_secret_key
CASHFREE_WEBHOOK_SECRET=your_production_webhook_secret
CASHFREE_ENV=PRODUCTION

# ============================================
# Optional: Admin Configuration
# ============================================
# Optional secret for admin routes
ADMIN_SECRET=your_admin_secret_key
```

---

## Frontend Environment Variables

### .env.local (Next.js)

```env
# ============================================
# API Configuration
# ============================================
# Backend API URL
NEXT_PUBLIC_API_URL=https://ghostkitchen-api.onrender.com/api

# Socket.IO Server URL (for real-time updates)
NEXT_PUBLIC_SOCKET_URL=https://ghostkitchen-api.onrender.com

# ============================================
# Application Info
# ============================================
NEXT_PUBLIC_APP_NAME=GhostKitchen
NEXT_PUBLIC_APP_ENVIRONMENT=production

# ============================================
# Authentication (NextAuth - Optional)
# ============================================
# Secret for session encryption
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=your_random_secret_key_here
NEXTAUTH_URL=https://ghostkitchen.vercel.app

# ============================================
# Razorpay (If used instead of Cashfree)
# ============================================
# NEXT_PUBLIC_RAZORPAY_KEY=your_razorpay_public_key

# ============================================
# Cloudinary (For image uploads - Optional)
# ============================================
# NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
# NEXT_PUBLIC_CLOUDINARY_API_KEY=your_api_key
```

---

## Step-by-Step Configuration

### 1. Generate Required Secrets

```bash
# Generate JWT Secret (32 chars min)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate NextAuth Secret
openssl rand -base64 32

# For testing - temporary secrets (DO NOT use in production)
JWT_SECRET=abcd1234abcd1234abcd1234abcd1234
JWT_REFRESH_SECRET=efgh5678efgh5678efgh5678efgh5678
```

### 2. Configure Database

**Neon PostgreSQL (Recommended)**
```
1. Create account at https://neon.tech
2. Create new project
3. Copy connection string
4. Append to DATABASE_URL
Example: postgresql://neondb_owner:xxxxx@ep-cool-grass.us-east-1.neon.tech/neondb
```

**Railway PostgreSQL**
```
1. Create account at https://railway.app
2. Create PostgreSQL service
3. Copy connection string
4. Append to DATABASE_URL
Example: postgresql://postgres:xxxxx@xxx.railway.app:5432/railway
```

### 3. Configure Redis

**Redis Cloud (Free 30MB tier)**
```
1. Create account at https://redis.com/cloud
2. Create database
3. Copy free account connection URL
4. Example: redis://default:xxxxx@redis-xxxxx.upstash.io:6379
5. Append to REDIS_URL
```

**Upstash Redis**
```
1. Create account at https://upstash.com
2. Create database
3. Copy connection URL
4. Example: redis://default:xxxxx@xxx.upstash.io
5. Append to REDIS_URL
```

### 4. Configure Cashfree Payment

**Production Keys:**
```
1. Login at https://dashboard.cashfree.com/login
2. Go to Settings → API Keys
3. Select MODE: Production
4. Copy:
   - APP_ID → CASHFREE_APP_ID
   - SECRET_KEY → CASHFREE_SECRET_KEY
5. Generate WEBHOOK_SECRET
6. Set CASHFREE_ENV=PRODUCTION
```

**Sandbox/Testing:**
```
1. Use TEST/SANDBOX mode
2. Test credentials provided by Cashfree
3. Process mock payments
4. Before deployment, switch to PRODUCTION mode
```

### 5. Configure CORS

**Development:**
```env
FRONTEND_URL=http://localhost:3000,http://localhost:3001
```

**Production:**
```env
FRONTEND_URL=https://ghostkitchen.vercel.app,https://www.ghostkitchen.vercel.app
```

---

## Deployment Platform Setup

### Render (Backend)

1. **Create Web Service**
   - Connect GitHub repo
   - Root directory: `food-delivery-backend`
   - Build: `npm install`
   - Start: `npm start`

2. **Set Environment Variables**
   - Go to Settings → Environment
   - Add all backend environment variables

3. **Deploy**
   - Push to main branch
   - Render auto-deploys

### Vercel (Frontend)

1. **Create Project**
   - Import GitHub repo
   - Framework: Next.js
   - Root: `ghost-kitchen-frontend`

2. **Set Environment Variables**
   - Project settings → Environment Variables
   - Add all frontend variables

3. **Deploy**
   - Push to main branch
   - Vercel auto-deploys

---

## Validation Checklist

### Backend Variables

- [ ] DATABASE_URL: `postgresql://...` ✓
- [ ] REDIS_URL: `redis://...` ✓
- [ ] JWT_SECRET: 32+ characters ✓
- [ ] JWT_REFRESH_SECRET: 32+ characters ✓
- [ ] CASHFREE_APP_ID: Set ✓
- [ ] CASHFREE_SECRET_KEY: Set ✓
- [ ] CASHFREE_WEBHOOK_SECRET: Set ✓
- [ ] CASHFREE_ENV: PRODUCTION (not TEST) ✓
- [ ] FRONTEND_URL: URLs match deployed frontend ✓
- [ ] NODE_ENV: production ✓

### Frontend Variables

- [ ] NEXT_PUBLIC_API_URL: Matches backend URL ✓
- [ ] NEXT_PUBLIC_SOCKET_URL: Matches backend URL ✓
- [ ] NEXTAUTH_SECRET: 32+ characters ✓
- [ ] NEXTAUTH_URL: Matches frontend URL ✓
- [ ] NEXT_PUBLIC_APP_ENVIRONMENT: production ✓

---

## Testing Configuration

### Backend Health Check

```bash
# Test API health
curl https://your-render-url.com/health

# Expected response:
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "environment": "production",
  "redis": {
    "status": "healthy",
    "message": "Redis connected"
  }
}
```

### Frontend Configuration Test

```bash
# Check API connectivity from browser console
fetch('https://your-backend-url.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'test123'
  })
})
.then(r => r.json())
.then(d => console.log(d))
```

### WebSocket Test

```javascript
// Browser console
const socket = io('https://your-backend-url.com', {
  auth: {
    token: 'your_jwt_token_here'
  }
});

socket.on('connect', () => console.log('Connected!'));
socket.on('error', (err) => console.error('Error:', err));
```

---

## Security Best Practices

### Secrets Management

- [x] Never commit .env to git
- [x] Use .env.example for template
- [x] Rotate secrets every 90 days
- [x] Use different secrets for dev/prod
- [x] Store secrets in deployment platform

### Environment Variable Rules

1. **Development Secrets** (local .env)
   - Use short, simple values
   - Can be shared in team docs
   - Regenerate before production

2. **Production Secrets** (secure storage)
   - >= 32 characters recommended
   - Cryptographically random
   - Never shared in slack/email
   - Stored only in secure vault

3. **Rotation Strategy**
   - Set expiration date on secrets
   - Prepare new secrets
   - Deploy with both old+new
   - Phase out old after 24h

---

## Troubleshooting

### "Database connection failed"
```
1. Check DATABASE_URL format
2. Verify host is accessible
3. Test: psql $DATABASE_URL
4. Check firewall rules
5. Redeploy with correct URL
```

### "Redis connection failed"
```
1. Verify REDIS_URL format
2. Test connectivity: redis-cli -u $REDIS_URL ping
3. Check password is correct
4. Verify port number (default 6379)
```

### "401 Unauthorized errors"
```
1. Check JWT_SECRET matches between deployments
2. Verify token is in Authorization header
3. Check token expiration
4. Regenerate tokens if secret changed
```

### "CORS errors in frontend"
```
1. Verify FRONTEND_URL includes http/https
2. Check comma separation (no extra spaces)
3. Match exact domain (including www or not)
4. Redeploy backend after changing
```

---

## Summary

| Variable | Type | Security | Example |
|----------|------|----------|---------|
| NODE_ENV | Config | Low | production |
| DATABASE_URL | Credential | High | postgresql://... |
| REDIS_URL | Credential | High | redis://... |
| JWT_SECRET | Credential | Critical | 64-char random |
| CASHFREE_* | Credential | Critical | From dashboard |
| FRONTEND_URL | Config | Medium | https://... |

**Total Variables Required**: 11+ for production
**Setup Time**: 30-45 minutes
**Risk Level if Wrong**: Application completely broken

Start with this checklist for accurate, secure configuration.
