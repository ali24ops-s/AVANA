import { describe, it, expect } from "vitest";
import { isUUID } from "./ids.js";
import {
  normalizeCourseSlug,
  isValidCourseSlug,
  generateDefaultCourseSlug,
  getCourseUrl,
} from "./course-slug.js";

describe("course-slug domain primitives", () => {
  it("detects valid UUIDs accurately", () => {
    expect(isUUID("8f72a91c-1234-4678-9abc-def012345678")).toBe(true);
    expect(isUUID("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")).toBe(true);
    expect(isUUID("pharmacology-2")).toBe(false);
    expect(isUUID("not-a-uuid")).toBe(false);
    expect(isUUID(null as unknown as string)).toBe(false);
    expect(isUUID(undefined as unknown as string)).toBe(false);
  });

  it("normalizes text and digits to clean slug", () => {
    expect(normalizeCourseSlug("Pharmacology 2")).toBe("pharmacology-2");
    expect(normalizeCourseSlug("فارماکولوژی ۲")).toBe("2");
    expect(normalizeCourseSlug("Bio-Chemistry_101  Advanced")).toBe("bio-chemistry-101-advanced");
    expect(normalizeCourseSlug("--Leading and Trailing--")).toBe("leading-and-trailing");
    expect(normalizeCourseSlug("بافت\u200Cشناسی_پیشرفته   ۱۰۱")).toBe("101");
    expect(normalizeCourseSlug("Clinical\u200BPharmacy\u200D_Practice\uFEFF101")).toBe("clinical-pharmacy-practice-101");
    expect(normalizeCourseSlug("Multiple   Spaces___And---Hyphens")).toBe("multiple-spaces-and-hyphens");
  });

  it("validates course slugs and blocks reserved words", () => {
    expect(isValidCourseSlug("pharmacology-2")).toBe(true);
    expect(isValidCourseSlug("medicinal-chemistry-1")).toBe(true);
    expect(isValidCourseSlug("a")).toBe(false); // too short
    expect(isValidCourseSlug("admin")).toBe(false); // reserved
    expect(isValidCourseSlug("courses")).toBe(false); // reserved
    expect(isValidCourseSlug("manage")).toBe(false); // reserved
    expect(isValidCourseSlug("-invalid-")).toBe(false);
    expect(isValidCourseSlug("has_underscore")).toBe(false);
  });

  it("generates deterministic default slugs for known courses", () => {
    expect(
      generateDefaultCourseSlug({
        id: "8f72a91c-1234-5678-9abc-def012345678",
        name: "فارماکولوژی ۲",
      })
    ).toBe("pharmacology-2");

    expect(
      generateDefaultCourseSlug({
        id: "8f72a91c-1234-5678-9abc-def012345678",
        name: "شیمی دارویی ۱",
      })
    ).toBe("medicinal-chemistry-1");

    expect(
      generateDefaultCourseSlug({
        id: "8f72a91c-1234-5678-9abc-def012345678",
        name: "آناتومی قلب",
      })
    ).toBe("anatomy-heart");
  });

  it("generates fallback slugs for unknown courses with shortId", () => {
    const slug = generateDefaultCourseSlug({
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "یک درس کاملاً جدید و ناشناخته",
    });
    expect(slug).toBe("course-a1b2c3d4");
  });

  it("constructs correct public course URLs using getCourseUrl", () => {
    expect(
      getCourseUrl({
        id: "8f72a91c-1234-5678-9abc-def012345678",
        slug: "pharmacology-2",
      })
    ).toBe("/courses/pharmacology-2");

    expect(
      getCourseUrl({
        id: "8f72a91c-1234-5678-9abc-def012345678",
        slug: "",
      })
    ).toBe("/courses/8f72a91c-1234-5678-9abc-def012345678");

    expect(
      getCourseUrl({
        id: "8f72a91c-1234-5678-9abc-def012345678",
      })
    ).toBe("/courses/8f72a91c-1234-5678-9abc-def012345678");
  });
});
