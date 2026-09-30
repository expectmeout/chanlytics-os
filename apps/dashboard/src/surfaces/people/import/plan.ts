/**
 * The file as a plan: its rows, where the columns are, the people as the door takes them, and the counts the owner sees
 * before anything is written (moved whole from legacy/pages/people-import.jsx, decision 0015). Pure. The reader is
 * contracts' (csv.ts): parseCsv, matchColumns, importRowsOf, importCounts.
 */
import { importCounts, importRowsOf, matchColumns, parseCsv } from "@chanlytics/contracts";

export const plImportPlan = (text: string) => {
  const rows = parseCsv(text || "");
  const { columns, header } = matchColumns(rows);
  const people = importRowsOf(rows, columns, header);
  return { rows, columns, header, headers: header ? rows[0] : [], people, counts: importCounts(people) };
};
export type ImportPlan = ReturnType<typeof plImportPlan>;

export const plImportCountWords = (c: ImportPlan["counts"]): string => {
  const n = (k: number, one: string, many: string) => `${k.toLocaleString()} ${k === 1 ? one : many}`;
  return `${n(c.rows, "row", "rows")} · ${c.withPhone.toLocaleString()} with a number · ${c.withEmail.toLocaleString()} with an email · ${c.unreadable.toLocaleString()} with neither`;
};

/** Which column was taken for what: the header's own word for it, or that none was found. */
export const plImportColumnWords = (plan: ImportPlan): string => {
  if (!plan.header) return "No header row: the columns were told apart by what is in them.";
  const said = (i: number | null) => (i === null ? "not found" : `“${String(plan.headers?.[i] || "").trim()}”`);
  return `Columns: name ${said(plan.columns.name)}, mobile ${said(plan.columns.phone)}, email ${said(plan.columns.email)}.`;
};
