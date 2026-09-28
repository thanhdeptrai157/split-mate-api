import { NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ProfileService } from './profile.service.js';

describe('ProfileService', () => {
  const createdAt = new Date('2026-09-28T00:00:00.000Z');
  const user = {
    id: 'user-id',
    email: 'owner@example.com',
    name: 'Owner',
    avatarUrl: null,
    qrUrl: null,
    createdAt,
  };

  let userFindUnique: ReturnType<typeof vi.fn>;
  let userUpdate: ReturnType<typeof vi.fn>;
  let service: ProfileService;

  beforeEach(() => {
    userFindUnique = vi.fn();
    userUpdate = vi.fn();

    const prisma = {
      user: { findUnique: userFindUnique, update: userUpdate },
    } as unknown as PrismaService;

    service = new ProfileService(prisma);
  });

  it('returns the current user profile', async () => {
    userFindUnique.mockResolvedValue(user);

    await expect(service.getProfile('user-id')).resolves.toEqual(user);
  });

  it('throws when the profile is missing', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(service.getProfile('user-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates the profile fields it receives', async () => {
    userUpdate.mockResolvedValue({
      ...user,
      name: 'New',
      qrUrl: 'https://cdn.test/qr.png',
    });

    await service.updateProfile('user-id', {
      name: 'New',
      qrUrl: 'https://cdn.test/qr.png',
    });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: {
        name: 'New',
        avatarUrl: undefined,
        qrUrl: 'https://cdn.test/qr.png',
      },
      select: expect.objectContaining({ id: true, qrUrl: true }),
    });
  });

  it('maps a missing user on update to NotFound', async () => {
    userUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.updateProfile('user-id', { name: 'New' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns a public profile for viewing others', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      name: 'Owner',
      avatarUrl: null,
      qrUrl: 'https://cdn.test/qr.png',
    });

    await expect(service.getPublicProfile('user-id')).resolves.toEqual({
      id: 'user-id',
      name: 'Owner',
      avatarUrl: null,
      qrUrl: 'https://cdn.test/qr.png',
    });
  });
});
