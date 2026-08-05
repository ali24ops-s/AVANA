/**
 * Shared Markdown renderer.
 *
 * Extracted from LearningPage to avoid duplicating the ReactMarkdown
 * configuration across multiple pages. Both the learner and authoring
 * UIs use this component for consistent rendering.
 */

import ReactMarkdown from "react-markdown";

export type MarkdownRendererProps = {
  content: string;
};

/**
 * Renders markdown content with consistent styling across the application.
 * Uses the same configuration as the original LearningPage implementation.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
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
            className="list-disc pl-6 mb-4 space-y-1 text-[var(--color-text)]"
            {...props}
          >
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol
            className="list-decimal pl-6 mb-4 space-y-1 text-[var(--color-text)]"
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
        code: ({ children, ...props }) => (
          <code
            className="bg-[var(--color-background)] px-1.5 py-0.5 rounded-md text-sm font-mono text-indigo-600 dark:text-indigo-400"
            {...props}
          >
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
