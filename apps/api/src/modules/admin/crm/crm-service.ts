import {
  DomainError,
  type UserId,
  type CrmTagId,
  type CrmCustomerNoteId,
  type CrmSegmentId,
  type CrmCampaignId,
  type CrmCampaignExecutionId,
  type CrmTagItem,
  type CreateCrmTagInput,
  type UpdateCrmTagInput,
  type CrmCustomerNoteItem,
  type CreateCrmCustomerNoteInput,
  type UpdateCrmCustomerNoteInput,
  type ListCrmCustomersParams,
  type ListCrmCustomersResponse,
  type CrmCustomer360Profile,
  type CrmSegmentItem,
  type CreateCrmSegmentInput,
  type UpdateCrmSegmentInput,
  type ListCrmSegmentsParams,
  type ListCrmSegmentsResponse,
  type GetSegmentMembersParams,
  type CrmCampaignItem,
  type CreateCrmCampaignInput,
  type UpdateCrmCampaignInput,
  type ListCrmCampaignsParams,
  type ListCrmCampaignsResponse,
  type CrmCampaignExecutionItem,
  type ListCrmCampaignRecipientsParams,
  type ListCrmCampaignRecipientsResponse,
  validateCreateCrmSegmentInput,
  validateUpdateCrmSegmentInput,
  validateSegmentRules,
  validateCreateCrmCampaignInput,
  validateUpdateCrmCampaignInput,
  validateCampaignStatusTransition,
} from "@avana/domain";
import type { CrmStore } from "./crm-store.js";
import type { AuditService } from "../../../observability/audit-service.js";
import type { CrmCampaignQueue } from "./crm-campaign-queue.js";
import type { CrmChannelAdapterRegistry } from "./crm-channel-adapter.js";

export class CrmService {
  constructor(
    private readonly store: CrmStore,
    private readonly auditService?: AuditService,
    private readonly campaignQueue?: CrmCampaignQueue,
    private readonly channelAdapterRegistry?: CrmChannelAdapterRegistry,
  ) {}

  getCampaignQueue(): CrmCampaignQueue | undefined {
    return this.campaignQueue;
  }

  getChannelAdapterRegistry(): CrmChannelAdapterRegistry | undefined {
    return this.channelAdapterRegistry;
  }

  async listCustomers(params: ListCrmCustomersParams): Promise<ListCrmCustomersResponse> {
    return this.store.listCustomers(params);
  }

  async getCustomer360(
    userId: UserId,
    isPlatformAdmin = false,
  ): Promise<CrmCustomer360Profile> {
    const profile = await this.store.getCustomer360(userId);
    if (!profile) {
      throw new DomainError("not_found", "کاربر مورد نظر یافت نشد.");
    }
    if (!isPlatformAdmin) {
      const { financial: _financial, ...profileWithoutFinancial } = profile;
      return profileWithoutFinancial;
    }
    return profile;
  }

  async listTags(): Promise<CrmTagItem[]> {
    return this.store.listTags();
  }

  async createTag(input: CreateCrmTagInput, actorId: UserId): Promise<CrmTagItem> {
    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      throw new DomainError("bad_request", "نام برچسب الزامی است.");
    }
    if (trimmedName.length > 100) {
      throw new DomainError("bad_request", "نام برچسب نمی‌تواند بیشتر از ۱۰۰ کاراکتر باشد.");
    }
    const color = input.color?.trim() || "#6366f1";
    if (color.length > 20) {
      throw new DomainError("bad_request", "کد رنگ برچسب نامعتبر است.");
    }
    const desc = input.description?.trim() || null;
    if (desc && desc.length > 1000) {
      throw new DomainError("bad_request", "توضیحات برچسب نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد.");
    }

