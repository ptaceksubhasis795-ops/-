import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { AppModule } from './app.module';

function assertProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (process.env.REPOSITORY_MODE !== 'prisma') missing.push('REPOSITORY_MODE=prisma');
  if (!process.env.PUBLIC_API_BASE_URL || !/^https:\/\//.test(process.env.PUBLIC_API_BASE_URL)) missing.push('PUBLIC_API_BASE_URL');
  if (process.env.WECHAT_MCHID && (!process.env.WECHAT_PLATFORM_CERT_PATH || !process.env.WECHAT_PLATFORM_CERT_SERIAL_NO)) missing.push('WECHAT_PLATFORM_CERT_PATH/WECHAT_PLATFORM_CERT_SERIAL_NO');
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32 || process.env.AUTH_SECRET.includes('change-')) missing.push('AUTH_SECRET');
  if (!process.env.FIELD_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY.length < 32 || process.env.FIELD_ENCRYPTION_KEY.includes('change-')) missing.push('FIELD_ENCRYPTION_KEY');
  let staffAccounts: unknown = [];
  try { staffAccounts = JSON.parse(process.env.STAFF_ACCOUNTS_JSON || '[]'); } catch { staffAccounts = []; }
  if (!Array.isArray(staffAccounts) || staffAccounts.length === 0) missing.push('STAFF_ACCOUNTS_JSON');
  if (missing.length) throw new Error(`生产配置不完整：${missing.join('、')}`);
}

async function bootstrap() {
  assertProductionConfiguration();
  const app = await NestFactory.create(AppModule, { cors: true, bodyParser: false });
  app.use(express.json({ verify: (request: any, _response, buffer) => { request.rawBody = Buffer.from(buffer); } }));
  app.use(express.urlencoded({ extended: true }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('九转健康商城 API')
    .setDescription('消费者小程序、销售中心和管理后台的统一接口')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(Number(process.env.PORT || 3000));
}

void bootstrap();
