/**
 * What Campaigns' home reads and how it moves: the four surfaces its view model is made from (the playbooks' rows, pools,
 * shape and templates, Sent's runs and reach, Campaigns' own 30 days, the reach-outs' chains), read through the seam and
 * handed to contracts as they are (campaignsHomeOf); and the address, which opens a moment or the composer.
 *
 * A real workspace draws its own surfaces; a demo session draws the samples the Playbooks and Broadcasts pages drew; without
 * either the page draws nothing. A surface not read yet is undefined and its tiles say they are reading; one that could not
 * be read is null and says so (a surface that answers nothing is told from one that failed by the seam's own status,
 * `useSurfaceFailed`, which the shell's route gate reads), so a week it could not see is never "nothing is set to go out".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MIN_MS, campaignsHomeOf } from "@chanlytics/contracts";
import type { LifecycleHome } from "@chanlytics/contracts";
import { tabDraft } from "../../kit/record/work";
import { demoSession, navigate, replaceRoute } from "../../legacy-verbs";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { broadcastsSample, campaignResultsSample } from "../broadcasts/sample";
import type { BroadcastsSurface } from "../broadcasts/surface";
import { playbooksSample } from "../playbooks/sample";
import type { PlaybooksSurface } from "../playbooks/surface";
import type { ReachOutsSurface } from "../reach-out/surface";
import { composeRoute, groupRoute } from "./address";
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
 * The group the ledger shows: the address's while it names no sheet, and the one it had while a sheet stands, since one
 * param holds either (address.ts). A drawer opened from one group leaves the ledger behind it narrowed as it was.
 */
export function useKeptGroup(address: HomeAddress): string | null {
  const kept = useRef<string | null>(address.group);
  if (address.moment === null && address.message === null && address.compose === null) kept.current = address.group;
  return kept.current;
}

/**
 * Opening and closing what the address names. Opening pushes an entry, so Back closes it (a peek's rule: Leads', the
 * Pipeline's); changing one thing for another, and narrowing the ledger, replace it. A sheet that opened over the home the
 * page stood on has the home behind it, whoever pushed it (a bell row, Ask's card, a door the page drew): closing goes
 * back. One the page swapped in, or a link arrived at, has no entry of the page's behind it: closing replaces the address
 * with the home, narrowed to the group it kept.
 */
export function useHomeNav(address: HomeAddress, group: string | null) {
  // How many entries stand over the home: the drawer, and a composer opened over it.
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
  // The ledger narrowed, or let go: the home's own address replaced, which opens no sheet, so it marks no swap (a mark
  // left by it would make the next sheet a bell row pushes close past the home).
  const narrow = (to: string | null) => replaceRoute(groupRoute(to));
  const close = () => {
    if (pushed.current > 0 && typeof window !== "undefined" && window.history) {
      pushed.current -= 1;
      window.history.back();
    } else replaceRoute(groupRoute(group));
  };
  return { push, swap, narrow, close };
}

/**
 * Words half-written when the page was left come back as the page does (the tab kept them, useUnsavedWork): a send under
 * "new", a playbook under "new:every", a change to a playbook under its own address. Once, on arrival at the home itself,
 * swapped in (`swap`), so its sheet has no home behind it to go back to.
 */
export function useReopenDrafts(
  address: HomeAddress,
  playbooks: PlaybooksSurface | undefined,
  swap: (route: string) => void,
) {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !playbooks) return;
    asked.current = true;
    if (address.moment !== null || address.message !== null || address.compose !== null) return;
    if (tabDraft("broadcast")) swap(composeRoute("once"));
    else if (tabDraft("playbook", "new")) swap(composeRoute("every"));
    else {
      const editing = playbooks.rows.find((p) => !!tabDraft("playbook", p.id));
      if (editing) swap(composeRoute("every", { edit: editing.id }));
    }
  }, [playbooks]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the first read lands
}
