import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class JoinGroupDto {
  @ApiProperty({ example: '7KMQ4WXP', minLength: 8, maxLength: 8 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @Length(8, 8, { message: 'Invite code must be exactly 8 characters' })
  @Matches(/^[A-HJ-NP-Z2-9]+$/, { message: 'Invite code is invalid' })
  inviteCode: string;
}
