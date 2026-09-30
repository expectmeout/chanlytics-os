import { normalizeEmail } from "./email-address";
import { normalizePhone } from "./phone";

/** What a CSV cell may hold before it is spelled. */
export type CsvCell = string | number | boolean | null | undefined;

/**
 * One CSV cell. Quoted when it must be (RFC 4180), and any cell that a spreadsheet would read as a formula gets a
 * leading apostrophe: a WhatsApp profile name is customer-written text, and "=HYPERLINK(...)" is a real attack on
 * whoever opens the file. Phone numbers start with "+" and keep it this way too, instead of being summed.
 * One rule for every file the product writes: the route's export of everyone (apps/dashboard/src/server/export.ts)
 * and the page's export of a selection (clients-a.jsx, through window.__csvCell), which quoted and nothing more.
 */
export function csvCell(v: CsvCell): string {
  let s = v == null ? "" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ------------------------------------------------------------------ reading a file */

/** The delimiter a file uses: a semicolon when its first line has more of them than commas (a European export). */
function delimiterOf(text: string): "," | ";" {
  // A quoted comma or semicolon is part of a value, not the delimiter; strip quoted spans before counting, or a file
  // like `"Name, Jr.";"Mobile"` ties the vote on the wrong character.
  const first = (text.split(/\r?\n/, 1)[0] ?? "").replace(/"[^"]*"/g, "");
  return (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ";" : ",";
}

/**
 * A CSV as a spreadsheet writes one (RFC 4180): cells quoted when they must be, a quote inside a cell doubled, CRLF or
 * LF between rows, a BOM at the front. A row every cell of which is blank is not a row. Hand-rolled: the repository
 * takes no dependency for a file format it can read in forty lines.
 *
 * Each kept row also carries its 1-based line in the file as a non-enumerable `line` property (read back by
 * `importRowsOf`). It rides on the array object rather than the return type because `parseCsv`'s contract is plain
 * `string[][]` — every existing and future reader indexes and iterates it as one — and `assert.deepEqual` ignores
 * non-enumerable properties, so a row still compares equal to a plain array literal in a test.
 */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sep = delimiterOf(s);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let lineNo = 1;
  let rowStartLine = 1;
  const pushRow = (): void => {
    Object.defineProperty(row, "line", { value: rowStartLine, enumerable: false });
    rows.push(row);
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") lineNo++; // a newline embedded in a quoted cell still advances the file's line count
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (cell === "") {
        quoted = true;
        continue;
      }
      cell += ch; // a quote after other characters (5'4") is a character, not the start of a quoted field
      continue;
    }
    if (ch === sep) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cell);
      pushRow();
      row = [];
      cell = "";
      lineNo++;
      rowStartLine = lineNo;
      continue;
    }
    cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    pushRow();
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Which column holds what; null for a column the file lacks. `last` is a surname column joined onto the name. */
export interface ImportColumns {
  name: number | null;
  last: number | null;
  phone: number | null;
  email: number | null;
}

const NAME_WORDS = /^(name|full ?name|client|client ?name|customer|customer ?name|first ?name|given ?name|nombre)$/i;
const LAST_WORDS = /^(last ?name|surname|family ?name|apellidos?)$/i;
const PHONE_WORDS =
  /^(phone|mobile|cell|cell ?phone|tel|telephone|phone ?number|mobile ?number|number|tel[eé]fono|m[oó]vil|celular)$/i;
const EMAIL_WORDS = /^(e-?mail|email ?address|e-?mail ?address|correo|correo electr[oó]nico)$/i;

/**
 * A cell LOOKS like a phone number: digits (and the usual punctuation) with at least 10 of them. Stricter than
 * normalizePhone's 8-digit floor on purpose — this decides which COLUMN is the phone column, and the looser floor
 * (meant for a value already known to be a phone) would let a Birthday, a Zip+4 or a visit count win it instead.
 * normalizePhone still decides the stored value once the column is found. People's import and a list of leads
 * (leads/lead-import.ts) both find their columns with these rules.
 */
