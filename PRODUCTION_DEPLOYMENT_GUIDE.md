# Production Deployment Guide - GhostKitchen

## Overview

This guide covers deploying GhostKitchen to production with focus on performance, security, and scalability. The application uses:

- **Backend**: Express.js on Render (Node.js)
- **Frontend**: Next.js on Vercel
- **Database**: PostgreSQL (Neon or Railway)
- **Real-time**: Socket.IO with Redis Pub/Sub (Redis Cloud)
- **Payments**: Cashfree Integration
- **Async Jobs**: BullMQ with Redis

---

## Part 1: Backend Deployment (Render)

### Prerequisites

- [ ] Render account created
- [ ] PostgreSQL database set up (Neon or Railway)
- [ ] Redis instance (Redis Cloud or Upstash)
- [ ] Cashfree credentials (production keys)
- [ ] JWT secret generated
- [ ] GitHub repository configured

### Step 1: Prepare Render Service

1. **Create new Web Service on Render**
   - Connect GitHub repository
   - Select `food-delivery-backend` as root directory
   - Build command: `npm install`
   - Start command: `npm start`

2. **Set Environment Variables**

```env
# Application
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://user:password@host/database
# Example (Neon): postgresql://userName:password@ep-XXXX.us-east-1.neon.tech/dbname

# Redis
REDIS_URL=redis://default:password@host:port
# Example (Redis Cloud): redis://default:password@redis-host.upstash.io:6379

# JWT
JWT_SECRET=your_32_character_random_secret_key_12345
JWT_REFRESH_SECRET=your_32_character_random_refresh_secret_key_8
JWT_EXPIRES_IN=7d

# CORS
FRONTEND_URL=https://ghostkitchen.vercel.app,https://www.ghostkitchen.vercel.app

# Payment (Cashfree Production)
CASHFREE_APP_ID=your_production_app_id
CASHFREE_SECRET_KEY=your_production_secret_key
CASHFREE_WEBHOOK_SECRET=your_production_webhook_secret
CASHFREE_ENV=PRODUCTION

# Logging
LOG_LEVEL=info
```

3. **Verify Build Settings**
   - Node version: 18+ (set in render.yaml or settings)
   - Build timeout: 30 minutes (default is sufficient)

### Step 2: Database Setup

#### Option A: Neon (Recommended)

1. Create PostgreSQL database in Neon dashboard
2. Generate database URL: `postgresql://user:password@host/db`
3. Run migrations:
   ```bash
   # Deploy backend first, then run via SSH
   npm run db:push  # or prisma migrate deploy
   ```

#### Option B: Railway

1. Create PostgreSQL service
2. Copy connection string to Railway dashboard
3. Run migrations same as above

### Step 3: Redis Setup

#### Option A: Redis Cloud (Recommended)

1. Create free Redis database (30MB free tier)
2. Copy URL: `redis://default:password@host:port`
3. Test connection:
   ```bash
   redis-cli -u redis://default:password@host:port ping
   ```

#### Option B: Upstash

1. Create Redis database
2. Copy connection URL
3. Enable TLS (enabled by default)

### Step 4: Run Initial Seeding

Once deployed:

```bash
# Option 1: Via API endpoint (if seeding endpoint enabled)
curl https://your-render-url.com/seed

# Option 2: Via Render shell
cd food-delivery-backend
npm run seed
```

### Step 5: Monitor Deployment

- **Health Check**: `GET https://your-render-url.com/health`
- **Logs**: Render dashboard → "Logs" tab
- **Metrics**: Monitor CPU, memory, disk usage

---

## Part 2: Frontend Deployment (Vercel)

### Prerequisites

- [ ] Vercel account created
- [ ] GitHub connected to Vercel
- [ ] Backend deployed and working

### Step 1: Deploy to Vercel

1. **Create new project**
   - Import GitHub repository
   - Select `ghost-kitchen-frontend` directory
   - Framework: Next.js

2. **Environment Variables**

