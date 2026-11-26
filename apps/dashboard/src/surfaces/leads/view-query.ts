/**
 * How a view of Leads is asked of the read: its query for a page (GET leads), and the way the read walks for the way the page
 * says it. Apart from surface.ts, which holds what the tab has read and stands at its file limit.
 */
import type { LeadsView } from "./surface-types";
import type { LeadsQuery } from "@chanlytics/contracts";

/** The most leads one page asks for: leads_page's own limit. */
const LEADS_PAGE = 500;

/** Found's key runs newest first (leads_page), so the read's `asc`, as Ask's tool says it, is the page's newest first, `desc`. */
export const readDir = ({ sort, dir }: { sort: string; dir: "asc" | "desc" }): "asc" | "desc" =>
  sort === "found" ? (dir === "asc" ? "desc" : "asc") : dir;

export function queryOf(v: LeadsView, after?: { key: string; id: string } | null): LeadsQuery {
  const words = v.q ? v.q.trim() : "";
  return {
    list: v.list,
    sort: v.sort,
    dir: readDir(v),
    limit: LEADS_PAGE,
    ...(v.searchId ? { search: v.searchId } : {}),
    ...(v.cls ? { class: v.cls } : {}),
    ...(v.sort === "pile" && v.pileList ? { pile_list: v.pileList } : {}),
    // The box's words, read where the page's filters are (00500): a chip is part of the route, the words are not.
    ...(words ? { q: words } : {}),
    ...chipsAsked(v.chips),
    ...(after ? { after_key: after.key, after_id: after.id } : {}),
  };
}

/** The chips that narrow the view, each one set, in the route's order: an empty name is no chip. */
const chipsAsked = ({ excluded_by, fit, reach, status_group }: LeadsView["chips"]): LeadsView["chips"] => ({
  ...(excluded_by ? { excluded_by } : {}),
  ...(fit ? { fit } : {}),
  ...(reach ? { reach } : {}),
  ...(status_group ? { status_group } : {}),
});
