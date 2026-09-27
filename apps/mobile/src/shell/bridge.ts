/**
 * The shell's side of the bridge (the PRD, M3; the shapes in @chanlytics/contracts app-bridge). Pure: what a page's
 * message does to the shell's state, and the JavaScript that carries the shell's ask into a page. The WebView
 * (Surface.tsx) is the only caller, and test/bridge.test.mjs runs both without one.
 */
import { APP_KEYS_RESIZE_CLASS, parsePageMessage, type ShellMessage } from "@chanlytics/contracts";
import type { ShellState } from "./state";

/** What the Surface does beyond keeping the state: the sign-in screen and the widget follow the state and the message. */
export type Effect = "nothing" | "badge" | "calls-over" | "theme";

/**
 * The state once the person is out, whichever way the shell learns it (the page's message, or the signed-out address
 * a WebView lands on): nothing of theirs is kept for the next person on this phone.
 */
export function signedOut(state: ShellState): ShellState {
  return {
    ...state,
    session: "out",
    slug: null,
    needs: 0,
    badge: 0,
    registered: null,
    refused: null,
    pendingRoute: null,
    pendingWorkspace: null,
  };
}

/** The state after a page's message, and what the shell must do beyond keeping it. */
export function onPageMessage(state: ShellState, raw: string): { state: ShellState; effect: Effect } {
  const m = parsePageMessage(raw);
  if (!m) return { state, effect: "nothing" };
  switch (m.t) {
    case "session":
      return { state: m.state === "out" ? signedOut(state) : { ...state, session: "in" }, effect: "nothing" };
    case "workspace":
      return { state: { ...state, slug: m.slug }, effect: "nothing" };
    case "needs":
      return { state: { ...state, needs: m.inbox }, effect: "nothing" };
    case "badge":
      return { state: { ...state, badge: m.n }, effect: "badge" };
    case "device":
      // Registered: this token (and activity token) is the person's now. Forgotten: it is not. Refused: not this
      // pair again until the next foreground or a new token (shouldRegister); asking at once asked for ever, since a
      // refusal cleared what the registration effect keys on.
      return {
        state: {
          ...state,
          registered: m.state === "registered" ? registrationKey(state) : null,
          refused: m.state === "refused" ? registrationKey(state) : null,
        },
        effect: "nothing",
      };
    case "calls":
      return { state, effect: m.live === 0 ? "calls-over" : "nothing" };
    case "today":
      return { state, effect: "nothing" };
    case "route":
    case "overlay":
      return { state, effect: "nothing" };
    case "theme":
      return { state: { ...state, theme: m.theme }, effect: "theme" };
  }
}

/** What one registration covers: the push token and, when the phone has one, the activity token. */
export function registrationKey(state: Pick<ShellState, "token" | "activityToken">): string | null {
  return state.token ? `${state.token}|${state.activityToken ?? ""}` : null;
}

/**
 * Whether a page in front should be asked to register the phone now: a person in, a token, not this pair yet, and
 * not this pair refused since the last foreground.
 */
export function shouldRegister(state: ShellState): boolean {
  const key = registrationKey(state);
  return state.session === "in" && !!key && state.registered !== key && state.refused !== key;
}

/** The script that hands the page one ask. Ends in `true`: a WebView injection must evaluate to something. */
export function askPage(m: ShellMessage): string {
  return `window.__appBridge&&window.__appBridge.receive(${JSON.stringify(JSON.stringify(m))});true;`;
}

/**
 * The script that readies a page before it paints: its bottom inset (the PRD, M4), and where the app shrinks the page
 * above the keyboard (Android, Surface.tsx), the class that says so, so the page makes no room of its own for one.
 */
export function insetScript(px: number, keysResize = false): string {
  const n = Math.max(0, Math.round(px));
  const keys = keysResize ? `document.documentElement.classList.add(${JSON.stringify(APP_KEYS_RESIZE_CLASS)});` : "";
  return `document.documentElement.style.setProperty("--app-inset-bottom","${n}px");${keys}true;`;
}

/** iOS draws the tab bar over the page: the standard bar plus the home indicator's inset. Android keeps the page above it. */
export const IOS_TAB_BAR_PT = 49;
export function bottomInset(platform: "ios" | "android", safeBottom: number): number {
  return platform === "ios" ? IOS_TAB_BAR_PT + safeBottom : 0;
}
