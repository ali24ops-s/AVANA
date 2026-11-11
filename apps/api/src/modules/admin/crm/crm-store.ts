import {
  count,
  eq,
  ne,
  sql,
  gte,
  lte,
  ilike,
  or,
  desc,
  asc,
  isNull,
  isNotNull,
  and,
  inArray,
  notInArray,
  gt,
  lt,
  type SQL,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DbClient } from "@avana/database/client";
import {
  users,
  payments,
  orders,
  wallets,
  walletTransactions,
  userSubscriptions,
  products,
  courseMemberships,
  documents,
  generatedContents,
  quizAttempts,
  studySessions,
  sessions,
  userDevices,
  crmTags,
  crmCustomerTags,
  crmCustomerNotes,
  crmSegments,
  crmCampaigns,
  crmCampaignExecutions,
  crmCampaignRecipients,
} from "@avana/database/schema";
import type {
  CrmTagItem,
  CreateCrmTagInput,
  UpdateCrmTagInput,
  CrmCustomerNoteItem,
  CreateCrmCustomerNoteInput,
  UpdateCrmCustomerNoteInput,
  CrmCustomerListItem,
  ListCrmCustomersParams,
  ListCrmCustomersResponse,
  CrmCustomer360Profile,
  CrmSegmentItem,
  CreateCrmSegmentInput,
  UpdateCrmSegmentInput,
  ListCrmSegmentsParams,
  ListCrmSegmentsResponse,
  GetSegmentMembersParams,
  SegmentFilterRule,
  SegmentMatchOperator,
  CrmCampaignItem,
  CreateCrmCampaignInput,
  UpdateCrmCampaignInput,
  ListCrmCampaignsParams,
  ListCrmCampaignsResponse,
  CrmCampaignExecutionItem,
  CrmCampaignRecipientItem,
  ListCrmCampaignRecipientsParams,
  ListCrmCampaignRecipientsResponse,
  CampaignStatus,
  CampaignChannel,
  CampaignExecutionStatus,
  CampaignRecipientStatus,
} from "@avana/domain";
import { Roles } from "@avana/domain";

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------

export interface CrmStore {
  // Customers
  listCustomers(params: ListCrmCustomersParams): Promise<ListCrmCustomersResponse>;
  getCustomer360(userId: string): Promise<CrmCustomer360Profile | null>;

  // Tags
  listTags(): Promise<CrmTagItem[]>;
  findTagByName(name: string): Promise<CrmTagItem | null>;
  findTagById(id: string): Promise<CrmTagItem | null>;
  createTag(input: CreateCrmTagInput): Promise<CrmTagItem>;
  updateTag(id: string, input: UpdateCrmTagInput): Promise<CrmTagItem | null>;
  deleteTag(id: string): Promise<boolean>;
  assignTag(userId: string, tagId: string, assignedBy?: string): Promise<boolean>;
  removeTag(userId: string, tagId: string): Promise<boolean>;
  getCustomerTags(userId: string): Promise<CrmTagItem[]>;

  // Notes
  listCustomerNotes(userId: string): Promise<CrmCustomerNoteItem[]>;
  findNoteById(noteId: string): Promise<CrmCustomerNoteItem | null>;
  createCustomerNote(
    userId: string,
    authorId: string,
    input: CreateCrmCustomerNoteInput,
  ): Promise<CrmCustomerNoteItem>;
  updateCustomerNote(
    noteId: string,
    input: UpdateCrmCustomerNoteInput,
  ): Promise<CrmCustomerNoteItem | null>;
  deleteCustomerNote(noteId: string): Promise<boolean>;

  // Segments (Phase 2)
  listSegments(params?: ListCrmSegmentsParams): Promise<ListCrmSegmentsResponse>;
  findSegmentById(id: string): Promise<CrmSegmentItem | null>;
  createSegment(input: CreateCrmSegmentInput, createdById: string): Promise<CrmSegmentItem>;
  updateSegment(id: string, input: UpdateCrmSegmentInput): Promise<CrmSegmentItem | null>;
  deleteSegment(id: string): Promise<boolean>;
  previewSegmentCount(rules: SegmentFilterRule[], matchOperator: SegmentMatchOperator): Promise<number>;
  getSegmentMembers(params: GetSegmentMembersParams): Promise<ListCrmCustomersResponse>;
  getMatchingSegmentUserIds(segmentId: string): Promise<string[]>;

  // Campaigns (Phase 3)
  listCampaigns(params?: ListCrmCampaignsParams): Promise<ListCrmCampaignsResponse>;
  findCampaignById(id: string): Promise<CrmCampaignItem | null>;
  createCampaign(input: CreateCrmCampaignInput, createdById: string): Promise<CrmCampaignItem>;
  updateCampaign(id: string, input: UpdateCrmCampaignInput): Promise<CrmCampaignItem | null>;
  deleteCampaign(id: string): Promise<boolean>;
  createCampaignExecution(
    campaignId: string,
    triggeredById: string,
    totalRecipients: number,
    status?: CampaignExecutionStatus,
  ): Promise<CrmCampaignExecutionItem>;
  updateCampaignExecution(
    executionId: string,
    updates: Partial<{
      status: CampaignExecutionStatus;
      jobId?: string | null;
      processedRecipients: number;
      successfulRecipients: number;
      failedRecipients: number;
      completedAt: string | null;
    }>,
  ): Promise<CrmCampaignExecutionItem | null>;
  findExecutionById(executionId: string): Promise<CrmCampaignExecutionItem | null>;
  findLatestCampaignExecution(campaignId: string): Promise<CrmCampaignExecutionItem | null>;
  listCampaignExecutions(campaignId: string): Promise<CrmCampaignExecutionItem[]>;
  batchCreateCampaignRecipients(
    recipients: Array<{
      campaignId: string;
      executionId: string;
      userId: string;
      channel: CampaignChannel;
      status: CampaignRecipientStatus;
      errorMessage?: string | null;
      sentAt?: string | null;
    }>,
  ): Promise<number>;
  claimPendingRecipients(
    executionId: string,
    limit: number,
    excludeIds?: string[],
  ): Promise<CrmCampaignRecipientItem[]>;
  updateCampaignRecipientStatus(
    recipientId: string,
    data: {
      status: CampaignRecipientStatus;
      errorMessage?: string | null;
      errorCode?: string | null;
      sentAt?: string | null;
      attempts?: number;
      lastAttemptAt?: string | null;
    },
  ): Promise<void>;
  batchSkipRecipients(executionId: string, reason: string, errorCode: string): Promise<number>;
  getExecutionCounts(
    executionId: string,
  ): Promise<{ total: number; processed: number; successful: number; failed: number; pending: number }>;
  getUserContact(
    userId: string,
  ): Promise<{ email: string | null; phoneNumber: string | null; name: string | null } | null>;
  listCampaignRecipients(
    executionId: string,
    params?: ListCrmCampaignRecipientsParams,
  ): Promise<ListCrmCampaignRecipientsResponse>;
}

// ---------------------------------------------------------------------------
// Drizzle Implementation
// ---------------------------------------------------------------------------

export class DrizzleCrmStore implements CrmStore {
  constructor(private readonly db: DbClient) {}

  async listCustomers(params: ListCrmCustomersParams): Promise<ListCrmCustomersResponse> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [isNull(users.deletedAt)];

    // 1. Search (name, email, phone)
    if (params.search && params.search.trim()) {
      const trimmed = params.search.trim();
      conditions.push(
        or(
          ilike(users.name, `%${trimmed}%`),
          ilike(users.email, `%${trimmed}%`),
          ilike(users.phoneNumber, `%${trimmed}%`),
        ),
      );
    }

    // 2. Verification status
    if (params.verifiedStatus === "verified") {
      conditions.push(or(isNotNull(users.emailVerifiedAt), isNotNull(users.phoneVerifiedAt)));
    } else if (params.verifiedStatus === "unverified") {
      conditions.push(and(isNull(users.emailVerifiedAt), isNull(users.phoneVerifiedAt)));
    }

    // 3. Registration date
    if (params.createdAfter) {
      const d = new Date(params.createdAfter);
      if (!isNaN(d.getTime())) conditions.push(gte(users.createdAt, d));
    }
    if (params.createdBefore) {
      const d = new Date(params.createdBefore);
      if (!isNaN(d.getTime())) conditions.push(lte(users.createdAt, d));
    }

    // 4. Tag filter
    if (params.tagId && params.tagId.trim()) {
      const userIdsWithTag = this.db
        .select({ userId: crmCustomerTags.userId })
        .from(crmCustomerTags)
        .where(eq(crmCustomerTags.tagId, params.tagId.trim()));
      conditions.push(inArray(users.id, userIdsWithTag));
    }

    // 5. Successful purchase filter (excluding internal wallet gateway)
    if (params.hasPurchases === "true") {
      const payingUsers = this.db
        .selectDistinct({ userId: payments.userId })
        .from(payments)
        .where(and(eq(payments.status, "paid"), ne(payments.gateway, "wallet")));
      conditions.push(inArray(users.id, payingUsers));
    } else if (params.hasPurchases === "false") {
      const payingUsers = this.db
        .selectDistinct({ userId: payments.userId })
        .from(payments)
        .where(and(eq(payments.status, "paid"), ne(payments.gateway, "wallet")));
      conditions.push(notInArray(users.id, payingUsers));
    }

    // 6. Spent range filter (excluding internal wallet gateway)
    if (typeof params.minSpent === "number" && params.minSpent > 0) {
      const qualifyingUsers = this.db
        .select({ userId: payments.userId })
        .from(payments)
        .where(and(eq(payments.status, "paid"), ne(payments.gateway, "wallet")))
        .groupBy(payments.userId)
        .having(gte(sql`SUM(${payments.amount})`, params.minSpent));
      conditions.push(inArray(users.id, qualifyingUsers));
    }
    if (typeof params.maxSpent === "number" && params.maxSpent >= 0) {
      const qualifyingUsers = this.db
        .select({ userId: payments.userId })
        .from(payments)
        .where(and(eq(payments.status, "paid"), ne(payments.gateway, "wallet")))
        .groupBy(payments.userId)
        .having(lte(sql`SUM(${payments.amount})`, params.maxSpent));
      conditions.push(inArray(users.id, qualifyingUsers));
    }

    const whereClause = and(...conditions);

    // Sorting
    const sortField = params.sortBy ?? "createdAt";
    const sortOrder = params.sortOrder === "asc" ? asc : desc;

    let orderByClause: SQL;
    switch (sortField) {
      case "name":
        orderByClause = sortOrder(users.name);
        break;
      case "totalSpent": {
        const spentSubquery = sql`(SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.user_id = ${users.id} AND p.status = 'paid' AND p.gateway != 'wallet')`;
        orderByClause = sortOrder(spentSubquery);
        break;
      }
      case "successfulOrdersCount": {
        const ordersSubquery = sql`(SELECT COUNT(o.id) FROM orders o WHERE o.user_id = ${users.id} AND o.status = 'paid')`;
        orderByClause = sortOrder(ordersSubquery);
        break;
      }
      case "createdAt":
      default:
        orderByClause = sortOrder(users.createdAt);
        break;
    }

    const countQuery = this.db.select({ total: count() }).from(users).where(whereClause);
    const usersQuery = this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phoneNumber: users.phoneNumber,
        createdAt: users.createdAt,
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(orderByClause, desc(users.id))
      .limit(pageSize)
      .offset(offset);

    const [countRes, userRows] = await Promise.all([countQuery, usersQuery]);
    const totalCount = Number(countRes[0]?.total ?? 0);

