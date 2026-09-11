/**
 * Shared Rich Content & Markdown renderer for AVANA.
 *
 * Supports:
 * - GitHub-Flavored Markdown (GFM) tables, lists, blockquotes, code blocks
 * - LaTeX / KaTeX math rendering ($...$, $$...$$, \\(...\\), \\[...\\])
 * - Safe delimiter normalization outside code blocks
 * - High-contrast responsive styling for RTL Persian text with isolated LTR math
 * - Both Full (block) and Inline rendering modes
 * - Production-safe KaTeX error handling (throwOnError: false)
 */

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { LessonCallout, type CalloutType } from "./LessonCallout.js";
import { remarkLessonCallouts } from "./remarkLessonCallouts.js";

export interface RichContentProps {
  content?: string | null;
  className?: string;
  inline?: boolean;
  dir?: "rtl" | "ltr" | "auto";
  enableLessonCallouts?: boolean;
}

export type MarkdownRendererProps = RichContentProps;

/**
 * Helper to identify biomedical / scientific tokens that may have been incorrectly wrapped
 * in Markdown backticks by LLMs (e.g. `hsp70`, `FKBP5`, `COX-2`, `ACTH`, `cAMP`).
 * Ensures real programming code (e.g. `npm install`, `JSON.parse()`, `useState()`) is strictly preserved.
 */
function isScientificToken(token: string): boolean {
  const trimmed = token.trim();
  // Exclude anything containing programming syntax, spaces, operators, brackets, parentheses
  if (/[\s();={}[\]<>/*+!~`".,\\]/.test(trimmed) || trimmed.includes("/")) {
    return false;
  }
  // Specific biomedical prefixes (hsp40, CYP3A4, FKBP5, COX-2, GLUT4, JAK2, SGLT2, IL-1, TNF-alpha)
  if (/^(?:hsp|Hsp|HSP)\d+[a-zA-Z]?$/i.test(trimmed)) return true;
  if (/^(?:FKBP|fkbp)\d+[a-zA-Z]?$/i.test(trimmed)) return true;
  if (/^(?:COX|cox)(?:-[1-3]|\d+)?$/i.test(trimmed)) return true;
  if (/^(?:CYP|cyp)\d+[A-Za-z]\d+$/i.test(trimmed)) return true;
  if (/^(?:GLUT|glut|SGLT|sglt)\d+$/i.test(trimmed)) return true;
  if (/^(?:JAK|jak|STAT|stat)\d+$/i.test(trimmed)) return true;
  if (/^(?:IL|il|TNF|tnf|INF|inf)(?:-[0-9a-zA-Zα-ωΑ-Ω]+)?$/i.test(trimmed)) return true;
  if (/^(?:p53|Bcl-2|mTOR|NF-kB|NF-κB|HMG-CoA)$/i.test(trimmed)) return true;
  // Mixed-case biological messengers (cAMP, cGMP, mRNA, tRNA, rRNA, cDNA)
  if (/^(?:cAMP|cGMP|mRNA|tRNA|rRNA|cDNA)$/.test(trimmed)) return true;
  // Uppercase biomedical abbreviations (e.g. ACTH, GH, TSH, LH, FSH, ACE, ACEIs, NSAIDs, GABA, NMDA, LDL, HDL)
  if (/^[A-Z]{2,6}s?$/.test(trimmed)) return true;
  if (/^[A-Z]{2,5}(?:-[0-9A-Za-z]{1,3}|[0-9]{1,3})$/.test(trimmed)) return true;
  return false;
}

/**
 * Normalizes rich content before parsing:
 * 1. Safely normalizes alternative LaTeX delimiters (\(...) -> $...$ and \[...\] -> $$...$$)
 * 2. Protects standalone currency dollar amounts ($100, $50.00) so they don't corrupt math parsing
 * 3. Unwraps scientific terms wrapped in backticks while strictly preserving programming code
 * 4. Recovers legacy corrupted LaTeX commands
 */
export function normalizeRichContent(text: string): string {
  if (!text) {
    return text;
  }

  // Split content by code blocks (fenced ```...``` and inline `...`)
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);

  return parts
    .map((part, index) => {
      // Odd indices are code blocks
      if (index % 2 === 1) {
        // If it is an inline code block (single backticks, not fenced ```), check if it is a scientific term
        if (part.startsWith("`") && !part.startsWith("```") && part.endsWith("`")) {
          const inner = part.slice(1, -1);
          if (isScientificToken(inner)) {
            return inner; // Unwrap scientific token to plain text
          }
        }
        return part; // Leave real code untouched
      }

      let processed = part;

      // 1. Replace \[ ... \] with $$ ... $$
      if (processed.includes("\\[")) {
        processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_match, equation) => {
          return `$$${equation}$$`;
        });
      }

      // 2. Replace \( ... \) with $ ... $
      if (processed.includes("\\(")) {
        processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_match, equation) => {
          return `$${equation}$`;
        });
      }

      // 3. Restore tab-corrupted \text{ inside math delimiters ($...$ and $$...$$)
      processed = processed.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (mathBlock) => {
        return mathBlock.replace(/\\?text\{/g, "\\text{").replace(/\text\{/g, "\\text{");
      });

      // 4. Safely clean stray unmatched ')' immediately after self-contained inline math (e.g. $1,25(OH)_2D$))
      processed = processed.replace(
        /(^|[^\\])((?<!\\)\$[^$\n]+(?<!\\)\$)\)(?!\))/g,
        (fullMatch, prefix, mathBlock, offset, fullStr) => {
          const openInMath = (mathBlock.match(/\(/g) || []).length;
          const closeInMath = (mathBlock.match(/\)/g) || []).length;
          if (openInMath === closeInMath && openInMath > 0) {
            const beforeText = fullStr.slice(0, offset + prefix.length);
            const lastNewline = beforeText.lastIndexOf("\n");
            const lineBefore =
              lastNewline >= 0 ? beforeText.slice(lastNewline + 1) : beforeText;
            const openBefore = (lineBefore.match(/\(/g) || []).length;
            const closeBefore = (lineBefore.match(/\)/g) || []).length;
            if (openBefore <= closeBefore) {
              return `${prefix}${mathBlock}`;
            }
          }
          return fullMatch;
        },
      );

      // 5. Protect standalone currency dollar amounts (e.g. $100, $50.00, $1,000) from corrupting math parsing.
      // E.g. in "هزینه $50 تا $100 است ولی هورمون $T_4$ رایگان است"
      // Standalone dollar amounts are $ followed by digits and optional units, followed by Persian text, whitespace, or Persian punctuation.
      // Must NEVER match or corrupt valid math formulas (e.g. $1,25(OH)_2D$, $1,25\text{-dihydroxyvitamin D}$, $T_4$, $10^{-3}$, $f(x)$).
      processed = processed.replace(
        /(?<!\\)\$(\d+(?:[.,]\d+)*(?:\s*(?:k|K|M|B|USD|EUR|تومان|ریال|هزار|میلیون))?)(?=$|\s|[،؛!؟\u0600-\u06FF]|(?:\s*[\u0600-\u06FF]))/g,
        (_match, amount) => `\\$${amount}`,
      );

      // 6. In plain text outside math: safely unwrap standalone legacy \text{ACRONYM} or \t ext{ACRONYM} to ACRONYM
      const mathSplit = processed.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
      processed = mathSplit
        .map((segment, segIdx) => {
          // Odd indices are math blocks, leave them untouched
          if (segIdx % 2 === 1) return segment;
          return segment
            .replace(/\\?text\{([A-Za-z0-9_\-+]+)\}/g, "$1")
            .replace(/(?:\b|\t)ext\{([A-Za-z0-9_\-+]+)\}/g, "$1");
        })
        .join("");

      return processed;
    })
    .join("");
}


