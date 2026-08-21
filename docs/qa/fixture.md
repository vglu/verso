# A page built to be measured

This document exists for `scripts/visual-qa.ps1` and is written the way it is on purpose. The paragraphs carry no hard line breaks, so every line runs to the edge of the reading column and stops there — which is what lets a program work out where the column actually is by looking at the ink, rather than being told. A document wrapped by hand at seventy-six columns cannot answer that question: its lines end where the author pressed Return, and the measurement comes back saying the column has drifted when nothing has moved at all.

Everything below is here because it is drawn differently from a paragraph, and each of them has at some point started somewhere a paragraph does not. That is the whole point of photographing the page: the failures worth catching are the ones where a single block comes loose from the column while everything around it stays put, and a person reading a screenshot they already expect to be correct will look straight past it.

## A table, which is allowed to be wider than the prose

| Block | Drawn as | Has been wrong by |
| :---- | :------- | ----------------: |
| Table | A widget outside the line | 195 px |
| Code | Lines with a tinted background | 0 px |
| Diagram | A widget, centred in its frame | 0 px |
| Formula | A widget on its own line | 0 px |

## Code, which keeps its own background

```ts
// Long enough to reach past the reading column, which is the point: a block of
// code is not prose and is allowed the extra room, but it still begins where
// the paragraph above it begins.
export function measure(page: Page): Report {
  const rows = page.rows.filter((row) => row.ink > MIN_ROW_INK);
  const axis = mode(rows.map((row) => row.first));
  return { axis, loose: rows.filter((row) => row.first < axis - TOLERANCE) };
}
```

## A quotation, which carries a rule down its left side

> The rule sits on the column's left edge and the words sit a little inside it, so the leftmost ink of a quoted line is the rule itself. That is correct, and it is why the check allows a few pixels of tolerance rather than demanding the exact same pixel from every row on the page.

## A list, whose markers sit where the text does

- The marker is part of the line, so the line still begins on the axis.
- A second item, long enough to wrap on a narrow window and so to produce a continuation line that begins slightly inside the axis, which is also correct.
- [x] A finished task
- [ ] An unfinished one

## A formula, set on its own

$$
E = mc^2
$$

## And a last paragraph

Nothing after this: the page ends with prose so that the final rows measured are ordinary ones, and a fault in the block above cannot hide in the last few pixels of the document.
