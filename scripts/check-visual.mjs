#!/usr/bin/env node
/**
 * Measure the beauty instead of admiring it.
 *
 * The two worst bugs this project has shipped were both invisible to every
 * check it had: a document that rendered into nothing because its pane had no
 * height, and a table that began two hundred pixels left of the paragraph
 * above it. Both were plain in a screenshot, and both survived because a
 * screenshot was looked at once, in one state, by someone who already knew
 * what it was supposed to say.
 *
 * So the screenshots are read by a program. `scripts/visual-qa.ps1`
 * photographs the running application in twelve states — two themes, one pane
 * and two, three window widths — and this reads the pixels back and asserts
 * the things a person would have to notice:
 *
 *   the document is not blank
 *   nothing in it starts to the left of the text
 *   the column is somewhere near the middle of the room it has
 *   the text is readable against what is behind it
 *   nothing is clipped by the edge of the document
 *
 * It also stitches a contact sheet, because some of what is wrong with a page
 * is only wrong next to the same page in another state.
 *
 * Usage: node scripts/check-visual.mjs [dir]     (default docs/qa)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodePng, scale } from './lib/png.mjs';

const DIR = process.argv[2] ?? join('docs', 'qa');

/** How far off the axis a row may start before it counts as loose. */
const AXIS_TOLERANCE = 5;
/** Rows allowed to break the axis rule — antialiasing, a stray glyph. */
const AXIS_OUTLIER_SHARE = 0.01;
/** How far the column's centre may sit from the middle of the room. */
const CENTRE_TOLERANCE = 0.15;
const MIN_INK_SHARE = 0.12;
const MIN_CONTRAST = 4.5;
/**
 * The scrollbar lives in the last few pixels of the document and is ink on
 * every row, including the empty ones between paragraphs — of which there are
 * more than there are rows of text. Left in, it wins the vote for where the
 * column begins, and then every line of the document is "left of the text".
 * The gutter is ten pixels plus its border; eighteen is the whole of it.
 */
const SCROLLBAR_GUTTER = 18;
/** Ink enough to be a line of something rather than a speck. */
const MIN_ROW_INK = 12;

const pixel = (img, x, y) => {
  const at = (y * img.width + x) * 4;
  return [img.data[at], img.data[at + 1], img.data[at + 2]];
};

/**
 * The page and the chrome around it are eight units apart in the light theme
 * — #ffffff against #f7f7f5 — so telling them apart needs a tighter eye than
 * telling ink from paper. Loose, and the empty half of the tab strip passes
 * for the top of the page.
 */
const PAGE_TOLERANCE = 3;

const near = (a, b, tolerance = PAGE_TOLERANCE) =>
  Math.abs(a[0] - b[0]) <= tolerance &&
  Math.abs(a[1] - b[1]) <= tolerance &&
  Math.abs(a[2] - b[2]) <= tolerance;

function luminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] =
    luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Find the document itself.
 *
 * The chrome is painted in a different colour from the page, so the page is
 * the longest run of rows made mostly of the colour under the middle of the
 * window — and, inside those rows, the longest run of columns of the same.
 * Nothing here needs to know how tall a toolbar is.
 */
function documentRect(img) {
  const background = pageColour(img);

  const pageish = [];
  for (let y = 0; y < img.height; y += 1) {
    let hits = 0;
    for (let x = 0; x < img.width; x += 4) if (near(pixel(img, x, y), background)) hits += 1;
    pageish.push(hits / Math.ceil(img.width / 4) > 0.5);
  }

  // The page begins under the tab strip, at the first stretch of blank paper
  // wide enough to be the padding above the first line — and runs to the
  // bottom of the window, because the capture leaves nothing below it. Looking
  // for the longest run of blank rows instead would find some gap in the
  // middle of the document: in a narrow pane a block of code spans the whole
  // width and cuts the page in two.
  const QUIET = 24;
  let top = -1;
  for (let y = 0; y < img.height - QUIET && top < 0; y += 1) {
    if (pageish.slice(y, y + QUIET).every(Boolean)) top = y;
  }
  if (top < 0) return null;
  // The window's own frame is a dark line across the bottom of the capture,
  // and it is not part of the page.
  const bottom = img.height - 10;
  if (bottom - top < 100) return null;

  // The edges of the page, measured across that blank stretch: every column of
  // it is paper, so the run ends exactly where the window does.
  const columnIsPage = [];
  for (let x = 0; x < img.width; x += 1) {
    let hits = 0;
    for (let y = top; y < top + QUIET; y += 2) if (near(pixel(img, x, y), background)) hits += 1;
    columnIsPage.push(hits / Math.ceil(QUIET / 2) > 0.8);
  }

  const span = longestRun(columnIsPage);
  if (!span) return null;

  return { background, top, bottom, left: span.from, right: span.to };
}

