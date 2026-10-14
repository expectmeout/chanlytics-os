/**
 * Back closes the sheet on top (the sheets as verbs, 14 Oct 2026, step 4). A sheet that opts in (`backCloses` on the
 * kit's Sheet and the record kit's sheet) is an entry in the tab's history while it is open, so a phone's Back, a
 * browser's Back and a swipe back close it, as its Close does, rather than leave the page under it. A sheet over a sheet
 * is a second entry, and Back closes the top one first. Closed any other way, it takes its entry back with it; where the
 * page moved on from inside it (a door to another page), its entry stays behind that page's, as any page's would.
 *
 * A sheet may name itself in the address (`?do=note:<person>`): the entry it stands is that address, so a reload or a
 * link opens it again (`doAsked`, read by the frame's hosts as they mount), and one opened by the address takes the entry
 * it was opened on rather than standing a second.
 *
 * The pages whose sheets are records with an address of their own (the Calendar's visit, a campaign's moment, an ad)
 * already close on Back by that address, and do not opt in. Back asks a sheet to close as its Close asks: one that asks
 * first about what was typed, or holds a save that is out, stays open, and stands its entry again.
 */
import { useEffect, useRef } from "react";

/** The query word a sheet that names itself stands in. */
const DO = "do";

let seq = 0;

/** Back's own move settling: an entry taken back is gone before the next sheet stands one, never after it. */
let settling: Promise<void> = Promise.resolve();

const historyOf = (): History | null =>
  typeof window !== "undefined" && window.history && typeof window.history.pushState === "function"
    ? window.history
    : null;

/** Which sheet's entry the tab stands on, by the token it was stood with. */
function tokenNow(h: History): number | null {
  const s = h.state as { sheet?: unknown } | null;
  return s && typeof s.sheet === "number" ? s.sheet : null;
}

/** The address with `?do=` set to a sheet's name, or taken off. */
function addressWith(name: string | null): string {
  const u = new URL(window.location.href);
  if (name) u.searchParams.set(DO, name);
  else u.searchParams.delete(DO);
  return `${u.pathname}${u.search}${u.hash}`;
}

/**
 * Take an entry back, and say when the tab has moved: the next sheet stands its entry after it. A page that closes a
 * panel of its own by Back and opens a sheet in its place (the Calendar's visit, handing off to the note sheet) steps
 * back through here, so the sheet's entry is never the one that Back takes.
 */
export function historyBack(h: History = window.history): void {
  takeBack(h);
}

function takeBack(h: History): void {
  settling = new Promise((done) => {
    const fin = () => {
      window.removeEventListener("popstate", fin);
      clearTimeout(late);
      done();
    };
    // A tab that never says it moved (a test's stand-in) does not hold the next sheet up for long.
    const late = setTimeout(fin, 400);
    window.addEventListener("popstate", fin);
    h.back();
  });
}

/** What a sheet of a kind was opened with by the address (`?do=<kind>:<id>`): the id, or null. */
export function doAsked(kind: string): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const named = new URLSearchParams(window.location.search).get(DO);
  if (!named || !named.startsWith(`${kind}:`)) return null;
  const id = named.slice(kind.length + 1);
  return id || null;
}

/**
 * Stand an entry for a sheet while it is open (`open`), so Back asks it to close (`close`), named in the address where
 * it says so (`name`). Nothing where the tab has no history to stand in.
 */
export function useBackCloses(open: boolean, close: () => void, name: string | null = null): void {
  const closeNow = useRef(close);
  closeNow.current = close;
  const openNow = useRef(open);
  openNow.current = open;
  useEffect(() => {
    const h = historyOf();
    if (!open || !h) return undefined;
    let token: number | null = null;
    let adopted = false;
    let live = true;
    const stand = () =>
      void settling.then(() => {
        if (!live || token !== null) return;
        token = ++seq;
        const state = { ...((h.state as object | null) ?? {}), sheet: token };
        // Opened by the address itself (a reload, a link): the entry it was opened on is the sheet's.
        const byAddress = !!name && new URLSearchParams(window.location.search).get(DO) === name && !tokenNow(h);
        adopted = byAddress;
        if (byAddress) h.replaceState(state, "");
        else h.pushState(state, "", name ? addressWith(name) : undefined);
      });
    // A tick later: a strict draw's mount, unmount and mount again stands one entry, never two.
    const first = setTimeout(stand, 0);
    const onPop = () => {
      if (token === null || tokenNow(h) === token) return;
      // Back took its entry: the sheet is asked to close, as its Close asks.
      token = null;
      adopted = false;
      closeNow.current();
      // One that asks first stays open, and stands again: the next Back asks again.
      setTimeout(() => {
        if (live && openNow.current) stand();
      }, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      live = false;
      clearTimeout(first);
      window.removeEventListener("popstate", onPop);
      if (token === null || tokenNow(h) !== token) return;
      // Its entry is the one on top: taken back with it. One the address opened is the page's own, its name taken off.
      if (adopted) h.replaceState({ ...((h.state as object | null) ?? {}), sheet: null }, "", addressWith(null));
      else takeBack(h);
    };
  }, [open, name]);
}
