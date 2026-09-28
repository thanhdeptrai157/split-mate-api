import type { ConfigService } from '@nestjs/config';

import { UploadService } from './upload.service.js';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = vi.fn();
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(() => Promise.resolve('https://r2.test/presigned-put')),
}));

describe('UploadService', () => {
  const values: Record<string, string> = {
    R2_ACCOUNT_ID: 'account-id',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET: 'splitmate',
    R2_PUBLIC_BASE_URL: 'https://cdn.test/',
  };
  const configService = {
    get: (name: string) => values[name],
  } as unknown as ConfigService;

  const service = new UploadService(configService);

  it('presigns an image upload with a scoped key and public URL', async () => {
    const result = await service.presignImageUpload('user-1', 'image/png', 'bills');

    expect(result.key).toMatch(/^bills\/user-1\/[0-9a-f-]+\.png$/);
    expect(result.uploadUrl).toBe('https://r2.test/presigned-put');
    expect(result.publicUrl).toBe(`https://cdn.test/${result.key}`);
    expect(result.expiresIn).toBe(300);
  });

  it('rejects unsupported content types', async () => {
    await expect(
      service.presignImageUpload('user-1', 'application/pdf'),
    ).rejects.toThrow('Unsupported image content type');
  });

  it('builds a public URL from a key and returns null without one', () => {
    expect(service.buildPublicUrl('bills/user-1/a.jpg')).toBe(
      'https://cdn.test/bills/user-1/a.jpg',
    );
    expect(service.buildPublicUrl(null)).toBeNull();
  });

  it('fails clearly when R2 is not configured', async () => {
    const unconfigured = new UploadService({
      get: () => undefined,
    } as unknown as ConfigService);

    await expect(
      unconfigured.presignImageUpload('user-1', 'image/png'),
    ).rejects.toThrow('Missing R2_BUCKET');
  });
});
