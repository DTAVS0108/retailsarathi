import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class BankReconcileService {
  constructor(private prisma: PrismaService) {}

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  /** Parse simple CSV: date,description,amount[,utr][,chequeNo] */
  parseCsv(text: string): Array<{
    txnDate: Date;
    description: string;
    amount: number;
    utr?: string;
    chequeNo?: string;
  }> {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return [];
    const start = /date|txn|value/i.test(lines[0]) ? 1 : 0;
    const rows = [];
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 3) continue;
      const txnDate = new Date(cols[0]);
      if (Number.isNaN(txnDate.getTime())) continue;
      const amount = Number(cols[2].replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(amount) || amount === 0) continue;
      rows.push({
        txnDate,
        description: cols[1] || '',
        amount: this.round2(amount),
        utr: cols[3] || undefined,
        chequeNo: cols[4] || undefined,
      });
    }
    return rows;
  }

  async importCsv(tenantId: string, csvText: string) {
    const rows = this.parseCsv(csvText);
    if (!rows.length) throw new BadRequestException('No valid CSV rows found');
    const batchId = randomUUID();
    const created = await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.bankStatementLine.create({
          data: {
            tenantId,
            importBatchId: batchId,
            txnDate: r.txnDate,
            description: r.description,
            amount: Math.abs(r.amount),
            utr: r.utr || null,
            chequeNo: r.chequeNo || null,
            rawJson: r as object,
            status: 'UNMATCHED',
          },
        }),
      ),
    );
    return { importBatchId: batchId, count: created.length, items: created };
  }

  list(tenantId: string, status?: string) {
    const st = (status || 'UNMATCHED').toUpperCase();
    return this.prisma.bankStatementLine.findMany({
      where: {
        tenantId,
        ...(st === 'ALL' ? {} : { status: st as 'UNMATCHED' | 'MATCHED' | 'IGNORED' }),
      },
      orderBy: [{ txnDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        matchedSupplierPayment: { include: { supplier: { select: { id: true, name: true } } } },
        matchedCustomerPayment: { include: { customer: { select: { id: true, name: true } } } },
      },
      take: 200,
    });
  }

  async suggest(tenantId: string, lineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } });
    if (!line) throw new NotFoundException('Statement line not found');
    const amount = Number(line.amount);
    const dayFrom = new Date(line.txnDate);
    dayFrom.setDate(dayFrom.getDate() - 3);
    const dayTo = new Date(line.txnDate);
    dayTo.setDate(dayTo.getDate() + 3);

    const supplierHits = await this.prisma.supplierPayment.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        amount: amount,
        paymentDate: { gte: dayFrom, lte: dayTo },
        ...(line.utr
          ? { referenceNo: { contains: line.utr, mode: 'insensitive' } }
          : {}),
      },
      include: { supplier: { select: { id: true, name: true } } },
      take: 10,
    });

    const byUtr = line.utr
      ? await this.prisma.supplierPayment.findMany({
          where: {
            tenantId,
            status: 'POSTED',
            referenceNo: { contains: line.utr, mode: 'insensitive' },
          },
          include: { supplier: { select: { id: true, name: true } } },
          take: 10,
        })
      : [];

    const customerHits = await this.prisma.customerPayment.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        amount,
        paymentDate: { gte: dayFrom, lte: dayTo },
      },
      include: { customer: { select: { id: true, name: true } } },
      take: 10,
    });

    const seen = new Set<string>();
    const supplierPayments = [...byUtr, ...supplierHits].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return { line, suggestions: { supplierPayments, customerPayments: customerHits } };
  }

  async match(
    tenantId: string,
    lineId: string,
    body: { supplierPaymentId?: string; customerPaymentId?: string },
  ) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } });
    if (!line) throw new NotFoundException('Statement line not found');
    if (line.status === 'MATCHED') throw new BadRequestException('Already matched');
    if (!body.supplierPaymentId && !body.customerPaymentId) {
      throw new BadRequestException('Provide supplierPaymentId or customerPaymentId');
    }
    if (body.supplierPaymentId) {
      const p = await this.prisma.supplierPayment.findFirst({
        where: { id: body.supplierPaymentId, tenantId },
      });
      if (!p) throw new NotFoundException('Supplier payment not found');
    }
    if (body.customerPaymentId) {
      const p = await this.prisma.customerPayment.findFirst({
        where: { id: body.customerPaymentId, tenantId },
      });
      if (!p) throw new NotFoundException('Customer payment not found');
    }
    return this.prisma.bankStatementLine.update({
      where: { id: lineId },
      data: {
        status: 'MATCHED',
        matchedAt: new Date(),
        matchedSupplierPaymentId: body.supplierPaymentId || null,
        matchedCustomerPaymentId: body.customerPaymentId || null,
      },
    });
  }

  async ignore(tenantId: string, lineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } });
    if (!line) throw new NotFoundException('Statement line not found');
    return this.prisma.bankStatementLine.update({
      where: { id: lineId },
      data: { status: 'IGNORED', matchedAt: null, matchedSupplierPaymentId: null, matchedCustomerPaymentId: null },
    });
  }

  /** Auto-match unmatched lines by exact UTR / referenceNo, then amount+date. */
  async autoMatchUnmatched(tenantId: string) {
    const lines = await this.prisma.bankStatementLine.findMany({
      where: { tenantId, status: 'UNMATCHED' },
      take: 200,
    });
    let matched = 0;
    for (const line of lines) {
      const suggestion = await this.suggest(tenantId, line.id);
      const utrHit = line.utr
        ? suggestion.suggestions.supplierPayments.find(
            (p) =>
              p.referenceNo &&
              line.utr &&
              p.referenceNo.toLowerCase().includes(line.utr.toLowerCase()),
          )
        : null;
      const supplier =
        utrHit ||
        (suggestion.suggestions.supplierPayments.length === 1
          ? suggestion.suggestions.supplierPayments[0]
          : null);
      const customer =
        !supplier && suggestion.suggestions.customerPayments.length === 1
          ? suggestion.suggestions.customerPayments[0]
          : null;
      if (supplier) {
        await this.match(tenantId, line.id, { supplierPaymentId: supplier.id });
        matched += 1;
      } else if (customer) {
        await this.match(tenantId, line.id, { customerPaymentId: customer.id });
        matched += 1;
      }
    }
    return { scanned: lines.length, matched };
  }

  /**
   * Live-ish feed: fetch CSV/JSON from tenant ledgerSettings.bankFeedUrl or BANK_FEED_URL / body.feedUrl,
   * import rows, then auto-match.
   */
  async syncFromFeed(tenantId: string, feedUrlOverride?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ledgerSettings: true },
    });
    const settings =
      tenant?.ledgerSettings && typeof tenant.ledgerSettings === 'object'
        ? (tenant.ledgerSettings as Record<string, unknown>)
        : {};
    const feedUrl =
      (feedUrlOverride || '').trim() ||
      (typeof settings.bankFeedUrl === 'string' ? settings.bankFeedUrl.trim() : '') ||
      process.env.BANK_FEED_URL?.trim() ||
      '';
    if (!feedUrl) {
      throw new BadRequestException(
        'No bank feed URL. Set ledgerSettings.bankFeedUrl, BANK_FEED_URL, or pass feedUrl.',
      );
    }

    const res = await fetch(feedUrl, {
      headers: {
        Authorization: process.env.BANK_FEED_TOKEN
          ? `Bearer ${process.env.BANK_FEED_TOKEN}`
          : '',
      },
    });
    if (!res.ok) {
      throw new BadRequestException(`Bank feed HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    let csvText = text;
    if (contentType.includes('json') || text.trim().startsWith('[') || text.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : parsed.transactions || parsed.items || [];
        csvText = [
          'date,description,amount,utr,chequeNo',
          ...rows.map((r: Record<string, unknown>) =>
            [
              r.date || r.txnDate || r.valueDate || '',
              `"${String(r.description || r.narration || '').replace(/"/g, '')}"`,
              r.amount ?? r.txnAmount ?? '',
              r.utr || r.reference || r.ref || '',
              r.chequeNo || r.cheque || '',
            ].join(','),
          ),
        ].join('\n');
      } catch {
        /* treat as CSV */
      }
    }

    const imported = await this.importCsv(tenantId, csvText);
    const auto = await this.autoMatchUnmatched(tenantId);
    return {
      feedUrl,
      imported: imported.count,
      importBatchId: imported.importBatchId,
      autoMatched: auto.matched,
      unmatchedScanned: auto.scanned,
    };
  }

  /**
   * Account Aggregator MVP: store consent + feed URL in ledgerSettings.
   * Real AA (Setu/Finvu) plugs in via AA_FEED_URL template or body.feedUrl.
   */
  async connectAccountAggregator(
    tenantId: string,
    body: { provider?: string; consentId?: string; feedUrl?: string; accountMask?: string },
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ledgerSettings: true },
    });
    const settings =
      tenant?.ledgerSettings && typeof tenant.ledgerSettings === 'object'
        ? { ...(tenant.ledgerSettings as Record<string, unknown>) }
        : {};
    const provider = (body.provider || 'generic').trim();
    const consentId = (body.consentId || randomUUID()).trim();
    const feedUrl =
      (body.feedUrl || '').trim() ||
      (process.env.AA_FEED_URL || '').trim().replace('{consentId}', consentId) ||
      (typeof settings.bankFeedUrl === 'string' ? settings.bankFeedUrl : '') ||
      '';
    settings.aa = {
      provider,
      consentId,
      accountMask: body.accountMask || null,
      connectedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };
    if (feedUrl) settings.bankFeedUrl = feedUrl;
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { ledgerSettings: settings as object },
    });
    return { ok: true, aa: settings.aa, bankFeedUrl: feedUrl || null };
  }

  /**
   * Start AA consent (Setu-style). Returns consentUrl for browser redirect.
   * When AA_PROVIDER_CONSENT_URL is set, redirects there; else uses in-app mock authorize page.
   */
  async startAaConsent(
    tenantId: string,
    body: { provider?: string; redirectUri?: string; accountMask?: string } = {},
  ) {
    const consentId = randomUUID();
    const provider = (body.provider || process.env.AA_PROVIDER || 'mock').trim();
    const origin = (process.env.PUBLIC_API_ORIGIN || 'http://localhost:4000').replace(/\/$/, '');
    const webOrigin = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0].trim();
    const redirectUri =
      (body.redirectUri || '').trim() || `${webOrigin}/dashboard/bank-reconcile?aa=connected`;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ledgerSettings: true },
    });
    const settings =
      tenant?.ledgerSettings && typeof tenant.ledgerSettings === 'object'
        ? { ...(tenant.ledgerSettings as Record<string, unknown>) }
        : {};
    settings.aa = {
      provider,
      consentId,
      accountMask: body.accountMask || null,
      status: 'PENDING',
      redirectUri,
      startedAt: new Date().toISOString(),
    };
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { ledgerSettings: settings as object },
    });

    const providerUrl = (process.env.AA_PROVIDER_CONSENT_URL || '').trim();
    const consentUrl = providerUrl
      ? providerUrl
          .replace('{consentId}', consentId)
          .replace('{tenantId}', tenantId)
          .replace(
            '{callback}',
            encodeURIComponent(`${origin}/api/v1/bank-statements/aa/callback`),
          )
      : `${origin}/api/v1/bank-statements/aa/authorize?tenantId=${encodeURIComponent(tenantId)}&consentId=${encodeURIComponent(consentId)}`;

    return { consentId, consentUrl, provider, status: 'PENDING', redirectUri };
  }

  /** Mock / intermediate authorize page HTML (no JWT — consentId scoped to tenant). */
  async authorizePageHtml(tenantId: string, consentId: string) {
    const status = await this.getAaStatus(tenantId);
    const aa = status.aa as Record<string, unknown> | null;
    if (!aa || aa.consentId !== consentId) {
      return `<!doctype html><html><body><h1>Invalid consent</h1><p>Session expired. Restart from Bank Reconcile.</p></body></html>`;
    }
    const origin = (process.env.PUBLIC_API_ORIGIN || 'http://localhost:4000').replace(/\/$/, '');
    return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Bank consent</title>
<style>body{font-family:system-ui;max-width:420px;margin:48px auto;padding:24px;background:#f8fafc}
button{background:#0f766e;color:#fff;border:0;padding:12px 20px;border-radius:8px;font-size:16px;cursor:pointer;width:100%}
a{color:#0f766e}</style></head>
<body>
  <h1>Link bank account</h1>
  <p>RetailSarathi requests read-only statement access via Account Aggregator (${String(aa.provider || 'mock')}).</p>
  <p style="font-size:13px;color:#64748b">Consent ID: ${consentId}</p>
  <form method="GET" action="${origin}/api/v1/bank-statements/aa/callback">
    <input type="hidden" name="tenantId" value="${tenantId}"/>
    <input type="hidden" name="consentId" value="${consentId}"/>
    <input type="hidden" name="status" value="ACTIVE"/>
    <button type="submit">Approve &amp; continue</button>
  </form>
  <p style="margin-top:16px;font-size:13px"><a href="${origin}/api/v1/bank-statements/aa/callback?tenantId=${encodeURIComponent(tenantId)}&consentId=${encodeURIComponent(consentId)}&status=REJECTED">Deny</a></p>
</body></html>`;
  }

  async handleAaCallback(opts: {
    tenantId: string;
    consentId: string;
    status?: string;
    accessToken?: string;
    feedUrl?: string;
  }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: opts.tenantId },
      select: { ledgerSettings: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const settings =
      tenant.ledgerSettings && typeof tenant.ledgerSettings === 'object'
        ? { ...(tenant.ledgerSettings as Record<string, unknown>) }
        : {};
    const aa = (settings.aa && typeof settings.aa === 'object'
      ? { ...(settings.aa as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    if (aa.consentId && aa.consentId !== opts.consentId) {
      throw new BadRequestException('Consent ID mismatch');
    }
    const approved = (opts.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
    const feedUrl =
      (opts.feedUrl || '').trim() ||
      (process.env.AA_FEED_URL || '').trim().replace('{consentId}', opts.consentId) ||
      (typeof settings.bankFeedUrl === 'string' ? settings.bankFeedUrl : '') ||
      '';
    settings.aa = {
      ...aa,
      consentId: opts.consentId,
      status: approved ? 'ACTIVE' : 'REJECTED',
      connectedAt: approved ? new Date().toISOString() : aa.connectedAt,
      accessToken: opts.accessToken || aa.accessToken || null,
    };
    if (approved && feedUrl) settings.bankFeedUrl = feedUrl;
    await this.prisma.tenant.update({
      where: { id: opts.tenantId },
      data: { ledgerSettings: settings as object },
    });
    const redirectUri =
      (typeof aa.redirectUri === 'string' && aa.redirectUri) ||
      `${(process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0].trim()}/dashboard/bank-reconcile?aa=${approved ? 'connected' : 'rejected'}`;
    return { ok: true, approved, redirectUri, aa: settings.aa, bankFeedUrl: feedUrl || null };
  }

  async getAaStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ledgerSettings: true },
    });
    const settings =
      tenant?.ledgerSettings && typeof tenant.ledgerSettings === 'object'
        ? (tenant.ledgerSettings as Record<string, unknown>)
        : {};
    return {
      aa: settings.aa ?? null,
      bankFeedUrl: typeof settings.bankFeedUrl === 'string' ? settings.bankFeedUrl : null,
    };
  }

  async syncFromAa(tenantId: string) {
    const status = await this.getAaStatus(tenantId);
    if (!status.aa) {
      throw new BadRequestException('Connect Account Aggregator first (POST /bank-statements/aa/connect)');
    }
    const aa = status.aa as Record<string, unknown>;
    if (aa.status && aa.status !== 'ACTIVE') {
      throw new BadRequestException(`AA consent status is ${aa.status}`);
    }
    return this.syncFromFeed(tenantId);
  }
}
