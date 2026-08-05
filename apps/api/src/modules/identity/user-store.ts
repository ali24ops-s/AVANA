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
  role: string;
}

export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | undefined>;

  findById(id: UserId): Promise<UserRecord | undefined>;

  createFromVerifiedIdentity(identity: VerifiedIdentity): Promise<UserRecord>;
}
