import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function seed() {
  console.log("🌱 Checking whether seeding is needed…");

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // Count existing restaurants. If data already exists, bail out immediately
  // so Render deploys never overwrite live data.
  const existingCount = await prisma.restaurant.count();
  if (existingCount > 0) {
    console.log(
      `✅ Seed skipped — ${existingCount} restaurant(s) already exist.`
    );
    return;
  }

  console.log("🌱 Database is empty. Running seed…");

  // ── Owner accounts ─────────────────────────────────────────────────────────
  // Use fixed UUIDs so the seed is truly idempotent when called via upsert.
  const OWNER_IDS = {
    pizza: "seed-owner-pizza-0000-0000-000000000001",
    burger: "seed-owner-burger-000-0000-000000000002",
    curry: "seed-owner-curry-0000-0000-000000000003",
  };

  const hashedPassword = await bcrypt.hash("Seed@1234", 10);

  async function upsertOwner(id, email, name, phone) {
    return prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email,
        name,
        password: hashedPassword,
        phone,
        roles: ["CUSTOMER", "RESTAURANT"],
        activeRole: "RESTAURANT",
        secondRole: "RESTAURANT",
      },
    });
  }

  const [owner1, owner2, owner3] = await Promise.all([
    upsertOwner(OWNER_IDS.pizza, "pizza@ghostkitchen.dev", "Pizza Master", "+91 98765 43210"),
    upsertOwner(OWNER_IDS.burger, "burger@ghostkitchen.dev", "Burger King", "+91 98765 43211"),
    upsertOwner(OWNER_IDS.curry, "curry@ghostkitchen.dev", "Curry House", "+91 98765 43212"),
  ]);

  console.log("👤 Seed owners created (or already existed)");

  // ── Restaurants ────────────────────────────────────────────────────────────
  const restaurant1 = await prisma.restaurant.create({
    data: {
      name: "Pizzeria Delight",
      slug: "pizzeria-delight",
      ownerId: owner1.id,
      description: "Authentic Italian pizzas with fresh ingredients",
      cuisines: ["Italian", "Pizza"],
      rating: 4.5,
      imageUrl:
        "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80",
      address: {
        line1: "123 Pizza Street, Near Central Square",
        city: "Delhi",
        deliveryFee: 4000,   // ₹40 in paise
        deliveryTime: 30,
        minOrder: 20000,     // ₹200 in paise
      },
      isOpen: true,
      deliveryRadius: 5,
    },
  });

  const restaurant2 = await prisma.restaurant.create({
    data: {
      name: "Burger Barn",
      slug: "burger-barn",
      ownerId: owner2.id,
      description: "Juicy burgers and crispy fries",
      cuisines: ["American", "Fast Food", "Burger"],
      rating: 4.2,
      imageUrl:
        "https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=80",
      address: {
        line1: "456 Burger Avenue, Market Area",
        city: "Delhi",
        deliveryFee: 5000,   // ₹50 in paise
        deliveryTime: 25,
        minOrder: 25000,     // ₹250 in paise
      },
      isOpen: true,
      deliveryRadius: 4,
    },
  });

  const restaurant3 = await prisma.restaurant.create({
    data: {
      name: "Curry House",
      slug: "curry-house",
      ownerId: owner3.id,
      description: "Authentic Indian cuisine with traditional recipes",
      cuisines: ["Indian", "North Indian", "Biryani"],
      rating: 4.7,
      imageUrl:
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
      address: {
        line1: "789 Spice Lane, Food Court Complex",
        city: "Mumbai",
        deliveryFee: 3000,   // ₹30 in paise
        deliveryTime: 35,
        minOrder: 30000,     // ₹300 in paise
      },
      isOpen: true,
      deliveryRadius: 6,
    },
  });

  // Update restaurantId on each owner record
  await Promise.all([
    prisma.user.update({ where: { id: owner1.id }, data: { restaurantId: restaurant1.id } }),
    prisma.user.update({ where: { id: owner2.id }, data: { restaurantId: restaurant2.id } }),
    prisma.user.update({ where: { id: owner3.id }, data: { restaurantId: restaurant3.id } }),
  ]);

  console.log("🍕🍔🍛 Seed restaurants created");

  // ── Menu items ─────────────────────────────────────────────────────────────
  // Prices in paise: ₹250 = 25000, ₹300 = 30000, ₹80 = 8000, etc.
  await prisma.menuItem.createMany({
    data: [
      // Pizzeria Delight
      {
        id: uuidv4(), restaurantId: restaurant1.id,
        name: "Margherita Pizza", description: "Fresh mozzarella, tomato sauce, basil",
        price: 25000, category: "Pizza", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80",
        isVeg: true, isBestseller: true, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant1.id,
        name: "Pepperoni Pizza", description: "Spicy pepperoni with mozzarella",
        price: 32000, category: "Pizza", sortOrder: 2,
        imageUrl: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=400&q=80",
        isVeg: false, isBestseller: true, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant1.id,
        name: "Garlic Bread", description: "Crispy bread with garlic butter",
        price: 8000, category: "Sides", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?w=400&q=80",
        isVeg: true, isBestseller: false, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant1.id,
        name: "Coke", description: "300ml chilled bottle",
        price: 4000, category: "Beverages", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1554866585-e8ee1b9e2c94?w=400&q=80",
        isVeg: true, isBestseller: false, isAvailable: true,
      },

      // Burger Barn
      {
        id: uuidv4(), restaurantId: restaurant2.id,
        name: "Classic Smash Burger", description: "Double smash patty with American cheese",
        price: 22000, category: "Burgers", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=80",
        isVeg: false, isBestseller: true, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant2.id,
        name: "Veggie Crunch Burger", description: "Crispy veggie patty with fresh toppings",
        price: 17000, category: "Burgers", sortOrder: 2,
        imageUrl: "https://images.unsplash.com/photo-1585238341710-4913dfded3d2?w=400&q=80",
        isVeg: true, isBestseller: false, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant2.id,
        name: "Truffle Fries", description: "Crispy golden fries with truffle oil",
        price: 10000, category: "Sides", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1575871317130-d8b7e89e8c6a?w=400&q=80",
        isVeg: true, isBestseller: false, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant2.id,
        name: "Chocolate Shake", description: "Thick Belgian chocolate milkshake",
        price: 14000, category: "Beverages", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1579954614171-828bcb93b594?w=400&q=80",
        isVeg: true, isBestseller: false, isAvailable: true,
      },

      // Curry House
      {
        id: uuidv4(), restaurantId: restaurant3.id,
        name: "Butter Chicken", description: "Tender chicken in creamy tomato-cashew sauce",
        price: 38000, category: "Main Course", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400&q=80",
        isVeg: false, isBestseller: true, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant3.id,
        name: "Paneer Tikka Masala", description: "Cottage cheese in spiced yogurt sauce",
        price: 32000, category: "Main Course", sortOrder: 2,
        imageUrl: "https://images.unsplash.com/photo-1585937421293-ddf16ee7e79f?w=400&q=80",
        isVeg: true, isBestseller: true, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant3.id,
        name: "Garlic Naan", description: "Soft tandoor-baked bread with garlic and butter",
        price: 6000, category: "Breads", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400&q=80",
        isVeg: true, isBestseller: false, isAvailable: true,
      },
      {
        id: uuidv4(), restaurantId: restaurant3.id,
        name: "Sweet Lassi", description: "Chilled yogurt drink with cardamom",
        price: 8000, category: "Beverages", sortOrder: 1,
        imageUrl: "https://images.unsplash.com/photo-1550906054-7aa0c88f2e49?w=400&q=80",
        isVeg: true, isBestseller: false, isAvailable: true,
      },
    ],
  });

  console.log("✅ Database seeding complete!");
  console.log("  • 3 restaurants in Delhi/Mumbai");
  console.log("  • 12 menu items across all restaurants");
  console.log("  • Seed account passwords: Seed@1234");
}

// ── Exported entry-point (used by the /seed HTTP endpoint) ────────────────────
// The HTTP endpoint in app.js is unauthenticated — protect it with an
// env-gate so it can only run when ALLOW_SEED=true is set on the server.
export async function seedDatabase() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
    throw new Error(
      "Seed blocked in production. Set ALLOW_SEED=true to proceed."
    );
  }
  return seed();
}

// ── Direct CLI invocation: node prisma/seed.js ─────────────────────────────
if (process.argv[1]?.includes("seed.js")) {
  seed()
    .catch((e) => {
      console.error("❌ Seeding failed:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
