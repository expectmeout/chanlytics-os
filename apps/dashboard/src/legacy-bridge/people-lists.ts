/**
 * Saved lists, the verbs: `window.__lists`.
 *
 * The lists themselves ride the People surface (window.__PEOPLE.saved), so
 * the rail and the profile read them the way they read every other People
 * fact. These five calls change them, and the refresh map re-reads the
 * surface after each lands, so the counts and the chips are the server's,
 * never assumed. Owner or operator on the server; a viewer's click returns
 * the server's refusal.
 */
import { api } from "./api";

export const lists = {
  create: (name: string) => api()("POST segments", { body: { name } }),
  rename: (id: string, name: string) => api()("PUT segments/[id]", { params: { id }, body: { name } }),
  remove: (id: string) => api()("DELETE segments/[id]", { params: { id } }),
  add: (id: string, contactIds: string[]) => api()("PUT segments/[id]", { params: { id }, body: { add: contactIds } }),
  drop: (id: string, contactIds: string[]) => api()("PUT segments/[id]", { params: { id }, body: { remove: contactIds } }),
};

declare global {
  interface Window {
    __lists?: typeof lists;
  }
}

export function installLists(): void {
  window.__lists = lists;
}
