import { useEffect } from "react";

export interface BlogSEOProps {
  title: string;
  description?: string | null;
  canonicalUrl?: string | null;
  image?: string | null;
  type?: "article" | "website";
  publishedAt?: string | null;
  updatedAt?: string | null;
  authorName?: string | null;
  keywords?: string[];
  categoryName?: string | null;
}

/**
 * Dynamic SEO & OpenGraph & JSON-LD structured data manager for AVANA Blog (SPA-compliant).
 *
 * Dynamically updates document title, standard meta tags, OpenGraph properties,
 * Twitter cards, canonical links, and injects Schema.org Article JSON-LD markup.
 */
export function BlogSEO({
  title,
  description,
  canonicalUrl,
  image,
  type = "article",
  publishedAt,
  updatedAt,
  authorName,
  keywords,
  categoryName,
}: BlogSEOProps) {
  useEffect(() => {
    // 1. Title
    const siteTitle = "آوانا | پلتفرم هوشمند آموزش داروسازی";
    const fullTitle = title ? `${title} | وبلاگ آوانا` : siteTitle;
    document.title = fullTitle;

    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const effectiveCanonical = canonicalUrl || currentUrl;
    const effectiveDesc =
      description ||
      "وبلاگ آموزشی تخصصی آوانا: مقالات علمی داروسازی، فارماکولوژی، تکنیک‌های یادگیری، فلش‌کارت و آمادگی امتحانات جامع.";
    const effectiveImage =
      image || "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80";

    // Helper to set or create meta tag
    const setMetaTag = (attrName: "name" | "property", attrValue: string, contentValue: string) => {
      let el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attrName, attrValue);
        document.head.appendChild(el);
      }
      el.setAttribute("content", contentValue);
    };

    // Standard Meta
    setMetaTag("name", "description", effectiveDesc);
    if (keywords && keywords.length > 0) {
      setMetaTag("name", "keywords", keywords.join(", "));
    }

    // OpenGraph
    setMetaTag("property", "og:title", fullTitle);
    setMetaTag("property", "og:description", effectiveDesc);
    setMetaTag("property", "og:url", effectiveCanonical);
    setMetaTag("property", "og:type", type);
    setMetaTag("property", "og:image", effectiveImage);
    setMetaTag("property", "og:site_name", "آوانا (AVANA)");
    setMetaTag("property", "og:locale", "fa_IR");

    if (type === "article") {
      if (publishedAt) setMetaTag("property", "article:published_time", publishedAt);
      if (updatedAt) setMetaTag("property", "article:modified_time", updatedAt);
      if (authorName) setMetaTag("property", "article:author", authorName);
      if (categoryName) setMetaTag("property", "article:section", categoryName);
      if (keywords) {
        for (const kw of keywords) {
          setMetaTag("property", "article:tag", kw);
        }
      }
    }

    // Twitter Card
    setMetaTag("name", "twitter:card", "summary_large_image");
    setMetaTag("name", "twitter:title", fullTitle);
    setMetaTag("name", "twitter:description", effectiveDesc);
    setMetaTag("name", "twitter:image", effectiveImage);

    // Canonical link
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute("href", effectiveCanonical);

    // JSON-LD Structured Data Schema (schema.org/Article or BlogPosting)
    let jsonLdScript = document.getElementById("blog-schema-jsonld") as HTMLScriptElement;
    if (!jsonLdScript) {
      jsonLdScript = document.createElement("script");
      jsonLdScript.id = "blog-schema-jsonld";
      jsonLdScript.type = "application/ld+json";
      document.head.appendChild(jsonLdScript);
    }

    const schemaData =
      type === "article"
        ? {
            "@context": "https://schema.org",
            "@type": "EducationalOccupationalCredential",
            "@id": effectiveCanonical,
            "headline": title,
            "description": effectiveDesc,
            "image": effectiveImage,
            "datePublished": publishedAt || new Date().toISOString(),
            "dateModified": updatedAt || publishedAt || new Date().toISOString(),
            "inLanguage": "fa",
            "author": {
              "@type": "Person",
              "name": authorName || "تیم علمی داروسازی آوانا",
            },
            "publisher": {
              "@type": "Organization",
              "name": "آوانا | AVANA",
              "logo": {
                "@type": "ImageObject",
                "url": typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "",
              },
            },
            "mainEntityOfPage": {
              "@type": "WebPage",
              "@id": effectiveCanonical,
            },
          }
        : {
            "@context": "https://schema.org",
            "@type": "Blog",
            "name": "وبلاگ آموزشی آوانا",
            "description": effectiveDesc,
            "url": effectiveCanonical,
            "inLanguage": "fa",
            "publisher": {
              "@type": "Organization",
              "name": "آوانا | AVANA",
            },
          };

    jsonLdScript.textContent = JSON.stringify(schemaData);

    return () => {
      // Optional cleanup on component unmount
    };
  }, [
    title,
    description,
    canonicalUrl,
    image,
    type,
    publishedAt,
    updatedAt,
    authorName,
    keywords,
    categoryName,
  ]);

  return null;
}