    const tag = await this.store.createTag({
      name: trimmedName,
      color,
      description: desc,
    });
    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.tag.created",
          entityType: "crm_tag",
          entityId: tag.id,
          createdAt: new Date().toISOString(),
          details: { name: tag.name, color: tag.color },
        },
      ]);
    }
    return tag;
  }

  async updateTag(
    tagId: CrmTagId,
    input: UpdateCrmTagInput,
    actorId: UserId,
  ): Promise<CrmTagItem> {
    const trimmedName = input.name !== undefined ? input.name.trim() : undefined;
    if (trimmedName !== undefined && !trimmedName) {
      throw new DomainError("bad_request", "نام برچسب نمی‌تواند خالی باشد.");
    }
    if (trimmedName && trimmedName.length > 100) {
      throw new DomainError("bad_request", "نام برچسب نمی‌تواند بیشتر از ۱۰۰ کاراکتر باشد.");
    }
    const color = input.color !== undefined ? input.color.trim() : undefined;
    if (color && color.length > 20) {
      throw new DomainError("bad_request", "کد رنگ برچسب نامعتبر است.");
    }
    const desc =
      input.description !== undefined ? input.description?.trim() || null : undefined;
    if (desc && desc.length > 1000) {
      throw new DomainError("bad_request", "توضیحات برچسب نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد.");
    }

    const tag = await this.store.updateTag(tagId, {
      name: trimmedName,
      color,
      description: desc,
    });
    if (!tag) {
      throw new DomainError("not_found", "برچسب مورد نظر یافت نشد.");
    }
    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.tag.updated",
          entityType: "crm_tag",
          entityId: tag.id,
          createdAt: new Date().toISOString(),
          details: { name: tag.name, color: tag.color },
        },
      ]);
    }
    return tag;
  }

  async deleteTag(tagId: CrmTagId, actorId: UserId): Promise<void> {
    const deleted = await this.store.deleteTag(tagId);
    if (!deleted) {
      throw new DomainError("not_found", "برچسب مورد نظر یافت نشد.");
    }
    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.tag.deleted",
          entityType: "crm_tag",
          entityId: tagId,
          createdAt: new Date().toISOString(),
          details: { tagId },
        },
      ]);
    }
  }

  async attachTagToCustomer(userId: UserId, tagId: CrmTagId, actorId: UserId): Promise<void> {
    await this.store.assignTag(userId, tagId, actorId);
    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.customer_tag.attached",
          entityType: "crm_customer_tag",
          entityId: `${userId}:${tagId}`,
          createdAt: new Date().toISOString(),
          details: { userId, tagId },
        },
      ]);
    }
  }

  async detachTagFromCustomer(userId: UserId, tagId: CrmTagId, actorId: UserId): Promise<void> {
    await this.store.removeTag(userId, tagId);
    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.customer_tag.detached",
          entityType: "crm_customer_tag",
          entityId: `${userId}:${tagId}`,
          createdAt: new Date().toISOString(),
          details: { userId, tagId },
        },
      ]);
    }
  }

  async listCustomerNotes(userId: UserId): Promise<CrmCustomerNoteItem[]> {
    return this.store.listCustomerNotes(userId);
  }

  async createCustomerNote(
    userId: UserId,
    authorId: UserId,
    input: CreateCrmCustomerNoteInput,
  ): Promise<CrmCustomerNoteItem> {
    const trimmedContent = input.content?.trim();
    if (!trimmedContent) {
      throw new DomainError("bad_request", "متن یادداشت الزامی است.");
    }
    if (trimmedContent.length > 5000) {
      throw new DomainError("bad_request", "متن یادداشت نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد.");
    }

    const note = await this.store.createCustomerNote(userId, authorId, {
      content: trimmedContent,
      isPinned: !!input.isPinned,
    });
    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId: authorId,
          organizationId: null,
          action: "crm.customer_note.created",
          entityType: "crm_customer_note",
          entityId: note.id,
          createdAt: new Date().toISOString(),
          details: { userId, noteId: note.id, isPinned: note.isPinned },
        },
      ]);
    }
    return note;
  }

  async updateCustomerNote(
    userId: UserId,
    noteId: CrmCustomerNoteId,
    actorId: UserId,
    isPlatformAdmin: boolean,
    input: UpdateCrmCustomerNoteInput,
  ): Promise<CrmCustomerNoteItem> {
    const existing = await this.store.findNoteById(noteId);
    if (!existing || existing.userId !== userId) {
      throw new DomainError("not_found", "یادداشت مورد نظر یافت نشد.");
    }
    if (!isPlatformAdmin && existing.authorId !== actorId) {
      throw new DomainError("forbidden", "شما دسترسی لازم برای ویرایش این یادداشت را ندارید.");
    }

    const trimmedContent = input.content !== undefined ? input.content.trim() : undefined;
    if (trimmedContent !== undefined) {
      if (!trimmedContent) {
        throw new DomainError("bad_request", "متن یادداشت نمی‌تواند خالی باشد.");
      }
      if (trimmedContent.length > 5000) {
        throw new DomainError("bad_request", "متن یادداشت نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد.");
      }
    }

    const note = await this.store.updateCustomerNote(noteId, {
      content: trimmedContent,
      isPinned: input.isPinned,
    });
    if (!note) {
      throw new DomainError("not_found", "یادداشت مورد نظر یافت نشد.");
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.customer_note.updated",
          entityType: "crm_customer_note",
          entityId: note.id,
          createdAt: new Date().toISOString(),
          details: { noteId: note.id, isPinned: note.isPinned },
        },
      ]);
    }
    return note;
  }

  async deleteCustomerNote(
    userId: UserId,
    noteId: CrmCustomerNoteId,
    actorId: UserId,
    isPlatformAdmin: boolean,
  ): Promise<void> {
    const existing = await this.store.findNoteById(noteId);
    if (!existing || existing.userId !== userId) {
      throw new DomainError("not_found", "یادداشت مورد نظر یافت نشد.");
    }
    if (!isPlatformAdmin && existing.authorId !== actorId) {
      throw new DomainError("forbidden", "شما دسترسی لازم برای حذف این یادداشت را ندارید.");
    }

    const deleted = await this.store.deleteCustomerNote(noteId);
    if (!deleted) {
      throw new DomainError("not_found", "یادداشت مورد نظر یافت نشد.");
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.customer_note.deleted",
          entityType: "crm_customer_note",
          entityId: noteId,
          createdAt: new Date().toISOString(),
          details: { noteId },
        },
      ]);
    }
  }

  // -------------------------------------------------------------------------
  // Segments (Phase 2)
  // -------------------------------------------------------------------------

  async listSegments(params?: ListCrmSegmentsParams): Promise<ListCrmSegmentsResponse> {
    return this.store.listSegments(params);
  }

  async getSegmentById(id: CrmSegmentId): Promise<CrmSegmentItem> {
    const segment = await this.store.findSegmentById(id);
    if (!segment) {
      throw new DomainError("not_found", "سگمنت مورد نظر یافت نشد.");
    }
    return segment;
  }

  async createSegment(
    input: CreateCrmSegmentInput,
    actorId: UserId,
  ): Promise<CrmSegmentItem> {
    const validated = validateCreateCrmSegmentInput(input);
    const segment = await this.store.createSegment(validated, actorId);

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.segment.created",
          entityType: "crm_segment",
          entityId: segment.id,
          createdAt: new Date().toISOString(),
          details: {
            name: segment.name,
            matchOperator: segment.matchOperator,
            rulesCount: segment.filterRules.length,
            isActive: segment.isActive,
          },
        },
      ]);
    }

    return segment;
  }

  async updateSegment(
    id: CrmSegmentId,
    input: UpdateCrmSegmentInput,
    actorId: UserId,
  ): Promise<CrmSegmentItem> {
    const existing = await this.store.findSegmentById(id);
    if (!existing) {
      throw new DomainError("not_found", "سگمنت مورد نظر یافت نشد.");
    }

    const validated = validateUpdateCrmSegmentInput(input);
    const updated = await this.store.updateSegment(id, validated);
    if (!updated) {
      throw new DomainError("not_found", "سگمنت مورد نظر یافت نشد.");
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.segment.updated",
          entityType: "crm_segment",
          entityId: id,
          createdAt: new Date().toISOString(),
          details: {
            name: updated.name,
            matchOperator: updated.matchOperator,
            rulesCount: updated.filterRules.length,
            isActive: updated.isActive,
          },
        },
      ]);
    }

    return updated;
  }

  async deleteSegment(id: CrmSegmentId, actorId: UserId): Promise<void> {
    const existing = await this.store.findSegmentById(id);
    if (!existing) {
      throw new DomainError("not_found", "سگمنت مورد نظر یافت نشد.");
    }

    const deleted = await this.store.deleteSegment(id);
    if (!deleted) {
      throw new DomainError("not_found", "سگمنت مورد نظر یافت نشد.");
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.segment.deleted",
          entityType: "crm_segment",
          entityId: id,
          createdAt: new Date().toISOString(),
          details: { segmentId: id, name: existing.name },
        },
      ]);
    }
  }

  async previewSegmentCount(
    rules: unknown,
    matchOperator?: string,
  ): Promise<{ count: number }> {
    const validatedRules = validateSegmentRules(rules);
    const op = matchOperator === "or" ? "or" : "and";
    const count = await this.store.previewSegmentCount(validatedRules, op);
    return { count };
  }

  async getSegmentMembers(
    segmentId: CrmSegmentId,
    params?: Omit<GetSegmentMembersParams, "segmentId">,
  ): Promise<ListCrmCustomersResponse> {
    const segment = await this.store.findSegmentById(segmentId);
    if (!segment) {
      throw new DomainError("not_found", "سگمنت مورد نظر یافت نشد.");
    }
    return this.store.getSegmentMembers({ segmentId, ...params });
  }

  // -------------------------------------------------------------------------
  // Campaigns (Phase 3)
  // -------------------------------------------------------------------------

  async listCampaigns(params?: ListCrmCampaignsParams): Promise<ListCrmCampaignsResponse> {
    return this.store.listCampaigns(params);
  }

  async getCampaignById(id: CrmCampaignId): Promise<CrmCampaignItem> {
    const campaign = await this.store.findCampaignById(id);
    if (!campaign) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }
    return campaign;
  }

  async createCampaign(
    input: CreateCrmCampaignInput,
    actorId: UserId,
  ): Promise<CrmCampaignItem> {
    const validated = validateCreateCrmCampaignInput(input);

    const segment = await this.store.findSegmentById(validated.targetSegmentId);
    if (!segment) {
      throw new DomainError("bad_request", "سگمنت مخاطبان انتخاب‌شده یافت نشد.");
    }
    if (!segment.isActive) {
      throw new DomainError("bad_request", "سگمنت انتخاب‌شده غیرفعال است و امکان استفاده در کمپین را ندارد.");
    }

    const campaign = await this.store.createCampaign(validated, actorId);

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.campaign.created",
          entityType: "crm_campaign",
          entityId: campaign.id,
          createdAt: new Date().toISOString(),
          details: {
            name: campaign.name,
            targetSegmentId: campaign.targetSegmentId,
            channel: campaign.channel,
            status: campaign.status,
          },
        },
      ]);
    }

    return campaign;
  }

  async updateCampaign(
    id: CrmCampaignId,
    input: UpdateCrmCampaignInput,
    actorId: UserId,
  ): Promise<CrmCampaignItem> {
    const existing = await this.store.findCampaignById(id);
    if (!existing) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    const validated = validateUpdateCrmCampaignInput(input);

    if (validated.status !== undefined && validated.status !== existing.status) {
      validateCampaignStatusTransition(existing.status, validated.status);
    }

    if (validated.targetSegmentId !== undefined && validated.targetSegmentId !== existing.targetSegmentId) {
      const segment = await this.store.findSegmentById(validated.targetSegmentId);
      if (!segment) {
        throw new DomainError("bad_request", "سگمنت مخاطبان انتخاب‌شده یافت نشد.");
      }
      if (!segment.isActive) {
        throw new DomainError("bad_request", "سگمنت انتخاب‌شده غیرفعال است و امکان استفاده در کمپین را ندارد.");
      }
    }

    const updated = await this.store.updateCampaign(id, validated);
    if (!updated) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.campaign.updated",
          entityType: "crm_campaign",
          entityId: id,
          createdAt: new Date().toISOString(),
          details: {
            name: updated.name,
            status: updated.status,
            channel: updated.channel,
          },
        },
      ]);
    }

    return updated;
  }

  async deleteCampaign(id: CrmCampaignId, actorId: UserId): Promise<void> {
    const existing = await this.store.findCampaignById(id);
    if (!existing) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    if (existing.status === "running") {
      throw new DomainError("bad_request", "کمپین در حال اجرا قابل حذف نیست. ابتدا آن را متوقف یا لغو کنید.");
    }

    const deleted = await this.store.deleteCampaign(id);
    if (!deleted) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.campaign.deleted",
          entityType: "crm_campaign",
          entityId: id,
          createdAt: new Date().toISOString(),
          details: { campaignId: id, name: existing.name },
        },
      ]);
    }
  }

  async executeCampaign(
    id: CrmCampaignId,
    actorId: UserId,
  ): Promise<{
    campaign: CrmCampaignItem;
    execution: CrmCampaignExecutionItem;
    recipientsQueued: number;
  }> {
    const campaign = await this.store.findCampaignById(id);
    if (!campaign) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    if (campaign.status === "running") {
      throw new DomainError("bad_request", "کمپین در حال حاضر در حال اجرا است.");
    }

    if (campaign.status === "completed" || campaign.status === "cancelled") {
      throw new DomainError(
        "bad_request",
        `امکان اجرای کمپین در وضعیت "${campaign.status}" وجود ندارد.`,
      );
    }

    // Validate that segment exists and is active
    const segment = await this.store.findSegmentById(campaign.targetSegmentId);
    if (!segment || !segment.isActive) {
      throw new DomainError(
        "bad_request",
        "سگمنت مخاطبان این کمپین حذف‌شده یا غیرفعال است و کمپین امکان اجرا ندارد.",
      );
    }

    // Dynamic recipient calculation at execution time
    const matchingUserIds = await this.store.getMatchingSegmentUserIds(campaign.targetSegmentId);

    // Update campaign status to running
    await this.store.updateCampaign(id, { status: "running" });

    // Create execution record
    const execution = await this.store.createCampaignExecution(
      campaign.id,
      actorId,
      matchingUserIds.length,
      "running",
    );

    // Prepare delivery records (pending for background queue dispatch)
    if (matchingUserIds.length > 0) {
      await this.store.batchCreateCampaignRecipients(
        matchingUserIds.map((userId) => ({
          campaignId: campaign.id,
          executionId: execution.id,
          userId,
          channel: campaign.channel,
          status: "queued" as const,
        })),
      );

      // Trigger queue job if queue is configured
      if (this.campaignQueue) {
        const enqueued = await this.campaignQueue.enqueueCampaignExecution({
          campaignId: campaign.id,
          executionId: execution.id,
        });
        await this.store.updateCampaignExecution(execution.id, { jobId: enqueued.jobId });
      }
    } else {
      await this.store.updateCampaignExecution(execution.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      await this.store.updateCampaign(id, { status: "completed" });
    }

    const updatedCampaign = await this.getCampaignById(id);
    const updatedExecution = (await this.store.findExecutionById(execution.id)) ?? execution;

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.campaign.executed",
          entityType: "crm_campaign",
          entityId: campaign.id,
          createdAt: new Date().toISOString(),
          details: {
            campaignId: campaign.id,
            executionId: execution.id,
            totalRecipients: matchingUserIds.length,
            channel: campaign.channel,
          },
        },
      ]);
    }

    return {
      campaign: updatedCampaign,
      execution: updatedExecution,
      recipientsQueued: matchingUserIds.length,
    };
  }

  async pauseCampaign(id: CrmCampaignId, actorId: UserId): Promise<CrmCampaignItem> {
    const campaign = await this.store.findCampaignById(id);
    if (!campaign) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    if (campaign.status !== "running") {
      throw new DomainError("bad_request", "تنها کمپین‌های در حال اجرا امکان توقف دارند.");
    }

    const updated = await this.store.updateCampaign(id, { status: "paused" });
    if (!updated) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    // Also update current execution
    const latestExecution = await this.store.findLatestCampaignExecution(id);
    if (latestExecution && latestExecution.status === "running") {
      await this.store.updateCampaignExecution(latestExecution.id, { status: "paused" });
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.campaign.paused",
          entityType: "crm_campaign",
          entityId: id,
          createdAt: new Date().toISOString(),
          details: { campaignId: id, name: updated.name },
        },
      ]);
    }

    return updated;
  }

  async resumeCampaign(id: CrmCampaignId, actorId: UserId): Promise<CrmCampaignItem> {
    const campaign = await this.store.findCampaignById(id);
    if (!campaign) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    if (campaign.status !== "paused") {
      throw new DomainError("bad_request", "تنها کمپین‌های متوقف‌شده امکان ازسرگیری دارند.");
    }

    const updated = await this.store.updateCampaign(id, { status: "running" });
    if (!updated) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    const latestExecution = await this.store.findLatestCampaignExecution(id);
    if (latestExecution && latestExecution.status === "paused") {
      await this.store.updateCampaignExecution(latestExecution.id, { status: "running" });
      if (this.campaignQueue) {
        await this.campaignQueue.enqueueCampaignExecution({
          campaignId: id,
          executionId: latestExecution.id,
        });
      }
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.campaign.resumed",
          entityType: "crm_campaign",
          entityId: id,
          createdAt: new Date().toISOString(),
          details: { campaignId: id, name: updated.name },
        },
      ]);
    }

    return updated;
  }

  async cancelCampaign(id: CrmCampaignId, actorId: UserId): Promise<CrmCampaignItem> {
    const campaign = await this.store.findCampaignById(id);
    if (!campaign) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    if (campaign.status === "cancelled" || campaign.status === "completed") {
      throw new DomainError("bad_request", `امکان لغو کمپین در وضعیت "${campaign.status}" وجود ندارد.`);
    }

    const updated = await this.store.updateCampaign(id, { status: "cancelled" });
    if (!updated) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    const latestExecution = await this.store.findLatestCampaignExecution(id);
    if (
      latestExecution &&
      (latestExecution.status === "running" ||
        latestExecution.status === "paused" ||
        latestExecution.status === "pending")
    ) {
      await this.store.batchSkipRecipients(
        latestExecution.id,
        "کمپین توسط مدیر لغو شد.",
        "CAMPAIGN_CANCELLED",
      );
      const counts = await this.store.getExecutionCounts(latestExecution.id);
      await this.store.updateCampaignExecution(latestExecution.id, {
        status: "cancelled",
        processedRecipients: counts.processed,
        successfulRecipients: counts.successful,
        failedRecipients: counts.failed,
        completedAt: new Date().toISOString(),
      });
    }

    if (this.auditService) {
      void this.auditService.emit([
        {
          actorId,
          organizationId: null,
          action: "crm.campaign.cancelled",
          entityType: "crm_campaign",
          entityId: id,
          createdAt: new Date().toISOString(),
          details: { campaignId: id, name: updated.name },
        },
      ]);
    }

    return updated;
  }

  async listCampaignExecutions(campaignId: CrmCampaignId): Promise<CrmCampaignExecutionItem[]> {
    const campaign = await this.store.findCampaignById(campaignId);
    if (!campaign) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }
    return this.store.listCampaignExecutions(campaignId);
  }

  async listCampaignRecipients(
    campaignId: CrmCampaignId,
    executionId?: CrmCampaignExecutionId,
    params?: ListCrmCampaignRecipientsParams,
  ): Promise<ListCrmCampaignRecipientsResponse> {
    const campaign = await this.store.findCampaignById(campaignId);
    if (!campaign) {
      throw new DomainError("not_found", "کمپین مورد نظر یافت نشد.");
    }

    let targetExecId = executionId;
    if (!targetExecId) {
      const latest = await this.store.findLatestCampaignExecution(campaignId);
      if (!latest) {
        return {
          recipients: [],
          totalCount: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        };
      }
      targetExecId = latest.id as CrmCampaignExecutionId;
    }

    return this.store.listCampaignRecipients(targetExecId, params);
  }
}
