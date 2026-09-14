import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.shopName,
        gstin: dto.gstin,
        stateCode: dto.stateCode ?? '27',
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        branches: {
          create: {
            name: 'Main Branch',
            address: dto.address ?? '',
            stateCode: dto.stateCode ?? '27',
            isDefault: true,
          },
        },
      },
      include: { branches: true },
    });

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        branchId: tenant.branches[0].id,
        email: dto.email,
        passwordHash,
        name: dto.ownerName,
        role: 'OWNER',
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true, branch: true },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async updateMe(
    userId: string,
    data: { name?: string; currentPassword?: string; newPassword?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const update: { name?: string; passwordHash?: string } = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      update.name = name;
    }

    if (data.newPassword !== undefined && data.newPassword.length > 0) {
      if (!data.currentPassword) {
        throw new BadRequestException('Current password is required to set a new password');
      }
      const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!valid) throw new UnauthorizedException('Current password is incorrect');
      if (data.newPassword.length < 6) {
        throw new BadRequestException('New password must be at least 6 characters');
      }
      update.passwordHash = await bcrypt.hash(data.newPassword, 10);
    }

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No changes provided');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: update,
      include: { tenant: true, branch: true },
    });
    const { passwordHash: _, ...safe } = updated;
    return safe;
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    tenantId: string;
    branchId: string | null;
    role: string;
    name: string;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      branchId: user.branchId ?? undefined,
      role: user.role,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
      },
    };
  }
}
