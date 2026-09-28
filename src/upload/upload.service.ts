import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { UploadScope } from './dto/presign-upload.dto.js';

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const PRESIGN_EXPIRES_IN = 300;

@Injectable()
export class UploadService {
  private client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Tạo presigned URL để client PUT thẳng ảnh lên R2.
   * Trả về `key` (lưu vào DB) và `publicUrl` để xem trước.
   */
  async presignImageUpload(
    userId: string,
    contentType: string,
    scope: UploadScope = 'bills',
  ) {
    const extension = CONTENT_TYPE_EXTENSIONS[contentType];
    if (!extension) {
      throw new BadRequestException('Unsupported image content type');
    }

    const key = `${scope}/${userId}/${randomUUID()}.${extension}`;
    const command = new PutObjectCommand({
      Bucket: this.requireConfig('R2_BUCKET'),
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.getClient(), command, {
      expiresIn: PRESIGN_EXPIRES_IN,
    });

    return {
      key,
      uploadUrl,
      publicUrl: this.buildPublicUrl(key),
      expiresIn: PRESIGN_EXPIRES_IN,
    };
  }

  /** URL công khai dựng từ object key; `null` nếu chưa cấu hình domain. */
  buildPublicUrl(key: string | null | undefined): string | null {
    if (!key) return null;

    const base = this.configService.get<string>('R2_PUBLIC_BASE_URL');
    if (!base) return null;

    return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;

    const accountId = this.requireConfig('R2_ACCOUNT_ID');
    const endpoint =
      this.configService.get<string>('R2_ENDPOINT') ??
      `https://${accountId}.r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: this.requireConfig('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.requireConfig('R2_SECRET_ACCESS_KEY'),
      },
    });

    return this.client;
  }

  private requireConfig(name: string): string {
    const value = this.configService.get<string>(name);

    if (!value) {
      throw new InternalServerErrorException(
        `Missing ${name} configuration for file uploads`,
      );
    }

    return value;
  }
}
