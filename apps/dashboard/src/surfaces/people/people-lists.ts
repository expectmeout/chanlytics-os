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
import {
  PEOPLE_LISTS,
  TODAY_PINS_MAX,
  pinTokens,
  todayPins,
  togglePin,
  listMembers,
  listRuleParts,
  listRuleWhy,
  type ListRule,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import type { ApiResult, Output } from "@/client/api";
import { surfaceValue } from "../surface-values";
import { saveView } from "./people-detail";
import { viewerId } from "./surface";

/** The People surface, as the verbs read it: its rows, and each saved list's name and parsed rule (surface-values.ts). */
const peopleSurface = () => surfaceValue("people");

/** The People surface as Today's pins read it: its lists, its saved lists, and this member's views. */
const pinSurface = () => surfaceValue("people");

/** How many people one request puts on a list (the route's LIST_BATCH_MAX). */
const LIST_ADD_PART = 500;

export const lists = {
  create: (name: string, rule: ListRule | null = null) =>
    api()("POST segments", { body: rule ? { name, rule } : { name } }),
  /** A smart list drafted from the owner's words: a name, a rule and what it could not say. Nothing is saved. */
  draft: (words: string) => api()("POST segments/draft", { body: { words } }),
  /** A smart list's rule in the chips its page shows. */
  parts: listRuleParts,
  /**
   * How many of the people People has read a rule holds for today (lists.ts listMembers); null before People is read,
   * and when the rule can't be counted here (a calendar rule with no calendar read), which is not nobody.
   */
  count: (rule: ListRule): number | null => {
    const P = peopleSurface();
    if (!P) return null;
    const m = listMembers({ ids: [], rule }, P.rows, {
      calendar: P.calendar?.state ?? "none",
      dealsOn: !!P.dealsOn,
      consultFirst: !!P.consultFirst,
      viewer: !!viewerId(),
    });
    return m.state === "ok" ? m.ids.size : null;
  },
  /** A smart list's new rule (decision 0009): who is on it changes, on the ledger; a list kept by hand takes none. */
  setRule: (id: string, rule: ListRule) => api()("PUT segments/[id]", { params: { id }, body: { rule } }),
  /**
   * The rule behind a view of People, for a list that keeps itself current instead of freezing who is shown today:
   * one of People's lists (its rule, which the owner may then change), one of the workspace's smart lists (a copy of
   * its rule), or the standing filter (Needs you, Waiting on you). Null for a view no rule says: a list kept by hand, a
   * search, the other states.
   */
  ruleOf: (view: { builtin?: string | null; saved?: string | null; standing?: string | null }): ListRule | null => {
    if (view.builtin) return PEOPLE_LISTS.find((l) => l.id === view.builtin)?.rule ?? null;
    if (view.saved) return peopleSurface()?.saved?.find((s) => s.id === view.saved)?.spec ?? null;
    if (view.standing === "needs_you" || view.standing === "waiting_on_you")
      return { v: 2, all: [{ field: "standing", op: "is", value: view.standing }] };
    return null;
  },
  /**
   * Why a smart list of the workspace's own has this person, in its rule's words (contracts listRuleWhy): the profile's
   * line for the chip. Null when either is not on the page People read.
   */
  why: (savedId: string, personId: string): string | null => {
    const P = peopleSurface();
    const spec = P?.saved?.find((s) => s.id === savedId)?.spec;
    const row = P?.rows.find((r) => r.id === personId);
    if (!spec || !row) return null;
    const name = (token: string) => {
      const at = token.indexOf(":");
      const id = token.slice(at + 1);
      return token.startsWith("list:")
        ? (P?.saved?.find((s) => s.id === id)?.name ?? null)
        : (PEOPLE_LISTS.find((l) => l.id === id)?.label ?? null);
    };
    return listRuleWhy(spec, row, name);
  },
  /** The lists this member pinned to Today (contracts todayPins), over the People surface; none before it is read. */
  pinned: (): ReturnType<typeof todayPins> => {
    const P = pinSurface();
    return P ? todayPins(P.views?.today, P) : [];
  },
  /** Whether a list (by its token) is pinned to Today. */
  isPinned: (token: string): boolean =>
    pinTokens(pinSurface()?.views?.today).some((t) => t.toLowerCase() === token.toLowerCase()),
  /**
   * A list pinned to Today, or unpinned: this member's Today view, saved (saveView, memberships.views). Said
   * at once on the surface's copy, and put back when the save is refused. Never over views that could not be read (a
   * save replaces the whole view, and would wipe the pins not shown), and never past TODAY_PINS_MAX: a pin to a list
   * that isn't here any more makes room first; a live one is never dropped.
   */
  pin: async (token: string): Promise<{ ok: boolean; message?: string }> => {
    const P = pinSurface();
    if (!P) return { ok: false, message: "Pins are kept once People has been read." };
    if (P.viewsRead === false)
      return {
        ok: false,
        message: "Today's lists couldn't be read just now, so they can't change. Try again in a moment.",
      };
    const before = P.views?.today;
    const live = new Set(todayPins(before, P).map((p) => p.token.toLowerCase()));
    const kept = pinTokens(before);
    const roomy = kept.length >= TODAY_PINS_MAX ? { pins: kept.filter((t) => live.has(t.toLowerCase())) } : before;
    const next = togglePin(roomy, token);
    if (!next) return { ok: false, message: `Today keeps ${TODAY_PINS_MAX} lists. Take one off first.` };
    const views = (P.views ??= {});
    views.today = next;
    const r = await saveView("today", next);
    if (!r.ok) views.today = before;
    return r;
  },
  rename: (id: string, name: string) => api()("PUT segments/[id]", { params: { id }, body: { name } }),
  /** Deleted, or archived when a playbook or another list depends on it (the answer says which, and what paused). */
  remove: (id: string) => api()("DELETE segments/[id]", { params: { id } }),
  /** An archived list back on People's rail (00169). */
  restore: (id: string) => api()("PUT segments/[id]", { params: { id }, body: { archived: false } }),
  /**
   * People onto a list, in parts of LIST_ADD_PART: the route takes at most 500 at a time, and a selection past that is
   * not refused, it is sent in turns. The first refusal stops the rest and is the answer.
   */
  add: async (id: string, contactIds: string[]) => {
    let last: ApiResult<Output<"PUT segments/[id]">> | null = null;
    for (let at = 0; at < Math.max(1, contactIds.length); at += LIST_ADD_PART) {
      last = await api()("PUT segments/[id]", {
        params: { id },
        body: { add: contactIds.slice(at, at + LIST_ADD_PART) },
      });
      if (!last.ok) return last;
    }
    return last!;
  },
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
