import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ApiController } from './api.controller';
import { BusinessService } from './domain/business.service';
import { MemoryStore } from './domain/memory.store';
import { OperationsService } from './domain/operations.service';
import { OperationsController } from './operations.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthService } from './security/auth.service';
import { AuthController } from './auth.controller';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ReconciliationScheduler } from './jobs/reconciliation.scheduler';
import { PaymentController } from './payment.controller';
import { ExportService } from './export/export.service';
import { ExportController } from './export/export.controller';
import { LogisticsController } from './logistics.controller';
import { SessionGuard } from './security/session.guard';
import { FilesController } from './files.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot(), IntegrationsModule, InfrastructureModule],
  controllers: [ApiController, OperationsController, AuthController, PaymentController, ExportController, LogisticsController, FilesController],
  providers: [MemoryStore, BusinessService, OperationsService, AuthService, ReconciliationScheduler, ExportService, { provide: APP_GUARD, useClass: SessionGuard }]
})
export class AppModule {}
