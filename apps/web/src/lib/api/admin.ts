/**
 * Admin API Client.
 */

export interface DashboardStats {
  totalUsers: number;
  newUsersToday: number;
  totalCourses: number;
  totalLessons: number;
  totalFlashcards: number;
  totalQuizzes: number;
  totalDocuments: number;
  generationSuccessRate: number;
  generationsToday: number;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name?: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt?: string;
}

export interface AdminUsersList {
  users: AdminUserRecord[];
  totalCount: number;
}

export interface CourseCounts {
  modules: number;
  lessons: number;
  flashcards: number;
  quizzes: number;
}

export interface AdminCourseRecord {
  id: string;
  name: string;
  subject: string | null;
  createdAt: string;
  counts: CourseCounts;
}

export interface AdminCoursesList {
  courses: AdminCourseRecord[];
  totalCount: number;
}

export interface AdminGenerationJobRecord {
  id: string;
  type: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  documentName?: string;
  userEmail?: string;
}

export interface AdminGenerationDetail extends AdminGenerationJobRecord {
  startedAt?: string;
  durationMs?: number;
  retryCount?: number;
  errorType?: string;
  httpStatus?: number;
  payload?: unknown;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  user?: { id: string; email: string };
  organization?: { id: string; name: string };
  document?: { id: string; originalName: string };
  course?: { id: string; name?: string };
}

export interface DataIntegrityReport {
  lessonsWithoutModule: number;
  flashcardsWithoutLesson: number;
  quizzesWithoutLesson: number;
  documentsWithoutCourse: number;
  failedGenerations: number;
}

export interface ServiceHealthDetail {
  status: "healthy" | "degraded" | "warning" | "error" | "unhealthy" | "disabled" | "not_configured" | "unknown";
  latencyMs?: number | null;
  reason?: string | null;
  provider?: string;
  model?: string;
}

export interface AdminSystemHealth {
  database: "healthy" | "error" | "unhealthy";
  redis: "healthy" | "error" | "unhealthy" | "disabled" | "not_configured" | "unknown";
  ai: "healthy" | "warning" | "degraded" | "error" | "unhealthy" | "disabled" | "not_configured" | "unknown";
  lastCheck: string;
  services?: {
    database: ServiceHealthDetail;
    redis: ServiceHealthDetail;
    ai: ServiceHealthDetail;
  };
}

