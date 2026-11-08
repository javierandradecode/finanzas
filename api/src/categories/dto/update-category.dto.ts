import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  icon?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a hex color like #aabbcc',
  })
  color?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
