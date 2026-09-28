import { Injectable, NotFoundException } from '@nestjs/common';

import { SettlementStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type MemberBrief = {
  membershipId: string;
  id: string;
  name: string;
  avatarUrl: string | null;
};

type MemberTotals = {
  paid: bigint;
  owed: bigint;
  sent: bigint;
  received: bigint;
};

@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tổng quan công nợ của cả nhóm, tính xuyên suốt mọi bill và các lượt trả nợ
   * đã xác nhận. `balance` dương nghĩa là người khác còn nợ thành viên đó,
   * âm nghĩa là thành viên đó còn nợ.
   */
  async getGroupOverview(userId: string, groupId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException('Group not found');
    }

    const [members, bills, settlements] = await Promise.all([
      this.prisma.groupMember.findMany({
        where: { groupId },
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.bill.findMany({
        where: { groupId },
        select: {
          id: true,
          payers: { select: { memberId: true, amount: true } },
          items: {
            select: {
              shares: { select: { memberId: true, amount: true } },
            },
          },
        },
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fromMemberId: true,
          toMemberId: true,
          amount: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const totals = new Map<string, MemberTotals>();
    for (const member of members) {
      totals.set(member.id, { paid: 0n, owed: 0n, sent: 0n, received: 0n });
    }

    let totalAmount = 0n;

    for (const bill of bills) {
      for (const payer of bill.payers) {
        const entry = totals.get(payer.memberId);
        if (entry) entry.paid += payer.amount;
      }

      for (const item of bill.items) {
        for (const share of item.shares) {
          const entry = totals.get(share.memberId);
          if (entry) entry.owed += share.amount;
          totalAmount += share.amount;
        }
      }
    }

    for (const settlement of settlements) {
      if (settlement.status !== SettlementStatus.CONFIRMED) continue;

      const from = totals.get(settlement.fromMemberId);
      const to = totals.get(settlement.toMemberId);
      if (from) from.sent += settlement.amount;
      if (to) to.received += settlement.amount;
    }

    const memberById = new Map(members.map((member) => [member.id, member]));
    const memberBrief = (membershipId: string): MemberBrief => {
      const member = memberById.get(membershipId);

      return {
        membershipId,
        id: member?.user.id ?? membershipId,
        name: member?.user.name ?? '',
        avatarUrl: member?.user.avatarUrl ?? null,
      };
    };

    const balances = members.map((member) => {
      const entry = totals.get(member.id) ?? {
        paid: 0n,
        owed: 0n,
        sent: 0n,
        received: 0n,
      };

      return {
        member,
        entry,
        balance: entry.paid - entry.owed + entry.sent - entry.received,
      };
    });

    // Rút gọn công nợ: ghép người nợ nhiều nhất với người được nhận nhiều nhất.
    const creditors = balances
      .filter((item) => item.balance > 0n)
      .sort((a, b) => (a.balance === b.balance ? 0 : a.balance < b.balance ? 1 : -1));
    const debtors = balances
      .filter((item) => item.balance < 0n)
      .sort((a, b) => (a.balance === b.balance ? 0 : a.balance < b.balance ? -1 : 1));

    const remainingCreditor = creditors.map((item) => item.balance);
    const remainingDebtor = debtors.map((item) => -item.balance);
    const debts: Array<{ from: MemberBrief; to: MemberBrief; amount: number }> =
      [];

    let creditorIndex = 0;
    let debtorIndex = 0;

    while (
      creditorIndex < creditors.length &&
      debtorIndex < debtors.length
    ) {
      const amount =
        remainingCreditor[creditorIndex] < remainingDebtor[debtorIndex]
          ? remainingCreditor[creditorIndex]
          : remainingDebtor[debtorIndex];

      if (amount > 0n) {
        debts.push({
          from: memberBrief(debtors[debtorIndex].member.id),
          to: memberBrief(creditors[creditorIndex].member.id),
          amount: this.toSafeNumber(amount),
        });
      }

      remainingCreditor[creditorIndex] -= amount;
      remainingDebtor[debtorIndex] -= amount;

      if (remainingCreditor[creditorIndex] === 0n) creditorIndex += 1;
      if (remainingDebtor[debtorIndex] === 0n) debtorIndex += 1;
    }

    return {
      groupId,
      memberCount: members.length,
      billCount: bills.length,
      totalAmount: this.toSafeNumber(totalAmount),
      members: balances.map(({ member, entry, balance }) => ({
        membershipId: member.id,
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
        paid: this.toSafeNumber(entry.paid),
        owed: this.toSafeNumber(entry.owed),
        sent: this.toSafeNumber(entry.sent),
        received: this.toSafeNumber(entry.received),
        balance: this.toSafeNumber(balance),
      })),
      debts,
      pendingSettlements: settlements
        .filter((settlement) => settlement.status === SettlementStatus.PENDING)
        .map((settlement) => ({
          id: settlement.id,
          fromMemberId: settlement.fromMemberId,
          toMemberId: settlement.toMemberId,
          amount: this.toSafeNumber(settlement.amount),
          createdAt: settlement.createdAt,
        })),
    };
  }

  private toSafeNumber(amount: bigint) {
    const value = Number(amount);

    if (!Number.isSafeInteger(value)) {
      throw new RangeError('Amount exceeds JavaScript safe integer range');
    }

    return value;
  }
}
