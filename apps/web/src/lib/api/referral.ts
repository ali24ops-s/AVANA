/**
 * Typed Referral API Client for AVANA.
 */

export interface ReferralSummaryResponse {
  request_id?: string;
  code?: string;
  referralCode?: string;
  invite_url?: string;
  inviteUrl?: string;
  total_invites?: number;
  totalInvites?: number;
  pending_invites?: number;
  pendingCount?: number;
  successful_invites?: number;
  rewardedCount?: number;
  rewarded_days?: number;
  rewardedDays?: number;
  total_earned?: number;
  totalRewardAmount?: number;
  max_referrals?: number;
  maxReferrals?: number;
  max_reward_days?: number;
  maxRewardDays?: number;
  is_limit_reached?: boolean;
  isLimitReached?: boolean;
}

export interface ReferralItemDto {
  id: string;
  invitee_display_name?: string;
  status: "pending" | "qualified" | "rewarded" | "cancelled";
  reward_type?: string;
  rewardType?: string;
  reward_status?: "pending" | "granted" | "completed" | "failed" | "limit_reached" | "abuse_rejected";
  rewardStatus?: "pending" | "granted" | "completed" | "failed" | "limit_reached" | "abuse_rejected";
  reward_amount?: number;
  rewardAmount?: number;
  created_at?: string;
  createdAt?: string;
  qualified_at?: string | null;
  qualifiedAt?: string | null;
  rewarded_at?: string | null;
  rewardedAt?: string | null;
}

export interface ReferralHistoryResponse {
  request_id?: string;
  referrals: ReferralItemDto[];
  total: number;
}

export interface ValidateReferralCodeResponse {
  valid: boolean;
  code: string;
}

export interface AdminReferralItemDto {
  id: string;
  referralCode?: string;
  code?: string;
  inviterUserId?: string;
  inviter_user_id?: string;
  invitedUserId?: string;
  inviteeUserId?: string;
  invitee_user_id?: string;
  status: "pending" | "qualified" | "rewarded" | "cancelled";
  reward_type?: string;
  rewardType?: string;
  reward_status?: "pending" | "granted" | "completed" | "failed" | "limit_reached" | "abuse_rejected";
  rewardStatus?: "pending" | "granted" | "completed" | "failed" | "limit_reached" | "abuse_rejected";
  reward_amount?: number;
  rewardAmount?: number;
  qualifyingOrderId?: string | null;
  qualifying_order_id?: string | null;
  createdAt?: string;
  created_at?: string;
  qualifiedAt?: string | null;
  qualified_at?: string | null;
  rewardedAt?: string | null;
  rewarded_at?: string | null;
  inviterName?: string | null;
  inviter_name?: string | null;
  inviterEmail?: string | null;
  inviter_email?: string | null;
  inviterPhone?: string | null;
  inviteeName?: string | null;
  invitee_name?: string | null;
  invitedName?: string | null;
  inviteeEmail?: string | null;
  invitee_email?: string | null;
  invitedEmail?: string | null;
  invitedPhone?: string | null;
}

export interface AdminReferralsResponse {
  request_id?: string;
  referrals: AdminReferralItemDto[];
  total: number;
}

export interface RetryRewardsResponse {
  request_id?: string;
  processed: number;
  succeeded: number;
  failed: number;
}

export interface ReferralConfigDto {
  enabled: boolean;
  reward_type?: string;
  rewardType?: string;
  reward_days?: number;
  rewardDays?: number;
  reward_amount?: number;
  rewardAmount?: number;
  max_referrals?: number;
  maxRewardedReferrals?: number;
  max_reward_days?: number;
  maxRewardDays?: number;
}

export interface ReferralConfigResponse {
  request_id?: string;
  config: ReferralConfigDto;
}

export interface ReferralApi {
  getMySummary(): Promise<ReferralSummaryResponse>;
  getMyHistory(params?: {
    limit?: number;
    offset?: number;
  }): Promise<ReferralHistoryResponse>;
  validateCode(code: string): Promise<ValidateReferralCodeResponse>;
  getAdminReferrals(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminReferralsResponse>;
  retryRewards(): Promise<RetryRewardsResponse>;
  getConfig(): Promise<ReferralConfigResponse>;
  updateConfig(data: {
    enabled?: boolean;
    rewardDays?: number;
    rewardAmount?: number;
    maxRewardedReferrals?: number;
  }): Promise<ReferralConfigResponse>;
}

export function createReferralApi(client: {
  get: <T>(path: string, opts?: { headers?: Record<string, string> }) => Promise<T>;
  post: <T>(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) => Promise<T>;
  put: <T>(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) => Promise<T>;
}): ReferralApi {
  return {
    async getMySummary(): Promise<ReferralSummaryResponse> {
      return client.get<ReferralSummaryResponse>("/v1/referrals/my-code");
    },
    async getMyHistory(params?: {
      limit?: number;
      offset?: number;
    }): Promise<ReferralHistoryResponse> {
      const query = new URLSearchParams();
      if (params?.limit !== undefined) {
        query.set("limit", params.limit.toString());
      }
      if (params?.offset !== undefined) {
        query.set("offset", params.offset.toString());
      }
      const qs = query.toString();
      return client.get<ReferralHistoryResponse>(
        `/v1/referrals/history${qs ? `?${qs}` : ""}`,
      );
    },
    async validateCode(code: string): Promise<ValidateReferralCodeResponse> {
      return client.get<ValidateReferralCodeResponse>(
        `/v1/referrals/validate/${encodeURIComponent(code)}`,
      );
    },
    async getAdminReferrals(params?: {
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<AdminReferralsResponse> {
      const query = new URLSearchParams();
      if (params?.status) {
        query.set("status", params.status);
      }
      if (params?.limit !== undefined) {
        query.set("limit", params.limit.toString());
      }
      if (params?.offset !== undefined) {
        query.set("offset", params.offset.toString());
      }
      const qs = query.toString();
      return client.get<AdminReferralsResponse>(
        `/admin/commerce/referrals${qs ? `?${qs}` : ""}`,
      );
    },
    async retryRewards(): Promise<RetryRewardsResponse> {
      return client.post<RetryRewardsResponse>(
        "/admin/commerce/referrals/retry-rewards",
      );
    },
    async getConfig(): Promise<ReferralConfigResponse> {
      return client.get<ReferralConfigResponse>(
        "/admin/commerce/referrals/config",
      );
    },
    async updateConfig(data: {
      enabled?: boolean;
      rewardDays?: number;
      rewardAmount?: number;
      maxRewardedReferrals?: number;
    }): Promise<ReferralConfigResponse> {
      return client.put<ReferralConfigResponse>(
        "/admin/commerce/referrals/config",
        data,
      );
    },
  };
}
