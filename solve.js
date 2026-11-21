// A faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Returns, for every input {text, header}, exactly csv-reader's answer
// {columns, rows, errors}. Pure: no state kept from one call to the next.
//
// Speed comes from never reading the text a character at a time:
//  - a record with no quote and no stray CR in its line is split by ','
//    with one native split (the common case);
//  - every other field is cut out with String.indexOf jumps and String.slice,
//    so a field costs a couple of native scans instead of a per-character
//    loop and a per-character concatenation;
//  - the first LF and the first CR at or after the read position are cached
//    and advanced lazily, so a check for a line break or a stray CR costs no
//    scan at all;
//  - the whole read is one flat function: no closure, so the read position,
//    the line and the caches live in registers, not in a context object.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // First LF / CR at or after pos, cached: advanced lazily as pos moves past them.
  let nextLF = text.indexOf('\n');
  let nextCR = text.indexOf('\r');

  // The record being read: the line it starts on and the index in rows it takes
  // (null: the header).
  let recordLine = 1;
  let recordRow = null;

  let ended = END;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    while (nextLF !== -1 && nextLF < pos) nextLF = text.indexOf('\n', nextLF + 1);
    const lineEnd = nextLF;
    const end = lineEnd === -1 ? len : lineEnd;

    // Fast path: the record's first line holds no quote and no stray CR, so
    // the whole record is one line and splits on commas alone.
    const q = text.indexOf('"', pos);
    let fast = false;
    if (q === -1 || q >= end) {
      while (nextCR !== -1 && nextCR < pos) nextCR = text.indexOf('\r', nextCR + 1);
      const r = nextCR;
      if (r === -1 || r >= end || (lineEnd !== -1 && r === end - 1)) fast = true;
    }
    if (fast) {
      const contentEnd = lineEnd !== -1 && end > pos && text.charCodeAt(end - 1) === 13 ? end - 1 : end;
      const fields = text.slice(pos, contentEnd).split(',');
      pos = lineEnd === -1 ? len : lineEnd + 1;
      line += 1;
      const nf = fields.length;
      if (!(nf === 1 && fields[0] === '')) {
        if (width < 0) width = nf;
        if (header && columns === null) {
          columns = fields;
        } else {
          if (nf < width) {
            errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: nf });
            while (fields.length < width) fields.push('');
          } else if (nf > width) {
            errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
          }
          rows.push(fields);
        }
      }
      continue;
    }

    // The careful path: the record holds a quote or a stray CR.
    const fields = [];
    let quoted = false;
    for (;;) {
      let value;
      let added = 0;
      let needUnquoted = false;
      let junkCheck = false;
      quoted = text.charCodeAt(pos) === 34;

      if (quoted) {
        const open = pos;
        const openLine = line;
        const start = open + 1;
        // The closing quote is the next quote that is not doubled.
        let close = text.indexOf('"', start);
        let doubled = false;
        while (close !== -1 && text.charCodeAt(close + 1) === 34) {
          doubled = true;
          close = text.indexOf('"', close + 2);
        }
        if (close === -1) {
          // A quote that never closes: a literal quote, then the text after it
          // is read again as unquoted.
          pos = start;
          line = openLine;
          nextLF = text.indexOf('\n', pos);
          nextCR = text.indexOf('\r', pos);
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          value = '"';
          needUnquoted = true;
        } else {
          while (nextLF !== -1 && nextLF < start) nextLF = text.indexOf('\n', nextLF + 1);
          while (nextCR !== -1 && nextCR < start) nextCR = text.indexOf('\r', nextCR + 1);
          if (!doubled && (nextCR === -1 || nextCR >= close)) {
            // No doubled quote and no CR inside: the slice is the value; its LF
            // line breaks are one line each.
            value = text.slice(start, close);
            let lb = 0;
            while (nextLF !== -1 && nextLF < close) {
              lb += 1;
              nextLF = text.indexOf('\n', nextLF + 1);
            }
            if (lb !== 0) line += lb;
          } else {
            // Doubled quotes or a CR inside: each CRLF or lone CR reads as LF
            // and each doubled quote as one quote.
            const parts = [];
            let seg = start;
            let p = start;
            for (;;) {
              while (nextLF !== -1 && nextLF < p) nextLF = text.indexOf('\n', nextLF + 1);
              while (nextCR !== -1 && nextCR < p) nextCR = text.indexOf('\r', nextCR + 1);
              let idx = text.indexOf('"', p);
              if (idx !== -1 && idx >= close) idx = -1;
              let kind = 1;
              const lf = nextLF;
              if (lf !== -1 && lf < close && (idx === -1 || lf < idx)) { idx = lf; kind = 2; }
              const cr = nextCR;
              if (cr !== -1 && cr < close && (idx === -1 || cr < idx)) { idx = cr; kind = 3; }
              if (idx === -1) {
                parts.push(text.slice(seg, close));
                break;
              }
              if (kind === 1) {
                parts.push(text.slice(seg, idx), '"');
                seg = idx + 2;
                p = seg;
                continue;
              }
              if (kind === 2) {
                parts.push(text.slice(seg, idx), '\n');
                line += 1;
                seg = idx + 1;
                p = seg;
                continue;
              }
              parts.push(text.slice(seg, idx), '\n');
              line += 1;
              seg = text.charCodeAt(idx + 1) === 10 ? idx + 2 : idx + 1;
              p = seg;
            }
            value = parts.length === 1 ? parts[0] : parts.join('');
          }
          pos = close + 1;
          if (pos >= len) {
            ended = END;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) { pos += 1; ended = COMMA; }
            else if (c === 10) { pos += 1; line += 1; ended = LINE_BREAK; }
            else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; ended = LINE_BREAK; }
            else { needUnquoted = true; junkCheck = true; }
          }
        }
      } else {
        value = '';
        needUnquoted = true;
      }

      if (needUnquoted) {
        // What follows a closing quote, or a plain unquoted field: read up to
        // the next comma or line break, a CR not followed by LF dropped.
        for (;;) {
          const p = pos;
          let idx = text.indexOf(',', p);
          while (nextLF !== -1 && nextLF < p) nextLF = text.indexOf('\n', nextLF + 1);
          while (nextCR !== -1 && nextCR < p) nextCR = text.indexOf('\r', nextCR + 1);
          if (idx !== -1 && (nextLF === -1 || idx < nextLF) && (nextCR === -1 || idx < nextCR)) {
            // The common case: the field ends at a comma.
            if (idx > p) {
              const s = text.slice(p, idx);
              value = value.length === 0 ? s : value + s;
              added += idx - p;
            }
            pos = idx + 1;
            ended = COMMA;
            break;
          }
          let kind = 1;
          const lf = nextLF;
          if (lf !== -1 && (idx === -1 || lf < idx)) { idx = lf; kind = 2; }
          const cr = nextCR;
          if (cr !== -1 && (idx === -1 || cr < idx)) { idx = cr; kind = 3; }
          if (idx === -1) {
            if (p < len) {
              const s = text.slice(p);
              value = value.length === 0 ? s : value + s;
              added += len - p;
            }
            pos = len;
            ended = END;
            break;
          }
          if (kind === 3 && text.charCodeAt(idx + 1) !== 10) {
            // A CR not followed by LF is dropped (stray_cr); the field goes on.
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (idx > p) {
              const s = text.slice(p, idx);
              value = value.length === 0 ? s : value + s;
              added += idx - p;
            }
            pos = idx + 1;
            continue;
          }
          if (idx > p) {
            const s = text.slice(p, idx);
            value = value.length === 0 ? s : value + s;
            added += idx - p;
          }
          if (kind === 1) {
            pos = idx + 1;
            ended = COMMA;
          } else {
            pos = kind === 2 ? idx + 1 : idx + 2;
            line += 1;
            ended = LINE_BREAK;
          }
          break;
        }
        if (junkCheck && added > 0) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      }

      fields.push(value);
      if (ended !== COMMA) break;
    }

    // Finish the record: drop it when it held only stray CRs, else pad or cut
    // it to the first record's width.
    const nf = fields.length;
    if (!(nf === 1 && fields[0] === '' && !quoted)) {
      if (width < 0) width = nf;
      if (header && columns === null) {
        columns = fields;
      } else {
        if (nf < width) {
          errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: nf });
          while (fields.length < width) fields.push('');
        } else if (nf > width) {
          errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
        }
        rows.push(fields);
      }
    }
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
