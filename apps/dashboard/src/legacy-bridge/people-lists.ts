/**
 * Saved lists, the verbs: `window.__lists`.
 *
 * The lists themselves ride the People surface (window.__PEOPLE.saved), so
 * the rail and the profile read them the way they read every other People
 * fact. These five calls change them, and the refresh map re-reads the
 * surface after each lands, so the counts and the chips are the server's,
 * never assumed. Owner or operator on the server; a viewer's click returns
 * the server's refusal. A smart list is made the same way with its rule,
 * drafted first from the owner's own words (draft, which changes nothing).
 */
import { listRuleParts, savedListIds, type ListRule, type PersonRowVM } from "@chanlytics/contracts";
import { api } from "./api";

export const lists = {
  create: (name: string, rule: ListRule | null = null) =>
    api()("POST segments", { body: rule ? { name, rule } : { name } }),
  /** A smart list drafted from the owner's words: a name, a rule and what it could not say. Nothing is saved. */
  draft: (words: string) => api()("POST segments/draft", { body: { words } }),
  /** A smart list's rule in the chips its page shows. */
  parts: listRuleParts,
  /** How many of the people People has read a rule holds for today (savedListIds); null before People is read. */
  count: (rule: ListRule): number | null => {
    const P = (window as unknown as { __PEOPLE?: { rows: PersonRowVM[]; calendar?: { state: string } } }).__PEOPLE;
    return P ? savedListIds({ ids: [], rule }, P.rows, Date.now(), P.calendar?.state === "ok").size : null;
  },
  rename: (id: string, name: string) => api()("PUT segments/[id]", { params: { id }, body: { name } }),
  remove: (id: string) => api()("DELETE segments/[id]", { params: { id } }),
  add: (id: string, contactIds: string[]) => api()("PUT segments/[id]", { params: { id }, body: { add: contactIds } }),
  drop: (id: string, contactIds: string[]) =>
    api()("PUT segments/[id]", { params: { id }, body: { remove: contactIds } }),
};

declare global {
  interface Window {
    __lists?: typeof lists;
  }
}

export function installLists(): void {
  window.__lists = lists;
}
