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

/** What the page paints: a chosen theme, or the device's when the choice is "system". */
export function resolveTheme(pref: unknown, systemDark: boolean): Theme {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
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

/** What the shell knows that the page does not: a newer build, surfaces that stopped refreshing. */
export interface ShellStatus {
  stale: boolean;
  degraded: string[];
  /** The workspace is paused (billing stopped): nothing is answered until Billing resumes it. */
  paused?: boolean;
}

/** The one line the sidebar's foot shows, or nothing. A pause outranks everything: nothing is answered until Billing resumes it. Then a new build outranks stale surfaces: refreshing fixes both. */
export function shellStatusLine(s: ShellStatus | null | undefined): { text: string; action: "reload" | "billing" | null } | null {
  if (!s) return null;
  if (s.paused) return { text: "Your receptionist is paused", action: "billing" };
  if (s.stale) return { text: "A newer version is ready", action: "reload" };
  if (s.degraded.length) return { text: `${s.degraded.join(", ")} not refreshing`, action: null };
  return null;
}

export interface Shortcut {
  group: string;
  keys: string[];
  does: string;
}

/** Every shortcut the app answers to, in the order the sheet lists them. */
export const SHORTCUTS: readonly Shortcut[] = [
  { group: "Everywhere", keys: ["⌘K"], does: "Ask Chanlytics" },
  { group: "Everywhere", keys: ["⌘B"], does: "Collapse or expand the sidebar" },
  { group: "Everywhere", keys: ["⌘1", "⌘9"], does: "Switch to the first to ninth workspace" },
  { group: "Everywhere", keys: ["?"], does: "This sheet" },
  { group: "Everywhere", keys: ["Esc"], does: "Close what is open" },
  { group: "Lists", keys: ["/"], does: "Search the page" },
  { group: "Lists", keys: ["J", "K"], does: "Next and previous item" },
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
