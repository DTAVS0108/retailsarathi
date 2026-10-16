import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EcommerceOrderStatus, EcommercePlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptJson, decryptJson } from './credentials-crypto.util';

const ORDER_STATUSES = new Set<string>(Object.values(EcommerceOrderStatus));

export type PlatformField = {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
};

export type PlatformCatalogItem = {
  id: EcommercePlatform;
  label: string;
  blurb: string;
  region: 'india' | 'global' | 'self_hosted';
  popular?: boolean;
  orderPrefix: string;
  fields: PlatformField[];
};

const PLATFORM_CATALOG: PlatformCatalogItem[] = [
  {
    id: 'SHOPIFY',
    label: 'Shopify',
    blurb: 'Admin API access token + shop domain',
    region: 'global',
    popular: true,
    orderPrefix: 'SH',
    fields: [
      { key: 'shopDomain', label: 'Shop domain', placeholder: 'your-store.myshopify.com' },
      { key: 'accessToken', label: 'Admin API token', placeholder: 'shpat_…', secret: true },
    ],
  },
  {
    id: 'WOOCOMMERCE',
    label: 'WooCommerce',
    blurb: 'REST API keys from WordPress',
    region: 'self_hosted',
    popular: true,
    orderPrefix: 'WO',
    fields: [
      { key: 'storeUrl', label: 'Store URL', placeholder: 'https://shop.example.com' },
      { key: 'consumerKey', label: 'Consumer key', placeholder: 'ck_…', secret: true },
      { key: 'consumerSecret', label: 'Consumer secret', placeholder: 'cs_…', secret: true },
    ],
  },
  {
    id: 'AMAZON',
    label: 'Amazon',
    blurb: 'Seller Central / SP-API credentials',
    region: 'global',
    popular: true,
    orderPrefix: 'AM',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'A1…' },
      { key: 'refreshToken', label: 'Refresh token', placeholder: 'Atzr|…', secret: true },
      { key: 'marketplaceId', label: 'Marketplace ID', placeholder: 'A21TJRUUN4KGV' },
    ],
  },
  {
    id: 'FLIPKART',
    label: 'Flipkart',
    blurb: 'Seller Hub API credentials',
    region: 'india',
    popular: true,
    orderPrefix: 'FK',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
      { key: 'apiSecret', label: 'API secret', placeholder: 'API secret', secret: true },
    ],
  },
  {
    id: 'MEESHO',
    label: 'Meesho',
    blurb: 'Supplier panel API / order export',
    region: 'india',
    popular: true,
    orderPrefix: 'MS',
    fields: [
      { key: 'supplierId', label: 'Supplier ID', placeholder: 'Supplier ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
    ],
  },
  {
    id: 'MYNTRA',
    label: 'Myntra',
    blurb: 'Partner portal credentials',
    region: 'india',
    orderPrefix: 'MY',
    fields: [
      { key: 'partnerId', label: 'Partner ID', placeholder: 'Partner ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
      { key: 'apiSecret', label: 'API secret', placeholder: 'API secret', secret: true },
    ],
  },
  {
    id: 'AJIO',
    label: 'Ajio',
    blurb: 'Reliance Retail seller credentials',
    region: 'india',
    orderPrefix: 'AJ',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
    ],
  },
  {
    id: 'SNAPDEAL',
    label: 'Snapdeal',
    blurb: 'Seller API credentials',
    region: 'india',
    orderPrefix: 'SD',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'xAuthToken', label: 'X-Auth token', placeholder: 'Token', secret: true },
    ],
  },
  {
    id: 'JIOMART',
    label: 'JioMart',
    blurb: 'Seller Centre API credentials',
    region: 'india',
    orderPrefix: 'JM',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
      { key: 'apiSecret', label: 'API secret', placeholder: 'API secret', secret: true },
    ],
  },
  {
    id: 'NYKAA',
    label: 'Nykaa',
    blurb: 'Marketplace seller credentials',
    region: 'india',
    orderPrefix: 'NY',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
    ],
  },
  {
    id: 'PAYTM_MALL',
    label: 'Paytm Mall',
    blurb: 'Merchant API credentials',
    region: 'india',
    orderPrefix: 'PM',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', placeholder: 'Merchant ID' },
      { key: 'clientId', label: 'Client ID', placeholder: 'Client ID' },
      { key: 'clientSecret', label: 'Client secret', placeholder: 'Client secret', secret: true },
    ],
  },
  {
    id: 'INDIA_MART',
    label: 'IndiaMART',
    blurb: 'Lead / order API for B2B sellers',
    region: 'india',
    orderPrefix: 'IM',
    fields: [
      { key: 'glusrId', label: 'GLUSR ID', placeholder: 'GLUSR ID' },
      { key: 'accessToken', label: 'Access token', placeholder: 'Token', secret: true },
    ],
  },
  {
    id: 'ETSY',
    label: 'Etsy',
    blurb: 'Open API key + shop ID',
    region: 'global',
    orderPrefix: 'ET',
    fields: [
      { key: 'shopId', label: 'Shop ID', placeholder: 'Shop ID' },
      { key: 'accessToken', label: 'Access token', placeholder: 'Token', secret: true },
    ],
  },
  {
    id: 'EBAY',
    label: 'eBay',
    blurb: 'Trading / Sell API credentials',
    region: 'global',
    orderPrefix: 'EB',
    fields: [
      { key: 'userToken', label: 'User token', placeholder: 'Token', secret: true },
      { key: 'marketplaceId', label: 'Marketplace', placeholder: 'EBAY_IN' },
    ],
  },
  {
    id: 'MAGENTO',
    label: 'Magento',
    blurb: 'Adobe Commerce / Magento REST',
    region: 'self_hosted',
    orderPrefix: 'MG',
    fields: [
      { key: 'storeUrl', label: 'Store URL', placeholder: 'https://shop.example.com' },
      { key: 'accessToken', label: 'Integration token', placeholder: 'Token', secret: true },
    ],
  },
  {
    id: 'OPENCART',
    label: 'OpenCart',
    blurb: 'REST / feed API credentials',
    region: 'self_hosted',
    orderPrefix: 'OC',
    fields: [
      { key: 'storeUrl', label: 'Store URL', placeholder: 'https://shop.example.com' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
    ],
  },
  {
    id: 'CUSTOM',
    label: 'Custom API',
    blurb: 'Any REST / CSV feed that returns orders',
    region: 'self_hosted',
    popular: true,
    orderPrefix: 'CX',
    fields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.example.com/orders' },
      { key: 'apiKey', label: 'API key', placeholder: 'Bearer / key', secret: true },
      { key: 'marketplaceLabel', label: 'Marketplace label', placeholder: 'e.g. Unicommerce / Dukaan' },
    ],
  },
];

