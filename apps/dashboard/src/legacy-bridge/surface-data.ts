/**
 * The SurfaceData seam (Blueprint v3.0, Slice 0 exit criterion).
 *
 * Contract: every mockup surface reads seeded window globals by default. A
 * slice flips ONE surface to real data by registering an override that
 * (1) fetches from /api/v1, (2) maps rows into the surface's viewmodel and
 * writes the SAME window globals the surface already reads, (3) dispatches the
 * mockup's own window events so mounted components re-render. Sibling surfaces
 * keep their seeds untouched. Overrides live HERE and in contracts viewmodels —
 * never inside legacy page files (the modularity rule).
 *
 * This file holds the seam itself: an override's shape and its activation, and
 * the workspace every read names (who is signed in, which workspace, the switch).
 * Each surface's override is a module of its own beside it in surfaces/: inbox,
 * today, conversations, settings, people, broadcasts, playbooks, calendar,
 * reports, notifications and live.
 */

import { sealSurfaceCache } from "./surface-cache";
import { declareReads } from "./surface-registry";
import { ApiError } from "../client/api";
import { api, read } from "./api";
import { acceptedInTime, acceptInvitations } from "./invitations/accept";
import { addressInWorkspace, getActiveWorkspace, rememberWorkspace, workspaceHref } from "./workspace";
import type { Freshness, OmittedTables, RealtimeChange } from "./surface-realtime";
import {
  MIN_MS,
  type MembershipRole,
  type MessageStatus,
  type PendingWorkspace,
  type RecordKind,
} from "@chanlytics/contracts";
import { peopleLoaded, publishPeople } from "@/surfaces/people/surface";
import type { SurfaceKey } from "../surfaces/surface-values";
export { getActiveWorkspace } from "./workspace";

export interface SurfaceOverride {
  /** Surface key, matching the slice that owns it (e.g. "conversations"). */
  key: string;
  /**
   * The window globals this override owns. The runner snapshots them after a
   * successful apply so the next boot can paint real data before first render
   * instead of flashing the mockup's seeds. Declaring them here (rather than
   * hardcoding a list in the cache) keeps flipping a surface a one-file change.
   */
  globals?: string[];
  /**
   * The key its typed value is published under (surface-values.ts), for a surface a TSX page reads through
   * `useSurface`: the cache keeps that value with the surface's snapshot and gives it back before React draws.
   */
  value?: SurfaceKey;
  /** What of its globals the cache holds, when not all of them: given the snapshot, answers the one to keep. */
  trimSnapshot?: (snap: Record<string, unknown>) => Record<string, unknown>;
  /** Fetch real data and write it into the surface's window globals. */
  apply: () => Promise<void>;
  /** Mockup events to dispatch after apply so mounted components re-render. */
  events?: string[];
  /**
   * The kinds of record it draws (contracts RECORD_KINDS), said once beside how fresh it must stay (`fresh`): both come from
   * `declareReads` (surface-registry.ts), which an override spreads, and which derives `refreshOnTables` and `refreshWhen`
   * from them (decision 0047). A surface that draws nothing a workspace's records tell of says `[]`.
   */
  reads: readonly RecordKind[];
  fresh: Freshness;
  /** The tables of those kinds it leaves unheard on purpose, with the reason (declareReads' `omit`). */
  omit?: OmittedTables;
  /** Re-apply when a realtime message INSERT arrives (the runner owns the one shared subscription). */
  refreshOnMessageInserts?: boolean;
  /**
   * Re-apply on events from THESE tables instead — an explicit list wins over the flag (see surface-realtime.ts). Derived
   * from `reads` and `fresh` by `declareReads`; an override never writes it.
   */
  refreshOnTables?: string[];
  /**
   * A finer rule per event on top of the table list — see surface-realtime. Derived by `declareReads` from the surface's
   * `when` and, for a surface heard on its page alone, the page rule.
   */
  refreshWhen?: (change: RealtimeChange) => boolean;
  /** The statuses a message's UPDATE re-applies this surface for; none when absent — see surface-realtime. */
  refreshOnMessageStatuses?: readonly MessageStatus[];
  /** Debounce for realtime-triggered re-applies (default 400ms). */
  debounceMs?: number;
  /**
   * The longest a burst of realtime changes is waited out, from the first: the runner reads three seconds after the first change at
   * the latest (surface-runner.ts), so a surface that asks for more than that in `debounceMs` says here how much it may have. A
   * read that is dear and moves by one in a hundred for a message (Today's headline) names fifteen seconds of quiet and thirty at most.
   */
  maxWaitMs?: number;
  /**
   * Read again when the business's day turns, by the workspace's zone, in a visible tab (a hidden one reads as it is shown): for
   * a surface that counts "the day so far", which nothing else moves at midnight (`watchTheDayTurn`, surface-runner.ts). An `onDemand` one is read where
   * its page is on screen and kept for its page elsewhere, as a return to the tab does.
   */
  readAtMidnight?: boolean;
  /**
   * Which view of the surface a read is of, for a surface whose view the page picks through the seam (Reports'
   * period, the Calendar's days): reads of one view take their turn (activateOverride), and a read of another view
   * starts at once, the surface dropping the answer for a view it has left.
   */
  view?: () => string;
  /**
   * Read only where it is drawn. The boot's second pass (every surface nobody on screen draws), a return to the tab, the network
   * back, a rejoin of the live feed and the shell's Retry-all leave it alone unless the page on screen is drawn from it (its own
   * surface, or one the route names in ROUTE_DRAWS); and it is read as such a page comes on screen: the first time, after a pass
   * left it for its page, and again when `isStale` says it has aged (surface-registry.ts readWhatWasMissed). A refresh asked for
   * by name (a write's, a pick's, one Retry) is still made.
   */
  onDemand?: boolean;
  /** For an `onDemand` surface: whether what it holds has aged enough that its page, coming on screen, reads it again (`readAged`). */
  isStale?: () => boolean;
}

