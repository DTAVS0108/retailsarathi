import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') ?? 'dev-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAdminGuard],
  exports: [PlatformService],
})
export class PlatformModule {}
