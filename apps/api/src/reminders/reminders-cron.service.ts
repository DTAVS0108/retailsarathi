import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { sendWhatsAppWithOptionalMedia } from '../common/whatsapp.util';

/**
 * Daily overdue party reminders (suppliers + customers).
 * Uses WhatsApp gateway when WHATSAPP_API_URL is set; otherwise logs PartyReminderLog + wa.me.
 * Disable with REMINDERS_CRON=off
 *
 * Also purges archived products/suppliers after 30 days (ARCHIVE_PURGE_CRON=off to disable).
 */
@Injectable()
export class RemindersCronService {
  private readonly logger = new Logger(RemindersCronService.name);

  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private customers: CustomersService,
    private products: ProductsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'overdue-party-reminders' })
  async runDailyOverdueReminders() {
    if ((process.env.REMINDERS_CRON || 'on').toLowerCase() === 'off') {
      this.logger.debug('Reminders cron disabled (REMINDERS_CRON=off)');
      return;
    }

    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, name: true },
      take: 500,
    });

    let supplierApiSent = 0;
    let customerApiSent = 0;

    for (const t of tenants) {
      try {
        const bulk = await this.inventory.bulkOverdueReminders(t.id, undefined);
        for (const item of bulk.items) {
          if (!item.phone || !item.text) continue;
          const result = await sendWhatsAppWithOptionalMedia({
            phone: item.phone,
            text: item.text,
            meta: { tenantId: t.id, supplierId: item.supplierId, source: 'cron' },
          });
          if (result.sent) supplierApiSent += 1;
        }

        const aging = await this.customers.getAging(t.id);
        for (const row of aging) {
          const overdue =
            Number(row.aging.days30) +
            Number(row.aging.days60) +
            Number(row.aging.days90plus);
          if (overdue < 0.01) continue;
          if (row.whatsappOptIn === false) continue;
          try {
            const rem = await this.customers.logCustomerReminder(t.id, row.customerId);
            const result = await sendWhatsAppWithOptionalMedia({
              phone: row.phone,
              text:
                rem.text ||
                `Namaste ${row.name}, overdue ₹${overdue.toFixed(2)} is pending. Please settle.`,
              meta: { tenantId: t.id, customerId: row.customerId, source: 'cron' },
            });
            if (result.sent) customerApiSent += 1;
          } catch (e) {
            this.logger.warn(`Customer reminder ${row.customerId}: ${String(e)}`);
          }
        }

        this.logger.log(`Tenant ${t.name}: supplier logs=${bulk.count}`);
      } catch (e) {
        this.logger.error(`Reminders failed for tenant ${t.id}: ${String(e)}`);
      }
    }

    this.logger.log(
      `Cron done — WA API sent suppliers=${supplierApiSent} customers=${customerApiSent}`,
    );
  }

  /** 03:00 — clean expired supplier archives. Product archives are kept forever (sales history). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'purge-expired-archives' })
  async purgeExpiredArchives() {
    if ((process.env.ARCHIVE_PURGE_CRON || 'on').toLowerCase() === 'off') {
      this.logger.debug('Archive purge cron disabled (ARCHIVE_PURGE_CRON=off)');
      return;
    }
    const days = Math.max(1, Number(process.env.ARCHIVE_RETENTION_DAYS || 30) || 30);
    try {
      // Products are never auto-removed — keep Archived list + invoice/customer history.
      const suppliers = await this.inventory.purgeExpiredArchivedSuppliers(days);
      this.logger.log(
        `Archive purge (${days}d): products skipped (kept forever) · suppliers purged=${suppliers.purged}`,
      );
    } catch (e) {
      this.logger.error(`Archive purge failed: ${String(e)}`);
    }
  }
}