    if (userRows.length === 0) {
      return {
        customers: [],
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize) || 1,
      };
    }

    const userIds = userRows.map((u) => u.id);

    // Batch enrichments:
    // A. Successful orders count per user
    const orderCountsPromise = this.db
      .select({
        userId: orders.userId,
        orderCount: count(orders.id),
      })
      .from(orders)
      .where(and(inArray(orders.userId, userIds), eq(orders.status, "paid")))
      .groupBy(orders.userId);

    // B. Total paid payments amount per user (excluding internal wallet payments)
    const paymentSumsPromise = this.db
      .select({
        userId: payments.userId,
        totalPaid: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(
        and(
          inArray(payments.userId, userIds),
          eq(payments.status, "paid"),
          ne(payments.gateway, "wallet"),
        ),
      )
      .groupBy(payments.userId);

    // C. Tags per user
    const tagsPromise = this.db
      .select({
        userId: crmCustomerTags.userId,
        tagId: crmTags.id,
        tagName: crmTags.name,
        tagColor: crmTags.color,
      })
      .from(crmCustomerTags)
      .innerJoin(crmTags, eq(crmCustomerTags.tagId, crmTags.id))
      .where(inArray(crmCustomerTags.userId, userIds));

    // D. Real last active per user
    const lastSessionPromise = this.db
      .select({
        userId: sessions.userId,
        lastUsedAt: sql<Date>`MAX(${sessions.lastUsedAt})`,
      })
      .from(sessions)
      .where(inArray(sessions.userId, userIds))
      .groupBy(sessions.userId);

    const lastDevicePromise = this.db
      .select({
        userId: userDevices.userId,
        lastSeenAt: sql<Date>`MAX(${userDevices.lastSeenAt})`,
      })
      .from(userDevices)
      .where(inArray(userDevices.userId, userIds))
      .groupBy(userDevices.userId);

    const lastStudyPromise = this.db
      .select({
        userId: studySessions.userId,
        lastActivityAt: sql<Date>`MAX(${studySessions.lastActivityAt})`,
      })
      .from(studySessions)
      .where(inArray(studySessions.userId, userIds))
      .groupBy(studySessions.userId);

    const [orderCounts, paymentSums, tagRows, lastSessions, lastDevices, lastStudies] =
      await Promise.all([
        orderCountsPromise,
        paymentSumsPromise,
        tagsPromise,
        lastSessionPromise,
        lastDevicePromise,
        lastStudyPromise,
      ]);

    const orderCountMap = new Map<string, number>();
    for (const r of orderCounts) orderCountMap.set(r.userId, Number(r.orderCount));

    const paymentSumMap = new Map<string, number>();
    for (const r of paymentSums) paymentSumMap.set(r.userId, Number(r.totalPaid));

    const tagsMap = new Map<string, Array<{ id: string; name: string; color: string }>>();
    for (const r of tagRows) {
      const list = tagsMap.get(r.userId) || [];
      list.push({ id: r.tagId, name: r.tagName, color: r.tagColor });
      tagsMap.set(r.userId, list);
    }

    const lastActiveMap = new Map<string, string | null>();
    for (const id of userIds) {
      const sessionDate = lastSessions.find((s) => s.userId === id)?.lastUsedAt;
      const deviceDate = lastDevices.find((d) => d.userId === id)?.lastSeenAt;
      const studyDate = lastStudies.find((st) => st.userId === id)?.lastActivityAt;

      const timestamps = [sessionDate, deviceDate, studyDate]
        .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()))
        .map((d) => d.getTime());

      if (timestamps.length > 0) {
        lastActiveMap.set(id, new Date(Math.max(...timestamps)).toISOString());
      } else {
        lastActiveMap.set(id, null);
      }
    }

    const customers: CrmCustomerListItem[] = userRows.map((u) => {
      const emailVerified = u.emailVerifiedAt != null;
      const phoneVerified = u.phoneVerifiedAt != null;
      return {
        id: u.id,
        name: u.name ?? "کاربر بدون نام",
        email: u.email,
        phoneNumber: u.phoneNumber ?? null,
        createdAt: u.createdAt.toISOString(),
        lastActiveAt: lastActiveMap.get(u.id) ?? null,
        isVerified: emailVerified || phoneVerified,
        emailVerified,
        phoneVerified,
        successfulOrdersCount: orderCountMap.get(u.id) ?? 0,
        totalPaidAmount: paymentSumMap.get(u.id) ?? 0,
        tags: tagsMap.get(u.id) ?? [],
      };
    });

    return {
      customers,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  async getCustomer360(userId: string): Promise<CrmCustomer360Profile | null> {
    const [user] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phoneNumber: users.phoneNumber,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
        globalRole: users.globalRole,
        teacherStatus: users.teacherStatus,
        major: users.major,
        university: users.university,
        faculty: users.faculty,
        department: users.department,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return null;
    }

    const now = new Date();

    // 1. Devices & Last Activity
    const [activeDevicesRes, sessionMaxRes, deviceMaxRes, studyMaxRes] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(userDevices)
        .where(and(eq(userDevices.userId, userId), isNull(userDevices.revokedAt))),
      this.db
        .select({ max: sql<Date>`MAX(${sessions.lastUsedAt})` })
        .from(sessions)
        .where(eq(sessions.userId, userId)),
      this.db
        .select({ max: sql<Date>`MAX(${userDevices.lastSeenAt})` })
        .from(userDevices)
        .where(eq(userDevices.userId, userId)),
      this.db
        .select({ max: sql<Date>`MAX(${studySessions.lastActivityAt})` })
        .from(studySessions)
        .where(eq(studySessions.userId, userId)),
    ]);

    const timestamps = [sessionMaxRes[0]?.max, deviceMaxRes[0]?.max, studyMaxRes[0]?.max]
      .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()))
      .map((d) => d.getTime());

    const lastActiveAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

    // 2. Financial Metrics (excluding internal wallet gateway payments)
    const [
      ordersCountRes,
      paymentsRes,
      walletRes,
      walletTxAggRes,
      activeSubRes,
    ] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(orders)
        .where(and(eq(orders.userId, userId), eq(orders.status, "paid"))),
      this.db
        .select({
          totalPaid: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
          lastPaidAt: sql<Date>`MAX(${payments.paidAt})`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.userId, userId),
            eq(payments.status, "paid"),
            ne(payments.gateway, "wallet"),
          ),
        ),
      this.db
        .select({ balance: wallets.balance })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1),
      this.db
        .select({
          type: walletTransactions.type,
          source: walletTransactions.source,
          totalAmount: sql<number>`COALESCE(SUM(${walletTransactions.amount}), 0)`,
          txCount: count(walletTransactions.id),
        })
        .from(walletTransactions)
        .where(eq(walletTransactions.userId, userId))
        .groupBy(walletTransactions.type, walletTransactions.source),
      this.db
        .select({
          subId: userSubscriptions.id,
          expiresAt: userSubscriptions.expiresAt,
          productTitle: products.title,
        })
        .from(userSubscriptions)
        .innerJoin(products, eq(userSubscriptions.productId, products.id))
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.status, "active"),
            gte(userSubscriptions.expiresAt, now),
          ),
        )
        .orderBy(desc(userSubscriptions.expiresAt))
        .limit(1),
    ]);

    let totalWalletTopups = 0;
    let totalAiConsumption = 0;
    let totalSpecialExamConsumption = 0;
    let totalGiftCredits = 0;
    let refundsCount = 0;
    let totalRefunds = 0;

    for (const tx of walletTxAggRes) {
      const amt = Number(tx.totalAmount);
      if (tx.type === "credit") {
        if (tx.source === "wallet_topup") totalWalletTopups += amt;
        else if (
          tx.source === "welcome_gift" ||
          tx.source === "referral_reward" ||
          tx.source === "subscription_bonus" ||
          tx.source === "promotion_cashback"
        ) {
          totalGiftCredits += amt;
        }
      } else if (tx.type === "debit") {
        if (tx.source === "content_generation") totalAiConsumption += amt;
        else if (tx.source === "special_exam_purchase") totalSpecialExamConsumption += amt;
      } else if (tx.type === "refund") {
        totalRefunds += amt;
        refundsCount += Number(tx.txCount);
      }
    }

    // 3. Educational Activity Metrics
    const [
      enrolledRes,
      ownedRes,
      documentsRes,
      aiContentsRes,
      quizzesRes,
      studyAggRes,
    ] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(courseMemberships)
        .where(and(eq(courseMemberships.userId, userId), eq(courseMemberships.role, "student"))),
      this.db
        .select({ count: count() })
        .from(courseMemberships)
        .where(
          and(
            eq(courseMemberships.userId, userId),
            or(
              eq(courseMemberships.role, "teacher"),
              eq(courseMemberships.role, "organization_admin"),
              eq(courseMemberships.role, "course_editor"),
            ),
          ),
        ),
      this.db
        .select({ count: count() })
        .from(documents)
        .where(and(eq(documents.ownerUserId, userId), isNull(documents.deletedAt))),
      this.db
        .select({ count: count(generatedContents.id) })
        .from(generatedContents)
        .innerJoin(documents, eq(generatedContents.documentId, documents.id))
        .where(
          and(
            eq(documents.ownerUserId, userId),
            isNull(documents.deletedAt),
            isNull(generatedContents.deletedAt),
          ),
        ),
      this.db
        .select({
          count: count(quizAttempts.id),
          avgScore: sql<number>`AVG(${quizAttempts.score})`,
        })
        .from(quizAttempts)
        .where(eq(quizAttempts.userId, userId)),
      this.db
        .select({
          totalSeconds: sql<number>`COALESCE(SUM(${studySessions.durationSeconds}), 0)`,
          lastActivityAt: sql<Date>`MAX(${studySessions.lastActivityAt})`,
        })
        .from(studySessions)
        .where(eq(studySessions.userId, userId)),
    ]);

    // 4. Tags and Notes
    const [tags, notes] = await Promise.all([
      this.getCustomerTags(userId),
      this.listCustomerNotes(userId),
    ]);

    const emailVerified = user.emailVerifiedAt != null;
    const phoneVerified = user.phoneVerifiedAt != null;

    return {
      identity: {
        id: user.id,
        name: user.name ?? "کاربر بدون نام",
        email: user.email,
        phoneNumber: user.phoneNumber ?? null,
        createdAt: user.createdAt.toISOString(),
        deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
        isVerified: emailVerified || phoneVerified,
        emailVerified,
        phoneVerified,
        role: user.globalRole ?? Roles.student,
        teacherStatus: user.teacherStatus ?? "approved",
        major: user.major ?? null,
        university: user.university ?? null,
        faculty: user.faculty ?? null,
        department: user.department ?? null,
        lastActiveAt,
        activeDevicesCount: Number(activeDevicesRes[0]?.count ?? 0),
      },
      financial: {
        successfulOrdersCount: Number(ordersCountRes[0]?.count ?? 0),
        totalPaidAmount: Number(paymentsRes[0]?.totalPaid ?? 0),
        lastPaymentDate: paymentsRes[0]?.lastPaidAt ? new Date(paymentsRes[0].lastPaidAt).toISOString() : null,
        walletBalance: walletRes[0]?.balance ?? 0,
        totalWalletTopups,
        totalAiConsumption,
        totalSpecialExamConsumption,
        totalGiftCredits,
        refundsCount,
        totalRefunds,
        activeSubscription: activeSubRes[0]
          ? {
              id: activeSubRes[0].subId,
              productTitle: activeSubRes[0].productTitle,
              expiresAt: new Date(activeSubRes[0].expiresAt).toISOString(),
              status: "active",
            }
          : null,
      },
      education: {
        enrolledCoursesCount: Number(enrolledRes[0]?.count ?? 0),
        ownedCoursesCount: Number(ownedRes[0]?.count ?? 0),
        uploadedDocumentsCount: Number(documentsRes[0]?.count ?? 0),
        aiGeneratedContentsCount: Number(aiContentsRes[0]?.count ?? 0),
        quizzesAttemptedCount: Number(quizzesRes[0]?.count ?? 0),
        averageQuizScore:
          quizzesRes[0]?.avgScore !== null && quizzesRes[0]?.avgScore !== undefined
            ? Math.round(Number(quizzesRes[0].avgScore) * 10) / 10
            : null,
        totalStudyTimeSeconds: Number(studyAggRes[0]?.totalSeconds ?? 0),
        lastEducationalActivityAt: studyAggRes[0]?.lastActivityAt
          ? new Date(studyAggRes[0].lastActivityAt).toISOString()
          : null,
      },
      tags,
      notes,
    };
  }

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------

  async listTags(): Promise<CrmTagItem[]> {
    const rows = await this.db.select().from(crmTags).orderBy(asc(crmTags.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async findTagByName(name: string): Promise<CrmTagItem | null> {
    const [row] = await this.db
      .select()
      .from(crmTags)
      .where(ilike(crmTags.name, name.trim()))
      .limit(1);
    return row
      ? {
          id: row.id,
          name: row.name,
          color: row.color,
          description: row.description,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : null;
  }

  async findTagById(id: string): Promise<CrmTagItem | null> {
    const [row] = await this.db.select().from(crmTags).where(eq(crmTags.id, id)).limit(1);
    return row
      ? {
          id: row.id,
          name: row.name,
          color: row.color,
          description: row.description,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : null;
  }

  async createTag(input: CreateCrmTagInput): Promise<CrmTagItem> {
    const [row] = await this.db
      .insert(crmTags)
      .values({
        name: input.name.trim(),
        color: input.color?.trim() || "#3b82f6",
        description: input.description?.trim() || null,
      })
      .returning();

    return {
      id: row.id,
      name: row.name,
      color: row.color,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateTag(id: string, input: UpdateCrmTagInput): Promise<CrmTagItem | null> {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.color !== undefined) updates.color = input.color.trim();
    if (input.description !== undefined) updates.description = input.description?.trim() || null;

    const [row] = await this.db
      .update(crmTags)
      .set(updates)
      .where(eq(crmTags.id, id))
      .returning();

    return row
      ? {
          id: row.id,
          name: row.name,
          color: row.color,
          description: row.description,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : null;
  }

  async deleteTag(id: string): Promise<boolean> {
    const res = await this.db.delete(crmTags).where(eq(crmTags.id, id)).returning({ id: crmTags.id });
    return res.length > 0;
  }

  async assignTag(userId: string, tagId: string, assignedBy?: string): Promise<boolean> {
    const existing = await this.db
      .select()
      .from(crmCustomerTags)
      .where(and(eq(crmCustomerTags.userId, userId), eq(crmCustomerTags.tagId, tagId)))
      .limit(1);

    if (existing.length > 0) {
      return false; // Already assigned, idempotent
    }

    await this.db.insert(crmCustomerTags).values({
      userId,
      tagId,
      assignedBy: assignedBy ?? null,
    });
    return true;
  }

  async removeTag(userId: string, tagId: string): Promise<boolean> {
    const res = await this.db
      .delete(crmCustomerTags)
      .where(and(eq(crmCustomerTags.userId, userId), eq(crmCustomerTags.tagId, tagId)))
      .returning();
    return res.length > 0;
  }

  async getCustomerTags(userId: string): Promise<CrmTagItem[]> {
    const rows = await this.db
      .select({
        id: crmTags.id,
        name: crmTags.name,
        color: crmTags.color,
        description: crmTags.description,
        createdAt: crmTags.createdAt,
        updatedAt: crmTags.updatedAt,
      })
      .from(crmCustomerTags)
      .innerJoin(crmTags, eq(crmCustomerTags.tagId, crmTags.id))
      .where(eq(crmCustomerTags.userId, userId))
      .orderBy(asc(crmTags.name));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------

  async listCustomerNotes(userId: string): Promise<CrmCustomerNoteItem[]> {
    const rows = await this.db
      .select({
        id: crmCustomerNotes.id,
        userId: crmCustomerNotes.userId,
        authorId: crmCustomerNotes.authorId,
        authorName: users.name,
        authorEmail: users.email,
        content: crmCustomerNotes.content,
        isPinned: crmCustomerNotes.isPinned,
        createdAt: crmCustomerNotes.createdAt,
        updatedAt: crmCustomerNotes.updatedAt,
      })
      .from(crmCustomerNotes)
      .leftJoin(users, eq(crmCustomerNotes.authorId, users.id))
      .where(eq(crmCustomerNotes.userId, userId))
      .orderBy(desc(crmCustomerNotes.isPinned), desc(crmCustomerNotes.createdAt));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      authorId: r.authorId,
      authorName: r.authorName ?? "نامشخص",
      authorEmail: r.authorEmail ?? "",
      content: r.content,
      isPinned: r.isPinned,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async findNoteById(noteId: string): Promise<CrmCustomerNoteItem | null> {
    const [row] = await this.db
      .select({
        id: crmCustomerNotes.id,
        userId: crmCustomerNotes.userId,
        authorId: crmCustomerNotes.authorId,
        authorName: users.name,
        authorEmail: users.email,
        content: crmCustomerNotes.content,
        isPinned: crmCustomerNotes.isPinned,
        createdAt: crmCustomerNotes.createdAt,
        updatedAt: crmCustomerNotes.updatedAt,
      })
      .from(crmCustomerNotes)
      .leftJoin(users, eq(crmCustomerNotes.authorId, users.id))
      .where(eq(crmCustomerNotes.id, noteId))
      .limit(1);

    return row
      ? {
          id: row.id,
          userId: row.userId,
          authorId: row.authorId,
          authorName: row.authorName ?? "نامشخص",
          authorEmail: row.authorEmail ?? "",
          content: row.content,
          isPinned: row.isPinned,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : null;
  }

  async createCustomerNote(
    userId: string,
    authorId: string,
    input: CreateCrmCustomerNoteInput,
  ): Promise<CrmCustomerNoteItem> {
    const [row] = await this.db
      .insert(crmCustomerNotes)
      .values({
        userId,
        authorId,
        content: input.content.trim(),
        isPinned: input.isPinned ?? false,
      })
      .returning();

    const [author] = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1);

    return {
      id: row.id,
      userId: row.userId,
      authorId: row.authorId,
      authorName: author?.name ?? "نامشخص",
      authorEmail: author?.email ?? "",
      content: row.content,
      isPinned: row.isPinned,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateCustomerNote(
    noteId: string,
    input: UpdateCrmCustomerNoteInput,
  ): Promise<CrmCustomerNoteItem | null> {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.content !== undefined) updates.content = input.content.trim();
    if (input.isPinned !== undefined) updates.isPinned = input.isPinned;

    const [row] = await this.db
      .update(crmCustomerNotes)
      .set(updates)
      .where(eq(crmCustomerNotes.id, noteId))
      .returning();

    if (!row) return null;

    const [author] = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, row.authorId))
      .limit(1);

    return {
      id: row.id,
      userId: row.userId,
      authorId: row.authorId,
      authorName: author?.name ?? "نامشخص",
      authorEmail: author?.email ?? "",
      content: row.content,
      isPinned: row.isPinned,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async deleteCustomerNote(noteId: string): Promise<boolean> {
    const res = await this.db
      .delete(crmCustomerNotes)
      .where(eq(crmCustomerNotes.id, noteId))
      .returning({ id: crmCustomerNotes.id });
    return res.length > 0;
  }

  // -------------------------------------------------------------------------
  // Segments (Phase 2)
  // -------------------------------------------------------------------------

  buildSegmentFilterCondition(rule: SegmentFilterRule): SQL | undefined {
    switch (rule.field) {
      // 1. User Profile & Identity
      case "user.createdAt": {
        if (rule.operator === "equals") return eq(users.createdAt, new Date(rule.value as string));
        if (rule.operator === "not_equals") return ne(users.createdAt, new Date(rule.value as string));
        if (rule.operator === "greater_than") return gt(users.createdAt, new Date(rule.value as string));
        if (rule.operator === "greater_than_or_equal") return gte(users.createdAt, new Date(rule.value as string));
        if (rule.operator === "less_than") return lt(users.createdAt, new Date(rule.value as string));
        if (rule.operator === "less_than_or_equal") return lte(users.createdAt, new Date(rule.value as string));
        if (rule.operator === "between") {
          const [d1, d2] = rule.value as [string, string];
          return and(gte(users.createdAt, new Date(d1)), lte(users.createdAt, new Date(d2)));
        }
        if (rule.operator === "days_ago_greater_than") {
          return lte(users.createdAt, new Date(Date.now() - (rule.value as number) * 86400000));
        }
        if (rule.operator === "days_ago_less_than") {
          return gte(users.createdAt, new Date(Date.now() - (rule.value as number) * 86400000));
        }
        return undefined;
      }
      case "user.emailVerified": {
        const wantsTrue = rule.operator === "is_true" || (rule.operator === "equals" && rule.value !== false);
        return wantsTrue ? isNotNull(users.emailVerifiedAt) : isNull(users.emailVerifiedAt);
      }
      case "user.phoneVerified": {
        const wantsTrue = rule.operator === "is_true" || (rule.operator === "equals" && rule.value !== false);
        return wantsTrue ? isNotNull(users.phoneVerifiedAt) : isNull(users.phoneVerifiedAt);
      }
      case "user.isVerified": {
        const wantsTrue = rule.operator === "is_true" || (rule.operator === "equals" && rule.value !== false);
        return wantsTrue
          ? or(isNotNull(users.emailVerifiedAt), isNotNull(users.phoneVerifiedAt))
          : and(isNull(users.emailVerifiedAt), isNull(users.phoneVerifiedAt));
      }
      case "user.major": {
        if (rule.operator === "equals") return eq(users.major, rule.value as string);
        if (rule.operator === "not_equals") return or(isNull(users.major), ne(users.major, rule.value as string));
        if (rule.operator === "in") return inArray(users.major, rule.value as string[]);
        if (rule.operator === "not_in") return or(isNull(users.major), notInArray(users.major, rule.value as string[]));
        return undefined;
      }

      // 2. CRM Tags
      case "crm.tag": {
        if (rule.operator === "equals") {
          const sub = this.db
            .select({ userId: crmCustomerTags.userId })
            .from(crmCustomerTags)
            .where(eq(crmCustomerTags.tagId, rule.value as string));
          return inArray(users.id, sub);
        }
        if (rule.operator === "not_equals") {
          const sub = this.db
            .select({ userId: crmCustomerTags.userId })
            .from(crmCustomerTags)
            .where(eq(crmCustomerTags.tagId, rule.value as string));
          return notInArray(users.id, sub);
        }
        if (rule.operator === "in") {
          const sub = this.db
            .select({ userId: crmCustomerTags.userId })
            .from(crmCustomerTags)
            .where(inArray(crmCustomerTags.tagId, rule.value as string[]));
          return inArray(users.id, sub);
        }
        if (rule.operator === "not_in") {
          const sub = this.db
            .select({ userId: crmCustomerTags.userId })
            .from(crmCustomerTags)
            .where(inArray(crmCustomerTags.tagId, rule.value as string[]));
          return notInArray(users.id, sub);
        }
        return undefined;
      }

      // 3. Cash Purchases & Orders
      case "payment.hasCashPurchase": {
        const cashPayingUsers = this.db
          .selectDistinct({ userId: payments.userId })
          .from(payments)
          .where(and(eq(payments.status, "paid"), ne(payments.gateway, "wallet")));
        const wantsTrue = rule.operator === "is_true" || (rule.operator === "equals" && rule.value !== false);
        return wantsTrue ? inArray(users.id, cashPayingUsers) : notInArray(users.id, cashPayingUsers);
      }
      case "payment.totalCashSpent": {
        const cashPayingUsers = this.db
          .selectDistinct({ userId: payments.userId })
          .from(payments)
          .where(and(eq(payments.status, "paid"), ne(payments.gateway, "wallet")));
        const cashAggSubquery = this.db
          .select({ userId: payments.userId })
          .from(payments)
          .where(and(eq(payments.status, "paid"), ne(payments.gateway, "wallet")))
          .groupBy(payments.userId);

        if (rule.operator === "equals") {
          const val = rule.value as number;
          if (val === 0) return notInArray(users.id, cashPayingUsers);
          return inArray(users.id, cashAggSubquery.having(eq(sql`COALESCE(SUM(${payments.amount}), 0)`, val)));
        }
        if (rule.operator === "not_equals") {
          const val = rule.value as number;
          if (val === 0) return inArray(users.id, cashPayingUsers);
          return notInArray(users.id, cashAggSubquery.having(eq(sql`COALESCE(SUM(${payments.amount}), 0)`, val)));
        }
        if (rule.operator === "greater_than") {
          return inArray(users.id, cashAggSubquery.having(gt(sql`COALESCE(SUM(${payments.amount}), 0)`, rule.value as number)));
        }
        if (rule.operator === "greater_than_or_equal") {
          const val = rule.value as number;
          if (val <= 0) return sql`1=1`;
          return inArray(users.id, cashAggSubquery.having(gte(sql`COALESCE(SUM(${payments.amount}), 0)`, val)));
        }
        if (rule.operator === "less_than") {
          return notInArray(users.id, cashAggSubquery.having(gte(sql`COALESCE(SUM(${payments.amount}), 0)`, rule.value as number)));
        }
        if (rule.operator === "less_than_or_equal") {
          return notInArray(users.id, cashAggSubquery.having(gt(sql`COALESCE(SUM(${payments.amount}), 0)`, rule.value as number)));
        }
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          if (min === 0) {
            return notInArray(users.id, cashAggSubquery.having(gt(sql`COALESCE(SUM(${payments.amount}), 0)`, max)));
          }
          return inArray(
            users.id,
            cashAggSubquery.having(
              and(
                gte(sql`COALESCE(SUM(${payments.amount}), 0)`, min),
                lte(sql`COALESCE(SUM(${payments.amount}), 0)`, max),
              ),
            ),
          );
        }
        return undefined;
      }
      case "payment.successfulOrdersCount": {
        const paidOrdersSub = this.db
          .select({ userId: orders.userId })
          .from(orders)
          .where(eq(orders.status, "paid"))
          .groupBy(orders.userId);

        if (rule.operator === "equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyPaid = this.db.selectDistinct({ userId: orders.userId }).from(orders).where(eq(orders.status, "paid"));
            return notInArray(users.id, anyPaid);
          }
          return inArray(users.id, paidOrdersSub.having(eq(count(orders.id), val)));
        }
        if (rule.operator === "not_equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyPaid = this.db.selectDistinct({ userId: orders.userId }).from(orders).where(eq(orders.status, "paid"));
            return inArray(users.id, anyPaid);
          }
          return notInArray(users.id, paidOrdersSub.having(eq(count(orders.id), val)));
        }
        if (rule.operator === "greater_than") {
          return inArray(users.id, paidOrdersSub.having(gt(count(orders.id), rule.value as number)));
        }
        if (rule.operator === "greater_than_or_equal") {
          const val = rule.value as number;
          if (val <= 0) return sql`1=1`;
          return inArray(users.id, paidOrdersSub.having(gte(count(orders.id), val)));
        }
        if (rule.operator === "less_than") {
          return notInArray(users.id, paidOrdersSub.having(gte(count(orders.id), rule.value as number)));
        }
        if (rule.operator === "less_than_or_equal") {
          return notInArray(users.id, paidOrdersSub.having(gt(count(orders.id), rule.value as number)));
        }
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          if (min === 0) {
            return notInArray(users.id, paidOrdersSub.having(gt(count(orders.id), max)));
          }
          return inArray(
            users.id,
            paidOrdersSub.having(and(gte(count(orders.id), min), lte(count(orders.id), max))),
          );
        }
        return undefined;
      }
      case "payment.lastCashPurchaseDate": {
        const lastPaySub = this.db
          .select({ userId: payments.userId })
          .from(payments)
          .where(and(eq(payments.status, "paid"), ne(payments.gateway, "wallet")))
          .groupBy(payments.userId);

        if (rule.operator === "days_ago_less_than") {
          const target = new Date(Date.now() - (rule.value as number) * 86400000);
          return inArray(users.id, lastPaySub.having(gte(sql`MAX(${payments.paidAt})`, target)));
        }
        if (rule.operator === "days_ago_greater_than") {
          const target = new Date(Date.now() - (rule.value as number) * 86400000);
          return inArray(users.id, lastPaySub.having(lte(sql`MAX(${payments.paidAt})`, target)));
        }
        if (rule.operator === "greater_than" || rule.operator === "greater_than_or_equal") {
          const target = new Date(rule.value as string);
          return inArray(users.id, lastPaySub.having(gte(sql`MAX(${payments.paidAt})`, target)));
        }
        if (rule.operator === "less_than" || rule.operator === "less_than_or_equal") {
          const target = new Date(rule.value as string);
          return inArray(users.id, lastPaySub.having(lte(sql`MAX(${payments.paidAt})`, target)));
        }
        if (rule.operator === "between") {
          const [d1, d2] = rule.value as [string, string];
          return inArray(
            users.id,
            lastPaySub.having(and(gte(sql`MAX(${payments.paidAt})`, new Date(d1)), lte(sql`MAX(${payments.paidAt})`, new Date(d2)))),
          );
        }
        return undefined;
      }

      // 4. Learning & Activity
      case "activity.lastActiveDate": {
        let target: Date;
        if (rule.operator === "days_ago_less_than" || rule.operator === "days_ago_greater_than") {
          target = new Date(Date.now() - (rule.value as number) * 86400000);
        } else if (rule.operator === "between") {
          const [d1, d2] = rule.value as [string, string];
          const sSub = this.db
            .selectDistinct({ userId: sessions.userId })
            .from(sessions)
            .where(and(gte(sessions.lastUsedAt, new Date(d1)), lte(sessions.lastUsedAt, new Date(d2))));
          const dSub = this.db
            .selectDistinct({ userId: userDevices.userId })
            .from(userDevices)
            .where(and(gte(userDevices.lastSeenAt, new Date(d1)), lte(userDevices.lastSeenAt, new Date(d2))));
          const stSub = this.db
            .selectDistinct({ userId: studySessions.userId })
            .from(studySessions)
            .where(and(gte(studySessions.lastActivityAt, new Date(d1)), lte(studySessions.lastActivityAt, new Date(d2))));
          return or(inArray(users.id, sSub), inArray(users.id, dSub), inArray(users.id, stSub));
        } else {
          target = new Date(rule.value as string);
        }

        const sSub = this.db
          .selectDistinct({ userId: sessions.userId })
          .from(sessions)
          .where(gte(sessions.lastUsedAt, target));
        const dSub = this.db
          .selectDistinct({ userId: userDevices.userId })
          .from(userDevices)
          .where(gte(userDevices.lastSeenAt, target));
        const stSub = this.db
          .selectDistinct({ userId: studySessions.userId })
          .from(studySessions)
          .where(gte(studySessions.lastActivityAt, target));

        if (rule.operator === "days_ago_less_than" || rule.operator === "greater_than" || rule.operator === "greater_than_or_equal") {
          return or(inArray(users.id, sSub), inArray(users.id, dSub), inArray(users.id, stSub));
        }
        if (rule.operator === "days_ago_greater_than" || rule.operator === "less_than" || rule.operator === "less_than_or_equal") {
          return and(notInArray(users.id, sSub), notInArray(users.id, dSub), notInArray(users.id, stSub));
        }
        return undefined;
      }
      case "activity.studySessionsCount": {
        const windowConds: Array<SQL | undefined> = [];
        if (rule.window === "last_7_days") windowConds.push(gte(studySessions.startedAt, new Date(Date.now() - 7 * 86400000)));
        else if (rule.window === "last_30_days") windowConds.push(gte(studySessions.startedAt, new Date(Date.now() - 30 * 86400000)));
        else if (rule.window === "last_90_days") windowConds.push(gte(studySessions.startedAt, new Date(Date.now() - 90 * 86400000)));

        const studySub = this.db
          .select({ userId: studySessions.userId })
          .from(studySessions)
          .where(windowConds.length > 0 ? and(...windowConds) : undefined)
          .groupBy(studySessions.userId);

        if (rule.operator === "equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyStudy = this.db
              .selectDistinct({ userId: studySessions.userId })
              .from(studySessions)
              .where(windowConds.length > 0 ? and(...windowConds) : undefined);
            return notInArray(users.id, anyStudy);
          }
          return inArray(users.id, studySub.having(eq(count(studySessions.id), val)));
        }
        if (rule.operator === "not_equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyStudy = this.db
              .selectDistinct({ userId: studySessions.userId })
              .from(studySessions)
              .where(windowConds.length > 0 ? and(...windowConds) : undefined);
            return inArray(users.id, anyStudy);
          }
          return notInArray(users.id, studySub.having(eq(count(studySessions.id), val)));
        }
        if (rule.operator === "greater_than") {
          return inArray(users.id, studySub.having(gt(count(studySessions.id), rule.value as number)));
        }
        if (rule.operator === "greater_than_or_equal") {
          const val = rule.value as number;
          if (val <= 0) return sql`1=1`;
          return inArray(users.id, studySub.having(gte(count(studySessions.id), val)));
        }
        if (rule.operator === "less_than") {
          return notInArray(users.id, studySub.having(gte(count(studySessions.id), rule.value as number)));
        }
        if (rule.operator === "less_than_or_equal") {
          return notInArray(users.id, studySub.having(gt(count(studySessions.id), rule.value as number)));
        }
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          if (min === 0) {
            return notInArray(users.id, studySub.having(gt(count(studySessions.id), max)));
          }
          return inArray(
            users.id,
            studySub.having(and(gte(count(studySessions.id), min), lte(count(studySessions.id), max))),
          );
        }
        return undefined;
      }
      case "activity.totalStudyTimeMinutes": {
        const windowConds: Array<SQL | undefined> = [];
        if (rule.window === "last_7_days") windowConds.push(gte(studySessions.startedAt, new Date(Date.now() - 7 * 86400000)));
        else if (rule.window === "last_30_days") windowConds.push(gte(studySessions.startedAt, new Date(Date.now() - 30 * 86400000)));
        else if (rule.window === "last_90_days") windowConds.push(gte(studySessions.startedAt, new Date(Date.now() - 90 * 86400000)));

        const studySub = this.db
          .select({ userId: studySessions.userId })
          .from(studySessions)
          .where(windowConds.length > 0 ? and(...windowConds) : undefined)
          .groupBy(studySessions.userId);

        if (rule.operator === "equals") {
          const valSeconds = (rule.value as number) * 60;
          if (valSeconds === 0) {
            const anyStudy = this.db
              .selectDistinct({ userId: studySessions.userId })
              .from(studySessions)
              .where(windowConds.length > 0 ? and(...windowConds) : undefined);
            return notInArray(users.id, anyStudy);
          }
          return inArray(users.id, studySub.having(eq(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, valSeconds)));
        }
        if (rule.operator === "not_equals") {
          const valSeconds = (rule.value as number) * 60;
          if (valSeconds === 0) {
            const anyStudy = this.db
              .selectDistinct({ userId: studySessions.userId })
              .from(studySessions)
              .where(windowConds.length > 0 ? and(...windowConds) : undefined);
            return inArray(users.id, anyStudy);
          }
          return notInArray(users.id, studySub.having(eq(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, valSeconds)));
        }
        if (rule.operator === "greater_than") {
          return inArray(users.id, studySub.having(gt(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, (rule.value as number) * 60)));
        }
        if (rule.operator === "greater_than_or_equal") {
          const valSeconds = (rule.value as number) * 60;
          if (valSeconds <= 0) return sql`1=1`;
          return inArray(users.id, studySub.having(gte(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, valSeconds)));
        }
        if (rule.operator === "less_than") {
          return notInArray(users.id, studySub.having(gte(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, (rule.value as number) * 60)));
        }
        if (rule.operator === "less_than_or_equal") {
          return notInArray(users.id, studySub.having(gt(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, (rule.value as number) * 60)));
        }
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          if (min === 0) {
            return notInArray(users.id, studySub.having(gt(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, max * 60)));
          }
          return inArray(
            users.id,
            studySub.having(
              and(
                gte(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, min * 60),
                lte(sql`COALESCE(SUM(${studySessions.durationSeconds}), 0)`, max * 60),
              ),
            ),
          );
        }
        return undefined;
      }
      case "activity.completedQuizzesCount": {
        const quizSub = this.db
          .select({ userId: quizAttempts.userId })
          .from(quizAttempts)
          .where(eq(quizAttempts.status, "completed"))
          .groupBy(quizAttempts.userId);

        if (rule.operator === "equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyQuiz = this.db.selectDistinct({ userId: quizAttempts.userId }).from(quizAttempts).where(eq(quizAttempts.status, "completed"));
            return notInArray(users.id, anyQuiz);
          }
          return inArray(users.id, quizSub.having(eq(count(quizAttempts.id), val)));
        }
        if (rule.operator === "not_equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyQuiz = this.db.selectDistinct({ userId: quizAttempts.userId }).from(quizAttempts).where(eq(quizAttempts.status, "completed"));
            return inArray(users.id, anyQuiz);
          }
          return notInArray(users.id, quizSub.having(eq(count(quizAttempts.id), val)));
        }
        if (rule.operator === "greater_than") {
          return inArray(users.id, quizSub.having(gt(count(quizAttempts.id), rule.value as number)));
        }
        if (rule.operator === "greater_than_or_equal") {
          const val = rule.value as number;
          if (val <= 0) return sql`1=1`;
          return inArray(users.id, quizSub.having(gte(count(quizAttempts.id), val)));
        }
        if (rule.operator === "less_than") {
          return notInArray(users.id, quizSub.having(gte(count(quizAttempts.id), rule.value as number)));
        }
        if (rule.operator === "less_than_or_equal") {
          return notInArray(users.id, quizSub.having(gt(count(quizAttempts.id), rule.value as number)));
        }
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          if (min === 0) {
            return notInArray(users.id, quizSub.having(gt(count(quizAttempts.id), max)));
          }
          return inArray(
            users.id,
            quizSub.having(and(gte(count(quizAttempts.id), min), lte(count(quizAttempts.id), max))),
          );
        }
        return undefined;
      }
      case "activity.enrolledCoursesCount": {
        const courseSub = this.db
          .select({ userId: courseMemberships.userId })
          .from(courseMemberships)
          .where(eq(courseMemberships.role, "student"))
          .groupBy(courseMemberships.userId);

        if (rule.operator === "equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyCourse = this.db.selectDistinct({ userId: courseMemberships.userId }).from(courseMemberships).where(eq(courseMemberships.role, "student"));
            return notInArray(users.id, anyCourse);
          }
          return inArray(users.id, courseSub.having(eq(count(courseMemberships.id), val)));
        }
        if (rule.operator === "not_equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyCourse = this.db.selectDistinct({ userId: courseMemberships.userId }).from(courseMemberships).where(eq(courseMemberships.role, "student"));
            return inArray(users.id, anyCourse);
          }
          return notInArray(users.id, courseSub.having(eq(count(courseMemberships.id), val)));
        }
        if (rule.operator === "greater_than") {
          return inArray(users.id, courseSub.having(gt(count(courseMemberships.id), rule.value as number)));
        }
        if (rule.operator === "greater_than_or_equal") {
          const val = rule.value as number;
          if (val <= 0) return sql`1=1`;
          return inArray(users.id, courseSub.having(gte(count(courseMemberships.id), val)));
        }
        if (rule.operator === "less_than") {
          return notInArray(users.id, courseSub.having(gte(count(courseMemberships.id), rule.value as number)));
        }
        if (rule.operator === "less_than_or_equal") {
          return notInArray(users.id, courseSub.having(gt(count(courseMemberships.id), rule.value as number)));
        }
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          if (min === 0) {
            return notInArray(users.id, courseSub.having(gt(count(courseMemberships.id), max)));
          }
          return inArray(
            users.id,
            courseSub.having(and(gte(count(courseMemberships.id), min), lte(count(courseMemberships.id), max))),
          );
        }
        return undefined;
      }
      case "activity.uploadedDocumentsCount": {
        const docSub = this.db
          .select({ userId: documents.ownerUserId })
          .from(documents)
          .where(isNull(documents.deletedAt))
          .groupBy(documents.ownerUserId);

        if (rule.operator === "equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyDoc = this.db.selectDistinct({ userId: documents.ownerUserId }).from(documents).where(isNull(documents.deletedAt));
            return notInArray(users.id, anyDoc);
          }
          return inArray(users.id, docSub.having(eq(count(documents.id), val)));
        }
        if (rule.operator === "not_equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyDoc = this.db.selectDistinct({ userId: documents.ownerUserId }).from(documents).where(isNull(documents.deletedAt));
            return inArray(users.id, anyDoc);
          }
          return notInArray(users.id, docSub.having(eq(count(documents.id), val)));
        }
        if (rule.operator === "greater_than") {
          return inArray(users.id, docSub.having(gt(count(documents.id), rule.value as number)));
        }
        if (rule.operator === "greater_than_or_equal") {
          const val = rule.value as number;
          if (val <= 0) return sql`1=1`;
          return inArray(users.id, docSub.having(gte(count(documents.id), val)));
        }
        if (rule.operator === "less_than") {
          return notInArray(users.id, docSub.having(gte(count(documents.id), rule.value as number)));
        }
        if (rule.operator === "less_than_or_equal") {
          return notInArray(users.id, docSub.having(gt(count(documents.id), rule.value as number)));
        }
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          if (min === 0) {
            return notInArray(users.id, docSub.having(gt(count(documents.id), max)));
          }
          return inArray(
            users.id,
            docSub.having(and(gte(count(documents.id), min), lte(count(documents.id), max))),
          );
        }
        return undefined;
      }
      case "activity.aiGeneratedContentsCount": {
        const aiSub = this.db
          .select({ userId: documents.ownerUserId })
          .from(generatedContents)
          .innerJoin(documents, eq(generatedContents.documentId, documents.id))
          .where(and(isNull(documents.deletedAt), isNull(generatedContents.deletedAt)))
          .groupBy(documents.ownerUserId);

        if (rule.operator === "equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyAi = this.db
              .selectDistinct({ userId: documents.ownerUserId })
              .from(generatedContents)
              .innerJoin(documents, eq(generatedContents.documentId, documents.id))
              .where(and(isNull(documents.deletedAt), isNull(generatedContents.deletedAt)));
            return notInArray(users.id, anyAi);
          }
          return inArray(users.id, aiSub.having(eq(count(generatedContents.id), val)));
        }
        if (rule.operator === "not_equals") {
          const val = rule.value as number;
          if (val === 0) {
            const anyAi = this.db
              .selectDistinct({ userId: documents.ownerUserId })
              .from(generatedContents)
              .innerJoin(documents, eq(generatedContents.documentId, documents.id))
              .where(and(isNull(documents.deletedAt), isNull(generatedContents.deletedAt)));
            return inArray(users.id, anyAi);
          }
          return notInArray(users.id, aiSub.having(eq(count(generatedContents.id), val)));
        }
        if (rule.operator === "greater_than") {
          return inArray(users.id, aiSub.having(gt(count(generatedContents.id), rule.value as number)));
        }
        if (rule.operator === "greater_than_or_equal") {
          const val = rule.value as number;
          if (val <= 0) return sql`1=1`;
          return inArray(users.id, aiSub.having(gte(count(generatedContents.id), val)));
        }
        if (rule.operator === "less_than") {
          return notInArray(users.id, aiSub.having(gte(count(generatedContents.id), rule.value as number)));
        }
        if (rule.operator === "less_than_or_equal") {
          return notInArray(users.id, aiSub.having(gt(count(generatedContents.id), rule.value as number)));
        }
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          if (min === 0) {
            return notInArray(users.id, aiSub.having(gt(count(generatedContents.id), max)));
          }
          return inArray(
            users.id,
            aiSub.having(and(gte(count(generatedContents.id), min), lte(count(generatedContents.id), max))),
          );
        }
        return undefined;
      }
    }

    return undefined;
  }

  buildSegmentWhereClause(rules: SegmentFilterRule[], matchOperator: SegmentMatchOperator): SQL {
    const baseCondition = isNull(users.deletedAt);
    if (!rules || rules.length === 0) {
      return baseCondition;
    }
    const built = rules
      .map((r) => this.buildSegmentFilterCondition(r))
      .filter((c): c is SQL => c !== undefined);

    if (built.length === 0) {
      return baseCondition;
    }

    if (matchOperator === "or") {
      return and(baseCondition, or(...built)) ?? baseCondition;
    }
    return and(baseCondition, ...built) ?? baseCondition;
  }

  async listSegments(params?: ListCrmSegmentsParams): Promise<ListCrmSegmentsResponse> {
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [];
    if (params?.isActive !== undefined) {
      conditions.push(eq(crmSegments.isActive, params.isActive));
    }
    if (params?.search && params.search.trim()) {
      conditions.push(ilike(crmSegments.name, `%${params.search.trim()}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = this.db
      .select({ total: count() })
      .from(crmSegments)
      .where(whereClause);

    const segmentsQuery = this.db
      .select({
        id: crmSegments.id,
        name: crmSegments.name,
        description: crmSegments.description,
        isActive: crmSegments.isActive,
        matchOperator: crmSegments.matchOperator,
        filterRules: crmSegments.filterRules,
        createdBy: crmSegments.createdBy,
        createdAt: crmSegments.createdAt,
        updatedAt: crmSegments.updatedAt,
        authorName: users.name,
      })
      .from(crmSegments)
      .leftJoin(users, eq(crmSegments.createdBy, users.id))
      .where(whereClause)
      .orderBy(desc(crmSegments.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [countRes, rows] = await Promise.all([countQuery, segmentsQuery]);
    const totalCount = Number(countRes[0]?.total ?? 0);

    const segments: CrmSegmentItem[] = [];
    for (const r of rows) {
      const rules = (r.filterRules ?? []) as SegmentFilterRule[];
      const op = (r.matchOperator ?? "and") as SegmentMatchOperator;
      let estimatedCount = 0;
      try {
        estimatedCount = await this.previewSegmentCount(rules, op);
      } catch {
        estimatedCount = 0;
      }

      segments.push({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        isActive: r.isActive,
        matchOperator: op,
        filterRules: rules,
        createdById: r.createdBy,
        createdByName: r.authorName ?? "نامشخص",
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        estimatedCount,
      });
    }

    return {
      segments,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  async findSegmentById(id: string): Promise<CrmSegmentItem | null> {
    const [row] = await this.db
      .select({
        id: crmSegments.id,
        name: crmSegments.name,
        description: crmSegments.description,
        isActive: crmSegments.isActive,
        matchOperator: crmSegments.matchOperator,
        filterRules: crmSegments.filterRules,
        createdBy: crmSegments.createdBy,
        createdAt: crmSegments.createdAt,
        updatedAt: crmSegments.updatedAt,
        authorName: users.name,
      })
      .from(crmSegments)
      .leftJoin(users, eq(crmSegments.createdBy, users.id))
      .where(eq(crmSegments.id, id))
      .limit(1);

    if (!row) return null;

    const rules = (row.filterRules ?? []) as SegmentFilterRule[];
    const op = (row.matchOperator ?? "and") as SegmentMatchOperator;
    const estimatedCount = await this.previewSegmentCount(rules, op);

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      isActive: row.isActive,
      matchOperator: op,
      filterRules: rules,
      createdById: row.createdBy,
      createdByName: row.authorName ?? "نامشخص",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      estimatedCount,
    };
  }

  async createSegment(input: CreateCrmSegmentInput, createdById: string): Promise<CrmSegmentItem> {
    const [row] = await this.db
      .insert(crmSegments)
      .values({
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        matchOperator: input.matchOperator ?? "and",
        filterRules: input.filterRules,
        createdBy: createdById,
      })
      .returning();

    const [author] = await this.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, createdById))
      .limit(1);

    const rules = (row.filterRules ?? []) as SegmentFilterRule[];
    const op = (row.matchOperator ?? "and") as SegmentMatchOperator;
    const estimatedCount = await this.previewSegmentCount(rules, op);

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      isActive: row.isActive,
      matchOperator: op,
      filterRules: rules,
      createdById: row.createdBy,
      createdByName: author?.name ?? "نامشخص",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      estimatedCount,
    };
  }

  async updateSegment(id: string, input: UpdateCrmSegmentInput): Promise<CrmSegmentItem | null> {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.matchOperator !== undefined) updates.matchOperator = input.matchOperator;
    if (input.filterRules !== undefined) updates.filterRules = input.filterRules;

    const [row] = await this.db
      .update(crmSegments)
      .set(updates)
      .where(eq(crmSegments.id, id))
      .returning();

    if (!row) return null;

    const [author] = await this.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, row.createdBy))
      .limit(1);

    const rules = (row.filterRules ?? []) as SegmentFilterRule[];
    const op = (row.matchOperator ?? "and") as SegmentMatchOperator;
    const estimatedCount = await this.previewSegmentCount(rules, op);

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      isActive: row.isActive,
      matchOperator: op,
      filterRules: rules,
      createdById: row.createdBy,
      createdByName: author?.name ?? "نامشخص",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      estimatedCount,
    };
  }

  async deleteSegment(id: string): Promise<boolean> {
    const res = await this.db
      .delete(crmSegments)
      .where(eq(crmSegments.id, id))
      .returning({ id: crmSegments.id });
    return res.length > 0;
  }

  async previewSegmentCount(
    rules: SegmentFilterRule[],
    matchOperator: SegmentMatchOperator,
  ): Promise<number> {
    const whereClause = this.buildSegmentWhereClause(rules, matchOperator);
    const [res] = await this.db
      .select({ count: count() })
      .from(users)
      .where(whereClause);
    return Number(res?.count ?? 0);
  }

  async getSegmentMembers(params: GetSegmentMembersParams): Promise<ListCrmCustomersResponse> {
    const segment = await this.findSegmentById(params.segmentId);
    if (!segment) {
      return {
        customers: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
    }

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const whereClause = this.buildSegmentWhereClause(
      segment.filterRules,
      segment.matchOperator,
    );

    // Sorting
    const sortField = params.sortBy ?? "createdAt";
    const sortOrder = params.sortOrder === "asc" ? asc : desc;

    let orderByClause: SQL;
    switch (sortField) {
      case "name":
        orderByClause = sortOrder(users.name);
        break;
      case "totalSpent": {
        const spentSubquery = sql`(SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.user_id = ${users.id} AND p.status = 'paid' AND p.gateway != 'wallet')`;
        orderByClause = sortOrder(spentSubquery);
        break;
      }
      case "successfulOrdersCount": {
        const ordersSubquery = sql`(SELECT COUNT(o.id) FROM orders o WHERE o.user_id = ${users.id} AND o.status = 'paid')`;
        orderByClause = sortOrder(ordersSubquery);
        break;
      }
      case "createdAt":
      default:
        orderByClause = sortOrder(users.createdAt);
        break;
    }

    const countQuery = this.db.select({ total: count() }).from(users).where(whereClause);
    const usersQuery = this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phoneNumber: users.phoneNumber,
        createdAt: users.createdAt,
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(orderByClause, desc(users.id))
      .limit(pageSize)
      .offset(offset);

    const [countRes, userRows] = await Promise.all([countQuery, usersQuery]);
    const totalCount = Number(countRes[0]?.total ?? 0);

    if (userRows.length === 0) {
      return {
        customers: [],
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize) || 1,
      };
    }

    const userIds = userRows.map((u) => u.id);

    // Batch enrichments (exact same as listCustomers)
    const orderCountsPromise = this.db
      .select({
        userId: orders.userId,
        orderCount: count(orders.id),
      })
      .from(orders)
      .where(and(inArray(orders.userId, userIds), eq(orders.status, "paid")))
      .groupBy(orders.userId);

    const paymentSumsPromise = this.db
      .select({
        userId: payments.userId,
        totalPaid: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(
        and(
          inArray(payments.userId, userIds),
          eq(payments.status, "paid"),
          ne(payments.gateway, "wallet"),
        ),
      )
      .groupBy(payments.userId);

    const tagsPromise = this.db
      .select({
        userId: crmCustomerTags.userId,
        tagId: crmTags.id,
        tagName: crmTags.name,
        tagColor: crmTags.color,
      })
      .from(crmCustomerTags)
      .innerJoin(crmTags, eq(crmCustomerTags.tagId, crmTags.id))
      .where(inArray(crmCustomerTags.userId, userIds));

    const lastSessionPromise = this.db
      .select({
        userId: sessions.userId,
        lastUsedAt: sql<Date>`MAX(${sessions.lastUsedAt})`,
      })
      .from(sessions)
      .where(inArray(sessions.userId, userIds))
      .groupBy(sessions.userId);

    const lastDevicePromise = this.db
      .select({
        userId: userDevices.userId,
        lastSeenAt: sql<Date>`MAX(${userDevices.lastSeenAt})`,
      })
      .from(userDevices)
      .where(inArray(userDevices.userId, userIds))
      .groupBy(userDevices.userId);

    const lastStudyPromise = this.db
      .select({
        userId: studySessions.userId,
        lastActivityAt: sql<Date>`MAX(${studySessions.lastActivityAt})`,
      })
      .from(studySessions)
      .where(inArray(studySessions.userId, userIds))
      .groupBy(studySessions.userId);

    const [orderCounts, paymentSums, tagRows, lastSessions, lastDevices, lastStudies] =
      await Promise.all([
        orderCountsPromise,
        paymentSumsPromise,
        tagsPromise,
        lastSessionPromise,
        lastDevicePromise,
        lastStudyPromise,
      ]);

    const orderCountMap = new Map<string, number>();
    for (const r of orderCounts) orderCountMap.set(r.userId, Number(r.orderCount));

    const paymentSumMap = new Map<string, number>();
    for (const r of paymentSums) paymentSumMap.set(r.userId, Number(r.totalPaid));

    const tagsMap = new Map<string, Array<{ id: string; name: string; color: string }>>();
    for (const r of tagRows) {
      const list = tagsMap.get(r.userId) || [];
      list.push({ id: r.tagId, name: r.tagName, color: r.tagColor });
      tagsMap.set(r.userId, list);
    }

    const lastActiveMap = new Map<string, string | null>();
    for (const id of userIds) {
      const sessionDate = lastSessions.find((s) => s.userId === id)?.lastUsedAt;
      const deviceDate = lastDevices.find((d) => d.userId === id)?.lastSeenAt;
      const studyDate = lastStudies.find((st) => st.userId === id)?.lastActivityAt;

      const timestamps = [sessionDate, deviceDate, studyDate]
        .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()))
        .map((d) => d.getTime());

      if (timestamps.length > 0) {
        lastActiveMap.set(id, new Date(Math.max(...timestamps)).toISOString());
      } else {
        lastActiveMap.set(id, null);
      }
    }

    const customers: CrmCustomerListItem[] = userRows.map((u) => {
      const emailVerified = u.emailVerifiedAt != null;
      const phoneVerified = u.phoneVerifiedAt != null;
      return {
        id: u.id,
        name: u.name ?? "کاربر بدون نام",
        email: u.email,
        phoneNumber: u.phoneNumber ?? null,
        createdAt: u.createdAt.toISOString(),
        lastActiveAt: lastActiveMap.get(u.id) ?? null,
        isVerified: emailVerified || phoneVerified,
        emailVerified,
        phoneVerified,
        successfulOrdersCount: orderCountMap.get(u.id) ?? 0,
        totalPaidAmount: paymentSumMap.get(u.id) ?? 0,
        tags: tagsMap.get(u.id) ?? [],
      };
    });

    return {
      customers,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  // -------------------------------------------------------------------------
  // Campaigns (Phase 3)
  // -------------------------------------------------------------------------

  async getMatchingSegmentUserIds(segmentId: string): Promise<string[]> {
    const segment = await this.findSegmentById(segmentId);
    if (!segment || !segment.isActive) {
      return [];
    }
    const whereClause = this.buildSegmentWhereClause(
      segment.filterRules,
      segment.matchOperator,
    );
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(whereClause);
    return rows.map((r) => r.id);
  }

  async listCampaigns(params?: ListCrmCampaignsParams): Promise<ListCrmCampaignsResponse> {
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [];

    if (params?.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      conditions.push(or(ilike(crmCampaigns.name, term), ilike(crmCampaigns.description, term)));
    }

    if (params?.status) {
      conditions.push(eq(crmCampaigns.status, params.status));
    }

    if (params?.channel) {
      conditions.push(eq(crmCampaigns.channel, params.channel));
    }

    if (params?.targetSegmentId) {
      conditions.push(eq(crmCampaigns.targetSegmentId, params.targetSegmentId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRes] = await this.db
      .select({ count: count() })
      .from(crmCampaigns)
      .where(whereClause);
    const totalCount = Number(countRes?.count ?? 0);

    const rows = await this.db
      .select({
        id: crmCampaigns.id,
        name: crmCampaigns.name,
        description: crmCampaigns.description,
        targetSegmentId: crmCampaigns.targetSegmentId,
        channel: crmCampaigns.channel,
        status: crmCampaigns.status,
        messageContent: crmCampaigns.messageContent,
        scheduledAt: crmCampaigns.scheduledAt,
        createdBy: crmCampaigns.createdBy,
        createdAt: crmCampaigns.createdAt,
        updatedAt: crmCampaigns.updatedAt,
        segmentName: crmSegments.name,
        createdByName: users.name,
      })
      .from(crmCampaigns)
      .leftJoin(crmSegments, eq(crmCampaigns.targetSegmentId, crmSegments.id))
      .leftJoin(users, eq(crmCampaigns.createdBy, users.id))
      .where(whereClause)
      .orderBy(desc(crmCampaigns.createdAt))
      .limit(pageSize)
      .offset(offset);

    const campaigns: CrmCampaignItem[] = await Promise.all(
      rows.map(async (r) => {
        const lastExecution = await this.findLatestCampaignExecution(r.id);
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          targetSegmentId: r.targetSegmentId,
          targetSegmentName: r.segmentName ?? undefined,
          channel: r.channel as CampaignChannel,
          status: r.status as CampaignStatus,
          messageContent: r.messageContent,
          scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
          createdById: r.createdBy,
          createdByName: r.createdByName ?? undefined,
          lastExecution: lastExecution
            ? {
                id: lastExecution.id,
                status: lastExecution.status,
                totalRecipients: lastExecution.totalRecipients,
                processedRecipients: lastExecution.processedRecipients,
                successfulRecipients: lastExecution.successfulRecipients,
                failedRecipients: lastExecution.failedRecipients,
                startedAt: lastExecution.startedAt,
                completedAt: lastExecution.completedAt,
              }
            : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
    );

    return {
      campaigns,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  async findCampaignById(id: string): Promise<CrmCampaignItem | null> {
    const [row] = await this.db
      .select({
        id: crmCampaigns.id,
        name: crmCampaigns.name,
        description: crmCampaigns.description,
        targetSegmentId: crmCampaigns.targetSegmentId,
        channel: crmCampaigns.channel,
        status: crmCampaigns.status,
        messageContent: crmCampaigns.messageContent,
        scheduledAt: crmCampaigns.scheduledAt,
        createdBy: crmCampaigns.createdBy,
        createdAt: crmCampaigns.createdAt,
        updatedAt: crmCampaigns.updatedAt,
        segmentName: crmSegments.name,
        createdByName: users.name,
      })
      .from(crmCampaigns)
      .leftJoin(crmSegments, eq(crmCampaigns.targetSegmentId, crmSegments.id))
      .leftJoin(users, eq(crmCampaigns.createdBy, users.id))
      .where(eq(crmCampaigns.id, id))
      .limit(1);

    if (!row) return null;

    const lastExecution = await this.findLatestCampaignExecution(row.id);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      targetSegmentId: row.targetSegmentId,
      targetSegmentName: row.segmentName ?? undefined,
      channel: row.channel as CampaignChannel,
      status: row.status as CampaignStatus,
      messageContent: row.messageContent,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      createdById: row.createdBy,
      createdByName: row.createdByName ?? undefined,
      lastExecution: lastExecution
        ? {
            id: lastExecution.id,
            status: lastExecution.status,
            totalRecipients: lastExecution.totalRecipients,
            processedRecipients: lastExecution.processedRecipients,
            successfulRecipients: lastExecution.successfulRecipients,
            failedRecipients: lastExecution.failedRecipients,
            startedAt: lastExecution.startedAt,
            completedAt: lastExecution.completedAt,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createCampaign(
    input: CreateCrmCampaignInput,
    createdById: string,
  ): Promise<CrmCampaignItem> {
    const [inserted] = await this.db
      .insert(crmCampaigns)
      .values({
        name: input.name,
        description: input.description ?? null,
        targetSegmentId: input.targetSegmentId,
        channel: input.channel,
        status: "draft",
        messageContent: input.messageContent ?? null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdBy: createdById,
      })
      .returning();

    const campaign = await this.findCampaignById(inserted.id);
    return campaign!;
  }

  async updateCampaign(
    id: string,
    input: UpdateCrmCampaignInput,
  ): Promise<CrmCampaignItem | null> {
    const values: Partial<typeof crmCampaigns.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) values.name = input.name;
    if (input.description !== undefined) values.description = input.description;
    if (input.targetSegmentId !== undefined) values.targetSegmentId = input.targetSegmentId;
    if (input.channel !== undefined) values.channel = input.channel;
    if (input.messageContent !== undefined) values.messageContent = input.messageContent;
    if (input.scheduledAt !== undefined) {
      values.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    }
    if (input.status !== undefined) values.status = input.status;

    const [updated] = await this.db
      .update(crmCampaigns)
      .set(values)
      .where(eq(crmCampaigns.id, id))
      .returning();

    if (!updated) return null;
    return this.findCampaignById(updated.id);
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await this.db.delete(crmCampaigns).where(eq(crmCampaigns.id, id)).returning();
    return result.length > 0;
  }

  async createCampaignExecution(
    campaignId: string,
    triggeredById: string,
    totalRecipients: number,
    status: CampaignExecutionStatus = "running",
  ): Promise<CrmCampaignExecutionItem> {
    const [inserted] = await this.db
      .insert(crmCampaignExecutions)
      .values({
        campaignId,
        status,
        totalRecipients,
        processedRecipients: 0,
        successfulRecipients: 0,
        failedRecipients: 0,
        startedAt: new Date(),
        triggeredBy: triggeredById,
      })
      .returning();

    return {
      id: inserted.id,
      campaignId: inserted.campaignId,
      status: inserted.status as CampaignExecutionStatus,
      totalRecipients: inserted.totalRecipients,
      processedRecipients: inserted.processedRecipients,
      successfulRecipients: inserted.successfulRecipients,
      failedRecipients: inserted.failedRecipients,
      startedAt: inserted.startedAt.toISOString(),
      completedAt: inserted.completedAt ? inserted.completedAt.toISOString() : null,
      triggeredById: inserted.triggeredBy,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };
  }

  async updateCampaignExecution(
    executionId: string,
    updates: Partial<{
      status: CampaignExecutionStatus;
      processedRecipients: number;
      successfulRecipients: number;
      failedRecipients: number;
      completedAt: string | null;
    }>,
  ): Promise<CrmCampaignExecutionItem | null> {
    const values: Partial<typeof crmCampaignExecutions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (updates.status !== undefined) values.status = updates.status;
    if (updates.processedRecipients !== undefined) values.processedRecipients = updates.processedRecipients;
    if (updates.successfulRecipients !== undefined) values.successfulRecipients = updates.successfulRecipients;
    if (updates.failedRecipients !== undefined) values.failedRecipients = updates.failedRecipients;
    if (updates.completedAt !== undefined) {
      values.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
    }

    const [updated] = await this.db
      .update(crmCampaignExecutions)
      .set(values)
      .where(eq(crmCampaignExecutions.id, executionId))
      .returning();

    if (!updated) return null;

    return {
      id: updated.id,
      campaignId: updated.campaignId,
      status: updated.status as CampaignExecutionStatus,
      totalRecipients: updated.totalRecipients,
      processedRecipients: updated.processedRecipients,
      successfulRecipients: updated.successfulRecipients,
      failedRecipients: updated.failedRecipients,
      startedAt: updated.startedAt.toISOString(),
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      triggeredById: updated.triggeredBy,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async findLatestCampaignExecution(campaignId: string): Promise<CrmCampaignExecutionItem | null> {
    const [row] = await this.db
      .select()
      .from(crmCampaignExecutions)
      .where(eq(crmCampaignExecutions.campaignId, campaignId))
      .orderBy(desc(crmCampaignExecutions.createdAt))
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      campaignId: row.campaignId,
      status: row.status as CampaignExecutionStatus,
      totalRecipients: row.totalRecipients,
      processedRecipients: row.processedRecipients,
      successfulRecipients: row.successfulRecipients,
      failedRecipients: row.failedRecipients,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      triggeredById: row.triggeredBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listCampaignExecutions(campaignId: string): Promise<CrmCampaignExecutionItem[]> {
    const rows = await this.db
      .select({
        id: crmCampaignExecutions.id,
        campaignId: crmCampaignExecutions.campaignId,
        status: crmCampaignExecutions.status,
        totalRecipients: crmCampaignExecutions.totalRecipients,
        processedRecipients: crmCampaignExecutions.processedRecipients,
        successfulRecipients: crmCampaignExecutions.successfulRecipients,
        failedRecipients: crmCampaignExecutions.failedRecipients,
        startedAt: crmCampaignExecutions.startedAt,
        completedAt: crmCampaignExecutions.completedAt,
        triggeredBy: crmCampaignExecutions.triggeredBy,
        createdAt: crmCampaignExecutions.createdAt,
        updatedAt: crmCampaignExecutions.updatedAt,
        triggeredByName: users.name,
      })
      .from(crmCampaignExecutions)
      .leftJoin(users, eq(crmCampaignExecutions.triggeredBy, users.id))
      .where(eq(crmCampaignExecutions.campaignId, campaignId))
      .orderBy(desc(crmCampaignExecutions.createdAt));

    return rows.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      status: r.status as CampaignExecutionStatus,
      totalRecipients: r.totalRecipients,
      processedRecipients: r.processedRecipients,
      successfulRecipients: r.successfulRecipients,
      failedRecipients: r.failedRecipients,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      triggeredById: r.triggeredBy,
      triggeredByName: r.triggeredByName ?? undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async batchCreateCampaignRecipients(
    recipients: Array<{
      campaignId: string;
      executionId: string;
      userId: string;
      channel: CampaignChannel;
      status: CampaignRecipientStatus;
      errorMessage?: string | null;
      sentAt?: string | null;
    }>,
  ): Promise<number> {
    if (recipients.length === 0) return 0;
    const chunkSize = 500;
    let insertedCount = 0;
    for (let i = 0; i < recipients.length; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);
      const res = await this.db
        .insert(crmCampaignRecipients)
        .values(
          chunk.map((c) => ({
            campaignId: c.campaignId,
            executionId: c.executionId,
            userId: c.userId,
            channel: c.channel,
            status: c.status,
            errorMessage: c.errorMessage ?? null,
            sentAt: c.sentAt ? new Date(c.sentAt) : null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: crmCampaignRecipients.id });
      insertedCount += res.length;
    }
    return insertedCount;
  }

  async listCampaignRecipients(
    executionId: string,
    params?: ListCrmCampaignRecipientsParams,
  ): Promise<ListCrmCampaignRecipientsResponse> {
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [
      eq(crmCampaignRecipients.executionId, executionId),
    ];
    if (params?.status) {
      conditions.push(eq(crmCampaignRecipients.status, params.status));
    }
    const whereClause = and(...conditions);

    const [countRes] = await this.db
      .select({ count: count() })
      .from(crmCampaignRecipients)
      .where(whereClause);
    const totalCount = Number(countRes?.count ?? 0);

    const rows = await this.db
      .select({
        id: crmCampaignRecipients.id,
        campaignId: crmCampaignRecipients.campaignId,
        executionId: crmCampaignRecipients.executionId,
        userId: crmCampaignRecipients.userId,
        channel: crmCampaignRecipients.channel,
        status: crmCampaignRecipients.status,
        attempts: crmCampaignRecipients.attempts,
        lastAttemptAt: crmCampaignRecipients.lastAttemptAt,
        errorCode: crmCampaignRecipients.errorCode,
        errorMessage: crmCampaignRecipients.errorMessage,
        sentAt: crmCampaignRecipients.sentAt,
        createdAt: crmCampaignRecipients.createdAt,
        userName: users.name,
        userEmail: users.email,
        userPhoneNumber: users.phoneNumber,
      })
      .from(crmCampaignRecipients)
      .leftJoin(users, eq(crmCampaignRecipients.userId, users.id))
      .where(whereClause)
      .orderBy(asc(crmCampaignRecipients.createdAt))
      .limit(pageSize)
      .offset(offset);

    const recipients: CrmCampaignRecipientItem[] = rows.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      executionId: r.executionId,
      userId: r.userId,
      userName: r.userName ?? "کاربر بدون نام",
      userEmail: r.userEmail,
      userPhoneNumber: r.userPhoneNumber ?? null,
      channel: r.channel as CampaignChannel,
      status: r.status as CampaignRecipientStatus,
      attempts: r.attempts ?? 0,
      lastAttemptAt: r.lastAttemptAt ? r.lastAttemptAt.toISOString() : null,
      errorCode: r.errorCode ?? null,
      errorMessage: r.errorMessage ?? null,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      recipients,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  async findExecutionById(executionId: string): Promise<CrmCampaignExecutionItem | null> {
    const [row] = await this.db
      .select({
        id: crmCampaignExecutions.id,
        campaignId: crmCampaignExecutions.campaignId,
        jobId: crmCampaignExecutions.jobId,
        status: crmCampaignExecutions.status,
        totalRecipients: crmCampaignExecutions.totalRecipients,
        processedRecipients: crmCampaignExecutions.processedRecipients,
        successfulRecipients: crmCampaignExecutions.successfulRecipients,
        failedRecipients: crmCampaignExecutions.failedRecipients,
        startedAt: crmCampaignExecutions.startedAt,
        completedAt: crmCampaignExecutions.completedAt,
        triggeredBy: crmCampaignExecutions.triggeredBy,
        createdAt: crmCampaignExecutions.createdAt,
        updatedAt: crmCampaignExecutions.updatedAt,
        triggeredByName: users.name,
      })
      .from(crmCampaignExecutions)
      .leftJoin(users, eq(crmCampaignExecutions.triggeredBy, users.id))
      .where(eq(crmCampaignExecutions.id, executionId))
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      campaignId: row.campaignId,
      jobId: row.jobId ?? null,
      status: row.status as CampaignExecutionStatus,
      totalRecipients: row.totalRecipients,
      processedRecipients: row.processedRecipients,
      successfulRecipients: row.successfulRecipients,
      failedRecipients: row.failedRecipients,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      triggeredById: row.triggeredBy,
      triggeredByName: row.triggeredByName ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async claimPendingRecipients(
    executionId: string,
    limit: number,
    excludeIds?: string[],
  ): Promise<CrmCampaignRecipientItem[]> {
    const excludeFilter =
      excludeIds && excludeIds.length > 0
        ? sql`AND NOT (id = ANY(${excludeIds}::uuid[]))`
        : sql``;

    // Atomic claiming with FOR UPDATE SKIP LOCKED
    const claimedRows = await this.db.execute(sql`
      WITH claimed AS (
        SELECT id
        FROM crm_campaign_recipients
        WHERE execution_id = ${executionId}::uuid
          AND (status = 'pending' OR status = 'queued')
          ${excludeFilter}
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE crm_campaign_recipients r
      SET status = 'processing',
          last_attempt_at = now()
      FROM claimed
      WHERE r.id = claimed.id
      RETURNING r.id, r.campaign_id, r.execution_id, r.user_id, r.channel, r.status, r.attempts, r.last_attempt_at, r.error_code, r.error_message, r.sent_at, r.created_at;
    `);

    const rawRows = (claimedRows as any).rows ?? claimedRows;
    const rows = Array.isArray(rawRows) ? rawRows : [];
    if (rows.length === 0) return [];

    const userIds = rows.map((r: any) => r.user_id).filter(Boolean);
    const userMap = new Map<string, { name: string | null; email: string | null; phoneNumber: string | null }>();
    if (userIds.length > 0) {
      const usersList = await this.db
        .select({ id: users.id, name: users.name, email: users.email, phoneNumber: users.phoneNumber })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const u of usersList) {
        userMap.set(u.id, { name: u.name, email: u.email, phoneNumber: u.phoneNumber });
      }
    }

    return rows.map((r: any) => {
      const u = userMap.get(r.user_id);
      return {
        id: r.id,
        campaignId: r.campaign_id,
        executionId: r.execution_id,
        userId: r.user_id,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
        userPhoneNumber: u?.phoneNumber ?? null,
        channel: r.channel as CampaignChannel,
        status: r.status as CampaignRecipientStatus,
        attempts: Number(r.attempts ?? 0),
        lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at).toISOString() : null,
        errorCode: r.error_code ?? null,
        errorMessage: r.error_message ?? null,
        sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  async updateCampaignRecipientStatus(
    recipientId: string,
    data: {
      status: CampaignRecipientStatus;
      errorMessage?: string | null;
      errorCode?: string | null;
      sentAt?: string | null;
      attempts?: number;
      lastAttemptAt?: string | null;
    },
  ): Promise<void> {
    const values: Partial<typeof crmCampaignRecipients.$inferInsert> = {};
    if (data.status !== undefined) values.status = data.status;
    if (data.errorMessage !== undefined) values.errorMessage = data.errorMessage;
    if (data.errorCode !== undefined) values.errorCode = data.errorCode;
    if (data.sentAt !== undefined) values.sentAt = data.sentAt ? new Date(data.sentAt) : null;
    if (data.attempts !== undefined) values.attempts = data.attempts;
    if (data.lastAttemptAt !== undefined) {
      values.lastAttemptAt = data.lastAttemptAt ? new Date(data.lastAttemptAt) : null;
    }

    await this.db
      .update(crmCampaignRecipients)
      .set(values)
      .where(eq(crmCampaignRecipients.id, recipientId));
  }

  async batchSkipRecipients(
    executionId: string,
    reason: string,
    errorCode: string,
  ): Promise<number> {
    const res = await this.db
      .update(crmCampaignRecipients)
      .set({
        status: "skipped",
        errorMessage: reason,
        errorCode,
        lastAttemptAt: new Date(),
      })
      .where(
        and(
          eq(crmCampaignRecipients.executionId, executionId),
          or(
            eq(crmCampaignRecipients.status, "pending"),
            eq(crmCampaignRecipients.status, "queued"),
            eq(crmCampaignRecipients.status, "processing"),
          ),
        ),
      )
      .returning({ id: crmCampaignRecipients.id });

    return res.length;
  }

  async getExecutionCounts(
    executionId: string,
  ): Promise<{ total: number; processed: number; successful: number; failed: number; pending: number }> {
    const rows = await this.db
      .select({
        status: crmCampaignRecipients.status,
        count: count(),
      })
      .from(crmCampaignRecipients)
      .where(eq(crmCampaignRecipients.executionId, executionId))
      .groupBy(crmCampaignRecipients.status);

    let total = 0;
    let successful = 0;
    let failed = 0;
    let pending = 0;
    let processing = 0;
    let skipped = 0;

    for (const r of rows) {
      const c = Number(r.count ?? 0);
      total += c;
      if (r.status === "sent" || r.status === "delivered") successful += c;
      else if (r.status === "failed") failed += c;
      else if (r.status === "pending" || r.status === "queued") pending += c;
      else if (r.status === "processing") processing += c;
      else if (r.status === "skipped") skipped += c;
    }

    const processed = successful + failed + skipped;
    return {
      total,
      processed,
      successful,
      failed: failed + skipped,
      pending: pending + processing,
    };
  }

  async getUserContact(
    userId: string,
  ): Promise<{ email: string | null; phoneNumber: string | null; name: string | null } | null> {
    const [u] = await this.db
      .select({
        email: users.email,
        phoneNumber: users.phoneNumber,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!u) return null;
    return {
      email: u.email ?? null,
      phoneNumber: u.phoneNumber ?? null,
      name: u.name ?? null,
    };
  }
}

// ---------------------------------------------------------------------------
// In-Memory Implementation for Tests
// ---------------------------------------------------------------------------

export class InMemoryCrmStore implements CrmStore {
  public memoryUsers: Array<{
    id: string;
    name?: string;
    email: string;
    phoneNumber?: string | null;
    createdAt: string;
    deletedAt?: string | null;
    emailVerifiedAt?: string | null;
    phoneVerifiedAt?: string | null;
    globalRole?: string;
    major?: string | null;
    university?: string | null;
    faculty?: string | null;
    department?: string | null;
    teacherStatus?: string;
  }> = [];

  public memoryPayments: Array<{
    id: string;
    userId: string;
    orderId: string;
    amount: number;
    gateway?: string;
    status: string;
    paidAt?: string | null;
  }> = [];

  public memoryOrders: Array<{
    id: string;
    userId: string;
    status: string;
  }> = [];

  public memoryWallets: Map<string, number> = new Map();

  public memoryWalletTransactions: Array<{
    id: string;
    userId: string;
    type: string;
    source: string;
    amount: number;
  }> = [];

  public memoryTags: Array<CrmTagItem> = [];
  public memoryCustomerTags: Array<{ userId: string; tagId: string; assignedBy?: string }> = [];
  public memoryNotes: Array<CrmCustomerNoteItem> = [];
  public memorySessions: Array<{ userId: string; lastUsedAt: string }> = [];
  public memoryDevices: Array<{ userId: string; lastSeenAt: string; revokedAt?: string | null }> = [];
  public memoryStudySessions: Array<{ userId: string; startedAt?: string; lastActivityAt: string; durationSeconds: number }> = [];
  public memorySegments: Array<CrmSegmentItem> = [];
  public memoryQuizzes: Array<{ id: string; userId: string; status: string; completedAt?: string }> = [];
  public memoryCourseMemberships: Array<{ id: string; userId: string; role: string }> = [];
  public memoryDocuments: Array<{ id: string; ownerUserId: string; deletedAt?: string | null }> = [];
  public memoryGeneratedContents: Array<{ id: string; documentId: string; deletedAt?: string | null }> = [];
  public memoryCampaigns: Array<{
    id: string;
    name: string;
    description: string | null;
    targetSegmentId: string;
    channel: CampaignChannel;
    status: CampaignStatus;
    messageContent: string | null;
    scheduledAt: string | null;
    createdById: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
  public memoryExecutions: Array<{
    id: string;
    campaignId: string;
    jobId?: string | null;
    status: CampaignExecutionStatus;
    totalRecipients: number;
    processedRecipients: number;
    successfulRecipients: number;
    failedRecipients: number;
    startedAt: string;
    completedAt: string | null;
    triggeredById: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
  public memoryRecipients: Array<{
    id: string;
    campaignId: string;
    executionId: string;
    userId: string;
    channel: CampaignChannel;
    status: CampaignRecipientStatus;
    attempts?: number;
    lastAttemptAt?: string | null;
    errorCode?: string | null;
    errorMessage: string | null;
    sentAt: string | null;
    createdAt: string;
  }> = [];

  async listCustomers(params: ListCrmCustomersParams): Promise<ListCrmCustomersResponse> {
    const isExternalPaid = (p: { status: string; gateway?: string }) =>
      p.status === "paid" && p.gateway !== "wallet";

    let list = this.memoryUsers.filter((u) => !u.deletedAt);

    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          (u.name && u.name.toLowerCase().includes(q)) ||
          u.email.toLowerCase().includes(q) ||
          (u.phoneNumber && u.phoneNumber.includes(q)),
      );
    }

    if (params.verifiedStatus === "verified") {
      list = list.filter((u) => u.emailVerifiedAt || u.phoneVerifiedAt);
    } else if (params.verifiedStatus === "unverified") {
      list = list.filter((u) => !u.emailVerifiedAt && !u.phoneVerifiedAt);
    }

    if (params.createdAfter) {
      const d = new Date(params.createdAfter).getTime();
      list = list.filter((u) => new Date(u.createdAt).getTime() >= d);
    }
    if (params.createdBefore) {
      const d = new Date(params.createdBefore).getTime();
      list = list.filter((u) => new Date(u.createdAt).getTime() <= d);
    }

    if (params.tagId) {
      const taggedUserIds = new Set(
        this.memoryCustomerTags.filter((ct) => ct.tagId === params.tagId).map((ct) => ct.userId),
      );
      list = list.filter((u) => taggedUserIds.has(u.id));
    }

    if (params.hasPurchases === "true") {
      const payingUserIds = new Set(
        this.memoryPayments.filter(isExternalPaid).map((p) => p.userId),
      );
      list = list.filter((u) => payingUserIds.has(u.id));
    } else if (params.hasPurchases === "false") {
      const payingUserIds = new Set(
        this.memoryPayments.filter(isExternalPaid).map((p) => p.userId),
      );
      list = list.filter((u) => !payingUserIds.has(u.id));
    }

    if (typeof params.minSpent === "number") {
      list = list.filter((u) => {
        const spent = this.memoryPayments
          .filter((p) => p.userId === u.id && isExternalPaid(p))
          .reduce((acc, curr) => acc + curr.amount, 0);
        return spent >= params.minSpent!;
      });
    }

    if (typeof params.maxSpent === "number") {
      list = list.filter((u) => {
        const spent = this.memoryPayments
          .filter((p) => p.userId === u.id && isExternalPaid(p))
          .reduce((acc, curr) => acc + curr.amount, 0);
        return spent <= params.maxSpent!;
      });
    }

    // Sort
    const sortField = params.sortBy ?? "createdAt";
    const sortAsc = params.sortOrder === "asc";
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = (a.name ?? "").localeCompare(b.name ?? "");
      } else if (sortField === "totalSpent") {
        const spentA = this.memoryPayments
          .filter((p) => p.userId === a.id && isExternalPaid(p))
          .reduce((acc, curr) => acc + curr.amount, 0);
        const spentB = this.memoryPayments
          .filter((p) => p.userId === b.id && isExternalPaid(p))
          .reduce((acc, curr) => acc + curr.amount, 0);
        comparison = spentA - spentB;
      } else if (sortField === "successfulOrdersCount") {
        const ordersA = this.memoryOrders.filter((o) => o.userId === a.id && o.status === "paid").length;
        const ordersB = this.memoryOrders.filter((o) => o.userId === b.id && o.status === "paid").length;
        comparison = ordersA - ordersB;
      } else {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (comparison !== 0) {
        return sortAsc ? comparison : -comparison;
      }
      return b.id.localeCompare(a.id); // Deterministic tie-breaker
    });

    const totalCount = list.length;
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const offset = (page - 1) * pageSize;
    const sliced = list.slice(offset, offset + pageSize);

    const customers: CrmCustomerListItem[] = sliced.map((u) => {
      const paidPayments = this.memoryPayments.filter((p) => p.userId === u.id && isExternalPaid(p));
      const successfulOrders = this.memoryOrders.filter((o) => o.userId === u.id && o.status === "paid");
      const totalPaid = paidPayments.reduce((acc, curr) => acc + curr.amount, 0);

      const assignedTagIds = new Set(
        this.memoryCustomerTags.filter((ct) => ct.userId === u.id).map((ct) => ct.tagId),
      );
      const userTags = this.memoryTags
        .filter((t) => assignedTagIds.has(t.id))
        .map((t) => ({ id: t.id, name: t.name, color: t.color }));

      // Last activity
      const sDates = this.memorySessions.filter((s) => s.userId === u.id).map((s) => new Date(s.lastUsedAt).getTime());
      const dDates = this.memoryDevices.filter((d) => d.userId === u.id).map((d) => new Date(d.lastSeenAt).getTime());
      const stDates = this.memoryStudySessions.filter((st) => st.userId === u.id).map((st) => new Date(st.lastActivityAt).getTime());
      const allTimes = [...sDates, ...dDates, ...stDates];
      const lastActiveAt = allTimes.length > 0 ? new Date(Math.max(...allTimes)).toISOString() : null;

      const emailVerified = !!u.emailVerifiedAt;
      const phoneVerified = !!u.phoneVerifiedAt;

      return {
        id: u.id,
        name: u.name ?? "کاربر بدون نام",
        email: u.email,
        phoneNumber: u.phoneNumber ?? null,
        createdAt: u.createdAt,
        lastActiveAt,
        isVerified: emailVerified || phoneVerified,
        emailVerified,
        phoneVerified,
        successfulOrdersCount: successfulOrders.length,
        totalPaidAmount: totalPaid,
        tags: userTags,
      };
    });

    return {
      customers,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  async getCustomer360(userId: string): Promise<CrmCustomer360Profile | null> {
    const user = this.memoryUsers.find((u) => u.id === userId);
    if (!user) return null;

    const isExternalPaid = (p: { status: string; gateway?: string }) =>
      p.status === "paid" && p.gateway !== "wallet";
    const paidPayments = this.memoryPayments.filter((p) => p.userId === userId && isExternalPaid(p));
    const totalPaid = paidPayments.reduce((acc, curr) => acc + curr.amount, 0);
    const successfulOrders = this.memoryOrders.filter((o) => o.userId === userId && o.status === "paid");

    const dates = paidPayments
      .map((p) => (p.paidAt ? new Date(p.paidAt).getTime() : 0))
      .filter((t) => t > 0);
    const lastPaymentDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;

    let totalWalletTopups = 0;
    let totalAiConsumption = 0;
    let totalSpecialExamConsumption = 0;
    let totalGiftCredits = 0;
    let refundsCount = 0;
    let totalRefunds = 0;

    for (const tx of this.memoryWalletTransactions.filter((t) => t.userId === userId)) {
      if (tx.type === "credit") {
        if (tx.source === "wallet_topup") totalWalletTopups += tx.amount;
        else if (
          tx.source === "welcome_gift" ||
          tx.source === "referral_reward" ||
          tx.source === "subscription_bonus" ||
          tx.source === "promotion_cashback"
        ) {
          totalGiftCredits += tx.amount;
        }
      } else if (tx.type === "debit") {
        if (tx.source === "content_generation") totalAiConsumption += tx.amount;
        else if (tx.source === "special_exam_purchase") totalSpecialExamConsumption += tx.amount;
      } else if (tx.type === "refund") {
        totalRefunds += tx.amount;
        refundsCount++;
      }
    }

    const sDates = this.memorySessions.filter((s) => s.userId === userId).map((s) => new Date(s.lastUsedAt).getTime());
    const dDates = this.memoryDevices.filter((d) => d.userId === userId).map((d) => new Date(d.lastSeenAt).getTime());
    const stDates = this.memoryStudySessions.filter((st) => st.userId === userId).map((st) => new Date(st.lastActivityAt).getTime());
    const allTimes = [...sDates, ...dDates, ...stDates];
    const lastActiveAt = allTimes.length > 0 ? new Date(Math.max(...allTimes)).toISOString() : null;

    const tags = await this.getCustomerTags(userId);
    const notes = await this.listCustomerNotes(userId);

    const emailVerified = !!user.emailVerifiedAt;
    const phoneVerified = !!user.phoneVerifiedAt;

    const totalStudyTime = this.memoryStudySessions
      .filter((s) => s.userId === userId)
      .reduce((acc, curr) => acc + curr.durationSeconds, 0);

    return {
      identity: {
        id: user.id,
        name: user.name ?? "کاربر بدون نام",
        email: user.email,
        phoneNumber: user.phoneNumber ?? null,
        createdAt: user.createdAt,
        deletedAt: user.deletedAt ?? null,
        isVerified: emailVerified || phoneVerified,
        emailVerified,
        phoneVerified,
        role: user.globalRole ?? Roles.student,
        teacherStatus: user.teacherStatus ?? "approved",
        major: user.major ?? null,
        university: user.university ?? null,
        faculty: user.faculty ?? null,
        department: user.department ?? null,
        lastActiveAt,
        activeDevicesCount: this.memoryDevices.filter((d) => d.userId === userId && !d.revokedAt).length,
      },
      financial: {
        successfulOrdersCount: successfulOrders.length,
        totalPaidAmount: totalPaid,
        lastPaymentDate,
        walletBalance: this.memoryWallets.get(userId) ?? 0,
        totalWalletTopups,
        totalAiConsumption,
        totalSpecialExamConsumption,
        totalGiftCredits,
        refundsCount,
        totalRefunds,
        activeSubscription: null,
      },
      education: {
        enrolledCoursesCount: 0,
        ownedCoursesCount: 0,
        uploadedDocumentsCount: 0,
        aiGeneratedContentsCount: 0,
        quizzesAttemptedCount: 0,
        averageQuizScore: null,
        totalStudyTimeSeconds: totalStudyTime,
        lastEducationalActivityAt: stDates.length > 0 ? new Date(Math.max(...stDates)).toISOString() : null,
      },
      tags,
      notes,
    };
  }

  async listTags(): Promise<CrmTagItem[]> {
    return [...this.memoryTags].sort((a, b) => a.name.localeCompare(b.name));
  }

  async findTagByName(name: string): Promise<CrmTagItem | null> {
    const q = name.trim().toLowerCase();
    const found = this.memoryTags.find((t) => t.name.toLowerCase() === q);
    return found ? { ...found } : null;
  }

  async findTagById(id: string): Promise<CrmTagItem | null> {
    const found = this.memoryTags.find((t) => t.id === id);
    return found ? { ...found } : null;
  }

  async createTag(input: CreateCrmTagInput): Promise<CrmTagItem> {
    const item: CrmTagItem = {
      id: randomUUID(),
      name: input.name.trim(),
      color: input.color?.trim() || "#3b82f6",
      description: input.description?.trim() || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.memoryTags.push(item);
    return item;
  }

  async updateTag(id: string, input: UpdateCrmTagInput): Promise<CrmTagItem | null> {
    const tag = this.memoryTags.find((t) => t.id === id);
    if (!tag) return null;
    if (input.name !== undefined) tag.name = input.name.trim();
    if (input.color !== undefined) tag.color = input.color.trim();
    if (input.description !== undefined) tag.description = input.description?.trim() || null;
    tag.updatedAt = new Date().toISOString();
    return { ...tag };
  }

  async deleteTag(id: string): Promise<boolean> {
    const idx = this.memoryTags.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.memoryTags.splice(idx, 1);
    this.memoryCustomerTags = this.memoryCustomerTags.filter((ct) => ct.tagId !== id);
    return true;
  }

  async assignTag(userId: string, tagId: string, assignedBy?: string): Promise<boolean> {
    const exists = this.memoryCustomerTags.some((ct) => ct.userId === userId && ct.tagId === tagId);
    if (exists) return false;
    this.memoryCustomerTags.push({ userId, tagId, assignedBy });
    return true;
  }

  async removeTag(userId: string, tagId: string): Promise<boolean> {
    const idx = this.memoryCustomerTags.findIndex((ct) => ct.userId === userId && ct.tagId === tagId);
    if (idx === -1) return false;
    this.memoryCustomerTags.splice(idx, 1);
    return true;
  }

  async getCustomerTags(userId: string): Promise<CrmTagItem[]> {
    const tagIds = new Set(
      this.memoryCustomerTags.filter((ct) => ct.userId === userId).map((ct) => ct.tagId),
    );
    return this.memoryTags.filter((t) => tagIds.has(t.id));
  }

  async listCustomerNotes(userId: string): Promise<CrmCustomerNoteItem[]> {
    return this.memoryNotes
      .filter((n) => n.userId === userId)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }

  async findNoteById(noteId: string): Promise<CrmCustomerNoteItem | null> {
    const n = this.memoryNotes.find((x) => x.id === noteId);
    return n ? { ...n } : null;
  }

  async createCustomerNote(
    userId: string,
    authorId: string,
    input: CreateCrmCustomerNoteInput,
  ): Promise<CrmCustomerNoteItem> {
    const author = this.memoryUsers.find((u) => u.id === authorId);
    const item: CrmCustomerNoteItem = {
      id: randomUUID(),
      userId,
      authorId,
      authorName: author?.name ?? "نامشخص",
      authorEmail: author?.email ?? "",
      content: input.content.trim(),
      isPinned: input.isPinned ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.memoryNotes.push(item);
    return item;
  }

  async updateCustomerNote(
    noteId: string,
    input: UpdateCrmCustomerNoteInput,
  ): Promise<CrmCustomerNoteItem | null> {
    const note = this.memoryNotes.find((n) => n.id === noteId);
    if (!note) return null;
    if (input.content !== undefined) note.content = input.content.trim();
    if (input.isPinned !== undefined) note.isPinned = input.isPinned;
    note.updatedAt = new Date().toISOString();
    return { ...note };
  }

  async deleteCustomerNote(noteId: string): Promise<boolean> {
    const idx = this.memoryNotes.findIndex((n) => n.id === noteId);
    if (idx === -1) return false;
    this.memoryNotes.splice(idx, 1);
    return true;
  }

  // -------------------------------------------------------------------------
  // Segments (Phase 2)
  // -------------------------------------------------------------------------

  private evaluateInMemoryRule(
    u: (typeof this.memoryUsers)[0],
    rule: SegmentFilterRule,
  ): boolean {
    switch (rule.field) {
      // 1. User
      case "user.createdAt": {
        const uTime = new Date(u.createdAt).getTime();
        if (rule.operator === "equals") return uTime === new Date(rule.value as string).getTime();
        if (rule.operator === "not_equals") return uTime !== new Date(rule.value as string).getTime();
        if (rule.operator === "greater_than") return uTime > new Date(rule.value as string).getTime();
        if (rule.operator === "greater_than_or_equal") return uTime >= new Date(rule.value as string).getTime();
        if (rule.operator === "less_than") return uTime < new Date(rule.value as string).getTime();
        if (rule.operator === "less_than_or_equal") return uTime <= new Date(rule.value as string).getTime();
        if (rule.operator === "between") {
          const [d1, d2] = rule.value as [string, string];
          return uTime >= new Date(d1).getTime() && uTime <= new Date(d2).getTime();
        }
        if (rule.operator === "days_ago_greater_than") {
          return uTime <= Date.now() - (rule.value as number) * 86400000;
        }
        if (rule.operator === "days_ago_less_than") {
          return uTime >= Date.now() - (rule.value as number) * 86400000;
        }
        return false;
      }
      case "user.emailVerified": {
        const hasVerified = Boolean(u.emailVerifiedAt);
        const wantsTrue = rule.operator === "is_true" || (rule.operator === "equals" && rule.value !== false);
        return wantsTrue ? hasVerified : !hasVerified;
      }
      case "user.phoneVerified": {
        const hasVerified = Boolean(u.phoneVerifiedAt);
        const wantsTrue = rule.operator === "is_true" || (rule.operator === "equals" && rule.value !== false);
        return wantsTrue ? hasVerified : !hasVerified;
      }
      case "user.isVerified": {
        const hasVerified = Boolean(u.emailVerifiedAt || u.phoneVerifiedAt);
        const wantsTrue = rule.operator === "is_true" || (rule.operator === "equals" && rule.value !== false);
        return wantsTrue ? hasVerified : !hasVerified;
      }
      case "user.major": {
        const major = u.major ?? null;
        if (rule.operator === "equals") return major === rule.value;
        if (rule.operator === "not_equals") return major !== rule.value;
        if (rule.operator === "in") return Array.isArray(rule.value) && (rule.value as unknown[]).includes(major);
        if (rule.operator === "not_in") return Array.isArray(rule.value) && !(rule.value as unknown[]).includes(major);
        return false;
      }

      // 2. CRM Tag
      case "crm.tag": {
        const userTags = this.memoryCustomerTags.filter((ct) => ct.userId === u.id);
        const userTagIdentifiers = new Set<string>();
        for (const ct of userTags) {
          userTagIdentifiers.add(ct.tagId);
          const tObj = this.memoryTags.find((t) => t.id === ct.tagId);
          if (tObj) userTagIdentifiers.add(tObj.name);
        }
        if (rule.operator === "equals") return userTagIdentifiers.has(rule.value as string);
        if (rule.operator === "not_equals") return !userTagIdentifiers.has(rule.value as string);
        if (rule.operator === "in") {
          const vals = rule.value as string[];
          return vals.some((t) => userTagIdentifiers.has(t));
        }
        if (rule.operator === "not_in") {
          const vals = rule.value as string[];
          return !vals.some((t) => userTagIdentifiers.has(t));
        }
        return false;
      }

      // 3. Payments & Orders (Cash Only)
      case "payment.hasCashPurchase": {
        const hasCash = this.memoryPayments.some(
          (p) => p.userId === u.id && p.status === "paid" && p.gateway !== "wallet",
        );
        const wantsTrue = rule.operator === "is_true" || (rule.operator === "equals" && rule.value !== false);
        return wantsTrue ? hasCash : !hasCash;
      }
      case "payment.totalCashSpent": {
        const totalCash = this.memoryPayments
          .filter((p) => p.userId === u.id && p.status === "paid" && p.gateway !== "wallet")
          .reduce((sum, p) => sum + p.amount, 0);

        if (rule.operator === "equals") return totalCash === rule.value;
        if (rule.operator === "not_equals") return totalCash !== rule.value;
        if (rule.operator === "greater_than") return totalCash > (rule.value as number);
        if (rule.operator === "greater_than_or_equal") return totalCash >= (rule.value as number);
        if (rule.operator === "less_than") return totalCash < (rule.value as number);
        if (rule.operator === "less_than_or_equal") return totalCash <= (rule.value as number);
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          return totalCash >= min && totalCash <= max;
        }
        return false;
      }
      case "payment.successfulOrdersCount": {
        const orderCount = this.memoryOrders.filter((o) => o.userId === u.id && o.status === "paid").length;
        if (rule.operator === "equals") return orderCount === rule.value;
        if (rule.operator === "not_equals") return orderCount !== rule.value;
        if (rule.operator === "greater_than") return orderCount > (rule.value as number);
        if (rule.operator === "greater_than_or_equal") return orderCount >= (rule.value as number);
        if (rule.operator === "less_than") return orderCount < (rule.value as number);
        if (rule.operator === "less_than_or_equal") return orderCount <= (rule.value as number);
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          return orderCount >= min && orderCount <= max;
        }
        return false;
      }
      case "payment.lastCashPurchaseDate": {
        const cashPays = this.memoryPayments.filter(
          (p) => p.userId === u.id && p.status === "paid" && p.gateway !== "wallet" && p.paidAt,
        );
        if (cashPays.length === 0) return false;
        const lastPaidTime = Math.max(...cashPays.map((p) => new Date(p.paidAt!).getTime()));

        if (rule.operator === "days_ago_less_than") {
          return lastPaidTime >= Date.now() - (rule.value as number) * 86400000;
        }
        if (rule.operator === "days_ago_greater_than") {
          return lastPaidTime <= Date.now() - (rule.value as number) * 86400000;
        }
        if (rule.operator === "greater_than" || rule.operator === "greater_than_or_equal") {
          return lastPaidTime >= new Date(rule.value as string).getTime();
        }
        if (rule.operator === "less_than" || rule.operator === "less_than_or_equal") {
          return lastPaidTime <= new Date(rule.value as string).getTime();
        }
        if (rule.operator === "between") {
          const [d1, d2] = rule.value as [string, string];
          return lastPaidTime >= new Date(d1).getTime() && lastPaidTime <= new Date(d2).getTime();
        }
        return false;
      }

      // 4. Learning & Activity
      case "activity.lastActiveDate": {
        const sDates = this.memorySessions.filter((s) => s.userId === u.id).map((s) => new Date(s.lastUsedAt).getTime());
        const dDates = this.memoryDevices.filter((d) => d.userId === u.id).map((d) => new Date(d.lastSeenAt).getTime());
        const stDates = this.memoryStudySessions.filter((st) => st.userId === u.id).map((st) => new Date(st.lastActivityAt).getTime());
        const all = [...sDates, ...dDates, ...stDates];
        if (all.length === 0) {
          if (rule.operator === "days_ago_greater_than" || rule.operator === "less_than" || rule.operator === "less_than_or_equal") {
            return true;
          }
          return false;
        }
        const lastActiveTime = Math.max(...all);

        if (rule.operator === "days_ago_less_than") {
          return lastActiveTime >= Date.now() - (rule.value as number) * 86400000;
        }
        if (rule.operator === "days_ago_greater_than") {
          return lastActiveTime <= Date.now() - (rule.value as number) * 86400000;
        }
        if (rule.operator === "greater_than" || rule.operator === "greater_than_or_equal") {
          return lastActiveTime >= new Date(rule.value as string).getTime();
        }
        if (rule.operator === "less_than" || rule.operator === "less_than_or_equal") {
          return lastActiveTime <= new Date(rule.value as string).getTime();
        }
        if (rule.operator === "between") {
          const [d1, d2] = rule.value as [string, string];
          return lastActiveTime >= new Date(d1).getTime() && lastActiveTime <= new Date(d2).getTime();
        }
        return false;
      }
      case "activity.studySessionsCount": {
        let sessions = this.memoryStudySessions.filter((s) => s.userId === u.id);
        if (rule.window === "last_7_days") {
          const cutoff = Date.now() - 7 * 86400000;
          sessions = sessions.filter((s) => new Date(s.startedAt ?? s.lastActivityAt).getTime() >= cutoff);
        } else if (rule.window === "last_30_days") {
          const cutoff = Date.now() - 30 * 86400000;
          sessions = sessions.filter((s) => new Date(s.startedAt ?? s.lastActivityAt).getTime() >= cutoff);
        } else if (rule.window === "last_90_days") {
          const cutoff = Date.now() - 90 * 86400000;
          sessions = sessions.filter((s) => new Date(s.startedAt ?? s.lastActivityAt).getTime() >= cutoff);
        }
        const sessionCount = sessions.length;

        if (rule.operator === "equals") return sessionCount === rule.value;
        if (rule.operator === "not_equals") return sessionCount !== rule.value;
        if (rule.operator === "greater_than") return sessionCount > (rule.value as number);
        if (rule.operator === "greater_than_or_equal") return sessionCount >= (rule.value as number);
        if (rule.operator === "less_than") return sessionCount < (rule.value as number);
        if (rule.operator === "less_than_or_equal") return sessionCount <= (rule.value as number);
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          return sessionCount >= min && sessionCount <= max;
        }
        return false;
      }
      case "activity.totalStudyTimeMinutes": {
        let sessions = this.memoryStudySessions.filter((s) => s.userId === u.id);
        if (rule.window === "last_7_days") {
          const cutoff = Date.now() - 7 * 86400000;
          sessions = sessions.filter((s) => new Date(s.startedAt ?? s.lastActivityAt).getTime() >= cutoff);
        } else if (rule.window === "last_30_days") {
          const cutoff = Date.now() - 30 * 86400000;
          sessions = sessions.filter((s) => new Date(s.startedAt ?? s.lastActivityAt).getTime() >= cutoff);
        } else if (rule.window === "last_90_days") {
          const cutoff = Date.now() - 90 * 86400000;
          sessions = sessions.filter((s) => new Date(s.startedAt ?? s.lastActivityAt).getTime() >= cutoff);
        }
        const totalMinutes = Math.floor(sessions.reduce((sum, s) => sum + s.durationSeconds, 0) / 60);

        if (rule.operator === "equals") return totalMinutes === rule.value;
        if (rule.operator === "not_equals") return totalMinutes !== rule.value;
        if (rule.operator === "greater_than") return totalMinutes > (rule.value as number);
        if (rule.operator === "greater_than_or_equal") return totalMinutes >= (rule.value as number);
        if (rule.operator === "less_than") return totalMinutes < (rule.value as number);
        if (rule.operator === "less_than_or_equal") return totalMinutes <= (rule.value as number);
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          return totalMinutes >= min && totalMinutes <= max;
        }
        return false;
      }
      case "activity.completedQuizzesCount": {
        const quizCount = this.memoryQuizzes.filter((q) => q.userId === u.id && q.status === "completed").length;
        if (rule.operator === "equals") return quizCount === rule.value;
        if (rule.operator === "not_equals") return quizCount !== rule.value;
        if (rule.operator === "greater_than") return quizCount > (rule.value as number);
        if (rule.operator === "greater_than_or_equal") return quizCount >= (rule.value as number);
        if (rule.operator === "less_than") return quizCount < (rule.value as number);
        if (rule.operator === "less_than_or_equal") return quizCount <= (rule.value as number);
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          return quizCount >= min && quizCount <= max;
        }
        return false;
      }
      case "activity.enrolledCoursesCount": {
        const count = this.memoryCourseMemberships.filter((m) => m.userId === u.id && m.role === "student").length;
        if (rule.operator === "equals") return count === rule.value;
        if (rule.operator === "not_equals") return count !== rule.value;
        if (rule.operator === "greater_than") return count > (rule.value as number);
        if (rule.operator === "greater_than_or_equal") return count >= (rule.value as number);
        if (rule.operator === "less_than") return count < (rule.value as number);
        if (rule.operator === "less_than_or_equal") return count <= (rule.value as number);
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          return count >= min && count <= max;
        }
        return false;
      }
      case "activity.uploadedDocumentsCount": {
        const count = this.memoryDocuments.filter((d) => d.ownerUserId === u.id && !d.deletedAt).length;
        if (rule.operator === "equals") return count === rule.value;
        if (rule.operator === "not_equals") return count !== rule.value;
        if (rule.operator === "greater_than") return count > (rule.value as number);
        if (rule.operator === "greater_than_or_equal") return count >= (rule.value as number);
        if (rule.operator === "less_than") return count < (rule.value as number);
        if (rule.operator === "less_than_or_equal") return count <= (rule.value as number);
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          return count >= min && count <= max;
        }
        return false;
      }
      case "activity.aiGeneratedContentsCount": {
        const userDocIds = new Set(this.memoryDocuments.filter((d) => d.ownerUserId === u.id && !d.deletedAt).map((d) => d.id));
        const count = this.memoryGeneratedContents.filter((g) => userDocIds.has(g.documentId) && !g.deletedAt).length;
        if (rule.operator === "equals") return count === rule.value;
        if (rule.operator === "not_equals") return count !== rule.value;
        if (rule.operator === "greater_than") return count > (rule.value as number);
        if (rule.operator === "greater_than_or_equal") return count >= (rule.value as number);
        if (rule.operator === "less_than") return count < (rule.value as number);
        if (rule.operator === "less_than_or_equal") return count <= (rule.value as number);
        if (rule.operator === "between") {
          const [min, max] = rule.value as [number, number];
          return count >= min && count <= max;
        }
        return false;
      }
      default:
        return false;
    }
  }

  async listSegments(params?: ListCrmSegmentsParams): Promise<ListCrmSegmentsResponse> {
    let list = [...this.memorySegments];

    if (params?.isActive !== undefined) {
      list = list.filter((s) => s.isActive === params.isActive);
    }
    if (params?.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = list.length;
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
    const offset = (page - 1) * pageSize;
    const paged = list.slice(offset, offset + pageSize);

    for (const seg of paged) {
      seg.estimatedCount = await this.previewSegmentCount(seg.filterRules, seg.matchOperator);
    }

    return {
      segments: paged,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  async findSegmentById(id: string): Promise<CrmSegmentItem | null> {
    const found = this.memorySegments.find((s) => s.id === id);
    if (!found) return null;
    const estimatedCount = await this.previewSegmentCount(found.filterRules, found.matchOperator);
    return { ...found, estimatedCount };
  }

  async createSegment(input: CreateCrmSegmentInput, createdById: string): Promise<CrmSegmentItem> {
    const author = this.memoryUsers.find((u) => u.id === createdById);
    const item: CrmSegmentItem = {
      id: randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isActive: input.isActive ?? true,
      matchOperator: input.matchOperator ?? "and",
      filterRules: input.filterRules,
      createdById,
      createdByName: author?.name ?? "نامشخص",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    item.estimatedCount = await this.previewSegmentCount(item.filterRules, item.matchOperator);
    this.memorySegments.push(item);
    return item;
  }

  async updateSegment(id: string, input: UpdateCrmSegmentInput): Promise<CrmSegmentItem | null> {
    const item = this.memorySegments.find((s) => s.id === id);
    if (!item) return null;

    if (input.name !== undefined) item.name = input.name.trim();
    if (input.description !== undefined) item.description = input.description?.trim() || null;
    if (input.isActive !== undefined) item.isActive = input.isActive;
    if (input.matchOperator !== undefined) item.matchOperator = input.matchOperator;
    if (input.filterRules !== undefined) item.filterRules = input.filterRules;
    item.updatedAt = new Date().toISOString();
    item.estimatedCount = await this.previewSegmentCount(item.filterRules, item.matchOperator);
    return { ...item };
  }

  async deleteSegment(id: string): Promise<boolean> {
    const idx = this.memorySegments.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.memorySegments.splice(idx, 1);
    return true;
  }

  async previewSegmentCount(
    rules: SegmentFilterRule[],
    matchOperator: SegmentMatchOperator,
  ): Promise<number> {
    const activeUsers = this.memoryUsers.filter((u) => !u.deletedAt);
    if (!rules || rules.length === 0) {
      return activeUsers.length;
    }

    if (matchOperator === "or") {
      return activeUsers.filter((u) => rules.some((r) => this.evaluateInMemoryRule(u, r))).length;
    }
    return activeUsers.filter((u) => rules.every((r) => this.evaluateInMemoryRule(u, r))).length;
  }

  async getSegmentMembers(params: GetSegmentMembersParams): Promise<ListCrmCustomersResponse> {
    const segment = await this.findSegmentById(params.segmentId);
    if (!segment) {
      return {
        customers: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
    }

    let matchingUsers = this.memoryUsers.filter((u) => !u.deletedAt);
    if (segment.filterRules.length > 0) {
      if (segment.matchOperator === "or") {
        matchingUsers = matchingUsers.filter((u) =>
          segment.filterRules.some((r) => this.evaluateInMemoryRule(u, r)),
        );
      } else {
        matchingUsers = matchingUsers.filter((u) =>
          segment.filterRules.every((r) => this.evaluateInMemoryRule(u, r)),
        );
      }
    }

    // Sort
    const sortField = params.sortBy ?? "createdAt";
    const sortOrder = params.sortOrder ?? "desc";
    const mult = sortOrder === "asc" ? 1 : -1;

    matchingUsers.sort((a, b) => {
      if (sortField === "name") {
        return mult * (a.name ?? "").localeCompare(b.name ?? "");
      }
      if (sortField === "totalSpent") {
        const spentA = this.memoryPayments
          .filter((p) => p.userId === a.id && p.status === "paid" && p.gateway !== "wallet")
          .reduce((acc, p) => acc + p.amount, 0);
        const spentB = this.memoryPayments
          .filter((p) => p.userId === b.id && p.status === "paid" && p.gateway !== "wallet")
          .reduce((acc, p) => acc + p.amount, 0);
        if (spentA !== spentB) return mult * (spentA - spentB);
      }
      if (sortField === "successfulOrdersCount") {
        const ordA = this.memoryOrders.filter((o) => o.userId === a.id && o.status === "paid").length;
        const ordB = this.memoryOrders.filter((o) => o.userId === b.id && o.status === "paid").length;
        if (ordA !== ordB) return mult * (ordA - ordB);
      }
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return mult * (tA - tB);
    });

    const totalCount = matchingUsers.length;
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const offset = (page - 1) * pageSize;
    const paged = matchingUsers.slice(offset, offset + pageSize);

    const customers: CrmCustomerListItem[] = await Promise.all(
      paged.map(async (u) => {
        const tags = await this.getCustomerTags(u.id);
        const paidPayments = this.memoryPayments.filter(
          (p) => p.userId === u.id && p.status === "paid" && p.gateway !== "wallet",
        );
        const totalPaid = paidPayments.reduce((acc, curr) => acc + curr.amount, 0);
        const successfulOrders = this.memoryOrders.filter((o) => o.userId === u.id && o.status === "paid");

        const sDates = this.memorySessions.filter((s) => s.userId === u.id).map((s) => new Date(s.lastUsedAt).getTime());
        const dDates = this.memoryDevices.filter((d) => d.userId === u.id).map((d) => new Date(d.lastSeenAt).getTime());
        const stDates = this.memoryStudySessions.filter((st) => st.userId === u.id).map((st) => new Date(st.lastActivityAt).getTime());
        const allTimes = [...sDates, ...dDates, ...stDates];
        const lastActiveAt = allTimes.length > 0 ? new Date(Math.max(...allTimes)).toISOString() : null;

        const emailVerified = !!u.emailVerifiedAt;
        const phoneVerified = !!u.phoneVerifiedAt;

        return {
          id: u.id,
          name: u.name ?? "کاربر بدون نام",
          email: u.email,
          phoneNumber: u.phoneNumber ?? null,
          createdAt: u.createdAt,
          lastActiveAt,
          isVerified: emailVerified || phoneVerified,
          emailVerified,
          phoneVerified,
          successfulOrdersCount: successfulOrders.length,
          totalPaidAmount: totalPaid,
          tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
        };
      }),
    );

    return {
      customers,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  // -------------------------------------------------------------------------
  // Campaigns (Phase 3)
  // -------------------------------------------------------------------------

  async getMatchingSegmentUserIds(segmentId: string): Promise<string[]> {
    const segment = await this.findSegmentById(segmentId);
    if (!segment || !segment.isActive) {
      return [];
    }
    const matching = this.memoryUsers.filter((u) => {
      if (u.deletedAt) return false;
      if (segment.filterRules.length === 0) return true;
      if (segment.matchOperator === "or") {
        return segment.filterRules.some((rule) => this.evaluateInMemoryRule(u, rule));
      }
      return segment.filterRules.every((rule) => this.evaluateInMemoryRule(u, rule));
    });
    return matching.map((u) => u.id);
  }

  async listCampaigns(params?: ListCrmCampaignsParams): Promise<ListCrmCampaignsResponse> {
    let list = [...this.memoryCampaigns];

    if (params?.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description && c.description.toLowerCase().includes(q)),
      );
    }

    if (params?.status) {
      list = list.filter((c) => c.status === params.status);
    }

    if (params?.channel) {
      list = list.filter((c) => c.channel === params.channel);
    }

    if (params?.targetSegmentId) {
      list = list.filter((c) => c.targetSegmentId === params.targetSegmentId);
    }

    // Sort descending by createdAt
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = list.length;
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
    const offset = (page - 1) * pageSize;
    const paged = list.slice(offset, offset + pageSize);

    const campaigns: CrmCampaignItem[] = await Promise.all(
      paged.map(async (c) => {
        const seg = this.memorySegments.find((s) => s.id === c.targetSegmentId);
        const creator = this.memoryUsers.find((u) => u.id === c.createdById);
        const lastExec = await this.findLatestCampaignExecution(c.id);

        let estimatedRecipientsCount: number | undefined = undefined;
        if (seg) {
          estimatedRecipientsCount = await this.previewSegmentCount(
            seg.filterRules,
            seg.matchOperator,
          );
        }

        return {
          id: c.id,
          name: c.name,
          description: c.description,
          targetSegmentId: c.targetSegmentId,
          targetSegmentName: seg?.name,
          channel: c.channel,
          status: c.status,
          messageContent: c.messageContent,
          scheduledAt: c.scheduledAt,
          createdById: c.createdById,
          createdByName: creator?.name,
          estimatedRecipientsCount,
          lastExecution: lastExec
            ? {
                id: lastExec.id,
                status: lastExec.status,
                totalRecipients: lastExec.totalRecipients,
                processedRecipients: lastExec.processedRecipients,
                successfulRecipients: lastExec.successfulRecipients,
                failedRecipients: lastExec.failedRecipients,
                startedAt: lastExec.startedAt,
                completedAt: lastExec.completedAt,
              }
            : null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      }),
    );

    return {
      campaigns,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }

  async findCampaignById(id: string): Promise<CrmCampaignItem | null> {
    const found = this.memoryCampaigns.find((c) => c.id === id);
    if (!found) return null;

    const seg = this.memorySegments.find((s) => s.id === found.targetSegmentId);
    const creator = this.memoryUsers.find((u) => u.id === found.createdById);
    const lastExec = await this.findLatestCampaignExecution(found.id);

    let estimatedRecipientsCount: number | undefined = undefined;
    if (seg) {
      estimatedRecipientsCount = await this.previewSegmentCount(
        seg.filterRules,
        seg.matchOperator,
      );
    }

    return {
      id: found.id,
      name: found.name,
      description: found.description,
      targetSegmentId: found.targetSegmentId,
      targetSegmentName: seg?.name,
      channel: found.channel,
      status: found.status,
      messageContent: found.messageContent,
      scheduledAt: found.scheduledAt,
      createdById: found.createdById,
      createdByName: creator?.name,
      estimatedRecipientsCount,
      lastExecution: lastExec
        ? {
            id: lastExec.id,
            status: lastExec.status,
            totalRecipients: lastExec.totalRecipients,
            processedRecipients: lastExec.processedRecipients,
            successfulRecipients: lastExec.successfulRecipients,
            failedRecipients: lastExec.failedRecipients,
            startedAt: lastExec.startedAt,
            completedAt: lastExec.completedAt,
          }
        : null,
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    };
  }

  async createCampaign(
    input: CreateCrmCampaignInput,
    createdById: string,
  ): Promise<CrmCampaignItem> {
    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      targetSegmentId: input.targetSegmentId,
      channel: input.channel,
      status: "draft" as CampaignStatus,
      messageContent: input.messageContent ?? null,
      scheduledAt: input.scheduledAt ?? null,
      createdById,
      createdAt: now,
      updatedAt: now,
    };
    this.memoryCampaigns.push(item);

    const seg = this.memorySegments.find((s) => s.id === item.targetSegmentId);
    const creator = this.memoryUsers.find((u) => u.id === createdById);

    let estimatedRecipientsCount: number | undefined = undefined;
    if (seg) {
      estimatedRecipientsCount = await this.previewSegmentCount(
        seg.filterRules,
        seg.matchOperator,
      );
    }

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      targetSegmentId: item.targetSegmentId,
      targetSegmentName: seg?.name,
      channel: item.channel,
      status: item.status,
      messageContent: item.messageContent,
      scheduledAt: item.scheduledAt,
      createdById: item.createdById,
      createdByName: creator?.name,
      estimatedRecipientsCount,
      lastExecution: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async updateCampaign(
    id: string,
    input: UpdateCrmCampaignInput,
  ): Promise<CrmCampaignItem | null> {
    const found = this.memoryCampaigns.find((c) => c.id === id);
    if (!found) return null;

    if (input.name !== undefined) found.name = input.name;
    if (input.description !== undefined) found.description = input.description;
    if (input.targetSegmentId !== undefined) found.targetSegmentId = input.targetSegmentId;
    if (input.channel !== undefined) found.channel = input.channel;
    if (input.messageContent !== undefined) found.messageContent = input.messageContent;
    if (input.scheduledAt !== undefined) found.scheduledAt = input.scheduledAt;
    if (input.status !== undefined) found.status = input.status;
    found.updatedAt = new Date().toISOString();

    return this.findCampaignById(found.id);
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const idx = this.memoryCampaigns.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.memoryCampaigns.splice(idx, 1);
    // Also remove associated executions and recipients
    this.memoryExecutions = this.memoryExecutions.filter((e) => e.campaignId !== id);
    this.memoryRecipients = this.memoryRecipients.filter((r) => r.campaignId !== id);
    return true;
  }

  async createCampaignExecution(
    campaignId: string,
    triggeredById: string,
    totalRecipients: number,
    status: CampaignExecutionStatus = "running",
  ): Promise<CrmCampaignExecutionItem> {
    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      campaignId,
      status,
      totalRecipients,
      jobId: null,
      processedRecipients: 0,
      successfulRecipients: 0,
      failedRecipients: 0,
      startedAt: now,
      completedAt: null,
      triggeredById,
      createdAt: now,
      updatedAt: now,
    };
    this.memoryExecutions.push(item);

    const triggerUser = this.memoryUsers.find((u) => u.id === triggeredById);

    return {
      ...item,
      triggeredByName: triggerUser?.name,
    };
  }

  async updateCampaignExecution(
    executionId: string,
    updates: Partial<{
      status: CampaignExecutionStatus;
      jobId?: string | null;
      processedRecipients: number;
      successfulRecipients: number;
      failedRecipients: number;
      completedAt: string | null;
    }>,
  ): Promise<CrmCampaignExecutionItem | null> {
    const found = this.memoryExecutions.find((e) => e.id === executionId);
    if (!found) return null;

    if (updates.status !== undefined) found.status = updates.status;
    if (updates.jobId !== undefined) found.jobId = updates.jobId;
    if (updates.processedRecipients !== undefined) found.processedRecipients = updates.processedRecipients;
    if (updates.successfulRecipients !== undefined) found.successfulRecipients = updates.successfulRecipients;
    if (updates.failedRecipients !== undefined) found.failedRecipients = updates.failedRecipients;
    if (updates.completedAt !== undefined) found.completedAt = updates.completedAt;
    found.updatedAt = new Date().toISOString();

    const triggerUser = this.memoryUsers.find((u) => u.id === found.triggeredById);
    return {
      ...found,
      triggeredByName: triggerUser?.name,
    };
  }

  async findExecutionById(executionId: string): Promise<CrmCampaignExecutionItem | null> {
    const found = this.memoryExecutions.find((e) => e.id === executionId);
    if (!found) return null;
    const triggerUser = this.memoryUsers.find((u) => u.id === found.triggeredById);
    return {
      ...found,
      triggeredByName: triggerUser?.name,
    };
  }

  async findLatestCampaignExecution(campaignId: string): Promise<CrmCampaignExecutionItem | null> {
    const list = this.memoryExecutions
      .filter((e) => e.campaignId === campaignId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (list.length === 0) return null;
    const found = list[0];
    const triggerUser = this.memoryUsers.find((u) => u.id === found.triggeredById);
    return {
      ...found,
      triggeredByName: triggerUser?.name,
    };
  }

  async listCampaignExecutions(campaignId: string): Promise<CrmCampaignExecutionItem[]> {
    const list = this.memoryExecutions
      .filter((e) => e.campaignId === campaignId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return list.map((e) => {
      const triggerUser = this.memoryUsers.find((u) => u.id === e.triggeredById);
      return {
        ...e,
        triggeredByName: triggerUser?.name,
      };
    });
  }

  async batchCreateCampaignRecipients(
    recipients: Array<{
      campaignId: string;
      executionId: string;
      userId: string;
      channel: CampaignChannel;
      status: CampaignRecipientStatus;
      errorMessage?: string | null;
      sentAt?: string | null;
    }>,
  ): Promise<number> {
    let added = 0;
    const now = new Date().toISOString();
    for (const r of recipients) {
      // Uniqueness on executionId and userId
      const exists = this.memoryRecipients.some(
        (existing) => existing.executionId === r.executionId && existing.userId === r.userId,
      );
      if (!exists) {
        this.memoryRecipients.push({
          id: randomUUID(),
          campaignId: r.campaignId,
          executionId: r.executionId,
          userId: r.userId,
          channel: r.channel,
          status: r.status,
          attempts: 0,
          lastAttemptAt: null,
          errorCode: null,
          errorMessage: r.errorMessage ?? null,
          sentAt: r.sentAt ?? null,
          createdAt: now,
        });
        added++;
      }
    }
    return added;
  }

  async claimPendingRecipients(
    executionId: string,
    limit: number,
    excludeIds?: string[],
  ): Promise<CrmCampaignRecipientItem[]> {
    const excludeSet = new Set(excludeIds ?? []);
    const pending = this.memoryRecipients
      .filter(
        (r) =>
          r.executionId === executionId &&
          (r.status === "pending" || r.status === "queued") &&
          !excludeSet.has(r.id),
      )
      .slice(0, limit);

    for (const r of pending) {
      r.status = "processing";
    }

    return pending.map((r) => {
      const u = this.memoryUsers.find((usr) => usr.id === r.userId);
      return {
        id: r.id,
        campaignId: r.campaignId,
        executionId: r.executionId,
        userId: r.userId,
        userName: u?.name ?? "کاربر بدون نام",
        userEmail: u?.email,
        userPhoneNumber: u?.phoneNumber ?? null,
        channel: r.channel,
        status: r.status,
        attempts: r.attempts ?? 0,
        lastAttemptAt: r.lastAttemptAt ?? null,
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage,
        sentAt: r.sentAt,
        createdAt: r.createdAt,
      };
    });
  }

  async updateCampaignRecipientStatus(
    recipientId: string,
    data: {
      status: CampaignRecipientStatus;
      errorMessage?: string | null;
      errorCode?: string | null;
      sentAt?: string | null;
      attempts?: number;
      lastAttemptAt?: string | null;
    },
  ): Promise<void> {
    const found = this.memoryRecipients.find((r) => r.id === recipientId);
    if (!found) return;

    found.status = data.status;
    if (data.errorMessage !== undefined) found.errorMessage = data.errorMessage;
    if (data.errorCode !== undefined) found.errorCode = data.errorCode;
    if (data.sentAt !== undefined) found.sentAt = data.sentAt;
    if (data.attempts !== undefined) found.attempts = data.attempts;
    if (data.lastAttemptAt !== undefined) found.lastAttemptAt = data.lastAttemptAt;
  }

  async batchSkipRecipients(executionId: string, reason: string, errorCode: string): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();
    for (const r of this.memoryRecipients) {
      if (r.executionId === executionId && (r.status === "pending" || r.status === "queued" || r.status === "processing")) {
        r.status = "skipped";
        r.errorMessage = reason;
        r.errorCode = errorCode;
        r.sentAt = now;
        count++;
      }
    }
    return count;
  }

  async getExecutionCounts(
    executionId: string,
  ): Promise<{ total: number; processed: number; successful: number; failed: number; pending: number }> {
    const recipients = this.memoryRecipients.filter((r) => r.executionId === executionId);
    let total = recipients.length;
    let successful = 0;
    let failed = 0;
    let pending = 0;

    for (const r of recipients) {
      if (r.status === "sent") {
        successful++;
      } else if (r.status === "failed" || r.status === "skipped") {
        failed++;
      } else if (r.status === "pending" || r.status === "queued") {
        pending++;
      }
    }

    const processed = successful + failed;
    return {
      total,
      processed,
      successful,
      failed,
      pending,
    };
  }

  async getUserContact(
    userId: string,
  ): Promise<{ email: string | null; phoneNumber: string | null; name: string | null } | null> {
    const u = this.memoryUsers.find((usr) => usr.id === userId);
    if (!u) return null;
    return {
      email: u.email ?? null,
      phoneNumber: u.phoneNumber ?? null,
      name: u.name ?? null,
    };
  }

  async listCampaignRecipients(
    executionId: string,
    params?: ListCrmCampaignRecipientsParams,
  ): Promise<ListCrmCampaignRecipientsResponse> {
    let list = this.memoryRecipients.filter((r) => r.executionId === executionId);

    if (params?.status) {
      list = list.filter((r) => r.status === params.status);
    }

    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const totalCount = list.length;
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
    const offset = (page - 1) * pageSize;
    const paged = list.slice(offset, offset + pageSize);

    const recipients: CrmCampaignRecipientItem[] = paged.map((r) => {
      const u = this.memoryUsers.find((usr) => usr.id === r.userId);
      return {
        id: r.id,
        campaignId: r.campaignId,
        executionId: r.executionId,
        userId: r.userId,
        userName: u?.name ?? "کاربر بدون نام",
        userEmail: u?.email,
        userPhoneNumber: u?.phoneNumber ?? null,
        channel: r.channel,
        status: r.status,
        attempts: r.attempts ?? 0,
        lastAttemptAt: r.lastAttemptAt ?? null,
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage,
        sentAt: r.sentAt,
        createdAt: r.createdAt,
      };
    });

    return {
      recipients,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  }
}