export interface AdminAuditRecord {
  id: string;
  adminEmail: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

export interface AdminAuditList {
  logs: AdminAuditRecord[];
  totalCount: number;
}

export type ApiRequestOptions = {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  body?: unknown;
};

export interface AdminCommerceStats {
  totalRevenue: number;
  todayRevenue: number;
  currentMonthRevenue: number;
  successfulOrders: number;
  activeSubscriptions: number;
  lifetimePurchases: number;
  subscriptionRevenue: number;
  courseRevenue: number;
  contentPackRevenue: number;
  pendingOrders: number;
  failedPayments: number;
}

export interface AdminOrderRecord {
  id: string;
  orderNumber: string;
  userId: string;
  userName?: string;
  userEmail: string;
  productId: string;
  productTitle: string;
  productType: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus?: string;
  paymentGateway?: string;
  paymentTransactionId?: string;
}

export interface AdminOrdersList {
  orders: AdminOrderRecord[];
  totalCount: number;
}

export interface AdminPaymentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  userName?: string;
  userEmail: string;
  productTitle?: string;
  amount: number;
  currency: string;
  gateway: string;
  authority: string | null;
  transactionId: string | null;
  status: string;
  trackingNumber?: string | null;
  sourceCardLast4?: string | null;
  payerName?: string | null;
  receiptUrl?: string | null;
  initialValidationResult?: Record<string, unknown> | null;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewerEmail?: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminPaymentsList {
  payments: AdminPaymentRecord[];
  totalCount: number;
}

export interface AdminSubscriptionRecord {
  id: string;
  userId: string;
  userName?: string;
  userEmail: string;
  productId: string;
  productTitle: string;
  plan: string;
  status: "active" | "expired" | "cancelled" | string;
  startedAt: string;
  expiresAt: string;
  orderId: string | null;
  createdAt: string;
}

export interface AdminSubscriptionsList {
  subscriptions: AdminSubscriptionRecord[];
  totalCount: number;
}

export interface AdminEntitlementRecord {
  id: string;
  userId: string;
  userName?: string;
  userEmail: string;
  resourceType: "subscription" | "content_pack" | "course" | string;
  resourceId: string | null;
  resourceTitle?: string;
  sourceType: "purchase" | "admin_grant" | "promotion" | "gift" | string;
  orderId: string | null;
  startsAt: string;
  expiresAt: string | null;
  lifetime: boolean;
  active: boolean;
  createdAt: string;
}

export interface AdminEntitlementsList {
  entitlements: AdminEntitlementRecord[];
  totalCount: number;
}

export interface AdminProductRecord {
  id: string;
  code: string;
  type: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  targetType: string | null;
  targetId: string | null;
  durationDays: number | null;
  active: boolean;
  createdAt: string;
  targetTitle?: string;
}

export interface AdminUserCommerceProfile {
  user: { id: string; email: string; name?: string };
  activeSubscription: AdminSubscriptionRecord | null;
  subscriptionHistory: AdminSubscriptionRecord[];
  lifetimePurchases: AdminEntitlementRecord[];
  entitlements: AdminEntitlementRecord[];
  orders: AdminOrderRecord[];
  payments: AdminPaymentRecord[];
}

export interface AdminGrantInput {
  userId: string;
  resourceType: "subscription" | "course" | "content_pack";
  resourceId?: string | null;
  durationDays?: number;
}

export interface AdminUserDeviceRecord {
  id: string;
  deviceId: string;
  deviceType: "mobile" | "desktop";
  deviceName: string | null;
  userAgent: string | null;
  lastIp: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  registrationStatus: "active" | "revoked";
  revokedAt: string | null;
}

export interface AdminUserDevicesResponse {
  userId: string;
  email: string;
  name: string;
  subscriptionStatus: string;
  devices: AdminUserDeviceRecord[];
}

export interface AdminAuthAttemptRecord {
  id: string;
  userId: string | null;
  email: string;
  deviceType: "mobile" | "desktop";
  deviceId: string | null;
  userAgent: string | null;
  ip: string | null;
  result: string;
  details: string | null;
  createdAt: string;
}

export interface AdminUserAuthAttemptsResponse {
  userId: string;
  attempts: AdminAuthAttemptRecord[];
}

export interface AdminResetDevicesResponse {
  success: boolean;
  message: string;
  revokedDevicesCount: number;
}

export function createAdminApi(client: {
  get: <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
  post: <T>(path: string, data?: unknown, options?: ApiRequestOptions) => Promise<T>;
  patch: <T>(path: string, data?: unknown, options?: ApiRequestOptions) => Promise<T>;
  delete: <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
}) {
  return {
    async getDashboardStats(): Promise<DashboardStats> {
      return client.get<DashboardStats>("/v1/admin/dashboard");
    },

    async getSystemHealth(): Promise<AdminSystemHealth> {
      return client.get<AdminSystemHealth>("/v1/admin/system/health");
    },

    async listAuditLogs(page = 1, pageSize = 5): Promise<AdminAuditList> {
      return client.get<AdminAuditList>(`/v1/admin/system/audit?page=${page}&pageSize=${pageSize}`);
    },
    
    async listUsers(page = 1, pageSize = 20, search?: string, role?: string, status?: string): Promise<AdminUsersList> {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      const roleParam = role ? `&role=${encodeURIComponent(role)}` : "";
      const statusParam = status ? `&status=${encodeURIComponent(status)}` : "";
      return client.get<AdminUsersList>(`/v1/admin/users?page=${page}&pageSize=${pageSize}${searchParam}${roleParam}${statusParam}`);
    },

    async listCourses(page = 1, pageSize = 20, search?: string): Promise<AdminCoursesList> {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      return client.get<AdminCoursesList>(`/v1/admin/courses?page=${page}&pageSize=${pageSize}${searchParam}`);
    },

    async listGenerationJobs(page = 1, pageSize = 20, status?: string, search?: string): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
      const statusParam = status ? `&status=${encodeURIComponent(status)}` : "";
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      return client.get<{ jobs: AdminGenerationJobRecord[]; totalCount: number }>(`/v1/admin/generation?page=${page}&pageSize=${pageSize}${statusParam}${searchParam}`);
    },

    async getDataIntegrityReport(): Promise<DataIntegrityReport> {
      return client.get<DataIntegrityReport>("/v1/admin/system/integrity");
    },
    
    // Phase 4 Mutations
    async updateUserRole(userId: string, role: string): Promise<{ success: boolean }> {
      return client.patch<{ success: boolean }>(`/v1/admin/users/${userId}/role`, { role });
    },
    async getUserDevices(userId: string): Promise<AdminUserDevicesResponse> {
      return client.get<AdminUserDevicesResponse>(`/v1/admin/users/${userId}/devices`);
    },
    async getUserAuthAttempts(userId: string): Promise<AdminUserAuthAttemptsResponse> {
      return client.get<AdminUserAuthAttemptsResponse>(`/v1/admin/users/${userId}/auth-attempts`);
    },
    async resetUserDevices(userId: string): Promise<AdminResetDevicesResponse> {
      return client.post<AdminResetDevicesResponse>(`/v1/admin/users/${userId}/reset-devices`, {});
    },
    async updateCourseMetadata(courseId: string, payload: { name?: string; subject?: string }): Promise<{ success: boolean }> {
      return client.patch<{ success: boolean }>(`/v1/admin/courses/${courseId}`, payload);
    },
    async retryDocument(documentId: string): Promise<{ success: boolean }> {
      return client.post<{ success: boolean }>(`/v1/admin/documents/${documentId}/retry`);
    },
    async retryGenerationJob(jobId: string): Promise<{ success: boolean }> {
      return client.post<{ success: boolean }>(`/v1/admin/generation/${jobId}/retry`);
    },
    async deleteDocument(documentId: string): Promise<void> {
      return client.delete(`/v1/admin/documents/${documentId}`);
    },
    getDownloadUrl(documentId: string): string {
      return `${getApiBaseUrl()}/v1/admin/documents/${documentId}/download`;
    },
    async getPrompts(): Promise<{ prompts: AdminPromptRecord[] }> {
      return client.get<{ prompts: AdminPromptRecord[] }>("/v1/admin/prompts");
    },

    // -------------------------------------------------------------------------
    // Monetization & Commerce
    // -------------------------------------------------------------------------
    async getCommerceStats(): Promise<AdminCommerceStats> {
      return client.get<AdminCommerceStats>("/v1/admin/commerce/stats");
    },

    async listCommerceOrders(params: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      from?: string;
      to?: string;
    } = {}): Promise<AdminOrdersList> {
      const page = params.page || 1;
      const pageSize = params.pageSize || 20;
      let queryStr = `page=${page}&pageSize=${pageSize}`;
      if (params.search) queryStr += `&search=${encodeURIComponent(params.search)}`;
      if (params.status && params.status !== "all") queryStr += `&status=${encodeURIComponent(params.status)}`;
      if (params.from) queryStr += `&from=${encodeURIComponent(params.from)}`;
      if (params.to) queryStr += `&to=${encodeURIComponent(params.to)}`;
      return client.get<AdminOrdersList>(`/v1/admin/commerce/orders?${queryStr}`);
    },

