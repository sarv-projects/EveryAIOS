export interface CompiledPrompt {
  layers: Map<number, string>;
  full: string;
  hash: string;
}

async function digestSha256(data: Uint8Array): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(buf);
  }
  const { SHA256 } = await import('@stablelib/sha256');
  const hash = new SHA256().update(data).digest();
  return new Uint8Array(hash.buffer, hash.byteOffset, hash.byteLength);
}

export async function compilePrompt(layers: Map<number, string>): Promise<CompiledPrompt> {
  const parts: string[] = [];
  const sorted = [...layers.entries()].sort(([a], [b]) => a - b);
  for (const [, content] of sorted) {
    if (content) parts.push(content);
  }
  const full = parts.join('\n\n');
  const encoder = new TextEncoder();
  const hashBytes = await digestSha256(encoder.encode(full));
  const hash = Array.from(new Uint8Array(hashBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { layers, full, hash };
}
