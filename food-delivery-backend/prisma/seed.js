import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data
  await prisma.review.deleteMany({});
  await prisma.menuItem.deleteMany({});
  await prisma.restaurant.deleteMany({});
  await prisma.user.deleteMany({});

  // Create sample users (restaurant owners)
  const owner1 = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'pizza@example.com',
      name: 'Pizza Master',
      password: 'hashed_password_here', // In real app, use bcrypt
      role: 'SHOPKEEPER',
      phone: '+91 98765 43210',
    },
  });

  const owner2 = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'burger@example.com',
      name: 'Burger King',
      password: 'hashed_password_here',
      role: 'SHOPKEEPER',
      phone: '+91 98765 43211',
    },
  });

  const owner3 = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'curry@example.com',
      name: 'Curry House',
      password: 'hashed_password_here',
      role: 'SHOPKEEPER',
      phone: '+91 98765 43212',
    },
  });

  // Create sample restaurants
  const restaurant1 = await prisma.restaurant.create({
    data: {
      id: uuidv4(),
      name: 'Pizzeria Delight',
      ownerId: owner1.id,
      description: 'Authentic Italian pizzas with fresh ingredients',
      cuisines: ['Italian', 'Pizza'],
      rating: 4.5,
      imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop',
      address: {
        line1: '123 Pizza Street',
        line2: 'Near Central Square',
        city: 'Delhi',
        state: 'Delhi',
        zipCode: '110001',
        deliveryFee: 40,
        deliveryTime: 30,
        minOrder: 200,
      },
      isOpen: true,
      deliveryRadius: 5,
    },
  });

  const restaurant2 = await prisma.restaurant.create({
    data: {
      id: uuidv4(),
      name: 'Burger Barn',
      ownerId: owner2.id,
      description: 'Juicy burgers and crispy fries',
      cuisines: ['American', 'Fast Food'],
      rating: 4.2,
      imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=300&fit=crop',
      address: {
        line1: '456 Burger Avenue',
        line2: 'Market Area',
        city: 'Delhi',
        state: 'Delhi',
        zipCode: '110002',
        deliveryFee: 50,
        deliveryTime: 25,
        minOrder: 250,
      },
      isOpen: true,
      deliveryRadius: 4,
    },
  });

  const restaurant3 = await prisma.restaurant.create({
    data: {
      id: uuidv4(),
      name: 'Curry House',
      ownerId: owner3.id,
      description: 'Authentic Indian cuisine with traditional recipes',
      cuisines: ['Indian', 'North Indian', 'South Indian'],
      rating: 4.7,
      imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
      address: {
        line1: '789 Spice Lane',
        line2: 'Food Court Complex',
        city: 'Delhi',
        state: 'Delhi',
        zipCode: '110003',
        deliveryFee: 30,
        deliveryTime: 35,
        minOrder: 300,
      },
      isOpen: true,
      deliveryRadius: 6,
    },
  });

  // Create menu items for restaurant 1 (Pizzeria)
  await prisma.menuItem.createMany({
    data: [
      {
        id: uuidv4(),
        restaurantId: restaurant1.id,
        name: 'Margherita Pizza',
        description: 'Fresh mozzarella, tomato sauce, basil',
        price: 25000, // 250 in paise
        category: 'Pizza',
        imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: true,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant1.id,
        name: 'Pepperoni Pizza',
        description: 'Spicy pepperoni with mozzarella',
        price: 30000,
        category: 'Pizza',
        imageUrl: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=300&h=300&fit=crop',
        isVeg: false,
        isBestseller: true,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant1.id,
        name: 'Garlic Bread',
        description: 'Crispy bread with garlic butter',
        price: 8000,
        category: 'Sides',
        imageUrl: 'https://images.unsplash.com/photo-1599599810694-b5ac4dd479bb?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: false,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant1.id,
        name: 'Coke',
        description: '300ml bottle',
        price: 4000,
        category: 'Beverages',
        imageUrl: 'https://images.unsplash.com/photo-1554866585-e8ee1b9e2c94?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: false,
        isAvailable: true,
      },
    ],
  });

  // Create menu items for restaurant 2 (Burger Barn)
  await prisma.menuItem.createMany({
    data: [
      {
        id: uuidv4(),
        restaurantId: restaurant2.id,
        name: 'Classic Burger',
        description: 'Beef patty with cheese and lettuce',
        price: 20000,
        category: 'Burgers',
        imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=300&h=300&fit=crop',
        isVeg: false,
        isBestseller: true,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant2.id,
        name: 'Veggie Burger',
        description: 'Crispy veggie patty with fresh toppings',
        price: 15000,
        category: 'Burgers',
        imageUrl: 'https://images.unsplash.com/photo-1585238341710-4913dfded3d2?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: false,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant2.id,
        name: 'Fries',
        description: 'Crispy golden fries',
        price: 8000,
        category: 'Sides',
        imageUrl: 'https://images.unsplash.com/photo-1575871317130-d8b7e89e8c6a?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: false,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant2.id,
        name: 'Shake',
        description: 'Chocolate shake',
        price: 12000,
        category: 'Beverages',
        imageUrl: 'https://images.unsplash.com/photo-1579954614171-828bcb93b594?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: false,
        isAvailable: true,
      },
    ],
  });

  // Create menu items for restaurant 3 (Curry House)
  await prisma.menuItem.createMany({
    data: [
      {
        id: uuidv4(),
        restaurantId: restaurant3.id,
        name: 'Butter Chicken',
        description: 'Tender chicken in creamy tomato sauce',
        price: 35000,
        category: 'Main Course',
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=300&fit=crop',
        isVeg: false,
        isBestseller: true,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant3.id,
        name: 'Paneer Tikka Masala',
        description: 'Cottage cheese in spiced yogurt sauce',
        price: 30000,
        category: 'Main Course',
        imageUrl: 'https://images.unsplash.com/photo-1585937421293-ddf16ee7e79f?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: true,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant3.id,
        name: 'Garlic Naan',
        description: 'Soft naan bread with garlic',
        price: 6000,
        category: 'Bread',
        imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: false,
        isAvailable: true,
      },
      {
        id: uuidv4(),
        restaurantId: restaurant3.id,
        name: 'Lassi',
        description: 'Traditional yogurt drink',
        price: 8000,
        category: 'Beverages',
        imageUrl: 'https://images.unsplash.com/photo-1577003833154-a92bbd3a0b0b?w=300&h=300&fit=crop',
        isVeg: true,
        isBestseller: false,
        isAvailable: true,
      },
    ],
  });

  console.log('✅ Database seeding completed!');
  console.log('🍕 Created 3 restaurants with menu items');
  console.log('📊 All images are from Unsplash (high quality)');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