    async listCommercePayments(params: {
      page?: number;
      pageSize?: number;
      search?: string;
      gateway?: string;
      status?: string;
      from?: string;
      to?: string;
    } = {}): Promise<AdminPaymentsList> {
      const page = params.page || 1;
      const pageSize = params.pageSize || 20;
      let queryStr = `page=${page}&pageSize=${pageSize}`;
      if (params.search) queryStr += `&search=${encodeURIComponent(params.search)}`;
      if (params.gateway && params.gateway !== "all") queryStr += `&gateway=${encodeURIComponent(params.gateway)}`;
      if (params.status && params.status !== "all") queryStr += `&status=${encodeURIComponent(params.status)}`;
      if (params.from) queryStr += `&from=${encodeURIComponent(params.from)}`;
      if (params.to) queryStr += `&to=${encodeURIComponent(params.to)}`;
      return client.get<AdminPaymentsList>(`/v1/admin/commerce/payments?${queryStr}`);
    },

    async listCommerceSubscriptions(params: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
    } = {}): Promise<AdminSubscriptionsList> {
      const page = params.page || 1;
      const pageSize = params.pageSize || 20;
      let queryStr = `page=${page}&pageSize=${pageSize}`;
      if (params.search) queryStr += `&search=${encodeURIComponent(params.search)}`;
      if (params.status && params.status !== "all") queryStr += `&status=${encodeURIComponent(params.status)}`;
      return client.get<AdminSubscriptionsList>(`/v1/admin/commerce/subscriptions?${queryStr}`);
    },

    async listCommerceEntitlements(params: {
      page?: number;
      pageSize?: number;
      search?: string;
      resourceType?: string;
      sourceType?: string;
      status?: string;
    } = {}): Promise<AdminEntitlementsList> {
      const page = params.page || 1;
      const pageSize = params.pageSize || 20;
      let queryStr = `page=${page}&pageSize=${pageSize}`;
      if (params.search) queryStr += `&search=${encodeURIComponent(params.search)}`;
      if (params.resourceType && params.resourceType !== "all") queryStr += `&resourceType=${encodeURIComponent(params.resourceType)}`;
      if (params.sourceType && params.sourceType !== "all") queryStr += `&sourceType=${encodeURIComponent(params.sourceType)}`;
      if (params.status && params.status !== "all") queryStr += `&status=${encodeURIComponent(params.status)}`;
      return client.get<AdminEntitlementsList>(`/v1/admin/commerce/entitlements?${queryStr}`);
    },

    async listCommerceProducts(): Promise<{ products: AdminProductRecord[] }> {
      return client.get<{ products: AdminProductRecord[] }>("/v1/admin/commerce/products");
    },

    async createSpecialExamProduct(payload: {
      code?: string;
      title: string;
      description?: string;
      questionCount: number;
      difficulty?: string;
      scope?: any;
      blueprint?: any[];
      active?: boolean;
      publicationStatus?: "draft" | "published" | "archived";
    }): Promise<{ success: boolean; product: AdminProductRecord }> {
      return client.post<{ success: boolean; product: AdminProductRecord }>(
        "/v1/admin/commerce/special-exams",
        payload,
      );
    },

    async validateSpecialExamPool(payload: {
      questionCount: number;
      difficulty?: string;
      scope?: any;
      blueprint?: any[];
    }): Promise<{
      success: boolean;
      isValid: boolean;
      totalRequired: number;
      totalAvailable: number;
      items: Array<{ name: string; required: number; available: number; isSufficient: boolean }>;
      errors: string[];
    }> {
      return client.post<{
        success: boolean;
        isValid: boolean;
        totalRequired: number;
        totalAvailable: number;
        items: Array<{ name: string; required: number; available: number; isSufficient: boolean }>;
        errors: string[];
      }>("/v1/admin/commerce/special-exams/validate-pool", payload);
    },

    async listSpecialExams(): Promise<{ products: any[] }> {
      return client.get<{ products: any[] }>("/v1/admin/commerce/special-exams");
    },

    async updateCommerceProduct(
      productId: string,
      payload: { active?: boolean; price?: number }
    ): Promise<{ success: boolean; product: AdminProductRecord }> {
      return client.patch<{ success: boolean; product: AdminProductRecord }>(
        `/v1/admin/commerce/products/${productId}`,
        payload
      );
    },

    async grantCommerceEntitlement(
      input: AdminGrantInput
    ): Promise<{ success: boolean; entitlement: AdminEntitlementRecord }> {
      return client.post<{ success: boolean; entitlement: AdminEntitlementRecord }>(
        "/v1/admin/commerce/grants",
        input
      );
    },

    async cancelCommerceSubscription(
      subscriptionId: string,
      reason?: string
    ): Promise<{ success: boolean; subscription: AdminSubscriptionRecord; message?: string }> {
      return client.post<{ success: boolean; subscription: AdminSubscriptionRecord; message?: string }>(
        `/v1/admin/commerce/subscriptions/${subscriptionId}/cancel`,
        { reason }
      );
    },

    async approveCommercePayment(
      paymentId: string,
    ): Promise<{ success: boolean; payment: AdminPaymentRecord; message?: string }> {
      return client.post<{ success: boolean; payment: AdminPaymentRecord; message?: string }>(
        `/v1/admin/commerce/payments/${paymentId}/approve`,
      );
    },

    async rejectCommercePayment(
      paymentId: string,
      reason: string,
    ): Promise<{ success: boolean; payment: AdminPaymentRecord; message?: string }> {
      return client.post<{ success: boolean; payment: AdminPaymentRecord; message?: string }>(
        `/v1/admin/commerce/payments/${paymentId}/reject`,
        { reason },
      );
    },

    async getUserCommerceProfile(userId: string): Promise<AdminUserCommerceProfile> {
      return client.get<AdminUserCommerceProfile>(`/v1/admin/users/${userId}/commerce`);
    },

    // -------------------------------------------------------------------------
    // Official Content Studio
    // -------------------------------------------------------------------------
    async listOfficialCourses(): Promise<{ courses: OfficialCourse[] }> {
      return client.get<{ courses: OfficialCourse[] }>("/v1/admin/content-studio/courses");
    },

    async createOfficialCourse(data: {
      name: string;
      subject?: string;
      description?: string;
      examDate?: string;
    }): Promise<{ success: boolean; course: OfficialCourse }> {
      return client.post<{ success: boolean; course: OfficialCourse }>(
        "/v1/admin/content-studio/courses",
        data,
      );
    },

    async triggerOfficialGeneration(
      courseId: string,
      data: {
        documentId: string;
        lesson?: boolean;
        flashcards?: boolean;
        exam?: boolean;
        review_summary?: boolean;
      },
    ): Promise<{ generationRunId: string; status: string }> {
      return client.post<{ generationRunId: string; status: string }>(
        `/v1/admin/content-studio/courses/${courseId}/generate`,
        data,
      );
    },

    async getOfficialReviewWorkspace(
      courseId: string,
    ): Promise<OfficialReviewWorkspace> {
      return client.get<OfficialReviewWorkspace>(
        `/v1/admin/content-studio/courses/${courseId}/review`,
      );
    },

    async approveOfficialCourse(courseId: string): Promise<{
      approved: boolean;
      materialized: {
        modules: number;
        lessons: number;
        flashcards: number;
        quizzes: number;
        questions: number;
      };
    }> {
      return client.post(
        `/v1/admin/content-studio/courses/${courseId}/approve`,
      );
    },

    async setOfficialCoursePricing(
      courseId: string,
      data: { price: number; title?: string; description?: string },
    ): Promise<{ success: boolean; product: OfficialCourseProduct }> {
      return client.post(
        `/v1/admin/content-studio/courses/${courseId}/pricing`,
        data,
      );
    },

    async setLessonPricing(
      lessonId: string,
      data: { price: number; title?: string; description?: string; active?: boolean },
    ): Promise<{ success: boolean; product: any }> {
      return client.post(
        `/v1/admin/content-studio/lessons/${lessonId}/pricing`,
        data,
      );
    },

    async validateOfficialCourseConsistency(
      courseId: string,
    ): Promise<ConsistencyValidationReport> {
      return client.get<ConsistencyValidationReport>(
        `/v1/admin/content-studio/courses/${courseId}/validate`,
      );
    },

    async publishOfficialCourse(
      courseId: string,
    ): Promise<{ success: boolean; courseStatus: string; productActive: boolean }> {
      return client.post(
        `/v1/admin/content-studio/courses/${courseId}/publish`,
      );
    },

    async archiveOfficialCourse(
      courseId: string,
    ): Promise<{ success: boolean; courseStatus: string }> {
      return client.post(
        `/v1/admin/content-studio/courses/${courseId}/archive`,
      );
    },

    async deleteOfficialCourse(
      courseId: string,
      options: DeleteOfficialCourseOptions,
    ): Promise<DeleteOfficialCourseResult> {
      return client.delete<DeleteOfficialCourseResult>(
        `/v1/admin/content-studio/courses/${courseId}`,
        { body: options },
      );
    },

    async getCourseHierarchy(
      courseId: string,
    ): Promise<AdminCourseHierarchy> {
      return client.get<AdminCourseHierarchy>(
        `/v1/admin/content/courses/${courseId}/hierarchy`,
      );
    },
  };
}

