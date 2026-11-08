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
import { CreditCardsService } from './credit-cards.service';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { StatementQuery } from './dto/statement.query';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';
import { StatementService } from './statement.service';

@Controller('credit-cards')
export class CreditCardsController {
  constructor(
    private readonly cards: CreditCardsService,
    private readonly statements: StatementService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.cards.findAll(user.userId, includeArchived === 'true');
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.cards.findOne(user.userId, id);
  }

  @Get(':id/statement')
  statement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: StatementQuery,
  ) {
    return this.statements.build(user.userId, id, query.date ?? new Date());
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCreditCardDto) {
    return this.cards.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCreditCardDto,
  ) {
    return this.cards.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.cards.archive(user.userId, id);
  }
}
