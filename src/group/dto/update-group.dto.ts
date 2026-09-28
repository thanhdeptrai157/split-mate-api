import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Summer trip', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Group name must not exceed 100 characters' })
  name?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'URL ảnh đại diện nhóm (từ POST /uploads/presign); null để xoá',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string | null;
}
