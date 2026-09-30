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
    getMemberDebtBreakdown: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    overviewService = {
      getGroupOverview: vi.fn(),
      getMemberDebtBreakdown: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OverviewController],
      providers: [{ provide: OverviewService, useValue: overviewService }],
    }).compile();

    controller = module.get(OverviewController);
  });

  it('returns the overview for the authenticated user', async () => {
    const overview = { groupId: 'group-id', members: [], myDebts: [] };
    overviewService.getGroupOverview.mockResolvedValue(overview);

    await expect(
      controller.getGroupOverview('group-id', user),
    ).resolves.toEqual(overview);
    expect(overviewService.getGroupOverview).toHaveBeenCalledWith(
      user.sub,
      'group-id',
    );
  });

  it('returns the debt breakdown for a member', async () => {
    const breakdown = { groupId: 'group-id', member: { membershipId: 'm' } };
    overviewService.getMemberDebtBreakdown.mockResolvedValue(breakdown);

    await expect(
      controller.getMemberDebtBreakdown('group-id', 'member-id', user),
    ).resolves.toEqual(breakdown);
    expect(overviewService.getMemberDebtBreakdown).toHaveBeenCalledWith(
      user.sub,
      'group-id',
      'member-id',
    );
  });
});
