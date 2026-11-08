import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpcomingQuery {
  /** How many days ahead to look. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days: number = 30;
}
