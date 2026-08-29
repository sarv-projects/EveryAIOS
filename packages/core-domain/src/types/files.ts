/** Supported MIME types */
export type MimeType =
  | 'application/pdf'
  | 'image/vnd.djvu'
  | 'image/x-djvu'
  | 'text/markdown'
  | 'text/plain'
  | 'text/csv'
  | 'text/tab-separated-values'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'application/epub+zip'
  | 'image/*'
  | string;

/** States a file renderer can be in */
export type RenderState = 'loading' | 'structural-view' | 'rendered' | 'fallback';

export type ReaderColorMode =
  | 'day'
  | 'sepia'
  | 'night'
  | 'night-contrast'
  | 'console';

export type PageTurnMode = 'scroll' | 'page-flip' | 'horizontal' | 'vertical';

export type ReaderRendererKind =
  | 'page-fidelity'
  | 'reflowable'
  | 'plain-text'
  | 'markdown'
  | 'tabular'
  | 'code'
  | 'image'
  | 'fallback';

export interface ReaderMetadata {
  title: string;
  filename: string;
  mimeType: string;
  extension: string;
  sizeBytes?: number;
  author?: string;
  pageCount?: number;
  wordCount?: number;
  language?: string;
}

export interface ReaderTocItem {
  id: string;
  title: string;
  level: number;
  href?: string;
  page?: number;
  position?: number;
}

export interface ReaderSettings {
  colorMode: ReaderColorMode;
  pageTurnMode: PageTurnMode;
  brightness: number;
  fontScale: number;
  lineHeight: number;
  margin: number;
}

export interface ReaderDocument {
  uri: string;
  metadata: ReaderMetadata;
  renderer: ReaderRendererKind;
  state: RenderState;
  text?: string;
  markdown?: string;
  codeLanguage?: string;
  table?: {
    headers: string[];
    rows: string[][];
    delimiter: ',' | '\t';
  };
  toc: ReaderTocItem[];
  searchableText: string;
  settings: ReaderSettings;
  nativeAdapter?:
    | 'pdfium'
    | 'djvulibre'
    | 'readium'
    | 'image-viewer'
    | 'open-with'
    | 'ooxml-structural';
}

/** Metadata for an indexed file */
export interface FileIndex {
  id: string;
  uri: string;
  filename: string;
  mimeType: string;
  indexedAt: string;
  chunkCount: number;
  status: 'indexing' | 'ready' | 'failed';
}

/** A chunk of text extracted from a file */
export interface FileChunk {
  id: number;
  fileId: string;
  text: string;
  vector?: Float32Array;
  chunkIndex: number;
  tokenCount?: number;
}

/** Repository interface for file operations */
/** Optional progress metadata from IndexPipeline (embed-weighted %). */
export type IndexProgressInfo = {
  phase: 'extract' | 'chunk' | 'embed' | 'ready';
  pct: number;
  extractPct?: number;
  embeddedChunks?: number;
  totalChunks?: number;
  searchable?: boolean;
};

export interface FileRepository {
  index(
    uri: string,
    options?: {
      filename?: string;
      onProgress?: (pct: number, info?: IndexProgressInfo) => void;
      betweenChunks?: () => Promise<void>;
    },
  ): Promise<import('./result').Result<FileIndex>>;
  search(fileId: string | null, query: string): Promise<FileChunk[]>;
  render(uri: string): Promise<RenderState>;
}
