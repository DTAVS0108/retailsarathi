import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PLANS = [
  {
    code: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    maxUsers: 1,
    maxProducts: 500,
    maxBranches: 1,
    features: [
      'POS billing & GST invoices',
      'Stock & purchase basics',
      '1 user · 1 branch',
      'Up to 500 products',
      'Basic reports',
    ],
  },
  {
    code: 'PRO',
    name: 'Pro',
    priceMonthly: 1499,
    maxUsers: 5,
    maxProducts: 5000,
    maxBranches: 1,
    features: [
      'Everything in Free',
      'Repair workshop module',
      'WhatsApp reminders',
      'Barcode / IMEI scans',
      '5 users · 5,000 products',
      'Priority email support',
    ],
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    priceMonthly: 3999,
    maxUsers: 20,
    maxProducts: 50000,
    maxBranches: 10,
    features: [
      'Everything in Pro',
      'Multi-branch stock & P&L',
      'Analytics & AI insights',
      'E-commerce sync channels',
      'API access',
      '20 users · 10 branches',
    ],
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: 0,
    maxUsers: 999999,
    maxProducts: 999999,
    maxBranches: 999999,
    features: [
      'Everything in Business',
      'Unlimited users, products & branches',
      'Dedicated onboarding & success manager',
      'Custom SLA & priority support',
      'SSO / advanced security (roadmap)',
      'Custom integrations & training',
    ],
  },
];

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async seedPlans() {
    for (const plan of DEFAULT_PLANS) {
      await this.prisma.subscriptionPlan.upsert({
        where: { code: plan.code },
        create: plan,
        update: {
          name: plan.name,
          priceMonthly: plan.priceMonthly,
          maxUsers: plan.maxUsers,
          maxProducts: plan.maxProducts,
          maxBranches: plan.maxBranches,
          features: plan.features,
          isActive: true,
        },
      });
    }
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });
  }

  async getPlans() {
    const count = await this.prisma.subscriptionPlan.count();
    if (count === 0) return this.seedPlans();
    // Keep seeded catalog in sync with product defaults.
    return this.seedPlans();
  }

  async getTenantSubscription(tenantId: string) {
    await this.getPlans();

    let sub = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!sub) {
      const freePlan = await this.prisma.subscriptionPlan.findUnique({
        where: { code: 'FREE' },
      });
      if (!freePlan) throw new NotFoundException('Free plan missing');
      sub = await this.prisma.tenantSubscription.create({
        data: {
          tenantId,
          planId: freePlan.id,
          status: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 14 * 86400000),
        },
        include: { plan: true },
      });
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: 'TRIAL' },
      });
    }

    const usage = await this.getUsage(tenantId);
    const now = Date.now();
    const trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt).getTime() : null;
    const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;

    const usagePct = {
      users: pct(usage.users, sub.plan.maxUsers),
      products: pct(usage.products, sub.plan.maxProducts),
      branches: pct(usage.branches, sub.plan.maxBranches),
    };

    return {
      subscription: sub,
      usage,
      usagePct,
      limits: sub.plan,
      trialDaysLeft:
        sub.status === 'TRIAL' && trialEndsAt
          ? Math.max(0, Math.ceil((trialEndsAt - now) / 86400000))
          : null,
      periodDaysLeft: periodEnd
        ? Math.max(0, Math.ceil((periodEnd - now) / 86400000))
        : null,
      billingNote:
        'Self-serve plans switch instantly in demo. Enterprise is unlimited — connect with our team for custom pricing.',
    };
  }

  async requestEnterpriseContact(
    tenantId: string,
    data: { name: string; phone?: string; email?: string; message?: string },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Name is required');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) throw new NotFoundException('Shop not found');

    const body = [
      `Enterprise plan enquiry for ${tenant.name}`,
      `Contact: ${name}`,
      data.phone?.trim() ? `Phone: ${data.phone.trim()}` : null,
      data.email?.trim() ? `Email: ${data.email.trim()}` : null,
      '',
      data.message?.trim() || 'Please connect us for Enterprise / unlimited pricing.',
    ]
      .filter((line) => line !== null)
      .join('\n');

    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId,
        subject: 'Enterprise plan — connect request',
        body,
        priority: 'high',
        status: 'OPEN',
      },
    });

    return {
      ok: true,
      ticketId: ticket.id,
      message: 'Thanks — our team will connect with you about Enterprise.',
    };
  }

  async changePlan(tenantId: string, planCode: string) {
    const code = planCode?.trim().toUpperCase();
    if (!code) throw new BadRequestException('planCode is required');

    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plan not found');

    const usage = await this.getUsage(tenantId);
    const blockers: string[] = [];
    if (usage.users > plan.maxUsers) {
      blockers.push(`users (${usage.users} used / ${plan.maxUsers} allowed)`);
    }
    if (usage.products > plan.maxProducts) {
      blockers.push(`products (${usage.products} used / ${plan.maxProducts} allowed)`);
    }
    if (usage.branches > plan.maxBranches) {
      blockers.push(`branches (${usage.branches} used / ${plan.maxBranches} allowed)`);
    }
    if (blockers.length) {
      throw new BadRequestException(
        `Cannot switch to ${plan.name}: usage exceeds plan limits for ${blockers.join(', ')}. Reduce usage first, or pick a higher plan.`,
      );
    }

    const current = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (current?.plan.code === plan.code && current.status === 'ACTIVE') {
      return current;
    }

    const sub = await this.prisma.tenantSubscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: plan.id,
        status: 'ACTIVE',
        trialEndsAt: null,
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
      update: {
        planId: plan.id,
        status: 'ACTIVE',
        trialEndsAt: null,
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
      include: { plan: true },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: 'ACTIVE' },
    });

    return {
      ...sub,
      previousPlanCode: current?.plan.code ?? null,
      changed: current?.plan.code !== plan.code,
    };
  }

  async cancelSubscription(tenantId: string) {
    const freePlan = await this.prisma.subscriptionPlan.findUnique({
      where: { code: 'FREE' },
    });
    if (!freePlan) throw new NotFoundException('Free plan missing');

    const usage = await this.getUsage(tenantId);
    if (
      usage.users > freePlan.maxUsers ||
      usage.products > freePlan.maxProducts ||
      usage.branches > freePlan.maxBranches
    ) {
      throw new BadRequestException(
        'Cannot cancel to Free while usage exceeds Free limits. Downgrade usage first, or stay on a paid plan.',
      );
    }

    const sub = await this.prisma.tenantSubscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: freePlan.id,
        status: 'CANCELLED',
        currentPeriodEnd: new Date(),
      },
      update: {
        planId: freePlan.id,
        status: 'CANCELLED',
        currentPeriodEnd: new Date(),
      },
      include: { plan: true },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: 'CANCELLED' },
    });

    return sub;
  }

  async getUsage(tenantId: string) {
    const [users, products, branches] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, isActive: true } }),
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
      this.prisma.branch.count({ where: { tenantId } }),
    ]);
    return { users, products, branches };
  }
}

function pct(used: number, max: number) {
  if (max >= 999999) return 0;
  if (!max || max <= 0) return 100;
  return Math.min(100, Math.round((used / max) * 100));
}