export interface DeleteOfficialCourseOptions {
  confirmationName: string;
  deleteSourceDocuments?: boolean;
}

export interface DeleteOfficialCourseResult {
  success: boolean;
  deletedCourseId: string;
  courseName: string;
  deletedDocumentsCount: number;
  deletedProduct: boolean;
}

export interface OfficialCourseProduct {
  id: string;
  code: string;
  price: number;
  currency: string;
  active: boolean;
}

export interface OfficialCourse {
  id: string;
  organizationId?: string;
  name: string;
  description: string | null;
  subject: string | null;
  status: "draft" | "generating" | "review" | "approved" | "published" | "archived";
  isOfficial: boolean;
  moduleCount: number;
  lessonCount: number;
  flashcardCount: number;
  quizQuestionCount: number;
  product: OfficialCourseProduct | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfficialReviewDraft {
  id: string;
  documentId: string;
  contentType: "lesson" | "flashcard" | "quiz" | "review_summary" | string;
  status: string;
  itemCount: number;
  hasMappingErrors: boolean;
  unresolvedItems: number;
  payload?: unknown;
  createdAt?: string;
}

export interface OfficialReviewWorkspace {
  course: OfficialCourse;
  draftContents: OfficialReviewDraft[];
  unresolvedLessonMappings: number;
  readyForApproval: boolean;
}

export interface ConsistencyValidationReport {
  valid: boolean;
  courseStatus: string;
  moduleCount: number;
  lessonCount: number;
  flashcardCount: number;
  quizCount: number;
  quizQuestionCount: number;
  unresolvedLessonMappings: number;
  productLinked: boolean;
  productPrice: number;
  productActive: boolean;
  errors: string[];
}

export interface AdminCourseHierarchyLesson {
  id: string;
  title: string;
  publicationStatus: string;
  flashcardCount: number;
  quizCount: number;
  hasContent: boolean;
  createdAt: string;
}

export interface AdminCourseHierarchyModule {
  id: string;
  title: string;
  lessons: AdminCourseHierarchyLesson[];
}

export interface AdminCourseHierarchy {
  id: string;
  name: string;
  subject: string | null;
  modules: AdminCourseHierarchyModule[];
}

export interface AdminPromptRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  variables: string[];
  sourceFile: string;
  sourceLocation: string;
  status: "active" | "inactive";
}

