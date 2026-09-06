/**
 * Admin store abstractions.
 *
 * Provides aggregated queries and platform-wide data access for the admin panel.
 */

export type DashboardStats = {
  totalUsers: number;
  newUsersToday: number;
  totalCourses: number;
  totalLessons: number;
  totalFlashcards: number;
  totalQuizzes: number;
  totalDocuments: number;
  generationSuccessRate: number; // percentage
  generationsToday: number;
};

export type AdminUserRecord = {
  id: string;
  email: string;
  name?: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt?: string;
};

export type AdminUsersList = {
  users: AdminUserRecord[];
  totalCount: number;
};

export type AdminGenerationJobRecord = {
  id: string;
  type: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  documentName?: string;
  userEmail?: string;
};

export type DataIntegrityReport = {
  lessonsWithoutModule: number;
  flashcardsWithoutLesson: number;
  quizzesWithoutLesson: number;
  documentsWithoutCourse: number;
  failedGenerations: number;
};

export interface AdminCourseRecord {
  id: string;
  name: string;
  subject: string | null;
  createdAt: string;
  counts: {
    modules: number;
    lessons: number;
    flashcards: number;
    quizzes: number;
  };
}

import type { DocumentGenerationProgressResource } from "@avana/domain";

export interface AdminDocumentRecord {
  id: string;
  organizationId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  courseName?: string;
  ownerEmail?: string;
  generationProgress?: DocumentGenerationProgressResource | null;
}

export interface AdminSystemHealth {
  database: "healthy" | "error" | string;
  redis: "healthy" | "unhealthy" | "disabled" | "not_configured" | "unknown" | string;
  ai: "healthy" | "warning" | "error" | "unhealthy" | "degraded" | "unknown" | string;
  lastCheck: string;
  services?: {
    database: { status: string; reason?: string | null; latencyMs?: number | null };
    redis: { status: string; reason?: string | null; latencyMs?: number | null };
    ai: { status: string; reason?: string | null; latencyMs?: number | null };
  };
}

export interface AdminStoreOptions {
  redisUrl?: string;
  gateway?: {
    checkHealth?: () => Promise<{
      status: string;
      latencyMs?: number | null;
      reason?: string | null;
      provider?: string;
    }>;
  };
}

export interface AdminLogRecord {
  id: string;
  timestamp: string;
  level: "INFO" | "WARNING" | "ERROR";
  service: string;
  message: string;
  requestId?: string;
  userId?: string;
}

export interface AdminAuditRecord {
  id: string;
  adminEmail: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

export interface AdminLessonRecord {
  id: string;
  title: string;
  courseName?: string;
  moduleTitle?: string;
  publicationStatus: string;
  createdAt: string;
}

export interface AdminFlashcardRecord {
  id: string;
  front: string;
  back: string;
  lessonTitle?: string;
  createdAt: string;
}

export interface AdminExamRecord {
  id: string;
  title: string;
  passingScore: number;
  questionCount: number;
  createdAt: string;
}

export interface AdminGenerationDetail extends AdminGenerationJobRecord {
  provider?: string;
  model?: string;
  startedAt?: string;
  durationMs?: number;
  retryCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  errorType?: string;
  httpStatus?: number;
  payload?: unknown;
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

export interface AdminAnalyticsPeriodStats {
  newUsers: number;
  courses: number;
  lessons: number;
  flashcards: number;
  quizzes: number;
  aiJobs: number;
  aiSuccess: number;
  aiFailed: number;
}

export interface AdminAnalytics {
  total: {
    totalUsers: number;
    totalCourses?: number;
    totalLessons: number;
    totalFlashcards?: number;
    totalQuizzes?: number;
  };
  today: AdminAnalyticsPeriodStats;
  last7Days: AdminAnalyticsPeriodStats;
  last30Days: AdminAnalyticsPeriodStats;
}

export interface AdminAiAnalyticsOverview {
  totalJobs: number;
  successful: number;
  failed: number;
  processing: number;
  successRate: number;
  averageDurationMs: number;
}

export interface AdminAiAnalyticsTokens {
  available: boolean;
  input: number;
  output: number;
  total: number;
}

export interface AdminAiAnalytics {
  overview: AdminAiAnalyticsOverview;
  byType: Record<string, { total: number; success: number }>;
  tokens: AdminAiAnalyticsTokens;
}

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
  resourceType: "subscription" | "course" | "content_pack" | "content";
  resourceId?: string | null;
  durationDays?: number;
}

export interface AdminStore {
  // Phase 1
  getDashboardStats(): Promise<DashboardStats>;
  listUsers(params: { page: number; pageSize: number; search?: string; role?: string; status?: string }): Promise<AdminUsersList>;
  listGenerationJobs(params: { page: number; pageSize: number; status?: string }): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }>;
  getDataIntegrityReport(): Promise<DataIntegrityReport>;

