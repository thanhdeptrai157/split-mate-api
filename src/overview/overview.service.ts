import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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

type PairwiseBill = {
  payers: Array<{ memberId: string; amount: bigint }>;
  items: Array<{ shares: Array<{ memberId: string; amount: bigint }> }>;
};

type PairwiseSettlement = {
  fromMemberId: string;
  toMemberId: string;
  amount: bigint;
  status: SettlementStatus;
};

/** Công nợ ròng của người đang xem so với một thành viên khác. */
type RequesterDebt = {
  memberId: string;
  /** Dương: thành viên này nợ người đang xem. Âm: người đang xem nợ họ. */
  amount: bigint;
};

/** Một cặp chủ nợ – con nợ được ghép khi bù trừ một bill. */
type MatchedPair = {
  creditorId: string;
  debtorId: string;
  amount: bigint;
};

/** Một bill giải thích phần phát sinh giữa người đang xem và một thành viên. */
type DebtBreakdownBill = {
  billId: string;
  name: string;
  occurredAt: Date;
  createdAt: Date;
  /** Tổng tiền của cả bill. */
  totalAmount: number;
  /** Phần phát sinh giữa hai người do bill này (luôn dương). */
  amount: number;
  /** `payable`: người đang xem nợ thành viên; `receivable`: thành viên nợ người đang xem. */
  direction: 'payable' | 'receivable';
  requester: { paid: number; owed: number };
  counterpart: { paid: number; owed: number };
};

/** Một lượt trả nợ giữa người đang xem và thành viên đang xét. */
type DebtBreakdownSettlement = {
  id: string;
  amount: number;
  note: string | null;
  status: SettlementStatus;
  createdAt: Date;
  confirmedAt: Date | null;
  fromMemberId: string;
  toMemberId: string;
  /** `outgoing`: người xem trả cho thành viên; `incoming`: thành viên trả cho người xem. */
  flow: 'outgoing' | 'incoming';
  /** Chỉ settlement CONFIRMED mới được cấn trừ vào số dư. */
  affectsBalance: boolean;
};

