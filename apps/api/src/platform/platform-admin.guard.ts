import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const payload = this.jwt.verify(auth.slice(7));
      if (!payload.platformAdmin) throw new UnauthorizedException();
      req.platformAdmin = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