import { createApiClient, getApiBaseUrl } from "./client.js";
const rawClient = createApiClient({ baseUrl: getApiBaseUrl() });

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) => rawClient.get<T>(`/v1${path}`, options),
  post: <T>(path: string, data?: unknown, options?: ApiRequestOptions) => rawClient.post<T>(`/v1${path}`, data, options),
  patch: <T>(path: string, data?: unknown, options?: ApiRequestOptions) => rawClient.patch<T>(`/v1${path}`, data, options),
  delete: <T>(path: string, options?: ApiRequestOptions) => rawClient.delete<T>(`/v1${path}`, options),
};

// ---------------------------------------------------------------------------
// Content Export & Import API Contracts
// ---------------------------------------------------------------------------

export interface AdminExportScope {
  courses?: boolean;
  modules?: boolean;
  lessons?: boolean;
  documents?: boolean;
  generatedContent?: boolean;
  flashcards?: boolean;
  quizzes?: boolean;
  questions?: boolean;
  files?: boolean;
}

export interface AdminExportOptions {
  courseId?: string;
  moduleIds?: string[];
  lessonIds?: string[];
  scope?: AdminExportScope;
}

export interface AdminImportCountBreakdown {
  new: number;
  existing: number;
  updated: number;
  conflict: number;
}

