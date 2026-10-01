import type { UserId } from "@avana/domain";

export interface PasswordResetTokenRecord {
  id: string;
  userId: UserId;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
}

export interface PasswordResetStore {
  createToken(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
  }): Promise<PasswordResetTokenRecord>;

  findByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | undefined>;

  /**
   * Atomically consume token and update password in one transaction.
   * Ensures that:
   * 1. Token must exist, usedAt IS NULL, and expiresAt > now.
   * 2. Multiple concurrent requests with the same token will have exactly ONE success.
   * 3. Password is updated, token is marked used, other tokens for user are invalidated,
   *    and all active user sessions are revoked atomically.
   */
  atomicConsumeAndResetPassword(params: {
    tokenHash: string;
    newPasswordHash: string;
  }): Promise<{
    success: boolean;
    userId?: UserId;
    reason?: "invalid" | "expired" | "already_used";
  }>;

  deleteToken(id: string): Promise<void>;

  invalidateAllForUser(userId: UserId): Promise<void>;
}
