import { NotFoundException } from '@nestjs/common';

import { GroupRole, SettlementStatus } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OverviewService } from './overview.service.js';

describe('OverviewService', () => {
  const createdAt = new Date('2026-09-28T00:00:00.000Z');
  const owner = {
    id: 'owner-membership-id',
    role: GroupRole.OWNER,
    user: {
      id: 'owner-user-id',
      name: 'Owner',
      email: 'owner@example.com',
      avatarUrl: null,
    },
  };
  const member = {
    id: 'member-membership-id',
    role: GroupRole.MEMBER,
    user: {
      id: 'member-user-id',
      name: 'Member',
      email: 'member@example.com',
      avatarUrl: null,
    },
  };
  const bill = {
    id: 'bill-id',
    payers: [{ memberId: owner.id, amount: 150000n }],
    items: [
      {
        shares: [
          { memberId: owner.id, amount: 75000n },
          { memberId: member.id, amount: 75000n },
        ],
      },
    ],
  };

  let groupMemberFindUnique: ReturnType<typeof vi.fn>;
  let groupMemberFindMany: ReturnType<typeof vi.fn>;
  let billFindMany: ReturnType<typeof vi.fn>;
  let settlementFindMany: ReturnType<typeof vi.fn>;
  let service: OverviewService;

  beforeEach(() => {
    groupMemberFindUnique = vi.fn().mockResolvedValue({ id: owner.id });
    groupMemberFindMany = vi.fn().mockResolvedValue([owner, member]);
    billFindMany = vi.fn().mockResolvedValue([bill]);
    settlementFindMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      groupMember: {
        findUnique: groupMemberFindUnique,
        findMany: groupMemberFindMany,
      },
      bill: { findMany: billFindMany },
      settlement: { findMany: settlementFindMany },
    } as unknown as PrismaService;

    service = new OverviewService(prisma);
  });

  it('nets confirmed repayments into the balances', async () => {
    settlementFindMany.mockResolvedValue([
      {
        id: 'settlement-id',
        fromMemberId: member.id,
        toMemberId: owner.id,
        amount: 25000n,
        status: SettlementStatus.CONFIRMED,
        createdAt,
      },
    ]);

    const overview = await service.getGroupOverview('owner-user-id', 'group-id');

    expect(overview).toMatchObject({
      totalAmount: 150000,
      billCount: 1,
      memberCount: 2,
    });

    const ownerBalance = overview.members.find(
      (item) => item.membershipId === owner.id,
    );
    const memberBalance = overview.members.find(
      (item) => item.membershipId === member.id,
    );

    // Owner: trả 150000, chịu 75000, nhận lại 25000 => +50000 (được nhận).
    expect(ownerBalance).toMatchObject({
      paid: 150000,
      owed: 75000,
      received: 25000,
      balance: 50000,
    });
    // Member: chịu 75000, đã trả 25000 => -50000 (còn nợ).
    expect(memberBalance).toMatchObject({
      owed: 75000,
      sent: 25000,
      balance: -50000,
    });

    expect(overview.debts).toEqual([
      {
        from: {
          membershipId: member.id,
          id: member.user.id,
          name: member.user.name,
          avatarUrl: null,
        },
        to: {
          membershipId: owner.id,
          id: owner.user.id,
          name: owner.user.name,
          avatarUrl: null,
        },
        amount: 50000,
      },
    ]);
    expect(overview.pendingSettlements).toEqual([]);
  });

  it('ignores pending and rejected settlements', async () => {
    settlementFindMany.mockResolvedValue([
      {
        id: 'pending-id',
        fromMemberId: member.id,
        toMemberId: owner.id,
        amount: 25000n,
        status: SettlementStatus.PENDING,
        createdAt,
      },
      {
        id: 'rejected-id',
        fromMemberId: member.id,
        toMemberId: owner.id,
        amount: 10000n,
        status: SettlementStatus.REJECTED,
        createdAt,
      },
    ]);

    const overview = await service.getGroupOverview('owner-user-id', 'group-id');

    expect(overview.debts).toMatchObject([{ amount: 75000 }]);
    expect(overview.members).toMatchObject([
      { membershipId: owner.id, balance: 75000 },
      { membershipId: member.id, balance: -75000 },
    ]);
    expect(overview.pendingSettlements).toHaveLength(1);
    expect(overview.pendingSettlements[0]).toMatchObject({
      id: 'pending-id',
      amount: 25000,
    });
  });

  it('hides the overview from users outside the group', async () => {
    groupMemberFindUnique.mockResolvedValue(null);

    await expect(
      service.getGroupOverview('stranger-id', 'group-id'),
    ).rejects.toThrow(NotFoundException);
    expect(billFindMany).not.toHaveBeenCalled();
  });
});
