import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'URL ảnh đại diện (từ POST /uploads/presign); gửi null để xoá',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'URL ảnh QR nhận tiền; gửi null để xoá',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2048)
  qrUrl?: string | null;
}
