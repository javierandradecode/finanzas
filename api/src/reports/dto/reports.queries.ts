import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { MONTH_PATTERN } from '../months';

const MONTH_MESSAGE = 'must look like 2026-03';

/** Day range for spending reports; a date-only `to` covers that whole day (UTC). */
export class SpendingQuery {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

/** Month range ("YYYY-MM") for the monthly reports. */
export class MonthRangeQuery {
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: `from ${MONTH_MESSAGE}` })
  from?: string;

  @IsOptional()
  @Matches(MONTH_PATTERN, { message: `to ${MONTH_MESSAGE}` })
  to?: string;
}

export class MonthQuery {
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: `month ${MONTH_MESSAGE}` })
  month?: string;
}

export class CardDebtQuery {
  /** How many months of installment payments to project. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months: number = 12;
}
