/**
 * User store abstraction.
 *
 * Decouples user lookup/create operations from the database.
 * The Drizzle implementation is wired at composition root (plugin.ts).
 */

import type { UserId, VerifiedIdentity } from "@avana/domain";

export interface UserRecord {
  id: UserId;
  email: string;
  name?: string;
  role: string;
  globalRole?: string | null;
  emailVerifiedAt?: string | null;
  emailVerified?: boolean;
}

export interface UserWithPasswordRecord extends UserRecord {
  passwordHash?: string | null;
}

export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | undefined>;

  findWithPasswordByEmail(email: string): Promise<UserWithPasswordRecord | undefined>;

  findById(id: UserId): Promise<UserRecord | undefined>;

  createFromVerifiedIdentity(identity: VerifiedIdentity): Promise<UserRecord>;

  createUserWithPassword(params: {
    email: string;
    passwordHash: string;
    name?: string;
    globalRole?: string | null;
  }): Promise<UserRecord>;

  setEmailVerified(userId: UserId): Promise<void>;

  deleteUser?(userId: UserId): Promise<void>;
}

