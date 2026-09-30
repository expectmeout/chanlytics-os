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

import { clearSurfaceCache } from "./surface-cache";
import { ApiError } from "../client/api";
import { read } from "./api";
import { addressInWorkspace, getActiveWorkspace, rememberWorkspace, workspaceHref } from "./workspace";
import type { RealtimeChange } from "./surface-realtime";
import type { MembershipRole, PendingWorkspace } from "@chanlytics/contracts";
import { peopleLoaded, publishPeople } from "./surfaces/people";
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
  /** Re-apply when a realtime message INSERT arrives (the runner owns the one shared subscription). */
  refreshOnMessageInserts?: boolean;
  /** Re-apply on events from THESE tables instead — an explicit list wins
   *  over the flag (see surface-realtime.ts). */
  refreshOnTables?: string[];
  /** A finer rule per event on top of the table list — see surface-realtime. */
  refreshWhen?: (change: RealtimeChange) => boolean;
  /** Debounce for realtime-triggered re-applies (default 400ms). */
  debounceMs?: number;
  /**
   * Which view of the surface a read is of, for a surface whose view the page picks through the seam (Reports'
   * period, the Calendar's days): reads of one view take their turn (activateOverride), and a read of another view
   * starts at once, the surface dropping the answer for a view it has left.
   */
  view?: () => string;
}

/** A surface's read under way, and the one read asked for while it was out, which everyone asking meanwhile shares. */
interface Reading {
  readonly landed: Promise<unknown>;
  next: Promise<boolean> | null;
}
const reading = new Map<string, Reading>();

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
  // A surface whose view the page picks through the seam queues each view's reads apart: a pick never waits behind a
  // read of the view it left, whose answer the surface drops itself.
  const slot = o.view ? `${o.key}|${o.view()}` : o.key;
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

export const workspaceOverride: SurfaceOverride & { current: () => Workspace | null } = {
  key: "workspace",
  globals: ["__WORKSPACES", "__ME", "__ACTIVE_WORKSPACE", "__PENDING_WORKSPACE", "__SIGNUP_POSTURE"],
  events: ["surface:workspace"], // the sidebar, the arrival line and the bell listen for the list read again
  // The workspace actually being VIEWED, as resolved by the server — not `[0]`, which was whichever tenant happened
  // to sort first and could differ from the one the data below it came from.
  current: () => {
    const w = window as unknown as { __WORKSPACES?: Workspace[]; __ACTIVE_WORKSPACE?: string };
    return w.__WORKSPACES?.find((t) => t.id === w.__ACTIVE_WORKSPACE) ?? null;
  },
  apply: async () => {
    const data = await read("GET workspaces");
    const w = window as unknown as {
      __WORKSPACES?: Workspace[];
      __ME?: Me;
      __ACTIVE_WORKSPACE?: string;
      __PENDING_WORKSPACE?: PendingWorkspace | null;
      __SIGNUP_POSTURE?: "open" | "waitlist" | "invite";
    };
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
        clearSurfaceCache();
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
 * do. Clearing the cache first is what makes the reload cold.
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
  clearSurfaceCache();
  rememberWorkspace(slug);
  window.location.assign(workspaceHref(slug, after));
}
