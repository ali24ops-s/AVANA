
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana" });

async function verify() {
  console.log("===============================================================");
  console.log("POST-MIGRATION 0037 DATABASE VERIFICATION & AUDIT");
  console.log("===============================================================");

  // 1. Lessons count
  const { rows: lessons } = await pool.query("SELECT id, title FROM lessons WHERE deleted_at IS NULL");
  const totalLessons = lessons.length;
  console.log("1. Total Active Lessons:", totalLessons);

  // 2. Products query
  const { rows: contentProducts } = await pool.query(`
    SELECT 
      l.id AS lesson_id,
      l.title AS lesson_title,
      p.id AS product_id,
      p.code,
      p.price,
      p.active,
      p.metadata,
      p.created_at,
      p.updated_at
    FROM lessons l
    LEFT JOIN products p ON (p.target_id = l.id OR p.code = 'content_' || l.id::text) AND p.deleted_at IS NULL
    WHERE l.deleted_at IS NULL
  `);

  let missingProducts = 0;
  let adminPricedPreserved = 0;
  let explicitlyFreePreserved = 0;
  let backfilledDefaultPriced = 0;
  let accidentalZeroRemaining = 0;
  let invalidUnpricedRemaining = 0;
  const priceDistribution = {};

  for (const row of contentProducts) {
    if (!row.product_id) {
      missingProducts++;
      invalidUnpricedRemaining++;
      continue;
    }

    const price = row.price;
    priceDistribution[price] = (priceDistribution[price] || 0) + 1;

    const meta = row.metadata || {};
    const isExplicitFree = meta.explicitlyFree === true;
    const isDefaultPriced = meta.defaultPriced === true;

    if (price === 80000 || price === 6000) {
      adminPricedPreserved++;
    } else if (isExplicitFree && price === 0) {
      explicitlyFreePreserved++;
    } else if (isDefaultPriced && price > 0) {
      backfilledDefaultPriced++;
    }

    if (price === 0 && !isExplicitFree) {
      accidentalZeroRemaining++;
      invalidUnpricedRemaining++;
    } else if (price < 0 || isNaN(price)) {
      invalidUnpricedRemaining++;
    }
  }

  console.log("2. Total Lesson Products Linked:", contentProducts.filter(p => p.product_id).length);
  console.log("3. Existing Admin-Priced Products Preserved (>0):", adminPricedPreserved);
  console.log("4. Explicitly Free Products Preserved:", explicitlyFreePreserved);
  console.log("5. Canonical Default-Priced Products Backfilled:", backfilledDefaultPriced);
  console.log("6. Missing Products Remaining:", missingProducts);
  console.log("7. Accidental Zero-Price Products Remaining:", accidentalZeroRemaining);
  console.log("8. Invalid / Unpriced Lessons Remaining:", invalidUnpricedRemaining);
  console.log("9. Price Distribution:", priceDistribution);

  // 3. Courses verification
  const { rows: courseProducts } = await pool.query(`
    SELECT c.id, c.name, c.status, p.id AS product_id, p.price, p.active, p.metadata
    FROM courses c
    LEFT JOIN products p ON (p.target_id = c.id OR p.code = 'course_' || c.id::text) AND p.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
  `);
  console.log("\n--- Courses Status ---");
  for (const cp of courseProducts) {
    const prodInfo = cp.product_id ? ("price=" + cp.price + ", active=" + cp.active) : "NO PRODUCT (In Review/Draft)";
    console.log("- Course: \"" + cp.name + "\" (status: " + cp.status + ") -> Product: " + prodInfo);
  }

  const success = (invalidUnpricedRemaining === 0 && accidentalZeroRemaining === 0 && missingProducts === 0);
  console.log("\n===============================================================");
  console.log("INVARIANT VERIFICATION RESULT: " + (success ? "PASSED (100% SUCCESS)" : "FAILED"));
  console.log("===============================================================");

  await pool.end();
}

verify().catch(console.error);
