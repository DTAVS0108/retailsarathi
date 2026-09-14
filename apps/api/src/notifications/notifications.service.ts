import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto, CreateTemplateDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
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

    if (dto.templateId) {
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { id: dto.templateId, tenantId },
      });
      if (template) {
        body = this.interpolate(template.body, dto.variables ?? {});
      }
    }

    const log = await this.prisma.notificationLog.create({
      data: {
        tenantId,
        templateId: dto.templateId,
        channel: dto.channel as NotificationChannel,
        recipient: dto.recipient,
        body,
        status: 'PENDING',
      },
    });

    try {
      await this.dispatch(dto.channel, dto.recipient, body);
      return this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      return this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: String(err) },
      });
    }
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

  private async dispatch(channel: string, recipient: string, body: string) {
    const dryRun = process.env.NOTIFICATION_DRY_RUN !== 'false';
    if (dryRun) {
      console.log(`[Notification dry-run] ${channel} → ${recipient}: ${body.slice(0, 120)}`);
      return;
    }

    const phone = recipient.replace(/\D/g, '');

    if (channel === 'SMS' && process.env.MSG91_AUTH_KEY) {
      const res = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: process.env.MSG91_AUTH_KEY,
        },
        body: JSON.stringify({
          template_id: process.env.MSG91_TEMPLATE_ID,
          recipients: [{ mobiles: phone, var: body }],
        }),
      });
      if (!res.ok) throw new Error(`MSG91 failed: ${res.status}`);
      return;
    }

    if (channel === 'WHATSAPP' && process.env.WHATSAPP_API_URL) {
      const res = await fetch(process.env.WHATSAPP_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN ?? ''}`,
        },
        body: JSON.stringify({ to: phone, message: body }),
      });
      if (!res.ok) throw new Error(`WhatsApp API failed: ${res.status}`);
      return;
    }

    console.log(`[Notification fallback] ${channel} → ${recipient}: ${body.slice(0, 80)}...`);
  }
}
