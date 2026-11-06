/**
 * What an export of a view says while it runs (decision 0103): a file of any size is fetched a chunk at a time, so a large one
 * says how far it has come, and one that stops partway saves what it holds and says so.
 */

const count = (n: number): string => n.toLocaleString("en-US");
const leads = (n: number): string => `${count(n)} ${n === 1 ? "lead" : "leads"}`;
const ofAll = (done: number, of: number | null): string =>
  of === null ? count(done) : `${count(done)} of ${count(of)}`;

export const LEAD_EXPORT_WORDS = {
  going: (done: number, of: number | null): string => `Exporting ${ofAll(done, of)}…`,
  done: (rows: number): string => `Exported ${leads(rows)}.`,
  part: (done: number, of: number | null): string => `Saved ${ofAll(done, of)}. The rest did not export.`,
} as const;
