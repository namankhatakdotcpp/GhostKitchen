# Production Deployment Test Checklist

**Date:** _______________  
**Tester:** _______________  
**Environment:** [ ] Dev [ ] Staging [ ] Production  

---

## 📋 Pre-Deployment Setup

- [ ] **Environment Variables Configured**
  - [ ] `NODE_ENV=production` (backend)
  - [ ] `NEXT_PUBLIC_CASHFREE_ENV=production` or `sandbox` (frontend)
  - [ ] `CASHFREE_APP_ID` set (real credentials)
  - [ ] `CASHFREE_SECRET_KEY` set (real credentials)
  - [ ] `DATABASE_URL` pointing to correct PostgreSQL
  - [ ] `FRONTEND_URL` set correctly
  - [ ] `BACKEND_URL` set correctly
  - [ ] `JWT_SECRET` is randomized (NOT default)

- [ ] **Dependencies Installed**
  - [ ] Backend: `npm install` in `food-delivery-backend/`
  - [ ] Frontend: `npm install` in `ghost-kitchen-frontend/`
  - [ ] No conflicting versions: `npm ls` shows no errors

- [ ] **Database Ready**
  - [ ] PostgreSQL running
  - [ ] Migrations applied: `npx prisma migrate deploy`
  - [ ] Database accessible from backend

- [ ] **Servers Started**
  - [ ] Backend running: `npm start` on port 5000
  - [ ] Frontend running: `npm run dev` on port 3000
  - [ ] Both log successful startup messages
  - [ ] No critical errors in logs

---

## 🔐 Authentication Flow

### User Registration

- [ ] **Frontend Registration Page**
  - [ ] Navigate to `/register`
  - [ ] Page loads without errors
  - [ ] Form fields visible: Name, Email, Phone, Password, Role, Address
  - [ ] Role selector works (Customer/Restaurant Owner/Delivery Agent)

- [ ] **Valid Registration**
  - [ ] Fill all fields with valid data
  - [ ] Select role: "Customer"
  - [ ] Submit form
  - [ ] No errors in console
  - [ ] Redirects to login page (or auto-login)

- [ ] **Validation Works**
  - [ ] Try submit with empty fields → error message appears
  - [ ] Try invalid email → validation error
  - [ ] Try weak password → validation error
  - [ ] Try duplicate email → backend error caught

- [ ] **Backend Logs**
  - [ ] No errors in backend console
  - [ ] Successful registration logged

### User Login

- [ ] **Frontend Login Page**
  - [ ] Navigate to `/login`
  - [ ] Form loads: Email, Password, Login button
  - [ ] No console errors

- [ ] **Valid Login**
  - [ ] Enter registered email & password
  - [ ] Click Login
  - [ ] JWT token received
  - [ ] Redirects to customer home page
  - [ ] User logged in (can see username/avatar)

- [ ] **Invalid Credentials**
  - [ ] Try wrong password → "Invalid credentials" error
  - [ ] Try non-existent email → "User not found" error
  - [ ] Errors displayed to user, not crashed

- [ ] **Session Persistence**
  - [ ] Reload page → still logged in
  - [ ] Navigate to different pages → session maintained
  - [ ] Token stored in localStorage/cookie

---

## 🍽️ Customer Flow: Browse & Order

### Homepage

- [ ] **Page Loads**
  - [ ] Navigate to `/` (customer home)
  - [ ] Page loads in <3 seconds
  - [ ] No console errors

- [ ] **Restaurant List**
  - [ ] Restaurants displayed in grid/list
  - [ ] Each restaurant shows: name, image, rating, delivery fee
  - [ ] Click restaurant → navigates to menu page
  - [ ] Restaurant page doesn't throw "not found" error

### Restaurant Menu Page

- [ ] **Page Loads with Menu**
  - [ ] Navigate to `/restaurant/[id]`
  - [ ] Page loads with restaurant details
  - [ ] Menu items displayed (name, price, image)
  - [ ] "Add to Cart" button visible for each item

- [ ] **Add to Cart**
  - [ ] Click "Add to Cart" on item
  - [ ] Quantity selector appears (or shows default)
  - [ ] Select quantity > 1
  - [ ] Click confirm
  - [ ] Item added to cart
  - [ ] Cart count increases in header/navbar
  - [ ] Success toast/notification appears

- [ ] **Multiple Items**
  - [ ] Add 2-3 different items to cart
  - [ ] Each item appears in cart
  - [ ] Quantities correct
  - [ ] Cart subtotal calculated correctly

### Cart Page

- [ ] **Cart Display**
  - [ ] Navigate to `/cart`
  - [ ] All items from cart displayed
  - [ ] Item prices, quantities correct
  - [ ] Subtotal = sum of all items ✓

