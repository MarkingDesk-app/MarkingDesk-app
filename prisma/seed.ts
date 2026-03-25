import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

function fallbackNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "admin";
  return localPart
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    throw new Error("Missing ADMIN_EMAIL environment variable for seeding.");
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();

  await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { role: Role.ADMIN },
    create: {
      email: normalizedEmail,
      name: fallbackNameFromEmail(normalizedEmail),
      role: Role.ADMIN,
    },
  });

  process.stdout.write(`Seeded ADMIN user: ${normalizedEmail}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Seed failed"}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
