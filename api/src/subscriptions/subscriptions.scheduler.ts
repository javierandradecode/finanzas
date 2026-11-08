import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionsProcessor } from './subscription-processor.service';

/**
 * Only the schedule lives here; all the logic is in `SubscriptionsProcessor`,
 * which tests can call with any date. The job runs every day at 00:05 UTC.
 */
@Injectable()
export class SubscriptionsScheduler {
  private readonly logger = new Logger(SubscriptionsScheduler.name);

  constructor(private readonly processor: SubscriptionsProcessor) {}

  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async handleCron(): Promise<void> {
    try {
      const { charged, failed } = await this.processor.processDue(new Date());
      this.logger.log(
        `Subscription run finished: ${charged} charged, ${failed.length} failed`,
      );
    } catch (error) {
      // Never let a failed run kill the job: tomorrow's run picks everything up.
      this.logger.error(
        'Subscription run failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
