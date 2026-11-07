/** Chrome: frame. */

import type { ModelStanding } from "../../ai/anthropic-enforcement";
import { WORKSPACE_PAUSED } from "../../lines/caller-gets";
import { PAUSED_WORDS } from "../../workspace/billing/plans";
import { roleSays } from "../../config/workspace-config/role-perms";

/** Whether a key press belongs to a field the person is typing in. */
export function isTypingTarget(tagName: string | null | undefined, contentEditable: boolean): boolean {
  const t = (tagName ?? "").toUpperCase();
  return contentEditable || t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
}

/** A crumb as the shell draws it: words, or words and the route they open. */
export type Crumb = string | { label: string; to?: string | null };

/**
 * The browser tab's name: where you are, most particular first, then the
 * product -- "Rosa · Inbox · Chanlytics" -- because a narrow tab keeps only its
 * first words, and those are what tell a row of tabs apart. What needs you is
 * counted in front, so a tab in the background still says someone is waiting.
 */
export function pageTitle(crumbs: readonly Crumb[] | null | undefined, needs?: number | null): string {
  const words = (crumbs ?? [])
    .map((c) => (typeof c === "string" ? c : (c?.label ?? "")).trim())
    .filter(Boolean)
    .reverse();
  const where = [...words, "Chanlytics"].join(" · ");
  const n = Math.floor(Number(needs));
  return n > 0 ? `(${n}) ${where}` : where;
}

/**
 * The line in the top bar's middle on a desk (the page heads canvas, H2, 31 Oct 2026): one line to search the page's list
 * or ask. While it is empty it says what it searches where the page has a list to search, and that the words can be asked
 * about, else Ask's own name; its one button asks. No page's name: the sidebar's row says it (Ruben, 1 Oct 2026).
 */
export const BAR_LINE_WORDS = {
  ask: "Ask Chanlytics",
  send: "Ask",
  people: "Search people, or ask about them",
  leads: "Search leads, or ask about them",
  pipeline: "Search deals, or ask about them",
  inbox: "Search the inbox, or ask about it",
  conversations: "Search conversations, or ask about them",
  campaigns: "Search campaigns, or ask about them",
  messages: "Search messages, or ask about them",
} as const;

/** What a public page's tab and search listing say about it: the fields of Next's metadata those pages set. */
export interface PublicPageMetadata {
  title: string;
  description?: string;
  robots: { index: boolean; follow: boolean };
}

/**
 * A public page with nothing to show: named Not found, like the app's own not-found page, and never indexed. A page
 * that named nothing before it called notFound() left the tab on the app's title (the wiring audit's N21).
 */
export function notFoundPageMetadata(): PublicPageMetadata {
  return { title: pageTitle(["Not found"]), robots: { index: false, follow: false } };
}

/** What the shell knows that the page does not: the connection, the live feed, a pause, a newer build, surfaces that stopped refreshing. */
export interface ShellStatus {
  stale: boolean;
  degraded: string[];
  /** The workspace is paused (billing stopped): a call is answered only to take a message and every other message waits in the Inbox (PAUSED_WORDS), until Billing resumes it. */
  paused?: boolean;
  /**
   * What Anthropic has said of this workspace's profile (decision 0097): "paused", and its receptionist holds every message
   * for a person; "limited", and it holds those Anthropic refuses.
   */
  modelStanding?: ModelStanding | null;
  /** This device has no connection: nothing on screen is kept current, and nothing pressed reaches the workspace. */
  offline?: boolean;
  /** The live feed dropped and did not come back within its grace: the page is current only as of its last read. */
  disconnected?: boolean;
  /** The role an owner is previewing the app as (Settings › Team, Preview as); null or absent when they are themself. */
  previewing?: string | null;
}

export interface ShellStatusLine {
  kind: "offline" | "paused" | "preview" | "stale" | "degraded" | "disconnected";
  /** How loud: danger when customers are affected, warn when this screen is, info when nothing is lost. */
  tone: "danger" | "warn" | "info";
  text: string;
  /** What it means for the person, when the line alone would leave them guessing. */
  detail: string | null;
  action: "reload" | "billing" | "retry" | "exit-preview" | null;
  /** The press's words, and its words while it works. */
  cta: string | null;
  busy: string | null;
}