export function phoneShaped(v: string): boolean {
  return /^\+?[\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 10;
}

/** A file's first row is a header when none of its cells is a number or an address. */
export function isHeaderRow(first: readonly string[]): boolean {
  return first.length > 0 && !first.some((c) => phoneShaped(c) || normalizeEmail(c) !== null);
}

/** A column no header names is known by what it holds: this share of its filled cells. */
export const COLUMN_SHARE = 0.6;

/** The share of a column's non-empty cells that `is` accepts. */
export function columnShare(rows: string[][], col: number, is: (v: string) => boolean): number {
  let seen = 0;
  let hit = 0;
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (!v) continue;
    seen += 1;
    if (is(v)) hit += 1;
  }
  return seen ? hit / seen : 0;
}

/**
 * Where the name, the number and the address are. The first row is a header when none of its cells is a number or an
 * address; a header names its columns by their words, and a column no header names is known by its values (six in ten
 * of its filled cells a number, or an address). The name is the header's, else the first column of letters that is
 * neither.
 */
export function matchColumns(rows: string[][]): { columns: ImportColumns; header: boolean } {
  const first = rows[0] ?? [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0); // not Math.max(...spread): overflows near 150k rows
  const header = isHeaderRow(first);
  const body = header ? rows.slice(1) : rows;
  const columns: ImportColumns = { name: null, last: null, phone: null, email: null };
  if (header) {
    first.forEach((h, i) => {
      const w = h.trim();
      if (columns.email === null && EMAIL_WORDS.test(w)) columns.email = i;
      else if (columns.phone === null && PHONE_WORDS.test(w)) columns.phone = i;
      else if (columns.last === null && LAST_WORDS.test(w)) columns.last = i;
      else if (columns.name === null && NAME_WORDS.test(w)) columns.name = i;
    });
  }
  for (let i = 0; i < width; i++) {
    if (Object.values(columns).includes(i)) continue;
    if (columns.email === null && columnShare(body, i, (v) => normalizeEmail(v) !== null) >= COLUMN_SHARE)
      columns.email = i;
    else if (columns.phone === null && columnShare(body, i, phoneShaped) >= COLUMN_SHARE) columns.phone = i;
  }
  if (columns.name === null) {
    for (let i = 0; i < width; i++) {
      if (Object.values(columns).includes(i)) continue;
      const words = (v: string) => /\p{L}/u.test(v) && normalizeEmail(v) === null && normalizePhone(v) === null;
      if (columnShare(body, i, words) >= COLUMN_SHARE) {
        columns.name = i;
        break;
      }
    }
  }
  return { columns, header };
}

/** One line of the file, normalised: `line` is its 1-based line in the file, for the words that say what was skipped. */
export interface ImportRow {
  line: number;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** The rows as the door takes them: the one phone rule, the one email rule, a name of at most 80 characters. */
export function importRowsOf(rows: string[][], columns: ImportColumns, header: boolean): ImportRow[] {
  const cell = (r: string[], i: number | null): string => (i === null ? "" : (r[i] ?? "").trim());
  return (header ? rows.slice(1) : rows).map((r, n) => {
    // Array.from, not .slice: an 80th code point landing mid-emoji must not cut the surrogate pair in half. trim:
    // truncation can land exactly on the space the join above put between the two names.
    const name = Array.from(
      [cell(r, columns.name), cell(r, columns.last)].filter(Boolean).join(" ").replace(/\s+/g, " "),
    )
      .slice(0, 80)
      .join("")
      .trim();
    // parseCsv carries the file's own 1-based line on each row it returns; a row built some other way (or a future
    // caller that hand-assembles string[][]) falls back to counting from the header instead of losing the field.
    const carried = (r as { line?: number }).line;
    return {
      line: carried ?? n + (header ? 2 : 1),
      name: name || null,
      phone: normalizePhone(cell(r, columns.phone)),
      email: normalizeEmail(cell(r, columns.email)),
    };
  });
}

/** What the preview says before anything is written: rows, how many can be reached by number, by address, and neither. */
export function importCounts(rows: ImportRow[]): {
  rows: number;
  withPhone: number;
  withEmail: number;
  unreadable: number;
} {
  return {
    rows: rows.length,
    withPhone: rows.filter((r) => r.phone).length,
    withEmail: rows.filter((r) => r.email).length,
    unreadable: rows.filter((r) => !r.phone && !r.email).length,
  };
}
