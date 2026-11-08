import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { SubscriptionsProcessor } from './subscription-processor.service';
import { SubscriptionsScheduler } from './subscriptions.scheduler';

describe('SubscriptionsScheduler', () => {
  let processDue: jest.Mock;

  const build = async (imports: unknown[] = []) =>
    Test.createTestingModule({
      imports: imports as never[],
      providers: [
        SubscriptionsScheduler,
        { provide: SubscriptionsProcessor, useValue: { processDue } },
      ],
    }).compile();

  beforeEach(() => {
    processDue = jest.fn().mockResolvedValue({ charged: 2, failed: [] });
  });

  it('delegates to processDue for all users with the current time', async () => {
    const moduleRef = await build();
    const before = Date.now();
    await moduleRef.get(SubscriptionsScheduler).handleCron();

    expect(processDue).toHaveBeenCalledTimes(1);
    const [now, opts] = processDue.mock.calls[0] as [Date, unknown];
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
    expect(opts).toBeUndefined();
  });

  it('never throws, even if processing fails (the next day runs again)', async () => {
    processDue.mockRejectedValue(new Error('database down'));
    const moduleRef = await build();
    await expect(
      moduleRef.get(SubscriptionsScheduler).handleCron(),
    ).resolves.toBeUndefined();
  });

  it('registers exactly one cron job at 00:05 UTC', async () => {
    const moduleRef = await build([ScheduleModule.forRoot()]);
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const jobs = [...app.get(SchedulerRegistry).getCronJobs().values()];
      expect(jobs).toHaveLength(1);
      expect(String(jobs[0].cronTime.source)).toBe('5 0 * * *');
      expect(jobs[0].cronTime.timeZone).toBe('UTC');
    } finally {
      await app.close();
    }
  });
});
