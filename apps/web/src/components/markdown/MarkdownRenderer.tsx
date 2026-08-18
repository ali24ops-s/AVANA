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
          <strong className="font-bold text-[var(--color-text)]" {...props}>
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
            className="my-4 border-r-4 border-[#007a7a] bg-[var(--color-surface-warm)] px-4 py-3 rounded-l-lg text-[var(--color-text)] leading-relaxed border border-[var(--color-border)]"
            {...props}
          >
            {children}
          </blockquote>
        ),
        code: ({ children, ...props }) => (
          <code
            className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-md text-sm font-mono text-[#007a7a] dark:text-[#38bdf8]"
            {...props}
          >
            {children}
          </code>
        ),
        // GFM Table Components with High Contrast & RTL Persian Text Alignment
        table: ({ children, ...props }) => (
          <div className="my-6 w-full overflow-x-auto rounded-2xl border-2 border-[var(--color-border)] shadow-xs bg-[var(--color-surface)]">
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
            className="bg-[var(--color-surface-warm)] text-[var(--color-text)] font-extrabold border-b-2 border-[var(--color-border)]"
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
            className="px-4 py-3.5 text-right font-extrabold text-[var(--color-text)] tracking-tight whitespace-nowrap bg-[var(--color-surface-warm)] border-b-2 border-[var(--color-border)]"
            {...props}
          >
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td
            className="px-4 py-3 text-right text-[var(--color-text)] align-top border-b border-[var(--color-border)]"
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
