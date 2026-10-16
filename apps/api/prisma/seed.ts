import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Remove all demo catalog, parties, and transactional data for a fresh shop. */
async function purgeDemoData(tenantId: string) {
  await prisma.supplierPaymentAllocation.deleteMany({
    where: { payment: { tenantId } },
  });
  await prisma.supplierLedgerEntry.deleteMany({ where: { tenantId } });
  await prisma.supplierPayment.deleteMany({ where: { tenantId } });
  await prisma.purchaseBillLine.deleteMany({ where: { bill: { tenantId } } });
  await prisma.purchaseBill.deleteMany({ where: { tenantId } });
  await prisma.customerPaymentAllocation.deleteMany({
    where: { payment: { tenantId } },
  });
  await prisma.customerLedgerEntry.deleteMany({ where: { tenantId } });
  await prisma.customerPayment.deleteMany({ where: { tenantId } });
  await prisma.payment.deleteMany({ where: { invoice: { tenantId } } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId } } });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.stockLedger.deleteMany({ where: { tenantId } });
  await prisma.draftStockIn.deleteMany({ where: { tenantId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
  await prisma.purchaseOrder.deleteMany({ where: { tenantId } });
  await prisma.repairPartUsed.deleteMany({ where: { repairJob: { tenantId } } });
  await prisma.repairStatusHistory.deleteMany({ where: { repairJob: { tenantId } } });
  await prisma.loanerCheckout.deleteMany({ where: { tenantId } });
  await prisma.loanerDevice.deleteMany({ where: { tenantId } });
  await prisma.repairJob.deleteMany({ where: { tenantId } });
  await prisma.device.deleteMany({ where: { tenantId } });
  await prisma.repairServiceType.deleteMany({ where: { tenantId } });
  await prisma.tradeIn.deleteMany({ where: { tenantId } });
  await prisma.loyaltyTransaction.deleteMany({ where: { tenantId } });
  await prisma.stockTakeLine.deleteMany({ where: { stockTake: { tenantId } } });
  await prisma.stockTake.deleteMany({ where: { tenantId } });
  await prisma.branchTransferItem.deleteMany({ where: { transfer: { tenantId } } });
  await prisma.branchTransfer.deleteMany({ where: { tenantId } });
  await prisma.priceListItem.deleteMany({ where: { priceList: { tenantId } } });
  await prisma.priceList.deleteMany({ where: { tenantId } });
  await prisma.productEnrichment.deleteMany({ where: { tenantId } });
  await prisma.supplierProductAlias.deleteMany({ where: { tenantId } });
  await prisma.productSerial.deleteMany({ where: { product: { tenantId } } });
  await prisma.ecommerceOrder.deleteMany({ where: { channel: { tenantId } } });
  await prisma.ecommerceChannel.deleteMany({ where: { tenantId } });
  await prisma.hardwareConfig.deleteMany({ where: { tenantId } });
  await prisma.staffAttendance.deleteMany({ where: { tenantId } });
  await prisma.staffCommission.deleteMany({ where: { tenantId } });
  await prisma.bankStatementLine.deleteMany({ where: { tenantId } });
  await prisma.gstr2bLine.deleteMany({ where: { import: { tenantId } } });
  await prisma.gstr2bImport.deleteMany({ where: { tenantId } });
  await prisma.aiAgentAction.deleteMany({ where: { tenantId } });
  await prisma.supportTicket.deleteMany({ where: { tenantId } });
  await prisma.journalEntry.deleteMany({ where: { tenantId } });
  await prisma.branchStock.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.supplier.updateMany({ where: { tenantId }, data: { outstandingBalance: 0 } });
  await prisma.supplier.deleteMany({ where: { tenantId } });
  await prisma.scanTemplate.deleteMany({ where: { tenantId } });
  // Keep Main Branch; drop extra demo branches created by seed
  await prisma.branch.deleteMany({
    where: { tenantId, isDefault: false, name: { contains: 'Andheri' } },
  });
}

async function main() {
  console.log('Seeding RetailSarathi demo tenant (catalog + khata)...');

  const passwordHash = await bcrypt.hash('Demo@123', 10);

  // Drop leftover tenants that registered the demo email outside the seed tenant
  // (e.g. production register before full seed) so login hits the demo shop.
  const strayOwners = await prisma.user.findMany({
    where: {
      email: 'owner@demo.retailsarathi.in',
      NOT: { tenantId: 'demo-tenant' },
    },
    select: { tenantId: true },
  });
  for (const row of strayOwners) {
    console.log(`Removing stray demo tenant ${row.tenantId}...`);
    await prisma.tenant.delete({ where: { id: row.tenantId } });
  }

  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant' },
    update: {
      // Keep demo branding consistent on re-seed; do not wipe GSTIN/address if customized later.
      email: 'owner@demo.retailsarathi.in',
      name: 'Demo Power Solutions',
    },
    create: {
      id: 'demo-tenant',
      name: 'Demo Power Solutions',
      slug: 'demo-power-solutions',
      gstin: '27AABCU9603R1ZM',
      stateCode: '27',
      phone: '9876543210',
      email: 'owner@demo.retailsarathi.in',
      address: 'Shop 12, Lamington Road, Mumbai, Maharashtra 400007',
      branches: {
        create: {
          id: 'demo-branch',
          name: 'Main Branch',
          address: 'Shop 12, Lamington Road, Mumbai',
          stateCode: '27',
          isDefault: true,
        },
      },
    },
    include: { branches: true },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'owner@demo.retailsarathi.in' } },
    update: { passwordHash, name: 'Demo Owner', role: 'OWNER', isActive: true },
    create: {
      tenantId: tenant.id,
      branchId: tenant.branches[0].id,
      email: 'owner@demo.retailsarathi.in',
      passwordHash,
      name: 'Demo Owner',
      role: 'OWNER',
    },
  });

  await purgeDemoData(tenant.id);

  const accounts = [
    { code: '1000', name: 'Cash in Hand', type: 'ASSET' as const },
    // Code 1100 is the Accounts Receivable leg the accounting service posts credit
    // (udhaar) sales and collections against — must match, not a literal bank account.
    { code: '1100', name: 'Accounts Receivable', type: 'ASSET' as const },
    { code: '1200', name: 'Inventory', type: 'ASSET' as const },
    { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' as const },
    { code: '3000', name: 'Owner Equity', type: 'EQUITY' as const },
    { code: '4000', name: 'Sales Revenue', type: 'INCOME' as const },
    { code: '4100', name: 'Repair Service Income', type: 'INCOME' as const },
    { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' as const },
    { code: '5100', name: 'Rent Expense', type: 'EXPENSE' as const },
    { code: '5200', name: 'Salary Expense', type: 'EXPENSE' as const },
  ];

  for (const a of accounts) {
    await prisma.account.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: a.code } },
      update: { name: a.name, type: a.type },
      create: { tenantId: tenant.id, ...a },
    });
  }

  await prisma.notificationTemplate.upsert({
    where: { id: 'demo-tpl-invoice' },
    update: {},
    create: {
      id: 'demo-tpl-invoice',
      tenantId: tenant.id,
      name: 'Invoice Sent',
      channel: 'WHATSAPP',
      body: 'Hi {{customerName}}, your invoice {{invoiceNumber}} for ₹{{amount}} is ready.',
      variables: ['customerName', 'invoiceNumber', 'amount'],
    },
  });

  await prisma.notificationTemplate.upsert({
    where: { id: 'demo-tpl-repair' },
    update: {},
    create: {
      id: 'demo-tpl-repair',
      tenantId: tenant.id,
      name: 'Repair Ready',
      channel: 'WHATSAPP',
      body: 'Hi {{customerName}}, your {{deviceModel}} repair (Job {{jobNumber}}) is ready for pickup. Amount: ₹{{amount}}',
      variables: ['customerName', 'deviceModel', 'jobNumber', 'amount'],
    },
  });

  // ─── Demo purchase bills (valid GST AP samples for tracking) ─────
  const owner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: 'owner@demo.retailsarathi.in' },
  });

  const exide = await prisma.supplier.create({
    data: {
      tenantId: tenant.id,
      name: 'Exide Care Distributors',
      phone: '9822012345',
      email: 'orders@exidecare.example',
      gstin: '27AABCE1234F1Z5',
      address: 'Plot 8, MIDC Andheri East, Mumbai 400093',
      bankName: 'HDFC Bank',
      bankAccount: '50200011223344',
      ifsc: 'HDFC0000123',
      bankBranch: 'Andheri East',
      outstandingBalance: 0,
    },
  });

  const shubh = await prisma.supplier.create({
    data: {
      tenantId: tenant.id,
      name: 'Shubh Traders',
      phone: '9876501234',
      gstin: '27AADCS9988H1Z2',
      address: 'Lamington Road, Mumbai 400007',
      outstandingBalance: 0,
    },
  });

  await prisma.productCategory.createMany({
    data: [
      { tenantId: tenant.id, name: 'Batteries' },
      { tenantId: tenant.id, name: 'Inverters' },
      { tenantId: tenant.id, name: 'Accessories' },
      { tenantId: tenant.id, name: 'Mobiles' },
      { tenantId: tenant.id, name: 'Spare Parts' },
    ],
    skipDuplicates: true,
  });

  const batt = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku: 'BAT-EX-150',
      barcode: '890100150001',
      name: 'Exide 150Ah Tall Tubular',
      hsnCode: '8507',
      category: 'Batteries',
      brand: 'Exide',
      model: 'IT500',
      salePrice: 14500,
      purchasePrice: 11800,
      gstRate: 28,
      stockQty: 6,
      lowStockThreshold: 2,
    },
  });

  const inv = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku: 'INV-LUM-1100',
      barcode: '890100110011',
      name: 'Luminous Zelio 1100',
      hsnCode: '8504',
      category: 'Inverters',
      brand: 'Luminous',
      model: 'Zelio 1100',
      salePrice: 7800,
      purchasePrice: 6200,
      gstRate: 18,
      stockQty: 3,
      lowStockThreshold: 1,
    },
  });

  const cable = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku: 'CAB-DC-10',
      barcode: '890100220010',
      name: 'DC Battery Cable 10mm (pair)',
      hsnCode: '8544',
      category: 'Accessories',
      brand: 'Generic',
      salePrice: 450,
      purchasePrice: 280,
      gstRate: 18,
      stockQty: 40,
      lowStockThreshold: 10,
    },
  });

  const screen = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku: 'PART-SCR-13',
      barcode: '890100330013',
      name: 'iPhone 13 Display Assembly',
      hsnCode: '8517',
      category: 'Spare Parts',
      brand: 'OEM Compatible',
      model: 'iPhone 13',
      salePrice: 4200,
      purchasePrice: 2800,
      gstRate: 18,
      stockQty: 4,
      lowStockThreshold: 2,
    },
  });

  const phone = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku: 'MOB-SAM-A15',
      barcode: '890100440015',
      name: 'Samsung Galaxy A15 8/128',
      hsnCode: '8517',
      category: 'Mobiles',
      brand: 'Samsung',
      model: 'A15',
      salePrice: 18999,
      purchasePrice: 16500,
      gstRate: 18,
      stockQty: 2,
      lowStockThreshold: 3,
      trackSerial: true,
      needsEnrichment: false,
    },
  });

  const outOfStock = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku: 'BAT-AM-100',
      barcode: '890100150100',
      name: 'Amaron 100Ah Flat Plate',
      hsnCode: '8507',
      category: 'Batteries',
      brand: 'Amaron',
      model: 'CR100',
      salePrice: 9800,
      purchasePrice: 7900,
      gstRate: 28,
      stockQty: 0,
      lowStockThreshold: 2,
    },
  });

  const needsDetails = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku: 'TMP-NEW-001',
      name: 'Unknown line from Shubh bill',
      hsnCode: '8507',
      category: 'Batteries',
      salePrice: 0,
      purchasePrice: 5500,
      gstRate: 28,
      stockQty: 5,
      lowStockThreshold: 1,
      needsEnrichment: true,
      barcode: null,
      brand: null,
      model: null,
    },
  });

  await prisma.productSerial.createMany({
    data: [
      {
        productId: phone.id,
        serialNumber: 'SN-A15-1001',
        imei: '356938035643809',
        condition: 'NEW',
        status: 'IN_STOCK',
      },
      {
        productId: phone.id,
        serialNumber: 'SN-A15-1002',
        imei: '356938035643817',
        condition: 'NEW',
        status: 'IN_STOCK',
      },
    ],
  });

  await prisma.productEnrichment.create({
    data: {
      tenantId: tenant.id,
      productId: needsDetails.id,
      status: 'PENDING',
      missingFields: ['barcode', 'salePrice', 'brand', 'model'],
      draftName: 'Unknown line from Shubh bill',
      notes: 'Demo — complete details after stock-in',
    },
  });

  void outOfStock; // referenced for catalog completeness (0 stock filter)

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
  };
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  // 1) Recent unpaid bill (still within credit terms)
  const bill1Date = daysAgo(5);
  const bill1Sub = 23600; // 2 × 11800
  const bill1Tax = Math.round(bill1Sub * 0.28 * 100) / 100;
  const bill1Total = Math.round((bill1Sub + bill1Tax) * 100) / 100;
  const bill1 = await prisma.purchaseBill.create({
    data: {
      tenantId: tenant.id,
      supplierId: exide.id,
      supplierName: exide.name,
      invoiceNumber: 'EXD/2026-27/1042',
      invoiceDate: bill1Date,
      dueDate: addDays(bill1Date, 30),
      paymentTermsDays: 30,
      gstin: exide.gstin,
      placeOfSupply: '27-Maharashtra',
      subtotal: bill1Sub,
      taxAmount: bill1Tax,
      cgstAmount: bill1Tax / 2,
      sgstAmount: bill1Tax / 2,
      igstAmount: 0,
      totalAmount: bill1Total,
      paidAmount: 0,
      status: 'POSTED',
      createdByUserId: owner?.id,
      notes: JSON.stringify({
        source: 'seed',
        cgstAmount: bill1Tax / 2,
        sgstAmount: bill1Tax / 2,
        igstAmount: 0,
        notes: 'Demo unpaid — within 30-day credit',
      }),
      lines: {
        create: [
          {
            productId: batt.id,
            productName: batt.name,
            sku: batt.sku,
            quantity: 2,
            unitCost: 11800,
            lineTotal: 23600,
            hsnCode: '8507',
            gstRate: 28,
          },
        ],
      },
    },
  });

  // 2) Aging partially paid bill (overdue ~20 days past due)
  const bill2Date = daysAgo(50);
  const bill2Sub = 18600; // 3 × 6200
  const bill2Tax = Math.round(bill2Sub * 0.18 * 100) / 100;
  const bill2Total = Math.round((bill2Sub + bill2Tax) * 100) / 100;
  const bill2Paid = 10000;
  const bill2 = await prisma.purchaseBill.create({
    data: {
      tenantId: tenant.id,
      supplierId: shubh.id,
      supplierName: shubh.name,
      invoiceNumber: 'ST/358/2026',
      invoiceDate: bill2Date,
      dueDate: addDays(bill2Date, 30),
      paymentTermsDays: 30,
      gstin: shubh.gstin,
      placeOfSupply: '27-Maharashtra',
      subtotal: bill2Sub,
      taxAmount: bill2Tax,
      cgstAmount: bill2Tax / 2,
      sgstAmount: bill2Tax / 2,
      igstAmount: 0,
      totalAmount: bill2Total,
      paidAmount: bill2Paid,
      status: 'PARTIALLY_PAID',
      createdByUserId: owner?.id,
      notes: JSON.stringify({
        source: 'seed',
        notes: 'Demo partial pay — overdue for aging board',
      }),
      lines: {
        create: [
          {
            productId: inv.id,
            productName: inv.name,
            sku: inv.sku,
            quantity: 3,
            unitCost: 6200,
            lineTotal: 18600,
            hsnCode: '8504',
            gstRate: 18,
          },
        ],
      },
    },
  });

  // 3) Fully paid older bill
  const bill3Date = daysAgo(75);
  const bill3Sub = 11800;
  const bill3Tax = Math.round(bill3Sub * 0.28 * 100) / 100;
  const bill3Total = Math.round((bill3Sub + bill3Tax) * 100) / 100;
  const bill3 = await prisma.purchaseBill.create({
    data: {
      tenantId: tenant.id,
      supplierId: exide.id,
      supplierName: exide.name,
      invoiceNumber: 'EXD/2026-27/0988',
      invoiceDate: bill3Date,
      dueDate: addDays(bill3Date, 15),
      paymentTermsDays: 15,
      gstin: exide.gstin,
      placeOfSupply: '27-Maharashtra',
      subtotal: bill3Sub,
      taxAmount: bill3Tax,
      cgstAmount: bill3Tax / 2,
      sgstAmount: bill3Tax / 2,
      igstAmount: 0,
      totalAmount: bill3Total,
      paidAmount: bill3Total,
      status: 'PAID',
      createdByUserId: owner?.id,
      notes: JSON.stringify({ source: 'seed', notes: 'Demo cleared bill' }),
      lines: {
        create: [
          {
            productId: batt.id,
            productName: batt.name,
            sku: batt.sku,
            quantity: 1,
            unitCost: 11800,
            lineTotal: 11800,
            hsnCode: '8507',
            gstRate: 28,
          },
        ],
      },
    },
  });

  // Payments + ledger (khata)
  const pay2 = await prisma.supplierPayment.create({
    data: {
      tenantId: tenant.id,
      supplierId: shubh.id,
      amount: bill2Paid,
      method: 'UPI',
      paymentDate: daysAgo(10),
      referenceNo: 'UPI-DEMO-358',
      notes: 'Part payment against ST/358',
      allocations: {
        create: [{ billId: bill2.id, amount: bill2Paid }],
      },
    },
  });

  const pay3 = await prisma.supplierPayment.create({
    data: {
      tenantId: tenant.id,
      supplierId: exide.id,
      amount: bill3Total,
      method: 'NEFT',
      paymentDate: daysAgo(60),
      referenceNo: 'NEFT-EXD-988',
      bankName: 'HDFC Bank',
      notes: 'Full settlement EXD/0988',
      allocations: {
        create: [{ billId: bill3.id, amount: bill3Total }],
      },
    },
  });

  const exideOutstanding = bill1Total; // only unpaid bill1
  const shubhOutstanding = Math.round((bill2Total - bill2Paid) * 100) / 100;

  await prisma.supplier.update({
    where: { id: exide.id },
    data: { outstandingBalance: exideOutstanding },
  });
  await prisma.supplier.update({
    where: { id: shubh.id },
    data: { outstandingBalance: shubhOutstanding },
  });

  await prisma.supplierLedgerEntry.createMany({
    data: [
      {
        tenantId: tenant.id,
        supplierId: exide.id,
        type: 'BILL',
        amount: bill3Total,
        balanceAfter: bill3Total,
        billId: bill3.id,
        notes: `Purchase bill ${bill3.invoiceNumber}`,
        entryDate: bill3Date,
      },
      {
        tenantId: tenant.id,
        supplierId: exide.id,
        type: 'PAYMENT',
        amount: bill3Total,
        balanceAfter: 0,
        billId: bill3.id,
        paymentId: pay3.id,
        notes: `Payment ${pay3.referenceNo}`,
        entryDate: daysAgo(60),
      },
      {
        tenantId: tenant.id,
        supplierId: exide.id,
        type: 'BILL',
        amount: bill1Total,
        balanceAfter: bill1Total,
        billId: bill1.id,
        notes: `Purchase bill ${bill1.invoiceNumber}`,
        entryDate: bill1Date,
      },
      {
        tenantId: tenant.id,
        supplierId: shubh.id,
        type: 'BILL',
        amount: bill2Total,
        balanceAfter: bill2Total,
        billId: bill2.id,
        notes: `Purchase bill ${bill2.invoiceNumber}`,
        entryDate: bill2Date,
      },
      {
        tenantId: tenant.id,
        supplierId: shubh.id,
        type: 'PAYMENT',
        amount: bill2Paid,
        balanceAfter: shubhOutstanding,
        billId: bill2.id,
        paymentId: pay2.id,
        notes: `Payment ${pay2.referenceNo}`,
        entryDate: daysAgo(10),
      },
    ],
  });

  const branchId = tenant.branches[0]?.id || 'demo-branch';

  // Demo PO — ordered (open for GRN)
  await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      branchId,
      supplierId: exide.id,
      poNumber: `PO-${new Date().getFullYear()}-00001`,
      status: 'ORDERED',
      notes: 'Demo open PO — receive GRN to create bill',
      orderedAt: daysAgo(2),
      lines: {
        create: [
          { productId: batt.id, quantity: 4, receivedQty: 0, unitCost: 11800 },
          { productId: inv.id, quantity: 2, receivedQty: 0, unitCost: 6200 },
        ],
      },
    },
  });

  // Demo PO — partial receive already done historically
  await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      branchId,
      supplierId: shubh.id,
      poNumber: `PO-${new Date().getFullYear()}-00002`,
      status: 'PARTIAL',
      notes: 'Demo partial GRN',
      orderedAt: daysAgo(20),
      lines: {
        create: [{ productId: inv.id, quantity: 5, receivedQty: 2, unitCost: 6200 }],
      },
    },
  });

  // Completed stock take sample (history)
  await prisma.stockTake.create({
    data: {
      tenantId: tenant.id,
      branchId,
      status: 'COMPLETED',
      notes: 'Demo completed cycle count',
      completedAt: daysAgo(3),
      createdAt: daysAgo(3),
      lines: {
        create: [
          { productId: batt.id, systemQty: 6, countedQty: 6 },
          { productId: inv.id, systemQty: 3, countedQty: 2 },
        ],
      },
    },
  });

  // ─── Customer udhaar (receivables khata) ─────────────────────────
  const ramesh = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'Ramesh Patil',
      phone: '9876543211',
      email: 'ramesh.patil@example.com',
      address: 'Flat 4B, Dadar West',
      city: 'Mumbai',
      pincode: '400028',
      stateCode: '27',
      segment: 'RETAIL',
      creditLimit: 50000,
      outstandingBalance: 0,
      loyaltyPoints: 120,
      whatsappOptIn: true,
      createdByUserId: owner?.id,
    },
  });

  const mehta = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'Mehta Electricals',
      phone: '9820098765',
      gstin: '27AAGCM4455P1Z8',
      address: '22, Lamington Road',
      city: 'Mumbai',
      pincode: '400007',
      stateCode: '27',
      segment: 'DEALER',
      creditLimit: 200000,
      outstandingBalance: 0,
      whatsappOptIn: true,
      createdByUserId: owner?.id,
    },
  });

  const priya = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'Priya Shah',
      phone: '9988776655',
      address: 'Bandra East',
      city: 'Mumbai',
      pincode: '400051',
      stateCode: '27',
      segment: 'RETAIL',
      creditLimit: 25000,
      outstandingBalance: 0,
      loyaltyPoints: 40,
      createdByUserId: owner?.id,
    },
  });

  /** Intra-state GST totals for a single line sale. */
  function saleTotals(unitPrice: number, qty: number, gstRate: number) {
    const taxable = Math.round(unitPrice * qty * 100) / 100;
    const tax = Math.round(taxable * (gstRate / 100) * 100) / 100;
    const half = Math.round((tax / 2) * 100) / 100;
    return {
      taxable,
      tax,
      cgst: half,
      sgst: half,
      grand: Math.round((taxable + tax) * 100) / 100,
    };
  }

  // Recent credit sale — 0–30 aging bucket
  const sale1Date = daysAgo(12);
  const s1 = saleTotals(14500, 1, 28);
  const invRamesh = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: ramesh.id,
      invoiceNumber: 'INV-26-27-00001',
      type: 'TAX_INVOICE',
      status: 'FINALIZED',
      supplyType: 'INTRA_STATE',
      subtotal: s1.taxable,
      totalCgst: s1.cgst,
      totalSgst: s1.sgst,
      totalIgst: 0,
      grandTotal: s1.grand,
      notes: 'Demo udhaar — within 30 days',
      soldByUserId: owner?.id,
      createdAt: sale1Date,
      updatedAt: sale1Date,
      lines: {
        create: [
          {
            productId: batt.id,
            productName: batt.name,
            hsnCode: batt.hsnCode,
            quantity: 1,
            unitPrice: 14500,
            gstRate: 28,
            cgst: s1.cgst,
            sgst: s1.sgst,
            igst: 0,
            taxableAmount: s1.taxable,
            total: s1.grand,
          },
        ],
      },
      payments: {
        create: [{ method: 'CREDIT', amount: s1.grand, reference: 'UDHAAR' }],
      },
    },
  });

  // Mid-age credit — partial collection (31–60 bucket remaining)
  const sale2Date = daysAgo(45);
  const s2 = saleTotals(7800, 2, 18);
  const invMehtaRecent = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: mehta.id,
      invoiceNumber: 'INV-26-27-00002',
      type: 'TAX_INVOICE',
      status: 'FINALIZED',
      supplyType: 'INTRA_STATE',
      subtotal: s2.taxable,
      totalCgst: s2.cgst,
      totalSgst: s2.sgst,
      totalIgst: 0,
      grandTotal: s2.grand,
      notes: 'Demo dealer credit — partially collected',
      soldByUserId: owner?.id,
      createdAt: sale2Date,
      updatedAt: sale2Date,
      lines: {
        create: [
          {
            productId: inv.id,
            productName: inv.name,
            hsnCode: inv.hsnCode,
            quantity: 2,
            unitPrice: 7800,
            gstRate: 18,
            cgst: s2.cgst,
            sgst: s2.sgst,
            igst: 0,
            taxableAmount: s2.taxable,
            total: s2.grand,
          },
        ],
      },
      payments: {
        create: [{ method: 'CREDIT', amount: s2.grand, reference: 'UDHAAR' }],
      },
    },
  });

  const collectAmt = 5000;
  const collectDate = daysAgo(8);
  const collectPay = await prisma.customerPayment.create({
    data: {
      tenantId: tenant.id,
      customerId: mehta.id,
      amount: collectAmt,
      method: 'UPI',
      status: 'POSTED',
      paymentDate: collectDate,
      referenceNo: 'UPI-MEHTA-5000',
      notes: 'Part collection against INV-26-27-00002',
      allocations: {
        create: [{ invoiceId: invMehtaRecent.id, amount: collectAmt }],
      },
    },
  });

  // Old overdue credit — 90+ aging
  const sale3Date = daysAgo(105);
  const s3 = saleTotals(14500, 1, 28);
  const invMehtaOld = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: mehta.id,
      invoiceNumber: 'INV-26-27-00003',
      type: 'TAX_INVOICE',
      status: 'FINALIZED',
      supplyType: 'INTRA_STATE',
      subtotal: s3.taxable,
      totalCgst: s3.cgst,
      totalSgst: s3.sgst,
      totalIgst: 0,
      grandTotal: s3.grand,
      notes: 'Demo overdue udhaar — 90+ days',
      soldByUserId: owner?.id,
      createdAt: sale3Date,
      updatedAt: sale3Date,
      lines: {
        create: [
          {
            productId: batt.id,
            productName: batt.name,
            hsnCode: batt.hsnCode,
            quantity: 1,
            unitPrice: 14500,
            gstRate: 28,
            cgst: s3.cgst,
            sgst: s3.sgst,
            igst: 0,
            taxableAmount: s3.taxable,
            total: s3.grand,
          },
        ],
      },
      payments: {
        create: [{ method: 'CREDIT', amount: s3.grand, reference: 'UDHAAR' }],
      },
    },
  });

  // Settled credit that was fully collected (shows ledger history, 0 outstanding)
  const sale4Date = daysAgo(20);
  const s4 = saleTotals(7800, 1, 18);
  const invPriya = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: priya.id,
      invoiceNumber: 'INV-26-27-00004',
      type: 'TAX_INVOICE',
      status: 'FINALIZED',
      supplyType: 'INTRA_STATE',
      subtotal: s4.taxable,
      totalCgst: s4.cgst,
      totalSgst: s4.sgst,
      totalIgst: 0,
      grandTotal: s4.grand,
      notes: 'Demo — credit then fully collected',
      soldByUserId: owner?.id,
      createdAt: sale4Date,
      updatedAt: sale4Date,
      lines: {
        create: [
          {
            productId: inv.id,
            productName: inv.name,
            hsnCode: inv.hsnCode,
            quantity: 1,
            unitPrice: 7800,
            gstRate: 18,
            cgst: s4.cgst,
            sgst: s4.sgst,
            igst: 0,
            taxableAmount: s4.taxable,
            total: s4.grand,
          },
        ],
      },
      payments: {
        create: [{ method: 'CREDIT', amount: s4.grand, reference: 'UDHAAR' }],
      },
    },
  });

  const priyaCollect = await prisma.customerPayment.create({
    data: {
      tenantId: tenant.id,
      customerId: priya.id,
      amount: s4.grand,
      method: 'CASH',
      status: 'POSTED',
      paymentDate: daysAgo(18),
      referenceNo: 'CASH-PRIYA',
      notes: 'Full settlement',
      allocations: {
        create: [{ invoiceId: invPriya.id, amount: s4.grand }],
      },
    },
  });

  const rameshOut = s1.grand;
  const mehtaOut = Math.round((s2.grand - collectAmt + s3.grand) * 100) / 100;

  await prisma.customer.update({
    where: { id: ramesh.id },
    data: { outstandingBalance: rameshOut },
  });
  await prisma.customer.update({
    where: { id: mehta.id },
    data: { outstandingBalance: mehtaOut },
  });
  await prisma.customer.update({
    where: { id: priya.id },
    data: { outstandingBalance: 0 },
  });

  // Adjust stock for sold units (2 batteries + 3 inverters from credit demos)
  await prisma.product.update({
    where: { id: batt.id },
    data: { stockQty: { decrement: 2 } },
  });
  await prisma.product.update({
    where: { id: inv.id },
    data: { stockQty: { decrement: 3 } },
  });

  await prisma.customerLedgerEntry.createMany({
    data: [
      {
        tenantId: tenant.id,
        customerId: ramesh.id,
        type: 'INVOICE',
        amount: s1.grand,
        balanceAfter: s1.grand,
        invoiceId: invRamesh.id,
        notes: `Credit sale ${invRamesh.invoiceNumber}`,
        entryDate: sale1Date,
      },
      {
        tenantId: tenant.id,
        customerId: mehta.id,
        type: 'INVOICE',
        amount: s3.grand,
        balanceAfter: s3.grand,
        invoiceId: invMehtaOld.id,
        notes: `Credit sale ${invMehtaOld.invoiceNumber}`,
        entryDate: sale3Date,
      },
      {
        tenantId: tenant.id,
        customerId: mehta.id,
        type: 'INVOICE',
        amount: s2.grand,
        balanceAfter: s3.grand + s2.grand,
        invoiceId: invMehtaRecent.id,
        notes: `Credit sale ${invMehtaRecent.invoiceNumber}`,
        entryDate: sale2Date,
      },
      {
        tenantId: tenant.id,
        customerId: mehta.id,
        type: 'COLLECTION',
        amount: collectAmt,
        balanceAfter: mehtaOut,
        invoiceId: invMehtaRecent.id,
        paymentId: collectPay.id,
        notes: `Collection ${collectPay.referenceNo}`,
        entryDate: collectDate,
      },
      {
        tenantId: tenant.id,
        customerId: priya.id,
        type: 'INVOICE',
        amount: s4.grand,
        balanceAfter: s4.grand,
        invoiceId: invPriya.id,
        notes: `Credit sale ${invPriya.invoiceNumber}`,
        entryDate: sale4Date,
      },
      {
        tenantId: tenant.id,
        customerId: priya.id,
        type: 'COLLECTION',
        amount: s4.grand,
        balanceAfter: 0,
        invoiceId: invPriya.id,
        paymentId: priyaCollect.id,
        notes: `Collection ${priyaCollect.referenceNo}`,
        entryDate: daysAgo(18),
      },
    ],
  });

  // Extra overdue supplier bill for richer payables aging (90+)
  const bill4Date = daysAgo(120);
  const bill4Sub = 11800;
  const bill4Tax = Math.round(bill4Sub * 0.28 * 100) / 100;
  const bill4Total = Math.round((bill4Sub + bill4Tax) * 100) / 100;
  const bill4 = await prisma.purchaseBill.create({
    data: {
      tenantId: tenant.id,
      supplierId: exide.id,
      supplierName: exide.name,
      invoiceNumber: 'EXD/2025-26/2101',
      invoiceDate: bill4Date,
      dueDate: addDays(bill4Date, 15),
      paymentTermsDays: 15,
      gstin: exide.gstin,
      placeOfSupply: '27-Maharashtra',
      subtotal: bill4Sub,
      taxAmount: bill4Tax,
      cgstAmount: bill4Tax / 2,
      sgstAmount: bill4Tax / 2,
      igstAmount: 0,
      totalAmount: bill4Total,
      paidAmount: 0,
      status: 'POSTED',
      createdByUserId: owner?.id,
      notes: JSON.stringify({ source: 'seed', notes: 'Demo long-overdue payable' }),
      lines: {
        create: [
          {
            productId: batt.id,
            productName: batt.name,
            sku: batt.sku,
            quantity: 1,
            unitCost: 11800,
            lineTotal: 11800,
            hsnCode: '8507',
            gstRate: 28,
          },
        ],
      },
    },
  });

  const exideOutstandingFinal = Math.round((exideOutstanding + bill4Total) * 100) / 100;
  await prisma.supplier.update({
    where: { id: exide.id },
    data: { outstandingBalance: exideOutstandingFinal },
  });
  await prisma.supplierLedgerEntry.create({
    data: {
      tenantId: tenant.id,
      supplierId: exide.id,
      type: 'BILL',
      amount: bill4Total,
      balanceAfter: exideOutstandingFinal,
      billId: bill4.id,
      notes: `Purchase bill ${bill4.invoiceNumber}`,
      entryDate: bill4Date,
    },
  });

  // ─── Extra catalog coverage for every dashboard section ──────────
  const techHash = await bcrypt.hash('Tech@123', 10);
  const cashierHash = await bcrypt.hash('Cash@123', 10);

  const technician = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'tech@demo.retailsarathi.in' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId,
      email: 'tech@demo.retailsarathi.in',
      passwordHash: techHash,
      name: 'Amit Technician',
      role: 'TECHNICIAN',
    },
  });

  const cashier = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'cashier@demo.retailsarathi.in' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId,
      email: 'cashier@demo.retailsarathi.in',
      passwordHash: cashierHash,
      name: 'Sneha Cashier',
      role: 'CASHIER',
    },
  });

  // Second branch + stock transfer
  const andheri = await prisma.branch.upsert({
    where: { id: 'demo-branch-andheri' },
    update: {},
    create: {
      id: 'demo-branch-andheri',
      tenantId: tenant.id,
      name: 'Andheri Service Centre',
      address: 'MIDC Andheri East, Mumbai 400093',
      stateCode: '27',
      isDefault: false,
    },
  });

  await prisma.branchStock.createMany({
    data: [
      { tenantId: tenant.id, branchId, productId: batt.id, quantity: 4 },
      { tenantId: tenant.id, branchId, productId: inv.id, quantity: 2 },
      { tenantId: tenant.id, branchId: andheri.id, productId: batt.id, quantity: 2 },
      { tenantId: tenant.id, branchId: andheri.id, productId: screen.id, quantity: 3 },
    ],
    skipDuplicates: true,
  });

  await prisma.branchTransfer.create({
    data: {
      tenantId: tenant.id,
      fromBranchId: branchId,
      toBranchId: andheri.id,
      status: 'COMPLETED',
      notes: 'Demo transfer — batteries to Andheri',
      createdAt: daysAgo(7),
      completedAt: daysAgo(6),
      items: {
        create: [{ productId: batt.id, quantity: 2 }],
      },
    },
  });

  // Wholesale price lists
  const dealerList = await prisma.priceList.create({
    data: {
      tenantId: tenant.id,
      name: 'Dealer List',
      type: 'DEALER',
      isDefault: true,
      items: {
        create: [
          { productId: batt.id, price: 13200, minQty: 1 },
          { productId: batt.id, price: 12800, minQty: 5 },
          { productId: inv.id, price: 7200, minQty: 1 },
          { productId: cable.id, price: 380, minQty: 10 },
        ],
      },
    },
  });
  void dealerList;

  // Cash sale + credit note (returns)
  const cashSaleDate = daysAgo(3);
  const sCash = saleTotals(450, 2, 18);
  const cashInvoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: priya.id,
      invoiceNumber: 'INV-26-27-00010',
      type: 'TAX_INVOICE',
      status: 'FINALIZED',
      supplyType: 'INTRA_STATE',
      subtotal: sCash.taxable,
      totalCgst: sCash.cgst,
      totalSgst: sCash.sgst,
      totalIgst: 0,
      grandTotal: sCash.grand,
      notes: 'Demo cash sale',
      soldByUserId: cashier.id,
      createdAt: cashSaleDate,
      updatedAt: cashSaleDate,
      lines: {
        create: [
          {
            productId: cable.id,
            productName: cable.name,
            hsnCode: cable.hsnCode,
            quantity: 2,
            unitPrice: 450,
            gstRate: 18,
            cgst: sCash.cgst,
            sgst: sCash.sgst,
            igst: 0,
            taxableAmount: sCash.taxable,
            total: sCash.grand,
          },
        ],
      },
      payments: {
        create: [{ method: 'UPI', amount: sCash.grand, reference: 'UPI/DEMO/9911' }],
      },
    },
  });

  // Today's counter sales — so Overview "Today's Revenue" is non-zero on seed day
  const todaySale = saleTotals(14500, 1, 28);
  const todayCable = saleTotals(450, 3, 18);
  const todayInvoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: ramesh.id,
      invoiceNumber: 'INV-26-27-00011',
      type: 'TAX_INVOICE',
      status: 'FINALIZED',
      supplyType: 'INTRA_STATE',
      subtotal: todaySale.taxable,
      totalCgst: todaySale.cgst,
      totalSgst: todaySale.sgst,
      totalIgst: 0,
      grandTotal: todaySale.grand,
      notes: 'Demo sale — today (dashboard KPI)',
      soldByUserId: cashier.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: {
        create: [
          {
            productId: batt.id,
            productName: batt.name,
            hsnCode: batt.hsnCode,
            quantity: 1,
            unitPrice: 14500,
            gstRate: 28,
            cgst: todaySale.cgst,
            sgst: todaySale.sgst,
            igst: 0,
            taxableAmount: todaySale.taxable,
            total: todaySale.grand,
          },
        ],
      },
      payments: {
        create: [{ method: 'UPI', amount: todaySale.grand, reference: 'UPI/DEMO/TODAY1' }],
      },
    },
  });
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: priya.id,
      invoiceNumber: 'INV-26-27-00012',
      type: 'TAX_INVOICE',
      status: 'FINALIZED',
      supplyType: 'INTRA_STATE',
      subtotal: todayCable.taxable,
      totalCgst: todayCable.cgst,
      totalSgst: todayCable.sgst,
      totalIgst: 0,
      grandTotal: todayCable.grand,
      notes: 'Demo walk-in — today',
      soldByUserId: owner?.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: {
        create: [
          {
            productId: cable.id,
            productName: cable.name,
            hsnCode: cable.hsnCode,
            quantity: 3,
            unitPrice: 450,
            gstRate: 18,
            cgst: todayCable.cgst,
            sgst: todayCable.sgst,
            igst: 0,
            taxableAmount: todayCable.taxable,
            total: todayCable.grand,
          },
        ],
      },
      payments: {
        create: [{ method: 'CASH', amount: todayCable.grand, reference: 'CASH/TODAY' }],
      },
    },
  });
  void todayInvoice;

  // Stock ledger so Analytics stock-flow charts have movement
  await prisma.stockLedger.createMany({
    data: [
      {
        tenantId: tenant.id,
        productId: batt.id,
        type: 'PURCHASE',
        quantity: 6,
        notes: 'Seed opening stock',
        createdAt: daysAgo(20),
      },
      {
        tenantId: tenant.id,
        productId: inv.id,
        type: 'PURCHASE',
        quantity: 5,
        notes: 'Seed opening stock',
        createdAt: daysAgo(18),
      },
      {
        tenantId: tenant.id,
        productId: cable.id,
        type: 'PURCHASE',
        quantity: 40,
        notes: 'Seed opening stock',
        createdAt: daysAgo(15),
      },
      {
        tenantId: tenant.id,
        productId: batt.id,
        type: 'SALE',
        quantity: -1,
        notes: 'Seed sale',
        createdAt: daysAgo(12),
      },
      {
        tenantId: tenant.id,
        productId: cable.id,
        type: 'SALE',
        quantity: -2,
        notes: 'Seed sale',
        createdAt: daysAgo(3),
      },
      {
        tenantId: tenant.id,
        productId: batt.id,
        type: 'SALE',
        quantity: -1,
        notes: 'Seed sale today',
        createdAt: new Date(),
      },
      {
        tenantId: tenant.id,
        productId: cable.id,
        type: 'SALE',
        quantity: -3,
        notes: 'Seed sale today',
        createdAt: new Date(),
      },
      {
        tenantId: tenant.id,
        productId: inv.id,
        type: 'ADJUSTMENT',
        quantity: -1,
        notes: 'Seed stock-take variance',
        createdAt: daysAgo(3),
      },
    ],
  });

  const cnTotals = saleTotals(450, 1, 18);
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: priya.id,
      invoiceNumber: 'CN-26-27-00001',
      type: 'CREDIT_NOTE',
      status: 'FINALIZED',
      supplyType: 'INTRA_STATE',
      subtotal: cnTotals.taxable,
      totalCgst: cnTotals.cgst,
      totalSgst: cnTotals.sgst,
      totalIgst: 0,
      grandTotal: cnTotals.grand,
      notes: `Demo return against ${cashInvoice.invoiceNumber}`,
      soldByUserId: owner?.id,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      lines: {
        create: [
          {
            productId: cable.id,
            productName: cable.name,
            hsnCode: cable.hsnCode,
            quantity: 1,
            unitPrice: 450,
            gstRate: 18,
            cgst: cnTotals.cgst,
            sgst: cnTotals.sgst,
            igst: 0,
            taxableAmount: cnTotals.taxable,
            total: cnTotals.grand,
          },
        ],
      },
    },
  });

  // Repair service catalog (common services for quick estimate prefill at intake)
  const [screenReplacementIphone] = await Promise.all(
    [
      { name: 'Screen Replacement — iPhone', defaultPrice: 4200, typicalTurnaroundDays: 1 },
      { name: 'Screen Replacement — Android', defaultPrice: 2500, typicalTurnaroundDays: 1 },
      { name: 'Battery Replacement', defaultPrice: 800, typicalTurnaroundDays: 1 },
      { name: 'Charging Port Repair', defaultPrice: 600, typicalTurnaroundDays: 1 },
      { name: 'Water Damage Diagnosis & Repair', defaultPrice: 500, typicalTurnaroundDays: 3 },
      { name: 'Inverter / Battery MOSFET Repair', defaultPrice: 1200, typicalTurnaroundDays: 2 },
      { name: 'Software / OS Reinstall', defaultPrice: 300, typicalTurnaroundDays: 0 },
      { name: 'Speaker / Mic Replacement', defaultPrice: 500, typicalTurnaroundDays: 1 },
    ].map((svc) =>
      prisma.repairServiceType.create({ data: { tenantId: tenant.id, ...svc } }),
    ),
  );
  void screenReplacementIphone;

  // Repair jobs
  const repairReady = await prisma.repairJob.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: ramesh.id,
      technicianId: technician.id,
      jobNumber: 'RJ-26001',
      deviceModel: 'iPhone 13',
      imei: '353918101234567',
      issue: 'Cracked display — glass + LCD',
      accessories: 'Box, charger',
      status: 'READY',
      estimateAmount: 4500,
      finalAmount: 4800,
      warrantyDays: 90,
      customerApproved: true,
      receivedAt: daysAgo(5),
      notes: 'Demo ready for pickup',
      statusHistory: {
        create: [
          { status: 'RECEIVED', notes: 'Intake', createdAt: daysAgo(5) },
          { status: 'DIAGNOSED', notes: 'Display dead', createdAt: daysAgo(4) },
          { status: 'IN_REPAIR', notes: 'Part fitted', createdAt: daysAgo(2) },
          { status: 'READY', notes: 'QC OK', createdAt: daysAgo(1) },
        ],
      },
      partsUsed: {
        create: [{ productId: screen.id, quantity: 1, unitPrice: 4200 }],
      },
    },
  });

  await prisma.repairJob.create({
    data: {
      tenantId: tenant.id,
      branchId,
      customerId: mehta.id,
      technicianId: technician.id,
      jobNumber: 'RJ-26002',
      deviceModel: 'Luminous Zelio 1100',
      issue: 'Not charging battery — MOSFET check',
      status: 'IN_REPAIR',
      estimateAmount: 1200,
      receivedAt: daysAgo(2),
      notes: 'Demo in workshop',
      statusHistory: {
        create: [
          { status: 'RECEIVED', createdAt: daysAgo(2) },
          { status: 'IN_REPAIR', notes: 'Board open', createdAt: daysAgo(1) },
        ],
      },
    },
  });
  void repairReady;

  // Trade-ins
  await prisma.tradeIn.createMany({
    data: [
      {
        tenantId: tenant.id,
        customerId: priya.id,
        deviceModel: 'iPhone 11 64GB',
        imei: '353260101112223',
        condition: 'REFURB',
        quotedValue: 12000,
        finalValue: 11500,
        status: 'ACCEPTED',
        notes: 'Demo accepted buy-back',
      },
      {
        tenantId: tenant.id,
        customerId: ramesh.id,
        deviceModel: 'Redmi Note 10',
        condition: 'OPEN_BOX',
        quotedValue: 4500,
        status: 'QUOTED',
        notes: 'Demo quote pending',
      },
    ],
  });

  // Stock draft + open stock take
  await prisma.draftStockIn.create({
    data: {
      tenantId: tenant.id,
      supplierName: 'Shubh Traders',
      invoiceNumber: 'ST/DRAFT/99',
      invoiceDate: daysAgo(0).toISOString().slice(0, 10),
      gstin: shubh.gstin,
      status: 'OPEN',
      notes: 'Demo soft-saved stock-in',
      previewJson: {
        lines: [
          { name: 'Exide 150Ah Tall Tubular', qty: 2, rate: 11800, gstRate: 28 },
          { name: 'Unknown accessory pack', qty: 5, rate: 120, gstRate: 18 },
        ],
      },
    },
  });

  await prisma.stockTake.create({
    data: {
      tenantId: tenant.id,
      branchId,
      status: 'OPEN',
      notes: 'Demo open cycle count',
      lines: {
        create: [
          { productId: cable.id, systemQty: 40, countedQty: null },
          { productId: phone.id, systemQty: 2, countedQty: 2 },
        ],
      },
    },
  });

  await prisma.supplierProductAlias.create({
    data: {
      tenantId: tenant.id,
      supplierId: exide.id,
      supplierName: exide.name,
      aliasName: 'EXIDE IT500 150AH',
      aliasKey: 'exide it500 150ah',
      productId: batt.id,
      hsnCode: '8507',
    },
  });

  // Hardware
  await prisma.hardwareConfig.createMany({
    data: [
      {
        tenantId: tenant.id,
        branchId,
        deviceType: 'THERMAL_PRINTER',
        name: 'Counter Epson TM-T82',
        settings: { width: 80, connection: 'USB', paperCut: true },
        isActive: true,
      },
      {
        tenantId: tenant.id,
        branchId,
        deviceType: 'BARCODE_SCANNER',
        name: 'Honeywell Voyager 1250g',
        settings: { mode: 'HID', beep: true },
        isActive: true,
      },
      {
        tenantId: tenant.id,
        branchId: andheri.id,
        deviceType: 'CASH_DRAWER',
        name: 'Andheri Drawer',
        settings: { kickCode: 'ESC p' },
        isActive: false,
      },
    ],
  });

  // E-commerce
  const flipkart = await prisma.ecommerceChannel.create({
    data: {
      tenantId: tenant.id,
      platform: 'FLIPKART',
      name: 'Flipkart Seller Hub',
      credentials: { sellerId: 'DEMO-FK-001', sandbox: true },
      isActive: true,
      lastSyncAt: daysAgo(1),
    },
  });
  const meesho = await prisma.ecommerceChannel.create({
    data: {
      tenantId: tenant.id,
      platform: 'MEESHO',
      name: 'Meesho Store',
      credentials: { sandbox: true },
      isActive: true,
      lastSyncAt: daysAgo(2),
    },
  });
  await prisma.ecommerceOrder.createMany({
    data: [
      {
        channelId: flipkart.id,
        externalId: 'FK-ORD-90011',
        status: 'IMPORTED',
        customerName: 'Online Buyer A',
        totalAmount: 7800,
        payload: { sku: 'INV-LUM-1100', qty: 1 },
      },
      {
        channelId: flipkart.id,
        externalId: 'FK-ORD-90012',
        status: 'FULFILLED',
        customerName: 'Online Buyer B',
        totalAmount: 450,
        payload: { sku: 'CAB-DC-10', qty: 1 },
      },
      {
        channelId: meesho.id,
        externalId: 'MS-44102',
        status: 'IMPORTED',
        customerName: 'Meesho Customer',
        totalAmount: 14500,
        payload: { sku: 'BAT-EX-150', qty: 1 },
      },
    ],
  });

  // Staff attendance + commission
  await prisma.staffAttendance.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: cashier.id,
        branchId,
        checkIn: daysAgo(0),
        checkOut: null,
        notes: 'On counter',
      },
      {
        tenantId: tenant.id,
        userId: technician.id,
        branchId,
        checkIn: daysAgo(1),
        checkOut: daysAgo(1),
        notes: 'Full day workshop',
      },
    ],
  });
  await prisma.staffCommission.create({
    data: {
      tenantId: tenant.id,
      userId: cashier.id,
      periodStart: daysAgo(30),
      periodEnd: daysAgo(0),
      salesTotal: 25000,
      repairTotal: 0,
      commissionPct: 2,
      commissionAmt: 500,
    },
  });

  // Bank reconcile lines
  await prisma.bankStatementLine.createMany({
    data: [
      {
        tenantId: tenant.id,
        importBatchId: 'seed-batch-1',
        txnDate: daysAgo(8),
        description: 'UPI/PRIYA SHAH/Collect',
        amount: 10620,
        utr: 'UTRDEMO0001',
        status: 'UNMATCHED',
      },
      {
        tenantId: tenant.id,
        importBatchId: 'seed-batch-1',
        txnDate: daysAgo(10),
        description: 'NEFT to Exide Care',
        amount: -10000,
        utr: 'UTRDEMO0002',
        status: 'UNMATCHED',
      },
      {
        tenantId: tenant.id,
        importBatchId: 'seed-batch-1',
        txnDate: daysAgo(15),
        description: 'Cash deposit Lamington',
        amount: 5000,
        status: 'IGNORED',
      },
    ],
  });

  // GSTR-2B sample
  await prisma.gstr2bImport.create({
    data: {
      tenantId: tenant.id,
      period: '082026',
      source: 'CSV',
      lines: {
        create: [
          {
            supplierGstin: exide.gstin,
            supplierName: exide.name,
            invoiceNumber: 'EXD/2026-27/1042',
            invoiceDate: daysAgo(5),
            taxableValue: 23600,
            cgst: 3304,
            sgst: 3304,
            igst: 0,
            totalAmount: 30208,
            matchStatus: 'MATCHED',
            matchedPurchaseBillId: bill1.id,
          },
          {
            supplierGstin: '27ZZZZZ9999Z1Z5',
            supplierName: 'Unknown Vendor Pvt Ltd',
            invoiceNumber: 'UV/778',
            invoiceDate: daysAgo(9),
            taxableValue: 5000,
            cgst: 450,
            sgst: 450,
            igst: 0,
            totalAmount: 5900,
            matchStatus: 'UNMATCHED',
            notes: 'Demo unmatched 2B line',
          },
        ],
      },
    },
  });

  // Accounting journals
  const cashAcct = await prisma.account.findFirst({ where: { tenantId: tenant.id, code: '1000' } });
  const salesAcct = await prisma.account.findFirst({ where: { tenantId: tenant.id, code: '4000' } });
  const bankAcct = await prisma.account.findFirst({ where: { tenantId: tenant.id, code: '1100' } });
  const rentAcct = await prisma.account.findFirst({ where: { tenantId: tenant.id, code: '5100' } });
  if (cashAcct && salesAcct && bankAcct && rentAcct) {
    await prisma.journalEntry.createMany({
      data: [
        {
          tenantId: tenant.id,
          date: daysAgo(3),
          description: 'Demo cash sales posting',
          debitAccountId: cashAcct.id,
          creditAccountId: salesAcct.id,
          amount: sCash.grand,
          referenceType: 'INVOICE',
          referenceId: cashInvoice.id,
        },
        {
          tenantId: tenant.id,
          date: daysAgo(10),
          description: 'Shop rent — August',
          debitAccountId: rentAcct.id,
          creditAccountId: bankAcct.id,
          amount: 35000,
          referenceType: 'EXPENSE',
        },
      ],
    });
  }

  // AI insights queue
  await prisma.aiAgentAction.createMany({
    data: [
      {
        tenantId: tenant.id,
        type: 'REORDER',
        title: 'Reorder Amaron 100Ah — out of stock',
        payload: { sku: 'BAT-AM-100', suggestedQty: 4, reason: '0 stock + sales velocity' },
        status: 'PENDING',
      },
      {
        tenantId: tenant.id,
        type: 'PRICE_CHECK',
        title: 'Dealer margin thin on Luminous Zelio',
        payload: { sku: 'INV-LUM-1100', currentMarginPct: 12 },
        status: 'APPROVED',
      },
    ],
  });

  // Subscription plan + tenant sub
  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { code: 'PRO' },
    update: {},
    create: {
      code: 'PRO',
      name: 'Pro',
      priceMonthly: 999,
      maxUsers: 10,
      maxProducts: 5000,
      maxBranches: 5,
      features: ['multi-branch', 'ecommerce', 'ai'],
    },
  });
  await prisma.tenantSubscription.upsert({
    where: { tenantId: tenant.id },
    update: { planId: proPlan.id, status: 'TRIAL' },
    create: {
      tenantId: tenant.id,
      planId: proPlan.id,
      status: 'TRIAL',
      trialEndsAt: addDays(new Date(), 14),
      currentPeriodEnd: addDays(new Date(), 14),
    },
  });

  await prisma.supportTicket.create({
    data: {
      tenantId: tenant.id,
      subject: 'Need help with GSTR-1 export',
      body: 'Demo ticket — how do I download JSON for portal upload?',
      status: 'OPEN',
      priority: 'normal',
    },
  });

  // Platform admin for /admin
  await prisma.platformAdmin.upsert({
    where: { email: 'admin@retailsarathi.in' },
    update: {},
    create: {
      email: 'admin@retailsarathi.in',
      passwordHash: await bcrypt.hash('Admin@123', 10),
      name: 'Platform Admin',
    },
  });

  console.log('Seed complete!');
  console.log(
    `Shop: Demo Power Solutions — Khata ready · receivables ₹${(rameshOut + mehtaOut).toFixed(0)} · payables ₹${(
      exideOutstandingFinal + shubhOutstanding
    ).toFixed(0)}.`,
  );
  console.log(
    `Customers: ${ramesh.name} (open), ${mehta.name} (aging + partial), ${priya.name} (cleared).`,
  );
  console.log('Suppliers: Exide (open + overdue), Shubh Traders (partial).');
  console.log('Also seeded: repairs, trade-in, wholesale, ecommerce, hardware, staff, bank, GSTR-2B, AI, branches.');
  console.log('Login: owner@demo.retailsarathi.in / Demo@123');
  console.log('Staff: cashier@demo.retailsarathi.in / Cash@123 · tech@demo.retailsarathi.in / Tech@123');
  console.log('Admin: admin@retailsarathi.in / Admin@123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
