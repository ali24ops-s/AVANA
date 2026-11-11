import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  DomainError,
  Roles,
  isUUID,
  asUserId,
  asCrmTagId,
  asCrmCustomerNoteId,
  asCrmSegmentId,
  asCrmCampaignId,
  asCrmCampaignExecutionId,
  type SegmentFilterRule,
  type CreateCrmCampaignInput,
  type UpdateCrmCampaignInput,
  type CampaignStatus,
  type CampaignChannel,
  type CampaignRecipientStatus,
  hasFinancialSegmentRules,
} from "@avana/domain";
import type { CrmService } from "./crm-service.js";

function getAuthenticatedUser(request: FastifyRequest) {
  const user = (request as unknown as {
    user?: { userId: string; email: string; role: string; globalRole?: string | null };
  }).user;
  if (!user) {
    throw new DomainError("unauthorized", "Not signed in");
  }
  return user;
}

function requirePlatformAdmin(request: FastifyRequest) {
  const user = getAuthenticatedUser(request);
  const isPlatformAdmin =
    user.globalRole === Roles.platform_admin || user.role === Roles.platform_admin;
  if (!isPlatformAdmin) {
    throw new DomainError("forbidden", "تنها مدیران ارشد سیستم به این عملیات دسترسی دارند.");
  }
  return user;
}

function ensureValidUUID(id: string, fieldName: string): void {
  if (!id || !isUUID(id)) {
    throw new DomainError("bad_request", `شناسه ${fieldName} نامعتبر است.`);
  }
}

export interface CrmRoutesOptions {
  crmService: CrmService;
}

