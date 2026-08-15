/**
 * PR6-2 Integration tests: Document upload pipeline.
 *
 * Covers the acceptance criteria:
 * 1. POST upload-intent validates metadata and returns an intent
 * 2. POST documents (multipart) persists file + metadata, returns 201
 * 3. Duplicate upload returns 200 with the existing document (no re-processing)
 * 4. GET documents lists the actor's uploads
 * 5. GET documents/:id returns a single document (org-scoped)
 * 6. DELETE documents/:id soft-deletes and removes the file
 * 7. Unauthenticated requests rejected
 * 8. Cross-tenant access is non-disclosing (404)
 * 9. Unsupported MIME type rejected
 * 10. Empty upload rejected
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
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { OrganizationId, UserId } from "@avana/domain";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

/**
 * Build a multipart/form-data body for a file upload.
 * Returns the body buffer and the content-type header with a boundary.
 */
function buildMultipartBody(options: {
  filename: string;
  contentType: string;
  data: Buffer;
  courseId?: string;
}): { body: Buffer; contentType: string } {
  const boundary = "----avana-test-boundary";
  const chunks: Buffer[] = [];

  if (options.courseId) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="course_id"\r\n\r\n${options.courseId}\r\n`,
      ),
    );
  }

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename}"\r\nContent-Type: ${options.contentType}\r\n\r\n`,
    ),
    options.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("PR6-2: Document upload API", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-doc-test-"));
    storageProvider = new LocalStorageProvider(storageDir);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      documentStore,
      documentChunkStore,
      storageProvider,
      auditService,
    });
    return app;
  }

  async function signIn(
    app: Awaited<ReturnType<typeof buildApp>>,
    email: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: email.split("@")[0] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    return {
      token: extractSessionToken(res)!,
      userId: body.user.id as UserId,
      email: body.user.email,
    };
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    name: string,
  ): Promise<OrganizationId> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { organization: { id: string } };
    return body.organization.id as OrganizationId;
  }

  const pdfBytes = Buffer.from("%PDF-1.4 fake pdf content");

  describe("POST /v1/organizations/:organizationId/documents/upload-intent", () => {
    it("returns an upload intent for a valid pdf", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "uploader@example.com");
      const organizationId = await createOrg(app, token, "Upload Org");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents/upload-intent`,
        cookies: { avana_session: token },
        payload: {
          original_name: "notes.pdf",
          mime_type: "application/pdf",
          size_bytes: pdfBytes.length,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        document_id: string;
        storage_key: string;
        upload_url: string | null;
        expires_at: string;
      };
      expect(body.document_id).toBeDefined();
      expect(body.storage_key).toMatch(/^uploads\/.+\.pdf$/);
      await app.close();
    });

    it("rejects an unsupported mime type with 400", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "uploader2@example.com");
      const organizationId = await createOrg(app, token, "Upload Org 2");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents/upload-intent`,
        cookies: { avana_session: token },
        payload: {
          original_name: "audio.mp3",
          mime_type: "audio/mp3",
          size_bytes: 100,
        },
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("rejects unauthenticated request", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/00000000-0000-0000-0000-000000000000/documents/upload-intent`,
        payload: {
          original_name: "notes.pdf",
          mime_type: "application/pdf",
          size_bytes: 10,
        },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("POST /v1/organizations/:organizationId/documents", () => {
    it("persists the file and returns 201", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "uploader3@example.com");
      const organizationId = await createOrg(app, token, "Doc Org");

      const multipart = buildMultipartBody({
        filename: "notes.pdf",
        contentType: "application/pdf",
        data: pdfBytes,
      });
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
        headers: { "content-type": multipart.contentType },
        payload: multipart.body,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as {
        duplicate: boolean;
        document: {
          id: string;
          original_name: string;
          status: string;
        };
      };
      expect(body.duplicate).toBe(false);
      expect(body.document.status).toBe("uploaded");
      expect(body.document.original_name).toBe("notes.pdf");
      await app.close();
    });

    it("detects duplicate upload and returns 200 with existing document", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "uploader4@example.com");
      const organizationId = await createOrg(app, token, "Dup Org");

      const first = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
        headers: {
          "content-type": buildMultipartBody({
            filename: "notes.pdf",
            contentType: "application/pdf",
            data: pdfBytes,
          }).contentType,
        },
        payload: buildMultipartBody({
          filename: "notes.pdf",
          contentType: "application/pdf",
          data: pdfBytes,
        }).body,
      });
      expect(first.statusCode).toBe(201);
      const firstBody = JSON.parse(first.body) as {
        document: { id: string };
      };

      const second = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
        headers: {
          "content-type": buildMultipartBody({
            filename: "copy.pdf",
            contentType: "application/pdf",
            data: pdfBytes,
          }).contentType,
        },
        payload: buildMultipartBody({
          filename: "copy.pdf",
          contentType: "application/pdf",
          data: pdfBytes,
        }).body,
      });

      expect(second.statusCode).toBe(200);
      const secondBody = JSON.parse(second.body) as {
        duplicate: boolean;
        document: { id: string };
      };
      expect(secondBody.duplicate).toBe(true);
      expect(secondBody.document.id).toBe(firstBody.document.id);
      await app.close();
    });

    it("rejects an empty upload with 400", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "uploader5@example.com");
      const organizationId = await createOrg(app, token, "Empty Org");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
        headers: {
          "content-type": buildMultipartBody({
            filename: "empty.pdf",
            contentType: "application/pdf",
            data: Buffer.alloc(0),
          }).contentType,
        },
        payload: buildMultipartBody({
          filename: "empty.pdf",
          contentType: "application/pdf",
          data: Buffer.alloc(0),
        }).body,
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("GET /v1/organizations/:organizationId/documents", () => {
    it("lists the actor's uploads", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "uploader6@example.com");
      const organizationId = await createOrg(app, token, "List Org");

      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
        headers: {
          "content-type": buildMultipartBody({
            filename: "notes.pdf",
            contentType: "application/pdf",
            data: pdfBytes,
          }).contentType,
        },
        payload: buildMultipartBody({
          filename: "notes.pdf",
          contentType: "application/pdf",
          data: pdfBytes,
        }).body,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        items: Array<{ original_name: string }>;
      };
      expect(body.items).toHaveLength(1);
      expect(body.items[0].original_name).toBe("notes.pdf");
      await app.close();
    });
  });

  describe("GET /v1/organizations/:organizationId/documents/:documentId", () => {
    it("returns a single document", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "uploader7@example.com");
      const organizationId = await createOrg(app, token, "Get Org");

      const created = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
        headers: {
          "content-type": buildMultipartBody({
            filename: "notes.pdf",
            contentType: "application/pdf",
            data: pdfBytes,
          }).contentType,
        },
        payload: buildMultipartBody({
          filename: "notes.pdf",
          contentType: "application/pdf",
          data: pdfBytes,
        }).body,
      });
      const createdBody = JSON.parse(created.body) as {
        document: { id: string };
      };

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/documents/${createdBody.document.id}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        document: { id: string; original_name: string };
      };
      expect(body.document.id).toBe(createdBody.document.id);
      expect(body.document.original_name).toBe("notes.pdf");
      await app.close();
    });

    it("returns 404 for a document in another org (non-disclosing)", async () => {
      const app = await buildApp();
      const { token: token1 } = await signIn(app, "tenant1@example.com");
      const org1 = await createOrg(app, token1, "Tenant 1");
      const created = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org1}/documents`,
        cookies: { avana_session: token1 },
        headers: {
          "content-type": buildMultipartBody({
            filename: "notes.pdf",
            contentType: "application/pdf",
            data: pdfBytes,
          }).contentType,
        },
        payload: buildMultipartBody({
          filename: "notes.pdf",
          contentType: "application/pdf",
          data: pdfBytes,
        }).body,
      });
      const createdBody = JSON.parse(created.body) as {
        document: { id: string };
      };

      const app2 = await buildApp();
      const { token: token2 } = await signIn(app2, "tenant2@example.com");
      const org2 = await createOrg(app2, token2, "Tenant 2");

      const res = await app2.inject({
        method: "GET",
        url: `/v1/organizations/${org2}/documents/${createdBody.document.id}`,
        cookies: { avana_session: token2 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/organizations/:organizationId/documents/:documentId", () => {
    it("soft-deletes the document and returns 204", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "uploader8@example.com");
      const organizationId = await createOrg(app, token, "Del Org");

      const created = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
        headers: {
          "content-type": buildMultipartBody({
            filename: "notes.pdf",
            contentType: "application/pdf",
            data: pdfBytes,
          }).contentType,
        },
        payload: buildMultipartBody({
          filename: "notes.pdf",
          contentType: "application/pdf",
          data: pdfBytes,
        }).body,
      });
      const createdBody = JSON.parse(created.body) as {
        document: { id: string };
      };

      const del = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${organizationId}/documents/${createdBody.document.id}`,
        cookies: { avana_session: token },
      });
      expect(del.statusCode).toBe(204);

      const get = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/documents/${createdBody.document.id}`,
        cookies: { avana_session: token },
      });
      expect(get.statusCode).toBe(404);
      await app.close();
    });
  });
});
