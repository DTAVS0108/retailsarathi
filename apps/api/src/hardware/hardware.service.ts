import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildThermalReceipt } from '../invoices/thermal.util';

const MAC_ADDRESS_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i;
const SERIAL_PORT_RE = /^(COM\d+|\/dev\/tty\S+)$/i;

@Injectable()
export class HardwareService {
  constructor(private prisma: PrismaService) {}

  /**
   * Format-checks device settings that would otherwise silently accept garbage — previously
   * only Bluetooth MAC truthiness was checked (and only at print time, not at save time).
   */
  private validateSettings(deviceType: string, settings: Record<string, unknown>) {
    if (deviceType === 'THERMAL_PRINTER') {
      const transport = String(settings.port || settings.transport || '').toUpperCase();
      if (transport === 'BLUETOOTH') {
        const mac = String(settings.bluetoothAddress || '').trim();
        if (!mac || !MAC_ADDRESS_RE.test(mac)) {
          throw new BadRequestException('Bluetooth MAC address must look like AA:BB:CC:DD:EE:FF');
        }
      }
    }
    if (deviceType === 'WEIGHING_SCALE' || deviceType === 'CUSTOMER_DISPLAY') {
      const port = String(settings.port || '').trim();
      if (!port || !SERIAL_PORT_RE.test(port)) {
        throw new BadRequestException('Port must look like COM3 (Windows) or /dev/ttyUSB0 (Linux/Mac)');
      }
    }
  }

