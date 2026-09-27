/**
 * The shell's side of the bridge (the PRD, M3; the shapes in @chanlytics/contracts app-bridge). Pure: what a page's
 * message does to the shell's state, and the JavaScript that carries the shell's ask into a page. The WebView
 * (Surface.tsx) is the only caller, and test/bridge.test.mjs runs both without one.
 */
import { parsePageMessage, type ShellMessage } from "@chanlytics/contracts";
import type { ShellState } from "./state";

export type Effect = "nothing" | "sign-in" | "badge" | "today" | "calls-over";

/** The state after a page's message, and what the shell must do beyond keeping it. */
export function onPageMessage(state: ShellState, raw: string): { state: ShellState; effect: Effect } {
  const m = parsePageMessage(raw);
  if (!m) return { state, effect: "nothing" };
  switch (m.t) {
    case "session":
      return {
        state:
          m.state === "out"
            ? { ...state, session: "out", slug: null, needs: 0, registered: null, access: null }
            : { ...state, session: "in" },
        effect: m.state === "out" ? "sign-in" : "nothing",
      };
    case "workspace":
      return { state: { ...state, slug: m.slug }, effect: "nothing" };
    case "needs":
      return { state: { ...state, needs: m.inbox }, effect: "nothing" };
    case "badge":
      return { state: { ...state, badge: m.n }, effect: "badge" };
    case "device":
      // Registered: this token (and activity token) is the person's now. Refused or forgotten: it is not, and the
      // next chance asks again.
      return {
        state: { ...state, registered: m.state === "registered" ? registrationKey(state) : null },
        effect: "nothing",
      };
    case "calls":
      return { state, effect: m.live === 0 ? "calls-over" : "nothing" };
    case "today":
      return { state: { ...state, todayTick: state.todayTick + 1 }, effect: "today" };
    case "route":
      return { state, effect: "nothing" };
    case "token":
      return {
        state: { ...state, access: m.access ? { token: m.access, expires: m.expires } : null },
        effect: "nothing",
      };
  }
}

/** What one registration covers: the push token and, when the phone has one, the activity token. */
export function registrationKey(state: Pick<ShellState, "token" | "activityToken">): string | null {
  return state.token ? `${state.token}|${state.activityToken ?? ""}` : null;
}

/** Whether a page in front should be asked to register the phone now: a person in, a token, and not this pair yet. */
export function shouldRegister(state: ShellState): boolean {
  return state.session === "in" && !!state.token && state.registered !== registrationKey(state);
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
