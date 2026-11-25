/** Chrome: in app. */

import { FIRST_RUN_ROUTE } from "../../setup/first-run-route";
import { DEVICE_PREFS_STORAGE } from "./theme";

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
  return { version: m[1] ?? "", platform: platform === "ios" || platform === "android" ? platform : "unknown" };
}

/** The class on <html> that in-app rules hang from; the frame reads window.__IN_APP for the same fact. */
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

export type SidebarPref = "open" | "rail";

export const isSidebarPref = (value: unknown): value is SidebarPref => value === "open" || value === "rail";

/** The sidebar of a device that has kept none: open, as the app draws it (bridge/device-prefs.ts). */
export const DEFAULT_SIDEBAR_PREF: SidebarPref = "open";

/** The `<html>` attribute that says the sidebar this device keeps, for the document's outline (OUTLINE_BARE beside it). */
const OUTLINE_SIDEBAR_ATTR = "data-sidebar";

/** The `<html>` attribute that says the outline draws none of the frame: the address is a page drawn full screen. */
const OUTLINE_BARE_ATTR = "data-outline-bare";

/** The `<html>` attribute that names the sidebar's place the address lights (OutlineRoutes.lit). */
const OUTLINE_LIT_ATTR = "data-outline-lit";

/** The `<html>` attribute that says the address's page searches its list in Ask's line (OutlineRoutes.search). */
const OUTLINE_SEARCH_ATTR = "data-outline-search";

/**
 * What the outline knows of an address's route, from the frame's own places (surfaces/frame/places.ts OUTLINE_ROUTES):
 * the sidebar's place each first word of a route lights, and the routes whose page says its search in Ask's line
 * (kit/head/page-search.ts), as a pattern over the route as the path writes it. A lit row is drawn heavier and a search's
 * line says no label, so an outline that knew neither stood a row's words narrower than the frame's and drew Ask's label
 * where the frame draws none (the nightly of 2 Nov 2026).
 */
export interface OutlineRoutes {
  lit: Readonly<Record<string, string>>;
  search: string;
}

const NO_OUTLINE_ROUTES: OutlineRoutes = { lit: {}, search: "(?!)" };

/**
 * What the document's outline needs before first paint (surfaces/frame/outline.tsx, the cold-load review of 28 Oct
 * 2026): the outline is prerendered once for every address, so the two facts it is drawn by are stamped here. The
 * sidebar this device keeps, `open` or `rail`, read from the stored object as the app reads it (isSidebarPref, else
 * the default); the outline's stylesheet stands it as a rail on a small desk whatever it says, as the frame does. And
 * the first run, whose address (`/w/<slug>/start`, or the old `#/start`) the app draws full screen with none of the
 * frame: there the outline draws the page's ground alone. And from `routes` (OutlineRoutes): the place the route lights,
 * and whether its page searches in Ask's line. theme-boot.test.mjs runs it against the app's own readings.
 */
export function outlineBootScript(routes: OutlineRoutes = NO_OUTLINE_ROUTES): string {
  const start = JSON.stringify(FIRST_RUN_ROUTE);
  return [
    "try{",
    `var v=${JSON.stringify(DEFAULT_SIDEBAR_PREF)};`,
    `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(DEVICE_PREFS_STORAGE)})||"{}");`,
    'if(s&&(s.sidebar==="open"||s.sidebar==="rail"))v=s.sidebar}catch(e){}',
    `var d=document.documentElement;d.setAttribute(${JSON.stringify(OUTLINE_SIDEBAR_ATTR)},v);`,
    'var m=/^\\/w\\/[^\\/?#]+(?:\\/([^?#]*))?/.exec(location.pathname||"");',
    'var w=m?(m[1]||((location.hash||"").indexOf("#/")===0?location.hash.slice(2).split("?")[0]:"")):null;',
    'var r=w===null?"":w.replace(/\\/+$/,"").split("/")[0];',
    `if(r===${start})d.setAttribute(${JSON.stringify(OUTLINE_BARE_ATTR)},"");`,
    `var L=${JSON.stringify(routes.lit)};`,
    `if(w!==null&&Object.prototype.hasOwnProperty.call(L,r))d.setAttribute(${JSON.stringify(OUTLINE_LIT_ATTR)},L[r]);`,
    `if(w!==null&&new RegExp(${JSON.stringify(routes.search)}).test(w.replace(/\\/+$/,"")))d.setAttribute(${JSON.stringify(OUTLINE_SEARCH_ATTR)},"");`,
    "}catch(e){}",
  ].join("");
}
