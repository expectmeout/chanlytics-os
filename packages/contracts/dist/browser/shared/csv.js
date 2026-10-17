import { normalizeEmail } from "./email-address.js";
import { normalizePhone } from "./phone.js";
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
export function matchColumns(rows) {
  const first = rows[0] ?? [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const header = isHeaderRow(first);
  const body = header ? rows.slice(1) : rows;
  const columns = { name: null, last: null, phone: null, email: null };
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
      const words = (v) => /\p{L}/u.test(v) && normalizeEmail(v) === null && normalizePhone(v) === null;
      if (columnShare(body, i, words) >= COLUMN_SHARE) {
        columns.name = i;
        break;
      }
    }
  }
  return { columns, header };
}
export function importRowsOf(rows, columns, header) {
  const cell = (r, i) => i === null ? "" : (r[i] ?? "").trim();
  return (header ? rows.slice(1) : rows).map((r, n) => {
    const name = Array.from(
      [cell(r, columns.name), cell(r, columns.last)].filter(Boolean).join(" ").replace(/\s+/g, " ")
    ).slice(0, 80).join("").trim();
    const carried = r.line;
    return {
      line: carried ?? n + (header ? 2 : 1),
      name: name || null,
      phone: normalizePhone(cell(r, columns.phone)),
      email: normalizeEmail(cell(r, columns.email))
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
