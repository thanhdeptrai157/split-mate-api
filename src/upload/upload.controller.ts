import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { PresignUploadDto } from './dto/presign-upload.dto.js';
import { UploadService } from './upload.service.js';

@Controller('uploads')
@UseGuards(AccessTokenGuard)
@ApiTags('uploads')
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Get a presigned URL to upload an image to R2' })
  presignImageUpload(
    @Body() dto: PresignUploadDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.uploadService.presignImageUpload(
      user.sub,
      dto.contentType,
      dto.scope,
    );
  }
}
