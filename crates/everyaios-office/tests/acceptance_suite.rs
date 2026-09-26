//! Track 2 / P66.6 — Live office-engine acceptance suite.
//!
//! Evidence-gated readiness (§17.12.6): these are end-to-end integration
//! tests over the *public* office API, proving real effects on real OOXML /
//! PDF bytes — not mocks:
//!
//! 1. **XLSX math integrity** — a DSL command batch writes a dependency graph
//!    and the numbers come from IronCalc, never a literal (P4.2).
//! 2. **Byte-preserving OOXML patching + rollback** — a docx block patch
//!    rewrites only the targeted part; every other ZIP entry keeps its
//!    original compressed bytes, and `Snapshot::undo` restores byte-exactly
//!    (P4.1 / P4.5 / D7).
//! 3. **PDF page ops** — author → text extraction → exact-match swap → rotate,
//!    with page counts asserted at each step (P4.4 / P18-1).
//! 4. **PPTX slide surgery** — shape-text patch + slide add/remove with the
//!    `<p:sldIdLst>` re-derived (P4.3).
//! 5. **ARCH/04 §4.6 round-trip guards** — field balance, orphaned-media GC,
//!    and the fail-closed size ceiling, proven on real package bytes.
//!
//! Cross-platform: runs on every host. The Windows live acceptance run
//! (Office + Silverlight-era OLE edge cases) remains open — see TODO P66.6.

use std::io::Write;

use everyaios_office::pdf::author::author_pages;
use everyaios_office::xlsx::address::CellRef;
use everyaios_office::xlsx::dsl::{Operation, Scalar, WorkbookCommandBatch};
use everyaios_office::xlsx::patch::apply_batch;
use everyaios_office::xlsx::read::CellValue;
use everyaios_office::xlsx::recalc::recalc;
use everyaios_office::zip::OoxmlArchive;
use everyaios_office::{
    DocxEngine, LimitKind, OfficeError, PatchLimits, PptxEngine, Snapshot, extract_pages, inspect,
    page_count, parts_diff, replace_text, rotate_pages,
};

fn cell(row: u32, col: u32) -> CellRef {
    CellRef::new(row, col).expect("valid address")
}

// ---------------------------------------------------------------------------
// Fixtures (built in-test so the suite carries its own realistic packages).
// ---------------------------------------------------------------------------

/// A minimal-but-complete `.xlsx`: content types, workbook + rels, one
/// worksheet, shared strings and a styles part — the parts both IronCalc's
/// importer and the surgical patcher expect.
fn xlsx_with_sheet(sheet_xml: &str) -> Vec<u8> {
    let ct = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"#;
    let rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#;
    let wb = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>"#;
    let wb_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>"#;
    let ss = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">
  <si><t>Alpha</t></si>
</sst>"#;
    let styles = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"#;
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, content) in [
        ("[Content_Types].xml", ct),
        ("_rels/.rels", rels),
        ("xl/workbook.xml", wb),
        ("xl/_rels/workbook.xml.rels", wb_rels),
        ("xl/worksheets/sheet1.xml", sheet_xml),
        ("xl/sharedStrings.xml", ss),
        ("xl/styles.xml", styles),
    ] {
        zip.start_file(name, zip::write::SimpleFileOptions::default())
            .expect("start_file");
        zip.write_all(content.as_bytes()).expect("write");
    }
    zip.finish().expect("finish").into_inner()
}

/// A minimal `.docx`: content types, root rels, and a body with two
/// paragraphs (two runs), a line-break paragraph, and a table cell.
fn sample_docx() -> Vec<u8> {
    const DOCUMENT: &[u8] = br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello, </w:t></w:r><w:r><w:t>world!</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>cell A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>cell B1</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>"#;
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default();
    zip.start_file("[Content_Types].xml", opts).unwrap();
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
    )
    .unwrap();
    zip.start_file("_rels/.rels", opts).unwrap();
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
    )
    .unwrap();
    zip.start_file("word/document.xml", opts).unwrap();
    zip.write_all(DOCUMENT).unwrap();
    zip.finish().unwrap().into_inner()
}