@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tổng quan công nợ của nhóm, tính xuyên suốt mọi bill và các lượt trả nợ
   * đã xác nhận. `balance` dương nghĩa là người khác còn nợ thành viên đó,
   * âm nghĩa là thành viên đó còn nợ.
   *
   * Riêng `myDebts` trả về công nợ của **người đang request** với từng thành
   * viên trong nhóm, tính trực tiếp từ bill (ai trả cho ai) và các settlement
   * đã xác nhận — không dùng thuật toán rút gọn nợ chung của cả nhóm.
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

    const myDebts = this.buildRequesterDebts(
      membership.id,
      bills,
      settlements,
    );

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
      // Công nợ của người đang xem với từng thành viên, sắp theo số tiền giảm dần.
      myDebts: myDebts
        .filter((debt) => debt.amount !== 0n)
        .sort((a, b) => {
          const left = a.amount < 0n ? -a.amount : a.amount;
          const right = b.amount < 0n ? -b.amount : b.amount;
          return left === right ? 0 : left < right ? 1 : -1;
        })
        .map((debt) => ({
          member: memberBrief(debt.memberId),
          amount: this.toSafeNumber(
            debt.amount < 0n ? -debt.amount : debt.amount,
          ),
          direction: debt.amount > 0n ? 'receivable' : 'payable',
        })),
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

  /**
   * Giải thích vì sao người đang xem và một thành viên đang nợ nhau khoảng tiền
   * hiện tại: liệt kê từng bill có phát sinh giữa hai người cùng lịch sử các
   * lượt trả nợ (settlement) giữa họ.
   *
   * `memberId` là `membershipId` (đúng như `myDebts[].member.membershipId` mà
   * endpoint tổng quan trả về). Con số ở đây luôn khớp với `myDebts` tương ứng
   * vì dùng chung cách ghép cặp nợ theo bill.
   */
  async getMemberDebtBreakdown(
    userId: string,
    groupId: string,
    memberId: string,
  ) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException('Group not found');
    }

    const counterpart = await this.prisma.groupMember.findFirst({
      where: { id: memberId, groupId },
      select: {
        id: true,
        user: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    if (!counterpart) {
      throw new NotFoundException('Member not found');
    }

    if (counterpart.id === membership.id) {
      throw new BadRequestException(
        'You cannot view a debt breakdown with yourself',
      );
    }

    const requesterId = membership.id;

    const [bills, settlements] = await Promise.all([
      this.prisma.bill.findMany({
        where: { groupId },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          occurredAt: true,
          createdAt: true,
          payers: { select: { memberId: true, amount: true } },
          items: {
            select: {
              amount: true,
              shares: { select: { memberId: true, amount: true } },
            },
          },
        },
      }),
      this.prisma.settlement.findMany({
        where: {
          groupId,
          OR: [
            { fromMemberId: requesterId, toMemberId: counterpart.id },
            { fromMemberId: counterpart.id, toMemberId: requesterId },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          note: true,
          status: true,
          confirmedAt: true,
          createdAt: true,
          fromMemberId: true,
          toMemberId: true,
        },
      }),
    ]);

    let billTotal = 0n;
    const billEntries: DebtBreakdownBill[] = [];

    for (const bill of bills) {
      const delta = this.billPairDelta(bill, requesterId, counterpart.id);

      if (delta === 0n) continue;

      let totalAmount = 0n;
      let requesterPaid = 0n;
      let requesterOwed = 0n;
      let counterpartPaid = 0n;
      let counterpartOwed = 0n;

      for (const payer of bill.payers) {
        if (payer.memberId === requesterId) requesterPaid += payer.amount;
        if (payer.memberId === counterpart.id) counterpartPaid += payer.amount;
      }

      for (const item of bill.items) {
        totalAmount += item.amount;

        for (const share of item.shares) {
          if (share.memberId === requesterId) requesterOwed += share.amount;
          if (share.memberId === counterpart.id) counterpartOwed += share.amount;
        }
      }

      billTotal += delta;
      billEntries.push({
        billId: bill.id,
        name: bill.name,
        occurredAt: bill.occurredAt,
        createdAt: bill.createdAt,
        totalAmount: this.toSafeNumber(totalAmount),
        amount: this.toSafeNumber(delta < 0n ? -delta : delta),
        direction: delta > 0n ? 'receivable' : 'payable',
        requester: {
          paid: this.toSafeNumber(requesterPaid),
          owed: this.toSafeNumber(requesterOwed),
        },
        counterpart: {
          paid: this.toSafeNumber(counterpartPaid),
          owed: this.toSafeNumber(counterpartOwed),
        },
      });
    }

    let settlementTotal = 0n;
    const settlementEntries: DebtBreakdownSettlement[] = settlements.map(
      (settlement) => {
        const affectsBalance =
          settlement.status === SettlementStatus.CONFIRMED;

        if (affectsBalance) {
          // Người xem đã trả bớt nợ thì cộng vào số dư; đã nhận tiền thì trừ đi.
          if (settlement.fromMemberId === requesterId) {
            settlementTotal += settlement.amount;
          } else {
            settlementTotal -= settlement.amount;
          }
        }

        return {
          id: settlement.id,
          amount: this.toSafeNumber(settlement.amount),
          note: settlement.note,
          status: settlement.status,
          createdAt: settlement.createdAt,
          confirmedAt: settlement.confirmedAt,
          fromMemberId: settlement.fromMemberId,
          toMemberId: settlement.toMemberId,
          flow:
            settlement.fromMemberId === requesterId ? 'outgoing' : 'incoming',
          affectsBalance,
        };
      },
    );

    const net = billTotal + settlementTotal;

    return {
      groupId,
      member: {
        membershipId: counterpart.id,
        id: counterpart.user.id,
        name: counterpart.user.name,
        avatarUrl: counterpart.user.avatarUrl,
      },
      /** Độ lớn công nợ ròng hiện tại. */
      amount: this.toSafeNumber(net < 0n ? -net : net),
      /** Công nợ ròng có dấu: dương = thành viên nợ người xem, âm = ngược lại. */
      netAmount: this.toSafeNumber(net),
      direction:
        net > 0n ? 'receivable' : net < 0n ? 'payable' : ('settled' as const),
      /** Tổng phần phát sinh từ bill (có dấu). */
      billTotal: this.toSafeNumber(billTotal),
      /** Tổng phần điều chỉnh từ settlement đã xác nhận (có dấu). */
      settlementTotal: this.toSafeNumber(settlementTotal),
      billCount: billEntries.length,
      settlements: settlementEntries,
      bills: billEntries,
    };
  }

  /**
   * Tính công nợ ròng của người đang xem với từng thành viên khác.
   *
   * Với mỗi bill, phần đã trả và phần phải chịu của từng người được đem ghép
   * theo cặp (người chịu trả cho người đã trả), tự bù phần mỗi người tự trả cho
   * chính mình. Sau đó cộng dồn các settlement đã xác nhận.
   */
  private buildRequesterDebts(
    requesterMembershipId: string,
    bills: PairwiseBill[],
    settlements: PairwiseSettlement[],
  ): RequesterDebt[] {
    const net = new Map<string, bigint>();

    const add = (counterpartId: string, delta: bigint) => {
      if (counterpartId === requesterMembershipId) return;
      net.set(counterpartId, (net.get(counterpartId) ?? 0n) + delta);
    };

    for (const bill of bills) {
      for (const pair of this.matchBillPairs(bill)) {
        if (pair.creditorId === requesterMembershipId) {
          add(pair.debtorId, pair.amount); // Người này nợ mình.
        } else if (pair.debtorId === requesterMembershipId) {
          add(pair.creditorId, -pair.amount); // Mình nợ người này.
        }
      }
    }

    for (const settlement of settlements) {
      if (settlement.status !== SettlementStatus.CONFIRMED) continue;

      if (settlement.fromMemberId === requesterMembershipId) {
        add(settlement.toMemberId, settlement.amount); // Mình đã trả bớt nợ.
      } else if (settlement.toMemberId === requesterMembershipId) {
        add(settlement.fromMemberId, -settlement.amount); // Mình đã nhận tiền.
      }
    }

    return [...net.entries()].map(([memberId, amount]) => ({
      memberId,
      amount,
    }));
  }

  /**
   * Ghép mọi cặp chủ nợ – con nợ của một bill để bù trừ: phần mỗi người tự trả
   * cho chính mình được huỷ trước, sau đó lần lượt ghép người đã trả nhiều nhất
   * với người còn nợ nhiều nhất.
   */
  private matchBillPairs(bill: PairwiseBill): MatchedPair[] {
    const paid = new Map<string, bigint>();
    for (const payer of bill.payers) {
      paid.set(payer.memberId, (paid.get(payer.memberId) ?? 0n) + payer.amount);
    }

    const owed = new Map<string, bigint>();
    for (const item of bill.items) {
      for (const share of item.shares) {
        owed.set(
          share.memberId,
          (owed.get(share.memberId) ?? 0n) + share.amount,
        );
      }
    }

    // Bù phần mỗi người tự trả cho chính mình để không tạo nợ ảo.
    for (const [memberId, paidAmount] of paid) {
      const owedAmount = owed.get(memberId) ?? 0n;
      const cancel = paidAmount < owedAmount ? paidAmount : owedAmount;
      if (cancel > 0n) {
        paid.set(memberId, paidAmount - cancel);
        owed.set(memberId, owedAmount - cancel);
      }
    }

    const creditors = [...paid.entries()]
      .filter(([, amount]) => amount > 0n)
      .map(([memberId, amount]) => ({ memberId, amount }))
      .sort((a, b) => (a.amount === b.amount ? 0 : a.amount < b.amount ? 1 : -1));
    const debtors = [...owed.entries()]
      .filter(([, amount]) => amount > 0n)
      .map(([memberId, amount]) => ({ memberId, amount }))
      .sort((a, b) => (a.amount === b.amount ? 0 : a.amount < b.amount ? 1 : -1));

    const pairs: MatchedPair[] = [];
    let creditorIndex = 0;
    let debtorIndex = 0;

    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];
      const amount =
        creditor.amount < debtor.amount ? creditor.amount : debtor.amount;

      if (amount <= 0n) break;

      pairs.push({
        creditorId: creditor.memberId,
        debtorId: debtor.memberId,
        amount,
      });

      creditor.amount -= amount;
      debtor.amount -= amount;

      if (creditor.amount === 0n) creditorIndex += 1;
      if (debtor.amount === 0n) debtorIndex += 1;
    }

    return pairs;
  }

  /**
   * Phần phát sinh giữa hai thành viên do một bill, có dấu theo góc nhìn người
   * xem: dương = `counterpartId` nợ `requesterId`, âm = ngược lại.
   */
  private billPairDelta(
    bill: PairwiseBill,
    requesterId: string,
    counterpartId: string,
  ): bigint {
    let delta = 0n;

    for (const pair of this.matchBillPairs(bill)) {
      if (pair.creditorId === requesterId && pair.debtorId === counterpartId) {
        delta += pair.amount;
      } else if (
        pair.debtorId === requesterId &&
        pair.creditorId === counterpartId
      ) {
        delta -= pair.amount;
      }
    }

    return delta;
  }

  private toSafeNumber(amount: bigint) {
    const value = Number(amount);

    if (!Number.isSafeInteger(value)) {
      throw new RangeError('Amount exceeds JavaScript safe integer range');
    }

    return value;
  }
}
