import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  branchId?: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const Public = () => SetMetadata('isPublic', true);

export interface PlatformAdminPayload {
  sub: string;
  email: string;
  platformAdmin: true;
}

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformAdminPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.platformAdmin;
  },
);
