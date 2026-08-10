import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

/** A fenced code block with a copy-to-clipboard button (H7). */
function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (webview without permission) — ignore */
    }
  }
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{language || "text"}</span>
        <button className="codeblock-copy" onClick={() => void copy()}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre>
        <code className={language ? `language-${language}` : undefined}>
          {code}
        </code>
      </pre>
    </div>
  );
}

/**
 * Flatten a react-markdown element tree to plain text. rehype-highlight turns
 * code children into `<span class="hljs-*">` elements BEFORE components render,
 * so `String(children)` would yield "[object Object]" — the Copy button must
 * walk the tree and join the text leaves.
 */
function nodeToText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (
    node &&
    typeof node === "object" &&
    "props" in node &&
    (node as { props?: { children?: unknown } }).props
  ) {
    return nodeToText(
      (node as { props: { children?: unknown } }).props.children,
    );
  }
  return "";
}

const components: Components = {
  // Fenced code → highlighted block + copy button. Inline code → styled span.
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    if (
      child &&
      typeof child === "object" &&
      "props" in child &&
      child.props &&
      (child.props as { className?: string }).className
    ) {
      const code = nodeToText(
        (child.props as { children?: unknown }).children ?? "",
      );
      const lang = String((child.props as { className?: string }).className ?? "")
        .replace("language-", "");
      return <CodeBlock language={lang} code={code} />;
    }
    return <pre>{children}</pre>;
  },
  code({ className, children, ...props }) {
    if (className) {
      // Fenced (handled by pre above) — render the raw code text.
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    // Inline code.
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

/** P1.6 — markdown body with KaTeX math + highlighted code + GFM (H7). */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
