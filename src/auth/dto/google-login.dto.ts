import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token returned by Google Sign-In' })
  @IsString()
  @IsNotEmpty()
  credential: string;
}
