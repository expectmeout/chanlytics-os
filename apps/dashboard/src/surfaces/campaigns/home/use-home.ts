/**
 * What Campaigns' sheets read and how they move (sheets.tsx; the home they stood over went with decision 0060's S6): the four
 * surfaces the composer's view model is made from (the playbooks' rows, pools, shape and templates, Sent's runs and reach,
 * Campaigns' own 30 days, the reach-outs' chains), read through the seam and handed to contracts as they are
 * (campaignsHomeOf); and the address, which opens the composer or a message.
 *
 * A real workspace draws its own surfaces; a demo session draws the samples the Playbooks and Broadcasts pages drew; without
 * either the sheets draw nothing. A surface not read yet is undefined and its tiles say they are reading; one that could not
 * be read is null and says so (a surface that answers nothing is told from one that failed by the seam's own status,
 * `useSurfaceFailed`, which the shell's route gate reads), so a week it could not see is never "nothing is set to go out".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MIN_MS, SEQUENCES_ROUTE, campaignsHomeOf } from "@chanlytics/contracts";
import type { LifecycleHome } from "@chanlytics/contracts";
import { demoSession, navigate, replaceRoute } from "../../legacy-verbs";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { broadcastsSample, campaignResultsSample } from "../broadcasts/sample";
import type { BroadcastsSurface } from "../broadcasts/surface";
import { playbooksSample } from "../playbooks/sample";
import type { PlaybooksSurface } from "../playbooks/surface";
import type { ReachOutsSurface } from "../reach-out/surface";
import type { HomeAddress } from "./address";
import type { CampaignResultsSurface } from "./results-surface";

/** The home's data: the surfaces, and the view model made from them. */
interface HomeData {
  playbooks: PlaybooksSurface | undefined;
  /** Undefined before it is read, null where it could not be. */
  broadcasts: BroadcastsSurface | null | undefined;
  reachOuts: ReachOutsSurface | undefined;
  /** Campaigns' own 30 days: undefined before read, null where it could not be. */
  results: CampaignResultsSurface | null | undefined;
  home: LifecycleHome;
}

/**
 * The clock the page is read at: the moment it draws, and again each minute and whenever the tab comes back, so "Today" and
 * "Tomorrow" in Coming up roll over midnight while the page stays open. A test fixes it (`fixed`), and then it never moves.
 */
function useHomeNow(fixed?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fixed !== undefined) return undefined;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, MIN_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fixed]);
  return fixed ?? now;
}

/** The surfaces and the view model. `nowMs` is the clock the page is read at: the moment it draws, unless a test says. */
export function useHomeData(nowMs?: number): HomeData {
  const livePlaybooks = useSurface("playbooks");
  const liveBroadcasts = useSurface("broadcasts");
  const reachOuts = useSurface("reach_outs");
  const liveResults = useSurface("campaign_results");
  const broadcastsFailed = useSurfaceFailed("broadcasts");
  const resultsFailed = useSurfaceFailed("campaign_results");
  const now = useHomeNow(nowMs);
  // A demo session's samples, made once for the page's life.
  const [sample] = useState(() =>
    demoSession()
      ? { playbooks: playbooksSample(), broadcasts: broadcastsSample(), results: campaignResultsSample() }
      : null,
  );
  const playbooks = livePlaybooks ?? sample?.playbooks;
  // Nothing read: failed (null) where the seam says it could not be, else not read yet (undefined).
  const broadcasts = liveBroadcasts ?? sample?.broadcasts ?? (broadcastsFailed ? null : undefined);
  // Campaigns' own 30 days: failed (null) where the seam says it could not be read, else not read yet (undefined).
  const results = liveResults ?? sample?.results ?? (resultsFailed ? null : undefined);
  // The call's text and the Library's count: the playbooks surface's slice, made of the settings read, the one read of the
  // templates (a demo session's sample's).
  const library = playbooks ? playbooks.library : undefined;
  const messages = playbooks ? playbooks.messages : undefined;
  const home = useMemo(
    () =>
      campaignsHomeOf({
        nowMs: now,
        tz: playbooks ? playbooks.timezone : "UTC",
        playbooks,
        broadcasts,
        library,
        messages,
        reachOuts,
        report: results === undefined ? undefined : results === null ? null : results.report,
        shape: playbooks?.shape,
        chains: results === undefined ? undefined : results === null ? null : results.chains,
      }),
    [now, playbooks, broadcasts, library, messages, reachOuts, results],
  );
  return { playbooks, broadcasts, reachOuts, results, home };
}

/**
 * Opening and closing what the address names. Opening pushes an entry, so Back closes it (a peek's rule: Leads', the
 * Pipeline's); changing one thing for another replaces it. A sheet that opened over the page it stood on has that page
 * behind it, whoever pushed it (a bell row, Ask's card, a door the page drew): closing goes back. One the page swapped in,
 * or a link arrived at, has no entry of the page's behind it: closing replaces the address with Sequences.
 */
export function useHomeNav(address: HomeAddress) {
  // How many entries stand over the page: a message's drawer, and a composer opened over it.
  const pushed = useRef(0);
  const swapped = useRef(false);
  const open = address.moment !== null || address.message !== null || address.compose !== null;
  const wasOpen = useRef(open);
  useEffect(() => {
    if (!open) pushed.current = 0;
    else if (!wasOpen.current && pushed.current === 0 && !swapped.current) pushed.current = 1;
    swapped.current = false;
    wasOpen.current = open;
  }, [open]);
  const push = (route: string) => {
    pushed.current += 1;
    navigate(route);
  };
  const swap = (route: string) => {
    swapped.current = true;
    replaceRoute(route);
  };
  const close = () => {
    if (pushed.current > 0 && typeof window !== "undefined" && window.history) {
      pushed.current -= 1;
      window.history.back();
    } else replaceRoute(SEQUENCES_ROUTE);
  };
  return { push, swap, close };
}
