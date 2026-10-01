import { RefreshTokenModel, type RefreshTokenDocument } from './refreshToken.model';

export class RefreshTokenRepository {
  async create(input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string;
    ip: string;
  }): Promise<RefreshTokenDocument> {
    return RefreshTokenModel.create(input);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenDocument | null> {
    return RefreshTokenModel.findOne({ tokenHash });
  }

  async listByUser(userId: string): Promise<RefreshTokenDocument[]> {
    return RefreshTokenModel.find({ userId }).sort({ createdAt: -1 });
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await RefreshTokenModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: at } },
    );
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    await RefreshTokenModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: at } });
  }

  async save(token: RefreshTokenDocument): Promise<RefreshTokenDocument> {
    return token.save();
  }
}
