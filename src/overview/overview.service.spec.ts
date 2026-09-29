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

    // Owner nhìn từ góc của mình: member còn nợ lại 50000.
    expect(overview.myDebts).toEqual([
      {
        member: {
          membershipId: member.id,
          id: member.user.id,
          name: member.user.name,
          avatarUrl: null,
        },
        amount: 50000,
        direction: 'receivable',
      },
    ]);
    expect(overview.pendingSettlements).toEqual([]);
  });

  it('trả công nợ theo đúng người đang request (chiều phải trả)', async () => {
    // Người đang request là member: họ chịu 75000 của bill do owner trả.
    groupMemberFindUnique.mockResolvedValue({ id: member.id });

    const overview = await service.getGroupOverview('member-user-id', 'group-id');

    expect(overview.myDebts).toEqual([
      {
        member: {
          membershipId: owner.id,
          id: owner.user.id,
          name: owner.user.name,
          avatarUrl: null,
        },
        amount: 75000,
        direction: 'payable',
      },
    ]);
  });

  it('tính công nợ của A với B, C, D, E qua nhiều bill', async () => {
    // 5 thành viên: A (người đang request), B, C, D, E.
    const a = {
      id: 'membership-a',
      role: GroupRole.OWNER,
      user: { id: 'user-a', name: 'A', email: 'a@example.com', avatarUrl: null },
    };
    const b = {
      id: 'membership-b',
      role: GroupRole.MEMBER,
      user: { id: 'user-b', name: 'B', email: 'b@example.com', avatarUrl: null },
    };
    const c = {
      id: 'membership-c',
      role: GroupRole.MEMBER,
      user: { id: 'user-c', name: 'C', email: 'c@example.com', avatarUrl: null },
    };
    const d = {
      id: 'membership-d',
      role: GroupRole.MEMBER,
      user: { id: 'user-d', name: 'D', email: 'd@example.com', avatarUrl: null },
    };
    const e = {
      id: 'membership-e',
      role: GroupRole.MEMBER,
      user: { id: 'user-e', name: 'E', email: 'e@example.com', avatarUrl: null },
    };

    groupMemberFindUnique.mockResolvedValue({ id: a.id });
    groupMemberFindMany.mockResolvedValue([a, b, c, d, e]);
    settlementFindMany.mockResolvedValue([]);
    billFindMany.mockResolvedValue([
      // A trả 100000, chia đều 5 người.
      {
        id: 'bill-a',
        payers: [{ memberId: a.id, amount: 100000n }],
        items: [
          {
            shares: [
              { memberId: a.id, amount: 20000n },
              { memberId: b.id, amount: 20000n },
              { memberId: c.id, amount: 20000n },
              { memberId: d.id, amount: 20000n },
              { memberId: e.id, amount: 20000n },
            ],
          },
        ],
      },
      // B trả 15000, chia đều 5 người.
      {
        id: 'bill-b',
        payers: [{ memberId: b.id, amount: 15000n }],
        items: [
          {
            shares: [
              { memberId: a.id, amount: 3000n },
              { memberId: b.id, amount: 3000n },
              { memberId: c.id, amount: 3000n },
              { memberId: d.id, amount: 3000n },
              { memberId: e.id, amount: 3000n },
            ],
          },
        ],
      },
      // C trả 60000, chia 4 người B/C/D/E (không có A).
      {
        id: 'bill-c',
        payers: [{ memberId: c.id, amount: 60000n }],
        items: [
          {
            shares: [
              { memberId: b.id, amount: 15000n },
              { memberId: c.id, amount: 15000n },
              { memberId: d.id, amount: 15000n },
              { memberId: e.id, amount: 15000n },
            ],
          },
        ],
      },
    ]);

    const overview = await service.getGroupOverview('user-a', 'group-id');

    expect(overview.totalAmount).toBe(175000);
    // A: trả 100000, chịu 20000 (bill A) + 3000 (bill B) = 23000 => +77000.
    expect(overview.members.find((item) => item.id === 'user-a')).toMatchObject({
      paid: 100000,
      owed: 23000,
      balance: 77000,
    });

    // A chỉ được nhận lại, không nợ ai.
    expect(overview.myDebts).toHaveLength(4);
    expect(overview.myDebts.every((debt) => debt.direction === 'receivable')).toBe(true);
    expect(overview.myDebts).toEqual(
      expect.arrayContaining([
        {
          member: expect.objectContaining({ membershipId: b.id, name: 'B' }),
          amount: 17000, // 20000 - 3000
          direction: 'receivable',
        },
        {
          member: expect.objectContaining({ membershipId: c.id, name: 'C' }),
          amount: 20000,
          direction: 'receivable',
        },
        {
          member: expect.objectContaining({ membershipId: d.id, name: 'D' }),
          amount: 20000,
          direction: 'receivable',
        },
        {
          member: expect.objectContaining({ membershipId: e.id, name: 'E' }),
          amount: 20000,
          direction: 'receivable',
        },
      ]),
    );

    // Tổng A được nhận = balance của A.
    const receivable = overview.myDebts.reduce((sum, debt) => sum + debt.amount, 0);
    expect(receivable).toBe(77000);
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

    expect(overview.myDebts).toMatchObject([
      {
        member: { membershipId: member.id },
        amount: 75000,
        direction: 'receivable',
      },
    ]);
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
