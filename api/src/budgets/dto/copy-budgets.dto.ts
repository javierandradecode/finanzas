import { Matches } from 'class-validator';
import { MONTH_PATTERN } from '../../reports/months';

export class CopyBudgetsDto {
  /** Month to copy from, "YYYY-MM". */
  @Matches(MONTH_PATTERN, { message: 'from must look like 2026-03' })
  from!: string;

  /** Month to copy into, "YYYY-MM". */
  @Matches(MONTH_PATTERN, { message: 'to must look like 2026-04' })
  to!: string;
}
