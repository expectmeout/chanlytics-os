/**
 * The three on a phone take a page in as it arrives, stay lit while something needs you, and notice what comes for
 * you (mascot/arrival.ts, which is pure); this is its wiring: the address and its changes (hashchange), the phone (the
 * takeover's own width), Ask's door (body.ask-open, ask-real.jsx, watched as it changes), the boot (surface-runner
 * afterBoot), what needs you (Ask's own standing, ask/palette.ts rightNowParts, and the bell's unread,
 * notifications.ts; asked again as the surfaces they are built from land, as the bell moves and as the phone comes
 * back) and the inbox's count (inbox:counts, surface-data.ts). Installed at boot by LegacyApp. The first
 * page is read as the first face mounts (MASCOT.onMount): the shell's files compile in the browser for seconds after
 * the app boots, and a read that ran before the ✦ existed showed on nothing; it still lasts as long as the boot,
 * should the boot still be out.
 */
import { MASCOT } from "./mascot";
import { watchArrival } from "./mascot/arrival";
import { afterBoot } from "./surface-runner";

/**
 * The surfaces what needs you is built from: Ask's standing reads Today's queue and Broadcasts' runs (ask-real.jsx
 * listens to the same), the bell reads the Inbox, Live, the team and its own kept rows (notifications.ts FEED_EVENTS).
 */
const STANDING_EVENTS = [
  "surface:today",
  "surface:broadcasts",
  "surface:inbox",
  "surface:leads",
  "surface:live",
  "surface:settings",
  "surface:workspace",
  "surface:notifications",
];

type Globals = {
  __ask?: { rightNowParts?: () => { people: number; runs: number; searches: number } };
  __notifs?: { unread?: () => number; onChange?: (cb: () => void) => () => void };
};

/** Whether something needs you: people, runs or searches, as Ask says it, or a notification not read yet. */
const needsYouNow = (): boolean => {
  const w = window as unknown as Globals;
  const A = w.__ask;
  if (A && typeof A.rightNowParts === "function") {
    const p = A.rightNowParts();
    if (p.people || p.runs || p.searches) return true;
  }
  const bell = w.__notifs;
  return !!bell && typeof bell.unread === "function" && bell.unread() > 0;
};

export function installArrival(): () => void {
  const arrival = watchArrival({
    mood: MASCOT.mood,
    route: () => window.location.hash,
    phone: () => !!window.matchMedia && window.matchMedia("(max-width: 720px)").matches,
    askOpen: () => !!document.body && document.body.classList.contains("ask-open"),
    afterBoot,
    waiting: needsYouNow,
  });
  const onHash = () => arrival.arrived();
  const onStanding = () => arrival.recheck();
  const onCounts = (e: Event) => {
    arrival.noticed(Number((e as CustomEvent<{ needs?: number }>).detail?.needs));
    onStanding();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") onStanding();
  };
  window.addEventListener("hashchange", onHash);
  window.addEventListener("inbox:counts", onCounts);
  for (const ev of STANDING_EVENTS) window.addEventListener(ev, onStanding);
  document.addEventListener("visibilitychange", onVisible);
  // the bell moving (Mark all read, a note read where it stands) says so at once, before any surface lands
  const bell = (window as unknown as Globals).__notifs;
  const offBell = bell && typeof bell.onChange === "function" ? bell.onChange(onStanding) : null;
  // Ask's door, as it opens and closes: the light goes and comes back
  const door =
    typeof MutationObserver === "function" && document.body ? new MutationObserver(() => arrival.askChanged()) : null;
  door?.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  // the first face only: the ✦ mounts again as Ask closes, and that is no page arriving; the standing is read then too,
  // since the surfaces may have landed before the face existed
  const offMount = MASCOT.onMount(() => {
    offMount();
    onStanding();
    arrival.arrived();
  });
  return () => {
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("inbox:counts", onCounts);
    for (const ev of STANDING_EVENTS) window.removeEventListener(ev, onStanding);
    document.removeEventListener("visibilitychange", onVisible);
    offBell?.();
    door?.disconnect();
    offMount();
    arrival.stop();
  };
}
