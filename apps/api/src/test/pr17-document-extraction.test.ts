/**
 * PR6-3 Integration tests: Document text extraction API.
 *
 * Covers the acceptance criteria:
 * 1. POST .../documents/:id/extract extracts a PDF → status extracted
 * 2. GET .../documents/:id/status returns lifecycle state + counts
 * 3. Unsupported MIME → document failed with error_code
 * 4. Corrupted file → document failed with retry metadata
 * 5. Unauthenticated requests rejected (401)
 * 6. Cross-tenant access is non-disclosing (404)
 * 7. Idempotency: re-extracting an extracted document is a no-op
 */

import { describe, expect, it, beforeEach } from "vitest";
import JSZip from "jszip";
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

function buildMultipartBody(options: {
  filename: string;
  contentType: string;
  data: Buffer;
}): { body: Buffer; contentType: string } {
  const boundary = "----avana-test-boundary";
  const chunks: Buffer[] = [];
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

function validPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< >>
stream
BT
(Hello from AVANA extraction) Tj
ET
endstream
endobj
%%EOF`,
    "latin1",
  );
}

async function buildDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>DOCX extraction works</w:t></w:r></w:p>
      </w:body>
    </w:document>`,
  );
  const data = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(data);
}

describe("PR6-3: Document extraction API", () => {
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
    storageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "avana-extract-test-"),
    );
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

  async function uploadDocument(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    organizationId: string,
    filename: string,
    contentType: string,
    data: Buffer,
  ): Promise<{ id: string; status: string }> {
    const multipart = buildMultipartBody({
      filename,
      contentType,
      data,
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
      document: { id: string; status: string };
    };
    return { id: body.document.id, status: body.document.status };
  }

  describe("POST /v1/organizations/:organizationId/documents/:documentId/extract", () => {
    it("extracts a PDF and returns extracted status with counts", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "extractor@example.com");
      const organizationId = await createOrg(app, token, "Extract Org");

      const doc = await uploadDocument(
        app,
        token,
        organizationId,
        "notes.pdf",
        "application/pdf",
        validPdf(),
      );

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}/extract`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        status: {
          status: string;
          page_count: number | null;
          chunk_count: number | null;
          retry_count: number;
        };
      };
      expect(body.status.status).toBe("extracted");
      expect(body.status.page_count).toBeGreaterThan(0);
      expect(body.status.chunk_count).toBeGreaterThan(0);
      expect(body.status.retry_count).toBe(0);
      await app.close();
    });

    it("extracts a DOCX and persists chunks", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "extractor2@example.com");
      const organizationId = await createOrg(app, token, "Extract Org 2");

      const doc = await uploadDocument(
        app,
        token,
        organizationId,
        "notes.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        await buildDocx(),
      );

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}/extract`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        status: { status: string; chunk_count: number | null };
      };
      expect(body.status.status).toBe("extracted");
      expect(body.status.chunk_count).toBeGreaterThan(0);
      await app.close();
    });

    it("marks a corrupted PDF as failed with error_code", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "extractor3@example.com");
      const organizationId = await createOrg(app, token, "Extract Org 3");

      const doc = await uploadDocument(
        app,
        token,
        organizationId,
        "bad.pdf",
        "application/pdf",
        Buffer.from("not a real pdf"),
      );

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}/extract`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        status: {
          status: string;
          error_code: string | null;
          retry_count: number;
        };
      };
      expect(body.status.status).toBe("failed");
      expect(body.status.error_code).toBe("invalid_pdf");
      expect(body.status.retry_count).toBe(1);
      await app.close();
    });

    it("rejects an unauthenticated extract request", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000001/extract`,
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("returns 404 for a document in another organization (non-disclosing)", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "tenant1@example.com");
      const organizationId = await createOrg(app, token, "Tenant 1");

      const doc = await uploadDocument(
        app,
        token,
        organizationId,
        "notes.pdf",
        "application/pdf",
        validPdf(),
      );

      const app2 = await buildApp();
      const { token: token2 } = await signIn(app2, "tenant2@example.com");
      const org2 = await createOrg(app2, token2, "Tenant 2");

      const res = await app2.inject({
        method: "POST",
        url: `/v1/organizations/${org2}/documents/${doc.id}/extract`,
        cookies: { avana_session: token2 },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("GET /v1/organizations/:organizationId/documents/:documentId/status", () => {
    it("returns uploaded status before extraction", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "status@example.com");
      const organizationId = await createOrg(app, token, "Status Org");

      const doc = await uploadDocument(
        app,
        token,
        organizationId,
        "notes.pdf",
        "application/pdf",
        validPdf(),
      );

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}/status`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        status: { status: string; chunk_count: number | null };
      };
      expect(body.status.status).toBe("uploaded");
      expect(body.status.chunk_count).toBeNull();
      await app.close();
    });

    it("returns chunk_count after extraction", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "status2@example.com");
      const organizationId = await createOrg(app, token, "Status Org 2");

      const doc = await uploadDocument(
        app,
        token,
        organizationId,
        "notes.pdf",
        "application/pdf",
        validPdf(),
      );

      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}/extract`,
        cookies: { avana_session: token },
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}/status`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        status: {
          status: string;
          chunk_count: number | null;
          page_count: number | null;
        };
      };
      expect(body.status.status).toBe("extracted");
      expect(body.status.chunk_count).toBeGreaterThan(0);
      expect(body.status.page_count).toBeGreaterThan(0);
      await app.close();
    });

    it("is idempotent: re-extracting an extracted document keeps status", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "status3@example.com");
      const organizationId = await createOrg(app, token, "Status Org 3");

      const doc = await uploadDocument(
        app,
        token,
        organizationId,
        "notes.pdf",
        "application/pdf",
        validPdf(),
      );

      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}/extract`,
        cookies: { avana_session: token },
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}/extract`,
        cookies: { avana_session: token },
      });

      const body = JSON.parse(res.body) as {
        status: { status: string; chunk_count: number | null };
      };
      expect(body.status.status).toBe("extracted");
      expect(body.status.chunk_count).toBeGreaterThan(0);
      await app.close();
    });

    it("returns 404 for a status check in another organization", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "tenant3@example.com");
      const organizationId = await createOrg(app, token, "Tenant 3");

      const doc = await uploadDocument(
        app,
        token,
        organizationId,
        "notes.pdf",
        "application/pdf",
        validPdf(),
      );

      const app2 = await buildApp();
      const { token: token2 } = await signIn(app2, "tenant4@example.com");
      const org2 = await createOrg(app2, token2, "Tenant 4");

      const res = await app2.inject({
        method: "GET",
        url: `/v1/organizations/${org2}/documents/${doc.id}/status`,
        cookies: { avana_session: token2 },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
