/**
 * The chrome's own words and rules: the theme, the sidebar's two states, the
 * workspace hotkeys, the one status line the shell owes the person, and the
 * shortcuts sheet. Pure, so the sidebar, the shell and a test read the same
 * thing.
 */

export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_OPTIONS: ReadonlyArray<{ id: ThemePref; label: string; icon: string }> = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "System", icon: "monitor" },
];

export const isThemePref = (v: unknown): v is ThemePref => v === "light" || v === "dark" || v === "system";

/**
 * The preference after this one, in THEME_OPTIONS' order, so the top bar's one button reaches all three. It flipped
 * the resolved theme between light and dark, so System could not be chosen there and a press dropped it (the wiring
 * audit's N19). An unknown preference reads as System, so the next is the first.
 */
export function nextThemePref(pref: unknown): ThemePref {
  const at = THEME_OPTIONS.findIndex((o) => o.id === pref);
  return (THEME_OPTIONS[(at + 1) % THEME_OPTIONS.length] as (typeof THEME_OPTIONS)[number]).id;
}

/** What the top bar's theme button shows and says: the preference in force, and what a press makes it. */
export function themeButtonWords(pref: unknown): { icon: string; label: string } {
  const now = THEME_OPTIONS.find((o) => o.id === pref) ?? (THEME_OPTIONS[2] as (typeof THEME_OPTIONS)[number]);
  const next = THEME_OPTIONS.find((o) => o.id === nextThemePref(now.id)) as (typeof THEME_OPTIONS)[number];
  return { icon: now.icon, label: `Theme: ${now.label}. Switch to ${next.label}` };
}

/** What the page paints: a chosen theme, or the device's when the choice is "system". */
export function resolveTheme(pref: unknown, systemDark: boolean): Theme {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}

/** The preference of a device that has chosen nothing, or holds one this build no longer knows. */
export const DEFAULT_THEME_PREF: ThemePref = "dark";

/** A device's stored preference as the app keeps it: anything unknown is the default, never System. */
export const themePrefOf = (stored: unknown): ThemePref => (isThemePref(stored) ? stored : DEFAULT_THEME_PREF);

/** Where this device keeps its preferences, the theme among them (LegacyApp.tsx loadPrefs). */
export const DEVICE_PREFS_STORAGE = "chanlytics-os-prefs";

/**
 * The theme before first paint: a script for the document's head, run before anything is drawn. The document used
 * to come down with data-theme="dark" hard-coded and be corrected in an effect after the bundle had mounted, so a
 * light-theme workspace opened dark and flipped on every refresh. This is themePrefOf then resolveTheme, spelled once
 * more where an import cannot reach; theme-boot.test.mjs runs it against them for everything a device could hold
 * and both device settings. A storage that refuses or a window with no matchMedia stamps the app's own theme.
 */
export function themeBootScript(): string {
  const known = JSON.stringify(THEME_OPTIONS.map((o) => o.id));
  return [
    "try{",
    `var p=${JSON.stringify(DEFAULT_THEME_PREF)};`,
    `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(DEVICE_PREFS_STORAGE)})||"{}");if(s&&${known}.indexOf(s.theme)>=0)p=s.theme}catch(e){}`,
    'var d=!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);',
    'document.documentElement.dataset.theme=p==="system"?(d?"dark":"light"):p;',
    "}catch(e){}",
  ].join("");
}

export type SidebarPref = "open" | "rail";
export const isSidebarPref = (v: unknown): v is SidebarPref => v === "open" || v === "rail";

/** ⌘1 … ⌘9 for the first nine workspaces; none beyond. */
export function workspaceHotkey(index: number): string | null {
  return Number.isInteger(index) && index >= 0 && index < 9 ? `⌘${index + 1}` : null;
}

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
  /** The workspace is paused (billing stopped): the receptionist answers nothing until Billing resumes it. */
  paused?: boolean;
  /** This device has no connection: nothing on screen is kept current, and nothing pressed reaches the workspace. */
  offline?: boolean;
  /** The live feed dropped and did not come back within its grace: the page is current only as of its last read. */
  disconnected?: boolean;
}

