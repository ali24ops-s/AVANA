import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  generateRobotsTxt,
  generateSitemapXml,
  generateSitemapEntries,
  DISALLOWED_CRAWL_ROUTES,
  CANONICAL_ORIGIN,
} from "@avana/domain";

describe("AVANA SEO — sitemap.xml and robots.txt integrity", () => {
  const publicDir = path.resolve(__dirname, "../../public");
  const robotsPath = path.join(publicDir, "robots.txt");
  const sitemapPath = path.join(publicDir, "sitemap.xml");

  it("should have robots.txt in apps/web/public matching domain generator", () => {
    expect(fs.existsSync(robotsPath)).toBe(true);
    const robotsContent = fs.readFileSync(robotsPath, "utf-8");
    const expectedRobots = generateRobotsTxt();

    expect(robotsContent.trim()).toBe(expectedRobots.trim());
    expect(robotsContent).toContain("User-agent: *");
    expect(robotsContent).toContain("Sitemap: https://aavana.ir/sitemap.xml");
  });

  it("should have sitemap.xml in apps/web/public matching domain generator", () => {
    expect(fs.existsSync(sitemapPath)).toBe(true);
    const sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
    const expectedSitemap = generateSitemapXml();

    expect(sitemapContent.trim()).toBe(expectedSitemap.trim());
    expect(sitemapContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemapContent).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it("should only contain absolute canonical URLs on https://aavana.ir", () => {
    const sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
    const locMatches = Array.from(sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g)).map((m) => m[1]);

    expect(locMatches.length).toBeGreaterThan(0);
    for (const loc of locMatches) {
      expect(loc.startsWith(CANONICAL_ORIGIN)).toBe(true);
      expect(loc).not.toContain("localhost");
      expect(loc).not.toContain("127.0.0.1");
      expect(loc).not.toContain("staging");
      expect(loc).not.toContain("undefined");
      expect(loc).not.toContain("null");
      // No duplicate slashes other than https://
      expect(loc.replace("https://", "")).not.toContain("//");
    }
  });

  it("should never contain disallowed/private/auth/admin/courses/redirect paths in sitemap", () => {
    const sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
    const locMatches = Array.from(sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g)).map((m) => m[1]);

    // Check against disallowed crawl routes
    for (const disallowed of DISALLOWED_CRAWL_ROUTES) {
      const target = `${CANONICAL_ORIGIN}${disallowed}`;
      for (const loc of locMatches) {
        if (disallowed.endsWith("/")) {
          expect(loc.startsWith(target)).toBe(false);
        } else {
          expect(loc === target || loc.startsWith(`${target}/`)).toBe(false);
        }
      }
    }

    // Explicit check for redirect aliases
    const redirectAliases = [
      "/about",
      "/about-us",
      "/for-teachers",
      "/terms-of-service",
      "/anatomy-poc",
    ];
    for (const alias of redirectAliases) {
      const target = `${CANONICAL_ORIGIN}${alias}`;
      for (const loc of locMatches) {
        expect(loc).not.toBe(target);
      }
    }

    // Explicit check for courses
    for (const loc of locMatches) {
      expect(loc).not.toBe(`${CANONICAL_ORIGIN}/courses`);
      expect(loc.startsWith(`${CANONICAL_ORIGIN}/courses/`)).toBe(false);
    }
  });

  it("should include public indexable routes in sitemap", () => {
    const entries = generateSitemapEntries();
    const urls = entries.map((e) => e.loc);

    expect(urls).toContain("https://aavana.ir/");
    expect(urls).toContain("https://aavana.ir/teachers");
    expect(urls).toContain("https://aavana.ir/terms");
    expect(urls).toContain("https://aavana.ir/blog");
    expect(urls).toContain("https://aavana.ir/blog/how-to-study-pharmacology-effectively");
    expect(urls).toContain("https://aavana.ir/blog/category/pharmacology");
    expect(urls).toContain("https://aavana.ir/blog/tag/pharmacology");
  });

  it("should disallow private paths in robots.txt without blocking public URLs", () => {
    const robotsContent = fs.readFileSync(robotsPath, "utf-8");

    expect(robotsContent).toContain("Disallow: /admin");
    expect(robotsContent).toContain("Disallow: /teacher");
    expect(robotsContent).toContain("Disallow: /courses");
    expect(robotsContent).toContain("Disallow: /home");
    expect(robotsContent).toContain("Disallow: /sign-in");
    expect(robotsContent).toContain("Disallow: /register");
    expect(robotsContent).toContain("Disallow: /v1/");
    expect(robotsContent).toContain("Disallow: /api/");

    // Check allow rules
    expect(robotsContent).toContain("Allow: /");
    expect(robotsContent).toContain("Allow: /teachers");
    expect(robotsContent).toContain("Allow: /terms");
    expect(robotsContent).toContain("Allow: /blog");
  });
});
