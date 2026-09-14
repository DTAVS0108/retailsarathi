import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('technicians')
  listTechnicians(@CurrentUser() user: JwtPayload) {
    return this.users.listTechnicians(user.tenantId);
  }

  @Get()
  listUsers(@CurrentUser() user: JwtPayload) {
    return this.users.listActiveUsers(user.tenantId);
  }
}
