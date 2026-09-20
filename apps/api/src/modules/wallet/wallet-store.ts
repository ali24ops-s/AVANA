/**
 * Wallet Store Interface and Implementations (Drizzle & In-Memory).
 *
 * Handles persistence for:
 * - wallets
 * - wallet_transactions (Immutable Ledger)
 *
 * Implements strict atomic database transactions, row-level locking,
 * idempotency checks, and non-negative balance guarantees.
 */

import { eq, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DbClient } from "@avana/database/client";
import {
  wallets,
  walletTransactions,
} from "@avana/database/schema";
import {
  type UUID,
  type UserId,
  type WalletId,
  type WalletTransactionId,
  type WalletRecord,
  type WalletTransactionRecord,
  type WalletTransactionType,
  type WalletTransactionSource,
  type WalletReferenceType,
  asUserId,
  asWalletId,
  asWalletTransactionId,
  validateTransactionAmount,
  validateWalletBalance,
  DomainError,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------

export interface ExecuteWalletMutationParams {
  userId: UserId;
  mutationType: WalletTransactionType;
  amount: number;
  source: WalletTransactionSource;
  referenceType: WalletReferenceType;
  referenceId: string;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WalletStore {
  findWalletByUserId(userId: UserId): Promise<WalletRecord | null>;
  findWalletById(id: WalletId): Promise<WalletRecord | null>;
  createWallet(wallet: WalletRecord): Promise<WalletRecord>;
  getOrCreateWallet(userId: UserId): Promise<WalletRecord>;
  findTransactionById(id: WalletTransactionId): Promise<WalletTransactionRecord | null>;
  findTransactionByIdempotencyKey(key: string): Promise<WalletTransactionRecord | null>;
  listTransactionsByUserId(
    userId: UserId,
    limit?: number,
    offset?: number,
  ): Promise<{ transactions: WalletTransactionRecord[]; total: number }>;
  executeAtomicWalletMutation(
    params: ExecuteWalletMutationParams,
  ): Promise<{ wallet: WalletRecord; transaction: WalletTransactionRecord; isDuplicate: boolean }>;
}

// ---------------------------------------------------------------------------
// Drizzle Implementation (PostgreSQL)
// ---------------------------------------------------------------------------

export class DrizzleWalletStore implements WalletStore {
  constructor(private readonly db: DbClient) {}

  private mapWallet(row: typeof wallets.$inferSelect): WalletRecord {
    return {
      id: asWalletId(row.id as UUID),
      userId: asUserId(row.userId as UUID),
      balance: row.balance,
      currency: "toman",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapTransaction(row: typeof walletTransactions.$inferSelect): WalletTransactionRecord {
    return {
      id: asWalletTransactionId(row.id as UUID),
      walletId: asWalletId(row.walletId as UUID),
      userId: asUserId(row.userId as UUID),
      type: row.type as WalletTransactionType,
      amount: row.amount,
      balanceBefore: row.balanceBefore,
      balanceAfter: row.balanceAfter,
      source: row.source as WalletTransactionSource,
      referenceType: row.referenceType as WalletReferenceType,
      referenceId: row.referenceId,
      idempotencyKey: row.idempotencyKey,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findWalletByUserId(userId: UserId): Promise<WalletRecord | null> {
    const [row] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    return row ? this.mapWallet(row) : null;
  }

  async findWalletById(id: WalletId): Promise<WalletRecord | null> {
    const [row] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, id))
      .limit(1);

    return row ? this.mapWallet(row) : null;
  }

  async createWallet(wallet: WalletRecord): Promise<WalletRecord> {
    const [row] = await this.db
      .insert(wallets)
      .values({
        id: wallet.id,
        userId: wallet.userId,
        balance: wallet.balance,
        currency: wallet.currency,
        createdAt: new Date(wallet.createdAt),
        updatedAt: new Date(wallet.updatedAt),
      })
      .returning();

    return this.mapWallet(row);
  }

  async getOrCreateWallet(userId: UserId): Promise<WalletRecord> {
    const existing = await this.findWalletByUserId(userId);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const newWalletRecord: WalletRecord = {
      id: asWalletId(randomUUID()),
      userId,
      balance: 0,
      currency: "toman",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    try {
      return await this.createWallet(newWalletRecord);
    } catch {
      // Handle race condition on concurrent wallet initialization
      const raceWinner = await this.findWalletByUserId(userId);
      if (raceWinner) {
        return raceWinner;
      }
      throw new DomainError("internal_error", "Failed to get or create wallet");
    }
  }

  async findTransactionById(id: WalletTransactionId): Promise<WalletTransactionRecord | null> {
    const [row] = await this.db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.id, id))
      .limit(1);

    return row ? this.mapTransaction(row) : null;
  }

  async findTransactionByIdempotencyKey(key: string): Promise<WalletTransactionRecord | null> {
    if (!key || key.trim().length === 0) return null;
    const [row] = await this.db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.idempotencyKey, key.trim()))
      .limit(1);

    return row ? this.mapTransaction(row) : null;
  }

  async listTransactionsByUserId(
    userId: UserId,
    limit = 50,
    offset = 0,
  ): Promise<{ transactions: WalletTransactionRecord[]; total: number }> {
    const rows = await this.db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, userId));

    return {
      transactions: rows.map((r) => this.mapTransaction(r)),
      total: count,
    };
  }

  /**
   * Executes an atomic database transaction with row-level locking (FOR UPDATE)
   * to guarantee zero race conditions, ledger-balance consistency, and non-negative balance.
   */
  async executeAtomicWalletMutation(
    params: ExecuteWalletMutationParams,
  ): Promise<{ wallet: WalletRecord; transaction: WalletTransactionRecord; isDuplicate: boolean }> {
    const {
      userId,
      mutationType,
      amount,
      source,
      referenceType,
      referenceId,
      idempotencyKey,
      metadata = {},
    } = params;

    if (!validateTransactionAmount(amount)) {
      throw new DomainError(
        "bad_request",
        `مبلغ تراکنش باید یک عدد صحیح مثبت باشد: ${amount}`,
      );
    }

    const trimmedKey = idempotencyKey?.trim() || null;

    return this.db.transaction(async (tx) => {
      // 1. Idempotency Check: Check if a transaction with this idempotencyKey already exists
      if (trimmedKey) {
        const [existingTx] = await tx
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.idempotencyKey, trimmedKey))
          .limit(1);

        if (existingTx) {
          const [w] = await tx
            .select()
            .from(wallets)
            .where(eq(wallets.userId, userId))
            .limit(1);

          return {
            wallet: w ? this.mapWallet(w) : await this.getOrCreateWallet(userId),
            transaction: this.mapTransaction(existingTx),
            isDuplicate: true,
          };
        }
      }

      // 2. Lock the user's wallet row for UPDATE to prevent concurrent race conditions
      let [walletRow] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .for("update");

      const now = new Date();

      // If wallet doesn't exist yet, insert one atomically
      if (!walletRow) {
        const newWalletId = randomUUID();
        const [inserted] = await tx
          .insert(wallets)
          .values({
            id: newWalletId,
            userId,
            balance: 0,
            currency: "toman",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        walletRow = inserted;
      }

      const balanceBefore = walletRow.balance;
      let balanceAfter: number;

      // 3. Compute balance & enforce balance invariants
      if (mutationType === "credit" || mutationType === "refund") {
        balanceAfter = balanceBefore + amount;
      } else if (mutationType === "debit") {
        if (balanceBefore < amount) {
          throw new DomainError(
            "INSUFFICIENT_FUNDS",
            "موجودی کیف پول شما کافی نیست. لطفاً کیف پول خود را شارژ کنید.",
            {
              current_balance: balanceBefore,
              required_amount: amount,
            },
          );
        }
        balanceAfter = balanceBefore - amount;
      } else if (mutationType === "admin_adjustment") {
        balanceAfter = balanceBefore + amount;
        if (balanceAfter < 0) {
          throw new DomainError(
            "bad_request",
            "تغییر موجودی توسط ادمین نمی‌تواند منجر به موجودی منفی شود.",
          );
        }
      } else {
        throw new DomainError("bad_request", `نوع تراکنش نامعتبر است: ${mutationType as string}`);
      }

      if (!validateWalletBalance(balanceAfter)) {
        throw new DomainError("bad_request", `موجودی جدید نامعتبر است: ${balanceAfter}`);
      }

      // 4. Update wallet balance
      const [updatedWalletRow] = await tx
        .update(wallets)
        .set({
          balance: balanceAfter,
          updatedAt: now,
        })
        .where(eq(wallets.id, walletRow.id))
        .returning();

      // 5. Insert transaction ledger entry
      const txId = randomUUID();
      const [insertedTxRow] = await tx
        .insert(walletTransactions)
        .values({
          id: txId,
          walletId: walletRow.id,
          userId,
          type: mutationType,
          amount,
          balanceBefore,
          balanceAfter,
          source,
          referenceType,
          referenceId,
          idempotencyKey: trimmedKey,
          metadata,
          createdAt: now,
        })
        .returning();

      return {
        wallet: this.mapWallet(updatedWalletRow),
        transaction: this.mapTransaction(insertedTxRow),
        isDuplicate: false,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// In-Memory Implementation (For fast unit testing)
// ---------------------------------------------------------------------------

export class InMemoryWalletStore implements WalletStore {
  private readonly walletsMap = new Map<string, WalletRecord>();
  private readonly transactions: WalletTransactionRecord[] = [];
  private readonly idempotencyMap = new Map<string, WalletTransactionRecord>();

  async findWalletByUserId(userId: UserId): Promise<WalletRecord | null> {
    for (const w of this.walletsMap.values()) {
      if (w.userId === userId) {
        return { ...w };
      }
    }
    return null;
  }

  async findWalletById(id: WalletId): Promise<WalletRecord | null> {
    const w = this.walletsMap.get(id);
    return w ? { ...w } : null;
  }

  async createWallet(wallet: WalletRecord): Promise<WalletRecord> {
    // Unique check
    for (const existing of this.walletsMap.values()) {
      if (existing.userId === wallet.userId) {
        throw new Error("duplicate_wallet_user_id");
      }
    }
    this.walletsMap.set(wallet.id, { ...wallet });
    return { ...wallet };
  }

  async getOrCreateWallet(userId: UserId): Promise<WalletRecord> {
    const existing = await this.findWalletByUserId(userId);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const newRecord: WalletRecord = {
      id: asWalletId(randomUUID()),
      userId,
      balance: 0,
      currency: "toman",
      createdAt: now,
      updatedAt: now,
    };
    try {
      return await this.createWallet(newRecord);
    } catch {
      const concurrent = await this.findWalletByUserId(userId);
      if (concurrent) {
        return concurrent;
      }
      throw new Error("duplicate_wallet_user_id");
    }
  }

  async findTransactionById(id: WalletTransactionId): Promise<WalletTransactionRecord | null> {
    const found = this.transactions.find((t) => t.id === id);
    return found ? { ...found } : null;
  }

  async findTransactionByIdempotencyKey(key: string): Promise<WalletTransactionRecord | null> {
    if (!key) return null;
    const found = this.idempotencyMap.get(key);
    return found ? { ...found } : null;
  }

  async listTransactionsByUserId(
    userId: UserId,
    limit = 50,
    offset = 0,
  ): Promise<{ transactions: WalletTransactionRecord[]; total: number }> {
    const indexMap = new Map(this.transactions.map((t, idx) => [t.id, idx]));
    const userTxs = this.transactions
      .filter((t) => t.userId === userId)
      .sort((a, b) => {
        const diff =
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return diff !== 0
          ? diff
          : (indexMap.get(b.id) ?? 0) - (indexMap.get(a.id) ?? 0);
      });

    return {
      transactions: userTxs.slice(offset, offset + limit).map((t) => ({ ...t })),
      total: userTxs.length,
    };
  }

  private mutationQueue: Promise<unknown> = Promise.resolve();

  async executeAtomicWalletMutation(
    params: ExecuteWalletMutationParams,
  ): Promise<{ wallet: WalletRecord; transaction: WalletTransactionRecord; isDuplicate: boolean }> {
    const run = async () => {
      const {
        userId,
        mutationType,
        amount,
        source,
        referenceType,
        referenceId,
        idempotencyKey,
        metadata = {},
      } = params;

      if (!validateTransactionAmount(amount)) {
        throw new DomainError(
          "bad_request",
          `مبلغ تراکنش باید یک عدد صحیح مثبت باشد: ${amount}`,
        );
      }

      const trimmedKey = idempotencyKey?.trim() || null;
      if (trimmedKey && this.idempotencyMap.has(trimmedKey)) {
        const existingTx = this.idempotencyMap.get(trimmedKey)!;
        const wallet = await this.getOrCreateWallet(userId);
        return {
          wallet,
          transaction: { ...existingTx },
          isDuplicate: true,
        };
      }

      const wallet = await this.getOrCreateWallet(userId);
      const balanceBefore = wallet.balance;
      let balanceAfter: number;

      if (mutationType === "credit" || mutationType === "refund") {
        balanceAfter = balanceBefore + amount;
      } else if (mutationType === "debit") {
        if (balanceBefore < amount) {
          throw new DomainError(
            "INSUFFICIENT_FUNDS",
            "موجودی کیف پول شما کافی نیست. لطفاً کیف پول خود را شارژ کنید.",
            {
              current_balance: balanceBefore,
              required_amount: amount,
            },
          );
        }
        balanceAfter = balanceBefore - amount;
      } else if (mutationType === "admin_adjustment") {
        balanceAfter = balanceBefore + amount;
        if (balanceAfter < 0) {
          throw new DomainError(
            "bad_request",
            "تغییر موجودی توسط ادمین نمی‌تواند منجر به موجودی منفی شود.",
          );
        }
      } else {
        throw new DomainError("bad_request", `نوع تراکنش نامعتبر است: ${mutationType as string}`);
      }

      if (!validateWalletBalance(balanceAfter)) {
        throw new DomainError("bad_request", `موجودی جدید نامعتبر است: ${balanceAfter}`);
      }

      const now = new Date().toISOString();
      wallet.balance = balanceAfter;
      wallet.updatedAt = now;
      this.walletsMap.set(wallet.id, { ...wallet });

      const txRecord: WalletTransactionRecord = {
        id: asWalletTransactionId(randomUUID()),
        walletId: wallet.id,
        userId,
        type: mutationType,
        amount,
        balanceBefore,
        balanceAfter,
        source,
        referenceType,
        referenceId,
        idempotencyKey: trimmedKey,
        metadata,
        createdAt: now,
      };

      this.transactions.push(txRecord);
      if (trimmedKey) {
        this.idempotencyMap.set(trimmedKey, txRecord);
      }

      return {
        wallet: { ...wallet },
        transaction: { ...txRecord },
        isDuplicate: false,
      };
    };

    const nextPromise = this.mutationQueue.then(run, run);
    this.mutationQueue = nextPromise.then(() => {}, () => {});
    return nextPromise;
  }
}
