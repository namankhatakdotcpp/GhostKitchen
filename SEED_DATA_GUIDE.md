# 🌱 Database Seeding Guide

## 📋 What's Included

### ✅ Restaurants (3 total)
1. **Pizzeria Delight** 🍕
   - Cuisines: Italian, Pizza
   - Rating: 4.5/5
   - Image: Authentic pizza from Unsplash
   - Location: Delhi

2. **Burger Barn** 🍔
   - Cuisines: American, Fast Food
   - Rating: 4.2/5
   - Image: Juicy burger from Unsplash
   - Location: Delhi

3. **Curry House** 🍛
   - Cuisines: Indian, North Indian, South Indian
   - Rating: 4.7/5
   - Image: Indian curry from Unsplash
   - Location: Delhi

### ✅ Menu Items
**Pizzeria Delight** (4 items):
- Margherita Pizza (₹250) - Bestseller
- Pepperoni Pizza (₹300) - Bestseller
- Garlic Bread (₹80)
- Coke (₹40)

**Burger Barn** (4 items):
- Classic Burger (₹200) - Bestseller
- Veggie Burger (₹150)
- Fries (₹80)
- Shake (₹120)

**Curry House** (4 items):
- Butter Chicken (₹350) - Bestseller
- Paneer Tikka Masala (₹300) - Bestseller
- Garlic Naan (₹60)
- Lassi (₹80)

---

## 🚀 How to Use

### Step 1: Install Dependencies
```bash
cd food-delivery-backend
npm install
```

### Step 2: Configure Database
Ensure `DATABASE_URL` is set in `.env`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/ghostkitchen"
```

### Step 3: Run Migrations
```bash
npm run db:reset
# or
npx prisma migrate reset
```

### Step 4: Seed Database
```bash
npm run seed
# or
npx prisma db seed
```

**Expected Output:**
```
🌱 Starting database seeding...
✅ Database seeding completed!
🍕 Created 3 restaurants with menu items
📊 All images are from Unsplash (high quality)
```

---

## 🖼️ Image Sources

All restaurant and menu images are from **Unsplash** (free, high quality):

### Pizzeria Delight 🍕
- Restaurant: `https://images.unsplash.com/photo-1565299624946-b28f40a0ae38`
- Pepperoni Pizza: `https://images.unsplash.com/photo-1600891964599-f61ba0e24092`

### Burger Barn 🍔
- Restaurant: `https://images.unsplash.com/photo-1550547660-d9450f859349`

### Curry House 🍛
- Restaurant: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c`

**Additional Menu Images:**
- Garlic Bread: Unsplash
- Fries: Unsplash
- Milkshake: Unsplash
- Paneer Tikka: Unsplash
- Garlic Naan: Unsplash
- Lassi: Unsplash

---

## 🔐 Security Notes

⚠️ **Important:** The seed file contains placeholder passwords.

In production:
1. Never hardcode passwords
2. Use proper bcrypt hashing
3. Load from environment variables
4. Use secure credential management

---

## 📊 Testing

After seeding, verify in your API:

```bash
# Get all restaurants
curl http://localhost:5000/api/restaurants

# Expected response:
{
  "restaurants": [
    {
      "id": "uuid",
      "name": "Pizzeria Delight",
      "imageUrl": "https://images.unsplash.com/...",
      "rating": 4.5,
      "cuisines": ["Italian", "Pizza"],
      ...
    },
    ...
  ],
  "page": 1,
  "pages": 1,
  "total": 3
}
```

---

## 🗑️ Reset Database

To clear and re-seed:

```bash
npm run db:reset
```

This will:
1. Drop all tables
2. Run migrations
3. Run seed script automatically

---

## 🔧 Customization

To add more restaurants:

1. Edit `prisma/seed.js`
2. Add more `restaurant` objects with:
   - Name
   - Image URL (from Unsplash or CDN)
   - Cuisines
   - Location details
   - Menu items

3. Run: `npm run seed`

---

## 📖 Seed File Structure

```javascript
// 1. Create users (restaurant owners)
const owner = await prisma.user.create({...})

// 2. Create restaurants
const restaurant = await prisma.restaurant.create({
  data: {
    name: "Restaurant Name",
    ownerId: owner.id,
    imageUrl: "https://...",
    cuisines: ["Type1", "Type2"],
    address: {
      line1, line2, city, state, zipCode,
      deliveryFee, deliveryTime, minOrder
    }
  }
})

// 3. Create menu items
await prisma.menuItem.createMany({
  data: [
    {
      restaurantId: restaurant.id,
      name: "Item Name",
      price: 25000, // in paise
      imageUrl: "https://...",
      category: "Category",
      isVeg: true,
      isBestseller: true
    }
  ]
})
```

---

## ✅ Troubleshooting

### Error: "relation 'User' does not exist"
**Solution:** Run migrations first
```bash
npx prisma migrate deploy
```

### Error: "No PrismaClient instance found"
**Solution:** Ensure `@prisma/client` is installed
```bash
npm install @prisma/client
```

### Error: "DATABASE_URL is not set"
**Solution:** Check `.env` file has `DATABASE_URL`
```bash
echo "DATABASE_URL=postgresql://..." > .env
```

---

## 🎯 Next Steps

After seeding:
1. ✅ Verify restaurants appear in API
2. ✅ Verify images load correctly
3. ✅ Test frontend can fetch restaurant data
4. ✅ Test menu items display properly
5. ✅ Test ordering workflow

---

**Happy seeding! 🚀**
