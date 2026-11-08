import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, QueryFilter, Types } from 'mongoose';
import { TransactionsService } from '../transactions/transactions.service';
import { nextOccurrence, startOfUtcDay } from './recurrence';
import {
  Subscription,
  SubscriptionDocument,
} from './schemas/subscription.schema';

/** Safety cap: at most this many charges per subscription in one run. */
export const MAX_CATCH_UP = 366;

export interface ProcessSummary {
  charged: number;
  failed: Array<{ subscriptionId: string; name: string; error: string }>;
}

/** Thrown inside the transaction when another run already took this charge. */
class ChargeAlreadyClaimed extends Error {}

/**
 * Turns due subscriptions into expenses.
 *
 * Each charge is its own MongoDB transaction that (1) claims the due date by
 * advancing `nextDate` with a condition on its current value and (2) creates
 * the expense. The claim makes runs idempotent and safe when two run at once:
 * whoever loses the claim stops without creating anything.
 */
@Injectable()
export class SubscriptionsProcessor {
  private readonly logger = new Logger(SubscriptionsProcessor.name);

  constructor(
    @InjectModel(Subscription.name) private readonly model: Model<Subscription>,
    @InjectConnection() private readonly connection: Connection,
    private readonly transactions: TransactionsService,
  ) {}

  async processDue(
    now: Date,
    opts: { userId?: string } = {},
  ): Promise<ProcessSummary> {
    const today = startOfUtcDay(now);
    const filter: QueryFilter<Subscription> = {
      active: true,
      nextDate: { $lte: today },
    };
    if (opts.userId) filter.userId = new Types.ObjectId(opts.userId);

    const due = await this.model
      .find(filter)
      .sort({ nextDate: 1, _id: 1 })
      .exec();
    const summary: ProcessSummary = { charged: 0, failed: [] };
    for (const subscription of due) {
      await this.processOne(subscription, today, summary);
    }
    return summary;
  }

  private async processOne(
    subscription: SubscriptionDocument,
    today: Date,
    summary: ProcessSummary,
  ): Promise<void> {
    let occurrence = subscription.nextDate;
    for (
      let i = 0;
      i < MAX_CATCH_UP && occurrence.getTime() <= today.getTime();
      i++
    ) {
      const next = nextOccurrence(
        occurrence,
        subscription.frequency,
        subscription.anchorDay,
      );
      try {
        await this.chargeOnce(subscription, occurrence, next);
        summary.charged += 1;
        occurrence = next;
      } catch (error) {
        if (error instanceof ChargeAlreadyClaimed) return;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `"${subscription.name}" could not be charged: ${message}`,
        );
        await this.model
          .updateOne(
            { _id: subscription._id },
            { $set: { lastError: message, lastErrorAt: new Date() } },
          )
          .exec();
        summary.failed.push({
          subscriptionId: String(subscription._id),
          name: subscription.name,
          error: message,
        });
        return;
      }
    }
  }

  private chargeOnce(
    subscription: SubscriptionDocument,
    occurrence: Date,
    next: Date,
  ): Promise<void> {
    return this.connection.transaction(async (session) => {
      const claimed = await this.model
        .findOneAndUpdate(
          {
            _id: subscription._id,
            userId: subscription.userId,
            active: true,
            nextDate: occurrence,
          },
          {
            $set: { nextDate: next },
            $unset: { lastError: '', lastErrorAt: '' },
          },
          { session, returnDocument: 'after' },
        )
        .exec();
      if (!claimed) throw new ChargeAlreadyClaimed();

      await this.transactions.createWithin(session, String(claimed.userId), {
        type: 'expense',
        amountCents: claimed.amountCents,
        date: occurrence,
        accountId: claimed.accountId ? String(claimed.accountId) : undefined,
        creditCardId: claimed.creditCardId
          ? String(claimed.creditCardId)
          : undefined,
        categoryId: String(claimed.categoryId),
        subcategoryId: claimed.subcategoryId
          ? String(claimed.subcategoryId)
          : undefined,
        note: claimed.name,
        source: 'subscription',
        subscriptionId: String(claimed._id),
      });
    });
  }
}
