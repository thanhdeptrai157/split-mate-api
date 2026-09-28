import { Test, TestingModule } from '@nestjs/testing';

import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';

describe('OverviewController', () => {
  const user: AccessTokenPayload = {
    sub: 'user-id',
    email: 'user@example.com',
  };
  let controller: OverviewController;
  let overviewService: {
    getGroupOverview: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    overviewService = { getGroupOverview: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OverviewController],
      providers: [{ provide: OverviewService, useValue: overviewService }],
    }).compile();

    controller = module.get(OverviewController);
  });

  it('returns the overview for the authenticated user', async () => {
    const overview = { groupId: 'group-id', members: [], debts: [] };
    overviewService.getGroupOverview.mockResolvedValue(overview);

    await expect(
      controller.getGroupOverview('group-id', user),
    ).resolves.toEqual(overview);
    expect(overviewService.getGroupOverview).toHaveBeenCalledWith(
      user.sub,
      'group-id',
    );
  });
});
