import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { StrictMode } from "react";
import { render } from "@testing-library/react";
import { PollSEO } from "../components/poll/PollSEO.js";

describe("PollSEO Component Lifecycle & Cleanup", () => {
  const initialTitle = "آوانا | صفحه اصلی پلتفرم";
  const initialGlobalDesc = "توضیحات پیش‌فرض سایت آوانا در فایل ایندکس اصلی";
  const globalViewport = "width=device-width, initial-scale=1.0";
  const globalCharset = "utf-8";

  beforeEach(() => {
    // Reset document.head and document.title before each test
    document.head.innerHTML = `
      <title>${initialTitle}</title>
      <meta charset="${globalCharset}">
      <meta name="viewport" content="${globalViewport}">
      <meta name="description" content="${initialGlobalDesc}">
      <meta name="author" content="AVANA Engineering">
    `;
    document.title = initialTitle;
  });

  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("dynamically injects poll title and OpenGraph / Twitter meta tags on mount", () => {
    const { unmount } = render(
      <PollSEO
        title="ارزیابی کیفیت خدمات"
        description="نظرسنجی پیرامون کیفیت پشتیبانی"
        canonicalUrl="https://aavana.ir/polls/service-quality"
        coverImageUrl="https://aavana.ir/img/quality.jpg"
      />,
    );

    expect(document.title).toBe("ارزیابی کیفیت خدمات | نظرسنجی آوانا");

    const descMeta = document.querySelector('meta[name="description"]');
    expect(descMeta?.getAttribute("content")).toBe("نظرسنجی پیرامون کیفیت پشتیبانی");

    const ogTitle = document.querySelector('meta[property="og:title"]');
    expect(ogTitle?.getAttribute("content")).toBe("ارزیابی کیفیت خدمات | نظرسنجی آوانا");

    const ogImage = document.querySelector('meta[property="og:image"]');
    expect(ogImage?.getAttribute("content")).toBe("https://aavana.ir/img/quality.jpg");

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    expect(canonicalLink?.getAttribute("href")).toBe("https://aavana.ir/polls/service-quality");

    const robotsMeta = document.querySelector('meta[name="robots"]');
    expect(robotsMeta?.getAttribute("content")).toBe("index, follow");

    const jsonLd = document.getElementById("poll-schema-jsonld");
    expect(jsonLd).not.toBeNull();
    const parsedSchema = JSON.parse(jsonLd?.textContent || "{}");
    expect(parsedSchema["@type"]).toBe("WebPage");
    expect(parsedSchema.name).toBe("ارزیابی کیفیت خدمات | نظرسنجی آوانا");

    unmount();
  });

  it("strictly preserves global site meta tags (charset, viewport, author) without modifications", () => {
    const { unmount } = render(
      <PollSEO
        title="تست حفظ متاتگ‌های عمومی"
        description="توضیحات تستی"
      />,
    );

    const charset = document.querySelector("meta[charset]");
    expect(charset?.getAttribute("charset")).toBe(globalCharset);

    const viewport = document.querySelector('meta[name="viewport"]');
    expect(viewport?.getAttribute("content")).toBe(globalViewport);

    const author = document.querySelector('meta[name="author"]');
    expect(author?.getAttribute("content")).toBe("AVANA Engineering");

    unmount();

    // After unmount, global tags must still be present and intact
    expect(document.querySelector("meta[charset]")?.getAttribute("charset")).toBe(globalCharset);
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(globalViewport);
    expect(document.querySelector('meta[name="author"]')?.getAttribute("content")).toBe("AVANA Engineering");
  });

  it("cleans up on unmount: reverts pre-existing tags to original value and removes created tags", () => {
    const { unmount } = render(
      <PollSEO
        title="نظرسنجی رضایت"
        description="توضیحات اختصاصی این نظرسنجی"
        canonicalUrl="https://aavana.ir/polls/satisfaction"
        coverImageUrl="https://aavana.ir/img/poll.png"
      />,
    );

    // Verify tag state when mounted
    expect(document.title).toBe("نظرسنجی رضایت | نظرسنجی آوانا");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "توضیحات اختصاصی این نظرسنجی",
    );
    expect(document.querySelector('meta[property="og:title"]')).not.toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();
    expect(document.getElementById("poll-schema-jsonld")).not.toBeNull();

    // Trigger unmount (simulating navigating to an unrelated page)
    unmount();

    // Verify title was restored
    expect(document.title).toBe(initialTitle);

    // Verify description was restored to initial global value
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      initialGlobalDesc,
    );

    // Verify tags created exclusively by PollSEO were removed
    expect(document.querySelector('meta[property="og:title"]')).toBeNull();
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.querySelector('meta[name="twitter:card"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.getElementById("poll-schema-jsonld")).toBeNull();
  });

  it("handles transition between two polls with different slugs cleanly", () => {
    const { rerender, unmount } = render(
      <PollSEO
        title="نظرسنجی اول"
        description="توضیحات نظرسنجی اول"
        canonicalUrl="https://aavana.ir/polls/poll-alpha"
      />,
    );

    expect(document.title).toBe("نظرسنجی اول | نظرسنجی آوانا");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://aavana.ir/polls/poll-alpha",
    );

    // Transition to Poll Beta
    rerender(
      <PollSEO
        title="نظرسنجی دوم"
        description="توضیحات نظرسنجی دوم"
        canonicalUrl="https://aavana.ir/polls/poll-beta"
      />,
    );

    expect(document.title).toBe("نظرسنجی دوم | نظرسنجی آوانا");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://aavana.ir/polls/poll-beta",
    );
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "توضیحات نظرسنجی دوم",
    );

    // No duplicate tags created
    expect(document.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(document.querySelectorAll('meta[property="og:title"]').length).toBe(1);

    unmount();
    expect(document.title).toBe(initialTitle);
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("operates safely under React StrictMode without creating duplicate tags", () => {
    const { unmount } = render(
      <StrictMode>
        <PollSEO
          title="نظرسنجی استریکت‌مود"
          description="تست اجرای مضاعف افکت"
          canonicalUrl="https://aavana.ir/polls/strict-test"
        />
      </StrictMode>,
    );

    expect(document.title).toBe("نظرسنجی استریکت‌مود | نظرسنجی آوانا");
    expect(document.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(document.querySelectorAll('meta[property="og:title"]').length).toBe(1);

    unmount();
    expect(document.title).toBe(initialTitle);
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
