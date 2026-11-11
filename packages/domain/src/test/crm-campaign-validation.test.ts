import { describe, expect, test } from "vitest";
import {
  validateCreateCrmCampaignInput,
  validateUpdateCrmCampaignInput,
  canTransitionCampaignStatus,
  validateCampaignStatusTransition,
} from "../crm.js";

describe("CRM Campaign Validation", () => {
  const validSegmentId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  test("validates valid campaign creation input", () => {
    const input = {
      name: "کمپین بازگشت کاربران غیرفعال",
      description: "ارسال پیامک تخفیف به کاربرانی که ۳۰ روز وارد نشده‌اند",
      targetSegmentId: validSegmentId,
      channel: "sms" as const,
      messageContent: "سلام {name} عزیز، تخفیف ۳۰ درصدی ویژه برای شما فعال شد.",
      scheduledAt: "2026-11-01T10:00:00Z",
    };

    const validated = validateCreateCrmCampaignInput(input);
    expect(validated.name).toBe("کمپین بازگشت کاربران غیرفعال");
    expect(validated.targetSegmentId).toBe(validSegmentId);
    expect(validated.channel).toBe("sms");
    expect(validated.scheduledAt).toBe("2026-11-01T10:00:00.000Z");
  });

  test("rejects empty campaign name", () => {
    expect(() =>
      validateCreateCrmCampaignInput({
        name: "   ",
        targetSegmentId: validSegmentId,
        channel: "email",
      }),
    ).toThrow("عنوان کمپین الزامی است.");
  });

  test("rejects invalid segment UUID", () => {
    expect(() =>
      validateCreateCrmCampaignInput({
        name: "کمپین جدید",
        targetSegmentId: "invalid-uuid",
        channel: "email",
      }),
    ).toThrow("سگمنت مخاطبان نامعتبر یا ثبت‌نشده است.");
  });

  test("rejects invalid channel", () => {
    expect(() =>
      validateCreateCrmCampaignInput({
        name: "کمپین جدید",
        targetSegmentId: validSegmentId,
        channel: "carrier_pigeon" as any,
      }),
    ).toThrow("کانال کمپین باید یکی از موارد sms, email, telegram, in_app باشد.");
  });

  test("rejects invalid schedule date", () => {
    expect(() =>
      validateCreateCrmCampaignInput({
        name: "کمپین جدید",
        targetSegmentId: validSegmentId,
        channel: "telegram",
        scheduledAt: "not-a-date",
      }),
    ).toThrow("تاریخ زمان‌بندی نامعتبر است.");
  });

  test("validates update input partially and enforces constraints", () => {
    const validated = validateUpdateCrmCampaignInput({
      name: "نام به‌روزشده",
      channel: "in_app",
      status: "paused",
    });

    expect(validated.name).toBe("نام به‌روزشده");
    expect(validated.channel).toBe("in_app");
    expect(validated.status).toBe("paused");

    expect(() =>
      validateUpdateCrmCampaignInput({
        status: "invalid_status" as any,
      }),
    ).toThrow("نامعتبر است");
  });

  test("enforces allowed campaign status transitions", () => {
    // Valid transitions
    expect(canTransitionCampaignStatus("draft", "scheduled")).toBe(true);
    expect(canTransitionCampaignStatus("draft", "running")).toBe(true);
    expect(canTransitionCampaignStatus("draft", "cancelled")).toBe(true);
    expect(canTransitionCampaignStatus("running", "paused")).toBe(true);
    expect(canTransitionCampaignStatus("running", "completed")).toBe(true);
    expect(canTransitionCampaignStatus("paused", "running")).toBe(true);

    // Invalid transitions
    expect(canTransitionCampaignStatus("completed", "running")).toBe(false);
    expect(canTransitionCampaignStatus("completed", "draft")).toBe(false);
    expect(canTransitionCampaignStatus("cancelled", "running")).toBe(false);
    expect(canTransitionCampaignStatus("draft", "completed")).toBe(false);

    expect(() => validateCampaignStatusTransition("completed", "running")).toThrow(
      'انتقال وضعیت کمپین از "completed" به "running" مجاز نیست.',
    );
  });
});