```env
NEXT_PUBLIC_API_URL=https://ghostkitchen-api.onrender.com/api
NEXT_PUBLIC_SOCKET_URL=https://ghostkitchen-api.onrender.com

# Optional - if using authentication
NEXTAUTH_SECRET=your_random_secret_key_32_chars
NEXTAUTH_URL=https://your-vercel-domain.vercel.app

# Optional - if using Razorpay
NEXT_PUBLIC_RAZORPAY_KEY=your_razorpay_public_key
```

3. **Build Settings**
   - Build command: `next build` (auto-detected)
   - Output directory: `.next` (auto-detected)
   - Node version: 18+ (set in vercel.json)

### Step 2: Custom Domain (Optional)

1. **Add domain in Vercel**
   - Project settings → Domains
   - Add custom domain
   - Update DNS records as shown

2. **Configure CORS on backend**
   - Add new domain to `FRONTEND_URL`
   - Redeploy backend

### Step 3: Verify Deployment

- [ ] Frontend loads at `https://ghostkitchen.vercel.app`
- [ ] API calls work from browser console
- [ ] WebSocket connections established
- [ ] Real-time updates working

---

## Part 3: Security Configuration

### Backend Security

- [x] **GZIP Compression**: Enabled (reduces response size by 70-80%)
- [x] **Rate Limiting**: Configured for auth/payment endpoints
- [x] **CORS**: Restricted to frontend domain
- [x] **JWT**: Using secure secret (32+ characters)
- [x] **Password Hashing**: bcrypt with salt rounds=10
- [x] **HTTP Headers**: Set via middleware

### Additional Security Steps

1. **Enable HTTPS** (auto in Render/Vercel)
2. **Set Secure Cookies**
   ```javascript
   // In auth routes
   res.cookie('token', token, {
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production',
     sameSite: 'strict',
     maxAge: 7 * 24 * 60 * 60 * 1000
   });
   ```

3. **Implement CSP Headers**
   ```javascript
   app.use((req, res, next) => {
     res.setHeader("Content-Security-Policy", "default-src 'self'");
     next();
   });
   ```

4. **API Key Rotation**
   - Keep Cashfree keys secure
   - Rotate JWT secrets periodically (with backward compatibility)

---

## Part 4: Performance Optimization

### Current Optimizations ✅

- [x] **Compression**: GZIP enabled (level 6)
- [x] **Cache Control**: 60-second cache for API responses
- [x] **Rate Limiting**: Distributed via Redis
- [x] **Database**: Connection pooling via Prisma
- [x] **Socket.IO**: Redis adapter for horizontal scaling
- [x] **Async Jobs**: BullMQ queuing
- [x] **Real-time**: Socket.IO with efficient room management

### Additional Recommendations

1. **Database Optimization**
   ```sql
   -- Add indexes for frequently queried fields
   CREATE INDEX idx_users_email ON users(email);
   CREATE INDEX idx_orders_userId ON orders(userId);
   CREATE INDEX idx_orders_status ON orders(status);
   CREATE INDEX idx_restaurants_category ON restaurants(category);
   ```

2. **Image Optimization**
   - Use Next.js Image component (already enabled)
   - Lazy load images
   - Cloudinary/S3 for storage

3. **CDN Configuration**
   - Static assets: Vercel CDN (auto)
   - API: Render edge servers
   - Images: Cloudinary CDN

---

## Part 5: Monitoring & Alerting

### Health Checks

1. **Backend Health**
   - Endpoint: `GET /health`
   - Check every 5 minutes
   - Alert if response time > 5s or status != 200

2. **Database Health**
   - Check connectivity in `/health` endpoint
   - Monitor connection pool usage
   - Alert if queries slow (>100ms average)

3. **Redis Health**
   - Test PING command
   - Monitor memory usage (alert at 80%)
   - Check replication lag (for production)

### Logging & Monitoring

1. **Backend Logs**
   - Use Winston logger (already configured)
   - Log level: `info` in production
   - Store logs for 30 days minimum

2. **Frontend Monitoring**
   - Use Vercel Analytics (built-in)
   - Monitor Core Web Vitals
   - Track error rates

3. **Real-time Monitoring**
   - Socket.IO connections
   - Order processing latency
   - Payment success rate

### Performance Baselines

