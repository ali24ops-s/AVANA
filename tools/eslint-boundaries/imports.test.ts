import path from "node:path";
import { pathToFileURL } from "node:url";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import boundaries from "./index.js";

const root = process.cwd();
const rule = boundaries.rules!.imports!;

function fileImport(target: string, scheme = "file") {
  const url = pathToFileURL(path.join(root, target)).href;
  return `import ${JSON.stringify(url.replace(/^file:/, `${scheme}:`))};`;
}

const nullCookedParser = {
  parseForESLint(...args: Parameters<typeof tseslint.parser.parseForESLint>) {
    const result = tseslint.parser.parseForESLint(...args);
    const statement = (
      result.ast as {
        body: Array<{
          type?: string;
          expression?: {
            type?: string;
            source?: {
              type?: string;
              quasis?: Array<{ value: { cooked: null } }>;
            };
          };
        }>;
      }
    ).body[0];
    const importExpression = statement?.expression;
    const importSource = importExpression?.source;

    if (
      statement?.type === "ExpressionStatement" &&
      importExpression?.type === "ImportExpression" &&
      importSource?.type === "TemplateLiteral"
    ) {
      const templateElement = importSource.quasis?.[0];
      if (templateElement) {
        templateElement.value.cooked = null;
      }
    }

    return result;
  },
};

describe("AVANA import boundaries", () => {
  it("rejects prohibited workspace and traversal imports", () => {
    const tester = new RuleTester({
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      },
    });

    tester.run("avana-boundaries/imports", rule, {
      valid: [
        {
          code: 'import "@avana/ui";',
          filename: path.join(root, "apps/web/src/valid.ts"),
        },
        {
          code: 'import "@avana/domain";',
          filename: path.join(root, "apps/api/src/valid.ts"),
        },
        {
          code: fileImport("apps/api/dist/index.js"),
          filename: path.join(root, "apps/api/src/valid-file-url.ts"),
        },
        {
          code: "void import(`@avana/api`);",
          filename: path.join(root, "apps/api/src/valid-template-import.ts"),
        },
        {
          code: "import(`@avana/ui`);",
          filename: path.join(root, "apps/api/src/null-cooked-template.ts"),
          languageOptions: {
            parser: nullCookedParser,
          },
        },
      ],
      invalid: [
        {
          code: 'import "@avana/api";',
          filename: path.join(root, "apps/web/src/web-api.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "web", targetLayer: "api" },
            },
          ],
        },
        {
          code: 'import "@avana/worker";',
          filename: path.join(root, "apps/web/src/web-worker.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "web", targetLayer: "worker" },
            },
          ],
        },
        {
          code: 'import "@avana/ui";',
          filename: path.join(root, "apps/api/src/api-ui.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "api", targetLayer: "ui" },
            },
          ],
        },
        {
          code: fileImport("packages/ui/dist/index.js", "FILE"),
          filename: path.join(root, "apps/api/src/uppercase-file-url-ui.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "api", targetLayer: "ui" },
            },
          ],
        },
        {
          code: "void import(`@avana/ui`);",
          filename: path.join(root, "apps/api/src/template-import-ui.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "api", targetLayer: "ui" },
            },
          ],
        },
        {
          code: "import(`@avana/\\u0075i`);",
          filename: path.join(root, "apps/api/src/escaped-template-ui.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "api", targetLayer: "ui" },
            },
          ],
        },
        {
          code: "import(`drizzle-\\u006frm`);",
          filename: path.join(
            root,
            "apps/web/src/escaped-template-database.ts",
          ),
          errors: [
            {
              messageId: "infrastructure",
              data: { category: "database" },
            },
          ],
        },
        {
          code: "import(`open\\u0061i`);",
          filename: path.join(
            root,
            "packages/ui/src/escaped-template-model.ts",
          ),
          errors: [
            {
              messageId: "infrastructure",
              data: { category: "model" },
            },
          ],
        },
        {
          code: 'import "../../../../../api/src/index.js";',
          filename: path.join(
            root,
            "apps/web/src/components/deep/nested/traversal.ts",
          ),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "web", targetLayer: "api" },
            },
          ],
        },
        {
          code: 'export { value } from "../../../../../packages/ui/src/index.js";',
          filename: path.join(root, "apps/api/src/modules/deep/traversal.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "api", targetLayer: "ui" },
            },
          ],
        },
        {
          code: 'import "../../../../../../node_modules/@avana/api/dist/index.js";',
          filename: path.join(
            root,
            "apps/web/src/components/deep/nested/symlink-traversal.ts",
          ),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "web", targetLayer: "api" },
            },
          ],
        },
        {
          code: 'import "../../../../../node_modules/@avana/ui/dist/index.js";',
          filename: path.join(
            root,
            "apps/api/src/modules/deep/symlink-traversal.ts",
          ),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "api", targetLayer: "ui" },
            },
          ],
        },
        {
          code: 'import "../../../../../api/dist/index.js";',
          filename: path.join(
            root,
            "apps/web/src/components/deep/nested/build-traversal.ts",
          ),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "web", targetLayer: "api" },
            },
          ],
        },
        {
          code: 'import "drizzle-orm";',
          filename: path.join(root, "apps/web/src/web-database.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "database" } },
          ],
        },
        {
          code: 'import "@aws-sdk/client-s3";',
          filename: path.join(root, "packages/ui/src/ui-cloud.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "cloud" } },
          ],
        },
        {
          code: 'import "openai";',
          filename: path.join(root, "packages/ui/src/ui-model.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "model" } },
          ],
        },
        {
          code: 'import "../../../../node_modules/drizzle-orm/index.js";',
          filename: path.join(root, "apps/web/src/components/database.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "database" } },
          ],
        },
        {
          code: 'import "../../../node_modules/@aws-sdk/client-s3/index.js";',
          filename: path.join(root, "packages/ui/src/cloud.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "cloud" } },
          ],
        },
        {
          code: `import "${path.join(root, "node_modules/openai/index.js")}";`,
          filename: path.join(root, "packages/ui/src/model.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "model" } },
          ],
        },
        {
          code: fileImport("node_modules/@avana/ui/dist/index.js"),
          filename: path.join(root, "apps/api/src/file-url-ui.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "api", targetLayer: "ui" },
            },
          ],
        },
        {
          code: fileImport("apps/api/dist/index.js"),
          filename: path.join(root, "apps/web/src/file-url-api.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "web", targetLayer: "api" },
            },
          ],
        },
        {
          code: fileImport("apps/worker/dist/index.js"),
          filename: path.join(root, "apps/web/src/file-url-worker.ts"),
          errors: [
            {
              messageId: "forbidden",
              data: { sourceLayer: "web", targetLayer: "worker" },
            },
          ],
        },
        {
          code: fileImport("node_modules/drizzle-orm/index.js"),
          filename: path.join(root, "apps/web/src/file-url-database.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "database" } },
          ],
        },
        {
          code: fileImport("node_modules/@aws-sdk/client-s3/index.js"),
          filename: path.join(root, "packages/ui/src/file-url-cloud.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "cloud" } },
          ],
        },
        {
          code: fileImport("node_modules/openai/index.js"),
          filename: path.join(root, "packages/ui/src/file-url-model.ts"),
          errors: [
            { messageId: "infrastructure", data: { category: "model" } },
          ],
        },
      ],
    });
  });
});
