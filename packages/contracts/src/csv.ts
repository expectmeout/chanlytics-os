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
