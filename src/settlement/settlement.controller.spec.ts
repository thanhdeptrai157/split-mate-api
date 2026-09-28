import { Test, TestingModule } from '@nestjs/testing';

import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { SettlementController } from './settlement.controller.js';
import { SettlementService } from './settlement.service.js';

describe('SettlementController', () => {
  const user: AccessTokenPayload = {
    sub: 'user-id',
    email: 'user@example.com',
  };
  const dto = {
    toMemberId: 'creditor-membership-id',
    amount: 100000,
  };
  let controller: SettlementController;
  let settlementService: {
    createSettlement: ReturnType<typeof vi.fn>;
    getGroupSettlements: ReturnType<typeof vi.fn>;
    confirmSettlement: ReturnType<typeof vi.fn>;
    rejectSettlement: ReturnType<typeof vi.fn>;
    deleteSettlement: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    settlementService = {
      createSettlement: vi.fn(),
      getGroupSettlements: vi.fn(),
      confirmSettlement: vi.fn(),
      rejectSettlement: vi.fn(),
      deleteSettlement: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettlementController],
      providers: [{ provide: SettlementService, useValue: settlementService }],
    }).compile();

    controller = module.get(SettlementController);
  });

  it('creates a settlement for the authenticated user', async () => {
    settlementService.createSettlement.mockResolvedValue({ id: 'settlement-id' });

    await controller.createSettlement('group-id', dto, user);

    expect(settlementService.createSettlement).toHaveBeenCalledWith(
      user.sub,
      'group-id',
      dto,
    );
  });

  it('lists group settlements', async () => {
    settlementService.getGroupSettlements.mockResolvedValue([]);

    await expect(
      controller.getGroupSettlements('group-id', user),
    ).resolves.toEqual([]);
    expect(settlementService.getGroupSettlements).toHaveBeenCalledWith(
      user.sub,
      'group-id',
    );
  });

  it('confirms and rejects through the service', async () => {
    await controller.confirmSettlement('group-id', 'settlement-id', user);
    await controller.rejectSettlement('group-id', 'settlement-id', user);

    expect(settlementService.confirmSettlement).toHaveBeenCalledWith(
      user.sub,
      'group-id',
      'settlement-id',
    );
    expect(settlementService.rejectSettlement).toHaveBeenCalledWith(
      user.sub,
      'group-id',
      'settlement-id',
    );
  });

  it('deletes without returning a body', async () => {
    settlementService.deleteSettlement.mockResolvedValue(undefined);

    await expect(
      controller.deleteSettlement('group-id', 'settlement-id', user),
    ).resolves.toBeUndefined();
    expect(settlementService.deleteSettlement).toHaveBeenCalledWith(
      user.sub,
      'group-id',
      'settlement-id',
    );
  });
});
