/**
 * AVANA Instagram Story Generator (9:16 Canvas Engine).
 *
 * Generates high-fidelity 1080x1920 PNG images suitable for Instagram Stories,
 * fully adhering to AVANA brand guidelines, Estedad typography, RTL formatting,
 * and Instagram safe zones (220px top / bottom clearance).
 */

import { toPersianDigits, cleanEducationalTitle } from "@avana/domain";

export interface CourseStoryStats {
  moduleCount?: number;
  lessonCount?: number;
  flashcardCount?: number;
  quizQuestionCount?: number;
}

export interface CourseStoryOptions {
  title: string;
  description?: string | null;
  subject?: string | null;
  coverImage?: string | null;
  courseId: string;
  stats?: CourseStoryStats;
  shareUrl?: string;
}

const BRAND = {
  bgDefault: "#F7F9FA",
  cardSurface: "#FFFFFF",
  primary: "#008080",
  primaryDark: "#006060",
  primaryLight: "#E0F2F2",
  primarySoft: "#F0FAFA",
  secondary: "#A7D0E6",
  secondaryDark: "#5BA0C4",
  warm: "#F0E6D2",
  warmDark: "#C2853F",
  border: "#E2E7EA",
  borderSubtle: "#EEF1F3",
  textPrimary: "#1A2226",
  textSecondary: "#3D4F55",
  textMuted: "#5B6268",
};

/**
 * Ensures the Estedad or fallback fonts are loaded before canvas rendering.
 */
async function ensureFontsLoaded(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.race([
      document.fonts.load("bold 48px Estedad"),
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);
  } catch {
    // Graceful fallback to default system fonts
  }
}

/**
 * Safely loads an image URL handling CORS with fallback to placeholder.
 */
async function loadSafeImage(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === "undefined") return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Draws a rounded rectangle path on canvas.
 */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Splits text into lines fitting a maximum pixel width.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length === maxLines - 1) {
        // Last permitted line: assemble remainder and truncate if necessary
        const remaining = words.slice(i).join(" ");
        let lastLine = remaining;
        while (
          ctx.measureText(lastLine + "...").width > maxWidth &&
          lastLine.length > 0
        ) {
          lastLine = lastLine.slice(0, -1).trim();
        }
        lines.push(lastLine ? `${lastLine}...` : "...");
        return lines;
      }
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Generates an Instagram Story 1080x1920 PNG Blob.
 */
