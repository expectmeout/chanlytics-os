/**
 * The three on a phone take a page in as it arrives, stay lit while something needs you, and notice what comes for
 * you (mascot/arrival.ts, which is pure); this is its wiring: the address and its changes (hashchange), the phone (the
 * takeover's own width), Ask's door (body.ask-open, ask-real.jsx, watched as it changes), the boot (surface-runner
 * afterBoot), what waits on you (Ask's own standing, ask/palette.ts rightNowParts, read again as the surfaces it is
 * built from land) and the inbox's count (inbox:counts, surface-data.ts). Installed at boot by LegacyApp. The first
 * page is read as the first face mounts (MASCOT.onMount): the shell's files compile in the browser for seconds after
 * the app boots, and a read that ran before the ✦ existed showed on nothing; it still lasts as long as the boot,
 * should the boot still be out.
 */
import { MASCOT } from "./mascot";
import { watchArrival } from "./mascot/arrival";
import { afterBoot } from "./surface-runner";

/** the surfaces Ask's standing is built from, and the inbox's own count */
const STANDING_EVENTS = ["surface:today", "surface:inbox", "surface:leads", "inbox:counts"];

/** Whether something waits on you: people, runs or searches, as Ask says it. */
const standingNow = (): boolean => {
  const A = (
    window as unknown as { __ask?: { rightNowParts?: () => { people: number; runs: number; searches: number } } }
  ).__ask;
  if (!A || typeof A.rightNowParts !== "function") return false;
  const p = A.rightNowParts();
  return !!(p.people || p.runs || p.searches);
};

export function installArrival(): () => void {
  const arrival = watchArrival({
    mood: MASCOT.mood,
    route: () => window.location.hash,
    phone: () => !!window.matchMedia && window.matchMedia("(max-width: 720px)").matches,
    askOpen: () => !!document.body && document.body.classList.contains("ask-open"),
    afterBoot,
  });
  const onHash = () => arrival.arrived();
  const onStanding = () => arrival.standing(standingNow());
  const onCounts = (e: Event) => {
    arrival.noticed(Number((e as CustomEvent<{ needs?: number }>).detail?.needs));
    onStanding();
  };
  window.addEventListener("hashchange", onHash);
  window.addEventListener("inbox:counts", onCounts);
  for (const ev of STANDING_EVENTS) if (ev !== "inbox:counts") window.addEventListener(ev, onStanding);
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
    for (const ev of STANDING_EVENTS) if (ev !== "inbox:counts") window.removeEventListener(ev, onStanding);
    door?.disconnect();
    offMount();
    arrival.stop();
  };
}
