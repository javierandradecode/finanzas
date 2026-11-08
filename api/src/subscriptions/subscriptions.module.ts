import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionsModule } from '../transactions/transactions.module';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';
import { SubscriptionsProcessor } from './subscription-processor.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsScheduler } from './subscriptions.scheduler';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    TransactionsModule,
  ],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionsProcessor,
    SubscriptionsScheduler,
  ],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
