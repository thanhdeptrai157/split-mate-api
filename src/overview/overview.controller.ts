import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { OverviewService } from './overview.service.js';

@Controller('group/:groupId/overview')
@UseGuards(AccessTokenGuard)
@ApiTags('overview')
@ApiBearerAuth()
@ApiParam({ name: 'groupId', format: 'uuid' })
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get()
  @ApiOperation({
    summary: 'Get group balances and the current user debts with each member',
  })
  getGroupOverview(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.overviewService.getGroupOverview(user.sub, groupId);
  }

  @Get('members/:memberId/debt')
  @ApiOperation({
    summary:
      'Explain why the current user and a member owe each other (bills and settlements)',
  })
  @ApiParam({ name: 'memberId', format: 'uuid' })
  getMemberDebtBreakdown(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('memberId', new ParseUUIDPipe({ version: '4' })) memberId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.overviewService.getMemberDebtBreakdown(
      user.sub,
      groupId,
      memberId,
    );
  }
}
