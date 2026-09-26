/**
 * The three on a phone take a page in as it arrives and notice what comes for you (mascot/arrival.ts, which is pure);
 * this is its wiring: the address and its changes (hashchange), the phone (the takeover's own width), Ask's door
 * (body.ask-open, ask-real.jsx), the boot (surface-runner afterBoot) and the inbox's count (inbox:counts,
 * surface-data.ts). Installed at boot by LegacyApp. The first page is read as the first face mounts (MASCOT.onMount):
 * the shell's files compile in the browser for seconds after the app boots, and a read that ran before the ✦ existed
 * showed on nothing; it still lasts as long as the boot, should the boot still be out.
 */
import { MASCOT } from "./mascot";
import { watchArrival } from "./mascot/arrival";
import { afterBoot } from "./surface-runner";

export function installArrival(): () => void {
  const arrival = watchArrival({
    mood: MASCOT.mood,
    route: () => window.location.hash,
    phone: () => !!window.matchMedia && window.matchMedia("(max-width: 720px)").matches,
    askOpen: () => !!document.body && document.body.classList.contains("ask-open"),
    afterBoot,
  });
  const onHash = () => arrival.arrived();
  const onCounts = (e: Event) => arrival.noticed(Number((e as CustomEvent<{ needs?: number }>).detail?.needs));
  window.addEventListener("hashchange", onHash);
  window.addEventListener("inbox:counts", onCounts);
  // the first face only: the ✦ mounts again as Ask closes, and that is no page arriving
  const offMount = MASCOT.onMount(() => {
    offMount();
    arrival.arrived();
  });
  return () => {
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("inbox:counts", onCounts);
    offMount();
    arrival.stop();
  };
}
