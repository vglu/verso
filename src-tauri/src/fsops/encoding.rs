use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Text encodings we can round-trip. Anything else opens read-only, because
/// we refuse to rewrite a file in an encoding we cannot reproduce exactly.
/// Contract: docs/design/DATA-SAFETY.md §2.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Encoding {
    #[serde(rename = "utf-8")]
    Utf8,
    #[serde(rename = "utf-8-bom")]
    Utf8Bom,
    #[serde(rename = "utf-16-le")]
    Utf16Le,
    #[serde(rename = "utf-16-be")]
    Utf16Be,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Eol {
    Lf,
    Crlf,
}

#[derive(Debug)]
pub struct DecodedText {
    /// Content with CRLF normalized to LF — the only form the editor sees.
    pub content: String,
    pub encoding: Encoding,
    pub eol: Eol,
    pub trailing_newline: bool,
}

const BOM_UTF8: &[u8] = &[0xEF, 0xBB, 0xBF];
const BOM_UTF16LE: &[u8] = &[0xFF, 0xFE];
const BOM_UTF16BE: &[u8] = &[0xFE, 0xFF];
const BINARY_SNIFF_LEN: usize = 8192;

/// Detect encoding, reject binaries, normalize line endings.
pub fn decode(bytes: &[u8], path: &Path) -> AppResult<DecodedText> {
    let (encoding, text) = if bytes.starts_with(BOM_UTF8) {
        let body = &bytes[BOM_UTF8.len()..];
        reject_binary(body, path)?;
        (
            Encoding::Utf8Bom,
            String::from_utf8(body.to_vec()).map_err(|_| AppError::UnsupportedEncoding {
                path: path.to_string_lossy().to_string(),
                detected: "utf-8-bom (invalid sequences)".into(),
            })?,
        )
    } else if bytes.starts_with(BOM_UTF16LE) {
        (Encoding::Utf16Le, decode_utf16(&bytes[2..], true, path)?)
    } else if bytes.starts_with(BOM_UTF16BE) {
        (Encoding::Utf16Be, decode_utf16(&bytes[2..], false, path)?)
    } else {
        reject_binary(bytes, path)?;
        match std::str::from_utf8(bytes) {
            Ok(s) => (Encoding::Utf8, s.to_string()),
            Err(_) => {
                return Err(AppError::UnsupportedEncoding {
                    path: path.to_string_lossy().to_string(),
                    detected: sniff_legacy_label(bytes).into(),
                })
            }
        }
    };

    let eol = detect_eol(&text);
    let normalized = text.replace("\r\n", "\n");
    let trailing_newline = normalized.ends_with('\n');

    Ok(DecodedText {
        content: normalized,
        encoding,
        eol,
        trailing_newline,
    })
}

/// Encode editor content back to the file's original byte shape.
pub fn encode(content: &str, encoding: Encoding, eol: Eol, trailing_newline: bool) -> Vec<u8> {
    let mut text = if eol == Eol::Crlf {
        content.replace('\n', "\r\n")
    } else {
        content.to_string()
    };

    // Only restore a trailing newline the user did not deliberately remove:
    // if the buffer already ends with one we keep it as is.
    if trailing_newline && !text.is_empty() && !text.ends_with('\n') {
        text.push_str(if eol == Eol::Crlf { "\r\n" } else { "\n" });
    }

    match encoding {
        Encoding::Utf8 => text.into_bytes(),
        Encoding::Utf8Bom => {
            let mut out = BOM_UTF8.to_vec();
            out.extend_from_slice(text.as_bytes());
            out
        }
        Encoding::Utf16Le => encode_utf16(&text, true),
        Encoding::Utf16Be => encode_utf16(&text, false),
    }
}

fn decode_utf16(body: &[u8], little_endian: bool, path: &Path) -> AppResult<String> {
    if body.len() % 2 != 0 {
        return Err(AppError::UnsupportedEncoding {
            path: path.to_string_lossy().to_string(),
            detected: "utf-16 (odd length)".into(),
        });
    }
    let units: Vec<u16> = body
        .chunks_exact(2)
        .map(|c| {
            if little_endian {
                u16::from_le_bytes([c[0], c[1]])
            } else {
                u16::from_be_bytes([c[0], c[1]])
            }
        })
        .collect();

    String::from_utf16(&units).map_err(|_| AppError::UnsupportedEncoding {
        path: path.to_string_lossy().to_string(),
        detected: "utf-16 (invalid surrogates)".into(),
    })
}

fn encode_utf16(text: &str, little_endian: bool) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len() * 2 + 2);
    out.extend_from_slice(if little_endian { BOM_UTF16LE } else { BOM_UTF16BE });
    for unit in text.encode_utf16() {
        let bytes = if little_endian {
            unit.to_le_bytes()
        } else {
            unit.to_be_bytes()
        };
        out.extend_from_slice(&bytes);
    }
    out
}

