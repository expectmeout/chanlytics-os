/**
 * How a view of Leads is asked of the read: its query for a page (GET leads), and the way the read walks for the way the page
 * says it. Apart from surface.ts, which holds what the tab has read and stands at its file limit.
 */
import type { LeadsView } from "./surface-types";

/** The most leads one page asks for: leads_page's own limit. */
const LEADS_PAGE = 500;

/** Found's key runs newest first (leads_page), so the read's `asc`, as Ask's tool says it, is the page's newest first, `desc`. */
export const readDir = ({ sort, dir }: { sort: string; dir: "asc" | "desc" }): "asc" | "desc" =>
  sort === "found" ? (dir === "asc" ? "desc" : "asc") : dir;

export function queryOf(v: LeadsView, after?: { key: string; id: string } | null): Record<string, string> {
  const q: Record<string, string> = { list: v.list, sort: v.sort, dir: readDir(v), limit: String(LEADS_PAGE) };
  if (v.searchId) q.search = v.searchId;
  if (v.cls) q.class = v.cls;
  if (v.sort === "pile" && v.pileList) q.pile_list = v.pileList;
  // The box's words, read where the page's filters are (00500): a chip is part of the route, the words are not.
  if (v.q && v.q.trim()) q.q = v.q.trim();
  for (const [k, val] of Object.entries(v.chips))
    if (val !== undefined && val !== null && val !== "") q[k] = String(val);
  if (after) {
    q.after_key = after.key;
    q.after_id = after.id;
  }
  return q;
}
