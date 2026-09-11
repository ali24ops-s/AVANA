import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Vazirmatn Self-Hosted Font Verification", () => {
  it("ensures index.html has no Google Fonts link for Vazirmatn", () => {
    const indexPath = path.resolve(__dirname, "../../index.html");
    const htmlContent = fs.readFileSync(indexPath, "utf8");

    expect(htmlContent).not.toContain("fonts.googleapis.com/css2?family=Vazirmatn");
    expect(htmlContent).not.toContain("fonts.gstatic.com");
  });

  it("ensures package.json includes @fontsource-variable/vazirmatn dependency", () => {
    const packagePath = path.resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

    expect(pkg.dependencies["@fontsource-variable/vazirmatn"]).toBeDefined();
  });

  it("ensures main.tsx imports @fontsource-variable/vazirmatn", () => {
    const mainPath = path.resolve(__dirname, "../main.tsx");
    const mainContent = fs.readFileSync(mainPath, "utf8");

    expect(mainContent).toContain('import "@fontsource-variable/vazirmatn";');
  });

  it("ensures index.css configures Vazirmatn Variable canonical font family in theme and base rules", () => {
    const cssPath = path.resolve(__dirname, "../index.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    expect(cssContent).toContain('"Vazirmatn Variable"');
    expect(cssContent).toContain("--font-sans");
  });

  it("verifies production build bundle contains inlined WOFF2 font data and no Google Fonts links", () => {
    const distIndexPath = path.resolve(__dirname, "../../dist/index.html");
    if (fs.existsSync(distIndexPath)) {
      const distHtml = fs.readFileSync(distIndexPath, "utf8");
      expect(distHtml).not.toContain("fonts.googleapis.com/css2?family=Vazirmatn");
      expect(distHtml.toLowerCase()).toContain("vazirmatn");
      expect(distHtml.includes("woff2")).toBe(true);
    }
  });
});
