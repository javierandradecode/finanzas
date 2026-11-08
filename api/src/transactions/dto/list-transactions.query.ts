import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { TX_TYPES } from '../schemas/transaction.schema';
import type { TxType } from '../transaction-effects';

export class ListTransactionsQuery {
  /** ISO 8601 date or datetime, inclusive. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** ISO 8601, inclusive. A date-only value covers that whole day (UTC). */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(TX_TYPES)
  type?: TxType;

  /** Matches the origin account or, for transfers, the destination. */
  @IsOptional()
  @IsMongoId()
  accountId?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
