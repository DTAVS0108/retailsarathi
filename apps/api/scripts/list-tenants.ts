import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: {
        select: {
          products: true,
          customers: true,
          invoices: true,
          users: true,
        },
      },
      users: { select: { email: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log(JSON.stringify(tenants, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
