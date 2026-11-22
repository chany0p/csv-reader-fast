// csv-reader-fast: a faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly csv-reader 1.0.0's answer for every input {text, header}:
// {columns, rows, errors}. Same broken-row policy, same error codes, same
// line/row numbering — only the mechanics are faster:
//
// - Records that hold no quote and no CR (except a trailing CRLF) are taken
//   whole: one slice, one native split(','). That is most records.
// - Other fields are found with indexOf, never built a character at a time:
//   an unquoted field is one slice up to its next comma or line break (any
//   CR inside such a slice is stray by construction, so it is stripped in
//   one replaceAll with one stray_cr error per CR removed).
// - A quoted field is one slice up to its closing quote; doubled quotes and
//   line breaks inside quotes take a short segment scan only when present.
// - An unterminated quote is handled exactly as csv-reader does: the opening
//   quote becomes a literal and the rest is re-read as unquoted.
//
// Dependency-free ES module, no state kept between calls.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Errors report these, not the current line.
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `startVal` up to the next comma or line
  // break. Every CR met here is stray (a CRLF is the line break itself, so
  // no CR inside the slice can be followed by LF): it is dropped and one
  // stray_cr error is recorded per CR. Returns the field, how it ended, and
  // how many characters were appended (the junk check needs that count).
  function readUnquoted(startVal) {
    const nl = text.indexOf('\n', pos);
    const cm = text.indexOf(',', pos);
    if (cm !== -1 && (nl === -1 || cm < nl)) {
      const seg = text.slice(pos, cm);
      pos = cm + 1;
      if (seg.indexOf('\r') === -1) return { value: startVal + seg, ended: COMMA, added: seg.length };
      const clean = seg.replaceAll('\r', '');
      const n = seg.length - clean.length;
      for (let i = 0; i < n; i++) error('stray_cr');
      return { value: startVal + clean, ended: COMMA, added: clean.length };
    }
    if (nl === -1) {
      const seg = text.slice(pos);
      pos = len;
      if (seg.indexOf('\r') === -1) return { value: startVal + seg, ended: END, added: seg.length };
      const clean = seg.replaceAll('\r', '');
      const n = seg.length - clean.length;
      for (let i = 0; i < n; i++) error('stray_cr');
      return { value: startVal + clean, ended: END, added: clean.length };
    }
    let segEnd = nl;
    if (nl > pos && text.charCodeAt(nl - 1) === 13) segEnd = nl - 1;
    const seg = text.slice(pos, segEnd);
    pos = nl + 1;
    line += 1;
    if (seg.indexOf('\r') === -1) return { value: startVal + seg, ended: LINE_BREAK, added: seg.length };
    const clean = seg.replaceAll('\r', '');
    const n = seg.length - clean.length;
    for (let i = 0; i < n; i++) error('stray_cr');
    return { value: startVal + clean, ended: LINE_BREAK, added: clean.length };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = open + 1;
    let cur = p;
    let parts = null;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      // Any line break inside the quotes, in [p, q)? A LF there is found by
      // indexOf; a lone CR (no LF can follow it inside the span, or the LF
      // check above would have caught it) by a bounded slice search.
      const nl = text.indexOf('\n', p);
      let hasBreak = nl !== -1 && nl < q;
      if (!hasBreak) hasBreak = text.slice(p, q).indexOf('\r') !== -1;
      if (hasBreak) {
        // Short segment scan, only for quoted fields that span lines: each
        // CRLF or lone CR inside quotes becomes one LF, each LF stays one.
        let j = p;
        let segStart = p;
        if (parts === null) parts = [];
        while (j < q) {
          const ch = text.charCodeAt(j);
          if (ch === 13) {
            parts.push(text.slice(segStart, j), '\n');
            line += 1;
            j += text.charCodeAt(j + 1) === 10 ? 2 : 1;
            segStart = j;
          } else if (ch === 10) {
            parts.push(text.slice(segStart, j + 1));
            line += 1;
            j += 1;
            segStart = j;
          } else {
            j += 1;
          }
        }
        parts.push(text.slice(segStart, q));
        p = q;
        cur = q;
        continue;
      }
      if (text[q + 1] === '"') {
        // Doubled quote: one quote in the value, keep scanning.
        if (parts === null) parts = [];
        parts.push(text.slice(cur, q), '"');
        p = q + 2;
        cur = q + 2;
        continue;
      }
      // The closing quote.
      const value = parts === null ? text.slice(cur, q) : parts.join('') + text.slice(cur, q);
      pos = q + 1;
      if (pos >= len) return { value, ended: END };
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: COMMA };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) error('quote_junk');
      return junk;
    }
  }

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

    // Fast path: the whole record to its next LF holds no quote, and no CR
    // except a trailing one that pairs with that LF (CRLF). Then every
    // field is unquoted and the record is one native split.
    const nl = text.indexOf('\n', pos);
    const segEnd = nl === -1 ? len : nl;
    const seg = text.slice(pos, segEnd);
    let fields = null;
    if (seg.indexOf('"') === -1) {
      const ri = seg.indexOf('\r');
      if (ri === -1) fields = seg.split(',');
      else if (nl !== -1 && ri === seg.length - 1) fields = seg.slice(0, -1).split(',');
    }
    if (fields !== null) {
      pos = nl === -1 ? len : nl + 1;
      if (nl !== -1) line += 1;
    } else {
      fields = [];
      let ended;
      let quoted = false;
      do {
        quoted = text.charCodeAt(pos) === 34;
        const field = quoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
        ended = field.ended;
      } while (ended === COMMA);
      // A line that held only stray CRs is left with no characters: no
      // record (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
