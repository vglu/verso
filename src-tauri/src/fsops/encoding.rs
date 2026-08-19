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
    /// Cyrillic Windows. The encoding of every Russian text file written
    /// before UTF-8 won, and still the default of a good deal of software.
    #[serde(rename = "windows-1251")]
    Windows1251,
    /// Cyrillic DOS, the one inside old archives.
    #[serde(rename = "ibm866")]
    Ibm866,
    /// Cyrillic Unix, from mail and Usenet.
    #[serde(rename = "koi8-r")]
    Koi8R,
    /// Its Ukrainian sibling; the two differ in a handful of letters.
    #[serde(rename = "koi8-u")]
    Koi8U,
    /// Cyrillic ISO. Rare in the wild, common in standards.
    #[serde(rename = "iso-8859-5")]
    Iso88595,
    /// Western European Windows, and what a mislabelled file usually is.
    #[serde(rename = "windows-1252")]
    Windows1252,
}

/// The 8-bit encodings we can both read and write back exactly.
///
/// Which one a file is in cannot be decided by validity — almost any byte
/// sequence is "valid" windows-1252 — so the detector decides by statistics,
/// and it can only choose from this list. Anything outside it is refused at
/// open: a file we could not save again would be a trap, not a feature.
const LEGACY: &[(Encoding, &encoding_rs::Encoding, &str)] = &[
    (
        Encoding::Windows1251,
        encoding_rs::WINDOWS_1251,
        "windows-1251",
    ),
    (Encoding::Ibm866, encoding_rs::IBM866, "ibm866"),
    (Encoding::Koi8R, encoding_rs::KOI8_R, "koi8-r"),
    (Encoding::Koi8U, encoding_rs::KOI8_U, "koi8-u"),
    (Encoding::Iso88595, encoding_rs::ISO_8859_5, "iso-8859-5"),
    (
        Encoding::Windows1252,
        encoding_rs::WINDOWS_1252,
        "windows-1252",
    ),
];

impl Encoding {
    /// The encoding_rs codec for the 8-bit encodings, or None for Unicode.
    fn legacy_codec(self) -> Option<&'static encoding_rs::Encoding> {
        LEGACY
            .iter()
            .find(|(e, _, _)| *e == self)
            .map(|(_, c, _)| *c)
    }

    fn from_codec(codec: &'static encoding_rs::Encoding) -> Option<Encoding> {
        LEGACY
            .iter()
            .find(|(_, c, _)| std::ptr::eq(*c, codec))
            .map(|(e, _, _)| *e)
    }

    pub fn label(self) -> &'static str {
        match self {
            Encoding::Utf8 => "utf-8",
            Encoding::Utf8Bom => "utf-8-bom",
            Encoding::Utf16Le => "utf-16-le",
            Encoding::Utf16Be => "utf-16-be",
            other => LEGACY
                .iter()
                .find(|(e, _, _)| *e == other)
                .map(|(_, _, label)| *label)
                .unwrap_or("unknown"),
        }
    }
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
    /// The dominant ending, used for lines the user adds.
    pub eol: Eol,
    /// Whether the file uses more than one kind of ending.
    pub mixed_eol: bool,
    /// The ending of each line that had one, in order. Lets a file with
    /// inconsistent endings be written back exactly as it was found.
    pub line_endings: Vec<Eol>,
    pub trailing_newline: bool,
}

/// The ending of every line that has one, in document order.
fn line_endings_of(text: &str) -> Vec<Eol> {
    let bytes = text.as_bytes();
    let mut endings = Vec::new();
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'\n' {
            endings.push(if i > 0 && bytes[i - 1] == b'\r' {
                Eol::Crlf
            } else {
                Eol::Lf
            });
        }
    }
    endings
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
            // Not UTF-8, so it is one of the 8-bit encodings that everything
            // written before UTF-8 won is in. Which one cannot be decided by
            // validity — almost any byte sequence is "valid" windows-1252 — so
            // it is decided by statistics over the text.
            Err(_) => match detect_legacy(bytes) {
                Some((encoding, text)) => (encoding, text),
                None => {
                    return Err(AppError::UnsupportedEncoding {
                        path: path.to_string_lossy().to_string(),
                        detected: sniff_legacy_label(bytes).into(),
                    })
                }
            },
        }
    };

    let eol = detect_eol(&text);
    let line_endings = line_endings_of(&text);
    let mixed_eol = line_endings.iter().any(|e| *e != eol);
    let normalized = text.replace("\r\n", "\n");
    let trailing_newline = normalized.ends_with('\n');

    Ok(DecodedText {
        content: normalized,
        encoding,
        eol,
        mixed_eol,
        line_endings,
        trailing_newline,
    })
}

