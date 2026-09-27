import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Summer trip', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Group name must not exceed 100 characters' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/group.png' })
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
