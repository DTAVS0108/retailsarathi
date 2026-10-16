import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // auth.module.ts / jwt.strategy.ts / platform.module.ts all fall back to a hardcoded
  // 'dev-secret' when JWT_SECRET is unset — harmless in dev, but would silently let a
  // production deploy sign and verify tokens with a public, guessable secret. Fail loudly
  // here instead, before the app (and that fallback) ever gets used.
  if ((process.env.NODE_ENV ?? 'development') === 'production' && !process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET must be set in production. Refusing to start with the dev fallback secret.');
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // OCR paste / parse-purchase can exceed Express default 100kb JSON limit.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express') as typeof import('express');
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  const configuredOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (
        !origin ||
        isDev ||
        configuredOrigins.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
        /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)[\d.]+(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('RetailSarathi API')
    .setDescription('Retail management API for Indian electronics shops')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`RetailSarathi API running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
