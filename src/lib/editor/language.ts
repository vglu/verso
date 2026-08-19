import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

/**
 * Which language a file is written in.
 *
 * Verso opens more than Markdown — a `.json` next to a document, a `.csv` a
 * colleague sent, the `.txt` that has been in the folder since 2011. Until
 * now all of them were parsed as Markdown, which is not merely wasteful but
 * wrong: a `#` inside a JSON string became a heading, and a line of pipes in
 * a CSV became a table by accident rather than by meaning.
 *
 * Markdown keeps everything it had — live preview, the outline, folding. The
 * rest get syntax highlighting and nothing that pretends to render them.
 */
const MARKDOWN = ['md', 'markdown', 'mdown', 'mkd', 'mdx'];

export function extensionOf(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isMarkdownFile(fileName: string): boolean {
  const ext = extensionOf(fileName);
  // No extension means an untitled buffer, or a README-shaped file: Markdown
  // is what someone writing in this program is writing, and it renders plain
  // prose as plain prose anyway.
  return ext === '' || MARKDOWN.includes(ext);
}

/**
 * The languages a plain-text file might be in, loaded on demand.
 *
 * `@codemirror/language-data` is a table of descriptions, not of parsers: the
 * grammar itself is fetched only when a file of that kind is opened, so a
 * reader who only ever opens Markdown never pays for any of it.
 */
export async function languageFor(fileName: string): Promise<LanguageSupport | null> {
  if (isMarkdownFile(fileName)) return null; // Markdown has its own support

  const description = LanguageDescription.matchFilename(languages, fileName);
  if (!description) return null;
  try {
    return await description.load();
  } catch (error) {
    // A grammar that will not load leaves plain text on screen, which is what
    // the file is anyway. It is not worth an error in the reader's face.
    console.warn(`language for ${fileName} failed to load`, error);
    return null;
  }
}

/** The name to show in the status strip: "JSON", "CSV", "Markdown". */
export function languageLabel(fileName: string): string {
  if (isMarkdownFile(fileName)) return 'Markdown';
  const description = LanguageDescription.matchFilename(languages, fileName);
  if (description) return description.name;
  return extensionOf(fileName).toUpperCase() || 'Text';
}
