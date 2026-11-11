/**
 * Utility functions for Mind Map SVG and HTML export.
 */

/**
 * Sanitizes a title string into a clean, safe filename.
 * Preserves Persian, alphanumeric, and replaces unsafe characters.
 */
export function sanitizeFilename(title: string, suffix: string, fallback = "mindmap"): string {
  const cleanTitle = (title || "")
    .replace(/[/\\?%*:|"<>#]/g, "-")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^-+|-+$/g, "")
    .trim();

  const base = cleanTitle.length > 0 ? cleanTitle.slice(0, 80) : fallback;
  return `${base}-${suffix}`;
}

/**
 * Safely escapes characters for XML / SVG attributes and text nodes.
 */
export function escapeXml(unsafe: unknown): string {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Safely escapes characters for HTML insertion to prevent XSS.
 */
export function escapeHtml(unsafe: unknown): string {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Triggers a direct browser file download for a given Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, 1000);
}
