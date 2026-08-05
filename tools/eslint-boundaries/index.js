import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const layers = {
  api: "apps/api",
  ui: "packages/ui",
  web: "apps/web",
  worker: "apps/worker",
};

const forbiddenTargets = {
  api: ["ui", "web"],
  web: ["api", "worker"],
};

const restrictedInfrastructurePackages = [
  { category: "database", name: "drizzle-orm" },
  { category: "cloud", name: "@aws-sdk" },
  { category: "model", name: "openai" },
];

function isWithin(filePath, directory) {
  const relative = path.relative(directory, filePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function findLayer(filePath, rootDirectory) {
  return Object.entries(layers).find(([, directory]) =>
    isWithin(filePath, path.join(rootDirectory, directory)),
  )?.[0];
}

function realpathWithMissingSuffix(filePath) {
  let existingPath = filePath;
  const missingSegments = [];

  while (!fs.existsSync(existingPath)) {
    const parent = path.dirname(existingPath);
    if (parent === existingPath) return filePath;

    missingSegments.unshift(path.basename(existingPath));
    existingPath = parent;
  }

  try {
    return path.join(fs.realpathSync(existingPath), ...missingSegments);
  } catch {
    return filePath;
  }
}

function resolveTarget(source, importer, rootDirectory) {
  const workspaceTarget = Object.entries(layers).find(([, directory]) => {
    const packageName = `@avana/${path.basename(directory)}`;
    return source === packageName || source.startsWith(`${packageName}/`);
  });

  if (workspaceTarget) {
    return realpathWithMissingSuffix(
      path.join(rootDirectory, workspaceTarget[1]),
    );
  }

  if (/^file:/i.test(source)) {
    try {
      return realpathWithMissingSuffix(fileURLToPath(source));
    } catch {
      return undefined;
    }
  }

  if (source.startsWith(".") || path.isAbsolute(source)) {
    return realpathWithMissingSuffix(
      path.resolve(path.dirname(importer), source),
    );
  }

  return undefined;
}

function findRestrictedInfrastructure(source, target, rootDirectory) {
  return restrictedInfrastructurePackages.find(({ name }) => {
    if (source === name || source.startsWith(`${name}/`)) return true;
    if (!target) return false;

    return isWithin(target, path.join(rootDirectory, "node_modules", name));
  });
}

const boundaries = {
  rules: {
    imports: {
      meta: {
        type: "problem",
        docs: { description: "Enforce AVANA workspace import boundaries." },
        schema: [],
        messages: {
          forbidden: "{{sourceLayer}} code cannot import {{targetLayer}} code.",
          infrastructure:
            "UI code cannot import {{category}} infrastructure SDKs.",
        },
      },
      create(context) {
        const filename = context.physicalFilename ?? context.filename;
        const rootDirectory = context.cwd;
        const sourceLayer = findLayer(filename, rootDirectory);
        const isUiLayer = sourceLayer === "web" || sourceLayer === "ui";

        if (
          !sourceLayer ||
          (!(sourceLayer in forbiddenTargets) && !isUiLayer)
        ) {
          return {};
        }

        function checkImport(node) {
          const importSource = node.source;
          const source =
            typeof importSource?.value === "string"
              ? importSource.value
              : importSource?.type === "TemplateLiteral" &&
                  importSource.expressions?.length === 0
                ? importSource.quasis?.[0]?.value?.cooked
                : undefined;
          if (typeof source !== "string") return;

          const target = resolveTarget(source, filename, rootDirectory);

          if (isUiLayer) {
            const infrastructure = findRestrictedInfrastructure(
              source,
              target,
              rootDirectory,
            );
            if (infrastructure) {
              context.report({
                node: node.source,
                messageId: "infrastructure",
                data: { category: infrastructure.category },
              });
              return;
            }
          }

          if (!target || !(sourceLayer in forbiddenTargets)) return;

          const targetLayer = findLayer(target, rootDirectory);
          if (
            targetLayer &&
            forbiddenTargets[sourceLayer].includes(targetLayer)
          ) {
            context.report({
              node: node.source,
              messageId: "forbidden",
              data: { sourceLayer, targetLayer },
            });
          }
        }

        return {
          ExportAllDeclaration: checkImport,
          ExportNamedDeclaration: checkImport,
          ImportDeclaration: checkImport,
          ImportExpression: checkImport,
        };
      },
    },
  },
};

export default boundaries;
