import type { Root, RootContent, Paragraph, Heading, Blockquote } from "mdast";
import type { CalloutType } from "@avana/domain";

interface CalloutPattern {
  type: CalloutType;
  title: string;
  regex: RegExp;
}

const LEGACY_CALLOUT_EMOJI =
  "(?:\\u26A0\\uFE0F|\\u26A0|⚠️|⚠|\\u{1F9E0}|🧠|\\u{1F4CC}|📌|\\u{1F48A}|💊|\\u{1F4A1}|💡|🚨|❗|❌|✅|⛔|🚫|🔑|⭐|🔴|🟢)";

const CALLOUT_PATTERNS: CalloutPattern[] = [
  {
    type: "common-mistake",
    title: "اشتباه رایج",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:اشتباه[\\s\\u200C]+رایج|اشتباه[\\s\\u200C]+متداول|common-mistake)\\s*[:：]?\\s*`,
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
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:منع[\\s\\u200C]+مصرف|موارد[\\s\\u200C]+منع[\\s\\u200C]+مصرف|contraindication)\\s*[:：]?\\s*`,
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
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته[\\s\\u200C]+بالینی|کاربرد[\\s\\u200C]+بالینی|clinical-point|clinical point)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "drug-application",
    title: "کاربرد دارویی نوین",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:کاربرد[\\s\\u200C]+دارویی[\\s\\u200C]+نوین|کاربرد[\\s\\u200C]+دارویی|drug-application)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "key-point",
    title: "نکته کلیدی",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته[\\s\\u200C]+کلیدی|نکات[\\s\\u200C]+کلیدی|key-point|key point)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "educational-tip",
    title: "نکته آموزشی",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته[\\s\\u200C]+آموزشی|educational-tip)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "understanding",
    title: "برای فهم بهتر",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:برای[\\s\\u200C]+فهم[\\s\\u200C]+بهتر|برای[\\s\\u200C]+درک[\\s\\u200C]+بهتر|understanding)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "supplementary",
    title: "توضیح تکمیلی",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:(?:توضیح|اطلاعات|نکته)[\\s\\u200C]+تکمیلی(?:[\\s\\u200C]+آوانا)?(?:[\\s\\u200C]*—[\\s\\u200C]*در[\\s\\u200C]+منبع[\\s\\u200C]+اصلی[\\s\\u200C]+ذکر[\\s\\u200C]+نشده[\\s\\u200C]+است)?|(?:توضیح|اطلاعات|نکته)[\\s\\u200C]+تکمیلی|supplementary)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
  {
    type: "tip",
    title: "نکته",
    regex: new RegExp(
      `^(?:${LEGACY_CALLOUT_EMOJI}\\s*)?(?:نکته|\\[!TIP\\]|\\[!NOTE\\]|tip|note)\\s*[:：]?\\s*`,
      "iu",
    ),
  },
];

interface MatchResult {
  matched: boolean;
  type?: CalloutType;
  title?: string;
}

/**
 * Returns leading text of a paragraph/heading node across initial phrasing children.
 */
function getNodeStartText(node: Paragraph | Heading): string {
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

/**
 * Checks if a block node starts with any Callout pattern trigger.
 */
function isCalloutTrigger(node: RootContent): boolean {
  if (!node) return false;
  if (node.type === "blockquote") {
    const bq = node as Blockquote;
    if (bq.children && bq.children.length > 0 && bq.children[0].type === "paragraph") {
      const text = getNodeStartText(bq.children[0]);
      return CALLOUT_PATTERNS.some((p) => p.regex.test(text));
    }
  }
  if (node.type === "paragraph" || node.type === "heading") {
    const text = getNodeStartText(node as Paragraph | Heading);
    // Ensure it has colon, bold, emoji, or is a distinct callout trigger
    const firstChild = (node as Paragraph | Heading).children?.[0];
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

/**
 * Checks if the phrasing contents at the start of a block match a callout trigger pattern.
 * If matched, mutates the phrasing nodes to strip out the emoji, phrase, and colon prefix.
 */
function extractAndStripCalloutPrefix(node: Paragraph | Heading, isFromBlockquote = false): MatchResult {
  if (!node.children || node.children.length === 0) {
    return { matched: false };
  }

  // Case 1: First child is a plain text node
  const firstChild = node.children[0];
  if (firstChild.type === "text") {
    for (const pattern of CALLOUT_PATTERNS) {
      const match = pattern.regex.exec(firstChild.value);
      if (match) {
        // Prevent false positives on casual running speech without emoji/colon in plain paragraph
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

  // Case 2: First child is strong/emphasis containing the trigger (e.g. **اشتباه رایج:** or **⚠️ اشتباه رایج:**)
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
          // Unwrap remaining children of firstChild so text after colon is not unintentionally bolded
          node.children.splice(0, 1, ...firstChild.children);
          // Strip any trailing colon or whitespace that was outside the bold node
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

  // Case 3: Emoji in text node, followed by strong node (e.g. ⚠️ **اشتباه رایج:**)
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
          // Remove emoji/prefix
          node.children.shift(); // remove text node (emoji)
          const remainingToStrip = match[0].length - firstChild.value.length;
          if (remainingToStrip > 0) {
            innerFirst.value = innerFirst.value.slice(remainingToStrip);
            if (innerFirst.value.length === 0) {
              secondChild.children.shift();
            }
          }
          // Unwrap remaining children of secondChild
          node.children.splice(0, 1, ...(secondChild.children || []));
          // Strip any trailing colon/whitespace
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

  return { matched: false };
}

/**
 * Remark Plugin: remarkLessonCallouts
 *
 * Scans MDAST trees and converts educational Callout blocks into custom <callout> elements.
 * Preserves full rich content parsing (LaTeX math, bold, code, lists) inside callouts.
 */
export function remarkLessonCallouts() {
  return (tree: Root) => {
    if (!tree || !Array.isArray(tree.children)) {
      return;
    }

    const newChildren: RootContent[] = [];
    let i = 0;

    while (i < tree.children.length) {
      const child = tree.children[i];

      // 1. Blockquote format: > **اشتباه رایج:**\n> متن... or > ⚠️ اشتباه رایج:\n> متن...
      if (child.type === "blockquote") {
        const blockquote = child as Blockquote;
        if (
          blockquote.children &&
          blockquote.children.length > 0 &&
          blockquote.children[0].type === "paragraph"
        ) {
          const match = extractAndStripCalloutPrefix(blockquote.children[0], true);
          if (match.matched) {
            // If the first paragraph became empty after stripping prefix, remove it
            if (blockquote.children[0].children.length === 0) {
              blockquote.children.shift();
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
                blockquote.children.length > 0
                  ? blockquote.children
                  : [{ type: "paragraph", children: [] }],
            };

            newChildren.push(calloutNode);
            i++;
            continue;
          }
        }
      }

      // 2. Paragraph or Heading format: **اشتباه رایج:** متن... or ⚠️ اشتباه رایج: متن...
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
              // Absorbs content blocks for standalone title callout
              bodyChildren.push(next);
              j++;
            } else if (
              next.type === "list" ||
              (next.type as string) === "math" ||
              next.type === "code" ||
              next.type === "table"
            ) {
              // Absorbs attached lists/math/code/tables
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
