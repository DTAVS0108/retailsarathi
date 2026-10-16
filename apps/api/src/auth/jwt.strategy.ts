import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
    });
  }

  /**
   * A narrow, deliberate addition: one indexed PK lookup so a platform-admin "suspend tenant"
   * action actually blocks access instead of being purely cosmetic. Only tenant payloads are
   * checked — a platform-admin JWT has no tenantId and never reaches this branch.
   */
  async validate(payload: JwtPayload) {
    if (payload.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: payload.tenantId },
        select: { isSuspended: true },
      });
      if (tenant?.isSuspended) {
        throw new UnauthorizedException("This shop's account has been suspended. Contact support.");
      }
    }
    return payload;
  }
}
