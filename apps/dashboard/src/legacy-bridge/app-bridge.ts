/**
 * The page's side of the bridge to the native shell (the phone app's PRD, decision M3; the shapes in
 * contracts/app-bridge.ts). Installed at boot by LegacyApp, and a no-op anywhere but inside the app: the document is
 * stamped html.in-app before paint, and the shell's WebView puts `ReactNativeWebView.postMessage` on the window.
 *
 * What the page says: the hash route it is on (at install and on every change), that a person is signed in (the
 * shell only ever boots this bundle for one: the proxy sends anyone else to /login, which the shell reads from the
 * address), the needs-you count the Inbox publishes (inbox:counts, the badge on the native tab), and the workspace
 * the address names. What the shell asks: go to a route, open the menu, scroll to the top. A message the page cannot
 * parse does nothing.
 */
import { parsePageMessage, parseShellMessage, type PageMessage } from "@chanlytics/contracts";

const IN_APP_CLASS = "in-app";

interface BridgeWindow {
  document: { documentElement: { classList: { contains(c: string): boolean } } };
  location: { hash: string; pathname: string };
  ReactNativeWebView?: { postMessage(s: string): void };
  __appBridge?: { receive(raw: string): void };
  addEventListener(type: string, fn: (e: Event) => void): void;
  removeEventListener(type: string, fn: (e: Event) => void): void;
  dispatchEvent(e: Event): boolean;
}

/** The hash route's name without its leading "#/", "today" when there is none: what app-shell.jsx parses. */
export function hashRoute(hash: string): string {
  return (hash || "#/today").replace(/^#\/?/, "") || "today";
}

/** The workspace a path names, /w/<slug>, or null off a workspace page (legacy-bridge/workspace.ts's rule). */
function slugOf(pathname: string): string | null {
  const m = /^\/w\/([^/?#]+)/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]) || null;
  } catch {
    return null;
  }
}

export function installAppBridge(win: BridgeWindow = window as unknown as BridgeWindow): () => void {
  if (!win.document.documentElement.classList.contains(IN_APP_CLASS) || !win.ReactNativeWebView) return () => {};
  const post = (m: PageMessage) => {
    // Round-tripped through the parser so the page never posts a shape the shell would refuse.
    const raw = JSON.stringify(m);
    if (parsePageMessage(raw)) win.ReactNativeWebView?.postMessage(raw);
  };
  const route = () => post({ t: "route", route: hashRoute(win.location.hash) });
  const workspace = () => {
    const slug = slugOf(win.location.pathname);
    if (slug) post({ t: "workspace", slug });
  };
  const counts = (e: Event) => {
    const needs = (e as CustomEvent<{ needs?: unknown }>).detail?.needs;
    if (typeof needs === "number") post({ t: "needs", inbox: Math.max(0, Math.floor(needs)) });
  };
  win.addEventListener("hashchange", route);
  win.addEventListener("inbox:counts", counts);
  win.addEventListener("workspace:changed", workspace);
  win.__appBridge = {
    receive(raw: string) {
      let v: unknown;
      try {
        v = JSON.parse(raw);
      } catch {
        return;
      }
      const m = parseShellMessage(v);
      if (!m) return;
      if (m.t === "navigate") win.location.hash = "/" + m.route;
      else if (m.t === "menu") win.dispatchEvent(new CustomEvent("shell:menu"));
      else if (m.t === "top") win.dispatchEvent(new CustomEvent("shell:top"));
    },
  };
  post({ t: "session", state: "in" });
  workspace();
  route();
  return () => {
    win.removeEventListener("hashchange", route);
    win.removeEventListener("inbox:counts", counts);
    win.removeEventListener("workspace:changed", workspace);
    delete win.__appBridge;
  };
}