- [ ] **Modify Cart**
  - [ ] Increase quantity of item → subtotal updates
  - [ ] Decrease quantity → subtotal updates
  - [ ] Remove item → removed from cart, subtotal updates
  - [ ] Clear all → cart shows empty state

### Checkout Page

- [ ] **Page Loads**
  - [ ] Navigate to `/checkout`
  - [ ] Cart summary displayed
  - [ ] Delivery fee shown (₹50)
  - [ ] Subtotal correct
  - [ ] **CRITICAL: Total = Subtotal + Delivery Fee** ✓

- [ ] **Delivery Address Entry**
  - [ ] Address text field visible
  - [ ] Enter address: "123 Main St, Apt 4, Delhi"
  - [ ] City field (pre-filled as Delhi)

- [ ] **Optional Coupon**
  - [ ] Coupon code field visible (optional)
  - [ ] Enter valid coupon (if available): "SAVE20"
  - [ ] Discount calculated and shown
  - [ ] Total updated with discount deducted
  - [ ] Enter invalid coupon → error shown

- [ ] **Payment Button**
  - [ ] Button shows: "Pay ₹{total}"
  - [ ] Total amount matches sum of items + delivery
  - [ ] Amount NOT showing delivery fee mismatch ✓

---

## 💳 Payment Flow (Cashfree)

### Payment Initiation

- [ ] **Click Pay Button**
  - [ ] Address filled in (required)
  - [ ] Click "Pay ₹290"
  - [ ] Request sent to backend (`POST /api/payments/create-order`)
  - [ ] Cashfree modal opens
  - [ ] Loading state shows while payment initializes

- [ ] **Backend Creates Session**
  - [ ] Check backend logs: "✓ Cashfree order created"
  - [ ] Order ID format: "GK-XXXXXXXX"
  - [ ] Amount logged correctly: ₹290
  - [ ] No errors in backend console

- [ ] **Cashfree Modal**
  - [ ] Modal displays payment options
  - [ ] Amount shown: ₹290
  - [ ] Customer name, email shown correctly
  - [ ] Payment gateway initializes without error

### Payment Completion (Test Mode)

- [ ] **Successful Payment**
  - [ ] Select payment method (Card/UPI/Wallet - use test credentials)
  - [ ] Complete payment
  - [ ] Payment marked as PAID in Cashfree
  - [ ] Modal closes

- [ ] **Payment Verification**
  - [ ] Frontend calls `/api/payments/verify`
  - [ ] Backend logs: "✓ Cashfree verify success"
  - [ ] Order created in database
  - [ ] Order status = "PLACED"

- [ ] **Redirect to Order Tracking**
  - [ ] After payment, redirected to `/order/{orderId}/track`
  - [ ] Order tracking page loads
  - [ ] Order details displayed:
    - [ ] Items ordered
    - [ ] Total charged: ₹290 (MUST MATCH) ✓
    - [ ] Status: PLACED
    - [ ] Estimated delivery time

- [ ] **Cart Cleared**
  - [ ] Cart icon shows 0 items
  - [ ] Navigating back to `/cart` shows empty state

### Payment Failure Handling

- [ ] **Failed Payment**
  - [ ] Go back to checkout, attempt payment
  - [ ] Simulate payment failure in Cashfree (test mode)
  - [ ] Error message displayed: "Payment failed"
  - [ ] Checkout page remains, user can retry
  - [ ] No duplicate order created

- [ ] **Cashfree Timeout**
  - [ ] Simulate network delay (dev tools throttle)
  - [ ] Modal times out
  - [ ] Error handled gracefully
  - [ ] User can retry or abandon

---

## 📱 Real-Time Updates (Socket.IO)

### Restaurant Owner Notifications

- [ ] **Log in as Restaurant Owner**
  - [ ] Register as role: "Restaurant Owner"
  - [ ] Navigate to shop orders page: `/shop/orders`
  - [ ] Page loads

- [ ] **New Order Notification**
  - [ ] As Customer: complete a checkout/payment
  - [ ] As Restaurant Owner: new order appears in real-time
  - [ ] Order details shown:
    - [ ] Items ordered
    - [ ] Customer name/address
    - [ ] Order total
  - [ ] No page refresh needed (Socket.IO working) ✓

- [ ] **Order Status Updates**
  - [ ] Restaurant owner marked order as "Preparing"
  - [ ] Order status updates in real-time
  - [ ] Customer sees status change without refresh ✓

### Admin Notifications

- [ ] **Log in with Admin Role** (if applicable)
  - [ ] Admin dashboard loads
  - [ ] New orders appear in admin feed in real-time
  - [ ] Real-time updates working ✓

---

## 🚚 Delivery Agent Flow

- [ ] **Log in as Delivery Agent**
  - [ ] Register as role: "Delivery Agent"
  - [ ] Navigate to `/delivery/home`