  // Phase 2
  listCourses(params: { page: number; pageSize: number; search?: string }): Promise<{ courses: AdminCourseRecord[]; totalCount: number }>;
  listDocuments(params: { page: number; pageSize: number; search?: string; status?: string }): Promise<{ documents: AdminDocumentRecord[]; totalCount: number }>;
  getDocument(id: string): Promise<AdminDocumentRecord | null>;
  getSystemHealth(): Promise<AdminSystemHealth>;
  listLogs(params: { page: number; pageSize: number; level?: string }): Promise<{ logs: AdminLogRecord[]; totalCount: number }>;
  listAuditLogs(params: { page: number; pageSize: number; search?: string; action?: string; entityType?: string; adminEmail?: string }): Promise<{ logs: AdminAuditRecord[]; totalCount: number }>;
  
  // Content Phase 2
  listLessons(params: { page: number; pageSize: number; search?: string }): Promise<{ lessons: AdminLessonRecord[]; totalCount: number }>;
  listFlashcards(params: { page: number; pageSize: number; search?: string }): Promise<{ flashcards: AdminFlashcardRecord[]; totalCount: number }>;
  listExams(params: { page: number; pageSize: number; search?: string }): Promise<{ exams: AdminExamRecord[]; totalCount: number }>;
  getCourseHierarchy(courseId: string): Promise<AdminCourseHierarchy | null>;
  getGenerationJob(id: string): Promise<AdminGenerationDetail | null>;

  // Phase 3 Analytics
  getAnalytics(): Promise<AdminAnalytics>;
  getAiAnalytics(): Promise<AdminAiAnalytics>;

  // Phase 4: Mutations
  updateUserRole(adminId: string, targetUserId: string, newRole: string): Promise<void>;
  updateCourseMetadata(adminId: string, courseId: string, payload: { name?: string; subject?: string }): Promise<void>;
  retryDocumentProcessing(adminId: string, documentId: string): Promise<void>;
  retryGenerationJob(adminId: string, jobId: string): Promise<void>;

  // Monetization & Commerce
  getCommerceStats(): Promise<AdminCommerceStats>;
  listCommerceOrders(params: { page: number; pageSize: number; search?: string; status?: string; from?: string; to?: string }): Promise<AdminOrdersList>;
  listCommercePayments(params: { page: number; pageSize: number; search?: string; gateway?: string; status?: string; from?: string; to?: string }): Promise<AdminPaymentsList>;
  listCommerceSubscriptions(params: { page: number; pageSize: number; search?: string; status?: string }): Promise<AdminSubscriptionsList>;
  listCommerceEntitlements(params: { page: number; pageSize: number; search?: string; resourceType?: string; sourceType?: string; status?: string }): Promise<AdminEntitlementsList>;
  listCommerceProducts(): Promise<AdminProductRecord[]>;
  updateCommerceProduct(adminId: string, productId: string, payload: { active?: boolean; price?: number }): Promise<AdminProductRecord>;
  grantCommerceEntitlement(adminId: string, input: AdminGrantInput): Promise<AdminEntitlementRecord>;
  cancelCommerceSubscription(
    adminId: string,
    subscriptionId: string,
    reason?: string,
  ): Promise<{ success: boolean; subscription: AdminSubscriptionRecord; message?: string }>;
  approveCommercePayment(
    adminId: string,
    paymentId: string,
  ): Promise<{ success: boolean; payment: AdminPaymentRecord; message?: string }>;
  rejectCommercePayment(
    adminId: string,
    paymentId: string,
    reason: string,
  ): Promise<{ success: boolean; payment: AdminPaymentRecord; message?: string }>;
  getUserCommerceProfile(userId: string): Promise<AdminUserCommerceProfile>;
}
