import { Transform } from 'class-transformer';
import {
  IsIn,
  IsDate,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TX_TYPES } from '../schemas/transaction.schema';
import type { TxType } from '../transaction-effects';

export const toDate = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? new Date(value) : value;

export class CreateTransactionDto {
  @IsIn(TX_TYPES)
  type!: TxType;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsDate()
  @Transform(toDate)
  date!: Date;

  /** Required for income and transfers; for expenses, give this or `creditCardId`. */
  @IsOptional()
  @IsMongoId()
  accountId?: string;

  @IsOptional()
  @IsMongoId()
  toAccountId?: string;

  /** Expenses paid with a credit card. */
  @IsOptional()
  @IsMongoId()
  creditCardId?: string;

  /** Transfers that pay a credit card. */
  @IsOptional()
  @IsMongoId()
  toCreditCardId?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsMongoId()
  subcategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