export const crmRoutes: FastifyPluginAsync<CrmRoutesOptions> = async (app, opts) => {
  const { crmService } = opts;

  // GET /crm/customers - Search, filter, and paginate customers
  app.get<{
    Querystring: {
      search?: string;
      isVerified?: string;
      verifiedStatus?: string;
      registeredFrom?: string;
      registeredTo?: string;
      createdAfter?: string;
      createdBefore?: string;
      tagId?: string;
      hasPurchased?: string;
      hasPurchases?: string;
      minSpent?: string;
      maxSpent?: string;
      page?: string;
      pageSize?: string;
      sortBy?: string;
      sortDirection?: string;
      sortOrder?: string;
    };
  }>("/customers", async (request) => {
    const user = getAuthenticatedUser(request);
    const isPlatformAdmin =
      user.globalRole === Roles.platform_admin || user.role === Roles.platform_admin;
    const query = request.query;

    if (query.tagId) {
      ensureValidUUID(query.tagId, "برچسب");
    }

    let verifiedStatus: "all" | "verified" | "unverified" | undefined = undefined;
    if (query.isVerified === "true" || query.verifiedStatus === "verified") {
      verifiedStatus = "verified";
    } else if (query.isVerified === "false" || query.verifiedStatus === "unverified") {
      verifiedStatus = "unverified";
    }

    let hasPurchases: "all" | "true" | "false" | undefined = undefined;
    if (isPlatformAdmin) {
      if (query.hasPurchased === "true" || query.hasPurchases === "true") {
        hasPurchases = "true";
      } else if (query.hasPurchased === "false" || query.hasPurchases === "false") {
        hasPurchases = "false";
      }
    }

    const allowedSortBy: Array<"createdAt" | "name" | "totalSpent" | "successfulOrdersCount"> = [
      "createdAt",
      "name",
      "totalSpent",
      "successfulOrdersCount",
    ];
    type CustomerSortBy = (typeof allowedSortBy)[number];
    let sortBy = typeof query.sortBy === "string" && (allowedSortBy as readonly string[]).includes(query.sortBy)
      ? (query.sortBy as CustomerSortBy)
      : undefined;

    if (!isPlatformAdmin && (sortBy === "totalSpent" || sortBy === "successfulOrdersCount")) {
      sortBy = undefined;
    }

    const sortOrder =
      query.sortDirection === "asc" || query.sortOrder === "asc"
        ? "asc"
        : query.sortDirection === "desc" || query.sortOrder === "desc"
        ? "desc"
        : undefined;

    const minSpent =
      isPlatformAdmin && query.minSpent !== undefined && query.minSpent !== ""
        ? Number(query.minSpent)
        : undefined;
    const maxSpent =
      isPlatformAdmin && query.maxSpent !== undefined && query.maxSpent !== ""
        ? Number(query.maxSpent)
        : undefined;

    const result = await crmService.listCustomers({
      search: query.search?.trim() || undefined,
      verifiedStatus,
      createdAfter: query.createdAfter || query.registeredFrom || undefined,
      createdBefore: query.createdBefore || query.registeredTo || undefined,
      tagId: query.tagId ? asCrmTagId(query.tagId) : undefined,
      hasPurchases,
      minSpent,
      maxSpent,
      page: query.page ? Math.max(1, parseInt(query.page, 10)) : 1,
      pageSize: query.pageSize ? Math.min(100, Math.max(1, parseInt(query.pageSize, 10))) : 20,
      sortBy,
      sortOrder,
    });

    if (!isPlatformAdmin) {
      return {
        ...result,
        customers: result.customers.map(({ totalPaidAmount, successfulOrdersCount, ...rest }) => rest),
      };
    }

    return result;
  });

  // GET /crm/customers/:userId/360 - 360-degree customer profile
  app.get<{
    Params: { userId: string };
  }>("/customers/:userId/360", async (request) => {
    const user = getAuthenticatedUser(request);
    ensureValidUUID(request.params.userId, "کاربر");
    const userId = asUserId(request.params.userId);
    const isPlatformAdmin =
      user.globalRole === Roles.platform_admin || user.role === Roles.platform_admin;
    const profile = await crmService.getCustomer360(userId, isPlatformAdmin);
    return { profile };
  });

  // GET /crm/tags - List all customer tags
  app.get("/tags", async (request) => {
    getAuthenticatedUser(request);
    const tags = await crmService.listTags();
    return { tags };
  });

  // POST /crm/tags - Create a new tag (platform_admin only)
  app.post<{
    Body: { name: string; color?: string; description?: string };
  }>("/tags", async (request, reply) => {
    const user = requirePlatformAdmin(request);
    if (!request.body || typeof request.body.name !== "string") {
      throw new DomainError("bad_request", "نام برچسب الزامی است.");
    }
    const tag = await crmService.createTag(request.body, asUserId(user.userId));
    reply.status(201);
    return { tag };
  });

  // PATCH /crm/tags/:tagId - Update a tag (platform_admin only)
  app.patch<{
    Params: { tagId: string };
    Body: { name?: string; color?: string; description?: string };
  }>("/tags/:tagId", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.tagId, "برچسب");
    const tagId = asCrmTagId(request.params.tagId);
    const tag = await crmService.updateTag(tagId, request.body, asUserId(user.userId));
    return { tag };
  });

  // DELETE /crm/tags/:tagId - Delete a tag (platform_admin only)
  app.delete<{
    Params: { tagId: string };
  }>("/tags/:tagId", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.tagId, "برچسب");
    const tagId = asCrmTagId(request.params.tagId);
    await crmService.deleteTag(tagId, asUserId(user.userId));
    return { ok: true };
  });

  // POST /crm/customers/:userId/tags - Attach tag to customer (platform_admin only)
  app.post<{
    Params: { userId: string };
    Body: { tagId: string };
  }>("/customers/:userId/tags", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.userId, "کاربر");
    if (!request.body?.tagId) {
      throw new DomainError("bad_request", "شناسه برچسب الزامی است.");
    }
    ensureValidUUID(request.body.tagId, "برچسب");
    const userId = asUserId(request.params.userId);
    const tagId = asCrmTagId(request.body.tagId);
    await crmService.attachTagToCustomer(userId, tagId, asUserId(user.userId));
    return { ok: true };
  });

  // DELETE /crm/customers/:userId/tags/:tagId - Detach tag from customer (platform_admin only)
  app.delete<{
    Params: { userId: string; tagId: string };
  }>("/customers/:userId/tags/:tagId", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.userId, "کاربر");
    ensureValidUUID(request.params.tagId, "برچسب");
    const userId = asUserId(request.params.userId);
    const tagId = asCrmTagId(request.params.tagId);
    await crmService.detachTagFromCustomer(userId, tagId, asUserId(user.userId));
    return { ok: true };
  });

  // GET /crm/customers/:userId/notes - List customer internal notes
  app.get<{
    Params: { userId: string };
  }>("/customers/:userId/notes", async (request) => {
    getAuthenticatedUser(request);
    ensureValidUUID(request.params.userId, "کاربر");
    const userId = asUserId(request.params.userId);
    const notes = await crmService.listCustomerNotes(userId);
    return { notes };
  });

  // POST /crm/customers/:userId/notes - Create customer note
  app.post<{
    Params: { userId: string };
    Body: { content: string; isPinned?: boolean };
  }>("/customers/:userId/notes", async (request, reply) => {
    const user = getAuthenticatedUser(request);
    ensureValidUUID(request.params.userId, "کاربر");
    if (!request.body || typeof request.body.content !== "string") {
      throw new DomainError("bad_request", "متن یادداشت الزامی است.");
    }
    const userId = asUserId(request.params.userId);
    const note = await crmService.createCustomerNote(userId, asUserId(user.userId), request.body);
    reply.status(201);
    return { note };
  });

  // PATCH /crm/customers/:userId/notes/:noteId - Update customer note
  app.patch<{
    Params: { userId: string; noteId: string };
    Body: { content?: string; isPinned?: boolean };
  }>("/customers/:userId/notes/:noteId", async (request) => {
    const user = getAuthenticatedUser(request);
    ensureValidUUID(request.params.userId, "کاربر");
    ensureValidUUID(request.params.noteId, "یادداشت");
    const userId = asUserId(request.params.userId);
    const noteId = asCrmCustomerNoteId(request.params.noteId);
    const isPlatformAdmin =
      user.globalRole === Roles.platform_admin || user.role === Roles.platform_admin;
    const note = await crmService.updateCustomerNote(
      userId,
      noteId,
      asUserId(user.userId),
      isPlatformAdmin,
      request.body,
    );
    return { note };
  });

  // DELETE /crm/customers/:userId/notes/:noteId - Delete customer note
  app.delete<{
    Params: { userId: string; noteId: string };
  }>("/customers/:userId/notes/:noteId", async (request) => {
    const user = getAuthenticatedUser(request);
    ensureValidUUID(request.params.userId, "کاربر");
    ensureValidUUID(request.params.noteId, "یادداشت");
    const userId = asUserId(request.params.userId);
    const noteId = asCrmCustomerNoteId(request.params.noteId);
    const isPlatformAdmin =
      user.globalRole === Roles.platform_admin || user.role === Roles.platform_admin;
    await crmService.deleteCustomerNote(userId, noteId, asUserId(user.userId), isPlatformAdmin);
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // CRM Segments (Phase 2)
  // -------------------------------------------------------------------------

  // GET /crm/segments - List segments
  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      search?: string;
      isActive?: string;
    };
  }>("/segments", async (request) => {
    getAuthenticatedUser(request);
    const query = request.query;

    let isActive: boolean | undefined = undefined;
    if (query.isActive === "true") isActive = true;
    else if (query.isActive === "false") isActive = false;

    return crmService.listSegments({
      page: query.page ? Math.max(1, parseInt(query.page, 10)) : 1,
      pageSize: query.pageSize ? Math.min(100, Math.max(1, parseInt(query.pageSize, 10))) : 20,
      search: query.search?.trim() || undefined,
      isActive,
    });
  });

  // POST /crm/segments/preview-count - Preview matching users count for rules
  app.post<{
    Body: {
      filterRules: unknown[];
      matchOperator?: "and" | "or";
    };
  }>("/segments/preview-count", async (request) => {
    requirePlatformAdmin(request);
    if (!request.body || !Array.isArray(request.body.filterRules)) {
      throw new DomainError("bad_request", "قواعد سگمنت الزامی است.");
    }
    return crmService.previewSegmentCount(
      request.body.filterRules,
      request.body.matchOperator,
    );
  });

  // POST /crm/segments - Create a new segment (platform_admin only)
  app.post<{
    Body: {
      name: string;
      description?: string;
      isActive?: boolean;
      matchOperator?: "and" | "or";
      filterRules: SegmentFilterRule[];
    };
  }>("/segments", async (request, reply) => {
    const user = requirePlatformAdmin(request);
    if (!request.body || typeof request.body.name !== "string") {
      throw new DomainError("bad_request", "نام سگمنت الزامی است.");
    }
    const segment = await crmService.createSegment(request.body, asUserId(user.userId));
    reply.status(201);
    return { segment };
  });

  // GET /crm/segments/:segmentId - Get segment detail
  app.get<{
    Params: { segmentId: string };
  }>("/segments/:segmentId", async (request) => {
    getAuthenticatedUser(request);
    ensureValidUUID(request.params.segmentId, "سگمنت");
    const segmentId = asCrmSegmentId(request.params.segmentId);
    const segment = await crmService.getSegmentById(segmentId);
    return { segment };
  });

  // PATCH /crm/segments/:segmentId - Update segment (platform_admin only)
  app.patch<{
    Params: { segmentId: string };
    Body: {
      name?: string;
      description?: string;
      isActive?: boolean;
      matchOperator?: "and" | "or";
      filterRules?: SegmentFilterRule[];
    };
  }>("/segments/:segmentId", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.segmentId, "سگمنت");
    const segmentId = asCrmSegmentId(request.params.segmentId);
    const segment = await crmService.updateSegment(
      segmentId,
      request.body ?? {},
      asUserId(user.userId),
    );
    return { segment };
  });

  // DELETE /crm/segments/:segmentId - Delete segment (platform_admin only)
  app.delete<{
    Params: { segmentId: string };
  }>("/segments/:segmentId", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.segmentId, "سگمنت");
    const segmentId = asCrmSegmentId(request.params.segmentId);
    await crmService.deleteSegment(segmentId, asUserId(user.userId));
    return { ok: true };
  });

  // GET /crm/segments/:segmentId/members - Get segment matching members
  app.get<{
    Params: { segmentId: string };
    Querystring: {
      page?: string;
      pageSize?: string;
      sortBy?: string;
      sortDirection?: string;
      sortOrder?: string;
    };
  }>("/segments/:segmentId/members", async (request) => {
    const user = getAuthenticatedUser(request);
    const isPlatformAdmin =
      user.globalRole === Roles.platform_admin || user.role === Roles.platform_admin;
    ensureValidUUID(request.params.segmentId, "سگمنت");
    const segmentId = asCrmSegmentId(request.params.segmentId);

    const segment = await crmService.getSegmentById(segmentId);
    if (!isPlatformAdmin && hasFinancialSegmentRules(segment.filterRules)) {
      throw new DomainError("forbidden", "دسترسی به اعضای سگمنت‌های دارای قواعد مالی تنها برای مدیر ارشد مجاز است.");
    }

    const query = request.query;

    const allowedSortBy = [
      "createdAt",
      "name",
      "totalSpent",
      "successfulOrdersCount",
    ] as const;
    type CustomerSortBy = (typeof allowedSortBy)[number];
    let sortBy = typeof query.sortBy === "string" && (allowedSortBy as readonly string[]).includes(query.sortBy)
      ? (query.sortBy as CustomerSortBy)
      : undefined;

    if (!isPlatformAdmin && (sortBy === "totalSpent" || sortBy === "successfulOrdersCount")) {
      sortBy = undefined;
    }

    const sortOrder =
      query.sortDirection === "asc" || query.sortOrder === "asc"
        ? "asc"
        : query.sortDirection === "desc" || query.sortOrder === "desc"
        ? "desc"
        : undefined;

    const result = await crmService.getSegmentMembers(segmentId, {
      page: query.page ? Math.max(1, parseInt(query.page, 10)) : 1,
      pageSize: query.pageSize ? Math.min(100, Math.max(1, parseInt(query.pageSize, 10))) : 20,
      sortBy,
      sortOrder,
    });

    if (!isPlatformAdmin) {
      return {
        ...result,
        customers: result.customers.map(({ totalPaidAmount, successfulOrdersCount, ...rest }) => rest),
      };
    }

    return result;
  });

  // -------------------------------------------------------------------------
  // CRM Campaigns (Phase 3)
  // -------------------------------------------------------------------------

  // GET /crm/campaigns - List campaigns
  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      search?: string;
      status?: string;
      channel?: string;
      targetSegmentId?: string;
    };
  }>("/campaigns", async (request) => {
    getAuthenticatedUser(request);
    const query = request.query;

    if (query.targetSegmentId) {
      ensureValidUUID(query.targetSegmentId, "سگمنت");
    }

    return crmService.listCampaigns({
      page: query.page ? Math.max(1, parseInt(query.page, 10)) : 1,
      pageSize: query.pageSize ? Math.min(100, Math.max(1, parseInt(query.pageSize, 10))) : 20,
      search: query.search?.trim() || undefined,
      status: query.status as CampaignStatus | undefined,
      channel: query.channel as CampaignChannel | undefined,
      targetSegmentId: query.targetSegmentId || undefined,
    });
  });

  // POST /crm/campaigns - Create campaign (platform_admin only)
  app.post<{
    Body: CreateCrmCampaignInput;
  }>("/campaigns", async (request, reply) => {
    const user = requirePlatformAdmin(request);
    if (!request.body || typeof request.body !== "object") {
      throw new DomainError("bad_request", "اطلاعات کمپین الزامی است.");
    }
    const campaign = await crmService.createCampaign(request.body, asUserId(user.userId));
    reply.status(201);
    return { campaign };
  });

  // GET /crm/campaigns/:campaignId - Get campaign details
  app.get<{
    Params: { campaignId: string };
  }>("/campaigns/:campaignId", async (request) => {
    getAuthenticatedUser(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    const campaign = await crmService.getCampaignById(campaignId);
    return { campaign };
  });

  // PATCH /crm/campaigns/:campaignId - Update campaign (platform_admin only)
  app.patch<{
    Params: { campaignId: string };
    Body: UpdateCrmCampaignInput;
  }>("/campaigns/:campaignId", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    const campaign = await crmService.updateCampaign(
      campaignId,
      request.body ?? {},
      asUserId(user.userId),
    );
    return { campaign };
  });

  // DELETE /crm/campaigns/:campaignId - Delete campaign (platform_admin only)
  app.delete<{
    Params: { campaignId: string };
  }>("/campaigns/:campaignId", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    await crmService.deleteCampaign(campaignId, asUserId(user.userId));
    return { ok: true };
  });

  // POST /crm/campaigns/:campaignId/execute - Execute campaign (platform_admin only)
  app.post<{
    Params: { campaignId: string };
  }>("/campaigns/:campaignId/execute", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    return crmService.executeCampaign(campaignId, asUserId(user.userId));
  });

  // POST /crm/campaigns/:campaignId/pause - Pause running campaign (platform_admin only)
  app.post<{
    Params: { campaignId: string };
  }>("/campaigns/:campaignId/pause", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    const campaign = await crmService.pauseCampaign(campaignId, asUserId(user.userId));
    return { campaign };
  });

  // POST /crm/campaigns/:campaignId/resume - Resume paused campaign (platform_admin only)
  app.post<{
    Params: { campaignId: string };
  }>("/campaigns/:campaignId/resume", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    const campaign = await crmService.resumeCampaign(campaignId, asUserId(user.userId));
    return { campaign };
  });

  // POST /crm/campaigns/:campaignId/cancel - Cancel campaign (platform_admin only)
  app.post<{
    Params: { campaignId: string };
  }>("/campaigns/:campaignId/cancel", async (request) => {
    const user = requirePlatformAdmin(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    const campaign = await crmService.cancelCampaign(campaignId, asUserId(user.userId));
    return { campaign };
  });

  // GET /crm/campaigns/:campaignId/executions - List campaign executions
  app.get<{
    Params: { campaignId: string };
  }>("/campaigns/:campaignId/executions", async (request) => {
    getAuthenticatedUser(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    const executions = await crmService.listCampaignExecutions(campaignId);
    return { executions };
  });

  // GET /crm/campaigns/:campaignId/recipients - List recipients / delivery log
  app.get<{
    Params: { campaignId: string };
    Querystring: {
      executionId?: string;
      status?: string;
      page?: string;
      pageSize?: string;
    };
  }>("/campaigns/:campaignId/recipients", async (request) => {
    getAuthenticatedUser(request);
    ensureValidUUID(request.params.campaignId, "کمپین");
    const campaignId = asCrmCampaignId(request.params.campaignId);
    const query = request.query;

    if (query.executionId) {
      ensureValidUUID(query.executionId, "اجرای کمپین");
    }

    const executionId = query.executionId
      ? asCrmCampaignExecutionId(query.executionId)
      : undefined;

    return crmService.listCampaignRecipients(campaignId, executionId, {
      page: query.page ? Math.max(1, parseInt(query.page, 10)) : 1,
      pageSize: query.pageSize ? Math.min(100, Math.max(1, parseInt(query.pageSize, 10))) : 20,
      status: query.status as CampaignRecipientStatus | undefined,
    });
  });
};