- [ ] **Active Orders**
  - [ ] See available orders to accept
  - [ ] Click "Accept Order"
  - [ ] Order assigned, status updates
  - [ ] Real-time update to shop owner ✓

- [ ] **Navigate to Pickup**
  - [ ] Order details show restaurant location
  - [ ] Pickup address displayed

- [ ] **Process Delivery**
  - [ ] Mark as "Picked Up"
  - [ ] Customer sees update
  - [ ] Navigate to delivery address
  - [ ] Mark as "Delivered"
  - [ ] Order complete, earn ₹50 delivery fee

---

## 🔍 Data Validation & Security

### Price Manipulation Prevention

- [ ] **Cannot Override Prices**
  - [ ] Open DevTools → Network tab
  - [ ] Go to checkout
  - [ ] Inspect POST to `/api/payments/create-order`
  - [ ] Try to manually send: `{ subtotal: 1, total: 1 }`
  - [ ] Backend rejects with 400 error ✓
  - [ ] No order created at ₹1

- [ ] **Server-Side Calculation**
  - [ ] Backend recalculates all prices from menu items
  - [ ] Database prices are source of truth
  - [ ] Frontend prices are display only

### Coupon Limits

- [ ] **Coupon Usage Enforced**
  - [ ] Create test coupon: max 1 use
  - [ ] Customer 1: uses coupon → discount applied ✓
  - [ ] Customer 2: tries same coupon → "Coupon exhausted" ✓
  - [ ] Coupon limit respected

- [ ] **Concurrent Orders**
  - [ ] Two customers simultaneously use same coupon
  - [ ] Only one order accepts coupon
  - [ ] Second gets error (race condition prevented) ✓

### Payment Record Accuracy

- [ ] **Audit Trail**
  - [ ] Check database `Payment` table
  - [ ] For last order:
    - [ ] `cfOrderId` populated (e.g., "GK-ABC12DE")
    - [ ] `cfPaymentId` populated (NOT null) ✓
    - [ ] `amount` = 29000 (paise, integer) ✓
    - [ ] `status` = "SUCCESS"
    - [ ] `customerId` correct
    - [ ] `restaurantId` correct

- [ ] **Order Record Accuracy**
  - [ ] Check database `Order` table
  - [ ] `cfOrderId` linked to payment ✓
  - [ ] `total` = 29000 paise = ₹290 ✓
  - [ ] `subtotal` = 24000 (items correctly priced)
  - [ ] `deliveryFee` = 5000 (₹50)
  - [ ] `items` JSON matches what customer ordered
  - [ ] `discount` = 0 (if no coupon) or correct amount

---

## 🐛 Error Handling & Edge Cases

### Network Errors

- [ ] **Backend Temporarily Down**
  - [ ] Stop backend server
  - [ ] Try to add item to cart
  - [ ] Error message: "Cannot connect to server"
  - [ ] No crash, graceful error ✓

- [ ] **Database Connection Lost**
  - [ ] Stop PostgreSQL
  - [ ] Try to fetch restaurants
  - [ ] Error handled: "Server error"
  - [ ] Backend logs connection error ✓

- [ ] **Cashfree API Timeout**
  - [ ] Simulate slow network (DevTools throttle to 2G)
  - [ ] Click Pay button
  - [ ] If takes >30s: timeout error shown
  - [ ] User can retry ✓

### Invalid Data

- [ ] **Empty Cart Checkout**
  - [ ] Try to go to `/checkout` with empty cart
  - [ ] Error: "Your cart is empty"
  - [ ] Redirected to home or cart page ✓

- [ ] **Missing Address**
  - [ ] Clear address field
  - [ ] Click Pay
  - [ ] Error: "Address required"
  - [ ] Form not submitted ✓

- [ ] **Invalid Menu Item**
  - [ ] Attempt to add non-existent item ID via DevTools
  - [ ] Backend rejects: "Invalid item" ✓
  - [ ] No order created

### Duplicate Submission

- [ ] **Double-Click Checkout**
  - [ ] Fill checkout form
  - [ ] Rapidly double-click "Pay" button
  - [ ] Only ONE payment session created ✓
  - [ ] Second click disabled/prevented
  - [ ] Only one order in database ✓

---

## 🚨 Critical Path Verification

### Full End-to-End Flow

**Test the ENTIRE happy path:**

1. [ ] **Start**: Fresh browser, logged out
2. [ ] **Register**: New customer account (unused email)
3. [ ] **Login**: With new account
4. [ ] **Browse**: Go to restaurant menu
5. [ ] **Cart**: Add 2 items (₹150 + ₹90)
6. [ ] **Checkout**: 
   - Subtotal: ₹240 ✓
   - Delivery: ₹50 ✓
   - Total: ₹290 ✓