/**
 * Shared rich content component for rendering AI-generated & user-authored markdown with LaTeX.
 */
export function RichContent({
  content,
  className = "",
  inline = false,
  dir = "rtl",
  enableLessonCallouts = false,
}: RichContentProps) {
  if (content === null || content === undefined || content === "") {
    return null;
  }

  const rawText = typeof content === "string" ? content : String(content);
  const normalized = normalizeRichContent(rawText);

  const remarkPlugins: NonNullable<Parameters<typeof ReactMarkdown>[0]["remarkPlugins"]> = [
    remarkGfm,
    remarkMath,
  ];
  if (enableLessonCallouts && !inline) {
    remarkPlugins.push(remarkLessonCallouts);
  }

  const rehypePlugins: [typeof rehypeKatex, { throwOnError: boolean; strict: boolean }] = [
    rehypeKatex,
    {
      throwOnError: false,
      strict: false,
    },
  ];

  if (inline) {
    return (
      <span
        className={`rich-content-inline ${dir === "rtl" ? "rtl text-right" : dir === "ltr" ? "ltr text-left" : ""} ${className}`.trim()}
        dir={dir}
      >
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={[rehypePlugins]}
          components={{
            p: ({ children }) => <>{children}</>,
            h1: ({ children }) => <span className="font-bold">{children}</span>,
            h2: ({ children }) => <span className="font-bold">{children}</span>,
            h3: ({ children }) => <span className="font-bold">{children}</span>,
            h4: ({ children }) => <span className="font-bold">{children}</span>,
            h5: ({ children }) => <span className="font-bold">{children}</span>,
            h6: ({ children }) => <span className="font-bold">{children}</span>,
            code: ({ children, ...props }) => (
              <code
                className="bg-slate-900/70 border border-white/10 px-1.5 py-0.5 rounded text-xs font-mono text-teal-300 inline-block"
                dir="ltr"
                {...props}
              >
                {children}
              </code>
            ),
            a: ({ children, href, ...props }) => (
              <a
                href={href}
                className="text-teal-400 hover:text-teal-300 underline underline-offset-2 font-medium"
                target="_blank"
                rel="noreferrer"
                {...props}
              >
                {children}
              </a>
            ),
          }}
        >
          {normalized}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div
      className={`markdown-content-body rich-content-full ${dir === "rtl" ? "rtl text-right" : dir === "ltr" ? "ltr text-left" : ""} leading-relaxed ${className}`.trim()}
      dir={dir}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[rehypePlugins]}
        components={{
          ...(enableLessonCallouts
            ? {
                callout: ({
                  type,
                  title,
                  children,
                }: {
                  type?: unknown;
                  title?: string;
                  children?: ReactNode;
                }) => (
                  <LessonCallout type={type as CalloutType} title={title}>
                    {children}
                  </LessonCallout>
                ),
              }
            : {}),
          h1: ({ children, ...props }) => (
            <h1
              className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)] mt-8 mb-4 first:mt-0 pb-3 border-b border-[var(--color-border)] tracking-tight leading-snug"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className="text-xl sm:text-2xl font-bold text-[var(--color-text)] mt-7 mb-3.5 leading-snug"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              className="text-lg sm:text-xl font-bold text-[#006666] dark:text-teal-300 mt-6 mb-2.5 leading-snug"
              {...props}
            >
              {children}
            </h3>
          ),
          p: ({ children, ...props }) => (
            <p
              className="text-[15px] sm:text-base text-[var(--color-text)] dark:text-slate-200 leading-[2.1] mb-5 font-normal tracking-normal"
              {...props}
            >
              {children}
            </p>
          ),
          strong: ({ children, ...props }) => (
            <strong className="font-extrabold text-[var(--color-text)] dark:text-white" {...props}>
              {children}
            </strong>
          ),
          a: ({ children, href, ...props }) => (
            <a
              href={href}
              className="text-[#006666] dark:text-teal-300 hover:text-[#008080] dark:hover:text-teal-200 underline underline-offset-4 decoration-[#008080]/40 dark:decoration-teal-500/50 hover:decoration-[#006666] dark:hover:decoration-teal-400 transition-colors font-medium"
              target="_blank"
              rel="noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          hr: (props) => (
            <hr className="my-6 border-[var(--color-border)]" {...props} />
          ),
          img: ({ alt, ...props }) => (
            <img
              className="rounded-card max-w-full h-auto my-4 border border-[var(--color-border)] shadow-md mx-auto"
              alt={alt || ""}
              {...props}
            />
          ),
          ul: ({ children, ...props }) => (
            <ul
              className="list-disc pr-6 pl-0 mb-5 space-y-2 text-[15px] sm:text-base text-[var(--color-text)] dark:text-slate-200"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className="list-decimal pr-6 pl-0 mb-5 space-y-2 text-[15px] sm:text-base text-[var(--color-text)] dark:text-slate-200"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-[2.05] my-1 text-[var(--color-text)] dark:text-slate-200" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="my-5 border-r-4 border-teal-600 dark:border-teal-500 bg-[#e0f2f2]/60 dark:bg-teal-950/30 px-5 py-3.5 rounded-l-card text-[var(--color-text)] dark:text-slate-200 leading-[2] border border-teal-500/20 shadow-xs"
              {...props}
            >
              {children}
            </blockquote>
          ),
          pre: ({ children, ...props }) => (
            <pre
              className="my-4 p-4 rounded-button bg-slate-900/90 border border-[var(--color-border)] overflow-x-auto text-xs sm:text-sm font-mono text-slate-200 leading-relaxed shadow-inner"
              dir="ltr"
              {...props}
            >
              {children}
            </pre>
          ),
          code: ({ children, ...props }) => (
            <code
              className="bg-slate-900/70 border border-white/10 px-2 py-0.5 rounded-md text-sm font-mono text-teal-300 dark:text-teal-300"
              {...props}
            >
              {children}
            </code>
          ),
          // GFM Table Components with High Contrast & RTL Persian Text Alignment
          table: ({ children, ...props }) => (
            <div className="my-6 w-full overflow-x-auto rounded-card border border-[var(--color-border)] shadow-ambient bg-[var(--color-surface)]">
              <table
                className="w-full border-collapse text-right text-sm leading-relaxed"
                dir="rtl"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead
              className="bg-[var(--color-surface-warm)] text-[var(--color-text)] font-extrabold border-b border-[var(--color-border)]"
              {...props}
            >
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody
              className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]"
              {...props}
            >
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr
              className="hover:bg-[var(--color-surface-warm)] transition-colors"
              {...props}
            >
              {children}
            </tr>
          ),
          th: ({ children, ...props }) => (
            <th
              className="px-4 py-3.5 text-right font-extrabold text-[var(--color-text)] tracking-tight whitespace-nowrap bg-[var(--color-surface-warm)] border-b border-[var(--color-border)]"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className="px-4 py-3.5 text-right text-[var(--color-text)] dark:text-slate-200 align-top border-b border-[var(--color-border)]"
              {...props}
            >
              {children}
            </td>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Backward compatibility alias for MarkdownRenderer.
 */
export const MarkdownRenderer = RichContent;
