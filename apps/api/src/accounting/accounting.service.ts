import { Injectable } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { mergeLedgerSettings } from '@retail-sarathi/gst-engine';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalEntryDto, CreateAccountDto } from './dto/accounting.dto';

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash & Bank', type: 'ASSET' as AccountType },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET' as AccountType },
  { code: '1200', name: 'Inventory', type: 'ASSET' as AccountType },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' as AccountType },
  { code: '3000', name: 'Owner Equity', type: 'EQUITY' as AccountType },
  { code: '4000', name: 'Sales Revenue', type: 'INCOME' as AccountType },
  { code: '4100', name: 'Repair Service Income', type: 'INCOME' as AccountType },
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' as AccountType },
  { code: '5100', name: 'Operating Expenses', type: 'EXPENSE' as AccountType },
];

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  async getAccounts(tenantId: string) {
    return this.prisma.account.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  async createAccount(tenantId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        type: dto.type as AccountType,
      },
    });
  }

  async seedDefaultAccounts(tenantId: string) {
    const existing = await this.prisma.account.count({ where: { tenantId } });
    if (existing > 0) return this.getAccounts(tenantId);

    await this.prisma.account.createMany({
      data: DEFAULT_ACCOUNTS.map((a) => ({ tenantId, ...a })),
    });
    return this.getAccounts(tenantId);
  }

  async createJournalEntry(tenantId: string, dto: CreateJournalEntryDto) {
    return this.prisma.journalEntry.create({
      data: {
        tenantId,
        date: new Date(dto.date),
        description: dto.description,
        debitAccountId: dto.debitAccountId,
        creditAccountId: dto.creditAccountId,
        amount: dto.amount,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
      },
      include: { debitAccount: true, creditAccount: true },
    });
  }

  async getJournalEntries(tenantId: string, from?: string, to?: string) {
    return this.prisma.journalEntry.findMany({
      where: {
        tenantId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: { debitAccount: true, creditAccount: true },
      orderBy: { date: 'desc' },
    });
  }

  async getProfitAndLoss(tenantId: string, from: string, to: string) {
    const entries = await this.getJournalEntries(tenantId, from, to);
    const income: Record<string, number> = {};
    const expenses: Record<string, number> = {};

    for (const e of entries) {
      const amount = Number(e.amount);
      if (e.creditAccount.type === 'INCOME') {
        income[e.creditAccount.name] = (income[e.creditAccount.name] ?? 0) + amount;
      }
      // A debit to an income account is a reversal (e.g. cancelling an invoice reverses its
      // auto-posted sale) — net it out, or a cancelled sale would stay counted as income forever.
      if (e.debitAccount.type === 'INCOME') {
        income[e.debitAccount.name] = (income[e.debitAccount.name] ?? 0) - amount;
      }
      if (e.debitAccount.type === 'EXPENSE') {
        expenses[e.debitAccount.name] = (expenses[e.debitAccount.name] ?? 0) + amount;
      }
      // Symmetric case: a credit to an expense account reverses a prior expense.
      if (e.creditAccount.type === 'EXPENSE') {
        expenses[e.creditAccount.name] = (expenses[e.creditAccount.name] ?? 0) - amount;
      }
    }

    const totalIncome = Object.values(income).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(expenses).reduce((s, v) => s + v, 0);

    return {
      period: { from, to },
      income,
      expenses,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
    };
  }

  async getBalanceSheet(tenantId: string, asOf: string) {
    const accounts = await this.getAccounts(tenantId);
    const entries = await this.getJournalEntries(tenantId, undefined, asOf);

    const balances: Record<string, number> = {};
    for (const a of accounts) balances[a.name] = 0;

    for (const e of entries) {
      balances[e.debitAccount.name] = (balances[e.debitAccount.name] ?? 0) + Number(e.amount);
      balances[e.creditAccount.name] = (balances[e.creditAccount.name] ?? 0) - Number(e.amount);
    }

    const assets = accounts.filter((a) => a.type === 'ASSET').map((a) => ({
      name: a.name,
      balance: balances[a.name] ?? 0,
    }));
    const liabilities = accounts.filter((a) => a.type === 'LIABILITY').map((a) => ({
      name: a.name,
      balance: Math.abs(balances[a.name] ?? 0),
    }));
    const equity = accounts.filter((a) => a.type === 'EQUITY').map((a) => ({
      name: a.name,
      balance: Math.abs(balances[a.name] ?? 0),
    }));

    return { asOf, assets, liabilities, equity };
  }

  async getItrPrepSummary(tenantId: string, financialYear: string) {
    const [startYear] = financialYear.split('-').map(Number);
    const from = `${startYear}-04-01`;
    const to = `${startYear + 1}-03-31`;

    const pnl = await this.getProfitAndLoss(tenantId, from, to);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'FINALIZED',
        createdAt: { gte: new Date(from), lte: new Date(to) },
      },
    });

    const taxInvoices = invoices.filter((i) => i.type === 'TAX_INVOICE');
    const creditNotes = invoices.filter((i) => i.type === 'CREDIT_NOTE');
    const grossSales = taxInvoices.reduce((s, i) => s + Number(i.grandTotal), 0);
    const returnsTotal = creditNotes.reduce((s, i) => s + Number(i.grandTotal), 0);
    const processingFeesRetained = creditNotes.reduce(
      (s, i) => s + Number(i.processingFee ?? 0),
      0,
    );
    const grossTurnover = grossSales - returnsTotal;

    const purchaseBills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        OR: [
          { invoiceDate: { gte: new Date(from), lte: new Date(to) } },
          {
            AND: [
              { invoiceDate: null },
              { createdAt: { gte: new Date(from), lte: new Date(to) } },
            ],
          },
        ],
      },
    });
    const purchaseTotal = purchaseBills.reduce((s, b) => s + Number(b.totalAmount), 0);
    const purchaseTax = purchaseBills.reduce((s, b) => s + Number(b.taxAmount), 0);

    return {
      financialYear,
      grossTurnover,
      grossSales,
      returnsTotal,
      processingFeesRetained,
      creditNoteCount: creditNotes.length,
      purchaseTotal,
      purchaseTax,
      purchaseBillCount: purchaseBills.length,
      totalExpenses: pnl.totalExpenses,
      netProfit: pnl.netProfit,
      depreciation: 0,
      presumptiveEligible: grossTurnover <= 20000000,
      presumptiveRate: grossTurnover <= 20000000 ? 0.06 : undefined,
      itrNote:
        'Net turnover = tax invoices minus credit notes. Keep original invoices and credit notes for ITR/GST audit. Purchase register is included for books/CA.',
      disclaimer:
        'This is a preparation summary only. Consult a Chartered Accountant for ITR filing.',
      exportFormats: ['CSV', 'Tally XML', 'JSON'],
      reportsLinks: {
        sell: `/reports/sell?fy=${financialYear}`,
        buy: `/reports/buy?fy=${financialYear}`,
        itrPack: `/reports/itr-pack?fy=${financialYear}`,
      },
    };
  }

  async exportItrCsv(tenantId: string, financialYear: string) {
    const summary = await this.getItrPrepSummary(tenantId, financialYear);
    const rows = [
      'Field,Value',
      `Financial Year,${summary.financialYear}`,
      `Gross Turnover,${summary.grossTurnover}`,
      `Gross Sales,${summary.grossSales}`,
      `Returns,${summary.returnsTotal}`,
      `Purchase Total,${summary.purchaseTotal}`,
      `Purchase Tax,${summary.purchaseTax}`,
      `Purchase Bills,${summary.purchaseBillCount}`,
      `Total Expenses,${summary.totalExpenses}`,
      `Net Profit,${summary.netProfit}`,
      `Presumptive Eligible,${summary.presumptiveEligible}`,
    ];
    return rows.join('\n');
  }

  async exportTallyXml(tenantId: string, financialYear: string) {
    const [startYear] = financialYear.split('-').map(Number);
    const from = `${startYear}-04-01`;
    const to = `${startYear + 1}-03-31`;
    const entries = await this.getJournalEntries(tenantId, from, to);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    const vouchers = entries
      .map(
        (e) => `
    <VOUCHER VCHTYPE="Journal" DATE="${e.date.toISOString().slice(0, 10).replace(/-/g, '')}" VOUCHERNUMBER="${e.id.slice(-6)}">
      <NARRATION>${this.escapeXml(e.description)}</NARRATION>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${this.escapeXml(e.debitAccount.name)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>-${Number(e.amount).toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${this.escapeXml(e.creditAccount.name)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${Number(e.amount).toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>`,
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><COMPANYNAME>${this.escapeXml(tenant?.name ?? 'RetailSarathi')}</COMPANYNAME></REQUESTDESC>
      <REQUESTDATA>${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async autoPostSaleIfEnabled(
    tenantId: string,
    invoiceId: string,
    split: { cashAmount: number; creditAmount: number },
  ) {
    const settings = await this.getLedgerSettings(tenantId);
    if (!settings.autoPostSales) return null;
    if (settings.seedAccountsOnFirstSale) {
      await this.seedDefaultAccounts(tenantId);
    }
    return this.autoPostSale(tenantId, invoiceId, split);
  }

  async reverseSaleIfEnabled(
    tenantId: string,
    invoiceId: string,
    split: { cashAmount: number; creditAmount: number },
  ) {
    const settings = await this.getLedgerSettings(tenantId);
    if (!settings.autoPostCreditNotes) return null;
    return this.reverseSale(tenantId, invoiceId, split);
  }

  private async getLedgerSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ledgerSettings: true },
    });
    return mergeLedgerSettings(tenant?.ledgerSettings);
  }

  /**
   * A sale paid partly or fully on credit (udhaar) never receives cash at the time of
   * sale — debiting Cash for the full grand total (as if it were all collected) would
   * overstate Cash in Hand. The credit-extended portion debits Accounts Receivable
   * instead; the later collection (autoPostCollectionIfEnabled) credits it back down.
   */
  async autoPostSale(
    tenantId: string,
    invoiceId: string,
    split: { cashAmount: number; creditAmount: number },
  ) {
    const map = await this.accountsByCode(tenantId, ['1000', '1100', '4000']);
    const cashAccount = map.get('1000');
    const arAccount = map.get('1100');
    const salesAccount = map.get('4000');
    if (!salesAccount || !cashAccount) return null;

    const date = new Date().toISOString().split('T')[0];
    const entries = [];
    if (split.cashAmount > 0.009) {
      entries.push(
        await this.createJournalEntry(tenantId, {
          date,
          description: `Auto-post sale invoice ${invoiceId}`,
          debitAccountId: cashAccount.id,
          creditAccountId: salesAccount.id,
          amount: split.cashAmount,
          referenceType: 'invoice',
          referenceId: invoiceId,
        }),
      );
    }
    if (split.creditAmount > 0.009 && arAccount) {
      entries.push(
        await this.createJournalEntry(tenantId, {
          date,
          description: `Auto-post sale invoice ${invoiceId} (credit extended)`,
          debitAccountId: arAccount.id,
          creditAccountId: salesAccount.id,
          amount: split.creditAmount,
          referenceType: 'invoice',
          referenceId: invoiceId,
        }),
      );
    }
    return entries;
  }

  /** Reverse a prior auto-posted sale (cancel) — mirrors whatever cash/credit split it was posted with. */
  async reverseSale(
    tenantId: string,
    invoiceId: string,
    split: { cashAmount: number; creditAmount: number },
  ) {
    const map = await this.accountsByCode(tenantId, ['1000', '1100', '4000']);
    const cashAccount = map.get('1000');
    const arAccount = map.get('1100');
    const salesAccount = map.get('4000');
    if (!salesAccount || !cashAccount) return null;

    const date = new Date().toISOString().split('T')[0];
    const entries = [];
    if (split.cashAmount > 0.009) {
      entries.push(
        await this.createJournalEntry(tenantId, {
          date,
          description: `Reverse cancelled invoice ${invoiceId}`,
          debitAccountId: salesAccount.id,
          creditAccountId: cashAccount.id,
          amount: split.cashAmount,
          referenceType: 'invoice_cancel',
          referenceId: invoiceId,
        }),
      );
    }
    if (split.creditAmount > 0.009 && arAccount) {
      entries.push(
        await this.createJournalEntry(tenantId, {
          date,
          description: `Reverse cancelled invoice ${invoiceId} (credit extended)`,
          debitAccountId: salesAccount.id,
          creditAccountId: arAccount.id,
          amount: split.creditAmount,
          referenceType: 'invoice_cancel',
          referenceId: invoiceId,
        }),
      );
    }
    return entries;
  }

  private async accountsByCode(tenantId: string, codes: string[]) {
    await this.seedDefaultAccounts(tenantId);
    const rows = await this.prisma.account.findMany({
      where: { tenantId, code: { in: codes } },
    });
    const map = new Map(rows.map((a) => [a.code, a]));
    return map;
  }

  /** Customer collection: Dr Cash/Bank (1000) · Cr AR (1100) */
  async autoPostCollectionIfEnabled(
    tenantId: string,
    paymentId: string,
    amount: number,
    opts?: { description?: string },
  ) {
    const settings = await this.getLedgerSettings(tenantId);
    if (!settings.autoPostCollections) return null;
    if (!(amount > 0.009)) return null;
    const map = await this.accountsByCode(tenantId, ['1000', '1100']);
    const cash = map.get('1000');
    const ar = map.get('1100');
    if (!cash || !ar) return null;
    return this.createJournalEntry(tenantId, {
      date: new Date().toISOString().split('T')[0],
      description: opts?.description || `Customer collection ${paymentId}`,
      debitAccountId: cash.id,
      creditAccountId: ar.id,
      amount,
      referenceType: 'customer_payment',
      referenceId: paymentId,
    });
  }

  /** Void collection: Dr AR · Cr Cash */
  async reverseCollectionIfEnabled(
    tenantId: string,
    paymentId: string,
    amount: number,
  ) {
    const settings = await this.getLedgerSettings(tenantId);
    if (!settings.autoPostCollections) return null;
    if (!(amount > 0.009)) return null;
    const map = await this.accountsByCode(tenantId, ['1000', '1100']);
    const cash = map.get('1000');
    const ar = map.get('1100');
    if (!cash || !ar) return null;
    return this.createJournalEntry(tenantId, {
      date: new Date().toISOString().split('T')[0],
      description: `Void customer collection ${paymentId}`,
      debitAccountId: ar.id,
      creditAccountId: cash.id,
      amount,
      referenceType: 'customer_payment_void',
      referenceId: paymentId,
    });
  }

  /** Supplier payment: Dr AP (2000) · Cr Cash (1000) for cash out amount */
  async autoPostSupplierPaymentIfEnabled(
    tenantId: string,
    paymentId: string,
    amount: number,
    opts?: { description?: string },
  ) {
    const settings = await this.getLedgerSettings(tenantId);
    if (!settings.autoPostPayables) return null;
    if (!(amount > 0.009)) return null;
    const map = await this.accountsByCode(tenantId, ['1000', '2000']);
    const cash = map.get('1000');
    const ap = map.get('2000');
    if (!cash || !ap) return null;
    return this.createJournalEntry(tenantId, {
      date: new Date().toISOString().split('T')[0],
      description: opts?.description || `Supplier payment ${paymentId}`,
      debitAccountId: ap.id,
      creditAccountId: cash.id,
      amount,
      referenceType: 'supplier_payment',
      referenceId: paymentId,
    });
  }

  /** Void/bounce supplier payment: Dr Cash · Cr AP */
  async reverseSupplierPaymentIfEnabled(
    tenantId: string,
    paymentId: string,
    amount: number,
    reason = 'void',
  ) {
    const settings = await this.getLedgerSettings(tenantId);
    if (!settings.autoPostPayables) return null;
    if (!(amount > 0.009)) return null;
    const map = await this.accountsByCode(tenantId, ['1000', '2000']);
    const cash = map.get('1000');
    const ap = map.get('2000');
    if (!cash || !ap) return null;
    return this.createJournalEntry(tenantId, {
      date: new Date().toISOString().split('T')[0],
      description: `Supplier payment ${reason} ${paymentId}`,
      debitAccountId: cash.id,
      creditAccountId: ap.id,
      amount,
      referenceType: `supplier_payment_${reason}`,
      referenceId: paymentId,
    });
  }

  /** Purchase bill posted: Dr Inventory (1200) · Cr AP (2000) */
  async autoPostPurchaseBillIfEnabled(
    tenantId: string,
    billId: string,
    amount: number,
  ) {
    const settings = await this.getLedgerSettings(tenantId);
    if (!settings.autoPostPayables) return null;
    if (!(amount > 0.009)) return null;
    const map = await this.accountsByCode(tenantId, ['1200', '2000']);
    const inv = map.get('1200');
    const ap = map.get('2000');
    if (!inv || !ap) return null;
    return this.createJournalEntry(tenantId, {
      date: new Date().toISOString().split('T')[0],
      description: `Purchase bill ${billId}`,
      debitAccountId: inv.id,
      creditAccountId: ap.id,
      amount,
      referenceType: 'purchase_bill',
      referenceId: billId,
    });
  }

  async getBankFeedUrl(tenantId: string): Promise<string | undefined> {
    const settings = await this.getLedgerSettings(tenantId);
    return settings.bankFeedUrl || process.env.BANK_FEED_URL?.trim() || undefined;
  }
}
