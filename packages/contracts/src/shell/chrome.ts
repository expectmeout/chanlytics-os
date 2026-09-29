/**
 * The chrome's own words and rules: the theme and the look, the sidebar's two
 * states, the workspace hotkeys, the one status line the shell owes the person,
 * and the shortcuts sheet. Pure, so the sidebar, the shell and a test read the
 * same thing.
 */
import { PAUSED_WORDS } from "../workspace/billing";

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

/**
 * The look: the finish every page is drawn in, the interface kit's second setting beside the theme
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.1 and §3.2). Classic is the app as it is drawn today;
 * Glass is the canvases'. It travels as the theme does: kept on this device in the same stored object, stamped as
 * `data-look` beside `data-theme` before first paint (themeBootScript) and on every change, and chosen in the account
 * menu. It is kept only once chosen, so a device that never chose follows DEFAULT_LOOK_PREF wherever the default goes;
 * nothing resolves it from the device, so the look in force is lookPrefOf of what is kept.
 */
export type LookPref = "classic" | "glass";

export const LOOK_OPTIONS: ReadonlyArray<{ id: LookPref; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "glass", label: "Glass" },
];

export const isLookPref = (v: unknown): v is LookPref => v === "classic" || v === "glass";

/** The look of a device that has chosen nothing, or holds one this build no longer knows. */
export const DEFAULT_LOOK_PREF: LookPref = "classic";

/** A device's stored look as the app keeps it: anything unknown is the default. */
export const lookPrefOf = (stored: unknown): LookPref => (isLookPref(stored) ? stored : DEFAULT_LOOK_PREF);

/**
 * Whether the account menu offers the look to members. Not yet: the menu draws no Look until Glass is drawn (the
 * plan's step 5.5), and a device paints the look it keeps, which is the default unless it was set by hand.
 */
export const LOOK_OFFERED: boolean = false;

/** Where this device keeps its preferences, the theme and the look among them (legacy-bridge/device-prefs.ts). */
export const DEVICE_PREFS_STORAGE = "chanlytics-os-prefs";

/**
 * What the browser paints its own bars with, per theme: each one's paper (tokens.css --bg, as sRGB). The phone's
 * address bar and the tab strip are chrome the page does not draw but does own, and a bar in the other theme's
 * paper reads as a strip of somebody else's app above this one.
 */
export const THEME_COLORS: Readonly<Record<Theme, string>> = { light: "#fbfaf8", dark: "#0c0d0f" };
/**
 * The ink on that paper, per theme (tokens.css --ink, as sRGB): what the native shell draws its own words and tab
 * labels with, beside the page. The two pairs are the shell's whole palette; the page's other tones stay the page's.
 */
export const THEME_INK: Readonly<Record<Theme, string>> = { light: "#161616", dark: "#fbfaf8" };

/** The bars' colour for a resolved theme; anything else is the app's own, as the document's markup says. */
export function themeColorOf(theme: unknown): string {
  return THEME_COLORS[theme === "light" ? "light" : "dark"];
}

/**
 * Where the bars' colour is written. Every match, not the first: React plants a second copy of the meta during
 * hydration whenever the boot script has already changed the one the markup shipped (measured 22 Sep 2026, a light
 * workspace on a dark phone: #fbfaf8 in front and a stale #0c0d0f behind it). A browser reads the first, so the
 * bars were right either way, but a second answer to the same question is one an insertion order can promote.
 */
export const THEME_COLOR_META = 'meta[name="theme-color"]';

/**
 * The theme before first paint: a script for the document's head, run before anything is drawn. The document used
 * to come down with data-theme="dark" hard-coded and be corrected in an effect after the bundle had mounted, so a
 * light-theme workspace opened dark and flipped on every refresh. This is themePrefOf then resolveTheme, spelled once
 * more where an import cannot reach; theme-boot.test.mjs runs it against them for everything a device could hold
 * and both device settings. A storage that refuses or a window with no matchMedia stamps the app's own theme.
 *
 * It paints the browser's bars from the same theme, for the same reason. theme-color was declared against
 * (prefers-color-scheme), which is the DEVICE's setting and not the app's: a member whose app is light on a dark
 * phone got a black strip over a white page for as long as the two disagreed, and nothing ever corrected it. The
 * bars follow the theme the page resolved, here and in the app (paintThemeColor); the meta the markup shipped is
 * what a device running no script keeps, which is the theme that document also keeps. The attribute is stamped
 * before any meta is touched, so a document that somehow has no head still paints in the right theme.
 *
 * The look rides with the theme: the same stored object's `look`, as lookPrefOf reads it, stamped as data-look beside
 * data-theme, so a `[data-look]` rule holds from the first frame rather than from the mount. Each is read on its own:
 * a value one of them does not know leaves the other standing.
 */