export interface ShellStatusLine {
  kind: "offline" | "paused" | "stale" | "degraded" | "disconnected";
  /** How loud: danger when customers are affected, warn when this screen is, info when nothing is lost. */
  tone: "danger" | "warn" | "info";
  text: string;
  /** What it means for the person, when the line alone would leave them guessing. */
  detail: string | null;
  action: "reload" | "billing" | "retry" | null;
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
 * reaches the customers. Then a newer build, which a reload fixes along with
 * anything stale. Then surfaces that stopped refreshing, and last the live
 * feed, which only delays what the next read shows.
 */
export function shellStatusLine(s: ShellStatus | null | undefined): ShellStatusLine | null {
  if (!s) return null;
  if (s.offline)
    return {
      kind: "offline",
      tone: "warn",
      text: "You're offline",
      detail: "What's on screen may be out of date. It catches up when you're back online.",
      action: null,
      cta: null,
      busy: null,
    };
  if (s.paused)
    return {
      kind: "paused",
      tone: "danger",
      text: "Your receptionist is paused",
      detail: "New messages still land in the Inbox, for you to answer.",
      action: "billing",
      cta: "Billing",
      busy: null,
    };
  if (s.stale)
    return {
      kind: "stale",
      tone: "info",
      text: "A newer version is ready",
      detail: null,
      action: "reload",
      cta: "Reload",
      busy: null,
    };
  if (s.degraded.length)
    return {
      kind: "degraded",
      tone: "warn",
      text: `${namesAnd(s.degraded)} stopped refreshing`,
      detail: "You're seeing what was last loaded.",
      action: "retry",
      cta: "Retry",
      busy: "Retrying…",
    };
  if (s.disconnected)
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
 * the Inbox's. People's rows are the keys its table's foot names.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  { group: "Everywhere", keys: ["⌘K"], does: "Ask Chanlytics" },
  { group: "Everywhere", keys: ["⌘B"], does: "Collapse or expand the sidebar" },
  { group: "Everywhere", keys: ["⌘1", "⌘9"], does: "Switch to the first to ninth workspace" },
  { group: "Everywhere", keys: ["?"], does: "This sheet" },
  { group: "Everywhere", keys: ["Esc"], does: "Close what is open" },
  { group: "People", keys: ["/"], does: "Search People" },
  { group: "People", keys: ["J", "K", "↓", "↑"], does: "Next and previous person" },
  { group: "People", keys: ["X", "Space"], does: "Select the person" },
  { group: "People", keys: ["↵"], does: "Open their profile" },
  { group: "People", keys: ["Esc"], does: "Clear the selection" },
  { group: "People", keys: ["F"], does: "Find leads (on Leads)" },
  { group: "People", keys: ["C"], does: "Call the lead under the cursor (on Leads)" },
  { group: "Inbox", keys: ["J", "K"], does: "Next and previous conversation" },
  { group: "Inbox", keys: ["A"], does: "Approve the draft" },
  { group: "Inbox", keys: ["D"], does: "Decline it" },
  { group: "Inbox", keys: ["E"], does: "Edit it first" },
  { group: "Inbox", keys: ["⌘↵"], does: "Send" },
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

/** How long a toast stays, by tone: long enough to read, and a failure longer than a confirmation. */
export const TOAST_MS: Readonly<Record<ToastTone, number>> = { ok: 6000, info: 6000, warn: 8000, danger: 10000 };

/**
 * A toast with an Undo lives as long as the undo does. Fifteen seconds is the
 * reply's cancel window (SEND_GRACE_MS in core, the one real window the
 * product has); an Undo that outlived its window would lie, and one that died
 * before it would waste it. A caller that knows its exact window passes `ms`.
 */
export const TOAST_UNDO_MS = 15_000;

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
}

export function toastShape(p: { tone?: unknown; icon?: unknown; undo?: unknown; ms?: unknown }): ToastShape {
  const tone: ToastTone = (TOAST_TONES as readonly unknown[]).includes(p.tone) ? (p.tone as ToastTone) : "ok";
  const asked = typeof p.ms === "number" && Number.isFinite(p.ms) && p.ms > 0 ? p.ms : null;
  const ms = Math.max(
    TOAST_MIN_MS,
    Math.round(asked ?? (p.undo ? Math.max(TOAST_UNDO_MS, TOAST_MS[tone]) : TOAST_MS[tone])),
  );
  return {
    tone,
    icon: typeof p.icon === "string" && p.icon ? p.icon : TOAST_ICONS[tone],
    role: tone === "danger" ? "alert" : "status",
    ms,
  };
}
