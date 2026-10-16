import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private notifications: NotificationsService,
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

  /**
   * 09:00 — nudge customers whose repair has been READY for pickup for a while.
   * Repeats daily for as long as the job stays uncollected, mirroring the existing
   * overdue-payment reminder's "nag until resolved" behavior. Disable with REPAIR_REMINDERS_CRON=off.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'repair-pickup-reminders' })
  async runRepairPickupReminders() {
    if ((process.env.REPAIR_REMINDERS_CRON || 'on').toLowerCase() === 'off') {
      this.logger.debug('Repair pickup reminders disabled (REPAIR_REMINDERS_CRON=off)');
      return;
    }
    const days = Math.max(1, Number(process.env.REPAIR_PICKUP_REMINDER_DAYS || 3) || 3);
    const cutoff = new Date(Date.now() - days * 86400000);

    const jobs = await this.prisma.repairJob.findMany({
      where: { status: 'READY', updatedAt: { lte: cutoff } },
      include: { customer: true },
      take: 500,
    });

    let sent = 0;
    for (const job of jobs) {
      if (!job.customer?.phone) continue;
      try {
        const channel = job.customer.whatsappOptIn ? 'WHATSAPP' : 'SMS';
        await this.notifications.send(job.tenantId, {
          channel,
          recipient: job.customer.phone,
          templateName: 'repair_ready_for_pickup',
          body: `Your ${job.deviceModel} (${job.jobNumber}) has been ready for pickup since ${job.updatedAt.toDateString()}. Please collect it at your earliest convenience.`,
          variables: { deviceModel: job.deviceModel, jobNumber: job.jobNumber },
        });
        sent += 1;
      } catch (e) {
        this.logger.warn(`Repair pickup reminder ${job.id}: ${String(e)}`);
      }
    }
    this.logger.log(`Repair pickup reminders sent=${sent}`);
  }

  /**
   * 09:00 — warn customers whose repair warranty is about to expire. Sent once per job (dedupes
   * against a NotificationLog already created within the warranty-expiring window), unlike the
   * pickup reminder above which intentionally repeats — a warranty deadline is a one-time event.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'repair-warranty-reminders' })
  async runRepairWarrantyReminders() {
    if ((process.env.REPAIR_REMINDERS_CRON || 'on').toLowerCase() === 'off') return;
    const windowDays = Math.max(1, Number(process.env.REPAIR_WARRANTY_REMINDER_DAYS || 7) || 7);
    const now = new Date();
    const horizon = new Date(now.getTime() + windowDays * 86400000);
    const sentSince = new Date(now.getTime() - windowDays * 86400000);

    const jobs = await this.prisma.repairJob.findMany({
      where: { status: 'DELIVERED', warrantyEndsAt: { gte: now, lte: horizon } },
      include: { customer: true },
      take: 500,
    });

    let sent = 0;
    for (const job of jobs) {
      if (!job.customer?.phone) continue;
      const already = await this.prisma.notificationLog.findFirst({
        where: {
          tenantId: job.tenantId,
          recipient: job.customer.phone,
          body: { contains: job.jobNumber },
          createdAt: { gte: sentSince },
        },
      });
      if (already) continue;
      try {
        const channel = job.customer.whatsappOptIn ? 'WHATSAPP' : 'SMS';
        await this.notifications.send(job.tenantId, {
          channel,
          recipient: job.customer.phone,
          templateName: 'repair_warranty_expiring',
          body: `The warranty on your ${job.deviceModel} repair (${job.jobNumber}) ends on ${job.warrantyEndsAt?.toDateString()}. Contact us before then for any warranty claims.`,
          variables: {
            deviceModel: job.deviceModel,
            jobNumber: job.jobNumber,
            warrantyEndsAt: job.warrantyEndsAt?.toDateString() ?? '',
          },
        });
        sent += 1;
      } catch (e) {
        this.logger.warn(`Repair warranty reminder ${job.id}: ${String(e)}`);
      }
    }
    this.logger.log(`Repair warranty reminders sent=${sent}`);
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
