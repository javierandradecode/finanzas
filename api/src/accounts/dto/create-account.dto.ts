import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ACCOUNT_TYPES } from '../schemas/account.schema';
import type { AccountType } from '../schemas/account.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAccountDto {
  @IsIn(ACCOUNT_TYPES)
  type!: AccountType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  initialBalanceCents?: number;
}
