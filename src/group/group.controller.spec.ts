import { Test, TestingModule } from '@nestjs/testing';

import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { GroupController } from './group.controller.js';
import { GroupService } from './group.service.js';

describe('GroupController', () => {
  let controller: GroupController;
  let groupService: {
    createGroup: ReturnType<typeof vi.fn>;
    joinGroup: ReturnType<typeof vi.fn>;
    getGroupDetail: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    groupService = {
      createGroup: vi.fn(),
      joinGroup: vi.fn(),
      getGroupDetail: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [{ provide: GroupService, useValue: groupService }],
    }).compile();

    controller = module.get(GroupController);
  });

  it('creates a group for the authenticated user', async () => {
    const user: AccessTokenPayload = {
      sub: 'user-id',
      email: 'user@example.com',
    };
    const dto = {
      name: 'Summer trip',
      avatarUrl: 'https://example.com/group.png',
    };
    const group = { id: 'group-id', ...dto, createdById: user.sub };

    groupService.createGroup.mockResolvedValue(group);

    await expect(controller.createGroup(dto, user)).resolves.toEqual(group);
    expect(groupService.createGroup).toHaveBeenCalledWith(
      user.sub,
      dto.name,
      dto.avatarUrl,
    );
  });

  it('joins a group for the authenticated user', async () => {
    const user: AccessTokenPayload = {
      sub: 'user-id',
      email: 'user@example.com',
    };
    const dto = { inviteCode: '7KMQ4WXP' };
    const group = { id: 'group-id', name: 'Summer trip' };

    groupService.joinGroup.mockResolvedValue(group);

    await expect(controller.joinGroup(dto, user)).resolves.toEqual(group);
    expect(groupService.joinGroup).toHaveBeenCalledWith(
      user.sub,
      dto.inviteCode,
    );
  });

  it('gets group details for the authenticated user', async () => {
    const user: AccessTokenPayload = {
      sub: 'user-id',
      email: 'user@example.com',
    };
    const group = {
      id: 'group-id',
      name: 'Summer trip',
      members: [{ id: 'user-id', name: 'User' }],
    };

    groupService.getGroupDetail.mockResolvedValue(group);

    await expect(controller.getGroupDetail(group.id, user)).resolves.toEqual(
      group,
    );
    expect(groupService.getGroupDetail).toHaveBeenCalledWith(
      user.sub,
      group.id,
    );
  });
});
