import { Transform } from 'class-transformer';
import { IsDate, IsMongoId, IsOptional } from 'class-validator';
import { toDate } from '../../transactions/dto/create-transaction.dto';

export class PayInstallmentDto {
  /** Account the money comes from. */
  @IsMongoId()
  accountId!: string;

  /** Payment date; defaults to now. */
  @IsOptional()
  @Transform(toDate)
  @IsDate()
  date?: Date;
}
