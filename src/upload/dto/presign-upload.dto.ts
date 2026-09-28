import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const UPLOAD_SCOPES = ['bills', 'groups', 'avatars'] as const;
export type UploadScope = (typeof UPLOAD_SCOPES)[number];

export const UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export class PresignUploadDto {
  @ApiProperty({ enum: UPLOAD_CONTENT_TYPES, example: 'image/jpeg' })
  @IsIn(UPLOAD_CONTENT_TYPES)
  contentType: string;

  @ApiPropertyOptional({ enum: UPLOAD_SCOPES, default: 'bills' })
  @IsOptional()
  @IsIn(UPLOAD_SCOPES)
  scope?: UploadScope;
}
