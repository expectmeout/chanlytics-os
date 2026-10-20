/**
 * The address, for the worlds the page tests draw in.
 *
 * A legacy page cannot import, so it reads the address through `CHANLY.address` (surfaces/frame/constants.ts): the bridge's
 * verbs where `window.__shell` has them, and the standalone mockup's own, over the hash, where it has not. The tests
 * make up a window and a `CHANLY` of their own, and a page that reads the address needs the one from constants.ts in
 * it; a copy written here would be tested against itself, so this imports the module's own.
 *
 *   window.CHANLY = { nav: () => {}, address: await legacyAddress() };
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { importSrc } from "../../_source.mjs";

/** constants.ts's `CHANLY.address`, the module's own; it looks the window up when it is asked, so it reads the test's. */
export async function legacyAddress() {
  return (await importSrc("apps/dashboard/src/surfaces/frame/constants.ts")).CHANLY.address;
}

/**
 * A made-up window's History, as the App Router leaves it: a push or a replace writes the address (the path, or a
 * hash) and fires nothing, and Back (`popTo`) moves it and says so.
 */
export function historyOf(win) {
  const pushed = [];
  const replaced = [];
  const move = (url) => {
    if (url.startsWith("#")) win.location.hash = url;
    else {
      const at = url.indexOf("?");
      win.location.pathname = at < 0 ? url : url.slice(0, at);
      win.location.search = at < 0 ? "" : url.slice(at);
    }
  };
  win.history = {
    pushState: (_data, _unused, url) => {
      pushed.push(url);
      move(url);
    },
    replaceState: (_data, _unused, url) => {
      replaced.push(url);
      move(url);
    },
    back() {},
  };
  return { pushed, replaced };
}
