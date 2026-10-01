import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../common/AppError';
import { ERROR_CODES, HTTP } from '../common/constants';
import type { Env } from './env';

export type StoredFile = {
  url: string;
  publicId: string;
};

export type SignedUpload = {
  timestamp: number;
  folder: string;
  signature: string;
  cloudName: string;
  apiKey: string;
};

export type StoragePort = {
  uploadDataUri(dataUri: string, folder: string): Promise<StoredFile>;
  signUpload(folder: string): SignedUpload;
};

export class MemoryStorage implements StoragePort {
  readonly files: StoredFile[] = [];

  async uploadDataUri(dataUri: string, folder: string): Promise<StoredFile> {
    if (!dataUri.startsWith('data:image/') && !dataUri.startsWith('data:application/pdf')) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'Upload a JPEG, PNG, or PDF');
    }
    const file = {
      url: dataUri.startsWith('data:image/')
        ? dataUri
        : `https://cdn.ridex.test/${folder}/${this.files.length + 1}`,
      publicId: `${folder}/${this.files.length + 1}`,
    };
    this.files.push(file);
    return file;
  }

  signUpload(folder: string): SignedUpload {
    return {
      timestamp: Math.floor(Date.now() / 1000),
      folder,
      signature: 'test-signature',
      cloudName: 'test',
      apiKey: 'test',
    };
  }
}

export class CloudinaryStorage implements StoragePort {
  constructor(private readonly env: Env) {}

  private assertConfigured(): void {
    if (!this.env.CLOUDINARY_CLOUD_NAME || !this.env.CLOUDINARY_API_KEY || !this.env.CLOUDINARY_API_SECRET) {
      throw new AppError(
        HTTP.SERVICE_UNAVAILABLE,
        ERROR_CODES.CLOUDINARY_NOT_CONFIGURED,
        'Image uploads are not configured',
      );
    }
    cloudinary.config({
      cloud_name: this.env.CLOUDINARY_CLOUD_NAME,
      api_key: this.env.CLOUDINARY_API_KEY,
      api_secret: this.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadDataUri(dataUri: string, folder: string): Promise<StoredFile> {
    this.assertConfigured();
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'auto',
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  signUpload(folder: string): SignedUpload {
    this.assertConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      this.env.CLOUDINARY_API_SECRET,
    );
    return {
      timestamp,
      folder,
      signature,
      cloudName: this.env.CLOUDINARY_CLOUD_NAME,
      apiKey: this.env.CLOUDINARY_API_KEY,
    };
  }
}