/// Line endings for `content`, reusing `original` wherever the text is
/// unchanged.
///
/// A file with inconsistent endings — and they are common in the wild — must
/// come back exactly as it was found when nothing was edited. Lines are
/// matched from both ends: everything before the first change and everything
/// after the last keeps its own ending, and only genuinely new text gets the
/// file's dominant one.
pub fn endings_for(
    content: &str,
    original_content: &str,
    original: &[Eol],
    dominant: Eol,
) -> Vec<Eol> {
    let new_lines: Vec<&str> = content.split('\n').collect();
    let old_lines: Vec<&str> = original_content.split('\n').collect();
    let breaks = new_lines.len().saturating_sub(1);

    if original.is_empty() {
        return vec![dominant; breaks];
    }
    if breaks == original.len() && new_lines.len() == old_lines.len() {
        // Same number of lines: endings map across one to one, whatever was
        // edited inside them. This is the case that makes an untouched file
        // save byte for byte.
        return original.to_vec();
    }

    let mut endings = vec![dominant; breaks];

    let mut prefix = 0;
    while prefix < new_lines.len()
        && prefix < old_lines.len()
        && new_lines[prefix] == old_lines[prefix]
    {
        prefix += 1;
    }

    let mut suffix = 0;
    while suffix < new_lines.len().saturating_sub(prefix)
        && suffix < old_lines.len().saturating_sub(prefix)
        && new_lines[new_lines.len() - 1 - suffix] == old_lines[old_lines.len() - 1 - suffix]
    {
        suffix += 1;
    }

    let kept = prefix.min(breaks).min(original.len());
    endings[..kept].copy_from_slice(&original[..kept]);
    for k in 0..suffix {
        let new_line = new_lines.len() - 1 - k;
        let old_line = old_lines.len() - 1 - k;
        if new_line < breaks && old_line < original.len() {
            endings[new_line] = original[old_line];
        }
    }

    endings
}

/// Encode with one ending for the whole file.
///
/// Saving goes through `encode_lines`, which preserves each line's own ending;
/// this is the simple case, kept for the round-trip tests that need to state
/// what "all LF" or "all CRLF" should produce.
#[cfg(test)]
pub fn encode(content: &str, encoding: Encoding, eol: Eol, trailing_newline: bool) -> Vec<u8> {
    let breaks = content.split('\n').count().saturating_sub(1);
    encode_lines(
        content,
        encoding,
        &vec![eol; breaks],
        eol,
        trailing_newline,
        Path::new("test.md"),
    )
    .expect("test encodings must be representable")
}

/// Encode with a specific ending per line, so a file whose endings are
/// inconsistent comes back exactly as it was found.
pub fn encode_lines(
    content: &str,
    encoding: Encoding,
    endings: &[Eol],
    dominant: Eol,
    trailing_newline: bool,
    path: &Path,
) -> AppResult<Vec<u8>> {
    let mut text = String::with_capacity(content.len() + endings.len());
    for (i, line) in content.split('\n').enumerate() {
        if i > 0 {
            let ending = endings.get(i - 1).copied().unwrap_or(dominant);
            text.push_str(if ending == Eol::Crlf { "\r\n" } else { "\n" });
        }
        text.push_str(line);
    }

    let eol = dominant;

    // Only restore a trailing newline the user did not deliberately remove:
    // if the buffer already ends with one we keep it as is.
    if trailing_newline && !text.is_empty() && !text.ends_with('\n') {
        text.push_str(if eol == Eol::Crlf { "\r\n" } else { "\n" });
    }

    Ok(match encoding {
        Encoding::Utf8 => text.into_bytes(),
        Encoding::Utf8Bom => {
            let mut out = BOM_UTF8.to_vec();
            out.extend_from_slice(text.as_bytes());
            out
        }
        Encoding::Utf16Le => encode_utf16(&text, true),
        Encoding::Utf16Be => encode_utf16(&text, false),
        _ => encode_legacy(&text, encoding, path)?,
    })
}