const PLATFORM_IDS = new Set(PLATFORM_CATALOG.map((p) => p.id));

@Injectable()
export class EcommerceService {
  constructor(private prisma: PrismaService) {}

  getPlatformCatalog() {
    return PLATFORM_CATALOG;
  }

  private platformMeta(platform: string) {
    return PLATFORM_CATALOG.find((p) => p.id === platform);
  }

  /** Never return the raw `credentials` JSON to a client — only key names and a boolean. */
  private redactChannel<T extends { credentials: unknown }>(channel: T) {
    const { credentials, ...rest } = channel;
    const decrypted = decryptJson(credentials);
    const credentialFields = Object.keys(decrypted);
    return { ...rest, hasCredentials: credentialFields.length > 0, credentialFields };
  }

  async listChannels(tenantId: string) {
    const channels = await this.prisma.ecommerceChannel.findMany({
      where: { tenantId },
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return channels.map((c) => this.redactChannel(c));
  }

  async createChannel(
    tenantId: string,
    data: { platform: string; name: string; credentials?: Record<string, unknown> },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Channel name is required');
    if (!data.platform || !PLATFORM_IDS.has(data.platform as EcommercePlatform)) {
      throw new BadRequestException('Unsupported marketplace platform');
    }

    const channel = await this.prisma.ecommerceChannel.create({
      data: {
        tenantId,
        platform: data.platform as EcommercePlatform,
        name,
        credentials: encryptJson(data.credentials ?? {}) as unknown as Prisma.InputJsonValue,
        webhookToken: data.platform === 'CUSTOM' ? randomBytes(24).toString('hex') : undefined,
      },
    });
    return this.redactChannel(channel);
  }

  async updateChannel(
    tenantId: string,
    channelId: string,
    data: {
      name?: string;
      credentials?: Record<string, unknown>;
      isActive?: boolean;
    },
  ) {
    const channel = await this.prisma.ecommerceChannel.findFirst({
      where: { id: channelId, tenantId },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const name = data.name !== undefined ? data.name.trim() : undefined;
    if (data.name !== undefined && !name) {
      throw new BadRequestException('Channel name cannot be empty');
    }

    const updated = await this.prisma.ecommerceChannel.update({
      where: { id: channelId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data.credentials !== undefined
          ? { credentials: encryptJson(data.credentials) as unknown as Prisma.InputJsonValue }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: { _count: { select: { orders: true } } },
    });
    return this.redactChannel(updated);
  }

  async deleteChannel(tenantId: string, channelId: string) {
    const channel = await this.prisma.ecommerceChannel.findFirst({
      where: { id: channelId, tenantId },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    await this.prisma.ecommerceChannel.delete({ where: { id: channelId } });
    return { ok: true };
  }

  async syncOrders(tenantId: string, channelId: string) {
    const channel = await this.prisma.ecommerceChannel.findFirst({
      where: { id: channelId, tenantId },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (!channel.isActive) {
      throw new BadRequestException('Channel is paused — resume it before syncing');
    }

    if (channel.platform === 'CUSTOM') {
      // CUSTOM channels are the one real (non-demo) path: orders arrive via inbound webhook,
      // not a fabricated pull. Nothing to "sync" here — point the user at the webhook instead.
      return {
        imported: 0,
        skipped: 0,
        orders: [],
        mode: 'webhook' as const,
        platform: channel.platform,
        webhookPath: `/ecommerce/webhook/${channel.id}`,
        note: 'CUSTOM channels receive orders via webhook — POST from your integration to see them appear here.',
      };
    }

    // Demo pull for named marketplaces — no real outbound integration exists for any of them yet.
    const stamp = Date.now().toString(36).toUpperCase();
    const prefix = this.platformMeta(channel.platform)?.orderPrefix ?? 'CX';
    const label = this.platformMeta(channel.platform)?.label ?? channel.platform;

    const mockOrders = [
      {
        externalId: `${prefix}-${stamp}-1`,
        customerName: `${label} Customer`,
        totalAmount: 2499,
        items: [{ sku: 'DEMO-001', name: 'Demo SKU 1', qty: 1, rate: 2499 }],
      },
      {
        externalId: `${prefix}-${stamp}-2`,
        customerName: `${label} Buyer`,
        totalAmount: 8999,
        items: [{ sku: 'DEMO-002', name: 'Demo SKU 2', qty: 2, rate: 4499.5 }],
      },
    ];

    const imported = [];
    let skipped = 0;
    for (const order of mockOrders) {
      const existing = await this.prisma.ecommerceOrder.findUnique({
        where: { channelId_externalId: { channelId, externalId: order.externalId } },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      imported.push(
        await this.prisma.ecommerceOrder.create({
          data: {
            channelId,
            externalId: order.externalId,
            customerName: order.customerName,
            totalAmount: order.totalAmount,
            payload: order as Prisma.InputJsonValue,
          },
        }),
      );
    }

    await this.prisma.ecommerceChannel.update({
      where: { id: channelId },
      data: { lastSyncAt: new Date() },
    });

    return {
      imported: imported.length,
      skipped,
      orders: imported,
      mode: 'demo' as const,
      platform: channel.platform,
      note: `Demo sync for ${label}. Wire the live ${label} connector for production orders.`,
    };
  }

  async listOrders(tenantId: string, channelId?: string, status?: string) {
    const statusFilter =
      status && ORDER_STATUSES.has(status)
        ? (status as EcommerceOrderStatus)
        : undefined;

    return this.prisma.ecommerceOrder.findMany({
      where: {
        channel: { tenantId, ...(channelId ? { id: channelId } : {}) },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: { channel: { select: { id: true, name: true, platform: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateOrderStatus(tenantId: string, orderId: string, status: string) {
    if (!ORDER_STATUSES.has(status)) {
      throw new BadRequestException('Invalid order status');
    }

    const order = await this.prisma.ecommerceOrder.findFirst({
      where: { id: orderId, channel: { tenantId } },
    });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.ecommerceOrder.update({
      where: { id: orderId },
      data: { status: status as EcommerceOrderStatus },
      include: { channel: { select: { id: true, name: true, platform: true } } },
    });
  }

  /**
   * Real inbound order ingestion for CUSTOM channels — validated by a per-channel bearer token,
   * not JWT (external systems have no RetailSarathi login). Same dedupe-by-externalId semantics
   * as the demo `syncOrders` path.
   */
  async receiveWebhookOrder(
    channelId: string,
    token: string | undefined,
    body: {
      externalId?: string;
      customerName?: string;
      totalAmount?: number;
      items?: Array<{ sku?: string; name?: string; qty?: number; rate?: number }>;
    },
  ) {
    const channel = await this.prisma.ecommerceChannel.findFirst({ where: { id: channelId } });
    if (!channel || channel.platform !== 'CUSTOM') {
      throw new NotFoundException('Webhook channel not found');
    }
    if (!token || !channel.webhookToken || token !== channel.webhookToken) {
      throw new BadRequestException('Invalid webhook token');
    }
    if (!channel.isActive) {
      throw new BadRequestException('Channel is paused');
    }
    if (!body.externalId || !body.totalAmount) {
      throw new BadRequestException('externalId and totalAmount are required');
    }

    const existing = await this.prisma.ecommerceOrder.findUnique({
      where: { channelId_externalId: { channelId, externalId: body.externalId } },
    });
    if (existing) {
      return { imported: false, orderId: existing.id, reason: 'duplicate externalId — skipped' };
    }

    const order = await this.prisma.ecommerceOrder.create({
      data: {
        channelId,
        externalId: body.externalId,
        customerName: body.customerName ?? null,
        totalAmount: body.totalAmount,
        payload: body as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.ecommerceChannel.update({ where: { id: channelId }, data: { lastSyncAt: new Date() } });
    return { imported: true, orderId: order.id };
  }

  async overview(tenantId: string) {
    const [channels, orderGroups, lastSync] = await Promise.all([
      this.prisma.ecommerceChannel.findMany({
        where: { tenantId },
        select: { id: true, isActive: true, lastSyncAt: true, platform: true },
      }),
      this.prisma.ecommerceOrder.groupBy({
        by: ['status'],
        where: { channel: { tenantId } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.ecommerceChannel.findFirst({
        where: { tenantId, lastSyncAt: { not: null } },
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    let orderCount = 0;
    let orderValue = 0;
    for (const row of orderGroups) {
      byStatus[row.status] = row._count._all;
      orderCount += row._count._all;
      orderValue += Number(row._sum.totalAmount ?? 0);
    }

    const byPlatform: Record<string, number> = {};
    for (const c of channels) {
      byPlatform[c.platform] = (byPlatform[c.platform] ?? 0) + 1;
    }

    return {
      channelCount: channels.length,
      activeChannelCount: channels.filter((c) => c.isActive).length,
      orderCount,
      orderValue,
      byStatus,
      byPlatform,
      availablePlatforms: PLATFORM_CATALOG.length,
      lastSyncAt: lastSync?.lastSyncAt ?? null,
    };
  }
}
