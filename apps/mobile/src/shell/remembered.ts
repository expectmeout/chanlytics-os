/**
 * The workspace and the theme, kept across launches in the secure store (state.ts recalled). Read once, before the
 * first page is made, since a WebView's first address is frozen at creation (Surface.tsx): without the workspace a
 * cold start opened the site's home, which sent the tab on to /w/<slug> and loaded the whole site a second time.
 * Written as the pages say them; a sign-out forgets the workspace (bridge.ts signedOut), and so does this store.
 */
import * as SecureStore from "expo-secure-store";
import { getState, recalled, setState, subscribe } from "./state";

const SLUG_KEY = "chanlytics.workspace";
const THEME_KEY = "chanlytics.theme";

function read(key: string): string | null {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value) SecureStore.setItem(key, value);
    else void SecureStore.deleteItemAsync(key);
  } catch {
    /* a store that refuses: the next launch opens the site's home, as before */
  }
}

/** Recall what the last launch kept, then keep what the pages say from now on. Once, at the root, before any page. */
export function recallAndKeep(): void {
  setState(recalled(read(SLUG_KEY), read(THEME_KEY)));
  let { slug, theme } = getState();
  subscribe(() => {
    const now = getState();
    if (now.slug !== slug) write(SLUG_KEY, (slug = now.slug));
    if (now.theme !== theme) write(THEME_KEY, (theme = now.theme));
  });
}
