import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sendWhatsAppWithOptionalMedia } from '../common/whatsapp.util';
import { SendNotificationDto, CreateTemplateDto } from './dto/notification.dto';

type DispatchResult = { providerMessageId?: string };

@Injectable()
export class NotificationsService {
  private emailTransport: nodemailer.Transporter | null | undefined;

  constructor(private prisma: PrismaService) {}

  async getTemplates(tenantId: string) {
    return this.prisma.notificationTemplate.findMany({ where: { tenantId, isActive: true } });
  }

  async createTemplate(tenantId: string, dto: CreateTemplateDto) {
    return this.prisma.notificationTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        channel: dto.channel as NotificationChannel,
        body: dto.body,
        variables: dto.variables ?? [],
      },
    });
  }

  async send(tenantId: string, dto: SendNotificationDto) {
    let body = dto.body ?? '';
    let templateId = dto.templateId;

    if (dto.templateId) {
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { id: dto.templateId, tenantId },
      });
      if (template) {
        body = this.interpolate(template.body, dto.variables ?? {});
      }
    } else if (dto.templateName) {
      // Look up by name; if the tenant hasn't created this template yet, fall back to the
      // caller-supplied body rather than failing the send — no forced per-tenant seeding step.
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { tenantId, name: dto.templateName, isActive: true },
      });
      if (template) {
        templateId = template.id;
        body = this.interpolate(template.body, dto.variables ?? {});
      }
    }

    const log = await this.prisma.notificationLog.create({
      data: {
        tenantId,
        templateId,
        channel: dto.channel as NotificationChannel,
        recipient: dto.recipient,
        body,
        status: 'PENDING',
      },
    });

    return this.attemptSend(log.id, dto.channel, dto.recipient, body);
  }

  /** Re-attempts a FAILED log through the same unified sender, updating the same row. */
  async retry(tenantId: string, logId: string) {
    const log = await this.prisma.notificationLog.findFirst({ where: { id: logId, tenantId } });
    if (!log) throw new NotFoundException('Notification log not found');
    if (log.status !== 'FAILED') throw new BadRequestException('Only a failed send can be retried');
    return this.attemptSend(log.id, log.channel, log.recipient, log.body);
  }

  private async attemptSend(logId: string, channel: string, recipient: string, body: string) {
    try {
      const result = await this.dispatch(channel, recipient, body);
      return this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'SENT', sentAt: new Date(), error: null, providerMessageId: result.providerMessageId },
      });
    } catch (err) {
      return this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'FAILED', error: String(err) },
      });
    }
  }

  /** Fallback for providers with no delivery webhook, or while testing without one configured. */
  async markDeliveryStatus(tenantId: string, logId: string, delivered: boolean) {
    const log = await this.prisma.notificationLog.findFirst({ where: { id: logId, tenantId } });
    if (!log) throw new NotFoundException('Notification log not found');
    return this.prisma.notificationLog.update({
      where: { id: logId },
      data: delivered ? { deliveredAt: new Date() } : { status: 'FAILED', error: 'Marked failed manually' },
    });
  }

  /**
   * Provider delivery-status callback. No JWT (external providers can't send one) — trusted via
   * a shared secret instead, same model as the bank-reconcile AA callback route.
   */
  async handleDeliveryWebhook(secret: string, providerMessageId: string, status: 'delivered' | 'failed') {
    if (!process.env.NOTIFICATION_WEBHOOK_SECRET || secret !== process.env.NOTIFICATION_WEBHOOK_SECRET) {
      throw new BadRequestException('Invalid webhook secret');
    }
    const log = await this.prisma.notificationLog.findFirst({ where: { providerMessageId } });
    if (!log) return { ok: false, reason: 'no matching log' };
    await this.prisma.notificationLog.update({
      where: { id: log.id },
      data: status === 'delivered' ? { deliveredAt: new Date() } : { status: 'FAILED', error: 'Provider reported delivery failure' },
    });
    return { ok: true };
  }

  async getLogs(tenantId: string) {
    return this.prisma.notificationLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

  private getEmailTransport(): nodemailer.Transporter | null {
    if (this.emailTransport !== undefined) return this.emailTransport;
    const host = process.env.EMAIL_SMTP_HOST?.trim();
    const port = process.env.EMAIL_SMTP_PORT?.trim();
    const user = process.env.EMAIL_SMTP_USER?.trim();
    const pass = process.env.EMAIL_SMTP_PASS?.trim();
    if (!host || !user || !pass) {
      this.emailTransport = null;
      return null;
    }
    this.emailTransport = nodemailer.createTransport({
      host,
      port: port ? parseInt(port, 10) : 587,
      secure: port === '465',
      auth: { user, pass },
    });
    return this.emailTransport;
  }

  private async dispatch(channel: string, recipient: string, body: string): Promise<DispatchResult> {
    const dryRun = process.env.NOTIFICATION_DRY_RUN !== 'false';
    if (dryRun) {
      console.log(`[Notification dry-run] ${channel} → ${recipient}: ${body.slice(0, 120)}`);
      return {};
    }

    if (channel === 'SMS' && process.env.MSG91_AUTH_KEY) {
      const phone = recipient.replace(/\D/g, '');
      const res = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY },
        body: JSON.stringify({
          template_id: process.env.MSG91_TEMPLATE_ID,
          recipients: [{ mobiles: phone, var: body }],
        }),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error(`MSG91 failed: ${res.status}`);
      return { providerMessageId: typeof data.request_id === 'string' ? data.request_id : undefined };
    }

    if (channel === 'WHATSAPP') {
      // Single shared WhatsApp sender — same one used by customer statements and reminder crons.
      const result = await sendWhatsAppWithOptionalMedia({ phone: recipient, text: body });
      if (!result.sent) {
        if (result.mode === 'link') {
          throw new Error('No WHATSAPP_API_URL configured — dry-run link only, not actually sent');
        }
        throw new Error(result.error || 'WhatsApp send failed');
      }
      return {};
    }

    if (channel === 'EMAIL') {
      const transport = this.getEmailTransport();
      if (!transport) {
        console.log(`[Notification fallback] EMAIL → ${recipient}: ${body.slice(0, 80)}... (no EMAIL_SMTP_* configured)`);
        return {};
      }
      const info = await transport.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
        to: recipient,
        subject: 'RetailSarathi notification',
        text: body,
      });
      return { providerMessageId: info.messageId };
    }

    console.log(`[Notification fallback] ${channel} → ${recipient}: ${body.slice(0, 80)}...`);
    return {};
  }

  // ─── Bulk / broadcast send ───────────────────────────────────────

  private async resolveAudience(
    tenantId: string,
    audience: { type: 'customers' | 'staff'; filter?: { hasOutstandingBalance?: boolean; segment?: string } },
  ) {
    if (audience.type === 'staff') {
      return this.prisma.user.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, phone: true, email: true },
      });
    }
    return this.prisma.customer.findMany({
      where: {
        tenantId,
        ...(audience.filter?.hasOutstandingBalance ? { outstandingBalance: { gt: 0 } } : {}),
        ...(audience.filter?.segment ? { segment: audience.filter.segment as never } : {}),
      },
      select: { id: true, name: true, phone: true, email: true },
    });
  }

  async previewBroadcastAudience(
    tenantId: string,
    audience: { type: 'customers' | 'staff'; filter?: { hasOutstandingBalance?: boolean; segment?: string } },
  ) {
    const recipients = await this.resolveAudience(tenantId, audience);
    return { count: recipients.length };
  }

  async broadcast(
    tenantId: string,
    dto: {
      templateId: string;
      audience: { type: 'customers' | 'staff'; filter?: { hasOutstandingBalance?: boolean; segment?: string } };
    },
  ) {
    const template = await this.prisma.notificationTemplate.findFirst({ where: { id: dto.templateId, tenantId } });
    if (!template) throw new NotFoundException('Template not found');

    const recipients = await this.resolveAudience(tenantId, dto.audience);
    const recipientField = template.channel === 'EMAIL' ? 'email' : 'phone';

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const r of recipients) {
      const recipient = r[recipientField];
      if (!recipient) {
        skipped += 1;
        continue;
      }
      const result = await this.send(tenantId, {
        templateId: template.id,
        channel: template.channel,
        recipient,
        variables: { name: r.name },
      });
      if (result.status === 'SENT') sent += 1;
      else failed += 1;
    }
    return { audienceSize: recipients.length, sent, failed, skipped };
  }
}
