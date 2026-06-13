<div align="center">

```
  ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗
 ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝
 ██║  ███╗███████║██║   ██║███████╗   ██║   
 ██║   ██║██╔══██║██║   ██║╚════██║   ██║   
 ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║   
  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝  
 ██╗  ██╗██╗████████╗ ██████╗██╗  ██╗███████╗███╗   ██╗
 ██║ ██╔╝██║╚══██╔══╝██╔════╝██║  ██║██╔════╝████╗  ██║
 █████╔╝ ██║   ██║   ██║     ███████║█████╗  ██╔██╗ ██║
 ██╔═██╗ ██║   ██║   ██║     ██╔══██║██╔══╝  ██║╚██╗██║
 ██║  ██╗██║   ██║   ╚██████╗██║  ██║███████╗██║ ╚████║
 ╚═╝  ╚═╝╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝
```

**A full-stack, multi-portal food delivery platform**  
*Built like Zomato. Designed for India. Open source.*

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?style=flat-square&logo=nodedotjs)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-white?style=flat-square&logo=socketdotio&logoColor=black)](https://socket.io)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-479%20passing-success?style=flat-square&logo=vitest)](#-testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Live Demo](#) · [Report Bug](../../issues) · [Request Feature](../../issues) · [Architecture Docs](#-architecture)

</div>

---

## What is GhostKitchen?

GhostKitchen is a **production-grade food delivery web application** with four portals — one for each kind of user. Think Zomato or Swiggy, but open source, self-hostable, and built to be extended into a real startup.

| Portal | Who uses it | What they do |
|--------|-------------|--------------|
| 🛒 **Customer** | End users | Browse restaurants, order food, track delivery live |
| 🍳 **Shopkeeper** | Restaurant owners | Manage menu, accept orders, view analytics |
| 🚴 **Delivery** | Delivery agents | Accept assignments, navigate to customer, track earnings |
| ⚙️ **Admin** | Platform operators | Manage all restaurants, users, agents, refunds, disputes |

> **Accounts are multi-role.** A single user account holds an array of roles (`CUSTOMER`, `RESTAURANT`, `DELIVERY`, `ADMIN`) plus an `activeRole`. The same person can register as a customer and later add a restaurant or rider role, then switch between portals — no separate logins.

---

## Feature highlights

**Customer portal**
- Location-aware restaurant feed with infinite scroll
- Sticky category filters (Biryani, Pizza, Burger, etc.)
- Full restaurant menu with veg/non-veg toggle
- Cart with cross-restaurant validation
- Saved delivery addresses with a default address
- Favorites, personalized recommendations, and trending restaurants
- Coupon / promo code redemption with server-side validation
- Reorder a past order in one tap
- Reviews and ratings after a delivered order
- Live order tracking with animated status timeline
- Real-time delivery agent location updates via Socket.io
- Cashfree Payments integration (UPI, cards, wallets)
- Refund visibility — track the status of any refund issued on your orders

**Shopkeeper portal**
- Real-time incoming order board (Kanban style)
- Browser notifications + sound chime on new orders
- Auto-reject countdown on unaccepted orders
- Drag-to-reorder menu items with dnd-kit
- Sales analytics with Recharts (revenue, top dishes, peak hours)

**Delivery portal**
- Giant online/offline toggle (one-handed mobile use)
- Full-screen incoming assignment modal with countdown
- Step-by-step delivery flow (Go to restaurant → Pick up → Deliver)
- One-tap call buttons for restaurant and customer
- Earnings dashboard with daily/weekly/monthly breakdown
- Live GPS location emission every 10 seconds

**Admin panel**
- Platform-wide metrics and analytics dashboard
- Restaurant approval, suspension, and editing
- User management across all roles (grant/revoke roles, block, suspend)
- Refund dashboard — initiate and sync refunds against Cashfree
- Coupon management
- Review moderation
- Audit log with export
- Site settings + maintenance mode scheduling
- Enhanced health check endpoint

**Backend & platform**
- Multi-role JWT auth with **access + refresh tokens** and refresh-token rotation
- Server-side price validation (client can never send fake totals; **all money is stored in paise**)
- Cashfree payment orders, webhook signature verification (HMAC-SHA256), and deduplication
- Proximity-based delivery agent assignment (Haversine distance)
- Socket.io room architecture (order rooms, shop rooms, agent rooms, admin room)
- Zod validation on all API inputs + XSS sanitization
- Redis caching layer (Upstash REST or ioredis) — degrades gracefully when absent
- Per-route rate limiting
- Structured logging with Winston + error monitoring with Sentry (optional)
- Audit logging for sensitive operations
- Background jobs: stale-payment expiry, refresh-token purge, maintenance scheduling
- Prisma ORM with PostgreSQL (17 migrations, 30+ indexes)
- Security headers via Helmet (CSP, HSTS) and a strict CORS allowlist

---

## Tech stack

```
Frontend                    Backend                     Infrastructure
─────────────────────────   ─────────────────────────   ──────────────────
Next.js 14 (App Router)     Node.js 20 + Express 5      PostgreSQL 16
TypeScript 5                Prisma ORM 5                Socket.io 4
Tailwind CSS 3              JWT (access + refresh)      Cashfree Payments
Zustand 5 (state)           bcrypt                      Redis (Upstash/ioredis)
TanStack Query v5           Zod 4 (validation)          Sentry (monitoring)
Framer Motion               Socket.io (real-time)       Render (backend)
Recharts (analytics)        Helmet + rate limiting      Vercel (frontend)
dnd-kit (drag & drop)       Winston (logging)           GitHub Actions (CI)
next-auth v5                Haversine (geo-distance)
Vitest (tests)              Vitest + Supertest (tests)
```

---

## Project structure

```
GhostKitchen/
├── ghost-kitchen-frontend/          # Next.js 14 frontend
│   ├── app/
│   │   ├── (customer)/              # Customer portal routes
│   │   │   ├── page.tsx             # Home feed
│   │   │   ├── restaurant/[id]/     # Menu page
│   │   │   ├── cart/                # Cart
│   │   │   ├── checkout/            # Cashfree payment
│   │   │   ├── order/[id]/track/    # Live tracking
│   │   │   ├── orders/              # Order history + reorder
│   │   │   └── profile/             # Profile + saved addresses + favorites
│   │   ├── (shop)/                  # Shopkeeper portal routes
│   │   ├── (delivery)/              # Delivery agent routes
│   │   ├── (admin)/                 # Admin panel routes
│   │   ├── (auth)/                  # Login / register
│   │   └── api/                     # Next.js API proxy routes
│   ├── components/                  # customer / shop / delivery / admin / ui
│   ├── store/                       # Zustand stores
│   ├── lib/                         # API client, socket, utils
│   └── types/                       # Shared TypeScript types
│
└── food-delivery-backend/           # Express 5 backend
    ├── src/
    │   ├── modules/
    │   │   ├── auth/                # Register, login, refresh, logout, me
    │   │   ├── cart/               # Server-side cart
    │   │   ├── orders/             # Order CRUD, status, reorder
    │   │   ├── restaurant/         # Restaurant + menu, analytics, recommendations
    │   │   ├── payment/            # Cashfree orders, webhook, refunds
    │   │   ├── review/             # Reviews & ratings
    │   │   ├── coupon/             # Promo codes
    │   │   ├── delivery/           # Agent status, accept, earnings
    │   │   ├── role/               # Multi-role registration + switching
    │   │   ├── notification/       # In-app notifications
    │   │   ├── user/               # Profile, addresses, favorites
    │   │   └── admin/              # Admin operations
    │   ├── middlewares/            # auth, role, rate limiter, sanitize, tracing, errors
    │   ├── socket/                 # Socket.io server + rooms
    │   ├── jobs/                   # Cron: payment expiry, token purge, maintenance
    │   ├── services/               # Email (Resend) and shared services
    │   ├── config/                 # Prisma, env, redis, sentry, cashfree
    │   └── utils/                  # JWT, password, cache, audit, eta, signature
    └── prisma/
        ├── schema.prisma           # All DB models
        ├── migrations/             # 17 migrations
        └── seed.js                 # Sample restaurants + menus
```

---

## Running locally

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20.19+ | [nodejs.org](https://nodejs.org) |
| npm | 10+ | comes with Node |
| PostgreSQL | 14+ | [postgresql.org](https://postgresql.org), or a free [Neon](https://neon.tech) / [Railway](https://railway.app) instance |
| Git | any | [git-scm.com](https://git-scm.com) |

> **No PostgreSQL locally?** Use a free Neon or Railway PostgreSQL and copy the `DATABASE_URL` they give you. Skip all local Postgres setup.
>
> **Node version note:** Vite 8 / Vitest 4 (used for tests) require Node `^20.19.0 || >=22.12.0`. Anything older will fail to run the test suite.

---

### Step 1 — Clone the repo

```bash
git clone https://github.com/namankhatakdotcpp/GhostKitchen.git
cd GhostKitchen
```

---

### Step 2 — Backend setup

```bash
cd food-delivery-backend
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Open `.env` and fill in your values. **All of these are required** — the server exits on startup if any are missing:

```env
# Database — PostgreSQL connection string
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/ghost_kitchen"

# JWT — both secrets must be at least 32 characters
JWT_SECRET="your-super-secret-access-key-min-32-chars"
JWT_REFRESH_SECRET="a-different-refresh-secret-min-32-chars"

# Cashfree — get from merchant.cashfree.com > Developers > API Keys
CASHFREE_APP_ID="your_app_id"
CASHFREE_SECRET_KEY="your_secret_key"
CASHFREE_ENV="TEST"               # exactly "PRODUCTION" enables live payments; anything else = sandbox

# URLs
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:5000"
ALLOWED_ORIGINS="http://localhost:3000"   # comma-separated CORS allowlist
```

Optional variables (sensible defaults if omitted):

```env
PORT=5000                         # default 5000
NODE_ENV=development              # default development
JWT_EXPIRES_IN=15m                # access token TTL, default 15m
LOG_LEVEL=info                    # default info
CASHFREE_CLIENT_SECRET=           # webhook signature secret (if used)
SENTRY_DSN=                       # enables error monitoring when set
REDIS_URL=                        # ioredis connection string, OR ↓
UPSTASH_REDIS_REST_URL=           # Upstash REST URL  (+ token below)
UPSTASH_REDIS_REST_TOKEN=         # Upstash REST token
ALLOW_SEED=                       # set "true" to allow the /seed endpoint in prod
BOOTSTRAP_SECRET=                 # set to enable POST /bootstrap-admin (see below)
```

> **Generate strong secrets:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

Run database migrations:

```bash
npx prisma migrate dev
npx prisma generate
```

Start the backend:

```bash
npm run dev
```

Backend is now running at `http://localhost:5000`. Test it's alive:

```bash
curl http://localhost:5000/health
# → {"status":"OK","timestamp":"...","environment":"development","redis":{...},"db":{"status":"healthy","latencyMs":3}}
```

---

### Step 3 — Frontend setup

Open a new terminal:

```bash
cd ghost-kitchen-frontend
npm install
```

Create the environment file:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in:

```env
# Backend URLs
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000

# NextAuth — generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL=http://localhost:3000

# Cashfree (public key only — safe to expose)
NEXT_PUBLIC_CASHFREE_ENV=sandbox
```

Start the frontend:

```bash
npm run dev
```

Frontend is now running at `http://localhost:3000`.

---

### Step 4 — Seed the database (optional but recommended)

To see the app with real-looking data immediately:

```bash
cd food-delivery-backend
npm run seed
```

This creates:
- **3 sample restaurants** in Delhi/Mumbai (Pizza, Burger, Curry) with **12 menu items**
- Each restaurant has an owner account with roles `CUSTOMER` + `RESTAURANT`

| Restaurant owner | Email | Password |
|------------------|-------|----------|
| Pizza Master | `pizza@ghostkitchen.dev` | `Seed@1234` |
| Burger King | `burger@ghostkitchen.dev` | `Seed@1234` |
| Curry House | `curry@ghostkitchen.dev` | `Seed@1234` |

> The seed does **not** create customer, delivery, or admin accounts — register those yourself at `/register` and choose the role. Prices in the seed (and everywhere) are stored in **paise** (₹80 = `8000`).

---

### Step 5 — Create an admin (when you need one)

There is no seeded admin. To grant admin rights:

1. Register a normal account at `http://localhost:3000/register`.
2. Set `BOOTSTRAP_SECRET=<some-secret>` in the backend `.env` and restart.
3. Promote your account:
   ```bash
   curl -X POST http://localhost:5000/bootstrap-admin \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","secret":"<some-secret>"}'
   ```
4. **Remove `BOOTSTRAP_SECRET`** afterward — the endpoint is disabled when it is unset.

---

### Verify everything is working

| URL | What you should see |
|-----|---------------------|
| `http://localhost:3000` | Customer home page with restaurant grid |
| `http://localhost:3000/login` | Login page |
| `http://localhost:3000/admin/dashboard` | Admin dashboard (after granting admin) |
| `http://localhost:3000/shop/orders` | Shopkeeper order board |
| `http://localhost:3000/delivery/home` | Delivery agent home |
| `http://localhost:5000/health` | JSON health payload with `"status":"OK"` |

---

## Testing the full order flow

The most important thing to test is the complete order lifecycle, end-to-end with all portals open.

### Setup — open 3 browser windows

```
Window 1 → http://localhost:3000          (Customer)
Window 2 → http://localhost:3000/shop     (Shopkeeper)
Window 3 → http://localhost:3000/delivery (Delivery agent)
```

### Full flow walkthrough

**1. Customer places order**
- Browse restaurants, click one, add items to cart
- Go to `/checkout`, choose or add a delivery address
- Use Cashfree test card: `4111 1111 1111 1111` · Expiry: any future · CVV: `123`
- Complete payment

**2. Shopkeeper receives order (Window 2)**
- Order appears in "New Orders" instantly with a browser notification
- Click **Accept** → set prep time → **Mark Ready**

**3. Delivery agent gets assigned (Window 3)**
- Full-screen assignment modal appears with pickup/dropoff and earnings → **Accept**

**4. Delivery agent navigates**
- "I've reached the restaurant" → "Order picked up" → "Order delivered"

**5. Customer sees live updates (Window 1)**
- Open `/order/{orderId}/track` and watch the timeline animate in real time, with the agent card and call button

### Test Cashfree payments (sandbox)

| Card type | Number | Expiry | CVV |
|-----------|--------|--------|-----|
| Success | `4111 1111 1111 1111` | Any future | Any 3 digits |
| Insufficient funds | `4000 0000 0000 9995` | Any future | Any 3 digits |
| Card declined | `4000 0000 0000 0002` | Any future | Any 3 digits |

For UPI testing use `success@cashfree` (succeeds) or `failure@cashfree` (fails).

---

## 🧪 Testing

Both apps use **Vitest**. The backend also uses **Supertest** for HTTP-level tests.

```bash
# Backend (479 tests across 21 files)
cd food-delivery-backend
npm test                 # run once
npm run test:watch       # watch mode
npm run test:coverage    # with coverage report

# Frontend
cd ghost-kitchen-frontend
npm test
npm run test:coverage
```

Backend coverage thresholds are enforced in `vitest.config.js` and in CI:

| Metric | Threshold | Current |
|--------|-----------|---------|
| Statements | 70% | ~76.6% |
| Branches | 60% | ~66.3% |
| Functions | 70% | ~70.7% |
| Lines | 70% | ~78.6% |

### Continuous integration

GitHub Actions runs on every push and PR (see `.github/workflows/`):

- **Backend CI** (`backend.yml`) — Prisma schema validation, migration-drift check, unit/security tests with coverage, and `npm audit`
- **Frontend CI** (`frontend.yml`) — lint, type-check, build, and tests
- **Deploy Gate** (`deploy-check.yml`) — blocks deploy unless required checks pass

---

## Architecture

### Socket.io room architecture

```
Rooms                    Who joins              Events received
─────────────────────    ─────────────────────  ──────────────────────────────
order-{orderId}          Customer (tracking)    order:status-updated
                                                agent:assigned
                                                agent:location

shop-{restaurantId}      Shopkeeper             order:new
                                                agent:assigned

agent-{agentId}          Delivery agent         order:assigned

admin                    Admin panel            order:new
                                                order:status-updated
                                                agent:location
                                                order:no-agent (alert)
```

### Order status state machine

```
PLACED ──► CONFIRMED ──► PREPARING ──► OUT_FOR_DELIVERY ──► DELIVERED
  │             │
  └─────────────┴──► CANCELLED
```

`OrderStatus` enum: `PLACED`, `PENDING`, `CONFIRMED`, `PREPARING`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`. Who can trigger each transition:

| Transition | Who |
|------------|-----|
| PLACED → CONFIRMED | Restaurant (shopkeeper) |
| CONFIRMED → PREPARING | Restaurant |
| PREPARING → OUT_FOR_DELIVERY | Restaurant or delivery agent |
| OUT_FOR_DELIVERY → DELIVERED | Delivery agent |
| PLACED → CANCELLED | Customer / Admin |

### Delivery assignment algorithm

When an order is confirmed, the server automatically:

1. Queries all users with the `DELIVERY` role who are available with a known location
2. Calculates Haversine distance from each agent to the restaurant
3. Selects the nearest agent and marks them unavailable
4. Emits `order:assigned` to the agent's socket room and sets `agentId` on the order

If no agents are available, it emits `order:no-agent` to the admin room as an alert.

> **Role queries use the array form** — agents are matched with `roles: { has: 'DELIVERY' }`, never `role: 'DELIVERY'`, because accounts carry multiple roles.

### Payment flow

```
Customer clicks "Pay"
        │
        ▼
POST /api/payments/create-order
  → Validate cart server-side
  → Calculate real total (in paise)
  → Create Cashfree order
  → Store pending Payment record
  → Return { paymentSessionId }
        │
        ▼
Cashfree modal opens in browser
        │
  ┌─────┴─────┐
  │           │
Success     Failure
  │           │
  ▼           ▼
POST /api/payments/verify    Return error to user
  → Fetch order from Cashfree API
  → Verify status = PAID
  → Create Order in DB (deduped)
  → Mark Payment as SUCCESS
  → Emit order:new to shop + admin
  → Return { orderId }
        │
        ▼
Redirect to /order/{id}/track
```

Cashfree **webhooks** hit `POST /api/payments/webhook`. The raw body is captured and the `x-webhook-signature` is verified with HMAC-SHA256 (constant-time). Webhook events are deduplicated via a unique `eventId`, so the same event is never processed twice. The handler always returns `200` as Cashfree expects.

### Refunds

Admins initiate refunds (`POST /api/payments/refunds`), which call Cashfree and record a `Refund` row; every refund operation is written to the audit log. Both admins and customers can sync a refund's status from Cashfree. Refunds are idempotent — re-requesting a succeeded refund returns the existing record.

---

## Deployment

The repo deploys as two services: **backend → Render**, **frontend → Vercel**.

### Deploy backend to Render

**1. Push your code to GitHub**, then create a new **Web Service** on [render.com](https://render.com) connected to this repo with **Root Directory** `food-delivery-backend`.

**2. Configure the service**

| Setting | Value |
|---------|-------|
| Environment | `Node` |
| Build Command | `npm install && npx prisma generate` |
| Start Command | `npm start` |
| Instance Type | Free (testing) or Starter ($7/mo, always-on) |

> `npm start` runs `npx prisma migrate deploy && node src/server.js`, so migrations are applied automatically on every deploy.
>
> ⚠️ **Never run `prisma db push` or `migrate reset` against production.** Always use `prisma migrate deploy` — the production migration history is intentionally managed.

**3. Add environment variables on Render** (all required + monitoring):

```
DATABASE_URL          → production PostgreSQL URL (Neon, Render PG, etc.)
JWT_SECRET            → strong 32+ char secret
JWT_REFRESH_SECRET    → different strong 32+ char secret
CASHFREE_APP_ID       → production Cashfree App ID
CASHFREE_SECRET_KEY   → production Cashfree Secret Key
CASHFREE_ENV          → PRODUCTION         # exact string — anything else stays in sandbox
FRONTEND_URL          → https://your-app.vercel.app
BACKEND_URL           → https://your-backend.onrender.com
ALLOWED_ORIGINS       → https://your-app.vercel.app
NODE_ENV              → production
SENTRY_DSN            → (recommended) enables error monitoring
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   → (recommended) or REDIS_URL
```

**4. Enable WebSockets** on the Render service (Settings → enable) so Socket.io works.

**5. Provision PostgreSQL** (Render PG or Neon) and use the pooled/internal connection string as `DATABASE_URL`.

> ⚠️ Render free tier spins down after 15 minutes of inactivity; the first request after idle takes ~30s. Upgrade to Starter for always-on.

### Deploy frontend to Vercel

Create a project on [vercel.com](https://vercel.com), import the repo, set **Root Directory** `ghost-kitchen-frontend`, framework **Next.js**, then add:

```
NEXT_PUBLIC_API_URL         → https://your-backend.onrender.com/api
NEXT_PUBLIC_SOCKET_URL      → https://your-backend.onrender.com
NEXTAUTH_SECRET             → a fresh secret (openssl rand -base64 32)
NEXTAUTH_URL                → https://your-app.vercel.app
NEXT_PUBLIC_CASHFREE_ENV    → production
```

After deploy, set the Cashfree webhook to `https://your-backend.onrender.com/api/payments/webhook`, and make sure Render's `FRONTEND_URL` / `ALLOWED_ORIGINS` match the Vercel URL.

### Deployment checklist

**Backend**
- [ ] All required env vars set (incl. `JWT_REFRESH_SECRET`, `ALLOWED_ORIGINS`)
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are unique 32+ char secrets (not dev defaults)
- [ ] `CASHFREE_ENV` is exactly `PRODUCTION`
- [ ] `NODE_ENV` is `production`
- [ ] `ALLOWED_ORIGINS` restricted to your Vercel domain
- [ ] `SENTRY_DSN` set (so production errors are visible)
- [ ] WebSockets enabled on Render
- [ ] Migrations applied (`migrate deploy` runs via `npm start`)
- [ ] Health check passes: `curl https://your-backend.onrender.com/health`

**Frontend**
- [ ] `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL` point to Render (not localhost)
- [ ] `NEXTAUTH_URL` is the Vercel production URL
- [ ] `NEXTAUTH_SECRET` is a real random secret (not a placeholder)
- [ ] `NEXT_PUBLIC_CASHFREE_ENV` is `production`

**Cashfree**
- [ ] Using production API keys
- [ ] Webhook URL configured and signature verified
- [ ] Payment return URL is your Vercel domain

**Smoke test in production**
- [ ] Register, log in, log out
- [ ] Place a ₹1 test order; it appears in the shopkeeper portal in real time
- [ ] Tracking page updates via Socket.io; delivery agent receives assignment
- [ ] Payment appears in the Cashfree dashboard

---

## Environment variables reference

### Backend (`food-delivery-backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Access-token signing secret (**≥32 chars**) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh-token signing secret (**≥32 chars**, different) |
| `CASHFREE_APP_ID` | ✅ | From Cashfree dashboard |
| `CASHFREE_SECRET_KEY` | ✅ | From Cashfree dashboard |
| `CASHFREE_ENV` | ✅ | `PRODUCTION` for live; any other value = sandbox |
| `FRONTEND_URL` | ✅ | Frontend URL (payment redirects) |
| `BACKEND_URL` | ✅ | Backend URL (payment webhooks) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated CORS allowlist |
| `PORT` | optional | Server port (default `5000`) |
| `NODE_ENV` | optional | `development` / `production` |
| `JWT_EXPIRES_IN` | optional | Access-token TTL (default `15m`) |
| `LOG_LEVEL` | optional | Winston log level (default `info`) |
| `CASHFREE_CLIENT_SECRET` | optional | Webhook signature secret |
| `SENTRY_DSN` | optional | Enables Sentry error monitoring |
| `REDIS_URL` | optional | ioredis connection string |
| `UPSTASH_REDIS_REST_URL` | optional | Upstash REST URL (with token below) |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Upstash REST token |
| `ALLOW_SEED` | optional | `true` to allow `/seed` in production |
| `BOOTSTRAP_SECRET` | optional | Enables `POST /bootstrap-admin` |

### Frontend (`ghost-kitchen-frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API base URL |
| `NEXT_PUBLIC_SOCKET_URL` | ✅ | Backend socket URL |
| `NEXTAUTH_SECRET` | ✅ | Random secret for NextAuth |
| `NEXTAUTH_URL` | ✅ | Frontend URL |
| `NEXT_PUBLIC_CASHFREE_ENV` | ✅ | `sandbox` or `production` |

---

## API reference

Base path: `/api`. Auth is via `Authorization: Bearer <accessToken>`. Roles in the **Auth** column are required in the caller's role array.

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | None | Create account |
| `POST` | `/api/auth/login` | None | Login → access + refresh tokens |
| `POST` | `/api/auth/refresh` | None | Rotate refresh token → new access token |
| `POST` | `/api/auth/logout` | JWT | Revoke current refresh token |
| `POST` | `/api/auth/logout-all` | JWT | Revoke all sessions |
| `GET` | `/api/auth/me` | JWT | Current user |

### Roles (multi-role accounts)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/role/switch` | JWT | Switch active role |
| `POST` | `/api/role/register-restaurant` | JWT | Add RESTAURANT role + create restaurant |
| `POST` | `/api/role/register-rider` | JWT | Add DELIVERY role |
| `GET` | `/api/role/my-restaurants` | RESTAURANT | List owned restaurants |
| `PUT` | `/api/role/my-restaurant` | RESTAURANT | Update owned restaurant |

### Restaurants & menu

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/restaurants` | None | List with filters |
| `GET` | `/api/restaurants/:id` | None | Restaurant detail |
| `GET` | `/api/restaurants/:id/menu` | None | Menu by category |
| `GET` | `/api/restaurants/recommendations` | JWT | Personalized recommendations |
| `GET` | `/api/restaurants/trending` | None | Trending restaurants |
| `POST` | `/api/restaurants` | RESTAURANT | Create restaurant |
| `PUT` | `/api/restaurants/:id` | RESTAURANT (owner) | Update restaurant |
| `PATCH` | `/api/restaurants/:id/status` | RESTAURANT (owner) | Toggle open/closed |
| `GET` | `/api/restaurants/:id/analytics` | RESTAURANT (owner) | Sales analytics |
| `POST` | `/api/restaurants/:id/menu` | RESTAURANT (owner) | Add menu item |
| `PUT` | `/api/restaurants/:id/menu/:itemId` | RESTAURANT (owner) | Update menu item |
| `PATCH` | `/api/restaurants/:id/menu/:itemId/toggle` | RESTAURANT (owner) | Toggle availability |
| `DELETE` | `/api/restaurants/:id/menu/:itemId` | RESTAURANT (owner) | Delete menu item |

### Cart

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/cart` | JWT | Get cart |
| `POST` | `/api/cart/add` | JWT | Add item |
| `PATCH` | `/api/cart/:id` | JWT | Update quantity |
| `DELETE` | `/api/cart/:id` | JWT | Remove item |
| `DELETE` | `/api/cart` | JWT | Clear cart |

### Orders

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/orders` | JWT | My orders (paginated) |
| `GET` | `/api/orders/:id` | JWT | Order detail |
| `POST` | `/api/orders` | JWT | Create order |
| `PATCH` | `/api/orders/:id/status` | JWT | Update status |
| `POST` | `/api/orders/:id/reorder` | JWT | Reorder a past order |

### Payments & refunds

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/payments/create-order` | CUSTOMER | Create Cashfree order |
| `POST` | `/api/payments/verify` | CUSTOMER | Verify payment + create order |
| `GET` | `/api/payments/verify/:orderId` | CUSTOMER | Re-check a payment |
| `POST` | `/api/payments/retry/:orderId` | CUSTOMER | Retry a failed payment |
| `GET` | `/api/payments/history` | JWT | Payment history |
| `POST` | `/api/payments/webhook` | None (Cashfree) | Signed webhook handler |
| `GET` | `/api/payments/my-refunds` | JWT | My refunds |
| `POST` | `/api/payments/my-refunds/:cfRefundId/sync` | JWT | Sync my refund status |
| `GET` | `/api/payments/refunds` | ADMIN | List all refunds |
| `POST` | `/api/payments/refunds` | ADMIN | Initiate refund |
| `POST` | `/api/payments/refunds/:cfRefundId/sync` | ADMIN | Sync refund from Cashfree |

### Reviews

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/reviews/create` | JWT | Create review |
| `GET` | `/api/reviews/can-review/:orderId` | JWT | Eligibility check |
| `GET` | `/api/reviews/restaurant/:restaurantId` | None | Reviews for a restaurant |
| `GET` | `/api/reviews/order/:orderId` | JWT | Review for an order |
| `PUT` | `/api/reviews/order/:orderId` | JWT | Update review |
| `DELETE` | `/api/reviews/order/:orderId` | JWT | Delete review |

### Coupons

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/coupons/validate` | JWT | Validate a code against a cart |
| `GET` | `/api/coupons/active` | None | Active coupons |
| `GET` | `/api/coupons/available` | JWT | Coupons available to the user |
| `GET` | `/api/coupons/:code` | None | Coupon detail |

### User (profile, addresses, favorites)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `PATCH` | `/api/user/profile` | JWT | Update profile |
| `GET` | `/api/user/addresses` | JWT | List saved addresses |
| `POST` | `/api/user/addresses` | JWT | Add address |
| `PATCH` | `/api/user/addresses/:id` | JWT | Update address |
| `DELETE` | `/api/user/addresses/:id` | JWT | Delete address |
| `POST` | `/api/user/addresses/:id/set-default` | JWT | Set default address |
| `GET` | `/api/user/favorites` | JWT | List favorite restaurants |
| `POST` | `/api/user/favorites/:restaurantId` | JWT | Toggle favorite |

### Delivery

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `PATCH` | `/api/delivery/status` | DELIVERY | Set online/offline |
| `POST` | `/api/delivery/accept-order/:orderId` | DELIVERY | Accept assignment |
| `GET` | `/api/delivery/earnings` | DELIVERY | Earnings breakdown |

### Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/notifications` | JWT | List notifications |
| `PATCH` | `/api/notifications/:id/read` | JWT | Mark one read |
| `PATCH` | `/api/notifications/read-all` | JWT | Mark all read |
| `DELETE` | `/api/notifications/:id` | JWT | Delete one |
| `DELETE` | `/api/notifications/all` | JWT | Delete all |

### Admin (selected)

`/api/admin/*` (all `ADMIN`): `stats`, `analytics`, `users`, `restaurants`, `orders`, `payments`, `coupons`, `reviews`, `menu-items`, `delivery-agents`, `audit-log` (+ `/export`), `settings`. Includes role management (`grant-role`, `revoke-role`, `block`, `suspend`), restaurant approval/suspension, and order assignment.

### System

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | None | Liveness — DB + Redis status |
| `GET` | `/health/extended` | ADMIN | Detailed health + metrics |
| `GET` | `/api/config` | None | Public runtime config (maintenance mode, etc.) |
| `POST` | `/bootstrap-admin` | `BOOTSTRAP_SECRET` | One-time admin bootstrap |
| `GET` | `/seed` | `ALLOW_SEED=true` | Run the seed (guarded) |

---

## Common errors and fixes

**`npm ci` fails with "Missing: ... from lock file"**
The lockfile drifted from `package.json`. Regenerate it:
```bash
cd food-delivery-backend && rm -rf node_modules package-lock.json && npm install
```

**`FATAL: Missing environment variables: ...`**
The backend validates required env vars at startup and exits. Add the listed vars (commonly `JWT_REFRESH_SECRET` or `ALLOWED_ORIGINS`) to `.env`.

**`FATAL: JWT_SECRET must be at least 32 characters`**
Both `JWT_SECRET` and `JWT_REFRESH_SECRET` must be ≥32 chars. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

**`Cannot find module '@prisma/client'`**
```bash
cd food-delivery-backend && npx prisma generate
```

**`Environment variable not found: DATABASE_URL` (during `prisma validate`/CI)**
Prisma evaluates `env("DATABASE_URL")` even for validation. Ensure it's set (CI uses a placeholder value).

**`NEXTAUTH_SECRET is not set`**
```bash
openssl rand -base64 32   # paste as NEXTAUTH_SECRET
```

**Socket.io not connecting in production**
On Render, enable **WebSockets** (Dashboard → Settings → WebSockets → Enable).

**Cashfree payment modal not opening**
Confirm `@cashfreepayments/cashfree-js` is installed and check the browser console for script load errors.

**CORS errors in production**
Set `ALLOWED_ORIGINS` (backend) to your exact Vercel URL; it's a comma-separated allowlist enforced in `src/app.js`.

**Payments processed but no real charge**
`CASHFREE_ENV` must be **exactly** `PRODUCTION`. Any other value silently uses sandbox.

---

## Roadmap

- [x] Customer portal (browse, order, track)
- [x] Shopkeeper portal (orders, menu, analytics)
- [x] Delivery portal (assignment, navigation, earnings)
- [x] Admin panel (restaurants, users, refunds, metrics)
- [x] Multi-role accounts with role switching
- [x] Real-time Socket.io layer
- [x] Cashfree payment integration + webhooks + refunds
- [x] Proximity-based delivery assignment
- [x] Coupon / promo code system
- [x] Customer reviews and ratings
- [x] Saved addresses, favorites, reorder
- [x] Redis caching layer
- [x] Email notifications (Resend)
- [x] In-app notifications
- [x] Rate limiting, structured logging, error monitoring (Sentry)
- [x] Audit logging + maintenance mode
- [x] Test suites + GitHub Actions CI
- [ ] Google Maps embed on tracking page
- [ ] Push notifications (PWA + FCM)
- [ ] Persistent (Redis-backed) rate limiting across instances
- [ ] React Native mobile apps
- [ ] Multi-city support
- [ ] ML-based restaurant recommendations

---

## Contributing

GhostKitchen is being built as a real startup foundation. Contributions welcome.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

Please follow the existing code style — TypeScript on the frontend, ES modules on the backend, Zod for all API validation — and keep tests green (`npm test` in both apps).

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

Built with focus, caffeine, and a dream of building something real.

**GhostKitchen** — *From side project to startup*

</div>