/// Write text back in the 8-bit encoding the file came in.
///
/// A legacy encoding holds a few hundred characters, so text that has grown a
/// character it cannot hold — an em dash pasted into a KOI8-R file, a Cyrillic
/// word in a windows-1252 one — cannot be written. encoding_rs substitutes an
/// HTML escape in that case and reports it only as a flag; taking that would
/// mean writing something other than what is on screen. The save is refused
/// instead, naming the character, so the answer can be "then save it as UTF-8".
fn encode_legacy(text: &str, encoding: Encoding, path: &Path) -> AppResult<Vec<u8>> {
    let codec = encoding
        .legacy_codec()
        .expect("encode_legacy called for a Unicode encoding");

    let (bytes, _, had_unmappable) = codec.encode(text);
    if !had_unmappable {
        return Ok(bytes.into_owned());
    }

    // Only now, on the error path, is it worth finding out which character.
    let offender = text
        .chars()
        .find(|c| codec.encode(&c.to_string()).2)
        .map(|c| c.to_string())
        .unwrap_or_default();

    Err(AppError::EncodingLoss {
        path: path.to_string_lossy().to_string(),
        encoding: encoding.label().to_string(),
        character: offender,
    })
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
    out.extend_from_slice(if little_endian {
        BOM_UTF16LE
    } else {
        BOM_UTF16BE
    });
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

/// Guess which 8-bit encoding this is, and decode it.
///
/// Returns None when the guess is not one of the encodings we can write back
/// exactly, because opening a file we could not save again would be a trap
/// rather than a feature.
fn detect_legacy(bytes: &[u8]) -> Option<(Encoding, String)> {
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    let codec = detector.guess(None, true);

    let encoding = Encoding::from_codec(codec)?;
    let (text, _, had_errors) = codec.decode(bytes);
    if had_errors {
        return None;
    }
    Some((encoding, text.into_owned()))
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
        let endings = endings_for(&d.content, &d.content, &d.line_endings, d.eol);
        let back = encode_lines(
            &d.content,
            d.encoding,
            &endings,
            d.eol,
            d.trailing_newline,
            &p(),
        )
        .expect("re-encodes");
        assert_eq!(
            back, original,
            "round-trip changed bytes for {:?}/{:?}",
            d.encoding, d.eol
        );
    }

    /// Save `edited` over a file that held `original`, the way the command does.
    fn save_over(original: &[u8], edited: &str) -> Vec<u8> {
        try_save_over(original, edited).expect("re-encodes")
    }

    fn try_save_over(original: &[u8], edited: &str) -> AppResult<Vec<u8>> {
        let d = decode(original, &p()).expect("decodes");
        let endings = endings_for(edited, &d.content, &d.line_endings, d.eol);
        encode_lines(
            edited,
            d.encoding,
            &endings,
            d.eol,
            d.trailing_newline,
            &p(),
        )
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
    fn mixed_endings_survive_an_untouched_save() {
        // The common shape in the wild: a mostly-CRLF file with a few LF
        // lines. Normalising them would change bytes the user never typed.
        assert_roundtrip(b"one\r\ntwo\nthree\r\nfour\n");
        assert_roundtrip(b"a\nb\r\nc\nd\r\n");
        assert_roundtrip(b"\r\n\n\r\n");
    }

    #[test]
    fn mixed_endings_survive_an_edit_inside_a_line() {
        let original = b"one\r\ntwo\nthree\r\n";
        // The editor always hands back LF-only content; the endings come from
        // the file. Same number of lines, different text on one of them.
        let saved = save_over(original, "one\nTWO\nthree\n");
        assert_eq!(saved, b"one\r\nTWO\nthree\r\n");
    }

    #[test]
    fn appended_text_keeps_the_endings_that_were_there() {
        let original = b"one\r\ntwo\nthree\r\n";
        let saved = save_over(original, "one\ntwo\nthree\nfour\n");
        // The three original lines keep theirs; the new one takes the
        // dominant ending.
        assert_eq!(saved, b"one\r\ntwo\nthree\r\nfour\r\n");
    }

    #[test]
    fn a_uniform_file_stays_uniform_when_lines_are_added() {
        let original = b"one\ntwo\n";
        assert_eq!(
            save_over(original, "one\ntwo\nthree\n"),
            b"one\ntwo\nthree\n"
        );

        let crlf = b"one\r\ntwo\r\n";
        assert_eq!(
            save_over(crlf, "one\ntwo\nthree\n"),
            b"one\r\ntwo\r\nthree\r\n"
        );
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

    /// Everything written in Russian before UTF-8 won is in one of these, and
    /// a viewer that cannot open them is of no use to the person who has them.
    fn cp1251(text: &str) -> Vec<u8> {
        encoding_rs::WINDOWS_1251.encode(text).0.into_owned()
    }

    #[test]
    fn reads_a_windows_1251_file() {
        let bytes = cp1251("# Заметка\r\n\r\nСтарый документ.\r\n");
        let d = decode(&bytes, &p()).expect("decodes");

        assert_eq!(d.encoding, Encoding::Windows1251);
        assert_eq!(d.content, "# Заметка\n\nСтарый документ.\n");
    }

    #[test]
    fn writes_a_windows_1251_file_back_byte_for_byte() {
        assert_roundtrip(&cp1251(
            "# Инструкция\r\n\r\nПервый пункт — и тире.\r\nВторой.\r\n",
        ));
    }

    #[test]
    fn keeps_the_encoding_when_the_text_is_edited() {
        let original = cp1251("Было\r\n");
        let saved = save_over(&original, "Было\nСтало\n");
        assert_eq!(saved, cp1251("Было\r\nСтало\r\n"));
    }

    #[test]
    fn reads_the_other_cyrillic_encodings_too() {
        // KOI8 and DOS Cyrillic order the alphabet differently, so the same
        // sentence comes out as entirely different bytes in each.
        //
        // Which of the KOI8 pair a file is in cannot be told apart from a few
        // sentences — they differ in a handful of Ukrainian letters — and no
        // detector can do better without a declaration. What must hold is that
        // the text reads correctly and the file writes back byte for byte.
        for codec in [
            encoding_rs::KOI8_R,
            encoding_rs::IBM866,
            encoding_rs::ISO_8859_5,
        ] {
            let bytes = codec
                .encode("Здравствуйте, это письмо из архива.\n")
                .0
                .into_owned();

            let d = decode(&bytes, &p()).expect("decodes");
            assert!(
                d.content.starts_with("Здравствуйте"),
                "{} came out as {:?}",
                codec.name(),
                d.content
            );
            assert_roundtrip(&bytes);
        }
    }

    /// The one thing a save must never do: change a character it cannot write.
    #[test]
    fn refuses_to_save_a_character_the_encoding_cannot_hold() {
        let original = cp1251("Текст\r\n");
        let err = try_save_over(&original, "Текст 漢字\n").unwrap_err();

        match err {
            AppError::EncodingLoss {
                encoding,
                character,
                ..
            } => {
                assert_eq!(encoding, "windows-1251");
                assert_eq!(character, "漢");
            }
            other => panic!("expected EncodingLoss, got {other:?}"),
        }
    }

    #[test]
    fn still_refuses_bytes_that_are_no_encoding_we_can_write() {
        // A lone high byte in an otherwise UTF-8 file: not valid UTF-8, and
        // not text the detector can place either.
        let err = decode(&[0xE4, 0xF8, 0x00, 0x9D], &p()).unwrap_err();
        assert!(matches!(
            err,
            AppError::IsBinary { .. } | AppError::UnsupportedEncoding { .. }
        ));
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
