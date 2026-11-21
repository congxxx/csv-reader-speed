# csv-reader-speed — a faster drop-in for csv-reader 1.0.0

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/congxxx/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/congxxx/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

Entry for [Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121): `solve.js` answers every case exactly as make.fun's own csv-reader 1.0.0 does — `{columns, rows, errors}` for an input `{text, header}` — and does it ~2.5–3× faster on the practice set.

## How it works

The reference reads the text one character at a time and builds every field
by concatenation. This parser never does:

- **Record fast path.** A record whose first line holds no quote and no
  stray CR is one line: it is cut out with one `indexOf('\n')` and split on
  commas with a single native `split(',')`.
- **Index jumps, not character loops.** Every other field is cut out with
  `indexOf` jumps (next quote, next delimiter) and `String.slice`, so a
  field costs a few native scans instead of a per-character loop.
- **Quoted fields** find the next quote with `indexOf('"')`; a doubled
  quote is one literal quote, a CR/LF inside is read as LF and counts a
  line, and a quote that never closes is treated as a literal with the text
  re-read as unquoted — exactly csv-reader's policy.
- **Unquoted fields** find the next delimiter with one `/[,\r\n]/g` scan;
  a CR not followed by LF is dropped as `stray_cr`.
- All of csv-reader's error records are reproduced in order:
  `stray_cr`, `unterminated_quote`, `quote_junk`, `short_row` (with
  `fields`), `long_row` (with `extra`), each with the `line` the record
  starts on and its `row` index (null for the header).

## Layout

- `solve.js` — the entry: `export function run(input)`.
- `main.ts` — the harness driver (the house's own): reads every case from
  `/input/cases.json`, answers each with `run`, writes `/output/answers.json`.
- `package.json`, `LICENSE` (MIT), `.makefun/owner.json`.

## Check it

```sh
node --version   # Node 22
# correctness + speed against the kit's practice set and the reference:
node bench.mjs
# adversarial differential test against csv-reader 1.0.0:
node fuzz.mjs
```

Local results on this machine (Node 22, practice set, 10.2M chars):
6/6 cases identical to the reference; ~236 ms CPU vs ~741 ms for
csv-reader 1.0.0 (~3.1×). Three freshly drawn held-out sets (same
generator, different seeds): 6/6 each, 2.55–2.85× faster.
