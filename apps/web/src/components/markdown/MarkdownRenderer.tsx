/**
 * Shared Markdown renderer.
 *
 * Supports GitHub-Flavored Markdown (GFM) tables, RTL Persian text,
 * responsive horizontal overflow scrolling, distinct high-contrast headers,
 * and seamless dark/light mode integration.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type MarkdownRendererProps = {
  content: string;
};

/**
 * Renders markdown content with consistent high-contrast styling and full GFM table support.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
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
            className="text-lg sm:text-xl font-bold text-[var(--color-text)] mt-6 mb-2.5 leading-snug text-teal-400"
            {...props}
          >
            {children}
          </h3>
        ),
        p: ({ children, ...props }) => (
          <p
            className="text-[15px] sm:text-base text-slate-200 leading-[2.1] mb-5 font-normal tracking-normal"
            {...props}
          >
            {children}
          </p>
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-bold text-white" {...props}>
            {children}
          </strong>
        ),
        ul: ({ children, ...props }) => (
          <ul
            className="list-disc pr-6 pl-0 mb-5 space-y-2 text-[15px] sm:text-base text-slate-200"
            {...props}
          >
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol
            className="list-decimal pr-6 pl-0 mb-5 space-y-2 text-[15px] sm:text-base text-slate-200"
            {...props}
          >
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="leading-[2.05] my-1" {...props}>
            {children}
          </li>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote
            className="my-5 border-r-4 border-teal-500 bg-teal-950/20 px-5 py-3.5 rounded-l-xl text-slate-200 leading-[2] border border-teal-500/20 shadow-xs"
            {...props}
          >
            {children}
          </blockquote>
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
          <div className="my-6 w-full overflow-x-auto rounded-2xl border border-white/10 shadow-ambient bg-[var(--color-surface)]">
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
            className="bg-[var(--color-surface-warm)] text-[var(--color-text)] font-extrabold border-b border-white/10"
            {...props}
          >
            {children}
          </thead>
        ),
        tbody: ({ children, ...props }) => (
          <tbody
            className="divide-y divide-white/10 bg-[var(--color-surface)]"
            {...props}
          >
            {children}
          </tbody>
        ),
        tr: ({ children, ...props }) => (
          <tr
            className="hover:bg-white/5 transition-colors"
            {...props}
          >
            {children}
          </tr>
        ),
        th: ({ children, ...props }) => (
          <th
            className="px-4 py-3.5 text-right font-extrabold text-[var(--color-text)] tracking-tight whitespace-nowrap bg-[var(--color-surface-warm)] border-b border-white/10"
            {...props}
          >
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td
            className="px-4 py-3.5 text-right text-slate-200 align-top border-b border-white/5"
            {...props}
          >
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
