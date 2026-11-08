import { Transform } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toDate } from '../../transactions/dto/create-transaction.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateInstallmentPurchaseDto {
  @IsMongoId()
  creditCardId!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description!: string;

  @IsMongoId()
  categoryId!: string;

  @IsOptional()
  @IsMongoId()
  subcategoryId?: string;

  /** Principal in cents. */
  @IsInt()
  @Min(1)
  totalCents!: number;

  @IsInt()
  @Min(2)
  @Max(60)
  installments!: number;

  /** Yearly interest rate; 0 (default) means interest-free. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  annualRatePercent?: number;

  @Transform(toDate)
  @IsDate()
  startDate!: Date;
}
