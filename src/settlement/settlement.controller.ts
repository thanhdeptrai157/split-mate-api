import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CreateSettlementDto } from './dto/create-settlement.dto.js';
import { SettlementService } from './settlement.service.js';

@Controller('group/:groupId/settlements')
@UseGuards(AccessTokenGuard)
@ApiTags('settlements')
@ApiBearerAuth()
@ApiParam({ name: 'groupId', format: 'uuid' })
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post()
  @ApiOperation({ summary: 'Record a repayment to another group member' })
  createSettlement(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() dto: CreateSettlementDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.settlementService.createSettlement(user.sub, groupId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all settlements in a group' })
  getGroupSettlements(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.settlementService.getGroupSettlements(user.sub, groupId);
  }

  @Post(':settlementId/confirm')
  @ApiOperation({ summary: 'Confirm a pending settlement as the receiver' })
  @ApiParam({ name: 'settlementId', format: 'uuid' })
  confirmSettlement(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('settlementId', new ParseUUIDPipe({ version: '4' }))
    settlementId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.settlementService.confirmSettlement(
      user.sub,
      groupId,
      settlementId,
    );
  }

  @Post(':settlementId/reject')
  @ApiOperation({ summary: 'Reject a pending settlement as the receiver' })
  @ApiParam({ name: 'settlementId', format: 'uuid' })
  rejectSettlement(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('settlementId', new ParseUUIDPipe({ version: '4' }))
    settlementId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.settlementService.rejectSettlement(
      user.sub,
      groupId,
      settlementId,
    );
  }

  @Delete(':settlementId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a pending or rejected settlement' })
  @ApiParam({ name: 'settlementId', format: 'uuid' })
  async deleteSettlement(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('settlementId', new ParseUUIDPipe({ version: '4' }))
    settlementId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.settlementService.deleteSettlement(
      user.sub,
      groupId,
      settlementId,
    );
  }
}
