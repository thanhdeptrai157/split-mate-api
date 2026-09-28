import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfileService } from './profile.service.js';

@Controller('profile')
@UseGuards(AccessTokenGuard)
@ApiTags('profile')
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user profile' })
  getProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.profileService.getProfile(user.sub);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the current user profile' })
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.profileService.updateProfile(user.sub, dto);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get a public user profile (avatar, payment QR)' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  getPublicProfile(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.profileService.getPublicProfile(userId);
  }
}