/** "Inbox", "Inbox and Calendar", "Inbox, Calendar and Calls". */
function namesAnd(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The one line the shell shows over the page, or nothing: one thing at a time,
 * in the order that matters. Offline first: while nothing reaches the
 * workspace, nothing else the line could offer would work. Then a pause, which
 * reaches the customers. Then an owner's preview of a narrower role: controls
 * are missing on every page while it is on, and without the line nothing
 * outside Settings › Team said why. Then a newer build, which a reload fixes
 * along with anything stale. Then surfaces that stopped refreshing, and last
 * the live feed, which only delays what the next read shows.
 */
export function shellStatusLine(shellStatus: ShellStatus | null | undefined): ShellStatusLine | null {
  if (!shellStatus) return null;
  if (shellStatus.offline)
    return {
      kind: "offline",
      tone: "warn",
      text: "You're offline",
      detail: "What's on screen may be out of date. It catches up when you're back online.",
      action: null,
      cta: null,
      busy: null,
    };
  if (shellStatus.paused)
    return {
      kind: "paused",
      tone: WORKSPACE_PAUSED.tone,
      text: "Your receptionist is paused",
      detail: PAUSED_WORDS,
      action: "billing",
      cta: "Billing",
      busy: null,
    };
  if (shellStatus.modelStanding === "paused")
    return {
      kind: "paused",
      tone: WORKSPACE_PAUSED.tone,
      text: "Your receptionist is paused",
      detail:
        "It sends a holding reply and hands each new message to you in the Inbox. Write to support and we'll sort it out.",
      action: null,
      cta: null,
      busy: null,
    };
  if (shellStatus.modelStanding === "limited")
    return {
      kind: "degraded",
      tone: "warn",
      text: "Your receptionist is limited",
      detail:
        "It may send a holding reply and hand some messages to you in the Inbox. Write to support and we'll sort it out.",
      action: null,
      cta: null,
      busy: null,
    };
  if (shellStatus.previewing) {
    const one = roleSays(shellStatus.previewing).one;
    return {
      kind: "preview",
      tone: "info",
      text: `Previewing as ${one}`,
      detail: `Controls ${one} wouldn't have are hidden. Your own access hasn't changed.`,
      action: "exit-preview",
      cta: "Exit preview",
      busy: null,
    };
  }
  if (shellStatus.stale)
    return {
      kind: "stale",
      tone: "info",
      text: "A newer version is ready",
      detail: null,
      action: "reload",
      cta: "Reload",
      busy: null,
    };
  if (shellStatus.degraded.length)
    return {
      kind: "degraded",
      tone: "warn",
      text: `${namesAnd(shellStatus.degraded)} stopped refreshing`,
      detail: "You're seeing what was last loaded.",
      action: "retry",
      cta: "Retry",
      busy: "Retrying…",
    };
  if (shellStatus.disconnected)
    return {
      kind: "disconnected",
      tone: "info",
      text: "Live updates aren't coming through",
      detail: "Reconnecting. Until then, refresh to see anything new.",
      action: "retry",
      cta: "Refresh now",
      busy: "Refreshing…",
    };
  return null;
}

export interface Shortcut {
  group: string;
  keys: string[];
  does: string;
}

/**
 * Every shortcut the app answers to, in the order the sheet lists them, under the page that answers it. "/" and J/K
 * were listed for every list (the wiring audit's N17): "/" searches only People, and J/K walk only People's rows and
 * the Inbox's. The sheet is the one place a key is drawn (Ruben, 23 Sep 2026): no button, tip, foot or legend names
 * one, so a key the app answers to is here or nowhere. The Calendar's, and ⌘↵ in the record kit's editors, were said
 * only where they worked until then.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  { group: "Everywhere", keys: ["⌘K"], does: "Ask Chanlytics" },
  { group: "Everywhere", keys: ["⌘B"], does: "Collapse or expand the sidebar" },
  { group: "Everywhere", keys: ["⌘1", "⌘9"], does: "Switch to the first to ninth workspace" },
  { group: "Everywhere", keys: ["?"], does: "This sheet" },
  { group: "Everywhere", keys: ["Esc"], does: "Close what is open" },
  // The record kit's fold, sheet and inline editor (record-fold.jsx recKeys): Business, a person, a deal, a step.
  { group: "Everywhere", keys: ["⌘↵"], does: "Save the change you are making" },
  // Ask draws no key of its own (the Line, D17): this sheet is where they are listed.
  { group: "Ask", keys: ["↑", "↓"], does: "Walk what is under the line" },
  { group: "Ask", keys: ["↵"], does: "Ask, or open the row" },
  { group: "Ask", keys: ["⌘J"], does: "Earlier conversations" },
  { group: "Ask", keys: ["Space"], does: "Hold on an empty line to talk" },
  { group: "Ask", keys: ["Esc"], does: "Stop an answer, then close" },
  { group: "People", keys: ["/"], does: "Search People" },
  { group: "People", keys: ["J", "K", "↓", "↑"], does: "Next and previous person" },
  { group: "People", keys: ["X", "Space"], does: "Select the person" },
  { group: "People", keys: ["↵"], does: "Open their profile" },
  { group: "People", keys: ["Esc"], does: "Clear the selection" },
  { group: "People", keys: ["F"], does: "Find leads (on Leads)" },
  { group: "People", keys: ["C"], does: "Call the lead under the cursor (on Leads)" },
  { group: "People", keys: ["A"], does: "Do what the lead under the cursor offers (on Leads)" },
  // The pile, on Leads (00426): its rail by key, left to right, and its Undo; drawn nowhere but here.
  { group: "The pile, on Leads", keys: ["A"], does: "Add the lead to its sequence, or keep it" },
  { group: "The pile, on Leads", keys: ["L"], does: "Later: it comes back at the end" },
  { group: "The pile, on Leads", keys: ["N"], does: "Not a fit, or leave it out" },
  { group: "The pile, on Leads", keys: ["Z"], does: "Undo the last" },
  { group: "The pile, on Leads", keys: ["Esc"], does: "Done for now" },
  // A person's page, on a desk (person-real.tsx useWalkKeys): the list they were opened from, walked as its rows are.
  { group: "A person", keys: ["J", "K"], does: "Next and previous person in the list you opened them from" },
  { group: "Inbox", keys: ["J", "K"], does: "Next and previous conversation" },
  { group: "Inbox", keys: ["N"], does: "New conversation" },
  { group: "Inbox", keys: ["A"], does: "Approve the draft" },
  { group: "Inbox", keys: ["D"], does: "Decline it" },
  { group: "Inbox", keys: ["E"], does: "Edit it first" },
  { group: "Inbox", keys: ["⌘↵"], does: "Send" },
  { group: "Calendar", keys: ["←", "→"], does: "Previous and next" },
  { group: "Calendar", keys: ["T"], does: "Back to today" },
];

/** The sheet's groups, in order, each with its shortcuts. */
export function shortcutGroups(list: readonly Shortcut[] = SHORTCUTS): Array<{ group: string; items: Shortcut[] }> {
  const out: Array<{ group: string; items: Shortcut[] }> = [];
  for (const s of list) {
    const g = out.find((x) => x.group === s.group);
    if (g) g.items.push(s);
    else out.push({ group: s.group, items: [s] });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * The toast: one tone vocabulary for everything the shell flashes.
 *
 * A toast's words are the page's; whether they are good news, a note, a
 * warning or a failure is a tone, and the tone decides the icon, its colour,
 * how long it stays and whether a screen reader is interrupted for it. Every
 * toast used to wear a green check, failures included -- an owner could not
 * tell "saved" from "not saved" without reading it. Decided here so the pages
 * agree and a test can run it; the hook in data-bits.jsx only draws it.
 * ------------------------------------------------------------------------- */
export type ToastTone = "ok" | "info" | "warn" | "danger";

export const TOAST_TONES: readonly ToastTone[] = ["ok", "info", "warn", "danger"];

/**
 * How long a toast stays, by tone: three seconds to read a confirmation or a note, four for a warning or a failure.
 * A toast is taken away by a tap anywhere besides it (the hook's), so these are for the toast nobody answers, and none
 * stays past TOAST_MAX_MS (Ruben, 18 Oct 2026: on a phone six to fifteen seconds stood over the page's foot well after
 * it was read; then "even shorter like 3 seconds and max 4 seconds").
 */
export const TOAST_MS: Readonly<Record<ToastTone, number>> = { ok: 3000, info: 3000, warn: 4000, danger: 4000 };

/**
 * A toast with something to press (an Undo, an act, a link) stays long enough to reach for it. Every Undo but a send's
 * is a second call the other way, open as long as the page is, so its toast is a shortcut and not the undo's window.
 */
export const TOAST_UNDO_MS = 4000;

/**
 * The most any toast stays, a caller's own `ms` included. A send's Undo (the reply's and a new conversation's, whose
 * window is SEND_GRACE_MS in core) is offered for this long too: the send can still be stopped for the rest of its
 * window, and the toast says it goes in so many seconds; it is the shortcut that goes, nothing that lies.
 */
export const TOAST_MAX_MS = 4000;

/** The least a toast may stay: a window that is nearly over is still read. */
export const TOAST_MIN_MS = 2_000;

export const TOAST_ICONS: Readonly<Record<ToastTone, string>> = {
  ok: "check",
  info: "info",
  warn: "alert",
  danger: "error",
};

export interface ToastShape {
  tone: ToastTone;
  icon: string;
  /** A failure interrupts a screen reader; everything else waits its turn. */
  role: "status" | "alert";
  ms: number;
  /** A send's cancel window: a tap besides it does not take it away, only its Undo, a swipe, Escape or its time. */
  stays: boolean;
}

export function toastShape(params: {
  tone?: unknown;
  icon?: unknown;
  undo?: unknown;
  action?: unknown;
  links?: unknown;
  ms?: unknown;
  stays?: unknown;
}): ToastShape {
  const tone: ToastTone = (TOAST_TONES as readonly unknown[]).includes(params.tone) ? (params.tone as ToastTone) : "ok";
  const request = typeof params.ms === "number" && Number.isFinite(params.ms) && params.ms > 0 ? params.ms : null;
  const presses = !!params.undo || !!params.action || (Array.isArray(params.links) && params.links.length > 0);
  const ms = Math.min(
    TOAST_MAX_MS,
    Math.max(TOAST_MIN_MS, Math.round(request ?? (presses ? Math.max(TOAST_UNDO_MS, TOAST_MS[tone]) : TOAST_MS[tone]))),
  );
  return {
    tone,
    icon: typeof params.icon === "string" && params.icon ? params.icon : TOAST_ICONS[tone],
    role: tone === "danger" ? "alert" : "status",
    ms,
    // Only an Undo is worth keeping through a tap besides: a toast that stays with nothing to press is one in the way.
    stays: params.stays === true && !!params.undo,
  };
}