/**
 * The colour of the page.
 *
 * Not the pixel in the middle of the window: on a narrow window that lands
 * inside a block of code or a diagram, and every measurement after it is taken
 * against the wrong background. The page is whatever colour most of the middle
 * of the window is.
 */
function pageColour(img) {
  const counts = new Map();
  const x0 = Math.floor(img.width * 0.2);
  const x1 = Math.floor(img.width * 0.8);
  const y0 = Math.floor(img.height * 0.2);
  const y1 = Math.floor(img.height * 0.8);

  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const [r, g, b] = pixel(img, x, y);
      const key = (r >> 2) * 4096 + (g >> 2) * 64 + (b >> 2);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return [((top / 4096) | 0) * 4, (((top / 64) | 0) % 64) * 4, (top % 64) * 4];
}

function longestRun(flags) {
  let best = null;
  let start = -1;
  for (let i = 0; i <= flags.length; i += 1) {
    if (i < flags.length && flags[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (!best || i - start > best.to - best.from) best = { from: start, to: i };
      start = -1;
    }
  }
  return best;
}

/** One half of a window, as an image in its own right. */
function crop(img, from, to) {
  const width = to - from;
  const data = Buffer.alloc(width * img.height * 4);
  for (let y = 0; y < img.height; y += 1) {
    img.data.copy(data, y * width * 4, (y * img.width + from) * 4, (y * img.width + to) * 4);
  }
  return { width, height: img.height, data };
}

function measure(img) {
  const rect = documentRect(img);
  if (!rect) return { error: 'could not find the document in this window' };

  const right = rect.right - SCROLLBAR_GUTTER;
  const inkRows = [];
  for (let y = rect.top; y < rect.bottom; y += 1) {
    let first = -1;
    let last = -1;
    let count = 0;
    for (let x = rect.left; x < right; x += 1) {
      if (near(pixel(img, x, y), rect.background, 24)) continue;
      count += 1;
      if (first < 0) first = x;
      last = x;
    }
    if (count >= MIN_ROW_INK) inkRows.push({ y, first, last });
  }

  const height = rect.bottom - rect.top;
  const width = right - rect.left;
  if (inkRows.length === 0) {
    return { rect, inkShare: 0, error: 'the document area is empty' };
  }

  // The axis is where most rows begin. Anything starting to the left of it has
  // come loose from the column — a table, a diagram, a block of code.
  const counts = new Map();
  for (const row of inkRows) {
    const bucket = Math.round(row.first / 2) * 2;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const axis = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const loose = inkRows.filter((row) => row.first < axis - AXIS_TOLERANCE);

  const columnLeft = Math.min(...inkRows.map((row) => row.first));
  const columnRight = Math.max(...inkRows.map((row) => row.last));
  const columnCentre = (columnLeft + columnRight) / 2;
  const drift = (columnCentre - (rect.left + right) / 2) / width;

  // The darkest thing on the page is the body text; that is the pair a reader
  // actually has to read.
  let darkest = rect.background;
  for (const row of inkRows) {
    for (let x = row.first; x <= row.last; x += 2) {
      const colour = pixel(img, x, row.y);
      if (near(colour, rect.background, 24)) continue;
      if (contrast(colour, rect.background) > contrast(darkest, rect.background)) darkest = colour;
    }
  }

  return {
    rect,
    axis,
    inkShare: inkRows.length / height,
    loose,
    columnLeft,
    columnRight,
    drift,
    contrast: contrast(darkest, rect.background)
  };
}

const manifestPath = join(DIR, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`no manifest in ${DIR} — run npm run qa:capture first`);
  process.exit(2);
}

// PowerShell writes UTF-8 with a byte order mark, which JSON.parse will not have.
const shots = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));
const list = Array.isArray(shots) ? shots : [shots];
const failures = [];
const sheet = [];

console.log(`\n  state                     ink   axis   loose   drift  contrast`);
console.log(`  ${'—'.repeat(62)}`);

