import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { config } from './config.js';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_DURATION_SEC = 60;

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
]);

export function extForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    default:
      return 'bin';
  }
}

export interface MediaStorage {
  putMedia(
    uid: string,
    memoryId: string,
    buffer: Buffer,
    mime: string
  ): Promise<{ gcsPath: string; thumbPath: string | null; kind: 'image' | 'video'; mime: string }>;
  getSignedOrStreamData(
    gcsPath: string
  ): Promise<{ type: 'url'; url: string } | { type: 'buffer'; buffer: Buffer; mime: string } | null>;
  deleteMedia(gcsPath: string | null | undefined, thumbPath?: string | null): Promise<void>;
  deleteAllUserMedia(uid: string): Promise<void>;
}

async function processImageBuffer(buffer: Buffer, mime: string): Promise<{ full: Buffer; thumb: Buffer; mime: string }> {
  const image = sharp(buffer, { failOnError: false }).rotate();
  const fullPipe = image.clone().resize({
    width: 1280,
    height: 1280,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const thumbPipe = image.clone().resize({
    width: 480,
    height: 480,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (mime === 'image/png') {
    return {
      full: await fullPipe.png({ compressionLevel: 8 }).toBuffer(),
      thumb: await thumbPipe.webp({ quality: 75 }).toBuffer(),
      mime: 'image/png',
    };
  }
  if (mime === 'image/webp') {
    return {
      full: await fullPipe.webp({ quality: 85 }).toBuffer(),
      thumb: await thumbPipe.webp({ quality: 75 }).toBuffer(),
      mime: 'image/webp',
    };
  }
  return {
    full: await fullPipe.jpeg({ quality: 85 }).toBuffer(),
    thumb: await thumbPipe.webp({ quality: 75 }).toBuffer(),
    mime: 'image/jpeg',
  };
}

export class GcsMediaStorage implements MediaStorage {
  private storage: Storage;
  private bucketName: string;

  constructor(bucketName: string) {
    this.storage = new Storage();
    this.bucketName = bucketName;
  }

  private extractObjectKey(gcsPath: string): string | null {
    const prefix = `gs://${this.bucketName}/`;
    if (gcsPath.startsWith(prefix)) {
      return gcsPath.slice(prefix.length);
    }
    return null;
  }

  async putMedia(uid: string, memoryId: string, buffer: Buffer, mime: string) {
    const bucket = this.storage.bucket(this.bucketName);
    const ext = extForMime(mime);
    const objectKey = `users/${uid}/media/${memoryId}.${ext}`;
    const gcsPath = `gs://${this.bucketName}/${objectKey}`;

    if (mime.startsWith('image/')) {
      const processed = await processImageBuffer(buffer, mime);
      await bucket.file(objectKey).save(processed.full, {
        contentType: processed.mime,
        resumable: false,
      });
      const thumbKey = `users/${uid}/media/${memoryId}_thumb.webp`;
      const thumbPath = `gs://${this.bucketName}/${thumbKey}`;
      await bucket.file(thumbKey).save(processed.thumb, {
        contentType: 'image/webp',
        resumable: false,
      });
      return { gcsPath, thumbPath, kind: 'image' as const, mime: processed.mime };
    }

    await bucket.file(objectKey).save(buffer, {
      contentType: mime,
      resumable: false,
    });
    return { gcsPath, thumbPath: null, kind: 'video' as const, mime };
  }

  async getSignedOrStreamData(gcsPath: string) {
    const key = this.extractObjectKey(gcsPath);
    if (!key) return null;
    const file = this.storage.bucket(this.bucketName).file(key);
    try {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      });
      return { type: 'url' as const, url };
    } catch {
      const [exists] = await file.exists();
      if (!exists) return null;
      const [metadata] = await file.getMetadata();
      const [buffer] = await file.download();
      return {
        type: 'buffer' as const,
        buffer,
        mime: metadata.contentType || 'application/octet-stream',
      };
    }
  }

  async deleteMedia(gcsPath: string | null | undefined, thumbPath?: string | null) {
    const paths = [gcsPath, thumbPath].filter((p): p is string => Boolean(p));
    for (const p of paths) {
      const key = this.extractObjectKey(p);
      if (!key) continue;
      await this.storage.bucket(this.bucketName).file(key).delete({ ignoreNotFound: true });
    }
  }

  async deleteAllUserMedia(uid: string) {
    const bucket = this.storage.bucket(this.bucketName);
    await bucket.deleteFiles({ prefix: `users/${uid}/media/` }).catch(() => {});
  }
}

export class InMemoryMediaStorage implements MediaStorage {
  private files = new Map<string, { buffer: Buffer; mime: string }>();

  async putMedia(uid: string, memoryId: string, buffer: Buffer, mime: string) {
    const ext = extForMime(mime);
    const gcsPath = `memory://local/users/${uid}/media/${memoryId}.${ext}`;
    if (mime.startsWith('image/')) {
      const processed = await processImageBuffer(buffer, mime);
      const thumbPath = `memory://local/users/${uid}/media/${memoryId}_thumb.webp`;
      this.files.set(gcsPath, { buffer: processed.full, mime: processed.mime });
      this.files.set(thumbPath, { buffer: processed.thumb, mime: 'image/webp' });
      return { gcsPath, thumbPath, kind: 'image' as const, mime: processed.mime };
    }
    this.files.set(gcsPath, { buffer, mime });
    return { gcsPath, thumbPath: null, kind: 'video' as const, mime };
  }

  async getSignedOrStreamData(gcsPath: string) {
    const item = this.files.get(gcsPath);
    if (!item) return null;
    return { type: 'buffer' as const, buffer: item.buffer, mime: item.mime };
  }

  async deleteMedia(gcsPath: string | null | undefined, thumbPath?: string | null) {
    if (gcsPath) this.files.delete(gcsPath);
    if (thumbPath) this.files.delete(thumbPath);
  }

  async deleteAllUserMedia(uid: string) {
    const prefix = `memory://local/users/${uid}/media/`;
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        this.files.delete(key);
      }
    }
  }
}

export function createMediaStorage(): MediaStorage {
  if (config.mediaBucket && process.env.NEOPHI_LOCAL_STORE !== 'memory') {
    return new GcsMediaStorage(config.mediaBucket);
  }
  return new InMemoryMediaStorage();
}
