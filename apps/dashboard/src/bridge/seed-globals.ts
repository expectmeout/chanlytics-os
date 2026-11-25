/**
 * Seed the classic-script globals BEFORE the manifest evaluates.
 * The mockup's 48 files were written for one shared global scope: they
 * destructure `React` at module scope, call ReactDOM.createPortal at runtime,
 * and export via Object.assign(window, {...}). Making our bundle's React THE
 * window.React means the frame's components run inside our tree with one hook
 * dispatcher — no second React instance ever loads.
 *
 * Only a name something READS is published here. A name published for a page that has since moved to TSX and imports the
 * kit directly is to be taken down with its last reader (decision 0015: "what is shared moves once, published under the old
 * name for the pages still reading it, deleted with the last reader"), and was not: the sweep of 11 October 2026 (O4b)
 * found forty names on this list that no shipped file read. The node tests that still reach a kit part by name get it from
 * tests/_stub-react.mjs (`kitParts`), not from the app's window.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { threadVerbs } from "../surfaces/inbox/thread/thread-verbs";
import { KIT_GLOBALS } from "../surfaces/kit/kit-globals";
import { useNeedsYou } from "../surfaces/needs-you";
import { PEOPLE_GLOBALS } from "../surfaces/people/people-globals";
import { AskLine } from "./ask/line";
import { surfaceHook, type SurfaceNames } from "./surface-status";
import { routeSurfaces } from "./surface-registry";
import { DOOR_NAMES } from "../surfaces/frame-doors";
import { installRoleStore } from "./identity";
import { installFrameGlobals } from "../surfaces/frame/frame-globals";

declare global {
  interface Window {
    React: typeof React;
    ReactDOM: typeof ReactDOM;
    useSurface: (names: SurfaceNames) => number;
  }
}

if (typeof window !== "undefined") {
  // React, and the one hook a page redraws on when a surface it draws moves (surface-status.ts): a key, a list, or a
  // route's, as the registry names them. Over this React, before any page loads.
  // And the kit's components the pages that have not moved still draw, under the names they read (kit-globals.ts).
  Object.assign(window, {
    React,
    ReactDOM,
    useSurface: surfaceHook(React, routeSurfaces),
    Icon: KIT_GLOBALS.Icon,
    FailedRead: KIT_GLOBALS.FailedRead,
    StatePill: KIT_GLOBALS.StatePill,
    Confirm: KIT_GLOBALS.Confirm,
    MoreMenu: KIT_GLOBALS.MoreMenu,
    PolicyChip: KIT_GLOBALS.PolicyChip,
    // The doors every page uses to move and to ask, for the pages that read them by name (surfaces/frame-doors.ts: the frame fills the
    // registry as it renders; these go through it).
    askAbout: DOOR_NAMES.askAbout,
    appAsk: DOOR_NAMES.appAsk,
    appNavigate: DOOR_NAMES.appNavigate,
    // The one thread's verbs, which the deal sheet sends its proposal through (surfaces/inbox/thread/thread-verbs.tsx).
    // What needs you, the one number the sidebar's badge, the strip's tab, the phone's tab and the tab's title read, as a hook
    // (surfaces/needs-you.ts); the Inbox's rule it is made of (ixWaitsOnYou) is no page's to call by name now.
    useNeedsYou,
    threadVerbs,
    // The strip of views, the page a swipe walks, the deck a view moves by and the phone's tab bar, which the frame draws
    // and asks by name until it moves itself (frame/surface-tabs.tsx, surfaces/frame/app-shell.tsx).
    ViewTabs: KIT_GLOBALS.ViewTabs,
    viewPager: KIT_GLOBALS.viewPager,
    viewDeck: KIT_GLOBALS.viewDeck,
    TabBar: KIT_GLOBALS.TabBar,
    // Ask's Line, which the frame draws on every page: its pages and the parts only they draw come as a chunk of their own,
    // once the frame is idle or the Line is first opened (ask/line.tsx).
    AskBar: AskLine,
    // And People's parts the shell still draws or calls by name: the strip's scopes (frame/surface-tabs.tsx), the two sheets the
    // frame draws once and their doors (surfaces/frame/app-shell.tsx), and the demo's Lists page's mark and route (people-globals.ts).
    plScopes: PEOPLE_GLOBALS.plScopes,
    plScopeRoute: PEOPLE_GLOBALS.plScopeRoute,
    DealSheetHost: PEOPLE_GLOBALS.DealSheetHost,
    StepSheetHost: PEOPLE_GLOBALS.StepSheetHost,
    openDealSheet: PEOPLE_GLOBALS.openDealSheet,
    openStepSheet: PEOPLE_GLOBALS.openStepSheet,
  });
  // The role store every gate asks (identity.ts), made before any page loads, as settings.jsx made it as the
  // manifest loaded: identity.ts completes it once its own install runs.
  installRoleStore();
  // The frame's helpers the pages read by name: the toast, a thumb's gestures, an overlay's way out, focus, the role gate,
  // a door that is a link, presence, the seeded charter and the tip (surfaces/frame/frame-globals.ts).
  installFrameGlobals();
}

export {};
