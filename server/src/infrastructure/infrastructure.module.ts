import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaSyncService } from './prisma-sync.service';

@Global()
@Module({ providers: [PrismaService, PrismaSyncService], exports: [PrismaService, PrismaSyncService] })
export class InfrastructureModule {}
