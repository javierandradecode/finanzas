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
import { monthKeyOf } from '../reports/months';
import { BudgetsService } from './budgets.service';
import { CopyBudgetsDto } from './dto/copy-budgets.dto';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { ListBudgetsQuery } from './dto/list-budgets.query';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListBudgetsQuery) {
    return this.budgets.findAll(
      user.userId,
      query.month ?? monthKeyOf(new Date()),
    );
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgets.create(user.userId, dto);
  }

  /** Copies every budget of `from` into `to` (declared before ':id' routes). */
  @Post('copy')
  @HttpCode(200)
  copy(@CurrentUser() user: AuthUser, @Body() dto: CopyBudgetsDto) {
    return this.budgets.copy(user.userId, dto.from, dto.to);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgets.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.budgets.remove(user.userId, id);
  }
}
