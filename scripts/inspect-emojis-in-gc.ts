import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

async function main() {
  const { db, close } = createDbClient(localConnectionString());
  const all = await db.select().from(schema.generatedContents);
  const regex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE0F]/u;
  for (const gc of all) {
    const s = JSON.stringify(gc.payload || {});
    if (regex.test(s)) {
      console.log(`Type: ${gc.type}, ID: ${gc.id}`);
      console.log(`Payload keys:`, Object.keys(gc.payload || {}));
      console.log(`Sample payload:`, JSON.stringify(gc.payload).slice(0, 300));
      console.log("--------------------------------------------------");
    }
  }
  await close();
}
main();
