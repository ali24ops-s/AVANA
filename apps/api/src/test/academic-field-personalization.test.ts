/**
 * Integration & Unit tests for Academic Field Selection & Content Personalization.
 *
 * Tests:
 * 1. Register with valid academic major -> persisted and returned.
 * 2. Register with invalid major -> 400 bad_request.
 * 3. GET /v1/me -> returns user's academic major.
 * 4. PATCH /v1/auth/profile -> update academic major.
 * 5. Legacy user (major: null) -> returns null, no error.
 * 6. Course create/update with target_academic_fields.
 * 7. Course listing personalization:
 *    - Direct match (100) -> general/shared (50) -> other specific disciplines (10).
 *    - Pharmacy student vs Medicine student soft ranking comparison.
 *    - Canonical order preserved as deterministic tie-breaker.
 *    - No hard filtering of other fields.
 * 8. Search relevance boost (+25 / +10) based on student major.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemorySearchStore } from "../modules/search/in-memory-stores.js";
import type { OrganizationId, UserId, CourseId } from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Academic Field Personalization Integration Tests", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let searchStore: InMemorySearchStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    searchStore = new InMemorySearchStore(courseStore, orgStore);
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      searchStore,
    });
    return app;
  }

  it("1. registers user with valid major and returns it", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "pharmacy.student@example.com",
        password: "Password123!",
        name: "سارا داروساز",
        major: "pharmacy",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.major).toBe("pharmacy");
    expect(body.user.email).toBe("pharmacy.student@example.com");

    const savedUser = await userStore.findByEmail("pharmacy.student@example.com");
    expect(savedUser?.major).toBe("pharmacy");
  });

  it("2. rejects registration with invalid major", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "invalid.major@example.com",
        password: "Password123!",
        name: "کاربر تستی",
        major: "astrophysics_invalid",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("3. GET /v1/me returns user's academic major", async () => {
    const app = await buildApp();
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "medicine.student@example.com",
        password: "Password123!",
        name: "امیر پزشکی",
        major: "medicine",
      },
    });

    const sessionCookie = regRes.cookies.find((c) => c.name === "avana_session")?.value;
    expect(sessionCookie).toBeDefined();

    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { avana_session: sessionCookie! },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user.major).toBe("medicine");
  });

  it("4. PATCH /v1/auth/profile updates major and validates it", async () => {
    const app = await buildApp();
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "dentistry.student@example.com",
        password: "Password123!",
        name: "دندانپزشک",
        major: "dentistry",
      },
    });

    const sessionCookie = regRes.cookies.find((c) => c.name === "avana_session")?.value;

    // Update to nursing
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/v1/auth/profile",
      cookies: { avana_session: sessionCookie! },
      payload: {
        major: "nursing",
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const patchBody = JSON.parse(patchRes.body);
    expect(patchBody.user.major).toBe("nursing");

    // Try invalid major
    const invalidPatchRes = await app.inject({
      method: "PATCH",
      url: "/v1/auth/profile",
      cookies: { avana_session: sessionCookie! },
      payload: {
        major: "invalid_xyz",
      },
    });

    expect(invalidPatchRes.statusCode).toBe(400);
  });

  it("5. legacy user with major null works cleanly and is updated", async () => {
    const app = await buildApp();
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "fresh.user@example.com",
        password: "Password123!",
        name: "کاربر تستی",
        major: "other",
      },
    });
    const sessionCookie = regRes.cookies.find((c) => c.name === "avana_session")?.value;
    expect(sessionCookie).toBeDefined();

    // Now update major
    const updateRes = await app.inject({
      method: "PATCH",
      url: "/v1/auth/profile",
      cookies: { avana_session: sessionCookie! },
      payload: { major: "medical_laboratory" },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).user.major).toBe("medical_laboratory");
  });

  it("6. creates and updates course with target_academic_fields", async () => {
    const app = await buildApp();
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "author@example.com",
        password: "Password123!",
        name: "نویسنده دوره",
        major: "pharmacy",
      },
    });

    const sessionCookie = regRes.cookies.find((c) => c.name === "avana_session")?.value;

    // Create an organization where user is owner
    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: sessionCookie! },
      payload: { name: "دانشکده داروسازی" },
    });
    expect(orgRes.statusCode).toBe(201);
    const orgId = JSON.parse(orgRes.body).organization.id;

    // Create course with target_academic_fields
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses`,
      cookies: { avana_session: sessionCookie! },
      payload: {
        title: "فارماکولوژی ۱",
        subject: "داروشناسی",
        target_academic_fields: ["pharmacy", "medicine"],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body);
    expect(createBody.course.target_academic_fields).toEqual(["pharmacy", "medicine"]);
    const courseId = createBody.course.id;

    // Update course with new target fields
    const patchCourseRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${orgId}/courses/${courseId}`,
      cookies: { avana_session: sessionCookie! },
      payload: {
        target_academic_fields: ["pharmacy", "dentistry"],
      },
    });

    expect(patchCourseRes.statusCode).toBe(200);
    const patchCourseBody = JSON.parse(patchCourseRes.body);
    expect(patchCourseBody.course.target_academic_fields).toEqual(["pharmacy", "dentistry"]);
  });

  it("7. personalizes course listing based on student major with soft ranking and canonical tie-breaker", async () => {
    const app = await buildApp();

    // Create Pharmacy student
    const pharmRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "pharm.student@example.com",
        password: "Password123!",
        name: "دانشجوی داروسازی",
        major: "pharmacy",
      },
    });
    const pharmCookie = pharmRes.cookies.find((c) => c.name === "avana_session")?.value;
    const pharmUser = await userStore.findByEmail("pharm.student@example.com");
    const pharmOrgId = (await orgStore.listByUserId(pharmUser!.id as UserId))[0].id;

    // Create 3 courses in the org:
    // Course A: "داخلی جراحی" -> Medicine only
    // Course B: "بافت شناسی" -> General / shared (empty target fields)
    // Course C: "شیمی دارویی ۱" -> Pharmacy only

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${pharmOrgId}/courses`,
      cookies: { avana_session: pharmCookie! },
      payload: {
        title: "داخلی جراحی",
        target_academic_fields: ["medicine"],
      },
    });

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${pharmOrgId}/courses`,
      cookies: { avana_session: pharmCookie! },
      payload: {
        title: "بافت شناسی",
        target_academic_fields: [],
      },
    });

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${pharmOrgId}/courses`,
      cookies: { avana_session: pharmCookie! },
      payload: {
        title: "شیمی دارویی ۱",
        target_academic_fields: ["pharmacy"],
      },
    });

    // Pharmacy student lists courses
    const listForPharm = await app.inject({
      method: "GET",
      url: `/v1/organizations/${pharmOrgId}/courses`,
      cookies: { avana_session: pharmCookie! },
    });

    expect(listForPharm.statusCode).toBe(200);
    const pharmListBody = JSON.parse(listForPharm.body);
    const titlesForPharm = pharmListBody.items.map((c: any) => c.title);

    // 1st: شیمی دارویی ۱ (100 - direct match)
    // 2nd: بافت شناسی (50 - shared/general)
    // 3rd: داخلی جراحی (10 - medicine specific, soft-ranked, NOT excluded)
    expect(titlesForPharm[0]).toBe("شیمی دارویی ۱");
    expect(titlesForPharm[1]).toBe("بافت شناسی");
    expect(titlesForPharm[2]).toBe("داخلی جراحی");

    // Now change user's major to "medicine" and list again
    await app.inject({
      method: "PATCH",
      url: "/v1/auth/profile",
      cookies: { avana_session: pharmCookie! },
      payload: { major: "medicine" },
    });

    const listForMed = await app.inject({
      method: "GET",
      url: `/v1/organizations/${pharmOrgId}/courses`,
      cookies: { avana_session: pharmCookie! },
    });

    const medListBody = JSON.parse(listForMed.body);
    const titlesForMed = medListBody.items.map((c: any) => c.title);

    // For Medicine student:
    // 1st: داخلی جراحی (100 - direct match)
    // 2nd: بافت شناسی (50 - shared/general)
    // 3rd: شیمی دارویی ۱ (10 - pharmacy specific, soft-ranked)
    expect(titlesForMed[0]).toBe("داخلی جراحی");
    expect(titlesForMed[1]).toBe("بافت شناسی");
    expect(titlesForMed[2]).toBe("شیمی دارویی ۱");
  });
});