/** How many minutes old a held read of an `onDemand` surface may be before its page, coming on screen, reads it again. */
export const ON_DEMAND_STALE_MIN = 5;
const ON_DEMAND_STALE_MS = ON_DEMAND_STALE_MIN * MIN_MS;

/**
 * Whether a read made at `at` has aged, or was never made (`at` undefined): the one measure Google's read (google.ts), the Reviews
 * read and Today's headline (surfaces/reports/period-surface.ts) hold their `isStale` to, each against when it was read.
 */
export function readAged(at: number | undefined): boolean {
  return at === undefined || Date.now() - at > ON_DEMAND_STALE_MS;
}

/** A surface's read under way, and the one read asked for while it was out, which everyone asking meanwhile shares. */
interface Reading {
  readonly landed: Promise<unknown>;
  next: Promise<boolean> | null;
}
const reading = new Map<string, Reading>();

/**
 * What a read is a read of: the surface, and for one whose view the page picks through the seam, the view shown now. A surface
 * whose view the page picks queues each view's reads apart: a pick never waits behind a read of the view it left, whose answer
 * the surface drops itself. The runner remembers what it has read by the same name (surface-runner.ts), so a read of the view
 * left is no read of the view shown.
 */
export function readSlot(o: Pick<SurfaceOverride, "key" | "view">): string {
  return o.view ? `${o.key}|${o.view()}` : o.key;
}

/**
 * Read a surface and publish what it answered: one read at a time for each surface, so the newest read is the one
 * that lands last.
 *
 * A surface is read by its boot, by the live feed, after a write (refresh-map.ts), by a return to the tab and by
 * Retry, and nothing ordered them: a read asked for second could answer first, and the first, landing after it, wrote
 * the older rows over the newer ones until something read it again (a write's refresh and a feed's, or a return pass
 * beside a debounced event). Now a read asked for while one is out starts when that one has landed, and everyone who
 * asks meanwhile shares it: each caller is answered by a read that started after it asked.
 */
export function activateOverride(o: SurfaceOverride): Promise<boolean> {
  const slot = readSlot(o);
  const out = reading.get(slot);
  if (!out) return startReading(o, slot);
  out.next ??= out.landed.then(() => startReading(o, slot));
  return out.next;
}

function startReading(o: SurfaceOverride, slot: string): Promise<boolean> {
  const read = readAndPublish(o);
  const mine: Reading = { landed: read.catch(() => undefined), next: null };
  reading.set(slot, mine);
  // Registered before any caller's wait on `landed`, so it runs first: with a read queued behind it, the queue's own
  // start takes the slot; with none, the slot is let go.
  void mine.landed.then(() => {
    if (reading.get(slot) === mine && !mine.next) reading.delete(slot);
  });
  return read;
}

