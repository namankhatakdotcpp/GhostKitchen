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
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-white?style=flat-square&logo=socketdotio&logoColor=black)](https://socket.io)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Live Demo](#) · [Report Bug](../../issues) · [Request Feature](../../issues) · [Architecture Docs](#-architecture)

</div>

---

## What is GhostKitchen?

GhostKitchen is a **production-grade food delivery web application** with four completely separate portals — each built for a different user. Think Zomato or Swiggy, but open source, self-hostable, and built to be extended into a real startup.

| Portal | Who uses it | What they do |
|--------|-------------|--------------|
| 🛒 **Customer** | End users | Browse restaurants, order food, track delivery live |
| 🍳 **Shopkeeper** | Restaurant owners | Manage menu, accept orders, view analytics |
| 🚴 **Delivery** | Delivery agents | Accept assignments, navigate to customer, track earnings |
| ⚙️ **Admin** | Platform operators | Manage all restaurants, users, agents, disputes |

---

## Feature highlights

**Customer portal**
- Location-aware restaurant feed with infinite scroll
- Sticky category filters (Biryani, Pizza, Burger, etc.)
- Full restaurant menu with veg/non-veg toggle
- Cart with cross-restaurant validation
- Live order tracking with animated status timeline
- Real-time delivery agent location updates via Socket.io
- Cashfree Payments integration (UPI, cards, wallets)

**Shopkeeper portal**
- Real-time incoming order board (Kanban style)
- Browser notifications + sound chime on new orders
- 3-minute auto-reject countdown on unaccepted orders
- Drag-to-reorder menu items with dnd-kit
- Sales analytics with Recharts (revenue, top dishes, peak hours)

**Delivery portal**
- Giant online/offline toggle (one-handed mobile use)
- Full-screen incoming assignment modal with 30s countdown
- Step-by-step delivery flow (Go to restaurant → Pick up → Deliver)
- One-tap call buttons for restaurant and customer
- Earnings dashboard with daily/weekly/monthly breakdown
- Live GPS location emission every 10 seconds

**Admin panel**
- Platform-wide metrics dashboard
- Restaurant approval and suspension
- User management across all roles
- Stuck order alerts (placed > 15 mins unconfirmed)
- Agent online/offline status visibility

**Backend**
- Role-based JWT authentication
- Server-side price validation (client can never send fake totals)
- Proximity-based delivery agent assignment (Haversine distance)
- Socket.io room architecture (order rooms, shop rooms, agent rooms, admin room)
- Zod validation on all API inputs
- Prisma ORM with PostgreSQL

---

## Tech stack

```
Frontend                    Backend                     Infrastructure
─────────────────────────   ─────────────────────────   ──────────────────
Next.js 14 (App Router)     Node.js 20 + Express.js     PostgreSQL 16
TypeScript 5                Prisma ORM 5                Socket.io 4
Tailwind CSS                JWT + bcrypt                Cashfree Payments
Zustand (state)             Zod (validation)            Render (backend)
TanStack Query v5           Socket.io (real-time)       Vercel (frontend)
Framer Motion               Haversine (geo-distance)    
Recharts (analytics)
dnd-kit (drag & drop)
next-auth v5
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
│   │   │   ├── orders/              # Order history
│   │   │   └── profile/             # User profile
│   │   ├── (shop)/                  # Shopkeeper portal routes
│   │   ├── (delivery)/              # Delivery agent routes
│   │   ├── (admin)/                 # Admin panel routes
│   │   ├── (auth)/                  # Login / register
│   │   └── api/                     # Next.js API proxy routes
│   ├── components/
│   │   ├── customer/                # Customer UI components
│   │   ├── shop/                    # Shopkeeper components
│   │   ├── delivery/                # Delivery agent components
│   │   ├── admin/                   # Admin components
│   │   └── ui/                      # Shared base components
│   ├── store/                       # Zustand stores
│   ├── lib/                         # API client, socket, utils
│   └── types/                       # Shared TypeScript types
│
└── food-delivery-backend/           # Express.js backend
    ├── src/
    │   ├── modules/
    │   │   ├── auth/                # Register, login, me
    │   │   ├── orders/              # Order CRUD + status
    │   │   ├── restaurant/          # Restaurant + menu CRUD
    │   │   ├── payment/             # Cashfree integration
    │   │   └── delivery/            # Agent management
    │   ├── middlewares/             # auth, role checking
    │   ├── socket/                  # Socket.io server + rooms
    │   ├── config/                  # Prisma client, env
    │   └── utils/                   # JWT, password helpers
    └── prisma/
        ├── schema.prisma            # All DB models
        └── migrations/              # Migration history
```

---

## Running locally

### Prerequisites

Make sure you have these installed before starting:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| npm | 10+ | comes with Node |
| PostgreSQL | 14+ | [postgresql.org](https://postgresql.org) or use [Railway](https://railway.app) free tier |
| Git | any | [git-scm.com](https://git-scm.com) |

> **No PostgreSQL locally?** Use Railway's free PostgreSQL and just copy the `DATABASE_URL` they give you. Skip all local Postgres setup.

---

### Step 1 — Clone the repo

```bash
git clone https://github.com/yourusername/ghost-kitchen.git
cd ghost-kitchen
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

Open `.env` and fill in your values:

```env
# Database — PostgreSQL connection string
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/ghost_kitchen"

# Server
PORT=5000

# JWT — use a long random string, never share this
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="7d"

# Cashfree — get from merchant.cashfree.com > Developers > API Keys
CASHFREE_APP_ID="your_app_id"
CASHFREE_SECRET_KEY="your_secret_key"
CASHFREE_ENV="TEST"

# URLs (for payment redirects)
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:5000"
```

> **Generate a strong JWT_SECRET:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

Run database migrations:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

Start the backend:

```bash
npm run dev
```

Backend is now running at `http://localhost:5000`

Test it's alive:
```bash
curl http://localhost:5000/health
# → {"status":"OK"}
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

Frontend is now running at `http://localhost:3000`

---

### Step 4 — Seed the database (optional but recommended)

To see the app with real-looking data immediately:

```bash
cd food-delivery-backend
npx prisma db seed
```

This creates:
- 1 admin user (`admin@ghostkitchen.com` / `Admin@123`)
- 3 sample restaurants with full menus
- 2 delivery agents
- 5 sample customers

---

### Verify everything is working

Open your browser and check:

| URL | What you should see |
|-----|---------------------|
| `http://localhost:3000` | Customer home page with restaurant grid |
| `http://localhost:3000/login` | Login page |
| `http://localhost:3000/admin/dashboard` | Admin dashboard (login as admin first) |
| `http://localhost:3000/shop/orders` | Shopkeeper order board |
| `http://localhost:3000/delivery/home` | Delivery agent home |
| `http://localhost:5000/health` | `{"status":"OK"}` |

---

### Test accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@ghostkitchen.com` | `Admin@123` |
| Restaurant owner | `restaurant@ghostkitchen.com` | `Shop@123` |
| Delivery agent | `agent@ghostkitchen.com` | `Agent@123` |
| Customer | `customer@ghostkitchen.com` | `Customer@123` |

---

## Testing the full order flow

The most important thing to test is the complete order lifecycle. Here's how to do it end-to-end with all portals open:

### Setup — open 3 browser windows

```
Window 1 → http://localhost:3000          (Customer — logged in as customer)
Window 2 → http://localhost:3000/shop     (Shopkeeper — logged in as restaurant owner)
Window 3 → http://localhost:3000/delivery (Delivery — logged in as agent)
```

### Full flow walkthrough

**1. Customer places order**
- Browse restaurants on the home page
- Click a restaurant, add items to cart
- Go to `/checkout`
- Enter a delivery address
- Use Cashfree test card: `4111 1111 1111 1111` · Expiry: `12/26` · CVV: `123`
- Complete payment

**2. Shopkeeper receives order (Window 2)**
- Order should appear in "New Orders" column instantly
- A browser notification pops up
- Click **Accept** — order moves to "Preparing"
- Set prep time (e.g. 15 minutes)
- When food is ready, click **Mark Ready**

**3. Delivery agent gets assigned (Window 3)**
- Full-screen assignment modal appears after shopkeeper confirms
- Shows pickup address, dropoff address, estimated earnings
- Click **Accept**

**4. Delivery agent navigates**
- Step 1: "Go to restaurant" → Click **"I've reached the restaurant"**
- Step 2: "Pick up order" → Click **"Order picked up"**
- Step 3: Navigate to customer → Click **"Order delivered"**

**5. Customer sees live updates (Window 1)**
- Go to `/order/{orderId}/track`
- Watch the timeline animate through each status in real time
- See delivery agent card appear with name and call button

### Test Cashfree payments (sandbox)

| Card type | Number | Expiry | CVV |
|-----------|--------|--------|-----|
| Success | `4111 1111 1111 1111` | Any future | Any 3 digits |
| Insufficient funds | `4000 0000 0000 9995` | Any future | Any 3 digits |
| Card declined | `4000 0000 0000 0002` | Any future | Any 3 digits |

For UPI testing use: `success@cashfree` (succeeds) or `failure@cashfree` (fails)

### Testing Socket.io events manually

Open browser console and paste this to simulate a status update:

```javascript
// In browser console on the order tracking page
const socket = window.__socket  // if exposed, or import from lib
socket.emit('order:status', { orderId: 'YOUR_ORDER_ID', status: 'OUT_FOR_DELIVERY' })
```

Or use Postman with Socket.io mode — connect to `http://localhost:5000` and emit events manually.

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

Who can trigger each transition:

| Transition | Who |
|------------|-----|
| PLACED → CONFIRMED | Restaurant (shopkeeper) |
| CONFIRMED → PREPARING | Restaurant |
| PREPARING → OUT_FOR_DELIVERY | Restaurant or delivery agent |
| OUT_FOR_DELIVERY → DELIVERED | Delivery agent |
| PLACED → CANCELLED | Customer |

### Delivery assignment algorithm

When an order reaches `CONFIRMED` status, the server automatically:

1. Queries all `DELIVERY` role users where `isAvailable = true` and location is set
2. Calculates Haversine distance from each agent to the restaurant
3. Selects the nearest agent
4. Marks agent `isAvailable = false`
5. Emits `order:assigned` to the agent's socket room
6. Updates the order with `agentId`

If no agents are available, emits `order:no-agent` to the admin room as an alert.

### Payment flow

```
Customer clicks "Pay"
        │
        ▼
POST /api/payments/create-order
  → Validate cart server-side
  → Calculate real total
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
  → Create Order in DB
  → Mark Payment as SUCCESS
  → Emit order:new to shop + admin
  → Return { orderId }
        │
        ▼
Redirect to /order/{id}/track
```

---

## Deployment

### Deploy backend to Render

**1. Push your code to GitHub**

```bash
git add .
git commit -m "ready for deployment"
git push origin main
```

**2. Create a new Web Service on Render**

- Go to [render.com](https://render.com) → New → Web Service
- Connect your GitHub repo
- Select the `food-delivery-backend` folder as root directory

**3. Configure the service**

| Setting | Value |
|---------|-------|
| Name | `ghost-kitchen-backend` |
| Environment | `Node` |
| Build Command | `npm install && npx prisma generate` |
| Start Command | `node src/server.js` |
| Instance Type | Free (for testing) or Starter ($7/mo) |

**4. Add environment variables on Render**

In your service → Environment → Add the following:

```
DATABASE_URL          → your production PostgreSQL URL (see step 5)
JWT_SECRET            → same strong secret as local
JWT_EXPIRES_IN        → 7d
CASHFREE_APP_ID       → your production Cashfree App ID
CASHFREE_SECRET_KEY   → your production Cashfree Secret Key
CASHFREE_ENV          → PRODUCTION
FRONTEND_URL          → https://ghost-kitchen.vercel.app (your Vercel URL)
BACKEND_URL           → https://ghost-kitchen-backend.onrender.com
NODE_ENV              → production
```

**5. Set up production PostgreSQL on Render**

- Render Dashboard → New → PostgreSQL
- Name it `ghost-kitchen-db`
- Copy the **Internal Database URL** (faster, free within Render)
- Paste it as `DATABASE_URL` in your web service env vars

**6. Run migrations on deploy**

Change your Build Command to:

```
npm install && npx prisma generate && npx prisma migrate deploy
```

**7. Deploy**

Click **Deploy**. First deploy takes ~3 minutes. Your backend URL will be:
`https://ghost-kitchen-backend.onrender.com`

> ⚠️ **Render free tier spins down after 15 minutes of inactivity.** First request after idle takes ~30 seconds. Upgrade to Starter ($7/mo) for always-on.

---

### Deploy frontend to Vercel

**1. Go to [vercel.com](https://vercel.com) → New Project**

Import your GitHub repo

**2. Configure the project**

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Root Directory | `ghost-kitchen-frontend` |
| Build Command | `npm run build` |
| Output Directory | `.next` |

**3. Add environment variables on Vercel**

```
NEXT_PUBLIC_API_URL         → https://ghost-kitchen-backend.onrender.com/api
NEXT_PUBLIC_SOCKET_URL      → https://ghost-kitchen-backend.onrender.com
NEXTAUTH_SECRET             → same secret as local (generate a new one for prod)
NEXTAUTH_URL                → https://ghost-kitchen.vercel.app
NEXT_PUBLIC_CASHFREE_ENV    → production
```

**4. Deploy**

Click **Deploy**. Vercel builds and deploys in ~2 minutes. Your app is live at:
`https://ghost-kitchen.vercel.app`

**5. Update Cashfree webhook URL**

In Cashfree merchant dashboard → Developers → Webhooks:

Add: `https://ghost-kitchen-backend.onrender.com/api/payments/webhook`

**6. Update Render FRONTEND_URL**

Go back to Render → your backend service → Environment:

```
FRONTEND_URL → https://ghost-kitchen.vercel.app
```

Trigger a redeploy on Render after this change.

---

### Deployment checklist

Run through this before going live:

**Backend**
- [ ] `DATABASE_URL` points to production database
- [ ] `JWT_SECRET` is a strong unique string (not the dev default)
- [ ] `CASHFREE_ENV` is set to `PRODUCTION`
- [ ] `NODE_ENV` is `production`
- [ ] CORS is restricted to your Vercel domain
- [ ] Prisma migrations ran successfully (`migrate deploy` in build command)
- [ ] Health check passes: `curl https://your-backend.onrender.com/health`

**Frontend**
- [ ] `NEXT_PUBLIC_API_URL` points to Render backend (not localhost)
- [ ] `NEXT_PUBLIC_SOCKET_URL` points to Render backend (not localhost)
- [ ] `NEXTAUTH_URL` is your Vercel production URL
- [ ] `NEXTAUTH_SECRET` is set
- [ ] `NEXT_PUBLIC_CASHFREE_ENV` is `production`

**Cashfree**
- [ ] Using production API keys (not test keys)
- [ ] Webhook URL configured and tested
- [ ] Payment return URL is your Vercel domain

**Test in production**
- [ ] Can register a new account
- [ ] Can log in and log out
- [ ] Can place a test order (₹1 test payment)
- [ ] Order appears in shopkeeper portal in real time
- [ ] Order tracking page updates via Socket.io
- [ ] Delivery agent receives assignment
- [ ] Payment appears in Cashfree merchant dashboard

---

## Environment variables reference

### Backend (`food-delivery-backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `PORT` | ✅ | Server port (default: 5000) |
| `JWT_SECRET` | ✅ | Secret key for signing JWT tokens |
| `JWT_EXPIRES_IN` | ✅ | Token expiry (e.g. `7d`, `24h`) |
| `CASHFREE_APP_ID` | ✅ | From Cashfree dashboard |
| `CASHFREE_SECRET_KEY` | ✅ | From Cashfree dashboard |
| `CASHFREE_ENV` | ✅ | `TEST` or `PRODUCTION` |
| `FRONTEND_URL` | ✅ | Your frontend URL (for payment redirects) |
| `BACKEND_URL` | ✅ | Your backend URL (for payment webhooks) |
| `NODE_ENV` | optional | `development` or `production` |

### Frontend (`ghost-kitchen-frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API base URL |
| `NEXT_PUBLIC_SOCKET_URL` | ✅ | Backend socket URL |
| `NEXTAUTH_SECRET` | ✅ | Random secret for NextAuth |
| `NEXTAUTH_URL` | ✅ | Your frontend URL |
| `NEXT_PUBLIC_CASHFREE_ENV` | ✅ | `sandbox` or `production` |

---

## API reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | None | Create new account |
| `POST` | `/api/auth/login` | None | Login, returns JWT |
| `GET` | `/api/auth/me` | JWT | Get current user |

### Restaurants

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/restaurants` | None | List with filters |
| `GET` | `/api/restaurants/:id` | None | Restaurant detail |
| `GET` | `/api/restaurants/:id/menu` | None | Menu by category |
| `POST` | `/api/restaurants` | RESTAURANT | Create restaurant |
| `PUT` | `/api/restaurants/:id` | RESTAURANT (owner) | Update restaurant |
| `PATCH` | `/api/restaurants/:id/status` | RESTAURANT (owner) | Toggle open/closed |
| `POST` | `/api/restaurants/:id/menu` | RESTAURANT (owner) | Add menu item |
| `PUT` | `/api/restaurants/:id/menu/:itemId` | RESTAURANT (owner) | Update menu item |
| `PATCH` | `/api/restaurants/:id/menu/:itemId/toggle` | RESTAURANT (owner) | Toggle availability |
| `DELETE` | `/api/restaurants/:id/menu/:itemId` | RESTAURANT (owner) | Delete menu item |

### Orders

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/orders` | JWT | My orders (paginated) |
| `GET` | `/api/orders/:id` | JWT | Single order detail |
| `PATCH` | `/api/orders/:id/status` | JWT | Update order status |

### Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/payments/create-order` | CUSTOMER | Create Cashfree order |
| `POST` | `/api/payments/verify` | CUSTOMER | Verify payment + create order |
| `POST` | `/api/payments/webhook` | None (Cashfree) | Cashfree webhook handler |

---

## Common errors and fixes

**`Cannot find module '@prisma/client'`**
```bash
cd food-delivery-backend && npx prisma generate
```

**`Error: no connection string provided`**
Make sure `DATABASE_URL` is set in `food-delivery-backend/.env`

**`NEXTAUTH_SECRET is not set`**
```bash
openssl rand -base64 32  # paste this as NEXTAUTH_SECRET
```

**Socket.io not connecting in production**
On Render, enable **WebSockets** in your service settings (Dashboard → Settings → WebSockets → Enable)

**Cashfree payment modal not opening**
Check browser console for script load errors. Make sure `@cashfreepayments/cashfree-js` is installed:
```bash
cd ghost-kitchen-frontend && npm install @cashfreepayments/cashfree-js
```

**`prisma migrate deploy` fails on Render**
Your `DATABASE_URL` might be using the external URL instead of internal. Use the **Internal Connection String** from Render's PostgreSQL dashboard for backend-to-database communication.

**CORS errors in production**
Update CORS config in `food-delivery-backend/src/app.js`:
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}))
```

---

## Roadmap

- [x] Customer portal (browse, order, track)
- [x] Shopkeeper portal (orders, menu, analytics)
- [x] Delivery portal (assignment, navigation, earnings)
- [x] Admin panel (restaurants, users, metrics)
- [x] Real-time Socket.io layer
- [x] Cashfree payment integration
- [x] Proximity-based delivery assignment
- [ ] Google Maps embed on tracking page
- [ ] Push notifications (PWA + FCM)
- [ ] Coupon/promo code system
- [ ] Customer reviews and ratings
- [ ] Email notifications (order updates)
- [ ] React Native mobile apps
- [ ] Redis caching layer
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

Please follow the existing code style — TypeScript on frontend, ES modules on backend, Zod for all API validation.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

Built with focus, caffeine, and a dream of building something real.

**GhostKitchen** — *From side project to startup*

</div>
