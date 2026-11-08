import { Transform } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';
import { toDate } from '../../transactions/dto/create-transaction.dto';

export class StatementQuery {
  /** Any date inside the wanted period (ISO 8601); defaults to today (UTC). */
  @IsOptional()
  @Transform(toDate)
  @IsDate()
  date?: Date;
}
