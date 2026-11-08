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
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.accounts.findAll(user.userId, includeArchived === 'true');
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.accounts.findOne(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.accounts.archive(user.userId, id);
  }
}
