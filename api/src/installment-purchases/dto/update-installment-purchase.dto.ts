import { Transform } from 'class-transformer';
import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Amounts, installments and rate are deliberately not editable. */
export class UpdateInstallmentPurchaseDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  /** `null` clears the subcategory. */
  @IsOptional()
  @IsMongoId()
  subcategoryId?: string | null;
}
