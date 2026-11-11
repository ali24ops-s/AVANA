import type { CalloutType } from "./callout.js";

export interface CalloutPattern {
  type: CalloutType;
  title: string;
  regex: RegExp;
}

const LEGACY_CALLOUT_EMOJI =
  "(?:\\u26A0\\uFE0F|\\u26A0|⚠️|⚠|\\u{1F9E0}|🧠|\\u{1F4CC}|📌|\\u{1F48A}|💊|\\u{1F4A1}|💡|🚨|❗|❌|✅|⛔|🚫|🔑|⭐|🔴|🟢)";

export const CALLOUT_PATTERNS: CalloutPattern[] = [
  {
    type: "common-mistake",
    title: "اشتباه رایج",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:اشتباه[\\s\\u200C]+رایج|اشتباه[\\s\\u200C]+متداول|\\[!COMMON-MISTAKE\\]|common-mistake)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "warning",
    title: "هشدار",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:هشدار|اخطار|توجه[\\s\\u200C]+مهم|\\[!WARNING\\]|\\[!CAUTION\\]|warning|caution)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "contraindication",
    title: "منع مصرف",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:منع[\\s\\u200C]+مصرف|موارد[\\s\\u200C]+منع[\\s\\u200C]+مصرف|\\[!CONTRAINDICATION\\]|contraindication)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "important",
    title: "نکته مهم",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته[\\s\\u200C]+مهم|توجه[\\s\\u200C]+مهم|\\[!IMPORTANT\\]|important)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "clinical-point",
    title: "نکته بالینی",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته[\\s\\u200C]+بالینی|کاربرد[\\s\\u200C]+بالینی|\\[!CLINICAL-POINT\\]|clinical-point|clinical point)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "drug-application",
    title: "کاربرد دارویی نوین",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:کاربرد[\\s\\u200C]+دارویی[\\s\\u200C]+نوین|کاربرد[\\s\\u200C]+دارویی|\\[!DRUG-APPLICATION\\]|drug-application)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "key-point",
    title: "نکته کلیدی",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته[\\s\\u200C]+کلیدی|نکات[\\s\\u200C]+کلیدی|\\[!KEY-POINT\\]|key-point|key point)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "educational-tip",
    title: "نکته آموزشی",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته[\\s\\u200C]+آموزشی|\\[!EDUCATIONAL-TIP\\]|educational-tip)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "understanding",
    title: "برای فهم بهتر",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:برای[\\s\\u200C]+فهم[\\s\\u200C]+بهتر|برای[\\s\\u200C]+درک[\\s\\u200C]+بهتر|\\[!UNDERSTANDING\\]|understanding)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "supplementary",
    title: "توضیح تکمیلی",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:(?:توضیح|اطلاعات|نکته)[\\s\\u200C]+تکمیلی(?:[\\s\\u200C]+آوانا)?(?:[\\s\\u200C]*—[\\s\\u200C]*در[\\s\\u200C]+منبع[\\s\\u200C]+اصلی[\\s\\u200C]+ذکر[\\s\\u200C]+نشده[\\s\\u200C]+است)?|(?:توضیح|اطلاعات|نکته)[\\s\\u200C]+تکمیلی|\\[!SUPPLEMENTARY\\]|supplementary)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "tip",
    title: "نکته",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته(?!\\s*(?:بالینی|آموزشی|کلیدی|مهم|حیاتی|دارویی|نوین))|\\[!TIP\\]|\\[!NOTE\\]|tip|note)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
];

interface MatchResult {
  matched: boolean;
  type?: CalloutType;
  title?: string;
}

function getNodeStartText(node: any): string {
  if (!node.children || node.children.length === 0) return "";
  let text = "";
  for (const child of node.children) {
    if (child.type === "text") {
      text += child.value;
    } else if (child.type === "strong" || child.type === "emphasis") {
      const inner = child.children?.[0];
      if (inner && inner.type === "text") {
        text += inner.value;
      }
    } else {
      break;
    }
    if (text.length > 80) break;
  }
  return text;
}

function isCalloutTrigger(node: any): boolean {
  if (!node) return false;
  if (node.type === "blockquote") {
    if (node.children && node.children.length > 0 && node.children[0].type === "paragraph") {
      const text = getNodeStartText(node.children[0]);
      return CALLOUT_PATTERNS.some((p) => p.regex.test(text));
    }
  }
  if (node.type === "paragraph" || node.type === "heading") {
    const text = getNodeStartText(node);
    const firstChild = node.children?.[0];
    const isBold = firstChild?.type === "strong" || firstChild?.type === "emphasis";
    for (const p of CALLOUT_PATTERNS) {
      const match = p.regex.exec(text);
      if (match && (isBold || /[:：]/.test(match[0]) || new RegExp(LEGACY_CALLOUT_EMOJI, "u").test(match[0]))) {
        return true;
      }
    }
  }
  return false;
}

