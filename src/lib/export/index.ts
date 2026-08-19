import type { EditorState } from '@codemirror/state';
import { buildStandaloneHtml } from './standalone';
import { writeExport } from '../ipc/commands';
import { pickExportTarget } from '../ipc/dialogs';

/**
 * Getting a document out of Verso: as a file, or onto paper.
 *
 * Both come from the same page. Printing what is on screen would print what
 * the editor happens to have drawn — a virtualised viewport, a couple of
 * screens of it, and a caret — so printing goes through the exporter too, and
 * the paper matches the file exactly.
 */

export interface ExportRequest {
  state: EditorState;
  /** File name without extension, used for the title and the suggested name. */
  name: string;
  dir: string;
  pageWidth?: number;
}

/** Save the document as a standalone HTML file. Returns the path, or null. */
export async function exportToHtml(request: ExportRequest): Promise<string | null> {
  const target = await pickExportTarget(`${request.name}.html`, request.dir || null);
  if (!target) return null;

  const html = await buildStandaloneHtml(request.state, {
    title: request.name,
    dir: request.dir,
    pageWidth: request.pageWidth
  });

  await writeExport(target, html);
  return target;
}

/**
 * Print, or save as PDF — the system dialog offers both.
 *
 * The page is printed from a hidden frame rather than from the window, which
 * is what makes the whole document print instead of the part that happens to
 * be scrolled into view. The frame is removed once the dialog closes.
 */
export async function printDocument(request: ExportRequest): Promise<void> {
  const html = await buildStandaloneHtml(request.state, {
    title: request.name,
    dir: request.dir,
    pageWidth: request.pageWidth
  });

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
  document.body.appendChild(frame);

  const done = (): void => {
    // Give the print dialog a moment to take its snapshot before the frame
    // that produced it disappears.
    setTimeout(() => frame.remove(), 1000);
  };

  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    const doc = frame.contentDocument;
    if (!doc) {
      resolve();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
  });

  try {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } finally {
    done();
  }
}
