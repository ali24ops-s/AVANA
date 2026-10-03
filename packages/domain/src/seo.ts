/**
 * SEO & Search Engine Indexing Domain Logic.
 *
 * Single Source of Truth for AVANA's Sitemap and Robots.txt generation.
 * Shared across @avana/web (static public assets) and @avana/api (runtime fallback endpoints).
 */

export const CANONICAL_ORIGIN = "https://aavana.ir";

/**
 * Public static canonical routes that should be indexed by search engines.
 * Excludes redirects, aliases, and authenticated dashboards.
 */
export const PUBLIC_STATIC_ROUTES = [
  { path: "/", changefreq: "weekly" as const },
  { path: "/teachers", changefreq: "monthly" as const },
  { path: "/terms", changefreq: "yearly" as const },
  { path: "/blog", changefreq: "daily" as const },
] as const;

/**
 * Known static blog seed data used for static sitemap compilation when building frontend
 * without an active database connection. Matches database/seeds/seed-blog.ts.
 */
export const SEED_BLOG_DATA: DynamicBlogSitemapData = {
  posts: [
    { slug: "how-to-study-pharmacology-effectively" },
    { slug: "agonist-vs-antagonist-pharmacodynamics" },
    { slug: "drug-half-life-calculations-and-clinical-importance" },
    { slug: "pharmacy-study-plan-guide" },
    { slug: "spaced-repetition-flashcards-pharmacy" },
    { slug: "common-pharmacy-exam-mistakes" },
  ],
  categories: [
    { slug: "pharmacology" },
    { slug: "clinical-pharmacy" },
    { slug: "study-and-learning" },
    { slug: "exam-tips" },
    { slug: "flashcards-review" },
    { slug: "general-education" },
  ],
  tags: [
    { slug: "pharmacology" },
    { slug: "pharmacokinetics" },
    { slug: "pharmacodynamics" },
    { slug: "study-methods" },
    { slug: "exam-tips" },
    { slug: "flashcards" },
    { slug: "leitner-system" },
    { slug: "pharmacy-student" },
    { slug: "pharmacy-180-exam" },
    { slug: "spaced-repetition" },
    { slug: "drug-dosing" },
    { slug: "drug-half-life" },
  ],
};

/**
 * Routes that must not be crawled by search engines.
 * Covers API, Admin, Teacher Platform, User learning & course dashboards, and Authentication routes.
 * Rules use specific paths to avoid accidentally blocking unrelated public URLs.
 */
export const DISALLOWED_CRAWL_ROUTES = [
  // API & Internal endpoints
  "/v1/",
  "/api/",
  // Admin platform
  "/admin/",
  "/admin",
  // Teacher platform
  "/teacher/",
  "/teacher",
  // Authenticated student & learning dashboards (Protected routes)
  "/home",
  "/classrooms/",
  "/classrooms",
  "/courses/",
  "/courses",
  "/flashcards/",
  "/flashcards",
  "/exams/",
  "/exams",
  "/files/",
  "/files",
  "/library/",
  "/library",
  // User account, commerce & payment
  "/account/",
  "/account",
  "/settings/",
  "/settings",
  "/checkout/",
  "/checkout",
  "/payment/",
  "/payment",
  // Auth routes (prevent indexing transient login/registration forms)
  "/sign-in",
  "/login",
  "/register",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
] as const;

export const ALLOWED_CRAWL_ROUTES = [
  "/",
  "/teachers",
  "/terms",
  "/blog",
  "/blog/*",
  "/brand/",
] as const;

export interface DynamicBlogSitemapData {
  posts?: Array<{
    slug: string;
    updatedAt?: Date | string | null;
    publishedAt?: Date | string | null;
  }>;
  categories?: Array<{
    slug: string;
    updatedAt?: Date | string | null;
  }>;
  tags?: Array<{
    slug: string;
    updatedAt?: Date | string | null;
  }>;
}

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
}

/**
 * Format a Date or ISO string to valid YYYY-MM-DD lastmod format.
 * Returns undefined if date is missing or invalid to avoid fake timestamps.
 */
function formatLastMod(dateInput?: Date | string | null): string | undefined {
  if (!dateInput) return undefined;
  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString().split("T")[0];
  } catch {
    return undefined;
  }
}

