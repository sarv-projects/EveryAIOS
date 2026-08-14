//! Redaction (D4, ARCH/04 §PDF mode 4): add `/Redact` annotations over the
//! given rectangles (the "mark for redaction" step). `rects` is
//! `(page_number, [x1, y1, x2, y2])` in PDF user-space coordinates (origin at
//! bottom-left). Boundary: this marks regions; burning the removal into the
//! content stream (glyph removal) is a later, audit-logged pass.

use lopdf::{dictionary, Document, Object, ObjectId};

use super::PdfError;

enum AnnotsLoc {
    Inline(ObjectId),
    Array(ObjectId),
    Missing(ObjectId),
}

/// Mark-for-redact: append `/Redact` annotations to the given pages.
pub fn redact(bytes: &[u8], rects: &[(u32, [f32; 4])]) -> Result<Vec<u8>, PdfError> {
    let mut doc = Document::load_mem(bytes)?;
    let pages: Vec<ObjectId> = doc.page_iter().collect();

    for (page, [x1, y1, x2, y2]) in rects {
        let page_id = pages
            .get((*page as usize).saturating_sub(1))
            .copied()
            .ok_or(PdfError::PageNotFound(*page))?;

        let annot = Object::Dictionary(dictionary! {
            "Type" => "Annot",
            "Subtype" => "Redact",
            "Rect" => vec![
                Object::Real(*x1),
                Object::Real(*y1),
                Object::Real(*x2),
                Object::Real(*y2),
            ],
            "F" => 4,
        });
        let annot_id = doc.add_object(annot);

        // Determine where the page's `/Annots` array lives (avoid a double
        // mutable borrow of the document).
        let loc = {
            let page_dict = doc.get_dictionary(page_id)?;
            match page_dict.get(b"Annots") {
                Ok(Object::Array(_)) => AnnotsLoc::Inline(page_id),
                Ok(Object::Reference(id)) => AnnotsLoc::Array(*id),
                _ => AnnotsLoc::Missing(page_id),
            }
        };
        match loc {
            AnnotsLoc::Inline(page_id) => {
                let d = doc.get_dictionary_mut(page_id)?;
                if let Ok(Object::Array(arr)) = d.get_mut(b"Annots") {
                    arr.push(Object::Reference(annot_id));
                }
            }
            AnnotsLoc::Array(arr_id) => {
                let obj = doc.get_object_mut(arr_id)?;
                if let Object::Array(arr) = obj {
                    arr.push(Object::Reference(annot_id));
                }
            }
            AnnotsLoc::Missing(page_id) => {
                doc.get_dictionary_mut(page_id)?
                    .set("Annots", vec![Object::Reference(annot_id)]);
            }
        }
    }

    let mut out = Vec::new();
    doc.save_to(&mut out)?;
    Ok(out)
}
