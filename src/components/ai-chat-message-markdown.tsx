"use client";

/**
 * Markdown renderer for AI chat assistant messages.
 *
 * Replaces the plain `<div whitespace-pre-wrap>` per ADR-0046 Phase D.1.
 * Uses `react-markdown` + `remark-gfm` for GitHub-flavored markdown,
 * `rehype-sanitize` to strip any HTML the model emits, and routes fenced
 * code blocks through {@link AIChatCodeBlock}.
 *
 * User messages stay plain — only assistant turns get markdown. The chat
 * panel decides which branch to render based on `msg.role`.
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { AIChatCodeBlock } from "@/components/ai-chat-code-block";

export interface AIChatMessageMarkdownProps {
  content: string;
}

interface CodeProps extends ComponentPropsWithoutRef<"code"> {
  inline?: boolean;
  children?: ReactNode;
}

/**
 * Renders a string of markdown as React. Custom component overrides:
 *
 * - `code` — inline code stays as a styled `<code>`; fenced blocks route to
 *   {@link AIChatCodeBlock} for syntax highlighting + the copy button.
 * - `a` — links open in a new tab with `rel="noopener noreferrer"`.
 * - `ul` / `ol` / `li` — tighter spacing than the typography defaults
 *   because chat turns are dense.
 * - `pre` — passthrough; the code component owns the chrome.
 */
export function AIChatMessageMarkdown({ content }: AIChatMessageMarkdownProps) {
  return (
    <div className="break-words text-sm leading-relaxed [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_hr]:my-3 [&_hr]:border-muted-foreground/20 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-muted-foreground/20 [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-muted-foreground/20 [&_td]:px-2 [&_td]:py-1 [&_strong]:font-semibold [&_em]:italic">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code(props: CodeProps) {
            const { inline, className, children, ...rest } = props;
            // `inline` is set by react-markdown when the code is not a fenced
            // block. Some setups omit it; detect by looking for a language-*
            // className as a fallback.
            const langMatch = /language-([\w-]+)/.exec(className ?? "");
            const isInline = inline ?? !langMatch;
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            const codeText = String(children ?? "").replace(/\n$/, "");
            return (
              <AIChatCodeBlock code={codeText} language={langMatch?.[1]} />
            );
          },
          pre({ children }) {
            // The code component above renders its own chrome inside a div,
            // so we strip the `<pre>` wrapper to avoid double containers.
            return <>{children}</>;
          },
          a({ href, children, ...rest }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                {...rest}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
