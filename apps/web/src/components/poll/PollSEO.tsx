import { useEffect } from "react";

export interface PollSEOProps {
  title: string;
  description?: string | null;
  canonicalUrl?: string | null;
  coverImageUrl?: string | null;
}

interface TagConfig {
  type: "meta" | "link";
  attr: "name" | "property" | "rel";
  key: string;
  value: string;
}

interface TagOriginalState {
  selector: string;
  wasCreated: boolean;
  originalContent: string | null;
}

/**
 * Dynamic SEO and OpenGraph meta tag manager for public Poll pages.
 *
 * Implements strict lifecycle cleanup on unmount and slug transition:
 * - Restores previous document title
 * - Removes meta tags dynamically created by PollSEO
 * - Restores pre-existing meta tags to their original content
 * - Strictly avoids modifying global site meta tags (viewport, charset, etc.)
 * - Safe under React StrictMode (double invocation)
 */
export function PollSEO({
  title,
  description,
  canonicalUrl,
  coverImageUrl,
}: PollSEOProps) {
  useEffect(() => {
    const prevTitle = document.title;
    const siteTitle = "آوانا | سامانه نظرسنجی و هوشمند یادگیری";
    const fullTitle = title ? `${title} | نظرسنجی آوانا` : siteTitle;
    document.title = fullTitle;

    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const effectiveCanonical = canonicalUrl || currentUrl;
    const effectiveDesc =
      description ||
      "نظرسنجی و پرسشنامه آنلاین آوانا. دیدگاه شما به ارتقای کیفیت آموزش کمک می‌کند.";
    const effectiveImage =
      coverImageUrl || "https://aavana.ir/brand/avana-share-card.png";

    const tagsToManage: TagConfig[] = [
      { type: "meta", attr: "name", key: "description", value: effectiveDesc },
      { type: "meta", attr: "name", key: "robots", value: "index, follow" },
      { type: "meta", attr: "property", key: "og:title", value: fullTitle },
      { type: "meta", attr: "property", key: "og:description", value: effectiveDesc },
      { type: "meta", attr: "property", key: "og:url", value: effectiveCanonical },
      { type: "meta", attr: "property", key: "og:type", value: "website" },
      { type: "meta", attr: "property", key: "og:image", value: effectiveImage },
      { type: "meta", attr: "property", key: "og:site_name", value: "آوانا (AVANA)" },
      { type: "meta", attr: "property", key: "og:locale", value: "fa_IR" },
      { type: "meta", attr: "name", key: "twitter:card", value: "summary_large_image" },
      { type: "meta", attr: "name", key: "twitter:title", value: fullTitle },
      { type: "meta", attr: "name", key: "twitter:description", value: effectiveDesc },
      { type: "meta", attr: "name", key: "twitter:image", value: effectiveImage },
      { type: "link", attr: "rel", key: "canonical", value: effectiveCanonical },
    ];

    const originalStates: TagOriginalState[] = [];

    tagsToManage.forEach((tag) => {
      const selector = `${tag.type}[${tag.attr}="${tag.key}"]`;
      let el = document.head.querySelector(selector) as HTMLElement | null;

      if (!el) {
        // Tag didn't exist: create and mark as created by PollSEO
        el = document.createElement(tag.type);
        el.setAttribute(tag.attr, tag.key);
        el.setAttribute("data-poll-seo", "created");
        document.head.appendChild(el);
        originalStates.push({ selector, wasCreated: true, originalContent: null });
      } else {
        // Tag already existed
        const isPreviouslyCreated = el.getAttribute("data-poll-seo") === "created";
        if (isPreviouslyCreated) {
          originalStates.push({ selector, wasCreated: true, originalContent: null });
        } else {
          const originalContent =
            tag.type === "meta" ? el.getAttribute("content") : el.getAttribute("href");
          originalStates.push({ selector, wasCreated: false, originalContent });
          el.setAttribute("data-poll-seo", "modified");
        }
      }

      if (tag.type === "meta") {
        el.setAttribute("content", tag.value);
      } else {
        el.setAttribute("href", tag.value);
      }
    });

    // JSON-LD Structured Data Schema (schema.org/WebPage)
    const jsonLdId = "poll-schema-jsonld";
    let jsonLdScript = document.getElementById(jsonLdId) as HTMLScriptElement | null;
    let jsonLdWasCreated = false;
    let jsonLdOriginalContent: string | null = null;

    if (!jsonLdScript) {
      jsonLdScript = document.createElement("script");
      jsonLdScript.id = jsonLdId;
      jsonLdScript.type = "application/ld+json";
      jsonLdScript.setAttribute("data-poll-seo", "created");
      document.head.appendChild(jsonLdScript);
      jsonLdWasCreated = true;
    } else {
      jsonLdWasCreated = jsonLdScript.getAttribute("data-poll-seo") === "created";
      if (!jsonLdWasCreated) {
        jsonLdOriginalContent = jsonLdScript.textContent;
        jsonLdScript.setAttribute("data-poll-seo", "modified");
      }
    }

    const schemaData = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: fullTitle,
      description: effectiveDesc,
      url: effectiveCanonical,
      image: effectiveImage,
      inLanguage: "fa",
      publisher: {
        "@type": "Organization",
        name: "آوانا | AVANA",
        url: typeof window !== "undefined" ? window.location.origin : "",
      },
    };
    jsonLdScript.textContent = JSON.stringify(schemaData);

    return () => {
      // Revert title
      document.title = prevTitle;

      // Clean up / revert managed tags
      originalStates.forEach(({ selector, wasCreated, originalContent }) => {
        const el = document.head.querySelector(selector) as HTMLElement | null;
        if (!el) return;

        if (wasCreated) {
          el.remove();
        } else {
          el.removeAttribute("data-poll-seo");
          if (originalContent !== null) {
            const isMeta = selector.startsWith("meta");
            el.setAttribute(isMeta ? "content" : "href", originalContent);
          } else {
            el.remove();
          }
        }
      });

      // Clean up JSON-LD script
      const scriptEl = document.getElementById(jsonLdId);
      if (scriptEl) {
        if (jsonLdWasCreated) {
          scriptEl.remove();
        } else {
          scriptEl.removeAttribute("data-poll-seo");
          if (jsonLdOriginalContent !== null) {
            scriptEl.textContent = jsonLdOriginalContent;
          } else {
            scriptEl.remove();
          }
        }
      }
    };
  }, [title, description, canonicalUrl, coverImageUrl]);

  return null;
}
