import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class ProjectionQuery {
  /** How many months to project, starting with the current one. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months: number = 12;

  @IsOptional()
  @IsMongoId()
  creditCardId?: string;
}

export class ListInstallmentPurchasesQuery {
  @IsOptional()
  @IsMongoId()
  creditCardId?: string;
}
