/**
 * The shell's side of the bridge (the PRD, M3; the shapes in @chanlytics/contracts app-bridge). Pure: what a page's
 * message does to the shell's state, and the JavaScript that carries the shell's ask into a page. The WebView
 * (Surface.tsx) is the only caller, and test/bridge.test.mjs runs both without one.
 */
import { parsePageMessage, type ShellMessage } from "@chanlytics/contracts";
import type { ShellState } from "./state";

export type Effect = "nothing" | "sign-in";

/** The state after a page's message, and whether the shell must show the sign-in screen. */
export function onPageMessage(state: ShellState, raw: string): { state: ShellState; effect: Effect } {
  const m = parsePageMessage(raw);
  if (!m) return { state, effect: "nothing" };
  switch (m.t) {
    case "session":
      return { state: { ...state, session: m.state }, effect: m.state === "out" ? "sign-in" : "nothing" };
    case "workspace":
      return { state: { ...state, slug: m.slug }, effect: "nothing" };
    case "needs":
      return { state: { ...state, needs: m.inbox }, effect: "nothing" };
    case "route":
      return { state, effect: "nothing" };
  }
}

/** The script that hands the page one ask. Ends in `true`: a WebView injection must evaluate to something. */
export function askPage(m: ShellMessage): string {
  return `window.__appBridge&&window.__appBridge.receive(${JSON.stringify(JSON.stringify(m))});true;`;
}

/** The script that sets the page's bottom inset before it paints (the PRD, M4). */
export function insetScript(px: number): string {
  const n = Math.max(0, Math.round(px));
  return `document.documentElement.style.setProperty("--app-inset-bottom","${n}px");true;`;
}

/** iOS draws the tab bar over the page: the standard bar plus the home indicator's inset. Android keeps the page above it. */
export const IOS_TAB_BAR_PT = 49;
export function bottomInset(platform: "ios" | "android", safeBottom: number): number {
  return platform === "ios" ? IOS_TAB_BAR_PT + safeBottom : 0;
}