7. [ ] **Address**: Enter delivery address
8. [ ] **Payment**: Complete payment (test amount ₹290)
9. [ ] **Verification**: 
   - Order created ✓
   - Redirected to tracking ✓
   - Order shows ₹290 total ✓
10. [ ] **Real-Time**: 
    - Restaurant owner sees order ✓
    - Admin sees order ✓
    - Shop notified via Socket.IO ✓
11. [ ] **Database**: 
    - Order record: ₹290 total ✓
    - Payment record: ₹290 amount, cfPaymentId set ✓
    - No data inconsistencies ✓

---

## 📊 Performance Checks

- [ ] **Page Load Times** (should be <3 seconds)
  - [ ] Home page: _____ ms
  - [ ] Restaurant menu: _____ ms
  - [ ] Checkout: _____ ms
  - [ ] Order tracking: _____ ms

- [ ] **API Response Times** (should be <500ms)
  - [ ] GET /api/restaurants: _____ ms
  - [ ] GET /api/restaurants/[id]/menu: _____ ms
  - [ ] POST /api/payments/create-order: _____ ms ⚠️ Cashfree may add time
  - [ ] POST /api/payments/verify: _____ ms

- [ ] **No Memory Leaks**
  - [ ] Open DevTools → Memory
  - [ ] Take heap snapshot
  - [ ] Load checkout 5 times
  - [ ] Take another heap snapshot
  - [ ] Memory increased by <20MB

---

## 🔐 Security Checks

- [ ] **HTTPS in Production**
  - [ ] All URLs start with `https://`
  - [ ] No warnings about insecure content
  - [ ] Certificate valid

- [ ] **JWT Token Security**
  - [ ] Token stored securely (httpOnly cookie or localStorage)
  - [ ] Token not exposed in URL
  - [ ] Token expires after configured time

- [ ] **CORS Configured**
  - [ ] Frontend can communicate with backend
  - [ ] No CORS errors in console
  - [ ] Only allow trusted origins

- [ ] **No Sensitive Data in Logs**
  - [ ] Backend logs don't show passwords
  - [ ] Logs don't show full credit card numbers
  - [ ] Logs don't show JWT tokens in plain text

---

## 📋 Configuration Verification

- [ ] **Environment Variables**
  ```bash
  # Backend
  NODE_ENV=production
  DATABASE_URL=postgres://...
  JWT_SECRET=(randomized, not default)
  CASHFREE_APP_ID=(set)
  CASHFREE_SECRET_KEY=(set)
  CASHFREE_ENV=production (or sandbox for testing)
  
  # Frontend
  NEXT_PUBLIC_CASHFREE_ENV=production
  NEXT_PUBLIC_API_URL=https://backend.example.com
  ```

- [ ] **Database**
  - [ ] All tables created ✓
  - [ ] Indexes present ✓
  - [ ] Foreign keys configured ✓

- [ ] **Socket.IO**
  - [ ] Connected without errors
  - [ ] Events broadcasting correctly
  - [ ] No console errors

---

## 📱 Browser Compatibility

- [ ] **Chrome** (latest)
  - [ ] All features work
  - [ ] No console errors
  - [ ] Layout looks good

- [ ] **Firefox** (latest)
  - [ ] All features work
  - [ ] No console errors
  - [ ] Layout looks good

- [ ] **Safari** (latest)
  - [ ] All features work
  - [ ] No console errors
  - [ ] Layout looks good

- [ ] **Mobile (iOS/Android)**
  - [ ] Responsive layout
  - [ ] Touch interactions work
  - [ ] Payment modal works on mobile

---

## ✅ Final Deployment Readiness

- [ ] All critical tests passed ✓
- [ ] No console errors (major) ✓
- [ ] No database errors ✓
- [ ] All price calculations correct ✓
- [ ] Payment flow fully working ✓
- [ ] Real-time updates working ✓
- [ ] Error handling in place ✓
- [ ] Security checks passed ✓
- [ ] Performance acceptable ✓

---

## 📝 Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Tester | _____________ | _____________ | _____________ |
| Backend Lead | _____________ | _____________ | _____________ |
| Frontend Lead | _____________ | _____________ | _____________ |
| DevOps/Deployment | _____________ | _____________ | _____________ |

---

## 🚀 Deployment Notes

**Issues Found:**
```
1. _________________________________________________________________
2. _________________________________________________________________
3. _________________________________________________________________
```

**Resolution:**
```
_____________________________________________________________________
_____________________________________________________________________
```

**Ready for Production:** [ ] YES [ ] NO (if NO, list blockers above)

**Approved By:** _________________ **Date:** _________

---

**Deployment Environment:** _______________  
**Deployment Time:** _______________  
**Rollback Plan:** Emergency rollback to previous commit available in git  
