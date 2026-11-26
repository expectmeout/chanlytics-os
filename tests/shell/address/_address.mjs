/**
 * The address, for the worlds the page tests draw in.
 *
 * A page reads the address through `CHANLY.address` (surfaces/frame/constants.ts): the bridge's shell where one is held
 * (provided as `shell`), and the standalone mockup's own, over the hash, where it is not. A test that reads the address
 * the page reads takes the module's own here; a copy written here would be tested against itself.
 *
 *   const address = await legacyAddress();
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
