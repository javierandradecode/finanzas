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
import { CreateInstallmentPurchaseDto } from './dto/create-installment-purchase.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import {
  ListInstallmentPurchasesQuery,
  ProjectionQuery,
} from './dto/projection.query';
import { UpdateInstallmentPurchaseDto } from './dto/update-installment-purchase.dto';
import { InstallmentPurchasesService } from './installment-purchases.service';

@Controller('installment-purchases')
export class InstallmentPurchasesController {
  constructor(private readonly purchases: InstallmentPurchasesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListInstallmentPurchasesQuery,
  ) {
    return this.purchases.findAll(user.userId, query);
  }

  // Declared before ':id' so "projection" is not parsed as an id.
  @Get('projection')
  projection(@CurrentUser() user: AuthUser, @Query() query: ProjectionQuery) {
    return this.purchases.projection(user.userId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.purchases.findOne(user.userId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInstallmentPurchaseDto,
  ) {
    return this.purchases.create(user.userId, dto);
  }

  @Post(':id/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: PayInstallmentDto,
  ) {
    return this.purchases.payNext(user.userId, id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateInstallmentPurchaseDto,
  ) {
    return this.purchases.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.purchases.remove(user.userId, id);
  }
}