- API response time: < 200ms (p95)
- WebSocket latency: < 100ms
- Database query time: < 50ms (p95)
- Page load time: < 2.5s (Lighthouse)

---

## Part 6: Scaling Strategy

### Horizontal Scaling

1. **Multiple Backend Instances**
   - Enable with Redis Pub/Sub (already configured)
   - Load balancer: Render handles automatically
   - Max instances: Start with 2, scale to 5+

2. **Database Connection Pooling**
   - Prisma client pooling: 20-30 connections
   - Monitor pool exhaustion
   - Increase if needed: `?schema=public&connection_limit=50`

3. **Redis Scaling**
   - Start with shared instance
   - Upgrade to dedicated when needed
   - Monitor: Commands/sec, Memory, CPU

### Vertical Scaling

- Backend: Start with Standard tier, upgrade to Pro if needed
- Database: Add read replicas for heavy read workloads
- Redis: Upgrade from 30MB free to higher tier

---

## Part 7: Deployment Checklist

### Pre-Deployment

- [ ] All tests passing locally
- [ ] No console errors or warnings
- [ ] Environment variables documented
- [ ] Database migrations ready
- [ ] Security audit completed
- [ ] Load testing done (if high traffic expected)

### Deployment Day

- [ ] Deploy backend first (Render)
- [ ] Run database migrations
- [ ] Setup Redis instance
- [ ] Deploy frontend (Vercel)
- [ ] Test API connectivity
- [ ] Test WebSocket connections
- [ ] Test payment flow (sandbox)
- [ ] Test user authentication
- [ ] Monitor logs for errors

### Post-Deployment

- [ ] Verify all endpoints responding
- [ ] Check performance metrics
- [ ] Monitor error rates
- [ ] Test from mobile devices
- [ ] Load test with concurrent users
- [ ] Test payment webhooks
- [ ] Setup monitoring alerts

### Rollback Plan

If issues occur:

1. **Backend Rollback**
   - Render: Click previous deployment
   - Automatic in <1 minute

2. **Frontend Rollback**
   - Vercel: Click previous deployment
   - Automatic in <1 minute

3. **Database Rollback**
   - Use backup restore (if available)
   - May require manual intervention
   - **Important**: Keep daily backups

---

## Part 8: Maintenance & Updates

### Weekly Tasks

- [ ] Check error logs
- [ ] Review performance metrics
- [ ] Monitor storage usage

### Monthly Tasks

- [ ] Update dependencies
- [ ] Review security patches
- [ ] Test disaster recovery
- [ ] Backup verification

### Quarterly Tasks

- [ ] Full security audit
- [ ] Load testing
- [ ] Capacity planning
- [ ] Architecture review

---

## Troubleshooting

### Backend Issues

**Port Already in Use**
```bash
# Render: Check other services using same port
# Solution: Use different port or stop other services
```

**Database Connection Failed**
- Verify DATABASE_URL is correct
- Check firewall rules allow connection
- Test with: `psql $DATABASE_URL`

**Redis Connection Failed**
- Verify REDIS_URL format
- Check Redis service is running
- Test with: `redis-cli -u $REDIS_URL ping`

**WebSocket Not Connecting**
- Check Socket.IO CORS origins
- Verify WebSocket protocol enabled on backend
- Check browser WebSocket support

### Frontend Issues

**API Calls Returning 401**
- Verify NEXT_PUBLIC_API_URL is correct
- Check JWT token in localStorage
- Verify CORS on backend includes frontend URL

**WebSocket Disconnecting**
- Check latency to backend
- Verify socket connection URL
- Check for network interruptions

---

## Support & References

- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Express.js Docs**: https://expressjs.com
- **Socket.IO Docs**: https://socket.io/docs
- **Prisma Docs**: https://www.prisma.io/docs

---

## Summary

**Backend**: Deployed to Render with Redis for scaling
**Frontend**: Deployed to Vercel with Next.js optimization
**Database**: PostgreSQL with connection pooling
**Real-time**: Socket.IO with Redis adapter
**Monitoring**: Logs, health checks, performance metrics
**Security**: CORS, rate limiting, JWT, GZIP compression

This setup supports thousands of concurrent users with proper monitoring and scaling strategy.
