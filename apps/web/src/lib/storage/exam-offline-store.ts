/**
 * AVANA Exam Offline Store
 *
 * Local-first durable storage for exam answers with monotonic revisions,
 * pending change tracking, and server acknowledgement synchronization.
 *
 * Storage Strategy:
 * 1. Native IndexedDB (Primary)
 * 2. localStorage (Fallback 1)
 * 3. In-Memory Map (Fallback 2, non-durable)
 */

export interface StoredExamAnswer {
  attemptId: string;
  questionId: string;
  answer: unknown;
  revision: number;
  updatedAt: string;
  synced: boolean;
}

export interface IExamOfflineStore {
  saveAnswer(
    attemptId: string,
    questionId: string,
    answer: unknown,
  ): Promise<StoredExamAnswer>;
  getPendingAnswers(attemptId: string): Promise<StoredExamAnswer[]>;
  markAnswersAsSynced(
    attemptId: string,
    acknowledged: Array<{ questionId: string; revision: number }>,
  ): Promise<void>;
  getAllAnswers(attemptId: string): Promise<Record<string, unknown>>;
  getRawAnswers(attemptId: string): Promise<StoredExamAnswer[]>;
  clearAttempt(attemptId: string): Promise<void>;
  getStorageType(): "indexeddb" | "localstorage" | "memory";
  isDurable(): boolean;
}

const DB_NAME = "avana_exam_offline_v1";
const STORE_NAME = "pending_answers";
const DB_VERSION = 1;

/**
 * Native IndexedDB implementation of IExamOfflineStore
 */
export class IndexedDbExamStore implements IExamOfflineStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        return reject(new Error("IndexedDB is not available in this environment"));
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Key path is compound: [attemptId, questionId]
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: ["attemptId", "questionId"],
          });
          store.createIndex("by_attempt", "attemptId", { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        reject(request.error || new Error("Failed to open IndexedDB"));
      };
    });

    return this.dbPromise;
  }

  async saveAnswer(
    attemptId: string,
    questionId: string,
    answer: unknown,
  ): Promise<StoredExamAnswer> {
    const db = await this.getDB();
    const existing = await this.getOne(db, attemptId, questionId);
    const revision = (existing?.revision ?? 0) + 1;

    const record: StoredExamAnswer = {
      attemptId,
      questionId,
      answer,
      revision,
      updatedAt: new Date().toISOString(),
      synced: false,
    };

    return new Promise<StoredExamAnswer>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  private getOne(
    db: IDBDatabase,
    attemptId: string,
    questionId: string,
  ): Promise<StoredExamAnswer | undefined> {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get([attemptId, questionId]);
      req.onsuccess = () => resolve(req.result as StoredExamAnswer | undefined);
      req.onerror = () => resolve(undefined);
    });
  }

  async getPendingAnswers(attemptId: string): Promise<StoredExamAnswer[]> {
    const all = await this.getRawAnswers(attemptId);
    return all.filter((a) => !a.synced);
  }

  async markAnswersAsSynced(
    attemptId: string,
    acknowledged: Array<{ questionId: string; revision: number }>,
  ): Promise<void> {
    if (!acknowledged || acknowledged.length === 0) return;
    const db = await this.getDB();
    const ackMap = new Map(acknowledged.map((a) => [a.questionId, a.revision]));

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_attempt");
      const req = index.getAll(attemptId);

      req.onsuccess = () => {
        const records = (req.result || []) as StoredExamAnswer[];
        for (const rec of records) {
          const ackRev = ackMap.get(rec.questionId);
          if (ackRev !== undefined && rec.revision <= ackRev) {
            rec.synced = true;
            store.put(rec);
          }
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllAnswers(attemptId: string): Promise<Record<string, unknown>> {
    const raw = await this.getRawAnswers(attemptId);
    const result: Record<string, unknown> = {};
    for (const r of raw) {
      result[r.questionId] = r.answer;
    }
    return result;
  }

  async getRawAnswers(attemptId: string): Promise<StoredExamAnswer[]> {
    const db = await this.getDB();
    return new Promise<StoredExamAnswer[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_attempt");
      const req = index.getAll(attemptId);

      req.onsuccess = () => resolve((req.result || []) as StoredExamAnswer[]);
      req.onerror = () => reject(req.error);
    });
  }

  async clearAttempt(attemptId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_attempt");
      const req = index.getAll(attemptId);

      req.onsuccess = () => {
        const records = (req.result || []) as StoredExamAnswer[];
        for (const rec of records) {
          store.delete([rec.attemptId, rec.questionId]);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  getStorageType(): "indexeddb" {
    return "indexeddb";
  }

  isDurable(): boolean {
    return true;
  }
}

/**
 * Fallback 1: localStorage implementation
 */
export class LocalStorageExamStore implements IExamOfflineStore {
  private getKey(attemptId: string): string {
    return `avana_exam_answers_${attemptId}`;
  }

  private load(attemptId: string): Record<string, StoredExamAnswer> {
    if (typeof window === "undefined" || !window.localStorage) return {};
    try {
      const raw = window.localStorage.getItem(this.getKey(attemptId));
      return raw ? (JSON.parse(raw) as Record<string, StoredExamAnswer>) : {};
    } catch {
      return {};
    }
  }

  private save(attemptId: string, data: Record<string, StoredExamAnswer>): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(this.getKey(attemptId), JSON.stringify(data));
    } catch {
      // Ignore quota exceeded
    }
  }

  async saveAnswer(
    attemptId: string,
    questionId: string,
    answer: unknown,
  ): Promise<StoredExamAnswer> {
    const data = this.load(attemptId);
    const existing = data[questionId];
    const revision = (existing?.revision ?? 0) + 1;

    const record: StoredExamAnswer = {
      attemptId,
      questionId,
      answer,
      revision,
      updatedAt: new Date().toISOString(),
      synced: false,
    };

    data[questionId] = record;
    this.save(attemptId, data);
    return record;
  }

  async getPendingAnswers(attemptId: string): Promise<StoredExamAnswer[]> {
    const data = this.load(attemptId);
    return Object.values(data).filter((a) => !a.synced);
  }

  async markAnswersAsSynced(
    attemptId: string,
    acknowledged: Array<{ questionId: string; revision: number }>,
  ): Promise<void> {
    const data = this.load(attemptId);
    for (const ack of acknowledged) {
      const rec = data[ack.questionId];
      if (rec && rec.revision <= ack.revision) {
        rec.synced = true;
      }
    }
    this.save(attemptId, data);
  }

  async getAllAnswers(attemptId: string): Promise<Record<string, unknown>> {
    const data = this.load(attemptId);
    const res: Record<string, unknown> = {};
    for (const [qid, r] of Object.entries(data)) {
      res[qid] = r.answer;
    }
    return res;
  }

  async getRawAnswers(attemptId: string): Promise<StoredExamAnswer[]> {
    return Object.values(this.load(attemptId));
  }

  async clearAttempt(attemptId: string): Promise<void> {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(this.getKey(attemptId));
      } catch {
        // Ignore
      }
    }
  }

  getStorageType(): "localstorage" {
    return "localstorage";
  }

  isDurable(): boolean {
    return true;
  }
}

