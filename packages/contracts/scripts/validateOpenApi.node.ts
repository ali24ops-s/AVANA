import fs from "fs";
import path from "path";

// Minimal contract validation placeholder for Sprint 1 PR 4.
// Full OpenAPI validation/generation tooling is introduced in a later PR.

const openapiPath = path.resolve(process.cwd(), "openapi", "v1.yaml");

function mustExist(p: string): string {
  if (!fs.existsSync(p)) {
    throw new Error(`OpenAPI contract file missing: ${p}`);
  }
  return p;
}

function main() {
  const p = mustExist(openapiPath);
  const raw = fs.readFileSync(p, "utf8");

  if (!raw.includes("openapi: 3.1.0")) {
    throw new Error("OpenAPI version must be 3.1.0");
  }

  const mustContain = [
    "/v1/health",
    "/v1/readiness",
    "/v1/me",
    "ErrorEnvelope",
    "/v1/courses/{courseId}/learn",
    "CourseLearnResponse",
    "ModuleResource",
    "LessonResource",
    "CourseLearnProgress",
  ];
  for (const token of mustContain) {
    if (!raw.includes(token)) {
      throw new Error(`OpenAPI contract missing token: ${token}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log("validateOpenApi: PASS");
}

main();
