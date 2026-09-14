import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "InvoiceLine" il
    SET
      "productSku" = COALESCE(il."productSku", pr.sku),
      "productBarcode" = COALESCE(il."productBarcode", pr.barcode)
    FROM "Product" pr
    WHERE il."productId" = pr.id
      AND (il."productSku" IS NULL OR il."productBarcode" IS NULL)
  `);
  console.log('Backfilled invoice lines:', result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
