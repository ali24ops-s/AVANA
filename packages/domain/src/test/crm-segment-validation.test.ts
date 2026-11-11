import { describe, it, expect } from "vitest";
import {
  validateSegmentRules,
  validateCreateCrmSegmentInput,
  validateUpdateCrmSegmentInput,
  type SegmentFilterRule,
} from "../crm.js";
import { DomainError } from "../errors.js";

describe("CRM Dynamic Segmentation Validation", () => {
  const validUuid = "11111111-1111-4111-a111-111111111111";
  const validUuid2 = "22222222-2222-4222-a222-222222222222";

  it("validates valid segment creation input with diverse rules", () => {
    const rules: SegmentFilterRule[] = [
      {
        field: "user.createdAt",
        operator: "between",
        value: ["2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"],
      },
      {
        field: "user.emailVerified",
        operator: "is_true",
        value: true,
      },
      {
        field: "user.major",
        operator: "equals",
        value: "پزشکی",
      },
      {
        field: "crm.tag",
        operator: "in",
        value: [validUuid, validUuid2],
      },
      {
        field: "payment.hasCashPurchase",
        operator: "is_true",
        value: true,
      },
      {
        field: "payment.totalCashSpent",
        operator: "greater_than_or_equal",
        value: 500000,
      },
      {
        field: "activity.studySessionsCount",
        operator: "greater_than",
        value: 5,
        window: "last_30_days",
      },
      {
        field: "activity.totalStudyTimeMinutes",
        operator: "between",
        value: [60, 600],
        window: "last_7_days",
      },
    ];

    const result = validateCreateCrmSegmentInput({
      name: "دانشجویان پزشکی فعال",
      description: "دانشجویان فعال پزشکی با خرید نقدی در ماه گذشته",
      matchOperator: "and",
      filterRules: rules,
    });

    expect(result.name).toBe("دانشجویان پزشکی فعال");
    expect(result.matchOperator).toBe("and");
    expect(result.isActive).toBe(true);
    expect(result.filterRules).toHaveLength(8);
  });

  it("rejects unknown field", () => {
    expect(() =>
      validateSegmentRules([
        {
          field: "user.degree" as any,
          operator: "equals",
          value: "bachelor",
        },
      ]),
    ).toThrow(DomainError);
  });

  it("rejects invalid operator for field type", () => {
    expect(() =>
      validateSegmentRules([
        {
          field: "user.emailVerified",
          operator: "greater_than" as any,
          value: 10,
        },
      ]),
    ).toThrow(DomainError);
  });

  it("rejects negative numeric values", () => {
    expect(() =>
      validateSegmentRules([
        {
          field: "payment.totalCashSpent",
          operator: "equals",
          value: -100,
        },
      ]),
    ).toThrow(DomainError);
  });

  it("rejects inverted between range for numbers", () => {
    expect(() =>
      validateSegmentRules([
        {
          field: "payment.totalCashSpent",
          operator: "between",
          value: [1000, 500],
        },
      ]),
    ).toThrow(DomainError);
  });

  it("rejects inverted between range for dates", () => {
    expect(() =>
      validateSegmentRules([
        {
          field: "user.createdAt",
          operator: "between",
          value: ["2026-06-01T00:00:00Z", "2026-01-01T00:00:00Z"],
        },
      ]),
    ).toThrow(DomainError);
  });

  it("rejects invalid date strings", () => {
    expect(() =>
      validateSegmentRules([
        {
          field: "user.createdAt",
          operator: "greater_than",
          value: "invalid-date",
        },
      ]),
    ).toThrow(DomainError);
  });

  it("rejects invalid UUID in tag rule", () => {
    expect(() =>
      validateSegmentRules([
        {
          field: "crm.tag",
          operator: "equals",
          value: "not-a-uuid",
        },
      ]),
    ).toThrow(DomainError);

    expect(() =>
      validateSegmentRules([
        {
          field: "crm.tag",
          operator: "in",
          value: [validUuid, "not-a-uuid"],
        },
      ]),
    ).toThrow(DomainError);
  });

  it("rejects more than 20 rules", () => {
    const rules: any[] = [];
    for (let i = 0; i < 21; i++) {
      rules.push({
        field: "payment.hasCashPurchase",
        operator: "is_true",
        value: true,
      });
    }

    expect(() => validateSegmentRules(rules)).toThrow("حداکثر ۲۰ شرط");
  });

  it("validates days_ago operator for dates", () => {
    const rules: any[] = [
      {
        field: "activity.lastActiveDate",
        operator: "days_ago_less_than",
        value: 14,
      },
    ];

    const validated = validateSegmentRules(rules);
    expect(validated).toHaveLength(1);
    expect(validated[0].value).toBe(14);
  });

  it("validates update input partially and enforces constraints", () => {
    const update = validateUpdateCrmSegmentInput({
      name: "نام جدید سگمنت",
      isActive: false,
      matchOperator: "or",
    });

    expect(update.name).toBe("نام جدید سگمنت");
    expect(update.isActive).toBe(false);
    expect(update.matchOperator).toBe("or");
    expect(update.filterRules).toBeUndefined();
  });
});
