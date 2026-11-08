import { Transform } from 'class-transformer';
import {
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

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSubscriptionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsIn(FREQUENCIES)
  frequency!: Frequency;

  /** Date of the first (next) charge. */
  @Transform(toDate)
  @IsDate()
  nextDate!: Date;

  /** Exactly one of accountId / creditCardId. */
  @IsOptional()
  @IsMongoId()
  accountId?: string;

  @IsOptional()
  @IsMongoId()
  creditCardId?: string;

  @IsMongoId()
  categoryId!: string;

  @IsOptional()
  @IsMongoId()
  subcategoryId?: string;
}
