// P4.7 — office viewer bridge (H5): read surfaces for docx/pptx/pdf over the
// Rust engines. Mirrors the serde payloads in src-tauri/src/office_cmds.rs.
// In a plain-browser preview the pages fall back to demo content.

import { invoke } from "./tauri";
import { nativeCall } from './runtime';

export interface DocxBlockInfo {
  address: string;
  kind: string;
  part: string;
}

export interface DocxPayload {
  path: string;
  text: string;
  blocks: DocxBlockInfo[];
}

export interface PptxSlideInfo {
  part: string;
  text: string;
}

export interface PptxPayload {
  path: string;
  slides: PptxSlideInfo[];
  deck: string;
}

export interface PdfPayload {
  path: string;
  pages: number;
  texts: string[];
}

export async function docxOpen(path: string): Promise<DocxPayload> {
  return nativeCall('DOCX open', () => invoke<DocxPayload>("docx_open", { path }));
}

export async function pptxOpen(path: string): Promise<PptxPayload> {
  return nativeCall('PPTX open', () => invoke<PptxPayload>("pptx_open", { path }));
}

export async function pdfOpen(path: string): Promise<PdfPayload> {
  return nativeCall('PDF open', () => invoke<PdfPayload>("pdf_open", { path }));
}

/** P4.4 — the raw PDF as a `data:application/pdf;base64,` URL for pdf.js. */
export async function pdfBytes(path: string): Promise<string> {
  return nativeCall('PDF bytes', () => invoke<string>("pdf_bytes", { path }));
}

export async function docxPatch(path: string, address: string, text: string) {
  return nativeCall('DOCX patch', () => invoke("docx_patch", { path, address, text }));
}

export async function docxTracks(path: string): Promise<{
  changes: Array<{ kind: string; author: string; text: string }>;
  comments: Array<{ id: string; author: string; text: string }>;
}> {
  return nativeCall('DOCX tracked changes', () => invoke("docx_tracks", { path }));
}

export async function pptxNotes(path: string): Promise<{ notes: Array<{ slide: number; talk: string }> }> {
  return nativeCall('PPTX notes', () => invoke("pptx_notes", { path }));
}

export async function pdfPageOp(
  path: string,
  op: string,
  extra?: { pages?: number[]; delta?: number; other?: string; out?: string },
) {
  return nativeCall('PDF page operation', () => invoke("pdf_page_op", { path, op, ...extra }));
}

export async function officeOpenExternal(path: string) {
  return nativeCall('open office file externally', () => invoke("office_open_external", { path }));
}

/**
 * P3.15 — is this error a path-floor / path problem (not a surgical-engine
 * parse refuse)? The "open in LibreOffice" fallback is only offered for
 * engine refusals — a floor error means the path itself was refused, and
 * LibreOffice would (and should) refuse it too.
 */
export function isOfficeFloorError(message: string): boolean {
  return /path floor|refused|outside .*workspace|not .*allowed|permission/i.test(message);
}

// ---------------------------------------------------------------------------
// demo fallbacks (plain-browser preview)
// ---------------------------------------------------------------------------

export const demoDocx: DocxPayload = {
  path: "demo.docx",
  text: "Quarterly Report\n\nRevenue grew 12% quarter-over-quarter, driven by the new\nenterprise tier.\n\nOutlook: the pipeline is strong heading into Q4.",
  blocks: [
    { address: "p1", kind: "Paragraph", part: "word/document.xml" },
    { address: "p2", kind: "Paragraph", part: "word/document.xml" },
    { address: "p3", kind: "Paragraph", part: "word/document.xml" },
  ],
};

// P50.2.x — removed: demoPptx/demoPdf (unimported fixture payloads). The
// pptx/pdf views carry their own preview fallbacks; no shared fixture is
// needed here.
