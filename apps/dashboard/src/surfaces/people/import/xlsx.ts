/**
 * An Excel file's first sheet as rows (decision 0073, R22: Vagaro exports its client list as Excel alone). Read in the
 * browser with nothing added: an .xlsx is a zip of XML, so the zip's own directory is read here, each part inflated by
 * the browser's `DecompressionStream("deflate-raw")`, and the sheet, its shared strings and its styles read by
 * `DOMParser`. A date Excel keeps as a day count is said as "YYYY-MM-DD", which contracts' reader (csv.ts fileDateOf)
 * takes like any other. The old binary .xls is not read: the sheet says so and asks for a CSV.
 *
 * Every row is the file's own, cell for cell, as text; the reader that finds the columns is contracts' (csv.ts), the
 * same for a CSV and a sheet. Each row carries its line in the sheet (`line`), as parseCsv's do.
 */
import { DAY_MS } from "@chanlytics/contracts";

/** A zip's entries, by name: where each one's bytes start, how big, and how they are kept. */
interface ZipEntry {
  method: number;
  compressed: number;
  offset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
/** The longest a zip's end record can sit from the file's end: its 22 bytes and a comment of up to 65,535. */
const EOCD_SEARCH = 22 + 0xffff;

/** Why a file could not be read, in the sheet's own words. */
export class SheetUnreadable extends Error {}

/** The zip's directory: every entry by its name. */
function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - EOCD_SEARCH); i--) {
    if (view.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new SheetUnreadable("That file isn't an Excel workbook.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = new Map<string, ZipEntry>();
  const names = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CENTRAL) break;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    entries.set(name, { method, compressed, offset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** One entry's bytes, inflated where the zip keeps them deflated (method 8), as they are where stored (method 0). */
async function zipPart(bytes: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(e.offset, true) !== LOCAL) throw new SheetUnreadable("That workbook is damaged.");
  const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
  const raw = bytes.subarray(start, start + e.compressed);
  if (e.method === 0) return raw;
  if (e.method !== 8) throw new SheetUnreadable("That workbook is packed in a way that can't be read here.");
  if (typeof DecompressionStream === "undefined")
    throw new SheetUnreadable("This browser can't open Excel files. Save it as CSV and drop that instead.");
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** An entry as a parsed XML document; null where the workbook has no such part. */
async function xmlPart(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string): Promise<Document | null> {
  const e = entries.get(name);
  if (!e) return null;
  const text = new TextDecoder().decode(await zipPart(bytes, e));
  return new DOMParser().parseFromString(text, "application/xml");
}

/** Elements by their local name, whatever namespace prefix the writer gave them. */
const byName = (root: Document | Element, name: string): Element[] =>
  Array.from(root.getElementsByTagNameNS("*", name));

/** The first sheet's part name: the workbook's first sheet, through its relationship, or sheet1. */
function firstSheetOf(book: Document | null, rels: Document | null): string {
  const sheet = book ? byName(book, "sheet")[0] : undefined;
  const rid =
    sheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ??
    sheet?.getAttribute("r:id") ??
    null;
  const rel = rid && rels ? byName(rels, "Relationship").find((r) => r.getAttribute("Id") === rid) : undefined;
  const target = rel?.getAttribute("Target");
  if (!target) return "xl/worksheets/sheet1.xml";
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

/** The shared strings, in order: each <si>'s text, its runs joined. */
function sharedStringsOf(doc: Document | null): string[] {
  if (!doc) return [];
  return byName(doc, "si").map((si) =>
    byName(si, "t")
      .map((t) => t.textContent ?? "")
      .join(""),
  );
}

/** Excel's built-in number formats that are dates (ECMA-376, 18.8.30). */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** For each cell style, whether it shows a date: a built-in date format, or a custom one with a day, month or year. */
function dateStylesOf(doc: Document | null): boolean[] {
  if (!doc) return [];
  const custom = new Map<number, string>();
  for (const f of byName(doc, "numFmt"))
    custom.set(Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? "");
  const xfs = byName(doc, "cellXfs")[0];
  if (!xfs) return [];
  return byName(xfs, "xf").map((xf) => {
    const id = Number(xf.getAttribute("numFmtId") ?? "0");
    if (BUILTIN_DATE_FORMATS.has(id)) return true;
    // A custom format is a date where it names a day, a month or a year outside quotes and brackets.
    const code = (custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
    return /[dmy]/i.test(code) && !/^[#0.,%\s]*$/.test(code);
  });
}

/** Excel's day count (from 30 Dec 1899, its leap-year slip included) as "YYYY-MM-DD". */
function excelDay(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const ms = Math.round((serial - 25569) * DAY_MS);
  return new Date(ms).toISOString().slice(0, 10);
}

/** "AB12" → its column, from 0. */
function columnOf(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

/** One cell as text: a shared string, an inline one, a formula's text, a true/false, a date by its style, or a number. */
function cellText(c: Element, shared: string[], dates: boolean[]): string {
  const type = c.getAttribute("t");
  const v = byName(c, "v")[0]?.textContent ?? "";
  if (type === "s") return shared[Number(v)] ?? "";
  if (type === "inlineStr")
    return byName(c, "t")
      .map((t) => t.textContent ?? "")
      .join("");
  if (type === "str" || type === "d") return v;
  if (type === "b") return v === "1" ? "TRUE" : "FALSE";
  if (v === "") return "";
  const style = Number(c.getAttribute("s") ?? "0");
  if (dates[style]) return excelDay(Number(v)) ?? v;
  return v;
}

/** The first sheet's rows, each a list of its cells as text, with its line in the sheet; empty rows left out. */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const entries = zipEntries(bytes);
  const [book, rels, strings, styles] = await Promise.all([
    xmlPart(bytes, entries, "xl/workbook.xml"),
    xmlPart(bytes, entries, "xl/_rels/workbook.xml.rels"),
    xmlPart(bytes, entries, "xl/sharedStrings.xml"),
    xmlPart(bytes, entries, "xl/styles.xml"),
  ]);
  const sheet = await xmlPart(bytes, entries, firstSheetOf(book, rels));
  if (!sheet) throw new SheetUnreadable("That workbook has no sheet to read.");
  const shared = sharedStringsOf(strings);
  const dates = dateStylesOf(styles);
  const rows: string[][] = [];
  for (const row of byName(sheet, "row")) {
    const cells: string[] = [];
    for (const c of byName(row, "c")) {
      const ref = c.getAttribute("r");
      const col = ref ? columnOf(ref) : cells.length;
      while (cells.length < col) cells.push("");
      cells[col] = cellText(c, shared, dates).trim();
    }
    if (!cells.some((x) => x !== "")) continue;
    const line = Number(row.getAttribute("r") ?? rows.length + 1);
    rows.push(Object.assign(cells, { line }));
  }
  return rows;
}

/** Whether a file is an Excel workbook this reader takes (.xlsx), by its name or its type. */
export const isXlsx = (f: { name: string; type: string }): boolean =>
  /\.xlsx$/i.test(f.name) || f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The old binary Excel file, which this reader does not take. */
export const isOldXls = (f: { name: string; type: string }): boolean =>
  /\.xls$/i.test(f.name) || f.type === "application/vnd.ms-excel";
