import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/config.js';

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/**
 * Signing these headers makes storage reject uploads whose type or byte count differs from what
 * was declared, so a client cannot upload more than it was allowed to.
 */
const SIGNED_UPLOAD_HEADERS = new Set(['content-type', 'content-length']);
const SIGNED_PART_HEADERS = new Set(['content-length']);
// The SDK adds a default content type to UploadPart; parts have none, so it must stay unsigned.
const UNSIGNED_PART_HEADERS = new Set(['content-type']);

/** MinIO through the S3 API. Browsers upload and download with URLs signed here. */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly uploadUrlTtlSeconds: number;
  private readonly downloadUrlTtlSeconds: number;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      // MinIO serves buckets as paths (http://host/bucket/key), not as subdomains.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
      // The SDK otherwise adds CRC32 checksums that browsers cannot reproduce for pre-signed
      // uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.bucket = config.S3_BUCKET;
    this.uploadUrlTtlSeconds = config.UPLOAD_URL_TTL_SECONDS;
    this.downloadUrlTtlSeconds = config.DOWNLOAD_URL_TTL_SECONDS;
  }

  onModuleDestroy() {
    this.client.destroy();
  }

  presignPut(key: string, contentType: string, contentLength: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: this.uploadUrlTtlSeconds,
      signableHeaders: SIGNED_UPLOAD_HEADERS,
    });
  }

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );
    if (!res.UploadId) throw new Error(`Storage returned no UploadId for ${key}`);
    return res.UploadId;
  }

  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: this.uploadUrlTtlSeconds,
      signableHeaders: SIGNED_PART_HEADERS,
      unsignableHeaders: UNSIGNED_PART_HEADERS,
    });
  }

  /**
   * Short-lived download URL. Storage serves the object as an opaque attachment, so a browser never
   * renders uploaded content (e.g. HTML) in its own context.
   */
  presignGet(key: string, contentDisposition: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition,
      ResponseContentType: 'application/octet-stream',
    });
    return getSignedUrl(this.client, command, { expiresIn: this.downloadUrlTtlSeconds });
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
    );
  }

  /** Returns the stored object's size, or null when it does not exist. */
  async headObject(key: string): Promise<{ size: number } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0 };
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  }

  async deleteObject(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
