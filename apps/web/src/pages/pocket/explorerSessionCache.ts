import type { PocketDiscoveryItem, PocketSearchResultItem } from "../../lib/api/pocket.js";

export type ExplorerItem = PocketDiscoveryItem | PocketSearchResultItem;

export interface ExplorerSessionData {
  items: ExplorerItem[];
  total: number;
  offset: number;
  hasMore: boolean;
  generation: number;
  lastAccessedAt: number;
  inFlightOffsets: Set<number>;
}

export const MAX_SESSIONS = 5;
export const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const sessionStore = new Map<string, ExplorerSessionData>();

/**
 * Normalizes query string to a clean, lowercase, trimmed string.
 */
export function cleanSearchQuery(q: string | null | undefined): string {
  if (!q) return "";
  return q.trim().toLowerCase();
}

/**
 * Builds the canonical tuple key for an Explorer session:
 * JSON.stringify([cleanQ, validType, validSort])
 */
export function buildExplorerSessionKey(
  query: string | null | undefined,
  type: string | null | undefined,
  sort: string | null | undefined,
): string {
  const cleanQ = cleanSearchQuery(query);
  const validType = (type ?? "all").trim().toLowerCase();
  const validSort = (sort ?? "recent").trim().toLowerCase();
  return JSON.stringify([cleanQ, validType, validSort]);
}

/**
 * Removes expired sessions from the store.
 */
function pruneExpiredSessions(now: number = Date.now()): void {
  for (const [key, session] of sessionStore.entries()) {
    if (now - session.lastAccessedAt > SESSION_TTL_MS) {
      sessionStore.delete(key);
    }
  }
}

/**
 * Evicts the least recently used session if capacity exceeds MAX_SESSIONS.
 */
function evictLruIfNeeded(): void {
  while (sessionStore.size >= MAX_SESSIONS) {

  let oldestKey: string | null = null;
  let oldestTime = Infinity;

  for (const [key, session] of sessionStore.entries()) {
    if (session.lastAccessedAt < oldestTime) {
      oldestTime = session.lastAccessedAt;
      oldestKey = key;
    }
  }

    if (oldestKey) {
      sessionStore.delete(oldestKey);
    } else {
      break;
    }
  }
}

/**
 * Starts or activates a session, assigning an incremented generation
 * to invalidate any previous in-flight requests from older generations.
 */
export function startExplorerSession(key: string, now: number = Date.now()): { generation: number } {
  pruneExpiredSessions(now);

  const existing = sessionStore.get(key);
  if (existing) {
    existing.generation += 1;
    existing.lastAccessedAt = now;
    existing.inFlightOffsets.clear();
    return { generation: existing.generation };
  }

  evictLruIfNeeded();

  const newSession: ExplorerSessionData = {
    items: [],
    total: 0,
    offset: 0,
    hasMore: true,
    generation: 1,
    lastAccessedAt: now,
    inFlightOffsets: new Set<number>(),
  };

  sessionStore.set(key, newSession);
  return { generation: newSession.generation };
}

/**
 * Synchronously retrieves a session from cache if valid and unexpired.
 */
export function getExplorerSession(key: string, now: number = Date.now()): ExplorerSessionData | null {
  pruneExpiredSessions(now);
  const session = sessionStore.get(key);
  if (!session) {
    return null;
  }

  session.lastAccessedAt = now;
  return session;
}

/**
 * Updates an explorer session with newly loaded items, guarded by generation matching.
 * Discards responses if the generation does not match active generation.
 */
export function updateExplorerSession(
  key: string,
  update: {
    items: ExplorerItem[];
    total: number;
    offset: number;
    hasMore: boolean;
  },
  expectedGeneration: number,
  now: number = Date.now(),
): boolean {
  pruneExpiredSessions(now);
  const session = sessionStore.get(key);

  if (!session) {
    return false;
  }

  // Request Race Guard: reject stale out-of-order generation
  if (session.generation !== expectedGeneration) {
    return false;
  }

  session.items = update.items;
  session.total = update.total;
  session.offset = update.offset;
  session.hasMore = update.hasMore;
  session.lastAccessedAt = now;
  return true;
}

/**
 * Checks if an offset is currently in-flight for this session.
 */
export function isOffsetInFlight(key: string, offset: number): boolean {
  const session = sessionStore.get(key);
  return session ? session.inFlightOffsets.has(offset) : false;
}

/**
 * Marks an offset as in-flight for the session.
 */
export function markOffsetInFlight(key: string, offset: number): void {
  const session = sessionStore.get(key);
  if (session) {
    session.inFlightOffsets.add(offset);
  }
}

/**
 * Clears an in-flight offset once the request finishes or fails.
 */
export function clearOffsetInFlight(key: string, offset: number): void {
  const session = sessionStore.get(key);
  if (session) {
    session.inFlightOffsets.delete(offset);
  }
}

/**
 * Clears all cached sessions (used for test teardown).
 */
export function clearExplorerSessionCache(): void {
  sessionStore.clear();
}