export function themeBootScript(): string {
  const known = JSON.stringify(THEME_OPTIONS.map((o) => o.id));
  const looks = JSON.stringify(LOOK_OPTIONS.map((o) => o.id));
  return [
    "try{",
    `var p=${JSON.stringify(DEFAULT_THEME_PREF)},k=${JSON.stringify(DEFAULT_LOOK_PREF)};`,
    `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(DEVICE_PREFS_STORAGE)})||"{}");`,
    `if(s&&${known}.indexOf(s.theme)>=0)p=s.theme;`,
    `if(s&&${looks}.indexOf(s.look)>=0)k=s.look}catch(e){}`,
    'var d=!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);',
    'var t=p==="system"?(d?"dark":"light"):p;',
    "document.documentElement.dataset.theme=t;",
    "document.documentElement.dataset.look=k;",
    `var l=document.querySelectorAll(${JSON.stringify(THEME_COLOR_META)});`,
    'if(!l.length){var m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m);l=[m]}',
    `for(var i=0;i<l.length;i++)l[i].setAttribute("content",${JSON.stringify(THEME_COLORS)}[t]);`,
    "}catch(e){}",
  ].join("");
}

/**
 * The native shell says who it is in its WebView's User-Agent, once: "ChanlyticsApp/1.2.0 (ios)". One regex reads
 * it, here and in the script the document inlines beside the theme's (inAppBootScript), so the two cannot disagree.
 */
export const IN_APP_UA_RE = /ChanlyticsApp\/(\S+)(?:\s*\((ios|android)\))?/i;
export type InAppPlatform = "ios" | "android" | "unknown";
export interface InApp {
  version: string;
  platform: InAppPlatform;
}
export function inAppFrom(userAgent: string | null | undefined): InApp | null {
  const m = IN_APP_UA_RE.exec(userAgent ?? "");
  if (!m) return null;
  const platform = (m[2] ?? "").toLowerCase();
  return { version: m[1], platform: platform === "ios" || platform === "android" ? platform : "unknown" };
}
/** The class on <html> that in-app rules hang from; the legacy shell reads window.__IN_APP for the same fact. */
export const IN_APP_CLASS = "in-app";
/**
 * The class the phone app puts on <html> where it shrinks the page to stand above the keyboard (Android: the app is
 * drawn edge to edge, so the system resizes nothing and the WebView is sized by the app). Such a page never makes room
 * for a keyboard it only expects (data-bits.jsx watchKeyboard): the room would come, then go as the page shrank.
 */
export const APP_KEYS_RESIZE_CLASS = "app-keys-resize";
/** Inline in the document head, before anything paints: the tab bar must never appear for a frame under the native one. */
export function inAppBootScript(): string {
  return [
    "try{",
    `var m=new RegExp(${JSON.stringify(IN_APP_UA_RE.source)},"i").exec(navigator.userAgent||"");`,
    `if(m){document.documentElement.classList.add(${JSON.stringify(IN_APP_CLASS)});`,
    'window.__IN_APP={version:m[1],platform:(m[2]||"unknown").toLowerCase()}}',
    "}catch(e){}",
  ].join("");
}

/** A person's id in the address, as the route reads it (surface-registry personRouteId): a uuid, nothing else. */
const PREFETCH_UUID = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
/** Where the head parks what it started, for the client to take (client/api.ts `prefetched`). */
export const PREFETCH_SLOT = "__prefetched";

/**
 * The route's own reads, started from the document head.
 *
 * Nothing was fetched until the shell had mounted: the HTML, the framework's chunks, hydration, the legacy chunk,
 * the mount, and only then the first request -- 2,033 ms into a cold load of a person's page, on a document whose
 * first byte came at 26 ms (measured on production, 25 Sep 2026). This script runs as the head arrives and starts
 * the two reads every workspace page opens on -- who is looking (GET workspaces) and, on a person's page, the person
 * -- spelled exactly as the client spells them (client/api.ts urlFor: the path, then ?workspace=<slug>), and parks
 * the promises on the window for the client to take once, in place of its own fetch. Off a workspace page nothing
 * is read. A refusal here is the client's to hear, as it would have been.
 */
export function routePrefetchScript(): string {
  return [
    "try{",
    'var p=/^\\/w\\/([^\\/?#]+)/.exec(location.pathname||"");',
    "if(p){",
    "var w=encodeURIComponent(decodeURIComponent(p[1]));",
    'var u=["/api/v1/workspaces?workspace="+w];',
    'var h=(location.hash||"").replace(/^#\\/?/,"").split("/");',
    `if(h[0]==="clients"&&new RegExp(${JSON.stringify(PREFETCH_UUID)},"i").test(h[1]||""))u.push("/api/v1/contacts/"+h[1]+"?workspace="+w);`,
    `var f=window[${JSON.stringify(PREFETCH_SLOT)}]=window[${JSON.stringify(PREFETCH_SLOT)}]||{};`,
    'for(var i=0;i<u.length;i++)if(!f[u[i]])f[u[i]]=fetch(u[i],{credentials:"same-origin"});',
    "}}catch(e){}",
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
      detail: PAUSED_WORDS,
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
