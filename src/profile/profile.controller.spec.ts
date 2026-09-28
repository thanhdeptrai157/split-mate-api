import { Test, TestingModule } from '@nestjs/testing';

import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

describe('ProfileController', () => {
  const user: AccessTokenPayload = {
    sub: 'user-id',
    email: 'user@example.com',
  };
  let controller: ProfileController;
  let profileService: {
    getProfile: ReturnType<typeof vi.fn>;
    updateProfile: ReturnType<typeof vi.fn>;
    getPublicProfile: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    profileService = {
      getProfile: vi.fn(),
      updateProfile: vi.fn(),
      getPublicProfile: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: profileService }],
    }).compile();

    controller = module.get(ProfileController);
  });

  it('gets the current profile', async () => {
    profileService.getProfile.mockResolvedValue({ id: 'user-id' });

    await expect(controller.getProfile(user)).resolves.toEqual({
      id: 'user-id',
    });
    expect(profileService.getProfile).toHaveBeenCalledWith(user.sub);
  });

  it('updates the current profile', async () => {
    profileService.updateProfile.mockResolvedValue({ id: 'user-id' });

    await controller.updateProfile({ name: 'New' }, user);

    expect(profileService.updateProfile).toHaveBeenCalledWith(user.sub, {
      name: 'New',
    });
  });

  it('gets a public profile by id', async () => {
    profileService.getPublicProfile.mockResolvedValue({ id: 'other-id' });

    await controller.getPublicProfile('other-id');

    expect(profileService.getPublicProfile).toHaveBeenCalledWith('other-id');
  });
});