/// A two-slide `.pptx` with presentation order + per-slide rels.
fn sample_pptx() -> Vec<u8> {
    const SLIDE1: &[u8] = br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"#;
    const SLIDE2: &[u8] = br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Thank you</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"#;
    const SLIDE_RELS: &[u8] = br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>"#;
    let ct = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>"#;
    let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#;
    let pres = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>"#;
    let pres_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>"#;
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default();
    let mut add = |name: &str, bytes: &[u8]| {
        zip.start_file(name, opts).unwrap();
        zip.write_all(bytes).unwrap();
    };
    add("[Content_Types].xml", ct.as_bytes());
    add("_rels/.rels", root_rels.as_bytes());
    add("ppt/presentation.xml", pres.as_bytes());
    add("ppt/_rels/presentation.xml.rels", pres_rels.as_bytes());
    add("ppt/slides/slide1.xml", SLIDE1);
    add("ppt/slides/_rels/slide1.xml.rels", SLIDE_RELS);
    add("ppt/slides/slide2.xml", SLIDE2);
    add("ppt/slides/_rels/slide2.xml.rels", SLIDE_RELS);
    zip.finish().unwrap().into_inner()
}

// ---------------------------------------------------------------------------
// 1. XLSX — IronCalc truth over a dependency graph.
// ---------------------------------------------------------------------------

#[test]
fn xlsx_dsl_write_recalculates_a_dependency_graph_with_ironcalc() {
    // Start from an empty sheet; every value/formula arrives through the DSL,
    // exactly as the agent's office tool would deliver it.
    let bytes = xlsx_with_sheet(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>"#,
    );
    let original_ct = {
        let mut a = OoxmlArchive::open(bytes.clone()).unwrap();
        a.raw_entry("[Content_Types].xml").unwrap()
    };

    let mut batch = WorkbookCommandBatch::new(1, "acceptance dependency graph");
    batch.operations = vec![
        Operation::SetCell {
            address: cell(1, 1),
            value: Scalar::Number(10.0),
        }, // A1
        Operation::SetCell {
            address: cell(1, 2),
            value: Scalar::Number(20.0),
        }, // B1
        Operation::SetCell {
            address: cell(2, 1),
            value: Scalar::Number(1.0),
        }, // A2
        Operation::SetCell {
            address: cell(2, 2),
            value: Scalar::Number(2.0),
        }, // B2
        // Rung: aggregate -> predicate -> count -> lookup -> arithmetic chains.
        Operation::SetFormula {
            address: cell(3, 1),
            formula: "SUM(A1:A2)".into(),
        }, // A3 = 11
        Operation::SetFormula {
            address: cell(4, 1),
            formula: r#"IF(B2>1,"yes","no")"#.into(),
        }, // A4 = yes
        Operation::SetFormula {
            address: cell(5, 1),
            formula: r#"COUNTIF(A1:B2,">5")"#.into(),
        }, // A5 = 2
        Operation::SetFormula {
            address: cell(6, 1),
            formula: "VLOOKUP(10,A1:B2,2,FALSE)".into(),
        }, // A6 = 20
        Operation::SetFormula {
            address: cell(1, 3),
            formula: "A3*2".into(),
        }, // C1 = 22
        Operation::SetFormula {
            address: cell(1, 4),
            formula: "C1+A5".into(),
        }, // D1 = 24
    ];

    let outcome = apply_batch(&bytes, &batch, "Sheet1").expect("apply_batch");
    assert!(
        outcome
            .changed_parts
            .iter()
            .any(|p| p.contains("sheet1.xml")),
        "the worksheet part must be the modified part: {:?}",
        outcome.changed_parts
    );

    // Untouched parts keep their original compressed bytes (byte-stability).
    let mut out = OoxmlArchive::open(outcome.bytes.clone()).unwrap();
    assert_eq!(
        out.raw_entry("[Content_Types].xml").unwrap(),
        original_ct,
        "[Content_Types].xml must survive a cell write byte-for-byte"
    );

    // Numbers come from IronCalc — read them back through a full recalc.
    let res = recalc(&outcome.bytes).expect("recalc");
    assert_eq!(res.sheets.len(), 1);
    assert!(
        res.formula_cells >= 6,
        "expected >=6 formula cells, got {}",
        res.formula_cells
    );
    let get = |row: u32, col: u32| -> CellValue {
        res.sheets[0]
            .cells
            .iter()
            .find(|c| c.row == row && c.col == col)
            .map(|c| c.value.clone())
            .unwrap_or(CellValue::Empty)
    };
    assert_eq!(get(3, 1), CellValue::Number(11.0), "SUM(A1:A2)");
    assert_eq!(get(4, 1), CellValue::Text("yes".into()), "IF(B2>1,…)");
    assert_eq!(get(5, 1), CellValue::Number(2.0), "COUNTIF(A1:B2,\">5\")");
    assert_eq!(get(6, 1), CellValue::Number(20.0), "VLOOKUP(10,…)");
    assert_eq!(get(1, 3), CellValue::Number(22.0), "C1 = A3*2");
    assert_eq!(get(1, 4), CellValue::Number(24.0), "D1 = C1 + A5 (chained)");
}

