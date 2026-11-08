import { IsInt, IsMongoId, Matches, Min } from 'class-validator';
import { MONTH_PATTERN } from '../../reports/months';

export class CreateBudgetDto {
  @IsMongoId()
  categoryId!: string;

  /** "YYYY-MM". */
  @Matches(MONTH_PATTERN, { message: 'month must look like 2026-03' })
  month!: string;

  @IsInt()
  @Min(1)
  limitCents!: number;
}
