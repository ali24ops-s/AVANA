import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CourseSEO } from "../components/courses/CourseSEO.js";

describe("CourseSEO Component", () => {
  it("updates document.title with course title and Avana brand", () => {
    render(
      <CourseSEO
        title="فارماکولوژی بالینی"
        description="آموزش جامع فارماکولوژی"
        subject="داروسازی"
      />,
    );

    expect(document.title).toBe("فارماکولوژی بالینی | آوانا");
  });

  it("updates standard and Open Graph meta tags in document head", () => {
    render(
      <CourseSEO
        title="فارماکولوژی بالینی"
        description="آموزش جامع فارماکولوژی بالینی"
        canonicalUrl="https://aavana.ir/courses/00000000-0000-4000-a000-000000000001"
      />,
    );

    const descMeta = document.querySelector('meta[name="description"]');
    expect(descMeta?.getAttribute("content")).toBe("آموزش جامع فارماکولوژی بالینی");

    const ogTitle = document.querySelector('meta[property="og:title"]');
    expect(ogTitle?.getAttribute("content")).toBe("فارماکولوژی بالینی | آوانا");

    const ogType = document.querySelector('meta[property="og:type"]');
    expect(ogType?.getAttribute("content")).toBe("website");

    const ogUrl = document.querySelector('meta[property="og:url"]');
    expect(ogUrl?.getAttribute("content")).toBe(
      "https://aavana.ir/courses/00000000-0000-4000-a000-000000000001",
    );

    const ogLocale = document.querySelector('meta[property="og:locale"]');
    expect(ogLocale?.getAttribute("content")).toBe("fa_IR");

    const twitterCard = document.querySelector('meta[name="twitter:card"]');
    expect(twitterCard?.getAttribute("content")).toBe("summary_large_image");
  });

  it("injects Schema.org Course JSON-LD script", () => {
    render(
      <CourseSEO
        title="شیمی دارویی ۱"
        description="مبانی ساختار شیمیایی داروها"
      />,
    );

    const script = document.getElementById("course-schema-jsonld");
    expect(script).toBeTruthy();

    const data = JSON.parse(script!.textContent || "{}");
    expect(data["@type"]).toBe("Course");
    expect(data["name"]).toBe("شیمی دارویی ۱");
    expect(data["inLanguage"]).toBe("fa");
  });
});
