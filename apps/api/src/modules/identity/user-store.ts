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
  phoneNumber?: string | null;
  major?: string | null;
  university?: string | null;
  faculty?: string | null;
  department?: string | null;
  teacherStatus?: "pending" | "approved" | "rejected";
  emailVerifiedAt?: string | null;
  emailVerified?: boolean;
  phoneVerifiedAt?: string | null;
  phoneVerified?: boolean;
}

export interface UserWithPasswordRecord extends UserRecord {
  passwordHash?: string | null;
}

export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | undefined>;

  findByPhoneNumber?(phoneNumber: string): Promise<UserRecord | undefined>;

  findWithPasswordByEmail(email: string): Promise<UserWithPasswordRecord | undefined>;

  findById(id: UserId): Promise<UserRecord | undefined>;

  createFromVerifiedIdentity(identity: VerifiedIdentity): Promise<UserRecord>;

  createUserWithPassword(params: {
    email: string;
    passwordHash: string;
    name?: string;
    phoneNumber?: string;
    major?: string | null;
    university?: string | null;
    faculty?: string | null;
    department?: string | null;
    globalRole?: string | null;
  }): Promise<UserRecord>;

  setEmailVerified(userId: UserId): Promise<void>;

  setPhoneVerified(userId: UserId): Promise<void>;

  updatePassword(userId: UserId, passwordHash: string): Promise<void>;

  updateName(userId: UserId, name: string): Promise<void>;

  updateMajor?(userId: UserId, major: string | null): Promise<void>;

  updateProfileFields?(
    userId: UserId,
    fields: {
      name?: string;
      major?: string | null;
      university?: string | null;
      faculty?: string | null;
      department?: string | null;
    },
  ): Promise<void>;

  updatePhoneNumber?(userId: UserId, phoneNumber: string): Promise<void>;

  deleteUser?(userId: UserId): Promise<void>;
}

