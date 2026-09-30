/**
 * The address, for the worlds the page tests draw in.
 *
 * A legacy page cannot import, so it reads the address through `CHANLY.address` (data/constants.jsx): the bridge's
 * verbs where `window.__shell` has them, and the standalone mockup's own, over the hash, where it has not. The tests
 * make up a window and a `CHANLY` of their own, and a page that reads the address needs the one from constants.jsx in
 * it; a copy written here would be tested against itself, so this loads the file's own.
 *
 *   window.CHANLY = { nav: () => {}, address: await legacyAddress() };
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/**
 * constants.jsx's `CHANLY.address`, taken from the file and leaving the window's own `CHANLY` as it was. Where the
 * window is not made yet (a test builds its `CHANLY` inside the object that becomes the window), the file is read over
 * a window of its own for the moment; the address looks the window up when it is asked, so it reads the test's.
 */
export async function legacyAddress() {
  const made = globalThis.window === undefined;
  if (made) globalThis.window = {};
  const win = globalThis.window;
  const was = win.CHANLY;
  await import("../../../../../apps/dashboard/src/legacy/data/constants.jsx");
  const { address } = win.CHANLY;
  if (made) delete globalThis.window;
  else if (was === undefined) delete win.CHANLY;
  else win.CHANLY = was;
  return address;
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
