import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Estedad Diagnostic Font Verification", () => {
  it("ensures Estedad font files exist in src/assets/fonts", () => {
    const fontPath = path.resolve(
      __dirname,
      "../assets/fonts/Estedad-v5.0-Fontjo.com/Estedad[wght,kshd].woff2",
    );
    expect(fs.existsSync(fontPath)).toBe(true);
  });

  it("ensures @font-face for Estedad is properly defined in index.css", () => {
    const cssPath = path.resolve(__dirname, "../index.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    expect(cssContent).toContain('@font-face');
    expect(cssContent).toContain('font-family: "Estedad"');
    expect(cssContent).toContain('Estedad[wght,kshd].woff2');
    expect(cssContent).toContain('font-weight: 100 900;');
  });

  it("ensures canonical font variables and CSS selectors use Estedad as primary font", () => {
    const cssPath = path.resolve(__dirname, "../index.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    expect(cssContent).toContain('--default-font-family: "Estedad"');
    expect(cssContent).toContain('--font-sans: "Estedad"');
    expect(cssContent).toContain('--font-body: "Estedad"');
    expect(cssContent).toContain('--font-headline: "Estedad"');
    expect(cssContent).toContain('--font-estedad: "Estedad"');
  });

  it("verifies Vazirmatn is retained for easy rollback", () => {
    const mainPath = path.resolve(__dirname, "../main.tsx");
    const mainContent = fs.readFileSync(mainPath, "utf8");
    expect(mainContent).toContain('import "@fontsource-variable/vazirmatn";');

    const cssPath = path.resolve(__dirname, "../index.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");
    expect(cssContent).toContain('"Vazirmatn Variable"');
  });
});