export async function generateCourseStory(
  options: CourseStoryOptions,
): Promise<Blob> {
  await ensureFontsLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context is not available.");
  }

  // Set RTL direction
  ctx.direction = "rtl";

  // 1. Full Background Fill
  ctx.fillStyle = BRAND.bgDefault;
  ctx.fillRect(0, 0, 1080, 1920);

  // Subtle decorative background circles / shapes
  const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
  bgGrad.addColorStop(0, "#F7F9FA");
  bgGrad.addColorStop(0.5, "#EDF3F5");
  bgGrad.addColorStop(1, "#E5EEF2");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1920);

  // Decorative soft light circles in corners
  ctx.save();
  ctx.fillStyle = "rgba(167, 208, 230, 0.25)";
  ctx.beginPath();
  ctx.arc(1000, 200, 350, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(100, 1750, 400, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Safe Margins:
  // Top: 220px clearance
  // Bottom: 220px clearance
  // Content card box:
  const cardX = 70;
  const cardY = 220;
  const cardWidth = 940;
  const cardHeight = 1480;
  const cardRadius = 36;

  // Main Card Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = BRAND.cardSurface;
  drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, cardRadius);
  ctx.fill();
  ctx.restore();

  // Card Border
  ctx.strokeStyle = BRAND.border;
  ctx.lineWidth = 2;
  drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, cardRadius);
  ctx.stroke();

  // 3. Brand Header Inside Card
  const contentPadding = 60;
  const innerX = cardX + cardWidth - contentPadding; // RTL right edge
  let currentY = cardY + 70;

  // Header Brand Badge
  const badgeHeight = 52;
  const badgeWidth = 260;
  const badgeX = innerX - badgeWidth;

  ctx.fillStyle = BRAND.primaryLight;
  drawRoundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, 26);
  ctx.fill();

  ctx.strokeStyle = "rgba(0, 128, 128, 0.25)";
  ctx.lineWidth = 1.5;
  drawRoundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, 26);
  ctx.stroke();

  // Badge Text
  ctx.fillStyle = BRAND.primary;
  ctx.font = "bold 24px Estedad, Vazirmatn, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("آوانا | AVANA", badgeX + badgeWidth / 2, currentY + badgeHeight / 2 + 1);

  // Subtitle / Platform Name on Left of Header
  ctx.fillStyle = BRAND.textMuted;
  ctx.font = "normal 22px Estedad, Vazirmatn, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    "همراه هوشمند یادگیری",
    cardX + contentPadding,
    currentY + badgeHeight / 2 + 1,
  );

  currentY += badgeHeight + 40;

  // 4. Course Cover or High-Quality Branded Graphic
  const coverWidth = cardWidth - contentPadding * 2;
  const coverHeight = 440;
  const coverX = cardX + contentPadding;
  const coverY = currentY;
  const coverRadius = 24;

  let loadedImg: HTMLImageElement | null = null;
  if (options.coverImage) {
    loadedImg = await loadSafeImage(options.coverImage);
  }

  ctx.save();
  drawRoundRect(ctx, coverX, coverY, coverWidth, coverHeight, coverRadius);
  ctx.clip();

  if (loadedImg) {
    // Draw cover image with cover/center aspect fill
    const imgRatio = loadedImg.width / loadedImg.height;
    const targetRatio = coverWidth / coverHeight;
    let sW = loadedImg.width;
    let sH = loadedImg.height;
    let sX = 0;
    let sY = 0;

    if (imgRatio > targetRatio) {
      sW = loadedImg.height * targetRatio;
      sX = (loadedImg.width - sW) / 2;
    } else {
      sH = loadedImg.width / targetRatio;
      sY = (loadedImg.height - sH) / 2;
    }

    ctx.drawImage(loadedImg, sX, sY, sW, sH, coverX, coverY, coverWidth, coverHeight);
  } else {
    // Branded Graphic Cover Placeholder
    const coverGrad = ctx.createLinearGradient(
      coverX,
      coverY,
      coverX + coverWidth,
      coverY + coverHeight,
    );
    coverGrad.addColorStop(0, BRAND.primary);
    coverGrad.addColorStop(1, BRAND.secondaryDark);
    ctx.fillStyle = coverGrad;
    ctx.fillRect(coverX, coverY, coverWidth, coverHeight);

    // Decorative geometric accents in placeholder
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.arc(coverX + coverWidth * 0.85, coverY + coverHeight * 0.3, 140, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(coverX + coverWidth * 0.2, coverY + coverHeight * 0.8, 110, 0, Math.PI * 2);
    ctx.fill();

    // Large decorative Book/Education icon label
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 56px Estedad, Vazirmatn, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("آموزش تخصصی", coverX + coverWidth / 2, coverY + coverHeight / 2 - 20);

    if (options.subject) {
      ctx.fillStyle = BRAND.warm;
      ctx.font = "normal 30px Estedad, Vazirmatn, sans-serif";
      ctx.fillText(options.subject, coverX + coverWidth / 2, coverY + coverHeight / 2 + 40);
    }
  }
  ctx.restore();

  // Border around cover
  ctx.strokeStyle = BRAND.border;
  ctx.lineWidth = 1.5;
  drawRoundRect(ctx, coverX, coverY, coverWidth, coverHeight, coverRadius);
  ctx.stroke();

  currentY += coverHeight + 45;

  // 5. Subject Tag
  if (options.subject) {
    const subjectText = options.subject;
    ctx.font = "bold 24px Estedad, Vazirmatn, sans-serif";
    const subTextWidth = ctx.measureText(subjectText).width;
    const subPillWidth = subTextWidth + 36;
    const subPillHeight = 44;
    const subPillX = innerX - subPillWidth;

    ctx.fillStyle = BRAND.warm;
    drawRoundRect(ctx, subPillX, currentY, subPillWidth, subPillHeight, 14);
    ctx.fill();

    ctx.fillStyle = BRAND.textPrimary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      subjectText,
      subPillX + subPillWidth / 2,
      currentY + subPillHeight / 2 + 1,
    );

    currentY += subPillHeight + 24;
  }

  // 6. Course Title (Bold Typography, wrapped up to 3 lines)
  const cleanTitle = cleanEducationalTitle(options.title);
  ctx.font = "bold 46px Estedad, Vazirmatn, sans-serif";
  ctx.fillStyle = BRAND.textPrimary;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  const titleLines = wrapText(ctx, cleanTitle, coverWidth, 3);
  const titleLineHeight = 64;

  for (const line of titleLines) {
    ctx.fillText(line, innerX, currentY);
    currentY += titleLineHeight;
  }

  currentY += 15;

  // 7. Course Description (Optional, up to 2 lines)
  if (options.description) {
    ctx.font = "normal 28px Estedad, Vazirmatn, sans-serif";
    ctx.fillStyle = BRAND.textMuted;
    const descLines = wrapText(ctx, options.description.trim(), coverWidth, 2);
    const descLineHeight = 44;

    for (const line of descLines) {
      ctx.fillText(line, innerX, currentY);
      currentY += descLineHeight;
    }
    currentY += 20;
  } else {
    currentY += 10;
  }

  // 8. Stats Badges Row (if available)
  const stats = options.stats;
  const statItems: string[] = [];
  if (stats) {
    if (stats.moduleCount && stats.moduleCount > 0) {
      statItems.push(`${toPersianDigits(stats.moduleCount)} فصل`);
    }
    if (stats.lessonCount && stats.lessonCount > 0) {
      statItems.push(`${toPersianDigits(stats.lessonCount)} درسنامه`);
    }
    if (stats.flashcardCount && stats.flashcardCount > 0) {
      statItems.push(`${toPersianDigits(stats.flashcardCount)} فلش‌کارت`);
    }
    if (stats.quizQuestionCount && stats.quizQuestionCount > 0) {
      statItems.push(`${toPersianDigits(stats.quizQuestionCount)} سؤال آزمون`);
    }
  }

  if (statItems.length > 0) {
    let statX = innerX;
    ctx.font = "bold 22px Estedad, Vazirmatn, sans-serif";

    for (const item of statItems.slice(0, 3)) {
      const itemWidth = ctx.measureText(item).width + 36;
      const pillX = statX - itemWidth;

      ctx.fillStyle = BRAND.primarySoft;
      drawRoundRect(ctx, pillX, currentY, itemWidth, 42, 12);
      ctx.fill();

      ctx.strokeStyle = BRAND.border;
      ctx.lineWidth = 1;
      drawRoundRect(ctx, pillX, currentY, itemWidth, 42, 12);
      ctx.stroke();

      ctx.fillStyle = BRAND.primaryDark;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item, pillX + itemWidth / 2, currentY + 22);

      statX -= itemWidth + 16;
    }
    currentY += 56;
  }

  // 9. CTA Button and Instagram Link Sticker Guidance at bottom of Card
  const ctaBoxY = cardY + cardHeight - 190;
  const ctaBoxWidth = coverWidth;
  const ctaBoxHeight = 130;
  const ctaBoxX = cardX + contentPadding;

  // Background for sticker guide box
  ctx.fillStyle = BRAND.bgDefault;
  drawRoundRect(ctx, ctaBoxX, ctaBoxY, ctaBoxWidth, ctaBoxHeight, 20);
  ctx.fill();

  ctx.strokeStyle = BRAND.border;
  ctx.lineWidth = 1.5;
  drawRoundRect(ctx, ctaBoxX, ctaBoxY, ctaBoxWidth, ctaBoxHeight, 20);
  ctx.stroke();

  // CTA Text
  ctx.fillStyle = BRAND.primary;
  ctx.font = "bold 28px Estedad, Vazirmatn, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "مشاهده و یادگیری این دوره در آوانا",
    ctaBoxX + ctaBoxWidth / 2,
    ctaBoxY + 42,
  );

  // Link Sticker guidance cue
  const displayUrl = options.shareUrl
    ? options.shareUrl.replace(/^https?:\/\//, "")
    : `avana.app/courses/${options.courseId}`;

  ctx.fillStyle = BRAND.textMuted;
  ctx.font = "normal 22px Estedad, Vazirmatn, sans-serif";
  ctx.fillText(
    `استیکر لینک اینستاگرام 🔗 ${displayUrl}`,
    ctaBoxX + ctaBoxWidth / 2,
    ctaBoxY + 88,
  );

  // Export to Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to convert canvas to PNG blob."));
      }
    }, "image/png");
  });
}

