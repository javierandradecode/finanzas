import { Transform } from 'class-transformer';
import {
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

export class CreateCreditCardDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  limitCents!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualRatePercent?: number;

  @IsOptional()
  @IsInt()
  initialDebtCents?: number;
}
