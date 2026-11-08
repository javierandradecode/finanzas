import { IsOptional, Matches } from 'class-validator';
import { MONTH_PATTERN } from '../../reports/months';

export class ListBudgetsQuery {
  /** "YYYY-MM"; defaults to the current month (UTC). */
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month must look like 2026-03' })
  month?: string;
}
