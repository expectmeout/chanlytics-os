/**
 * The dim trail a row draws after a person's name, the business they work at: its own module, since a row on every page
 * draws it (Today's queue, the Calendar's visit) and business.ts brings the whole of Leads' words with it.
 */
import type { NameSource } from "./words";

/** The dim trail a row draws after a person's name: " · Bloom & Vow Bridal", or null for a stand-in or nobody's. */
export function businessTrailOf(row: {
  nameSource?: NameSource | null;
  worksAt?: { name: string | null; gone: boolean } | null;
}): string | null {
  if (row.nameSource === "lead" || !row.worksAt || row.worksAt.gone || !row.worksAt.name) return null;
  return row.worksAt.name;
}
