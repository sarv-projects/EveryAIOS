//! ACP stdio transport framing (doc 45 §1.5): **newline-delimited JSON-RPC**
//! over stdin/stdout. One JSON object per line; `\n` terminates each message.
//! (Note: ACP uses newline-delimited frames, not the `Content-Length` framing
//! of LSP — so this is a distinct, simpler codec than `everyaios-codeintel`.)

use std::io;

/// Serialize one message into a newline-terminated frame.
pub fn encode_message(json: &str) -> String {
    let mut out = String::with_capacity(json.len() + 1);
    out.push_str(json);
    // ACP expects a single trailing newline; strip any internal trailing
    // newlines so we never emit a blank extra frame.
    while out.ends_with('\n') {
        out.pop();
    }
    out.push('\n');
    out
}

/// Extract complete newline-delimited messages from `buf`, leaving any
/// partial (no trailing newline) data in place. Returns each complete
/// message (without the newline).
pub fn decode_messages(buf: &mut Vec<u8>) -> io::Result<Vec<String>> {
    let mut out = Vec::new();
    let mut start = 0usize;
    while let Some(pos) = find_newline(buf, start) {
        let line = &buf[start..pos];
        let s = std::str::from_utf8(line)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?
            .to_string();
        // Skip blank lines (some agents emit a trailing extra newline).
        if !s.trim().is_empty() {
            out.push(s);
        }
        start = pos + 1;
    }
    if start > 0 {
        buf.drain(..start);
    }
    Ok(out)
}

fn find_newline(buf: &[u8], from: usize) -> Option<usize> {
    buf[from..]
        .iter()
        .position(|&b| b == b'\n')
        .map(|i| from + i)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_appends_single_newline() {
        assert_eq!(encode_message("{}"), "{}\n");
        assert_eq!(encode_message("{\"a\":1}"), "{\"a\":1}\n");
        assert_eq!(encode_message("{}"), "{}\n"); // no double newline
    }

    #[test]
    fn decode_splits_complete_lines_and_keeps_partial() {
        let mut buf = b"{\"a\":1}\n{\"b\":2}\n{\"c\":".to_vec();
        let msgs = decode_messages(&mut buf).unwrap();
        assert_eq!(msgs, vec!["{\"a\":1}", "{\"b\":2}"]);
        // Partial line remains for the next chunk.
        assert_eq!(buf, b"{\"c\":");

        // Feeding the rest completes the message.
        buf.extend_from_slice(b"3}\n");
        let msgs = decode_messages(&mut buf).unwrap();
        assert_eq!(msgs, vec!["{\"c\":3}"]);
        assert!(buf.is_empty());
    }

    #[test]
    fn decode_skips_blank_lines() {
        let mut buf = b"{\"a\":1}\n\n{\"b\":2}\n".to_vec();
        let msgs = decode_messages(&mut buf).unwrap();
        assert_eq!(msgs, vec!["{\"a\":1}", "{\"b\":2}"]);
    }

    #[test]
    fn decode_no_newline_returns_empty() {
        let mut buf = b"{\"partial\"".to_vec();
        let msgs = decode_messages(&mut buf).unwrap();
        assert!(msgs.is_empty());
        assert_eq!(buf, b"{\"partial\"");
    }
}