/**
 * Triggers a native browser file download for the generated story blob.
 */
export function downloadStoryBlob(blob: Blob, filename = "avana-course-story.png"): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Checks whether Web Share API supports file sharing in current browser/device.
 */
export function canShareStoryFiles(): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }
  try {
    const testFile = new File([new Uint8Array(1)], "test.png", { type: "image/png" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

/**
 * Shares the generated story image file directly using Web Share API.
 */
export async function shareStoryBlob(
  blob: Blob,
  title: string,
  shareUrl?: string,
): Promise<boolean> {
  if (!canShareStoryFiles()) return false;
  try {
    const safeTitle = title.replace(/[\s/\\:]+/g, "-").slice(0, 30);
    const filename = `avana-story-${safeTitle}.png`;
    const file =
      typeof File !== "undefined"
        ? new File([blob], filename, { type: "image/png" })
        : (blob as unknown as File);

    // Re-verify that this specific file instance is shareable
    if (typeof navigator.canShare === "function") {
      const isShareable = navigator.canShare({ files: [file] });
      if (!isShareable) return false;
    }

    const shareData: ShareData = {
      title: `استوری دوره «${title}»`,
      text: shareUrl
        ? `دوره آموزشی «${title}» در آوانا\n${shareUrl}`
        : `دوره آموزشی «${title}» در سامانه هوشمند یادگیری آوانا`,
      files: [file],
    };

    await navigator.share(shareData);
    return true;
  } catch (err: unknown) {
    // If user canceled the share sheet, do not treat as error
    if (
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.message?.includes("AbortError") ||
        err.message?.includes("canceled") ||
        err.message?.includes("cancelled"))
    ) {
      return false;
    }
    throw err;
  }
}
