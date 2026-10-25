import { normalizeEmail } from "../shared/email-address.js";
import { normalizePhone } from "../shared/phone.js";
export function csvCell(v) {
  let s = v == null ? "" : typeof v === "boolean" ? v ? "yes" : "no" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function delimiterOf(text) {
  const first = (text.split(/\r?\n/, 1)[0] ?? "").replace(/"[^"]*"/g, "");
  return (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ";" : ",";
}
export function parseCsv(text) {
  const s = text.charCodeAt(0) === 65279 ? text.slice(1) : text;
  const sep = delimiterOf(s);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let lineNo = 1;
  let rowStartLine = 1;
  const pushRow = () => {
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
        if (ch === "\n") lineNo++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (cell === "") {
        quoted = true;
        continue;
      }
      cell += ch;
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
const NAME_WORDS = /^(name|full ?name|client|client ?name|customer|customer ?name|first ?name|given ?name|nombre)$/i;
const LAST_WORDS = /^(last ?name|surname|family ?name|apellidos?)$/i;
const PHONE_WORDS = /^(phone|mobile|cell|cell ?phone|tel|telephone|phone ?number|mobile ?number|number|tel[eé]fono|m[oó]vil|celular)$/i;
const EMAIL_WORDS = /^(e-?mail|email ?address|e-?mail ?address|correo|correo electr[oó]nico)$/i;
const LAST_VISIT_WORDS = /^(last ?visit|last ?visit ?date|last ?appointment|last ?appointment ?date|last ?appt|last ?booking|last ?seen|[uú]ltima ?visita)$/i;
const VISITS_WORDS = /^(visits|total ?visits|# ?(of )?visits|visit ?count|number ?of ?visits|total ?appointments|appointments|total ?bookings|bookings|visitas)$/i;
const BIRTHDAY_WORDS = /^(birthday|birth ?date|birthdate|date ?of ?birth|dob|cumplea[nñ]os|fecha ?de ?nacimiento)$/i;
const NOTES_WORDS = /^(notes?|client ?notes?|customer ?notes?|comments?|memo|notas?)$/i;
const FACT_WORDS = [
  ["lastVisit", LAST_VISIT_WORDS],
  ["visits", VISITS_WORDS],
  ["birthday", BIRTHDAY_WORDS],
  ["notes", NOTES_WORDS]
];
export function phoneShaped(v) {
  return /^\+?[\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 10;
}
export function isHeaderRow(first) {
  return first.length > 0 && !first.some((c) => phoneShaped(c) || normalizeEmail(c) !== null);
}
export const COLUMN_SHARE = 0.6;
export function columnShare(rows, col, is) {
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
export function matchColumns(rows, opts = {}) {
  const first = rows[0] ?? [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const header = isHeaderRow(first);
  const body = header ? rows.slice(1) : rows;
  const columns = { name: null, last: null, phone: null, email: null };
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
      const words = (v) => /\p{L}/u.test(v) && normalizeEmail(v) === null && normalizePhone(v) === null;
      if (columnShare(body, i, words) >= COLUMN_SHARE) {
        columns.name = i;
        break;
      }
    }
  }
  return { columns, header };
}
const VIA_WORDS = {
  google: "Google",
  microsoft: "Outlook",
  vagaro: "Vagaro",
  booksy: "Booksy",
  square: "Square",
  fresha: "Fresha",
  acuity: "Acuity",
  glossgenius: "GlossGenius",
  link: "your calendar link"
};
export const viaWords = (via) => via ? VIA_WORDS[via] ?? via.charAt(0).toUpperCase() + via.slice(1) : null;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad2 = (n) => String(n).padStart(2, "0");
const realDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y ?? 2e3, m, 0)).getUTCDate();
const fullYear = (y) => y.length === 2 ? (+y > 50 ? 1900 : 2e3) + +y : +y;
const monthNumberOf = (w) => w ? MONTHS.indexOf(w.slice(0, 3).toLowerCase()) + 1 : 0;
const dateKey = (y, m, d) => realDay(y, m, d) ? `${y ? String(y) : "-"}-${pad2(m)}-${pad2(d)}` : null;
export function fileDateOf(raw) {
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
function fileFactsOf(r, columns, cell) {
  const facts = {};
  const last = fileDateOf(cell(r, columns.lastVisit ?? null));
  if (last && !last.startsWith("--")) facts.last_visit = last;
  const visits = cell(r, columns.visits ?? null).replace(/,/g, "");
  if (/^\d{1,6}$/.test(visits)) facts.visits = Number(visits);
  const birthday = fileDateOf(cell(r, columns.birthday ?? null));
  if (birthday) facts.birthday = birthday;
  const notes = Array.from(cell(r, columns.notes ?? null).replace(/\s+/g, " ")).slice(0, 600).join("").trim();
  if (notes) facts.notes = notes;
  return Object.keys(facts).length ? facts : void 0;
}
export function importRowsOf(rows, columns, header) {
  const cell = (r, i) => i === null ? "" : (r[i] ?? "").trim();
  return (header ? rows.slice(1) : rows).map((r, n) => {
    const name = Array.from(
      [cell(r, columns.name), cell(r, columns.last)].filter(Boolean).join(" ").replace(/\s+/g, " ")
    ).slice(0, 80).join("").trim();
    const carried = r.line;
    const facts = fileFactsOf(r, columns, cell);
    return {
      line: carried ?? n + (header ? 2 : 1),
      name: name || null,
      phone: normalizePhone(cell(r, columns.phone)),
      email: normalizeEmail(cell(r, columns.email)),
      ...facts ? { facts } : {}
    };
  });
}
export function importCounts(rows) {
  return {
    rows: rows.length,
    withPhone: rows.filter((r) => r.phone).length,
    withEmail: rows.filter((r) => r.email).length,
    unreadable: rows.filter((r) => !r.phone && !r.email).length
  };
}
