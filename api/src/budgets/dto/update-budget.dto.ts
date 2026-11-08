import { IsInt, Min } from 'class-validator';

/** Only the limit can change; to move a budget, delete it and create another. */
export class UpdateBudgetDto {
  @IsInt()
  @Min(1)
  limitCents!: number;
}
