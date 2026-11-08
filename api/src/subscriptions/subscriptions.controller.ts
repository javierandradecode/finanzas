import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpcomingQuery } from './dto/upcoming.query';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsProcessor } from './subscription-processor.service';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly processor: SubscriptionsProcessor,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.subscriptions.findAll(user.userId);
  }

  // "upcoming" and "process-due" are declared before ':id' so they are not read as ids.
  @Get('upcoming')
  upcoming(@CurrentUser() user: AuthUser, @Query() query: UpcomingQuery) {
    return this.subscriptions.upcoming(user.userId, query.days);
  }

  /** Charges the authenticated user's due subscriptions right now. */
  @Post('process-due')
  @HttpCode(200)
  processDue(@CurrentUser() user: AuthUser) {
    return this.processor.processDue(new Date(), { userId: user.userId });
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.subscriptions.findOne(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubscriptionDto) {
    return this.subscriptions.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptions.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  pause(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.subscriptions.pause(user.userId, id);
  }
}
