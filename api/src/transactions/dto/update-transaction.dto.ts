import { Transform } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TX_TYPES } from '../schemas/transaction.schema';
import type { TxType } from '../transaction-effects';
import { toDate } from './create-transaction.dto';

/**
 * Every field is optional. `toAccountId`, `categoryId`, `subcategoryId` and
 * `note` accept `null` to clear them (IsOptional lets null through).
 */
export class UpdateTransactionDto {
  @IsOptional()
  @IsIn(TX_TYPES)
  type?: TxType;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsMongoId()
  accountId?: string | null;

  @IsOptional()
  @IsMongoId()
  toAccountId?: string | null;

  @IsOptional()
  @IsMongoId()
  creditCardId?: string | null;

  @IsOptional()
  @IsMongoId()
  toCreditCardId?: string | null;

  @IsOptional()
  @IsMongoId()
  categoryId?: string | null;

  @IsOptional()
  @IsMongoId()
  subcategoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
