/**
 * What a pane of Settings reads that is no surface, kept in the tab and begun before the pane is drawn: Team's partner,
 * Connections' two doors (Meta's and Instagram's), the saved views Profile's answer style is kept in, and the Activity log's
 * first page (legacy-bridge/activity.ts). Each was asked as its pane mounted, and the pane drew without it and again when it
 * landed: Team's partner card came 118 to 306 ms after the pane on every load, warm or not, and the log's first page 0.4 to
 * 0.8 s after its pane, 3,300 to 7,000 px at once (production, the e2e workspace, the Settings load review, 28 Oct 2026).
 *
 * Kept in the tab (read-cache.ts `tab`), so a reload or a visit after the first draws what the last read said and reads again
 * behind it; begun as a pointer, a finger or the keyboard reaches the pane's row (warmSettingsPane), so a press lands on
 * rows in hand; and on a load at the pane's address, begun before the boot and waited for by its first draw
 * (settingsPaneOnScreen), as a person's page reads its person. The head starts the same reads (contracts PREFETCH_READS,
 * `admin/<pane>`), which these take.
 */
import type { ApiResult } from "@/client/api";
import { activity } from "@/legacy-bridge/activity";
import { api } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import { bootWaitsFor } from "@/legacy-bridge/surface-runner";
import { ROUTE_WAIT_MS, routeDrawsFor } from "@/legacy-bridge/surface-registry";
import { firstDrawWaitsFor, surfacesSettled } from "@/legacy-bridge/surface-status";
import { getActiveWorkspace, reachFor, routeOnScreen } from "@/legacy-bridge/workspace";

/** One read a pane draws: what the tab last held of it, a read that keeps its answer, and one begun ahead of the pane. */
interface KeptRead<T> {
  /** The last answer this tab held, or null. Synchronous: what the pane's first frame draws. */
  held(): T | null;
  /** Read now, keep the answer, hand it back. A refusal is never kept. */
  read(): Promise<ApiResult<T>>;
  /** Begun now unless the tab holds a current answer: null when it does. */
  warm(): Promise<ApiResult<T>> | null;
}

function keptRead<T>(name: string, fresh: () => Promise<ApiResult<T>>): KeptRead<T> {
  const kept = readCache<ApiResult<T>>(name, (r) => r.ok, { tab: true });
  return {
    held: () => {
      const r = kept.peek("");
      return r && r.ok ? r.data : null;
    },
    read: () => kept.through("", fresh),
    warm: () => kept.warm("", fresh),
  };
}

/** The workspace's partner, as Team's card draws it (team/partner.tsx). */
export const teamPartnerRead = keptRead("team-partner", () => api()("GET team/partner"));
/** Meta's door: whether a number can be connected here, and by whom (connections/whatsapp.ts). */
export const signupDoorRead = keptRead("whatsapp-door", () => api()("GET channels/whatsapp/signup"));
/** Instagram's door: whether an account can be connected here, and by this member (connections/instagram.ts). */
export const instagramDoorRead = keptRead("instagram-door", () => api()("GET channels/instagram"));
/** The member's saved views, where Profile keeps how Ask answers them (profile/pane.tsx AnswerStyle). */
export const savedViewsRead = keptRead("profile-views", () => api()("GET views"));

/** Reads begun together, settled once each has, landed or not; null when none was begun. */
const settledAll = (reads: readonly (Promise<unknown> | null)[]): Promise<unknown> | null => {
  const out = reads.filter((r): r is Promise<unknown> => r !== null);
  return out.length ? Promise.allSettled(out) : null;
};

/** What a pane reads that is no surface: whether the tab holds it, and the read begun (null when the tab holds it current). */
interface PaneRead {
  held(): boolean;
  warm(): Promise<unknown> | null;
}

const PANE_READS: Readonly<Record<string, PaneRead>> = {
  team: { held: () => teamPartnerRead.held() !== null, warm: () => teamPartnerRead.warm() },
  integrations: {
    held: () => signupDoorRead.held() !== null && instagramDoorRead.held() !== null,
    warm: () => settledAll([signupDoorRead.warm(), instagramDoorRead.warm()]),
  },
  profile: { held: () => savedViewsRead.held() !== null, warm: () => savedViewsRead.warm() },
  activity: { held: () => activity.peek({}) !== null, warm: () => activity.warm({}) },
};

/**
 * A pane reached for (its row in the rail or the list, a menu's door to it): its page warmed, the surfaces it reads only
 * where it is drawn begun (Google's on Connections, Ask's memory, the member's alerts), and what it reads that is no surface.
 */
export function warmSettingsPane(pane: string): void {
  reachFor(`admin/${pane}`);
  if (getActiveWorkspace()) void PANE_READS[pane]?.warm();
}

/**
 * The pane an address under Settings names, and whether it names a row after it (`admin/activity/team`: Team's part of the
 * log, which reads its own page); null on another page.
 */
const paneOfAddress = (route: string): { pane: string | null; row: boolean } | null => {
  const [page, pane, row] = route.split("/");
  return page === "admin" ? { pane: pane || null, row: !!row } : null;
};

/**
 * A tab opened on Settings draws its pane whole, once: called once, at module scope, before React and the boot
 * (LegacyApp.tsx), as warmPersonOnScreen is. What the pane reads that is no surface is begun before anything else, and its
 * first draw waits for that and for the surfaces it draws beside its own (surface-registry ROUTE_DRAWS: the partner the rail
 * names, How it answers' Setup, Connections' Google, Hours' calendar…), each a read the head started with the page's
 * (contracts PREFETCH_READS). Never past the route's wait (surface-status.ts firstDrawWaitsFor), and on a load alone: a move
 * to another pane draws what the tab holds, warmed as it was reached for (warmSettingsPane), and never waits for a surface
 * read only where it is drawn. A read the tab already holds is read again behind the draw, not waited for. Off a workspace
 * nothing is read: a read that names none is refused.
 */
export function settingsPaneOnScreen(win: Window = window): void {
  if (!getActiveWorkspace()) return;
  const at = paneOfAddress(routeOnScreen(win));
  if (!at) return;
  // The log's first page is the whole log's: a part of it the address names reads its own.
  const own = at.pane && !(at.pane === "activity" && at.row) ? PANE_READS[at.pane] : undefined;
  const held = !own || own.held();
  const read = own ? own.warm() : null;
  if (read) bootWaitsFor(read);
  const waits = [surfacesSettled(routeDrawsFor("admin", at.pane)), ...(read && !held ? [read] : [])];
  // Let go of after the route's wait however it stands: the gate opens by then anyway, and a wait still out would hold
  // the next visit to Settings too.
  const bound = new Promise<void>((done) => setTimeout(done, ROUTE_WAIT_MS));
  firstDrawWaitsFor("admin", Promise.race([Promise.all(waits), bound]));
}
