import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BusinessService } from '../domain/business.service';
import { OperationsService } from '../domain/operations.service';

@Injectable()
export class ReconciliationScheduler {
  private readonly logger = new Logger(ReconciliationScheduler.name);

  constructor(private readonly business: BusinessService, private readonly operations: OperationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  run() {
    const result = this.business.reconcileScheduledJobs({ id: 'system-scheduler', role: 'admin' });
    const settings: any = this.operations.settings({ id: 'system-scheduler', role: 'admin' });
    const weekday = Number(settings.settlementWeekday ?? 1);
    const settlement = new Date().getUTCDay() === weekday ? this.operations.settleRewards({ id: 'system-scheduler', role: 'admin' }) : undefined;
    if (result.cancelled || result.received || settlement) this.logger.log(`order reconciliation cancelled=${result.cancelled} received=${result.received}${settlement ? ` settlement=${settlement.count || 0}` : ''}`);
  }
}
