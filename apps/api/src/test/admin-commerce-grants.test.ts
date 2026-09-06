import { describe, test, expect } from "vitest";
import { EntitlementService, InMemoryCommerceStore } from "../modules/commerce/index.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { asUserId, asCourseId, asContentPackId, type Actor } from "@avana/domain";

describe("Admin Commerce Grants & Entitlement Single Source of Truth", () => {
  test("Admin Grant immediately grants access in EntitlementService without separate logic", async () => {
    const commerceStore = new InMemoryCommerceStore();
    const entitlementService = new EntitlementService({ commerceStore });

    const studentUserId = asUserId("student-grant-test-1");
    const studentActor: Actor = { userId: studentUserId, role: "student" };
    const courseId = asCourseId("course-phy-101");
    const contentPackId = asContentPackId("pack-chem-201");

    // 1. Initial State: Student does not have access
    const initialCourseAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentUserId,
      resourceType: "course",
      resourceId: courseId,
      courseId,
    });
    expect(initialCourseAccess.granted).toBe(false);
    expect(initialCourseAccess.reason).toBe("locked");

    const initialPackAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentUserId,
      resourceType: "content_pack",
      resourceId: contentPackId,
      contentPackId,
    });
    expect(initialPackAccess.granted).toBe(false);
    expect(initialPackAccess.reason).toBe("locked");

    // 2. Admin grants Course Lifetime Access directly into commerce store
    await commerceStore.grantEntitlement({
      id: "ent_c_1" as any,
      userId: studentUserId,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "admin_grant",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null, // Lifetime
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 3. EntitlementService now immediately evaluates course access as GRANTED
    const grantedCourseAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentUserId,
      resourceType: "course",
      resourceId: courseId,
      courseId,
    });
    expect(grantedCourseAccess.granted).toBe(true);
    expect(grantedCourseAccess.reason).toBe("course_purchase");
    expect(grantedCourseAccess.expiresAt).toBeNull();

    // 4. Admin grants Content Pack Lifetime Access
    await commerceStore.grantEntitlement({
      id: "ent_p_1" as any,
      userId: studentUserId,
      resourceType: "content_pack",
      resourceId: contentPackId,
      sourceType: "admin_grant",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null, // Lifetime
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const grantedPackAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentUserId,
      resourceType: "content_pack",
      resourceId: contentPackId,
      contentPackId,
    });
    expect(grantedPackAccess.granted).toBe(true);
    expect(grantedPackAccess.reason).toBe("content_pack_purchase");
    expect(grantedPackAccess.expiresAt).toBeNull();

    // 5. Admin grants Subscription Access (30 days)
    const expiry = new Date(Date.now() + 30 * 86400000).toISOString();
    await commerceStore.grantEntitlement({
      id: "ent_s_1" as any,
      userId: studentUserId,
      resourceType: "subscription",
      resourceId: null,
      sourceType: "admin_grant",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: expiry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Random non-purchased course is now granted via subscription
    const randomCourseAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentUserId,
      resourceType: "course",
      resourceId: "random-course-999" as any,
      courseId: "random-course-999" as any,
    });
    expect(randomCourseAccess.granted).toBe(true);
    expect(randomCourseAccess.reason).toBe("subscription");
    expect(randomCourseAccess.expiresAt).toBe(expiry);
  });
});
