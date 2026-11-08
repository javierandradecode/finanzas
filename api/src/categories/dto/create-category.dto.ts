import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';
import type { CategoryType } from '../schemas/category.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  @IsIn(['income', 'expense'])
  type!: CategoryType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  icon!: string;

  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a hex color like #aabbcc',
  })
  color!: string;
}
