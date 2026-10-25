import { normalizeEmail } from "../shared/email-address";
import { normalizePhone } from "../shared/phone";

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

/**
 * Which column holds what; null for a column the file lacks. `last` is a surname column joined onto the name. The four
 * after the address (decision 0073, R22: what a booking tool's client file carries) are found by their header alone,
 * never by what they hold, and a reader that does not ask for them leaves them out.
 */
export interface ImportColumns {
  name: number | null;
  last: number | null;
  phone: number | null;
  email: number | null;
  lastVisit?: number | null;
  visits?: number | null;
  birthday?: number | null;
  notes?: number | null;
}

const NAME_WORDS = /^(name|full ?name|client|client ?name|customer|customer ?name|first ?name|given ?name|nombre)$/i;
const LAST_WORDS = /^(last ?name|surname|family ?name|apellidos?)$/i;
const PHONE_WORDS =
  /^(phone|mobile|cell|cell ?phone|tel|telephone|phone ?number|mobile ?number|number|tel[eé]fono|m[oó]vil|celular)$/i;
const EMAIL_WORDS = /^(e-?mail|email ?address|e-?mail ?address|correo|correo electr[oó]nico)$/i;
const LAST_VISIT_WORDS =
  /^(last ?visit|last ?visit ?date|last ?appointment|last ?appointment ?date|last ?appt|last ?booking|last ?seen|[uú]ltima ?visita)$/i;
