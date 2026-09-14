import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { EinvoiceGspClient } from './einvoice-gsp.client';
import {
  buildInvoiceQrPayload,
  invoiceQrImageUrl,
  parseInvoiceQrPayload,
  mapUnitToUqc,
} from '@retail-sarathi/gst-engine';

@Injectable()
export class ComplianceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private gsp: EinvoiceGspClient,
  ) {}

  async getAuditLogs(tenantId: string, limit = 100) {
    return this.audit.getLogs(tenantId, limit);
  }

  /** Status of GSP wiring for the UI */
  getEinvoiceStatus() {
    const cfg = this.gsp.getConfig();
    return {
      configured: cfg.enabled,
      provider: cfg.provider,
      host: cfg.host,
      gstin: cfg.gstin ? `${cfg.gstin.slice(0, 4)}****${cfg.gstin.slice(-3)}` : null,
      mode: cfg.enabled ? 'live' : 'demo',
      hint: cfg.enabled
        ? 'Live GSP credentials detected — Request e-invoice will call ClearTax/NIC.'
        : 'Add EINVOICE_GSP_AUTH_TOKEN and EINVOICE_GSP_GSTIN to API .env for live IRN.',
    };
  }

  async generateInvoiceQr(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { tenant: true, customer: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.einvoiceQr) {
      const qrPayload = invoice.einvoiceQr;
      return {
        invoiceId,
        qrPayload,
        qrParsed: parseInvoiceQrPayload(qrPayload),
        qrUrl: invoiceQrImageUrl(qrPayload),
        irn: invoice.irn,
        disclaimer: invoice.irn?.startsWith('IRN-DEMO')
          ? 'Demo QR — live SignedQRCode appears after GSP IRN.'
          : 'Signed / invoice QR from e-invoice.',
      };
    }

    const qrPayload = buildInvoiceQrPayload({
      gstin: invoice.tenant.gstin ?? undefined,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt,
      subtotal: Number(invoice.subtotal),
      grandTotal: Number(invoice.grandTotal),
      totalCgst: Number(invoice.totalCgst),
      totalSgst: Number(invoice.totalSgst),
      totalIgst: Number(invoice.totalIgst),
      customerGstin: invoice.customer?.gstin ?? undefined,
      customerName: invoice.customer?.name ?? undefined,
      paymentMethod: undefined,
      irn: invoice.irn ?? undefined,
    });

    return {
      invoiceId,
      qrPayload,
      qrParsed: parseInvoiceQrPayload(qrPayload),
      qrUrl: invoiceQrImageUrl(qrPayload),
      disclaimer: 'GST invoice QR for B2C verification. E-invoice IRN requires GSP credentials.',
    };
  }

  async requestEinvoice(tenantId: string, invoiceId: string, userId?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { tenant: true, customer: true, lines: true, branch: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'FINALIZED') {
      throw new BadRequestException('Only finalized invoices can get an IRN');
    }
    if (invoice.irn && !invoice.irn.startsWith('IRN-DEMO')) {
      return {
        invoice,
        irn: invoice.irn,
        qrPayload: invoice.einvoiceQr,
        mode: 'live',
        note: 'IRN already present on this invoice',
      };
    }

    const sellerGstin = invoice.tenant.gstin;
    if (!sellerGstin) {
      throw new BadRequestException('Shop GSTIN required for e-invoice (Settings)');
    }

    const transaction = this.buildNicInvoicePayload(invoice);
    const demoQr = buildInvoiceQrPayload({
      gstin: sellerGstin,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt,
      subtotal: Number(invoice.subtotal),
      grandTotal: Number(invoice.grandTotal),
      totalCgst: Number(invoice.totalCgst),
      totalSgst: Number(invoice.totalSgst),
      totalIgst: Number(invoice.totalIgst),
      customerGstin: invoice.customer?.gstin ?? undefined,
      customerName: invoice.customer?.name ?? undefined,
    });

    const result = await this.gsp.generateIrn({
      transaction,
      demoQr,
    });

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        irn: result.irn,
        einvoiceQr: result.signedQrCode || demoQr,
      },
    });

    await this.audit.log(tenantId, 'EINVOICE_GENERATED', 'invoice', {
      userId,
      entityId: invoiceId,
      metadata: {
        irn: result.irn,
        mode: result.mode,
        ackNo: result.ackNo,
      },
    });

    return {
      invoice: updated,
      irn: result.irn,
      ackNo: result.ackNo,
      ackDt: result.ackDt,
      qrPayload: result.signedQrCode || demoQr,
      mode: result.mode,
      note: result.note,
    };
  }

  /** NIC / ClearTax govt-compatible document body */
  private buildNicInvoicePayload(invoice: {
    invoiceNumber: string;
    createdAt: Date;
    supplyType: string;
    subtotal: unknown;
    totalCgst: unknown;
    totalSgst: unknown;
    totalIgst: unknown;
    grandTotal: unknown;
    totalDiscount: unknown;
    tenant: {
      gstin: string | null;
      name: string;
      address: string | null;
      stateCode: string;
      phone: string | null;
      email: string | null;
    };
    customer: {
      gstin: string | null;
      name: string;
      address: string | null;
      stateCode: string | null;
      phone: string | null;
    } | null;
    lines: Array<{
      productName: string;
      hsnCode: string;
      unit?: string | null;
      quantity: unknown;
      unitPrice: unknown;
      discount: unknown;
      gstRate: unknown;
      cgst: unknown;
      sgst: unknown;
      igst: unknown;
      taxableAmount: unknown;
      total: unknown;
    }>;
  }) {
    const sellerGstin = invoice.tenant.gstin!;
    const buyerGstin = invoice.customer?.gstin || 'URP';
    const buyerState = invoice.customer?.stateCode || invoice.tenant.stateCode;
    const docDate = [
      String(invoice.createdAt.getDate()).padStart(2, '0'),
      String(invoice.createdAt.getMonth() + 1).padStart(2, '0'),
      String(invoice.createdAt.getFullYear()),
    ].join('/');

    const itemList = invoice.lines.map((l, idx) => {
      const gstRate = Number(l.gstRate);
      const taxable = Number(l.taxableAmount);
      const isIgst = invoice.supplyType === 'INTER_STATE';
      return {
        SlNo: String(idx + 1),
        PrdDesc: l.productName.slice(0, 100),
        IsServc: 'N',
        HsnCd: l.hsnCode.replace(/\D/g, '').slice(0, 8) || '8517',
        Qty: Number(l.quantity),
        Unit: mapUnitToUqc(l.unit),
        UnitPrice: Number(l.unitPrice),
        TotAmt: Number(l.quantity) * Number(l.unitPrice),
        Discount: Number(l.discount),
        AssAmt: taxable,
        GstRt: gstRate,
        IgstAmt: isIgst ? Number(l.igst) : 0,
        CgstAmt: isIgst ? 0 : Number(l.cgst),
        SgstAmt: isIgst ? 0 : Number(l.sgst),
        TotItemVal: Number(l.total),
      };
    });

    return {
      Version: '1.1',
      TranDtls: {
        TaxSch: 'GST',
        SupTyp: buyerGstin === 'URP' ? 'B2C' : 'B2B',
        RegRev: 'N',
        IgstOnIntra: 'N',
      },
      DocDtls: {
        Typ: 'INV',
        No: invoice.invoiceNumber.slice(0, 16),
        Dt: docDate,
      },
      SellerDtls: {
        Gstin: sellerGstin,
        LglNm: invoice.tenant.name.slice(0, 100),
        Addr1: (invoice.tenant.address || 'Address').slice(0, 100),
        Loc: 'City',
        Pin: 400001,
        Stcd: invoice.tenant.stateCode,
        Ph: invoice.tenant.phone || undefined,
        Em: invoice.tenant.email || undefined,
      },
      BuyerDtls: {
        Gstin: buyerGstin === 'URP' ? 'URP' : buyerGstin,
        LglNm: (invoice.customer?.name || 'Walk-in').slice(0, 100),
        Pos: buyerState,
        Addr1: (invoice.customer?.address || 'Address').slice(0, 100),
        Loc: 'City',
        Pin: 400001,
        Stcd: buyerState,
        Ph: invoice.customer?.phone || undefined,
      },
      ItemList: itemList,
      ValDtls: {
        AssVal: Number(invoice.subtotal) - Number(invoice.totalDiscount ?? 0),
        CgstVal: Number(invoice.totalCgst),
        SgstVal: Number(invoice.totalSgst),
        IgstVal: Number(invoice.totalIgst),
        Discount: Number(invoice.totalDiscount ?? 0),
        TotInvVal: Number(invoice.grandTotal),
      },
    };
  }

  async ewayBillHelper(
    tenantId: string,
    invoiceId: string,
    distanceKm: number,
    userId?: string,
    vehicleNo?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { tenant: true, customer: true, lines: { include: { product: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const value = Number(invoice.grandTotal);
    const required = value > 50000 || distanceKm > 50;
    const normalizedVehicle = vehicleNo?.trim() || invoice.vehicleNo || null;

    if (invoice.ewayBillNo && !invoice.ewayBillNo.startsWith('EWB-DEMO-')) {
      if (normalizedVehicle && normalizedVehicle !== invoice.vehicleNo) {
        await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: { vehicleNo: normalizedVehicle },
        });
      }
      return {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        ewayBillNo: invoice.ewayBillNo,
        vehicleNo: normalizedVehicle ?? invoice.vehicleNo,
        value,
        distanceKm,
        ewayBillRequired: required,
        mode: 'existing',
        checklist: [
          'Valid GSTIN of supplier and recipient',
          'HSN-wise item details',
          'Place of supply and transport mode',
          'Vehicle number (if road transport)',
        ],
        note: `Existing e-way bill ${invoice.ewayBillNo}`,
      };
    }

    const gspResult = await this.gsp.generateEway({
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      distanceKm,
      value,
      vehicleNo: normalizedVehicle ?? undefined,
      supplierGstin: invoice.tenant.gstin,
      buyerGstin: invoice.customer?.gstin,
      items: invoice.lines.map((l) => ({
        hsn: l.product?.hsnCode,
        qty: Number(l.quantity),
        taxable: Number(l.taxableAmount),
      })),
    });

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ewayBillNo: gspResult.ewayBillNo,
        ...(normalizedVehicle ? { vehicleNo: normalizedVehicle } : {}),
      },
    });

    await this.audit.log(tenantId, 'EWAY_BILL_GENERATED', 'invoice', {
      userId,
      entityId: invoiceId,
      metadata: {
        ewayBillNo: gspResult.ewayBillNo,
        vehicleNo: normalizedVehicle,
        distanceKm,
        required,
        mode: gspResult.mode,
      },
    });

    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      ewayBillNo: updated.ewayBillNo,
      vehicleNo: updated.vehicleNo,
      value,
      distanceKm,
      ewayBillRequired: required,
      mode: gspResult.mode,
      checklist: [
        'Valid GSTIN of supplier and recipient',
        'HSN-wise item details',
        'Place of supply and transport mode',
        'Vehicle number (if road transport)',
      ],
      note: gspResult.note,
    };
  }
}
