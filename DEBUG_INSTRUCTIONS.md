# 🧪 API DEBUG GUIDE

## Step 1: Check Browser Console
When frontend loads, you should see:
```
🔗 API BASE: https://ghostkitchen.onrender.com/api
📍 Environment: production
```

Every API call logs:
```
📤 API Request: https://ghostkitchen.onrender.com/api/restaurants
```

## Step 2: Test Hardcoded URL
Open browser console and run:
```javascript
import { testRestaurantsHardcoded } from '@/lib/api';
testRestaurantsHardcoded();
```

Expected output:
```
🧪 Testing hardcoded URL: https://ghostkitchen.onrender.com/api/restaurants
✅ Hardcoded URL works! [data...]
```

If this works but `/restaurants` doesn't → Problem is URL building ❌

## Step 3: API Call Verification
✅ All API calls use leading slash:
- `api.get('/restaurants')`  ✅
- `api.get('/orders/${id}')` ✅
- `api.get('/restaurants/${id}/menu')` ✅

❌ NO hardcoded URLs found ✅

## Step 4: Actual Flow
1. Request sent: `api.get('/restaurants', {...})`
2. Axios adds baseURL: `https://ghostkitchen.onrender.com/api + /restaurants`
3. Final URL: `https://ghostkitchen.onrender.com/api/restaurants` ✅

## If Still Failing:
1. Check `.env.local` has: `NEXT_PUBLIC_API_URL=https://ghostkitchen.onrender.com/api`
2. Restart frontend dev server
3. Clear browser cache (Cmd+Shift+Delete)
4. Check backend is actually running on that URL
