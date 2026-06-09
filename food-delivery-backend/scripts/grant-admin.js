import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TARGET_EMAIL = "namankhatak@gmail.com";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) {
    console.error(`User not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  console.log(`Found user: ${user.name} (${user.id})`);
  console.log(`Current roles: ${user.roles.join(", ")}, activeRole: ${user.activeRole}`);

  const roles = user.roles.includes("ADMIN") ? user.roles : [...user.roles, "ADMIN"];

  const updated = await prisma.user.update({
    where: { email: TARGET_EMAIL },
    data: { roles, activeRole: "ADMIN" },
    select: { id: true, name: true, email: true, roles: true, activeRole: true },
  });

  console.log("Admin role granted successfully:");
  console.log(JSON.stringify(updated, null, 2));
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