// ---------------------------------------------------------------------------
// 2. DOCX — byte-preserving patch + byte-exact rollback.
// ---------------------------------------------------------------------------

#[test]
fn docx_surgical_patch_preserves_untouched_parts_and_rolls_back_exactly() {
    let original = sample_docx();
    let untouched_raw = {
        let mut a = OoxmlArchive::open(original.clone()).unwrap();
        (
            a.raw_entry("[Content_Types].xml").unwrap(),
            a.raw_entry("_rels/.rels").unwrap(),
        )
    };

    let mut engine = DocxEngine::open(original.clone()).expect("open docx");
    assert_eq!(engine.render_block("p1").unwrap(), "Hello, world!");

    let mut snapshot = Snapshot::capture(original.clone());
    engine
        .patch_block("p1", "Hello, universe!")
        .expect("patch block p1");

    // The same engine instance must re-render the patched block without a
    // reopen: a length-changing edit refreshes the block tree's byte ranges.
    assert_eq!(engine.render_block("p1").unwrap(), "Hello, universe!");
    assert_eq!(engine.render_block("p2").unwrap(), "Second paragraph");

    let saved = engine.save().expect("save docx");
    snapshot.record_save(saved.clone());
    assert!(snapshot.dirty());

    // Reopen: the target changed; the untouched entries kept raw bytes.
    let mut out = OoxmlArchive::open(saved.clone()).unwrap();
    assert_eq!(
        out.raw_entry("[Content_Types].xml").unwrap(),
        untouched_raw.0
    );
    assert_eq!(out.raw_entry("_rels/.rels").unwrap(), untouched_raw.1);
    let body = String::from_utf8(out.read_part("word/document.xml").unwrap()).unwrap();
    assert!(body.contains("universe!"), "patched text must be present");
    assert!(!body.contains(">world!<"), "old run text must be gone");

    // Reopening reads the patched text and leaves the other block intact.
    let fresh = DocxEngine::open(saved.clone()).unwrap();
    assert_eq!(fresh.render_block("p1").unwrap(), "Hello, universe!");
    assert_eq!(fresh.render_block("p2").unwrap(), "Second paragraph");

    // Rollback is byte-exact — not a re-render.
    let undone = snapshot.undo();
    assert_eq!(undone, original, "undo must restore the original bytes");
    assert!(!snapshot.dirty());
}

// ---------------------------------------------------------------------------
// 3. PDF — author, extract, exact-match swap, rotate.
// ---------------------------------------------------------------------------

