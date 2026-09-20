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

import React, { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { LessonCallout, type CalloutType } from "./LessonCallout.js";
import { remarkLessonCallouts } from "./remarkLessonCallouts.js";
import {
  parseChemicalCodeContent,
} from "@avana/domain";

const LazyChemicalStructureBlock = React.lazy(() =>
  import("../chemistry/ChemicalStructureBlock.js").then((m) => ({
    default: m.ChemicalStructureBlock,
  })),
);

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
 * in Markdown backticks by LLMs (e.g. `hsp70`, `Lisinopril`, `Atenolol`, `GFR`, `ACE inhibitors`, `10 mg/kg`, `Stage 3 CKD`).
 * Ensures real programming code (e.g. `npm install`, `const x = 10;`, `JSON.parse()`, `useState()`) is strictly preserved.
 */
function isScientificToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;

  // STRICT PROGRAMMING GUARDS: Exclude real programming code, CLI commands, scripts, syntax
  // Programming keywords & common functions
  if (
    /^(?:const|let|var|function|return|import|export|class|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|typeof|instanceof|void|delete|new|this|async|await|yield|console|npm|pnpm|yarn|bun|npx|git|docker|curl|wget|cd|ls|mkdir|rm|chmod|chown|ssh|sudo|pip|python|node|ts|js|select|insert|update|delete|from|where|order by|group by)\b/i.test(
      trimmed,
    )
  ) {
    return false;
  }

  // Code operators & constructs (assignments, arrow functions, semicolons, brackets, braces, comparisons)
  if (/[;={}[\]<>*+!~`"\\]/.test(trimmed)) {
    return false;
  }
  // Function calls like foo() or methods like arr.map()
  if (/\w+\([^)]*\)/.test(trimmed) || /\.\w+\(/.test(trimmed)) {
    return false;
  }
  // Dot property access or file paths (e.g. object.property, ./path, /var/log, foo/bar)
  if (trimmed.includes("./") || trimmed.startsWith("/") || /\w+\.\w+/.test(trimmed) || /[a-z0-9_]+\/[a-z0-9_]{3,}/i.test(trimmed)) {
    return false;
  }

  // 1. Specific biomedical prefixes & pathways (hsp40, CYP3A4, FKBP5, COX-2, GLUT4, JAK2, SGLT2, IL-1, TNF-alpha)
  if (/^(?:hsp|Hsp|HSP)\d+[a-zA-Z]?$/i.test(trimmed)) return true;
  if (/^(?:FKBP|fkbp)\d+[a-zA-Z]?$/i.test(trimmed)) return true;
  if (/^(?:COX|cox)(?:-[1-3]|\d+)?$/i.test(trimmed)) return true;
  if (/^(?:CYP|cyp)\d+[A-Za-z]\d+$/i.test(trimmed)) return true;
  if (/^(?:GLUT|glut|SGLT|sglt)\d+$/i.test(trimmed)) return true;
  if (/^(?:JAK|jak|STAT|stat)\d+$/i.test(trimmed)) return true;
  if (/^(?:IL|il|TNF|tnf|INF|inf)(?:-[0-9a-zA-Zα-ωΑ-Ω]+)?$/i.test(trimmed)) return true;
  if (/^(?:p53|Bcl-2|mTOR|NF-kB|NF-κB|HMG-CoA)$/i.test(trimmed)) return true;

  // 2. Mixed-case biological messengers & nucleotides (cAMP, cGMP, mRNA, tRNA, rRNA, cDNA, HbA1c)
  if (/^(?:cAMP|cGMP|mRNA|tRNA|rRNA|cDNA|HbA1c)$/i.test(trimmed)) return true;

  // 3. Uppercase & Mixed biomedical abbreviations (e.g. GFR, eGFR, ACTH, GH, TSH, LH, FSH, ACE, ACEIs, ARBs, NSAIDs, GABA, NMDA, LDL, HDL, CKD, NYHA, BP, MAP, ECG, EKG)
  if (/^[A-Z]{2,6}s?$/.test(trimmed)) return true;
  if (/^[A-Z]{2,5}(?:-[0-9A-Za-z]{1,3}|[0-9]{1,3})$/.test(trimmed)) return true;

  // 4. Clinical stages & classifications (e.g. "Stage 3 CKD", "NYHA Class II", "Grade 2", "Type 2 Diabetes")
  if (/^(?:Stage|Grade|Class|Type|Phase)\s+[0-9IVXAB]+(?:\s+[A-Za-z]+)?$/i.test(trimmed)) return true;

  // 5. Drug classes & multi-word medical categories (e.g. "ACE inhibitors", "Beta-blockers", "Calcium channel blockers")
  if (
    /^(?:[A-Za-z0-9-]+\s+)*(?:inhibitor|inhibitors|blocker|blockers|agonist|agonists|antagonist|antagonists|diuretic|diuretics|channel|receptor|receptors|syndrome|disease|hypertension)$/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // 6. Dosages, lab values & medical units (e.g. "10 mg/kg", "50 mg", "120 mmHg", "10 mcg/kg/min", "5 mg/dL", "140 mmol/L")
  if (
    /^\d+(?:\.\d+)?\s*(?:mg|mcg|μg|g|kg|mL|L|dL|mmol|mEq|IU|bpm|mmHg|mol)(?:\/(?:kg|day|hr|min|dL|L|dose))?(?:\/(?:min|hr|day))?$/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // 7. Capitalized Single Drug / Chemical / Medical Names (e.g. Lisinopril, Atenolol, Metformin, Captopril, Propranolol)
  if (/^[A-Z][a-z]{2,25}$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Normalizes rich content before parsing:
 * 1. Unwraps outer raw JSON string quotes if content was stringified (e.g. "\"...\")
 * 2. Normalizes escaped newlines (\\n -> \n) and escaped tabs/quotes outside code blocks and math
 * 3. Safely normalizes alternative LaTeX delimiters (\(...) -> $...$ and \[...\] -> $$...$$)
 * 4. Protects standalone currency dollar amounts ($100, $50.00) so they don't corrupt math parsing
 * 5. Unwraps scientific terms wrapped in backticks while strictly preserving programming code
 * 6. Recovers legacy corrupted LaTeX commands and converts raw standalone LaTeX arrows outside math
 */
export function normalizeRichContent(text: string): string {
  if (!text) {
    return text;
  }

  let raw = text;

  // 0. Unwrap outer raw JSON string quotes if the whole string was dumped as a JSON string literal (e.g. "\"متن...\"")
  if (
    raw.length >= 2 &&
    raw.startsWith('"') &&
    raw.endsWith('"') &&
    (raw.includes("\\n") || raw.includes('\\"') || raw.includes("\\t"))
  ) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        raw = parsed;
      }
    } catch {
      if (!raw.slice(1, -1).includes('"')) {
        raw = raw.slice(1, -1);
      }
    }
  }

  // Split content by code blocks (fenced ```...``` and inline `...`)
  // Uses paired match to prevent desynchronization on unclosed single backticks
  const parts = raw.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

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

      // 6. Split by math blocks to safely normalize plain text without touching math equations
      const mathSplit = processed.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
      processed = mathSplit
        .map((segment, segIdx) => {
          // Odd indices are math blocks, leave them untouched
          if (segIdx % 2 === 1) return segment;

          let seg = segment;

          // Normalize escaped newlines in plain text (e.g. \\r\\n -> \n, \\n -> \n)
          // Exclude LaTeX commands starting with \n like \nabla, \neq, \nu, \notin, \null, \natural, \nearrow, \nwarrow, \noindent
          // Also convert literal \newline to \n
          seg = seg.replace(/\\newline\b/g, "\n");
          seg = seg.replace(/\\r\\n/g, "\n");
          seg = seg.replace(/\\n(?![a-zA-Z])/g, "\n");
          seg = seg.replace(/\\n(?=(?:[0-9\-*•#>\s\u0600-\u06FF]))/g, "\n");

          // Normalize escaped quotes (\") in plain text
          seg = seg.replace(/\\"/g, '"');

          // Normalize escaped tabs (\\t) in plain text
          seg = seg.replace(/\\t/g, " ");

          // In plain text outside math: safely unwrap standalone legacy \text{ACRONYM} or \t ext{ACRONYM} to ACRONYM
          // and safely convert standalone raw LaTeX arrows and math symbols outside $...$
          seg = seg
            .replace(/\\?text\{([A-Za-z0-9_\-+]+)\}/g, "$1")
            .replace(/(?:\b|\t)ext\{([A-Za-z0-9_\-+]+)\}/g, "$1")
            // Safe raw LaTeX arrow and symbol conversions outside math and code
            .replace(/\\(?:rightarrow|to)\b/g, "→")
            .replace(/\\(?:leftarrow|gets)\b/g, "←")
            .replace(/\\leftrightarrow\b/g, "↔")
            .replace(/\\Rightarrow\b/g, "⇒")
            .replace(/\\Leftarrow\b/g, "⇐")
            .replace(/\\Leftrightarrow\b/g, "⇔")
            .replace(/\\(?:rightleftharpoons|leftharpoons)\b/g, "⇌")
            .replace(/\\uparrow\b/g, "↑")
            .replace(/\\downarrow\b/g, "↓")
            .replace(/\\times\b/g, "×")
            .replace(/\\leq\b/g, "≤")
            .replace(/\\geq\b/g, "≥")
            .replace(/\\pm\b/g, "±");

          return seg;
        })
        .join("");

      return processed;
    })
    .join("");
}

export { parseChemicalCodeContent };

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
        className={`rich-content-inline ${dir === "rtl" ? "rtl text-right" : dir === "ltr" ? "ltr text-left" : ""} break-words [overflow-wrap:anywhere] [unicode-bidi:isolate] inline-block max-w-full ${className}`.trim()}
        dir={dir}
      >
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={[rehypePlugins]}
          components={{
            p: ({ children }) => <span className="inline leading-relaxed whitespace-pre-line break-words">{children}</span>,
            h1: ({ children }) => <span className="font-bold inline block mb-1">{children}</span>,
            h2: ({ children }) => <span className="font-bold inline block mb-1">{children}</span>,
            h3: ({ children }) => <span className="font-bold inline block mb-1">{children}</span>,
            h4: ({ children }) => <span className="font-bold inline">{children}</span>,
            h5: ({ children }) => <span className="font-bold inline">{children}</span>,
            h6: ({ children }) => <span className="font-bold inline">{children}</span>,
            ul: ({ children }) => <ul className="list-disc pr-4 my-1 text-inherit">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pr-4 my-1 text-inherit">{children}</ol>,
            li: ({ children }) => <li className="my-0.5 leading-relaxed break-words [unicode-bidi:isolate]">{children}</li>,
            code: ({ children, ...props }) => (
              <code
                className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 px-1.5 py-0.5 rounded text-xs font-mono text-teal-900 dark:text-teal-300 inline-block align-baseline [unicode-bidi:isolate]"
                dir="ltr"
                {...props}
              >
                {children}
              </code>
            ),
            a: ({ children, href, ...props }) => (
              <a
                href={href}
                className="text-teal-400 hover:text-teal-300 underline underline-offset-2 font-medium break-words"
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
      className={`markdown-content-body rich-content-full ${dir === "rtl" ? "rtl text-right" : dir === "ltr" ? "ltr text-left" : ""} leading-relaxed break-words [overflow-wrap:anywhere] ${className}`.trim()}
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
              className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)] mt-8 mb-4 first:mt-0 pb-3 border-b border-[var(--color-border)] tracking-tight leading-snug break-words [unicode-bidi:isolate]"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className="text-xl sm:text-2xl font-bold text-[var(--color-text)] mt-7 mb-3.5 leading-snug break-words [unicode-bidi:isolate]"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              className="text-lg sm:text-xl font-bold text-[#006666] dark:text-teal-300 mt-6 mb-2.5 leading-snug break-words [unicode-bidi:isolate]"
              {...props}
            >
              {children}
            </h3>
          ),
          p: ({ children, ...props }) => (
            <p
              className="text-[15px] sm:text-base text-[var(--color-text)] dark:text-slate-200 leading-[2.1] mb-5 font-normal tracking-normal whitespace-pre-line break-words [overflow-wrap:anywhere] [unicode-bidi:isolate]"
              {...props}
            >
              {children}
            </p>
          ),
          strong: ({ children, ...props }) => (
            <strong className="font-extrabold text-[var(--color-text)] dark:text-white [unicode-bidi:isolate]" {...props}>
              {children}
            </strong>
          ),
          a: ({ children, href, ...props }) => (
            <a
              href={href}
              className="text-[#006666] dark:text-teal-300 hover:text-[#008080] dark:hover:text-teal-200 underline underline-offset-4 decoration-[#008080]/40 dark:decoration-teal-500/50 hover:decoration-[#006666] dark:hover:decoration-teal-400 transition-colors font-medium break-words"
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
            <li className="leading-[2.05] my-1 text-[var(--color-text)] dark:text-slate-200 break-words [unicode-bidi:isolate]" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="my-5 border-r-4 border-teal-600 dark:border-teal-500 bg-[#e0f2f2]/60 dark:bg-teal-950/30 px-5 py-3.5 rounded-l-card text-[var(--color-text)] dark:text-slate-200 leading-[2] border border-teal-500/20 shadow-xs break-words"
              {...props}
            >
              {children}
            </blockquote>
          ),
          pre: ({ children, ...props }) => {
            // If the code child is a chemical or smiles block, unwrap <pre>
            if (
              React.isValidElement<{ className?: string }>(children) &&
              typeof children.props?.className === "string"
            ) {
              const cls = children.props.className;
              if (cls.includes("language-chemical") || cls.includes("language-smiles")) {
                return <>{children}</>;
              }
            }
            return (
              <pre
                className="my-4 p-4 rounded-card bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 overflow-x-auto text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-200 leading-relaxed shadow-xs"
                dir="ltr"
                {...props}
              >
                {children}
              </pre>
            );
          },
          code: ({ children, className, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match ? match[1].toLowerCase() : "";
            if (lang === "chemical" || lang === "smiles") {
              const rawContent =
                typeof children === "string"
                  ? children
                  : Array.isArray(children)
                  ? children.map((c) => (typeof c === "string" ? c : "")).join("")
                  : "";
              const parsedStructure = parseChemicalCodeContent(rawContent, lang);
              if (parsedStructure) {
                return (
                  <React.Suspense
                    fallback={
                      <div
                        className="my-6 p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs text-[var(--color-text-muted)] animate-pulse"
                        dir="rtl"
                      >
                        در حال بارگذاری ساختار مولکولی...
                      </div>
                    }
                  >
                    <LazyChemicalStructureBlock structure={parsedStructure} />
                  </React.Suspense>
                );
              }
            }

            return (
              <code
                className={`bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 px-1.5 py-0.5 rounded text-xs sm:text-sm font-mono text-teal-900 dark:text-teal-300 inline-block align-baseline [unicode-bidi:isolate] ${className || ""}`.trim()}
                {...props}
              >
                {children}
              </code>
            );
          },
          // GFM Table Components with High Contrast & RTL Persian Text Alignment
          table: ({ children, ...props }) => (
            <div className="my-3.5 sm:my-4 w-full overflow-x-auto rounded-card border border-[var(--color-border)] shadow-xs bg-[var(--color-surface)]">
              <table
                className={`w-full !m-0 !my-0 border-collapse ${dir === "ltr" ? "text-left" : "text-right"} text-sm leading-relaxed`}
                dir={dir || "rtl"}
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
              className={`px-4 py-3 ${dir === "ltr" ? "text-left" : "text-right"} font-extrabold text-[var(--color-text)] tracking-tight whitespace-nowrap bg-[var(--color-surface-warm)] [unicode-bidi:isolate]`}
              dir={dir || "rtl"}
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className={`px-4 py-3 ${dir === "ltr" ? "text-left" : "text-right"} text-[var(--color-text)] dark:text-slate-200 align-top break-words [unicode-bidi:isolate]`}
              dir={dir || "rtl"}
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