/// A NUL byte early in the file means this is not text we should render.
fn reject_binary(bytes: &[u8], path: &Path) -> AppResult<()> {
    let head = &bytes[..bytes.len().min(BINARY_SNIFF_LEN)];
    if head.contains(&0) {
        return Err(AppError::IsBinary {
            path: path.to_string_lossy().to_string(),
        });
    }
    Ok(())
}

/// Best-effort label for the error message when we cannot decode.
fn sniff_legacy_label(bytes: &[u8]) -> &'static str {
    let (_, _, had_errors) = encoding_rs::WINDOWS_1251.decode(bytes);
    if !had_errors {
        "windows-1251 (or another legacy 8-bit encoding)"
    } else {
        "unknown 8-bit encoding"
    }
}

/// CRLF wins when it is at least half of the line endings — mixed files keep
/// their dominant style instead of being silently rewritten.
fn detect_eol(text: &str) -> Eol {
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count();
    if lf == 0 {
        return if cfg!(windows) { Eol::Crlf } else { Eol::Lf };
    }
    if crlf * 2 >= lf {
        Eol::Crlf
    } else {
        Eol::Lf
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn p() -> PathBuf {
        PathBuf::from("test.md")
    }

    /// The core promise: open then save without edits ⇒ identical bytes.
    fn assert_roundtrip(original: &[u8]) {
        let d = decode(original, &p()).expect("decodes");
        let back = encode(&d.content, d.encoding, d.eol, d.trailing_newline);
        assert_eq!(
            back, original,
            "round-trip changed bytes for {:?}/{:?}",
            d.encoding, d.eol
        );
    }

    #[test]
    fn roundtrip_utf8_lf() {
        assert_roundtrip(b"# Hi\n\ntext here\n");
    }

    #[test]
    fn roundtrip_utf8_crlf() {
        assert_roundtrip(b"# Hi\r\n\r\ntext here\r\n");
    }

    #[test]
    fn roundtrip_utf8_no_trailing_newline() {
        assert_roundtrip(b"one line, no newline");
    }

    #[test]
    fn roundtrip_utf8_bom() {
        let mut v = BOM_UTF8.to_vec();
        v.extend_from_slice("# Привет\nмир\n".as_bytes());
        assert_roundtrip(&v);
    }

    #[test]
    fn roundtrip_utf8_bom_crlf() {
        let mut v = BOM_UTF8.to_vec();
        v.extend_from_slice("a\r\nb\r\n".as_bytes());
        assert_roundtrip(&v);
    }

    #[test]
    fn roundtrip_utf16le() {
        let text = "# Заголовок\nтекст\n";
        let bytes = encode_utf16(text, true);
        assert_roundtrip(&bytes);
    }

    #[test]
    fn roundtrip_utf16be() {
        let text = "# Header\nbody\n";
        let bytes = encode_utf16(text, false);
        assert_roundtrip(&bytes);
    }

    #[test]
    fn roundtrip_utf16le_crlf() {
        let bytes = encode_utf16("a\r\nb\r\n", true);
        assert_roundtrip(&bytes);
    }

    #[test]
    fn roundtrip_emoji_and_surrogates() {
        assert_roundtrip("emoji 🎉 and 𝄞 clef\n".as_bytes());
        assert_roundtrip(&encode_utf16("emoji 🎉 and 𝄞 clef\n", true));
    }

    #[test]
    fn content_is_lf_normalized_for_editor() {
        let d = decode(b"a\r\nb\r\n", &p()).unwrap();
        assert_eq!(d.content, "a\nb\n");
        assert_eq!(d.eol, Eol::Crlf);
    }

    #[test]
    fn mixed_endings_keep_dominant_style() {
        let d = decode(b"a\r\nb\r\nc\nd\r\n", &p()).unwrap();
        assert_eq!(d.eol, Eol::Crlf);
        let d2 = decode(b"a\nb\nc\nd\r\n", &p()).unwrap();
        assert_eq!(d2.eol, Eol::Lf);
    }

    #[test]
    fn rejects_binary() {
        let err = decode(b"PK\x03\x04\x00\x00binary", &p()).unwrap_err();
        assert!(matches!(err, AppError::IsBinary { .. }));
    }

    #[test]
    fn rejects_unsupported_encoding() {
        // Valid windows-1251, invalid UTF-8.
        let err = decode(&[0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2], &p()).unwrap_err();
        assert!(matches!(err, AppError::UnsupportedEncoding { .. }));
    }

    #[test]
    fn empty_file_roundtrips() {
        assert_roundtrip(b"");
    }

    #[test]
    fn edited_content_keeps_file_style() {
        let d = decode(b"a\r\nb\r\n", &p()).unwrap();
        let edited = format!("{}c\n", d.content); // user appended a line
        let back = encode(&edited, d.encoding, d.eol, d.trailing_newline);
        assert_eq!(back, b"a\r\nb\r\nc\r\n");
    }
}
