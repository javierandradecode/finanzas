import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { toDate } from '../../transactions/dto/create-transaction.dto';
import { FREQUENCIES } from '../recurrence';
import type { Frequency } from '../recurrence';
import { trim } from './create-subscription.dto';

/** Every field is optional; `accountId`, `creditCardId` and `subcategoryId` accept `null` to clear. */
export class UpdateSubscriptionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsIn(FREQUENCIES)
  frequency?: Frequency;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  nextDate?: Date;

  @IsOptional()
  @IsMongoId()
  accountId?: string | null;

  @IsOptional()
  @IsMongoId()
  creditCardId?: string | null;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsMongoId()
  subcategoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