export interface AdminImportPreviewSummary {
  courses: AdminImportCountBreakdown;
  modules: AdminImportCountBreakdown;
  lessons: AdminImportCountBreakdown;
  documents: AdminImportCountBreakdown;
  generatedContents: AdminImportCountBreakdown;
  flashcards: AdminImportCountBreakdown;
  quizzes: AdminImportCountBreakdown;
  questions: AdminImportCountBreakdown;
  files: { new: number; existing: number };
  totalConflicts: number;
}

export interface AdminImportConflict {
  entityType: string;
  exportId: string;
  titleOrName: string;
  reason: string;
}

export interface AdminImportPlan {
  planId: string;
  packageChecksum: string;
  actorId: string;
  organizationId: string;
  formatVersion: number;
  source: string;
  exportedAt: string;
  summary: AdminImportPreviewSummary;
  conflicts: AdminImportConflict[];
  expiresAt: number;
}

export interface AdminImportExecutionResult {
  batchId: string;
  success: boolean;
  counts: {
    created: number;
    skipped: number;
    conflicts: number;
  };
  summary: AdminImportPreviewSummary;
  durationMs: number;
}

export async function downloadContentExport(options: AdminExportOptions): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/v1/admin/content/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err?.message || "خطا در دریافت فایل خروجی");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `avana-content-export-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function validateContentImport(file: File): Promise<AdminImportPlan> {
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${baseUrl}/v1/admin/content/import/validate`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.message || "اعتبارسنجی بسته با خطا مواجه شد.");
  }

  const data = await res.json();
  return data.plan;
}

export async function executeContentImport(
  planId: string,
  packageChecksum?: string,
  onConflict: "skip" | "error" = "skip",
): Promise<AdminImportExecutionResult> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/v1/admin/content/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ planId, packageChecksum, onConflict }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.message || "اجرای ورود اطلاعات با خطا مواجه شد.");
  }

  return res.json();
}

