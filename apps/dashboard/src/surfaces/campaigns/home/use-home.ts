/**
 * What Campaigns' home reads and how it moves: the four surfaces its view model is made from (the playbooks' rows and pools,
 * the broadcasts' runs and reach, the library's templates, the reach-outs' chains), read through the seam and handed to
 * contracts as they are (campaignsHomeOf); and the address, which opens a moment or the composer.
 *
 * A real workspace draws its own surfaces; a demo session draws the samples the Playbooks and Broadcasts pages drew; without
 * either the page draws nothing. A surface not read yet is undefined and its tiles say they are reading; one that could not
 * be read is null and says so (a surface that answers nothing is told from one that failed by the seam's own status,
 * `useSurfaceFailed`, which the shell's route gate reads), so a week it could not see is never "nothing is set to go out".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MIN_MS, campaignMessagesOf, campaignsHomeOf } from "@chanlytics/contracts";
import type { LifecycleHome } from "@chanlytics/contracts";
import { tabDraft } from "../../kit/record/work";
import { demoSession, navigate, replaceRoute } from "../../legacy-verbs";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { broadcastsSample } from "../broadcasts/sample";
import type { BroadcastsSurface } from "../broadcasts/surface";
import { playbooksSample } from "../playbooks/sample";
import type { PlaybooksSurface } from "../playbooks/surface";
import type { ReachOutsSurface } from "../reach-out/surface";
import { HOME_ROUTE, composeRoute } from "./address";
import type { HomeAddress } from "./address";

/** The home's data: the surfaces, and the view model made from them. */
interface HomeData {
  playbooks: PlaybooksSurface | undefined;
  /** Undefined before it is read, null where it could not be. */
  broadcasts: BroadcastsSurface | null | undefined;
  reachOuts: ReachOutsSurface | undefined;
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
  const settings = useSurface("settings");
  const broadcastsFailed = useSurfaceFailed("broadcasts");
  const settingsFailed = useSurfaceFailed("settings");
  const now = useHomeNow(nowMs);
  // A demo session's samples, made once for the page's life.
  const [sample] = useState(() =>
    demoSession() ? { playbooks: playbooksSample(), broadcasts: broadcastsSample() } : null,
  );
  const playbooks = livePlaybooks ?? sample?.playbooks;
  // Nothing read: failed (null) where the seam says it could not be, else not read yet (undefined).
  const broadcasts = liveBroadcasts ?? sample?.broadcasts ?? (broadcastsFailed ? null : undefined);
  const sampled = sample?.playbooks.templates ?? undefined;
  const library = settings ? settings.templatesAll : settingsFailed ? null : sampled;
  // The messages the Library counts: the settings surface's (one read with its rows), a demo session's from its sample's.
  const messages = settings ? settings.messages : settingsFailed ? null : undefined;
  const home = useMemo(
    () =>
      campaignsHomeOf({
        nowMs: now,
        tz: playbooks ? playbooks.timezone : "UTC",
        playbooks,
        broadcasts,
        library,
        messages: messages === undefined && sampled ? campaignMessagesOf(sampled) : messages,
        reachOuts,
      }),
    [now, playbooks, broadcasts, library, messages, sampled, reachOuts],
  );
  return { playbooks, broadcasts, reachOuts, home };
}

/**
 * Opening and closing what the address names. Opening pushes an entry, so Back closes it (a peek's rule: Leads', the
 * Pipeline's); changing one thing for another replaces it; closing goes back one entry the page pushed (a composer opened over
 * a drawer returns to the drawer, the drawer to the home), or, for a thing a link arrived at, which has no entry of the page's
 * behind it, replaces the address with the home.
 */
export function useHomeNav(address: HomeAddress) {
  // How many entries the page has pushed over the home: the drawer, and a composer opened over it.
  const pushed = useRef(0);
  const open = address.moment !== null || address.compose !== null;
  useEffect(() => {
    if (!open) pushed.current = 0;
  }, [open]);
  const push = (route: string) => {
    pushed.current += 1;
    navigate(route);
  };
  const swap = (route: string) => replaceRoute(route);
  const close = () => {
    if (pushed.current > 0 && typeof window !== "undefined" && window.history) {
      pushed.current -= 1;
      window.history.back();
    } else replaceRoute(HOME_ROUTE);
  };
  return { push, swap, close };
}

/**
 * Words half-written when the page was left come back as the page does (the tab kept them, useUnsavedWork): a send under
 * "new", a playbook under "new:every", a change to a playbook under its own address. Once, on arrival at the home itself.
 */
export function useReopenDrafts(address: HomeAddress, playbooks: PlaybooksSurface | undefined) {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !playbooks) return;
    asked.current = true;
    if (address.moment !== null || address.compose !== null) return;
    if (tabDraft("broadcast")) replaceRoute(composeRoute("once"));
    else if (tabDraft("playbook", "new")) replaceRoute(composeRoute("every"));
    else {
      const editing = playbooks.rows.find((p) => !!tabDraft("playbook", p.id));
      if (editing) replaceRoute(composeRoute("every", { edit: editing.id }));
    }
  }, [playbooks]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the first read lands
}
