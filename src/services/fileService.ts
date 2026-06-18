import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { ServerConfig } from '../types';
import { eventBus } from '../events';

export interface UploadResult {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  thumbnailUrl?: string;
  mimetype: string;
  size: number;
}

const IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

export class FileService {
  private config!: ServerConfig;
  private baseUrl = '/uploads';

  init(config: ServerConfig): void {
    this.config = config;
    if (!fs.existsSync(config.uploadDir)) {
      fs.mkdirSync(config.uploadDir, { recursive: true });
    }
    const thumbsDir = path.join(config.uploadDir, 'thumbnails');
    if (!fs.existsSync(thumbsDir)) {
      fs.mkdirSync(thumbsDir, { recursive: true });
    }
  }

  async uploadFile(
    file: NodeJS.ReadableStream & { filename: string; mimetype: string; file?: any },
    userId: string
  ): Promise<UploadResult> {
    const uploadId = uuidv4();
    const ext = path.extname(file.filename) || '';
    const storedName = `${uploadId}${ext}`;
    const filePath = path.join(this.config.uploadDir, storedName);
    const writeStream = fs.createWriteStream(filePath);
    let uploadedBytes = 0;
    let totalBytes = 0;

    for await (const chunk of file) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
      uploadedBytes += buf.length;
      if (uploadedBytes > this.config.maxFileSize) {
        writeStream.destroy();
        fs.promises.unlink(filePath).catch(() => {});
        throw new Error('文件大小超出限制');
      }
      const progress = totalBytes > 0 ? Math.min(99, Math.round((uploadedBytes / totalBytes) * 100)) : 0;
      eventBus.emitUploadProgress(userId, {
        uploadId,
        progress,
        filename: file.filename,
      });
      writeStream.write(buf);
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const stats = fs.statSync(filePath);
    const finalSize = stats.size;
    let thumbnailUrl: string | undefined;
    if (IMAGE_MIMETYPES.includes(file.mimetype)) {
      try {
        const thumbName = `${uploadId}_thumb${ext}`;
        const thumbPath = path.join(this.config.uploadDir, 'thumbnails', thumbName);
        await sharp(filePath)
          .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
          .toFile(thumbPath);
        thumbnailUrl = `${this.baseUrl}/thumbnails/${thumbName}`;
      } catch (e) {
        console.warn('缩略图生成失败:', e);
      }
    }
    eventBus.emitUploadProgress(userId, {
      uploadId,
      progress: 100,
      filename: file.filename,
    });
    return {
      id: uploadId,
      filename: storedName,
      originalName: file.filename,
      url: `${this.baseUrl}/${storedName}`,
      thumbnailUrl,
      mimetype: file.mimetype,
      size: finalSize,
    };
  }

  getFilePath(filename: string): string {
    const safeName = path.basename(filename);
    return path.join(this.config.uploadDir, safeName);
  }

  getUploadDir(): string {
    return this.config.uploadDir;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

export const fileService = new FileService();