#[test]
fn pdf_author_extract_replace_and_rotate() {
    let bytes = author_pages(&["Invoice alpha", "Terms beta", "Appendix gamma"]).expect("author");

    let info = inspect(&bytes).expect("inspect");
    assert_eq!(info.pages, 3);
    assert!(
        info.texts[0].contains("alpha"),
        "page 1 text: {:?}",
        info.texts
    );
    assert!(
        info.texts[2].contains("gamma"),
        "page 3 text: {:?}",
        info.texts
    );

    // Exact-match swap preserves layout (glyph positions untouched). The Tj
    // operand is the whole authored line, so swap the whole token.
    let swapped = replace_text(&bytes, 1, "Invoice alpha", "Invoice omega").expect("replace_text");
    let after = inspect(&swapped).expect("inspect swapped");
    assert!(after.texts[0].contains("omega"), "{:?}", after.texts);
    assert!(!after.texts[0].contains("alpha"), "{:?}", after.texts);

    // Extract an ordered subset.
    let subset = extract_pages(&bytes, &[3, 1]).expect("extract");
    assert_eq!(page_count(&subset).unwrap(), 2);

    // Rotate by a legal delta.
    let rotated = rotate_pages(&bytes, 90, Some(&[1])).expect("rotate");
    assert_eq!(page_count(&rotated).unwrap(), 3);
    // An illegal (non-90-multiple) delta is refused, not silently clamped.
    assert!(rotate_pages(&bytes, 45, Some(&[1])).is_err());
}

// ---------------------------------------------------------------------------
// 4. PPTX — shape patch + slide add/remove with sldIdLst recomputation.
// ---------------------------------------------------------------------------

#[test]
fn pptx_patches_text_and_adds_and_removes_slides() {
    let bytes = sample_pptx();
    let mut engine = PptxEngine::open(bytes).expect("open pptx");
    assert_eq!(engine.slides().len(), 2);
    assert_eq!(engine.slides()[0].sld_id, 256);

    // Patch shape text on slide 2 (so it survives the slide-1 removal below).
    engine
        .patch_shape_text("ppt/slides/slide2.xml", "shape1", "Goodbye")
        .expect("patch shape");

    // Add a slide: the new sldId must past the current max, and a fresh part
    // is registered in the content types + presentation rels.
    let new_part = engine.add_slide().expect("add slide");
    assert_eq!(engine.slides().len(), 3);
    assert_eq!(engine.slides()[2].part, new_part);
    assert_eq!(engine.slides()[2].sld_id, 258, "sldId follows the max");

    // Remove the original first slide; order + registration shrink.
    engine
        .remove_slide("ppt/slides/slide1.xml")
        .expect("remove slide");
    assert_eq!(engine.slides().len(), 2);
    assert!(
        !engine
            .slides()
            .iter()
            .any(|s| s.part == "ppt/slides/slide1.xml")
    );

    // Save + reopen: the patched text survived and the removed part is gone.
    let saved = engine.save().expect("save pptx");
    let mut reopened = PptxEngine::open(saved.clone()).expect("reopen pptx");
    assert_eq!(reopened.slides().len(), 2);
    let deck = reopened.render_deck().expect("render deck");
    assert!(
        deck.contains("Goodbye"),
        "patched text must survive: {deck}"
    );
    assert!(!deck.contains("slide1.xml"), "removed slide must be gone");

    let mut archive = OoxmlArchive::open(saved).unwrap();
    assert!(
        archive.read_part("ppt/slides/slide1.xml").is_err(),
        "the removed slide part must not exist in the archive"
    );
}

// ---------------------------------------------------------------------------
// 5. ARCH/04 §4.6 — field balance, orphaned-media GC, bounded-memory ceiling.
// ---------------------------------------------------------------------------

