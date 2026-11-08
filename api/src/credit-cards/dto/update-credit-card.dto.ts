import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Deliberately has no debt field: debt only changes through transactions. */
export class UpdateCreditCardDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limitCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualRatePercent?: number;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
