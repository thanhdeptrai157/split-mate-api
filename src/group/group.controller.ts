import {
  Body,
  Controller,
  Get,
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
import { CreateGroupDto } from './dto/create-group.dto.js';
import { JoinGroupDto } from './dto/join-group.dto.js';
import { GroupService } from './group.service.js';

@Controller('group')
@UseGuards(AccessTokenGuard)
@ApiTags('groups')
@ApiBearerAuth()
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @ApiOperation({ summary: 'Create a group' })
  async createGroup(
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.groupService.createGroup(user.sub, dto.name, dto.avatarUrl);
  }

  @Post('join')
  @ApiOperation({ summary: 'Join a group with an invite code' })
  async joinGroup(
    @Body() dto: JoinGroupDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.groupService.joinGroup(user.sub, dto.inviteCode);
  }

  @Get()
  @ApiOperation({ summary: 'Get groups of the current user' })
  async getMyGroups(@CurrentUser() user: AccessTokenPayload) {
    return this.groupService.getMyGroups(user.sub);
  }

  @Get(':groupId')
  @ApiOperation({ summary: 'Get group details with members' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  async getGroupDetail(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.groupService.getGroupDetail(user.sub, groupId);
  }
}
