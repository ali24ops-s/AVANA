/**
 * Shared Markdown renderer.
 *
 * Supports GitHub-Flavored Markdown (GFM) tables, RTL Persian text,
 * responsive horizontal overflow scrolling, distinct headers,
 * and seamless dark/light mode integration.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type MarkdownRendererProps = {
  content: string;
};

/**
 * Renders markdown content with consistent styling and full GFM table support.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children, ...props }) => (
          <h1
            className="text-2xl font-bold text-[var(--color-text)] mt-8 mb-4 first:mt-0"
            {...props}
          >
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2
            className="text-xl font-semibold text-[var(--color-text)] mt-6 mb-3"
            {...props}
          >
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3
            className="text-lg font-semibold text-[var(--color-text)] mt-5 mb-2"
            {...props}
          >
            {children}
          </h3>
        ),
        p: ({ children, ...props }) => (
          <p
            className="text-[var(--color-text)] leading-relaxed mb-4"
            {...props}
          >
            {children}
          </p>
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-semibold text-[var(--color-text)]" {...props}>
            {children}
          </strong>
        ),
        ul: ({ children, ...props }) => (
          <ul
            className="list-disc pr-6 pl-0 mb-4 space-y-1 text-[var(--color-text)]"
            {...props}
          >
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol
            className="list-decimal pr-6 pl-0 mb-4 space-y-1 text-[var(--color-text)]"
            {...props}
          >
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="leading-relaxed" {...props}>
            {children}
          </li>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote
            className="my-4 border-r-4 border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 px-4 py-3 rounded-l-lg text-[var(--color-text)] leading-relaxed"
            {...props}
          >
            {children}
          </blockquote>
        ),
        code: ({ children, ...props }) => (
          <code
            className="bg-[var(--color-background)] px-1.5 py-0.5 rounded-md text-sm font-mono text-indigo-600 dark:text-indigo-400"
            {...props}
          >
            {children}
          </code>
        ),
        // GFM Table Components with RTL and Responsive Overflow Container
        table: ({ children, ...props }) => (
          <div className="my-6 w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
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
            className="bg-slate-100 dark:bg-slate-800/90 text-[var(--color-text)] font-bold border-b border-slate-200 dark:border-slate-700"
            {...props}
          >
            {children}
          </thead>
        ),
        tbody: ({ children, ...props }) => (
          <tbody
            className="divide-y divide-slate-200 dark:divide-slate-800 bg-white/60 dark:bg-slate-900/40"
            {...props}
          >
            {children}
          </tbody>
        ),
        tr: ({ children, ...props }) => (
          <tr
            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
            {...props}
          >
            {children}
          </tr>
        ),
        th: ({ children, ...props }) => (
          <th
            className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap"
            {...props}
          >
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td
            className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 align-top"
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