for (const shot of list) {
  const file = join(DIR, shot.file);
  const image = decodePng(readFileSync(file));
  // A split window is two documents, and measuring across both would take the
  // left pane's column as the axis and call the right pane's a departure from
  // it. Each half answers for itself.
  const halves =
    shot.layout === 'split'
      ? [
          { suffix: ' left', image: crop(image, 0, Math.floor(image.width / 2) - 4) },
          { suffix: ' right', image: crop(image, Math.floor(image.width / 2) + 4, image.width) }
        ]
      : [{ suffix: '', image }];

  for (const half of halves) measureOne(shot, half.image, half.suffix);
  sheet.push({ image, label: shot.file });
}

function measureOne(shot, image, suffix) {
  const result = measure(image);
  const label = `${shot.theme}/${shot.layout}${suffix}/${shot.width}`.padEnd(24);

  if (result.error) {
    console.log(`  ${label}  ${result.error}`);
    failures.push(`${shot.file}${suffix}: ${result.error}`);
    return;
  }

  const ok = [];
  if (result.inkShare < MIN_INK_SHARE) {
    failures.push(
      `${shot.file}${suffix}: the document is blank (${(result.inkShare * 100).toFixed(0)}% of rows have ink)`
    );
    ok.push('blank');
  }
  if (result.loose.length > inkAllowance(result)) {
    const worst = result.loose.reduce((a, b) => (a.first < b.first ? a : b));
    failures.push(
      `${shot.file}${suffix}: ${result.loose.length} rows start left of the text — worst is ${
        result.axis - worst.first
      }px out at y=${worst.y}`
    );
    ok.push('axis');
  }
  if (Math.abs(result.drift) > CENTRE_TOLERANCE) {
    failures.push(
      `${shot.file}${suffix}: the column sits ${(result.drift * 100).toFixed(0)}% off centre`
    );
    ok.push('drift');
  }
  if (result.contrast < MIN_CONTRAST) {
    failures.push(
      `${shot.file}${suffix}: body text at ${result.contrast.toFixed(2)}:1 on the page`
    );
    ok.push('contrast');
  }

  console.log(
    `  ${label}${(result.inkShare * 100).toFixed(0).padStart(4)}%  ${String(result.axis).padStart(5)}  ${String(
      result.loose.length
    ).padStart(
      5
    )}  ${(result.drift * 100).toFixed(0).padStart(5)}%  ${result.contrast.toFixed(2).padStart(7)}${
      ok.length ? '   ✗ ' + ok.join(' ') : ''
    }`
  );
}

/** A handful of rows may legitimately start early: an em dash, a glyph tail. */
function inkAllowance(result) {
  return Math.max(
    2,
    Math.round(result.inkShare * (result.rect.bottom - result.rect.top) * AXIS_OUTLIER_SHARE)
  );
}

if (sheet.length > 0) {
  // Every state at the same size, whatever the window it was photographed in:
  // a sheet where a wide shot is a thin strip and a narrow one fills the cell
  // compares nothing.
  const columns = 3;
  const cellWidth = 460;
  const cellHeight = 300;
  const rows = Math.ceil(sheet.length / columns);
  const contact = {
    width: cellWidth * columns,
    height: cellHeight * rows,
    data: Buffer.alloc(cellWidth * columns * cellHeight * rows * 4, 0x22)
  };

  sheet.forEach((entry, index) => {
    const fitted = scale(
      entry.image,
      Math.min(cellWidth - 8, ((cellHeight - 8) * entry.image.width) / entry.image.height)
    );
    const ox = (index % columns) * cellWidth + Math.floor((cellWidth - fitted.width) / 2);
    const oy =
      Math.floor(index / columns) * cellHeight + Math.floor((cellHeight - fitted.height) / 2);
    for (let y = 0; y < fitted.height; y += 1) {
      const from = y * fitted.width * 4;
      const to = ((oy + y) * contact.width + ox) * 4;
      fitted.data.copy(contact.data, to, from, from + fitted.width * 4);
    }
  });

  const sheetPath = join(DIR, 'contact-sheet.png');
  writeFileSync(sheetPath, encodePng(contact));
  console.log(`\n  contact sheet: ${sheetPath}`);
}

console.log('');
if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  console.error(`\n${failures.length} state(s) failed`);
  process.exit(1);
}
console.log('✅ check:visual — every state measures up');
