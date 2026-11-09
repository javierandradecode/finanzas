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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  ListTransactionsQuery,
  TransactionFilters,
} from './dto/list-transactions.query';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTransactionsQuery,
  ) {
    return this.transactions.findAll(user.userId, query);
  }

  /** Declared before `:id` so "summary" is not read as an id. */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: TransactionFilters) {
    return this.transactions.summary(user.userId, query);
  }

  /** Declared before `:id` so "export" is not read as an id. */
  @Get('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Query() query: TransactionFilters,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.transactions.exportCsv(user.userId, query);
    const today = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="movimientos-${today}.csv"`,
    });
    return csv;
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.transactions.findOne(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransactionDto) {
    return this.transactions.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.transactions.remove(user.userId, id);
  }
}
