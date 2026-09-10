// P53.8 — `@` file refs: workspace files as path refs. While an external
// Chief is pinned, `@path` also rides as ACP `resource` content when the
// agent advertised `embeddedContext`; the text seam (`userDocuments`) always
// carries it so a non-advertising agent still sees the ref as text.
export function splitAtRefs(text: string): { clean: string; refs: string[] } {
  const refs: string[] = []
  const clean = text.replace(/(?:^|\s)@([A-Za-z0-9_.\-][\w\-./]*)/g, (m, p: string) => {
    refs.push(p)
    // Keep surrounding whitespace shape: drop the `@ref`, leave the space.
    return m.startsWith(' ') || m.startsWith('\n') || m.startsWith('\t') ? m[0] : ''
  })
  return { clean, refs }
}