const VISITS_WORDS =
  /^(visits|total ?visits|# ?(of )?visits|visit ?count|number ?of ?visits|total ?appointments|appointments|total ?bookings|bookings|visitas)$/i;
const BIRTHDAY_WORDS = /^(birthday|birth ?date|birthdate|date ?of ?birth|dob|cumplea[nñ]os|fecha ?de ?nacimiento)$/i;
const NOTES_WORDS = /^(notes?|client ?notes?|customer ?notes?|comments?|memo|notas?)$/i;

/** The four columns a client file carries beyond the name, the number and the address, by their header's words. */
const FACT_WORDS: ReadonlyArray<["lastVisit" | "visits" | "birthday" | "notes", RegExp]> = [
  ["lastVisit", LAST_VISIT_WORDS],
  ["visits", VISITS_WORDS],
  ["birthday", BIRTHDAY_WORDS],
  ["notes", NOTES_WORDS],
];

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
export function matchColumns(
  rows: string[][],
  opts: { facts?: boolean } = {},
): { columns: ImportColumns; header: boolean } {
  const first = rows[0] ?? [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0); // not Math.max(...spread): overflows near 150k rows
  const header = isHeaderRow(first);
  const body = header ? rows.slice(1) : rows;
  const columns: ImportColumns = { name: null, last: null, phone: null, email: null };
  if (opts.facts) Object.assign(columns, { lastVisit: null, visits: null, birthday: null, notes: null });
  if (header) {
    first.forEach((h, i) => {
      const w = h.trim();
      if (columns.email === null && EMAIL_WORDS.test(w)) columns.email = i;
      else if (columns.phone === null && PHONE_WORDS.test(w)) columns.phone = i;
      else if (columns.last === null && LAST_WORDS.test(w)) columns.last = i;
      else if (columns.name === null && NAME_WORDS.test(w)) columns.name = i;
      else if (opts.facts) {
        const fact = FACT_WORDS.find(([key, words]) => columns[key] === null && words.test(w));
        if (fact) columns[fact[0]] = i;
      }
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

/**
 * What a client file says of a person beyond who they are (decision 0073, R22): the last visit and the birthday as
 * dates (a birthday with no year as "--MM-DD"), the visits counted, and the notes, each where the file has one.
 */
export interface ImportFacts {
  last_visit?: string;
  visits?: number;
  birthday?: string;
  notes?: string;
}

/** A tool's name as the owner writes it, from the word the ledger keeps. */
const VIA_WORDS: Readonly<Record<string, string>> = {
  google: "Google",
  microsoft: "Outlook",
  vagaro: "Vagaro",
  booksy: "Booksy",
  square: "Square",
  fresha: "Fresha",
  acuity: "Acuity",
  glossgenius: "GlossGenius",
  link: "your calendar link",
};

export const viaWords = (via: string | null): string | null =>
  via ? (VIA_WORDS[via] ?? via.charAt(0).toUpperCase() + via.slice(1)) : null;

/** One line of the file, normalised: `line` is its 1-based line in the file, for the words that say what was skipped. */
export interface ImportRow {
  line: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** What the file says of them beyond that, where the reader asked for it and the line has any. */
  facts?: ImportFacts;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");
/** A real day of a month (a year's own February counted where the year is known; leap-day birthdays kept). */
const realDay = (y: number | null, m: number, d: number): boolean =>
  m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y ?? 2000, m, 0)).getUTCDate();

/** A two-digit year as the century it most likely is: 26 is 2026, 75 is 1975. */
const fullYear = (y: string): number => (y.length === 2 ? (+y > 50 ? 1900 : 2000) + +y : +y);

/** A month written as a word ("Apr", "April"), as its number; 0 for none. */
const monthNumberOf = (w: string | undefined): number => (w ? MONTHS.indexOf(w.slice(0, 3).toLowerCase()) + 1 : 0);

/** "YYYY-MM-DD", or "--MM-DD" with no year; null for a day that is not real. */
const dateKey = (y: number | null, m: number, d: number): string | null =>
  realDay(y, m, d) ? `${y ? String(y) : "-"}-${pad2(m)}-${pad2(d)}` : null;

/**
 * A date as a file writes one, read to "YYYY-MM-DD", or "--MM-DD" where it has no year: ISO, a US month/day/year (the
 * booking tools are American), "Apr 23, 2026", "23 Apr 2026", or month and day alone. Null for anything else, never a
 * guess: "05/06" is May 6th here, never the fifth of June.
 */
export function fileDateOf(raw: string): string | null {
  const v = raw.trim();
  const [, isoY, isoM, isoD] = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v) ?? [];
  if (isoY) return dateKey(+isoY, Number(isoM), Number(isoD));
  const [, usM, usD, usY] = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(v) ?? [];
  if (usM) return dateKey(usY ? fullYear(usY) : null, +usM, Number(usD));
  const [, mfMonth, mfD, mfY] = /^([A-Za-z]{3,9})\.? (\d{1,2})(?:,? (\d{4}))?$/.exec(v) ?? [];
  if (mfMonth) return dateKey(mfY ? +mfY : null, monthNumberOf(mfMonth), Number(mfD));
  const [, dfD, dfMonth, dfY] = /^(\d{1,2}) ([A-Za-z]{3,9})\.?(?:,? (\d{4}))?$/.exec(v) ?? [];
  if (dfD) return dateKey(dfY ? +dfY : null, monthNumberOf(dfMonth), +dfD);
  return null;
}

/** What a line says beyond who the person is, read by the rules above; none where it says nothing. */
function fileFactsOf(
  r: string[],
  columns: ImportColumns,
  cell: (r: string[], i: number | null) => string,
): ImportFacts | undefined {
  const facts: ImportFacts = {};
  const last = fileDateOf(cell(r, columns.lastVisit ?? null));
  // A last visit has its year: a day and a month alone could be any year's.
  if (last && !last.startsWith("--")) facts.last_visit = last;
  const visits = cell(r, columns.visits ?? null).replace(/,/g, "");
  if (/^\d{1,6}$/.test(visits)) facts.visits = Number(visits);
  const birthday = fileDateOf(cell(r, columns.birthday ?? null));
  if (birthday) facts.birthday = birthday;
  // contacts.notes holds 1 to 600 characters; longer notes are cut at a code point, never mid-emoji.
  const notes = Array.from(cell(r, columns.notes ?? null).replace(/\s+/g, " "))
    .slice(0, 600)
    .join("")
    .trim();
  if (notes) facts.notes = notes;
  return Object.keys(facts).length ? facts : undefined;
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
    const facts = fileFactsOf(r, columns, cell);
    return {
      line: carried ?? n + (header ? 2 : 1),
      name: name || null,
      phone: normalizePhone(cell(r, columns.phone)),
      email: normalizeEmail(cell(r, columns.email)),
      ...(facts ? { facts } : {}),
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
