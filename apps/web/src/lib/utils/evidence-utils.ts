import type { SourceChunkResource } from "@avana/contracts";

/**
 * Calculates total word count across all source chunks.
 */
export function calculateWordCount(chunks?: SourceChunkResource[] | null): number {
  if (!chunks || chunks.length === 0) return 0;
  return chunks.reduce((acc, chunk) => {
    const text = chunk.content ? chunk.content.trim() : "";
    if (!text) return acc;
    const words = text.split(/\s+/).filter(Boolean).length;
    return acc + words;
  }, 0);
}

/**
 * Extracts clean, deduplicated topic titles from the AI outline / initial TOC payload and source chunks.
 *
 * Priority:
 * 1. AI initial Table of Contents / Outline / Sessions from `payload` (`payload.outline`, `payload.sessions`, `payload.topics`)
 * 2. Explicit chunk headings (`chunk.heading`)
 * 3. Markdown headers inside `chunk.content` (`#`, `##`, `###`, `**header**`)
 * 4. Fallback to `payload.title` if no headings found
 *
 * NOTE: Does NOT generate generic fallback text like "مطالب صفحه X".
 */
export function extractTopicsFromSourceChunks(
  chunks?: SourceChunkResource[] | null,
  payload?: Record<string, unknown> | null,
): string[] {
  const topicsSet = new Set<string>();

  // 1. Extract from AI initial Outline / Table of Contents / Sessions in payload
  if (payload) {
    // Check `outline` array
    if (Array.isArray(payload.outline)) {
      for (const item of payload.outline) {
        if (typeof item === "string" && item.trim()) {
          topicsSet.add(cleanTopicString(item));
        } else if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          if (typeof obj.title === "string" && obj.title.trim()) {
            topicsSet.add(cleanTopicString(obj.title));
          } else if (typeof obj.topic === "string" && obj.topic.trim()) {
            topicsSet.add(cleanTopicString(obj.topic));
          }
        }
      }
    }

    // Check `sessions` array
    if (Array.isArray(payload.sessions)) {
      for (const item of payload.sessions) {
        if (typeof item === "string" && item.trim()) {
          topicsSet.add(cleanTopicString(item));
        } else if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          if (typeof obj.title === "string" && obj.title.trim()) {
            topicsSet.add(cleanTopicString(obj.title));
          } else if (typeof obj.topic === "string" && obj.topic.trim()) {
            topicsSet.add(cleanTopicString(obj.topic));
          }
        }
      }
    }

    // Check `topics` array
    if (Array.isArray(payload.topics)) {
      for (const item of payload.topics) {
        if (typeof item === "string" && item.trim()) {
          topicsSet.add(cleanTopicString(item));
        }
      }
    }
  }

  // 2. Extract explicit headings and markdown headers from source chunks
  if (chunks && chunks.length > 0) {
    for (const chunk of chunks) {
      if (chunk.heading && chunk.heading.trim()) {
        const clean = cleanTopicString(chunk.heading);
        if (clean) topicsSet.add(clean);
      }

      if (chunk.content) {
        const lines = chunk.content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (/^#{1,4}\s+(.+)/.test(trimmed)) {
            const match = trimmed.match(/^#{1,4}\s+(.+)/);
            if (match && match[1]) {
              const clean = cleanTopicString(match[1]);
              if (clean.length > 2 && clean.length < 80) {
                topicsSet.add(clean);
              }
            }
          } else if (/^\*\*(.+?)\*\*/.test(trimmed)) {
            const match = trimmed.match(/^\*\*(.+?)\*\*/);
            if (match && match[1]) {
              const clean = cleanTopicString(match[1]);
              if (clean.length > 2 && clean.length < 80) {
                topicsSet.add(clean);
              }
            }
          }
        }
      }
    }
  }

  // 3. Fallback to payload title if no topics found
  if (topicsSet.size === 0 && payload && typeof payload.title === "string" && payload.title.trim()) {
    topicsSet.add(cleanTopicString(payload.title));
  }

  return Array.from(topicsSet);
}

function cleanTopicString(str: string): string {
  return str
    .replace(/^[#*\s-]+/, "")
    .replace(/[*`_]/g, "")
    .replace(/[:؛]$/, "")
    .trim();
}