/**
 * Fallback 2: In-Memory implementation (Non-durable, used in headless/SSR environments)
 */
export class MemoryExamStore implements IExamOfflineStore {
  private store = new Map<string, Map<string, StoredExamAnswer>>();

  private getAttemptMap(attemptId: string): Map<string, StoredExamAnswer> {
    let m = this.store.get(attemptId);
    if (!m) {
      m = new Map();
      this.store.set(attemptId, m);
    }
    return m;
  }

  async saveAnswer(
    attemptId: string,
    questionId: string,
    answer: unknown,
  ): Promise<StoredExamAnswer> {
    const m = this.getAttemptMap(attemptId);
    const existing = m.get(questionId);
    const revision = (existing?.revision ?? 0) + 1;

    const record: StoredExamAnswer = {
      attemptId,
      questionId,
      answer,
      revision,
      updatedAt: new Date().toISOString(),
      synced: false,
    };

    m.set(questionId, record);
    return record;
  }

  async getPendingAnswers(attemptId: string): Promise<StoredExamAnswer[]> {
    const m = this.getAttemptMap(attemptId);
    return Array.from(m.values()).filter((a) => !a.synced);
  }

  async markAnswersAsSynced(
    attemptId: string,
    acknowledged: Array<{ questionId: string; revision: number }>,
  ): Promise<void> {
    const m = this.getAttemptMap(attemptId);
    for (const ack of acknowledged) {
      const rec = m.get(ack.questionId);
      if (rec && rec.revision <= ack.revision) {
        rec.synced = true;
      }
    }
  }

  async getAllAnswers(attemptId: string): Promise<Record<string, unknown>> {
    const m = this.getAttemptMap(attemptId);
    const res: Record<string, unknown> = {};
    for (const [qid, r] of m.entries()) {
      res[qid] = r.answer;
    }
    return res;
  }

  async getRawAnswers(attemptId: string): Promise<StoredExamAnswer[]> {
    const m = this.getAttemptMap(attemptId);
    return Array.from(m.values());
  }

  async clearAttempt(attemptId: string): Promise<void> {
    this.store.delete(attemptId);
  }

  getStorageType(): "memory" {
    return "memory";
  }

  isDurable(): boolean {
    return false;
  }
}

/**
 * Creates the most durable available store instance (IndexedDB -> localStorage -> Memory).
 */
export function createExamOfflineStore(): IExamOfflineStore {
  if (typeof window !== "undefined" && window.indexedDB) {
    return new IndexedDbExamStore();
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const testKey = "__test_local_storage__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return new LocalStorageExamStore();
    } catch {
      // Fall through to memory
    }
  }

  return new MemoryExamStore();
}

/**
 * Singleton instance for app-wide reuse
 */
export const defaultExamOfflineStore = createExamOfflineStore();
