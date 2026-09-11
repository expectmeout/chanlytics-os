/**
 * Which workspace every request on this page is about.
 *
 * Nothing used to send this, so the API answered from whatever default each
 * route happened to pick — three different rules — and the read endpoints,
 * scoped only by RLS, returned every workspace the caller belonged to merged
 * into one list. One id, chosen once, appended at one chokepoint (the typed
 * client) so no call site can forget it.
 *
 * localStorage, not session: which business you are looking at is a preference
 * that should survive a reload, unlike the cached rows themselves. It is only
 * ever a REQUEST — the server validates membership and ignores an id the caller
 * has no claim to, so a tampered value grants nothing.
 *
 * Its own module, with no imports, so the client and the surfaces can both
 * read it without either importing the other.
 */
const WS_KEY = "chanlytics.workspace";

let activeWorkspace: string | null = null;

export function getActiveWorkspace(): string | null {
  if (activeWorkspace) return activeWorkspace;
  try {
    activeWorkspace = localStorage.getItem(WS_KEY);
  } catch {
    // private mode / storage disabled — the server default applies
  }
  return activeWorkspace;
}

export function setActiveWorkspace(id: string | null): void {
  activeWorkspace = id;
  try {
    if (id) localStorage.setItem(WS_KEY, id);
    else localStorage.removeItem(WS_KEY);
  } catch {
    /* the in-memory value still holds for this page */
  }
}