function extractAndStripCalloutPrefix(node: any, isFromBlockquote = false): MatchResult {
  if (!node.children || node.children.length === 0) {
    return { matched: false };
  }

  // Case 1: First child is a plain text node
  const firstChild = node.children[0];
  if (firstChild.type === "text") {
    for (const pattern of CALLOUT_PATTERNS) {
      const match = pattern.regex.exec(firstChild.value);
      if (match) {
        const hasEmoji = new RegExp(LEGACY_CALLOUT_EMOJI, "u").test(match[0]);
        const hasColon = /[:：]/.test(match[0]);
        if (!hasEmoji && !hasColon && !isFromBlockquote) {
          continue;
        }

        firstChild.value = firstChild.value.slice(match[0].length);
        if (firstChild.value.length === 0) {
          node.children.shift();
        }
        return { matched: true, type: pattern.type, title: pattern.title };
      }
    }
  }

  // Case 2: First child is strong/emphasis
  if (
    (firstChild.type === "strong" || firstChild.type === "emphasis") &&
    firstChild.children &&
    firstChild.children.length > 0
  ) {
    const innerFirst = firstChild.children[0];
    if (innerFirst.type === "text") {
      for (const pattern of CALLOUT_PATTERNS) {
        const match = pattern.regex.exec(innerFirst.value);
        if (match) {
          innerFirst.value = innerFirst.value.slice(match[0].length);
          if (innerFirst.value.length === 0) {
            firstChild.children.shift();
          }
          node.children.splice(0, 1, ...firstChild.children);
          if (node.children[0] && node.children[0].type === "text") {
            node.children[0].value = node.children[0].value.replace(/^[:：\s]+/, "");
            if (node.children[0].value.length === 0) {
              node.children.shift();
            }
          }
          return { matched: true, type: pattern.type, title: pattern.title };
        }
      }
    }
  }

  // Case 3: Emoji in text node, followed by strong node
  if (
    node.children.length >= 2 &&
    firstChild.type === "text" &&
    (node.children[1].type === "strong" || node.children[1].type === "emphasis")
  ) {
    const secondChild = node.children[1];
    const innerFirst = secondChild.children?.[0];
    if (innerFirst && innerFirst.type === "text") {
      const combined = firstChild.value + innerFirst.value;
      for (const pattern of CALLOUT_PATTERNS) {
        const match = pattern.regex.exec(combined);
        if (match) {
          node.children.shift();
          const remainingToStrip = match[0].length - firstChild.value.length;
          if (remainingToStrip > 0) {
            innerFirst.value = innerFirst.value.slice(remainingToStrip);
            if (innerFirst.value.length === 0) {
              secondChild.children.shift();
            }
          }
          node.children.splice(0, 1, ...(secondChild.children || []));
          if (node.children[0] && node.children[0].type === "text") {
            node.children[0].value = node.children[0].value.replace(/^[:：\s]+/, "");
            if (node.children[0].value.length === 0) {
              node.children.shift();
            }
          }
          return { matched: true, type: pattern.type, title: pattern.title };
        }
      }
    }
  }

  // Case 4: Standalone bracketed callout tag [!TAG]
  if (firstChild.type === "text") {
    const bracketMatch = /^\s*\[!(WARNING|CAUTION|IMPORTANT|NOTE|TIP)\]\s*[:：]?\s*/i.exec(firstChild.value);
    if (bracketMatch) {
      const tag = bracketMatch[1].toUpperCase();
      let type: CalloutType = "tip";
      let title = "نکته";
      if (tag === "WARNING" || tag === "CAUTION") {
        type = "warning";
        title = "هشدار";
      } else if (tag === "IMPORTANT") {
        type = "important";
        title = "نکته مهم";
      } else if (tag === "NOTE" || tag === "TIP") {
        type = "tip";
        title = "نکته";
      }
      firstChild.value = firstChild.value.slice(bracketMatch[0].length);
      if (firstChild.value.length === 0) {
        node.children.shift();
      }
      return { matched: true, type, title };
    }
  }

  return { matched: false };
}

/**
 * Remark Plugin: remarkLessonCallouts
 *
 * Scans MDAST trees and converts educational Callout blocks into custom <callout> elements.
 * Preserves full rich content parsing (LaTeX math, bold, code, lists) inside callouts.
 */
export function remarkLessonCallouts() {
  return (tree: any) => {
    if (!tree || !Array.isArray(tree.children)) {
      return;
    }

    const newChildren: any[] = [];
    let i = 0;

    while (i < tree.children.length) {
      const child = tree.children[i];

      // 1. Blockquote format
      if (child.type === "blockquote") {
        if (
          child.children &&
          child.children.length > 0 &&
          child.children[0].type === "paragraph"
        ) {
          const match = extractAndStripCalloutPrefix(child.children[0], true);
          if (match.matched) {
            if (child.children[0].children.length === 0) {
              child.children.shift();
            }

            const calloutNode: any = {
              type: "callout",
              data: {
                hName: "callout",
                hProperties: {
                  type: match.type,
                  title: match.title,
                },
              },
              children:
                child.children.length > 0
                  ? child.children
                  : [{ type: "paragraph", children: [] }],
            };

            newChildren.push(calloutNode);
            i++;
            continue;
          }
        }
      }

      // 2. Paragraph or Heading format
      if (child.type === "paragraph" || child.type === "heading") {
        const match = extractAndStripCalloutPrefix(child, false);
        if (match.matched) {
          const bodyChildren: any[] = [];
          const wasStandaloneTitle = child.children.length === 0;

          if (!wasStandaloneTitle) {
            bodyChildren.push(child);
          }

          let j = i + 1;
          while (j < tree.children.length) {
            const next = tree.children[j];
            if (
              next.type === "heading" ||
              next.type === "thematicBreak" ||
              isCalloutTrigger(next)
            ) {
              break;
            }

            if (wasStandaloneTitle) {
              bodyChildren.push(next);
              j++;
            } else if (
              next.type === "list" ||
              next.type === "math" ||
              next.type === "code" ||
              next.type === "table"
            ) {
              bodyChildren.push(next);
              j++;
            } else {
              break;
            }
          }

          const calloutNode: any = {
            type: "callout",
            data: {
              hName: "callout",
              hProperties: {
                type: match.type,
                title: match.title,
              },
            },
            children:
              bodyChildren.length > 0
                ? bodyChildren
                : [{ type: "paragraph", children: [] }],
          };

          newChildren.push(calloutNode);
          i = j;
          continue;
        }
      }

      // Default: Unmatched node
      newChildren.push(child);
      i++;
    }

    tree.children = newChildren;
  };
}
