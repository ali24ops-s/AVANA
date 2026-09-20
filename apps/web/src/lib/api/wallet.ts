/**
 * Typed Wallet API Client for AVANA.
 */

export interface UserWalletResponse {
  request_id?: string;
  balance: number;
  currency: string;
  formatted_balance: string;
}

export type WalletTransactionType =
  | "credit"
  | "debit"
  | "refund"
  | "admin_adjustment";

export type WalletTransactionSource =
  | "subscription_bonus"
  | "wallet_topup"
  | "content_generation"
  | "generation_refund"
  | "special_exam_purchase"
  | "special_exam_refund"
  | "admin_adjustment";

export type WalletReferenceType =
  | "order"
  | "generation_job"
  | "user_subscription"
  | "admin_grant"
  | "document"
  | "system"
  | "special_exam";

export interface UserWalletTransactionDto {
  id: string;
  type: WalletTransactionType | string;
  amount: number;
  balance_before: number;
  balance_after: number;
  source: WalletTransactionSource | string;
  reference_type: WalletReferenceType | string;
  reference_id: string;
  created_at: string;
}

export interface UserWalletTransactionsResponse {
  request_id?: string;
  transactions: UserWalletTransactionDto[];
  total: number;
}

export interface UserWalletTopupDto {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  tracking_number: string | null;
  source_card_last4: string | null;
  payer_name: string | null;
  receipt_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface UserWalletTopupsResponse {
  request_id?: string;
  topups: UserWalletTopupDto[];
}

export interface WalletApi {
  getMyWallet(): Promise<UserWalletResponse>;
  getMyTransactions(params?: {
    limit?: number;
    offset?: number;
  }): Promise<UserWalletTransactionsResponse>;
  getMyTopups(): Promise<UserWalletTopupsResponse>;
}

export function createWalletApi(client: {
  get: <T>(path: string, opts?: { headers?: Record<string, string> }) => Promise<T>;
}): WalletApi {
  return {
    async getMyWallet(): Promise<UserWalletResponse> {
      return client.get<UserWalletResponse>("/v1/wallet/me");
    },
    async getMyTransactions(params?: {
      limit?: number;
      offset?: number;
    }): Promise<UserWalletTransactionsResponse> {
      const query = new URLSearchParams();
      if (params?.limit !== undefined) {
        query.set("limit", params.limit.toString());
      }
      if (params?.offset !== undefined) {
        query.set("offset", params.offset.toString());
      }
      const qs = query.toString();
      return client.get<UserWalletTransactionsResponse>(
        `/v1/wallet/transactions${qs ? `?${qs}` : ""}`,
      );
    },
    async getMyTopups(): Promise<UserWalletTopupsResponse> {
      return client.get<UserWalletTopupsResponse>("/v1/wallet/me/topups");
    },
  };
}