async function readAndPublish(o: SurfaceOverride): Promise<boolean> {
  try {
    await o.apply();
    for (const e of o.events ?? []) window.dispatchEvent(new CustomEvent(e));
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === "unauthorized") throw err;
    // A failed override NEVER breaks the surface — it just stays seeded.
    console.error("surface_override_failed", o.key, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * First consumer: the real workspace (RLS-scoped tenants via /api/v1/workspaces).
 * Stashes the result for the bridge pill; Slice 1's conversations override
 * follows this exact fetch→map→dispatch pattern against CONVERSATIONS_DATA.
 */
export interface Workspace {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  /** How its customers buy (0008): deals are on exactly when it is "proposal" (dealsAreOn); null is not asked yet. */
  sells_by?: string | null;
  /** The caller's role in it (0012): said beside every workspace on the switcher. */
  role?: string | null;
  /** Where its own logo is served (00407): the sidebar's circle, the rail and the switcher draw it over its initials. */
  logo_url?: string | null;
}

export interface Me {
  id: string;
  email: string | null;
  role?: MembershipRole | null;
  display_name?: string | null;
  /** Whether the Chanlytics back office exists for this person. Never the authorization -- every platform route asks the database. */
  platform_admin?: boolean;
  /** Whether this person is a partner (0012), and their code. */
  partner?: { code: string; status: string } | null;
}

/** Whether the list has been read again for the seat the boot's accept made (invitations/accept.ts): once, not at every read after it. */
let seatedRead = false;

export const workspaceOverride: SurfaceOverride & { current: () => Workspace | null } = {
  key: "workspace",
  globals: ["__WORKSPACES", "__ME", "__ACTIVE_WORKSPACE", "__PENDING_WORKSPACE", "__SIGNUP_POSTURE"],
  events: ["surface:workspace"], // the sidebar, the arrival line and the bell listen for the list read again
  // The seats and the workspaces' own status (0047): a seat taken, changed or left (the role this person acts under, the
  // switcher's list, and the end of their own seat in the workspace on screen) and the workspace paused or resumed (the
  // shell's band). A few a month, so heard wherever the tab is.
  ...declareReads("workspace", {
    reads: ["team", "workspace"],
    fresh: "live",
    omit: [
      {
        tables: ["invitations"],
        why: "an invitation sent or revoked is the Team pane's (Settings); the switcher follows the seat it becomes, which is heard",
      },
    ],
  }),
  // The workspace actually being VIEWED, as resolved by the server — not `[0]`, which was whichever tenant happened
  // to sort first and could differ from the one the data below it came from.
  current: () => {
    const w = window as unknown as { __WORKSPACES?: Workspace[]; __ACTIVE_WORKSPACE?: string };
    return w.__WORKSPACES?.find((t) => t.id === w.__ACTIVE_WORKSPACE) ?? null;
  },
  apply: async () => {
    // The invitations this sign-in completes are one POST (invitations/accept.ts), asked as the list is, not by it (a read never
    // writes: decision 0047, lane 6). It costs the boot nothing when the list is whole: only a list that holds no workspace,
    // or none the address names, waits for it, since that is the list an invitation is about to change, and is read again
    // when it seated someone. A seat made beside a whole list reaches the switcher through the live feed (memberships).
    void acceptInvitations();
    let data = await read("GET workspaces");
    const named = getActiveWorkspace();
    const holdsIt = !named || data.workspaces.some((t) => t.slug === named || t.id === named);
    if (!seatedRead && (!data.workspaces.length || !holdsIt) && (await acceptedInTime()).length) {
      // The seat is made, so what the tab shares or the head started is the list from before it. Read once for it.
      seatedRead = true;
      api().forget();
      data = await read("GET workspaces");
    }
    const w = window as unknown as {
      __WORKSPACES?: Workspace[];
      __ME?: Me;
      __ACTIVE_WORKSPACE?: string;
      __PENDING_WORKSPACE?: PendingWorkspace | null;
      __SIGNUP_POSTURE?: "open" | "waitlist" | "invite";
    };
    // The workspace on screen was this person's and is not any more (their seat was removed, in another tab or by a
    // teammate): the tab leaves it for one of their others, else the front door, which shows them none. Said only of a list
    // that held it: the first read of a tab has no list, and its address is corrected below. Sealed, as every leaving is: a
    // read landing before the page unloads is of the workspace being left (surface-cache.ts).
    const viewing = w.__ACTIVE_WORKSPACE;
    if (viewing && w.__WORKSPACES?.some((t) => t.id === viewing) && !data.workspaces.some((t) => t.id === viewing)) {
      const next = data.workspaces.find((t) => t.id === data.activeWorkspaceId) ?? data.workspaces[0];
      sealSurfaceCache();
      rememberWorkspace(next?.slug ?? null);
      window.location.replace(next ? workspaceHref(next.slug) : "/");
      return;
    }
    w.__WORKSPACES = data.workspaces;
    w.__PENDING_WORKSPACE = "pending" in data ? (data.pending ?? null) : null;
    // The door a first workspace meets (the invite code, or the list), from the
    // same read: the create screen asks nothing of its own.
    w.__SIGNUP_POSTURE = "posture" in data ? (data.posture ?? "open") : "open";
    // The server had the last word on which workspace this is — it validated
    // membership and may have overridden a stale stored preference. Record what
    // it decided, so every later request agrees with the data already rendered.
    if (data.activeWorkspaceId) {
      w.__ACTIVE_WORKSPACE = data.activeWorkspaceId;
      const active = data.workspaces.find((t) => t.id === data.activeWorkspaceId);
      const slug = active?.slug ?? data.activeWorkspaceId;
      rememberWorkspace(slug);
      // The address says what the server decided. A path that names a
      // workspace this account may not use here (a membership gone, another
      // account's preference), or names it by id where the slug belongs, is
      // corrected before the other surfaces paint under it: a navigation, so
      // everything boots again under the right name.
      const here = getActiveWorkspace();
      if (here && here !== slug) {
        // Sealed: a read landing before the page unloads is of the address being left (surface-cache.ts).
        sealSurfaceCache();
        window.location.replace(addressInWorkspace(slug, window.location));
        return;
      }
    }
    // The sidebar renders whoever this says — replacing the mockup's
    // hardcoded operator, who was a fabricated person shown as "you".
    if (data.user) {
      const was = w.__ME?.id ?? null;
      w.__ME = data.user;
      // People read before who is looking was known is read again for them (decision 0009): a teammate's thread is
      // theirs, and a list about "me" can be counted.
      if (peopleLoaded && was !== (data.user.id ?? null)) {
        publishPeople();
        window.dispatchEvent(new CustomEvent("surface:clients"));
      }
    }
  },
};

/**
 * Switch workspace: forget the previous one's rows, then go to its address.
 *
 * A navigation rather than a refetch, deliberately. The mockup seeds React
 * state from globals at mount, so the surfaces would need bespoke re-seeding to
 * swap tenant underneath them — and getting that wrong shows one business's
 * threads under another's name, which is the single worst thing this app can
 * do. Clearing the cache first is what makes the reload cold, and sealing it is
 * what keeps it cold: a read landing before the page unloads went back into the
 * tab under the workspace being left (surface-cache.ts sealSurfaceCache).
 *
 * `knownSlug` when the caller has it and the page's own list may not. A
 * workspace created a moment ago is not in __WORKSPACES yet; addressed by its
 * id, the app booted twice -- under the id, then again when the workspaces
 * read corrected the address -- and Setup's once-a-session landing could fire
 * on the first boot and be lost with it (the nightly's workspace-create spec,
 * 13 Sep 2026).
 *
 * `after` is where the workspace opens: a route for one just made (the first
 * run, `#/start`, which is written as its path); nothing, and a switch opens on Today.
 */
export function switchWorkspace(id: string, knownSlug?: string, after = ""): void {
  const target = (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES?.find((t) => t.id === id);
  const slug = target?.slug ?? knownSlug ?? id;
  const here = getActiveWorkspace();
  if (here === slug || here === id) return;
  sealSurfaceCache();
  rememberWorkspace(slug);
  window.location.assign(workspaceHref(slug, after));
}