/// A docx whose body references one image (`rId1`, live) and carries a
/// balanced `PAGE` field, while `rId2`'s image is referenced by nothing — the
/// state a removed picture paragraph leaves behind.
fn docx_with_field_and_orphan_media() -> (Vec<u8>, &'static str) {
    const BODY: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body><w:p><w:r><w:t>See figure</w:t></w:r><w:r><w:drawing><wp:inline><a:blip r:embed="rId1"/></wp:inline></w:drawing></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:body></w:document>"#;
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default();
    let mut add = |name: &str, bytes: &[u8]| {
        zip.start_file(name, opts).unwrap();
        zip.write_all(bytes).unwrap();
    };
    add(
        "[Content_Types].xml",
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#,
    );
    add(
        "_rels/.rels",
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#,
    );
    add(
        "word/_rels/document.xml.rels",
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/></Relationships>"#,
    );
    add("word/document.xml", BODY.as_bytes());
    add("word/media/image1.png", b"PNGDATA-1");
    add("word/media/image2.png", b"PNGDATA-2");
    (zip.finish().unwrap().into_inner(), BODY)
}

#[test]
fn field_balance_and_media_gc_round_trip_on_real_package_bytes() {
    let (original, _) = docx_with_field_and_orphan_media();
    let mut snapshot = Snapshot::capture(original.clone());

    // (a) The balanced PAGE field is reported as one complete field, and
    //     editing its cached result commits cleanly.
    let mut engine = DocxEngine::open(original.clone()).expect("open");
    let report = engine.field_report().expect("field report");
    assert_eq!(report.len(), 1);
    assert_eq!(report[0].1.fields, 1, "one complete PAGE field");
    assert_eq!(report[0].1.dirty, 0);
    engine
        .patch_block("p2", "2")
        .expect("edit the field result");
    let after_patch = engine.save().expect("commit the field edit");
    let diff = parts_diff(&original, &after_patch).unwrap();
    assert_eq!(
        diff.changed,
        vec!["word/document.xml".to_string()],
        "a field-bearing edit touches only the body part"
    );
    assert!(diff.added.is_empty() && diff.removed.is_empty());

    // (b) The orphaned media is collected, and the relationship entry goes
    //     with it in the same commit — never a dangling relationship.
    let mut engine = DocxEngine::open(after_patch.clone()).expect("reopen");
    let sweep = engine.sweep_media().expect("sweep orphaned media");
    assert!(sweep.orphan_rels.contains("rId2"));
    assert!(
        !sweep.orphan_rels.contains("rId1"),
        "the live image is referenced"
    );
    assert_eq!(sweep.removed_rels, vec!["rId2".to_string()]);
    assert_eq!(
        sweep.removed_parts,
        vec!["word/media/image2.png".to_string()]
    );
    assert!(sweep.candidates.is_empty(), "nothing unsafe to remove here");

    let after_sweep = engine.save().expect("commit the sweep");
    let diff = parts_diff(&after_patch, &after_sweep).unwrap();
    assert_eq!(
        diff.changed,
        vec!["word/_rels/document.xml.rels".to_string()],
        "the sweep rewrites only the relationships part"
    );
    assert_eq!(diff.removed, vec!["word/media/image2.png".to_string()]);
    assert!(diff.added.is_empty());

    // The still-referenced payload is untouched, and the edited field result
    // survived the sweep.
    let mut archive = OoxmlArchive::open(after_sweep.clone()).unwrap();
    assert_eq!(
        archive.read_part("word/media/image1.png").unwrap(),
        b"PNGDATA-1"
    );
    assert!(archive.read_part("word/media/image2.png").is_err());
    let rels =
        String::from_utf8(archive.read_part("word/_rels/document.xml.rels").unwrap()).unwrap();
    assert!(
        !rels.contains("rId2"),
        "a removed payload must lose its rel: {rels}"
    );
    let reopened = DocxEngine::open(after_sweep.clone()).expect("reopen after sweep");
    assert_eq!(reopened.render_text(), "See figure\n2\n");

    // Rollback is still byte-exact over both commits.
    snapshot.record_save(after_sweep);
    assert!(snapshot.dirty());
    assert_eq!(
        snapshot.undo(),
        original,
        "undo restores the original bytes"
    );
}