/**
 * Generates all canonical sitemap entries combining static and dynamic routes.
 * Ensures deduplication and verifies that no private/disallowed path is ever included.
 */
export function generateSitemapEntries(
  blogData: DynamicBlogSitemapData = SEED_BLOG_DATA,
  canonicalOrigin: string = CANONICAL_ORIGIN,
): SitemapUrlEntry[] {
  const origin = canonicalOrigin.replace(/\/+$/, "");
  const entriesMap = new Map<string, SitemapUrlEntry>();

  const addEntry = (entry: SitemapUrlEntry) => {
    // Safety check: Never add disallowed, non-canonical, or duplicate paths
    const url = entry.loc;
    if (!url.startsWith(origin)) return;

    const path = url.slice(origin.length) || "/";
    const isDisallowed = DISALLOWED_CRAWL_ROUTES.some(
      (disallowed) => path === disallowed || (disallowed.endsWith("/") && path.startsWith(disallowed)),
    );

    if (isDisallowed) return;

    if (!entriesMap.has(url)) {
      entriesMap.set(url, entry);
    }
  };

  // 1. Static public routes
  for (const route of PUBLIC_STATIC_ROUTES) {
    const fullUrl = `${origin}${route.path}`;
    addEntry({
      loc: fullUrl,
      changefreq: route.changefreq,
    });
  }

  // 2. Dynamic published blog articles
  if (blogData.posts) {
    for (const post of blogData.posts) {
      if (!post.slug) continue;
      const cleanSlug = post.slug.trim().replace(/^\/+|\/+$/g, "");
      const fullUrl = `${origin}/blog/${cleanSlug}`;
      const lastmod = formatLastMod(post.updatedAt || post.publishedAt);
      addEntry({
        loc: fullUrl,
        lastmod,
        changefreq: "weekly",
      });
    }
  }

  // 3. Dynamic blog categories
  if (blogData.categories) {
    for (const cat of blogData.categories) {
      if (!cat.slug) continue;
      const cleanSlug = cat.slug.trim().replace(/^\/+|\/+$/g, "");
      const fullUrl = `${origin}/blog/category/${cleanSlug}`;
      const lastmod = formatLastMod(cat.updatedAt);
      addEntry({
        loc: fullUrl,
        lastmod,
        changefreq: "weekly",
      });
    }
  }

  // 4. Dynamic blog tags
  if (blogData.tags) {
    for (const tag of blogData.tags) {
      if (!tag.slug) continue;
      const cleanSlug = tag.slug.trim().replace(/^\/+|\/+$/g, "");
      const fullUrl = `${origin}/blog/tag/${cleanSlug}`;
      const lastmod = formatLastMod(tag.updatedAt);
      addEntry({
        loc: fullUrl,
        lastmod,
        changefreq: "weekly",
      });
    }
  }

  return Array.from(entriesMap.values());
}

/**
 * Serializes sitemap entries into standard XML conforming to Sitemap Protocol 0.9.
 */
export function generateSitemapXml(
  blogData: DynamicBlogSitemapData = SEED_BLOG_DATA,
  canonicalOrigin: string = CANONICAL_ORIGIN,
): string {
  const entries = generateSitemapEntries(blogData, canonicalOrigin);

  const xmlLines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const entry of entries) {
    xmlLines.push("  <url>");
    xmlLines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    if (entry.lastmod) {
      xmlLines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    }
    if (entry.changefreq) {
      xmlLines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    }
    xmlLines.push("  </url>");
  }

  xmlLines.push("</urlset>");
  return xmlLines.join("\n") + "\n";
}

/**
 * Generates standard robots.txt content referencing the canonical sitemap.
 */
export function generateRobotsTxt(canonicalOrigin: string = CANONICAL_ORIGIN): string {
  const origin = canonicalOrigin.replace(/\/+$/, "");
  const lines: string[] = ["User-agent: *"];

  for (const disallowed of DISALLOWED_CRAWL_ROUTES) {
    lines.push(`Disallow: ${disallowed}`);
  }

  lines.push("");
  for (const allowed of ALLOWED_CRAWL_ROUTES) {
    lines.push(`Allow: ${allowed}`);
  }

  lines.push("");
  lines.push(`Sitemap: ${origin}/sitemap.xml`);

  return lines.join("\n") + "\n";
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}
