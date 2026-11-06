/**
 * What an export of a view says while it runs (decision 0103): a file of any size is fetched a chunk at a time, so a large one
 * says how far it has come, and one that stops partway saves what it holds and says so.
 */

const inThousands = (n: number): string => n.toLocaleString("en-US");
const leadsCounted = (n: number): string => `${inThousands(n)} ${n === 1 ? "lead" : "leads"}`;
const ofAll = (done: number, of: number | null): string =>
  of === null ? inThousands(done) : `${inThousands(done)} of ${inThousands(of)}`;

export const LEAD_EXPORT_WORDS = {
  going: (done: number, of: number | null): string => `Exporting ${ofAll(done, of)}…`,
  done: (rows: number): string => `Exported ${leadsCounted(rows)}.`,
  part: (done: number, of: number | null): string => `Saved ${ofAll(done, of)}. The rest did not export.`,
} as const;
