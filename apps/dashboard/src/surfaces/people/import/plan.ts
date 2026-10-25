/**
 * The file as a plan: its rows, where the columns are, the people as the door takes them, and the counts the owner sees
 * before anything is written (moved whole from legacy/pages/people-import.jsx, decision 0015). Pure. The reader is
 * contracts' (csv.ts): parseCsv, matchColumns, importRowsOf, importCounts.
 */
import { importCounts, importRowsOf, matchColumns, parseCsv } from "@chanlytics/contracts";
import type { ImportHead } from "./frame";

export const plImportPlan = (text: string) => plImportPlanOf(parseCsv(text || ""));

/**
 * A file's rows as a plan, however they were read (a CSV's text, or an Excel sheet: xlsx.ts): its columns found, the
 * four a client file carries beyond the name, the number and the address among them (decision 0073, R22), its people
 * and their counts.
 */
export const plImportPlanOf = (rows: string[][]) => {
  const { columns, header } = matchColumns(rows, { facts: true });
  const people = importRowsOf(rows, columns, header);
  return { rows, columns, header, headers: header ? rows[0] : [], people, counts: importCounts(people) };
};
export type ImportPlan = ReturnType<typeof plImportPlan>;

/** What was read, said on the sheet's one line: how many can go in, and how many cannot, having neither a number nor an address. */
export const plImportReadWords = (c: ImportPlan["counts"]): string => {
  const ready = (c.rows - c.unreadable).toLocaleString();
  return c.unreadable
    ? `${ready} to add · ${c.unreadable.toLocaleString()} with no number or email`
    : `${ready} to add`;
};

/**
 * The taste's heads, each with the header's own word for the column taken for it, or null where none was found; a file
 * with no header row has its columns told apart by what is in them, and its heads say nothing more.
 */
export const plImportHeads = (plan: ImportPlan): ImportHead[] => {
  if (!plan.header) return ["Name", "Mobile", "Email"];
  const from = (i: number | null) => (i === null ? null : String(plan.headers?.[i] || "").trim() || null);
  return [
    { label: "Name", from: from(plan.columns.name) },
    { label: "Mobile", from: from(plan.columns.phone) },
    { label: "Email", from: from(plan.columns.email) },
  ];
};

/** Which column was taken for what: the header's own word for it, or that none was found. */
export const plImportColumnWords = (plan: ImportPlan): string => {
  if (!plan.header) return "No header row: the columns were told apart by what is in them.";
  const said = (i: number | null) => (i === null ? "not found" : `“${String(plan.headers?.[i] || "").trim()}”`);
  return `Columns: name ${said(plan.columns.name)}, mobile ${said(plan.columns.phone)}, email ${said(plan.columns.email)}.`;
};

/** The columns found, as the clients' sheet lists them (canvas 4·j): "Name · Mobile · Email · Last visit · Birthday". */
export const plImportFoundWords = (plan: ImportPlan): string => {
  const c = plan.columns;
  return (
    [
      c.name !== null ? "Name" : null,
      c.phone !== null ? "Mobile" : null,
      c.email !== null ? "Email" : null,
      // trade-word: the client file's own column names, as the booking tools write them
      c.lastVisit != null ? "Last visit" : null,
      // trade-word: the client file's own column names, as the booking tools write them
      c.visits != null ? "Visits" : null,
      c.birthday != null ? "Birthday" : null,
      c.notes != null ? "Notes" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "None found"
  );
};