  async list(tenantId: string, branchId?: string) {
    return this.prisma.hardwareConfig.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async overview(tenantId: string) {
    const devices = await this.prisma.hardwareConfig.findMany({
      where: { tenantId },
      select: { deviceType: true, isActive: true },
    });
    const byType: Record<string, number> = {};
    let activeCount = 0;
    for (const d of devices) {
      byType[d.deviceType] = (byType[d.deviceType] ?? 0) + 1;
      if (d.isActive) activeCount += 1;
    }
    return {
      deviceCount: devices.length,
      activeCount,
      printerCount: byType.THERMAL_PRINTER ?? 0,
      scannerCount: byType.BARCODE_SCANNER ?? 0,
      byType,
    };
  }

  async create(
    tenantId: string,
    data: {
      deviceType: string;
      name: string;
      branchId?: string;
      settings?: Record<string, unknown>;
    },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Device name is required');
    if (!data.deviceType) throw new BadRequestException('Device type is required');

    const preset = this.getDevicePresets().find((p) => p.type === data.deviceType);
    const settings = {
      ...(preset?.defaults ?? {}),
      ...(data.settings ?? {}),
    };
    this.validateSettings(data.deviceType, settings);

    return this.prisma.hardwareConfig.create({
      data: {
        tenantId,
        deviceType: data.deviceType as never,
        name,
        branchId: data.branchId || null,
        settings: settings as Prisma.InputJsonValue,
      },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: { name?: string; settings?: Record<string, unknown>; isActive?: boolean },
  ) {
    const existing = await this.ensure(tenantId, id);
    const name = data.name !== undefined ? data.name.trim() : undefined;
    if (data.name !== undefined && !name) {
      throw new BadRequestException('Device name cannot be empty');
    }
    if (data.settings !== undefined) {
      const currentSettings =
        existing.settings && typeof existing.settings === 'object'
          ? (existing.settings as Record<string, unknown>)
          : {};
      this.validateSettings(existing.deviceType, { ...currentSettings, ...data.settings });
    }

    return this.prisma.hardwareConfig.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.settings !== undefined
          ? { settings: data.settings as Prisma.InputJsonValue }
          : {}),
      },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.ensure(tenantId, id);
    await this.prisma.hardwareConfig.delete({ where: { id } });
    return { ok: true };
  }

  getDevicePresets() {
    return [
      {
        type: 'THERMAL_PRINTER',
        label: 'Thermal Printer',
        blurb: '58/80mm ESC/POS receipt printer',
        defaults: {
          paperWidth: 80,
          charset: 'ESC/POS',
          port: 'BLUETOOTH',
          bluetoothAddress: '',
        },
        fields: [
          { key: 'port', label: 'Transport', options: ['BLUETOOTH', 'USB'] },
          { key: 'paperWidth', label: 'Paper width (mm)', options: ['58', '80'] },
          { key: 'bluetoothAddress', label: 'Bluetooth MAC', placeholder: 'AA:BB:CC:DD:EE:FF' },
        ],
      },
      {
        type: 'BARCODE_SCANNER',
        label: 'Barcode Scanner',
        blurb: 'USB keyboard-wedge scanner',
        defaults: { mode: 'KEYBOARD_WEDGE', suffix: 'Enter' },
        fields: [
          { key: 'mode', label: 'Mode', options: ['KEYBOARD_WEDGE', 'SERIAL'] },
          { key: 'suffix', label: 'Suffix key', placeholder: 'Enter' },
        ],
      },
      {
        type: 'CASH_DRAWER',
        label: 'Cash Drawer',
        blurb: 'Kick via printer or dedicated pulse',
        defaults: { trigger: 'PRINTER_KICK', pin: 2 },
        fields: [
          { key: 'trigger', label: 'Trigger', options: ['PRINTER_KICK', 'DIRECT'] },
          { key: 'pin', label: 'Pin', placeholder: '2' },
        ],
      },
      {
        type: 'WEIGHING_SCALE',
        label: 'Weighing Scale',
        blurb: 'Serial scale for weighed SKUs',
        defaults: { protocol: 'SERIAL', baudRate: 9600 },
        fields: [
          { key: 'protocol', label: 'Protocol', options: ['SERIAL', 'USB'] },
          { key: 'baudRate', label: 'Baud rate', placeholder: '9600' },
          { key: 'port', label: 'Port', placeholder: 'COM3' },
        ],
      },
      {
        type: 'CUSTOMER_DISPLAY',
        label: 'Customer Display',
        blurb: '2-line pole display at counter',
        defaults: { lines: 2, port: 'COM1' },
        fields: [
          { key: 'lines', label: 'Lines', options: ['1', '2'] },
          { key: 'port', label: 'Port', placeholder: 'COM1' },
        ],
      },
      {
        type: 'LABEL_PRINTER',
        label: 'Label Printer',
        blurb: 'Barcode / price labels',
        defaults: { labelSize: '50x25mm', dpi: 203 },
        fields: [
          { key: 'labelSize', label: 'Label size', placeholder: '50x25mm' },
          { key: 'dpi', label: 'DPI', options: ['203', '300'] },
        ],
      },
    ];
  }

  /**
   * Native BT/USB print job: ESC/POS payload + target from HardwareConfig.
   * Clients write decoded bytes to BluetoothSocket / QZ / USB.
   */
  async createThermalPrintJob(
    tenantId: string,
    opts: {
      invoiceId: string;
      hardwareConfigId?: string;
      paperWidth?: 58 | 80;
      showShopGstin?: boolean;
      showShopAddress?: boolean;
      showCustomerOnThermal?: boolean;
    },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: opts.invoiceId, tenantId },
      include: {
        lines: true,
        customer: true,
        payments: true,
        tenant: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const printers = await this.prisma.hardwareConfig.findMany({
      where: {
        tenantId,
        deviceType: 'THERMAL_PRINTER',
        isActive: true,
        ...(opts.hardwareConfigId ? { id: opts.hardwareConfigId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const printer = printers[0];
    if (opts.hardwareConfigId && !printer) {
      throw new NotFoundException('Thermal printer not found or inactive');
    }

    const settings =
      printer?.settings && typeof printer.settings === 'object'
        ? (printer.settings as Record<string, unknown>)
        : {};
    const transport = String(settings.port || settings.transport || 'USB').toUpperCase();
    const bluetoothAddress = String(
      settings.bluetoothAddress || settings.mac || settings.address || '',
    );

    const paperWidth =
      opts.paperWidth === 58 || opts.paperWidth === 80
        ? opts.paperWidth
        : Number(settings.paperWidth) === 58
          ? 58
          : 80;
    const showGstin = opts.showShopGstin !== false;
    const showAddress = opts.showShopAddress !== false;
    const showCustomer = opts.showCustomerOnThermal !== false;

    const tax =
      Number(invoice.totalCgst) + Number(invoice.totalSgst) + Number(invoice.totalIgst);
    const built = buildThermalReceipt({
      shopName: invoice.tenant?.name || 'Shop',
      shopAddress: showAddress ? invoice.tenant?.address || undefined : undefined,
      gstin: showGstin ? invoice.tenant?.gstin || undefined : undefined,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt.toISOString(),
      customerName: showCustomer ? invoice.customer?.name : undefined,
      lines: invoice.lines.map((l) => ({
        name: l.productName,
        qty: Number(l.quantity),
        rate: Number(l.unitPrice),
        amount: Number(l.total),
      })),
      subtotal: Number(invoice.subtotal),
      tax,
      grandTotal: Number(invoice.grandTotal),
      payments: invoice.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
      })),
      paperWidthMm: paperWidth,
    });

    if (transport === 'BLUETOOTH' && (!bluetoothAddress || !MAC_ADDRESS_RE.test(bluetoothAddress))) {
      throw new BadRequestException(
        'Bluetooth MAC missing or malformed — open Hardware, edit the thermal printer, set a valid MAC (AA:BB:CC:DD:EE:FF), then retry.',
      );
    }

    return {
      transport,
      bluetoothAddress: bluetoothAddress || null,
      hardwareConfigId: printer?.id ?? null,
      printerName: printer?.name ?? null,
      paperWidth,
      invoiceNumber: invoice.invoiceNumber,
      text: built.text,
      escposBase64: built.escposBase64,
      instructions:
        transport === 'BLUETOOTH'
          ? 'Write escposBase64 decoded bytes to RFCOMM on bluetoothAddress (desktop/mobile app).'
          : 'Send escposBase64 to USB/QZ Tray raw printer, or download the .bin file.',
      mode: printer ? 'device' : 'preview',
      note: printer
        ? 'Payload generated for a configured printer — this confirms the config is well-formed, not that the print actually reached the device.'
        : 'No active thermal printer configured — payload generated for preview/download only.',
    };
  }

  private async ensure(tenantId: string, id: string) {
    const d = await this.prisma.hardwareConfig.findFirst({ where: { id, tenantId } });
    if (!d) throw new NotFoundException('Hardware config not found');
    return d;
  }
}