#[test]
fn an_unbalanced_field_refuses_the_commit_and_leaves_the_file_intact() {
    // A field whose `end` marker is missing: the patch and the commit are both
    // refused, so the caller never receives bytes to write.
    let (original, body) = docx_with_field_and_orphan_media();
    let broken = original_body(&original).replace(
        r#"<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:body>"#,
        "</w:p></w:body>",
    );
    assert_ne!(broken, body, "the fixture must actually be mutated");
    let broken_package = repack_body(&original, &broken);

    let mut engine = DocxEngine::open(broken_package).expect("open");
    let err = engine.patch_block("p1", "See figure v2").unwrap_err();
    match err {
        OfficeError::FieldBalance { part, field, .. } => {
            assert_eq!(part, "word/document.xml");
            assert_eq!(field, 1, "the unclosed field is named by index");
        }
        other => panic!("expected a FieldBalance refusal, got {other:?}"),
    }
    // The commit gate refuses too: no bytes at all, so nothing can be written.
    let err = engine.save().unwrap_err();
    assert!(
        matches!(err, OfficeError::FieldBalance { field: 1, .. }),
        "the commit gate must refuse, got {err:?}"
    );
    assert!(err.to_string().contains("word/document.xml"));
}

#[test]
fn an_oversized_package_is_refused_by_name_rather_than_loaded() {
    // The engine is DOM + byte-range and does not stream; over the documented
    // ceiling it refuses with a named reason instead of attempting a load it
    // cannot bound.
    let (original, _) = docx_with_field_and_orphan_media();
    let tight = PatchLimits {
        max_archive_bytes: (original.len() - 1) as u64,
        ..PatchLimits::default_policy()
    };
    let err = DocxEngine::open_with_limits(original.clone(), tight)
        .err()
        .expect("must refuse");
    match err {
        OfficeError::TooLarge {
            kind,
            actual,
            limit,
            ..
        } => {
            assert_eq!(kind, LimitKind::ArchiveBytes);
            assert_eq!(kind.as_str(), "archive_size");
            assert!(actual > limit);
        }
        other => panic!("expected TooLarge, got {other:?}"),
    }
    // The default policy is generous enough for the same package.
    let engine = DocxEngine::open_with_limits(original, PatchLimits::default_policy())
        .expect("the default ceilings must not block a normal document");
    assert_eq!(engine.render_block("p1").unwrap(), "See figure");

    // Per-part ceiling: checked against the decompressed size, before the
    // part is parsed, so the refusal names the part it refused.
    let tight = PatchLimits {
        max_part_bytes: 1,
        ..PatchLimits::default_policy()
    };
    let err = DocxEngine::open_with_limits(docx_with_field_and_orphan_media().0, tight)
        .err()
        .expect("must refuse");
    assert!(matches!(
        err,
        OfficeError::TooLarge {
            kind: LimitKind::PartBytes,
            ..
        }
    ));
    assert!(
        err.to_string().contains("[Content_Types].xml"),
        "the refusal names the part: {err}"
    );
}

/// The current bytes of `word/document.xml` inside a package.
fn original_body(pkg: &[u8]) -> String {
    let mut a = OoxmlArchive::open(pkg.to_vec()).unwrap();
    String::from_utf8(a.read_part("word/document.xml").unwrap()).unwrap()
}

/// Rebuild a package with a different `word/document.xml`, copying every
/// other entry verbatim (the same discipline the engine itself uses).
fn repack_body(pkg: &[u8], body: &str) -> Vec<u8> {
    let mut a = OoxmlArchive::open(pkg.to_vec()).unwrap();
    a.save(&[("word/document.xml".to_string(), body.as_bytes().to_vec())])
        .unwrap()
}
