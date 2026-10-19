import { WORKSPACE_PAUSED } from "../lines/caller-gets.js";
import { PAUSED_WORDS } from "../workspace/billing.js";
import { roleSays } from "../config/workspace-config/role-perms.js";
export const THEME_OPTIONS = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "System", icon: "monitor" }
];
export const isThemePref = (v) => v === "light" || v === "dark" || v === "system";
export function nextThemePref(pref) {
  const at = THEME_OPTIONS.findIndex((o) => o.id === pref);
  return (THEME_OPTIONS[(at + 1) % THEME_OPTIONS.length] ?? THEME_OPTIONS[0]).id;
}
export function themeButtonWords(pref) {
  const now = THEME_OPTIONS.find((o) => o.id === pref) ?? THEME_OPTIONS[2];
  const next = THEME_OPTIONS.find((o) => o.id === nextThemePref(now.id));
  return { icon: now.icon, label: `Theme: ${now.label}. Switch to ${next.label}` };
}
export function resolveTheme(pref, systemDark) {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}
export const DEFAULT_THEME_PREF = "dark";
export const themePrefOf = (stored) => isThemePref(stored) ? stored : DEFAULT_THEME_PREF;
export const LOOK_OPTIONS = [{ id: "glass", label: "Glass" }];
export const isLookPref = (v) => v === "glass";
export const DEFAULT_LOOK_PREF = "glass";
export const lookPrefOf = (stored) => isLookPref(stored) ? stored : DEFAULT_LOOK_PREF;
export const LOOK_OFFERED = false;
export const DEVICE_PREFS_STORAGE = "chanlytics-os-prefs";
export const LOOK_THEME_COLORS = {
  glass: { light: "#f1f2f6", dark: "#0f1014" }
};
export const THEME_COLORS = LOOK_THEME_COLORS[DEFAULT_LOOK_PREF];
const LOOK_THEME_INK = {
  glass: { light: "#1b1c20", dark: "#f4f4f6" }
};
export const THEME_INK = LOOK_THEME_INK[DEFAULT_LOOK_PREF];
export function themeColorOf(theme, look = DEFAULT_LOOK_PREF) {
  return LOOK_THEME_COLORS[lookPrefOf(look)][theme === "light" ? "light" : "dark"];
}
export const THEME_COLOR_META = 'meta[name="theme-color"]';
export function themeBootScript() {
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
    `for(var i=0;i<l.length;i++)l[i].setAttribute("content",${JSON.stringify(LOOK_THEME_COLORS)}[k][t]);`,
    "}catch(e){}"
  ].join("");
}
export const IN_APP_UA_RE = /ChanlyticsApp\/(\S+)(?:\s*\((ios|android)\))?/i;
export function inAppFrom(userAgent) {
  const m = IN_APP_UA_RE.exec(userAgent ?? "");
  if (!m) return null;
  const platform = (m[2] ?? "").toLowerCase();
  return { version: m[1] ?? "", platform: platform === "ios" || platform === "android" ? platform : "unknown" };
}
export const IN_APP_CLASS = "in-app";
export const APP_KEYS_RESIZE_CLASS = "app-keys-resize";
export function inAppBootScript() {
  return [
    "try{",
    `var m=new RegExp(${JSON.stringify(IN_APP_UA_RE.source)},"i").exec(navigator.userAgent||"");`,
    `if(m){document.documentElement.classList.add(${JSON.stringify(IN_APP_CLASS)});`,
    'window.__IN_APP={version:m[1],platform:(m[2]||"unknown").toLowerCase()}}',
    "}catch(e){}"
  ].join("");
}
export const isSidebarPref = (v) => v === "open" || v === "rail";
export function isTypingTarget(tagName, contentEditable) {
  const t = (tagName ?? "").toUpperCase();
  return contentEditable || t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
}
export function pageTitle(crumbs, needs) {
  const words = (crumbs ?? []).map((c) => (typeof c === "string" ? c : c?.label ?? "").trim()).filter(Boolean).reverse();
  const where = [...words, "Chanlytics"].join(" \xB7 ");
  const n = Math.floor(Number(needs));
  return n > 0 ? `(${n}) ${where}` : where;
}
export function notFoundPageMetadata() {
  return { title: pageTitle(["Not found"]), robots: { index: false, follow: false } };
}
function namesAnd(names) {
  return names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
export function shellStatusLine(s) {
  if (!s) return null;
  if (s.offline)
    return {
      kind: "offline",
      tone: "warn",
      text: "You're offline",
      detail: "What's on screen may be out of date. It catches up when you're back online.",
      action: null,
      cta: null,
      busy: null
    };
  if (s.paused)
    return {
      kind: "paused",
      tone: WORKSPACE_PAUSED.tone,
      text: "Your receptionist is paused",
      detail: PAUSED_WORDS,
      action: "billing",
      cta: "Billing",
      busy: null
    };
  if (s.previewing) {
    const one = roleSays(s.previewing).one;
    return {
      kind: "preview",
      tone: "info",
      text: `Previewing as ${one}`,
      detail: `Controls ${one} wouldn't have are hidden. Your own access hasn't changed.`,
      action: "exit-preview",
      cta: "Exit preview",
      busy: null
    };
  }
  if (s.stale)
    return {
      kind: "stale",
      tone: "info",
      text: "A newer version is ready",
      detail: null,
      action: "reload",
      cta: "Reload",
      busy: null
    };
  if (s.degraded.length)
    return {
      kind: "degraded",
      tone: "warn",
      text: `${namesAnd(s.degraded)} stopped refreshing`,
      detail: "You're seeing what was last loaded.",
      action: "retry",
      cta: "Retry",
      busy: "Retrying\u2026"
    };
  if (s.disconnected)
    return {
      kind: "disconnected",
      tone: "info",
      text: "Live updates aren't coming through",
      detail: "Reconnecting. Until then, refresh to see anything new.",
      action: "retry",
      cta: "Refresh now",
      busy: "Refreshing\u2026"
    };
  return null;
}
export const SHORTCUTS = [
  { group: "Everywhere", keys: ["\u2318K"], does: "Ask Chanlytics" },
  { group: "Everywhere", keys: ["\u2318B"], does: "Collapse or expand the sidebar" },
  { group: "Everywhere", keys: ["\u23181", "\u23189"], does: "Switch to the first to ninth workspace" },
  { group: "Everywhere", keys: ["?"], does: "This sheet" },
  { group: "Everywhere", keys: ["Esc"], does: "Close what is open" },
  // The record kit's fold, sheet and inline editor (record-fold.jsx recKeys): Business, a person, a deal, a step.
  { group: "Everywhere", keys: ["\u2318\u21B5"], does: "Save the change you are making" },
  // Ask draws no key of its own (the Line, D17): this sheet is where they are listed.
  { group: "Ask", keys: ["\u2191", "\u2193"], does: "Walk what is under the line" },
  { group: "Ask", keys: ["\u21B5"], does: "Ask, or open the row" },
  { group: "Ask", keys: ["\u2318J"], does: "Earlier conversations" },
  { group: "Ask", keys: ["Space"], does: "Hold on an empty line to talk" },
  { group: "Ask", keys: ["Esc"], does: "Stop an answer, then close" },
  { group: "People", keys: ["/"], does: "Search People" },
  { group: "People", keys: ["J", "K", "\u2193", "\u2191"], does: "Next and previous person" },
  { group: "People", keys: ["X", "Space"], does: "Select the person" },
  { group: "People", keys: ["\u21B5"], does: "Open their profile" },
  { group: "People", keys: ["Esc"], does: "Clear the selection" },
  { group: "People", keys: ["F"], does: "Find leads (on Leads)" },
  { group: "People", keys: ["C"], does: "Call the lead under the cursor (on Leads)" },
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
  { group: "Inbox", keys: ["\u2318\u21B5"], does: "Send" },
  { group: "Calendar", keys: ["\u2190", "\u2192"], does: "Previous and next" },
  { group: "Calendar", keys: ["T"], does: "Back to today" }
];
export function shortcutGroups(list = SHORTCUTS) {
  const out = [];
  for (const s of list) {
    const g = out.find((x) => x.group === s.group);
    if (g) g.items.push(s);
    else out.push({ group: s.group, items: [s] });
  }
  return out;
}
export const TOAST_TONES = ["ok", "info", "warn", "danger"];
export const TOAST_MS = { ok: 3e3, info: 3e3, warn: 4e3, danger: 4e3 };
export const TOAST_UNDO_MS = 4e3;
export const TOAST_MAX_MS = 4e3;
export const TOAST_MIN_MS = 2e3;
export const TOAST_ICONS = {
  ok: "check",
  info: "info",
  warn: "alert",
  danger: "error"
};
export function toastShape(p) {
  const tone = TOAST_TONES.includes(p.tone) ? p.tone : "ok";
  const asked = typeof p.ms === "number" && Number.isFinite(p.ms) && p.ms > 0 ? p.ms : null;
  const presses = !!p.undo || !!p.action || Array.isArray(p.links) && p.links.length > 0;
  const ms = Math.min(
    TOAST_MAX_MS,
    Math.max(TOAST_MIN_MS, Math.round(asked ?? (presses ? Math.max(TOAST_UNDO_MS, TOAST_MS[tone]) : TOAST_MS[tone])))
  );
  return {
    tone,
    icon: typeof p.icon === "string" && p.icon ? p.icon : TOAST_ICONS[tone],
    role: tone === "danger" ? "alert" : "status",
    ms,
    // Only an Undo is worth keeping through a tap besides: a toast that stays with nothing to press is one in the way.
    stays: p.stays === true && !!p.undo
  };
}
