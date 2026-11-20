import { useEffect } from "react";

export interface CourseSEOProps {
  title: string;
  description?: string | null;
  canonicalUrl?: string | null;
  image?: string | null;
  subject?: string | null;
  isPublic?: boolean;
}

/**
 * Dynamic SEO, Open Graph & JSON-LD structured data manager for AVANA Courses.
 * Follows the proven pattern from BlogSEO for SPA-compliant metadata updates.
 */
export function CourseSEO({
  title,
  description,
  canonicalUrl,
  image,
  subject,
  isPublic = true,
}: CourseSEOProps) {
  useEffect(() => {
    const siteTitle = "آوانا | پلتفرم هوشمند یادگیری";
    const fullTitle = title ? `${title} | آوانا` : siteTitle;
    document.title = fullTitle;

    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const effectiveCanonical = canonicalUrl || currentUrl;
    const effectiveDesc =
      description ||
      (subject
        ? `دوره تخصصی ${title} در زمینه ${subject} در پلتفرم هوشمند یادگیری آوانا.`
        : `دوره تخصصی ${title} همراه با درسنامه‌ها، فلش‌کارت‌ها و آزمون‌های تعاملی در آوانا.`);
    const effectiveImage =
      image ||
      (typeof window !== "undefined"
        ? `${window.location.origin}/brand/avana-share-card.png`
        : "/brand/avana-share-card.png");

    const setMetaTag = (
      attrName: "name" | "property",
      attrValue: string,
      contentValue: string,
    ) => {
      let el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attrName, attrValue);
        document.head.appendChild(el);
      }
      el.setAttribute("content", contentValue);
    };

    // Robots meta tag
    if (isPublic) {
      setMetaTag("name", "robots", "index, follow");
    } else {
      setMetaTag("name", "robots", "noindex, nofollow");
    }

    // Standard Meta
    setMetaTag("name", "description", effectiveDesc);

    // OpenGraph
    setMetaTag("property", "og:title", fullTitle);
    setMetaTag("property", "og:description", effectiveDesc);
    setMetaTag("property", "og:type", "website");
    setMetaTag("property", "og:image", effectiveImage);
    setMetaTag("property", "og:site_name", "آوانا (AVANA)");
    setMetaTag("property", "og:locale", "fa_IR");

    // Twitter Card
    setMetaTag("name", "twitter:card", "summary_large_image");
    setMetaTag("name", "twitter:title", fullTitle);
    setMetaTag("name", "twitter:description", effectiveDesc);
    setMetaTag("name", "twitter:image", effectiveImage);

    // Canonical link management
    let canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;

    if (isPublic && effectiveCanonical) {
      setMetaTag("property", "og:url", effectiveCanonical);
      if (!canonicalLink) {
        canonicalLink = document.createElement("link");
        canonicalLink.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute("href", effectiveCanonical);
    } else {
      // Non-public courses MUST NOT advertise canonical indexing
      if (canonicalLink) {
        canonicalLink.remove();
      }
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) {
        ogUrl.remove();
      }
    }

    // JSON-LD Structured Data Schema (schema.org/Course)
    let jsonLdScript = document.getElementById(
      "course-schema-jsonld",
    ) as HTMLScriptElement | null;

    if (isPublic) {
      if (!jsonLdScript) {
        jsonLdScript = document.createElement("script");
        jsonLdScript.id = "course-schema-jsonld";
        jsonLdScript.type = "application/ld+json";
        document.head.appendChild(jsonLdScript);
      }

      const schemaData = {
        "@context": "https://schema.org",
        "@type": "Course",
        name: title,
        description: effectiveDesc,
        provider: {
          "@type": "Organization",
          name: "آوانا | AVANA",
          url: typeof window !== "undefined" ? window.location.origin : "",
        },
        image: effectiveImage,
        inLanguage: "fa",
      };

      jsonLdScript.textContent = JSON.stringify(schemaData);
    } else {
      if (jsonLdScript) {
        jsonLdScript.remove();
      }
    }

    return () => {
      // Cleanup on unmount if needed
    };
  }, [title, description, canonicalUrl, image, subject, isPublic]);

  return null;
}
