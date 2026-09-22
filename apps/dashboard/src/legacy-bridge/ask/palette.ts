/**
 * What the palette shows before a model is asked, from what the browser
 * already holds: the jump index, the suggestions, the bell's rows, the
 * three quick answers, the scope of the current route, the language, and
 * the shape of an answer (what to open, what it read, what to ask next).
 * Every rule is the contract's; this module only feeds it the surfaces.
 */
import {
  ASK_PAGES,
  askJump,
  buildAskSuggestions,
  citationsToShow,
  detectLanguage,
  fastPath,
  followupsToShow,
  navigateLabel,
  sameQuestion,
  scopeFromRoute,
  zoneDayKey,
  type AskLanguage,
  type AskMessageVM,
  type AskScope,
  type AskSuggestion,
  type AskSurface,
  type FastPath,
  type JumpEntry,
  type NotificationItem,
} from "@chanlytics/contracts";
import { feedFromGlobals } from "../notifications";
import type { Workspace } from "../surface-data";

interface Call {
  callId: string;
  who: string;
  missed: boolean;
  live: boolean;
  startedAtMs: number | null;
}

export interface PaletteGlobals {
  INBOX_DATA?: { THREADS?: Array<{ id: string; real?: boolean; who: string; needsYou?: boolean }> };
  __LIVE?: { now?: Call[]; recent?: Call[] };
  __PEOPLE?: { rows?: Array<{ id: string; name: string }> } | null;
  __SETTINGS?: { config?: { calendar?: { ical_url?: string } } | null } | null;
  __WORKSPACES?: Workspace[];
  __ACTIVE_WORKSPACE?: string | null;
  __ME?: { role?: string | null } | null;
  __TEAM_INVITES?: unknown[] | null;
}

const LAST_LANGUAGE_KEY = "chanlytics:ask:lang";

export function surfaceFor(page: string): AskSurface {
  switch (page) {
    case "today":
      return "today";
    case "inbox":
      return "inbox";
    case "clients":
      return "people";
    case "conversations":
      return "conversations";
    case "live":
      return "live";
    case "reports":
      return "reports";
    case "admin":
      return "settings";
    default:
      return "other";
  }
}

export function jumpIndexFrom(win: Window): JumpEntry[] {
  const w = win as unknown as PaletteGlobals;
  const out: JumpEntry[] = [...ASK_PAGES];
  for (const t of w.INBOX_DATA?.THREADS ?? []) {
    if (!t.real) continue;
    out.push({
      label: `${t.who} — thread`,
      to: `inbox/${t.id}`,
      kind: "thread",
      sub: t.needsYou ? "needs you" : undefined,
    });
  }
  for (const p of w.__PEOPLE?.rows ?? []) out.push({ label: p.name, to: `clients/${p.id}`, kind: "person" });
  for (const c of [...(w.__LIVE?.now ?? []), ...(w.__LIVE?.recent ?? [])]) {
    out.push({
      label: `${c.who} — call`,
      to: `conversations/cv-${c.callId}`,
      kind: "call",
      sub: c.live ? "live" : c.missed ? "missed" : undefined,
    });
  }
  return out;
}

/** What an answer shows, decided once: the Open button, the sources minus it, the next questions minus echoes. */
export function shapeAnswer(m: AskMessageVM, language: AskLanguage) {
  const nav = m.navigate && m.navigate.to ? m.navigate : null;
  return {
    open: nav ? { to: nav.to, label: navigateLabel(nav, language) ?? "Open" } : null,
    citations: citationsToShow(m.citations ?? [], nav),
    followups: followupsToShow(m.followups ?? [], m.citations ?? [], nav),
  };
}

export function askPalette(win: Window, storage: Storage | null) {
  const w = win as unknown as PaletteGlobals;
  const rememberLanguage = (l: AskLanguage) => {
    if (l === "other") return;
    try {
      storage?.setItem(LAST_LANGUAGE_KEY, l);
    } catch {
      /* fine */
    }
  };
  const lastLanguage = (): AskLanguage => {
    try {
      return storage?.getItem(LAST_LANGUAGE_KEY) === "es" ? "es" : "en";
    } catch {
      return "en";
    }
  };
  const activeWorkspace = (): Workspace | null => {
    const id = w.__ACTIVE_WORKSPACE ?? null;
    return (w.__WORKSPACES ?? []).find((x) => x.id === id) ?? null;
  };
  const calls = () => [...(w.__LIVE?.now ?? []), ...(w.__LIVE?.recent ?? [])];
  const rightNow = (): NotificationItem[] => feedFromGlobals(w as Parameters<typeof feedFromGlobals>[0], Date.now());
  const language = (text?: string): AskLanguage => {
    if (!text) return lastLanguage();
    const l = detectLanguage(text);
    return l === "other" ? lastLanguage() : l;
  };
  return {
    jumpIndex: () => jumpIndexFrom(win),
    jump: (query: string) => askJump(query, jumpIndexFrom(win)),
    rightNow,
    suggestions: (surface: AskSurface, scope: AskScope | null, lang?: AskLanguage): AskSuggestion[] => {
      const feed = rightNow();
      // The business's today (clock.ts): a call missed at 1 AM where the business is counts as that day's, whatever day the browser says.
      const tz = activeWorkspace()?.timezone ?? null;
      const today = tz ? zoneDayKey(Date.now(), tz) : null;
      return buildAskSuggestions({
        surface,
        language: lang ?? lastLanguage(),
        needsYou: feed.filter((i) => i.kind === "needs_you").length,
        heldDrafts: feed.filter((i) => i.kind === "held_draft").length,
        missedToday: tz
          ? calls().filter((c) => c.missed && c.startedAtMs && zoneDayKey(c.startedAtMs, tz) === today).length
          : 0,
        liveNow: calls().filter((c) => c.live).length,
        hasCalendar: !!w.__SETTINGS?.config?.calendar?.ical_url,
        scope,
        canAct: w.__ME?.role === "owner" || w.__ME?.role === "operator",
      });
    },
    fast: (question: string): FastPath =>
      fastPath(question, {
        feed: rightNow(),
        calls: calls(),
        now: Date.now(),
        language: language(question),
        timezone: activeWorkspace()?.timezone ?? null,
      }),
    scopeFor: (page: string, param: string | null, label?: string | null) => scopeFromRoute(page, param, label),
    surfaceFor,
    language,
    rememberLanguage,
    timezone: () => activeWorkspace()?.timezone ?? null,
    shape: shapeAnswer,
    sameQuestion,
  };
}
