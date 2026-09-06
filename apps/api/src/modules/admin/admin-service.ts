/**
 * Admin Service.
 *
 * Handles admin-specific business logic, relying on the AdminStore.
 */

import type {
  AdminStore,
  DashboardStats,
  AdminUsersList,
  AdminGenerationJobRecord,
  DataIntegrityReport,
  AdminCommerceStats,
  AdminOrdersList,
  AdminPaymentsList,
  AdminSubscriptionsList,
  AdminEntitlementsList,
  AdminProductRecord,
  AdminUserCommerceProfile,
  AdminGrantInput,
} from "./admin-store.js";
import { DomainError } from "@avana/domain";

export class AdminService {
  constructor(private readonly store: AdminStore) {}

  async getDashboardStats(): Promise<DashboardStats> {
    return this.store.getDashboardStats();
  }

  async listUsers(page: number, pageSize: number, search?: string, role?: string, status?: string): Promise<AdminUsersList> {
    if (page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (pageSize < 1 || pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    
    return this.store.listUsers({ page, pageSize, search, role, status });
  }

  async listGenerationJobs(page: number, pageSize: number, status?: string): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
    if (page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (pageSize < 1 || pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    
    return this.store.listGenerationJobs({ page, pageSize, status });
  }

  async getDataIntegrityReport(): Promise<DataIntegrityReport> {
    return this.store.getDataIntegrityReport();
  }

  // ---------------------------------------------------------------------------
  // Monetization & Commerce
  // ---------------------------------------------------------------------------

  async getCommerceStats(): Promise<AdminCommerceStats> {
    return this.store.getCommerceStats();
  }

  async listCommerceOrders(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<AdminOrdersList> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommerceOrders(params);
  }

  async listCommercePayments(params: {
    page: number;
    pageSize: number;
    search?: string;
    gateway?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<AdminPaymentsList> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommercePayments(params);
  }

  async listCommerceSubscriptions(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  }): Promise<AdminSubscriptionsList> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommerceSubscriptions(params);
  }

  async listCommerceEntitlements(params: {
    page: number;
    pageSize: number;
    search?: string;
    resourceType?: string;
    sourceType?: string;
    status?: string;
  }): Promise<AdminEntitlementsList> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommerceEntitlements(params);
  }

  async listCommerceProducts(): Promise<AdminProductRecord[]> {
    return this.store.listCommerceProducts();
  }

  async updateCommerceProduct(
    adminId: string,
    productId: string,
    payload: { active?: boolean; price?: number },
  ): Promise<AdminProductRecord> {
    if (!productId) throw new DomainError("bad_request", "Product ID is required");
    if (
      payload.price !== undefined &&
      (typeof payload.price !== "number" || isNaN(payload.price) || !Number.isInteger(payload.price) || payload.price < 0)
    ) {
      throw new DomainError("bad_request", "Price must be a non-negative integer");
    }
    return this.store.updateCommerceProduct(adminId, productId, payload);
  }

  async grantCommerceEntitlement(
    adminId: string,
    input: AdminGrantInput,
  ): Promise<any> {
    if (!input.userId) throw new DomainError("bad_request", "User ID is required");
    if (!["subscription", "course", "content_pack"].includes(input.resourceType)) {
      throw new DomainError("bad_request", "Invalid resource type");
    }
    if ((input.resourceType === "course" || input.resourceType === "content_pack") && !input.resourceId) {
      throw new DomainError("bad_request", "Resource ID is required for course or content_pack grants");
    }
    if (input.durationDays !== undefined && (input.durationDays < 1 || input.durationDays > 3650)) {
      throw new DomainError("bad_request", "durationDays must be between 1 and 3650");
    }
    return this.store.grantCommerceEntitlement(adminId, input);
  }

  async cancelUserSubscription(
    adminId: string,
    subscriptionId: string,
    reason?: string,
  ): Promise<{ success: boolean; subscription: any; message?: string }> {
    if (!subscriptionId) {
      throw new DomainError("bad_request", "شناسه اشتراک الزامی است.");
    }
    return this.store.cancelCommerceSubscription(adminId, subscriptionId, reason);
  }

  async approvePayment(
    adminId: string,
    paymentId: string,
  ): Promise<{ success: boolean; payment: any; message?: string }> {
    if (!paymentId) {
      throw new DomainError("bad_request", "شناسه پرداخت الزامی است.");
    }
    try {
      return await this.store.approveCommercePayment(adminId, paymentId);
    } catch (err: any) {
      if (err.message === "not_found") {
        throw new DomainError("not_found", "تراکنش پرداخت یافت نشد.");
      }
      if (err.message === "payment_already_rejected") {
        throw new DomainError(
          "conflict",
          "این پرداخت قبلاً رد شده و امکان تأیید آن وجود ندارد.",
        );
      }
      if (err.message === "invalid_payment_status") {
        throw new DomainError(
          "bad_request",
          "این پرداخت در وضعیت انتظار برای بررسی قرار ندارد.",
        );
      }
      throw err;
    }
  }

  async rejectPayment(
    adminId: string,
    paymentId: string,
    reason: string,
  ): Promise<{ success: boolean; payment: any; message?: string }> {
    if (!paymentId) {
      throw new DomainError("bad_request", "شناسه پرداخت الزامی است.");
    }
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new DomainError("bad_request", "علت رد پرداخت (reason) الزامی است.");
    }
    try {
      return await this.store.rejectCommercePayment(
        adminId,
        paymentId,
        trimmedReason,
      );
    } catch (err: any) {
      if (err.message === "not_found") {
        throw new DomainError("not_found", "تراکنش پرداخت یافت نشد.");
      }
      if (err.message === "payment_already_approved") {
        throw new DomainError(
          "conflict",
          "این پرداخت قبلاً تأیید شده و امکان رد آن وجود ندارد.",
        );
      }
      if (err.message === "rejection_reason_required") {
        throw new DomainError("bad_request", "علت رد پرداخت الزامی است.");
      }
      if (err.message === "invalid_payment_status") {
        throw new DomainError(
          "bad_request",
          "این پرداخت در وضعیت انتظار برای بررسی قرار ندارد.",
        );
      }
      throw err;
    }
  }

  async getUserCommerceProfile(userId: string): Promise<AdminUserCommerceProfile> {
    if (!userId) throw new DomainError("bad_request", "User ID is required");
    return this.store.getUserCommerceProfile(userId);
  }
}
