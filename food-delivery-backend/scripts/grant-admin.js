import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Accept email as CLI arg, fallback to default
const TARGET_EMAIL = (process.argv[2] || "namankhatak@gmail.com").toLowerCase().trim();

async function main() {
  // Case-insensitive search in case registration used different casing
  const user = await prisma.user.findFirst({
    where: { email: { equals: TARGET_EMAIL, mode: "insensitive" } },
  });

  if (!user) {
    console.error(`\nUser not found: ${TARGET_EMAIL}`);
    console.error("\nThis script requires the user to have registered first.");
    console.error("Steps:");
    console.error("  1. Register at https://ghost-kitchen-three.vercel.app/register");
    console.error(`     using the email: ${TARGET_EMAIL}`);
    console.error("  2. Then run this script again via the Render Shell:");
    console.error("     node scripts/grant-admin.js\n");

    const allUsers = await prisma.user.findMany({
      select: { email: true, name: true, activeRole: true },
    });
    if (allUsers.length > 0) {
      console.error("Users currently in the database:");
      allUsers.forEach((u) => console.error(`  - ${u.email} (${u.name}, ${u.activeRole})`));
    } else {
      console.error("No users registered yet in this database.");
    }
    process.exit(1);
  }

  console.log(`Found: ${user.name} <${user.email}> (${user.id})`);
  console.log(`Current roles: [${user.roles.join(", ")}], activeRole: ${user.activeRole}`);

  const roles = user.roles.includes("ADMIN") ? user.roles : [...user.roles, "ADMIN"];

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { roles, activeRole: "ADMIN" },
    select: { id: true, name: true, email: true, roles: true, activeRole: true },
  });

  console.log("\nAdmin role granted successfully:");
  console.log(JSON.stringify(updated, null, 2));
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
