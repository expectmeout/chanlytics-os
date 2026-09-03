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
 */

import { clearSurfaceCache } from "./surface-cache";

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
  /** Fetch real data and write it into the surface's window globals. */
  apply: () => Promise<void>;
  /** Mockup events to dispatch after apply so mounted components re-render. */
  events?: string[];
  /** Re-apply when a realtime message INSERT arrives (the runner owns the one shared subscription). */
  refreshOnMessageInserts?: boolean;
  /** Debounce for realtime-triggered re-applies (default 400ms). */
  debounceMs?: number;
}

/** Session-expiry-aware fetch: 401 becomes a typed signal the runner redirects on. */
export class UnauthorizedError extends Error {
  constructor() { super("unauthorized"); this.name = "UnauthorizedError"; }
}

/**
 * In-flight de-duplication. Three overrides independently ask for the same
 * endpoints, so one boot issued nine requests across five URLs — four of them
 * byte-identical duplicates — and every realtime message and every tab focus
 * repeated the pattern. Each one also costs two server-side getUser() round
 * trips (middleware + route), so the waste is real DB load, not just bytes.
 *
 * Callers stay naive: they each ask for what they need, and concurrent asks
 * for the same URL share one response. The window is deliberately short —
 * this collapses a burst, it is not a cache.
 */
const inFlight = new Map<string, { p: Promise<unknown>; at: number }>();
const INFLIGHT_MS = 2000;

/* --------------------------- the active workspace ------------------------- */

const WS_KEY = "chanlytics.workspace";

/**
 * Which workspace every request on this page is about.
 *
 * Nothing used to send this, so the API answered from whatever default each
 * route happened to pick — three different rules — and the read endpoints,
 * scoped only by RLS, returned every workspace the caller belonged to merged
 * into one list. One id, chosen once, appended at this chokepoint so no call
 * site can forget it.
 *
 * localStorage, not session: which business you are looking at is a preference
 * that should survive a reload, unlike the cached rows themselves. It is only
 * ever a REQUEST — the server validates membership and ignores an id the caller
 * has no claim to, so a tampered value grants nothing.
 */
let activeWorkspace: string | null = null;

export function getActiveWorkspace(): string | null {
  if (activeWorkspace) return activeWorkspace;
  try {
    activeWorkspace = localStorage.getItem(WS_KEY);
  } catch {
    // private mode / storage disabled — the server default applies
  }
  return activeWorkspace;
}

export function setActiveWorkspace(id: string | null): void {
  activeWorkspace = id;
  try {
    if (id) localStorage.setItem(WS_KEY, id);
    else localStorage.removeItem(WS_KEY);
  } catch {
    /* the in-memory value still holds for this page */
  }
}

/**
 * Append ?workspace= unless the caller named one explicitly.
 *
 * Exported because reads were not the only thing that needs it. The verb
 * courier fetched its URLs verbatim, so every mutation arrived with no
 * workspace named — and the server's own ambiguity guard then refuses any
 * write from an account holding more than one membership, which self-serve
 * workspace creation makes an ordinary state. The symptom is a Save button
 * that returns "say which workspace" with no control that can say it.
 */
export function scoped(url: string): string {
  const ws = getActiveWorkspace();
  if (!ws || url.includes("workspace=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(ws)}`;
}

export async function fetchEnvelope<T>(rawUrl: string): Promise<T> {
  const url = scoped(rawUrl);
  const hit = inFlight.get(url);
  if (hit && Date.now() - hit.at < INFLIGHT_MS) return hit.p as Promise<T>;

  const p = (async () => {
    const res = await fetch(url);
    if (res.status === 401) throw new UnauthorizedError();
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: T } | null;
    if (!j || !j.ok || j.data === undefined) throw new Error(`${url} -> ${res.status}`);
    return j.data;
  })();

  // A rejection must not be shared beyond its burst, or one blip fails every
  // later caller too. Drop the entry as soon as it settles.
  inFlight.set(url, { p, at: Date.now() });
  p.finally(() => {
    if (inFlight.get(url)?.p === p) inFlight.delete(url);
  }).catch(() => {});

  return p;
}

export async function activateOverride(o: SurfaceOverride): Promise<boolean> {
  try {
    await o.apply();
    for (const e of o.events ?? []) window.dispatchEvent(new CustomEvent(e));
    return true;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
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
export interface Workspace { id: string; slug: string; name: string; status: string; timezone: string }

export interface Me { id: string; email: string | null; role?: "owner" | "operator" | "viewer" | null }

export const workspaceOverride: SurfaceOverride & { current: () => Workspace | null } = {
  key: "workspace",
  globals: ["__WORKSPACES", "__ME", "__ACTIVE_WORKSPACE"],
  // The workspace actually being VIEWED, as resolved by the server — not
  // `[0]`, which was whichever tenant happened to sort first and could differ
  // from the one the data below it came from.
  current: () => {
    const w = window as unknown as { __WORKSPACES?: Workspace[]; __ACTIVE_WORKSPACE?: string };
    return w.__WORKSPACES?.find((t) => t.id === w.__ACTIVE_WORKSPACE) ?? w.__WORKSPACES?.[0] ?? null;
  },
  apply: async () => {
    const data = await fetchEnvelope<{
      workspaces: Workspace[];
      activeWorkspaceId?: string;
      user?: Me;
    }>("/api/v1/workspaces");
    const w = window as unknown as {
      __WORKSPACES?: Workspace[];
      __ME?: Me;
      __ACTIVE_WORKSPACE?: string;
    };
    w.__WORKSPACES = data.workspaces;
    // The server had the last word on which workspace this is — it validated
    // membership and may have overridden a stale stored preference. Record what
    // it decided, so every later request agrees with the data already rendered.
    if (data.activeWorkspaceId) {
      w.__ACTIVE_WORKSPACE = data.activeWorkspaceId;
      setActiveWorkspace(data.activeWorkspaceId);
    }
    // The sidebar renders whoever this says — replacing the mockup's
    // hardcoded operator, who was a fabricated person shown as "you".
    if (data.user) w.__ME = data.user;
  },
};

/**
 * Switch workspace: forget the previous one's rows, then reload.
 *
 * A full reload rather than a refetch, deliberately. The mockup seeds React
 * state from globals at mount, so the surfaces would need bespoke re-seeding to
 * swap tenant underneath them — and getting that wrong shows one business's
 * threads under another's name, which is the single worst thing this app can
 * do. Clearing the cache first is what makes the reload cold.
 */
export function switchWorkspace(id: string): void {
  if (id === getActiveWorkspace()) return;
  clearSurfaceCache();
  setActiveWorkspace(id);
  window.location.assign("/");
}

/**
 * Slice 1: the Conversations surface flips to real data. Fetch → map through
 * the contracts viewmodel → swap the SAME global the surface reads → dispatch
 * its refresh event. Siblings keep their seeds. Realtime message inserts
 * re-run this apply (debounced in the bridge).
 */
import {
  toConversationVM,
  toInboxThreadVM,
  toCallVM,
  threadStanding,
  toTodayVM,
  type ConversationDto,
  type EscalationDto,
  type CallDto,
  type MetricsSummaryDto,
  type TodayVM,
} from "@chanlytics/contracts";

/**
 * Slice 2: the Inbox flips to the real escalations queue. Open escalations +
 * needs_human conversations land in the "escalated" bucket (the mockup's
 * built-in take-over/hand-back UX), snoozed in "snoozed", the rest in "done".
 * Approval cards/confidence/$ stay hidden — v1.1 material, never fabricated.
 */
interface EscalationRow extends EscalationDto {
  conversation_id: string;
}

/** The only buckets real threads can reach (Blueprint honesty rule). */
const REAL_BUCKETS = [
  { id: "escalated", label: "Needs you", hint: "The receptionist stopped and asked for a human", icon: "flag", accent: true },
  { id: "done", label: "Handled", hint: "Answered by the receptionist — nothing owed", icon: "check" },
  { id: "snoozed", label: "Snoozed", hint: "Hidden until they wake", icon: "clock" },
];

export const inboxOverride: SurfaceOverride = {
  key: "inbox",
  globals: ["INBOX_DATA"],
  // inbox:counts is NOT dispatched here — a detail-less event zeroes the
  // sidebar badge; the reseeded Inbox emits the real count itself.
  events: ["surface:inbox"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [convData, escData] = await Promise.all([
      fetchEnvelope<{ conversations: ConversationDto[] }>("/api/v1/conversations"),
      fetchEnvelope<{ escalations: EscalationRow[] }>("/api/v1/escalations?state=open"),
    ]);
    const byConv = new Map<string, EscalationRow>();
    for (const e of escData.escalations) byConv.set(e.conversation_id, e);

    // A thread that escalated but has since gone quiet can fall outside the
    // newest-100 conversations page — fetch those individually rather than
    // letting a waiting customer be invisible.
    const listed = new Set(convData.conversations.map((c) => c.id));
    const missing = [...byConv.keys()].filter((id) => !listed.has(id));
    const extra = (
      await Promise.all(
        missing.slice(0, 20).map((id) =>
          fetchEnvelope<{ conversation: ConversationDto; messages: ConversationDto["messages"] }>(
            `/api/v1/conversations/${id}`,
          )
            .then((d) => ({ ...d.conversation, messages: d.messages }))
            .catch(() => null),
        ),
      )
    ).filter((c): c is ConversationDto => !!c);

    const all = [...extra, ...convData.conversations];
    const threads = all.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null));
    const w = window as unknown as {
      INBOX_DATA?: Record<string, unknown> & { CHANNEL_LABELS?: Record<string, string>; INBOX_BASELINE?: Record<string, unknown> };
    };
    const prev = w.INBOX_DATA ?? {};
    w.INBOX_DATA = {
      ...prev,
      THREADS: threads,
      INBOX_BUCKETS: REAL_BUCKETS,
      INBOX_VIEWS: [], // saved views are all structurally zero on real data
      CHANNEL_LABELS: { ...(prev.CHANNEL_LABELS ?? {}), whatsapp: "WhatsApp" },
      INBOX_BASELINE: { ...(prev.INBOX_BASELINE ?? {}), doneThisWeek: 0 },
    };
  },
};

/**
 * Slice 4: Today. Unlike every other surface, this one has NO seed to fall back
 * to — TODAY_DATA does not exist until a fetch succeeds. That is deliberate:
 * the seeded Today rendered "$1,840 revenue · 12 appointments · on pace to
 * clear $4,200", so a failed fetch falling back to seeds would show fabricated
 * revenue at the exact moment the app knows nothing. Undefined makes the page
 * say "can't reach your workspace" instead.
 *
 * A DEGRADED refresh (was live, refresh failed) keeps the last real payload,
 * which is correct — the data is true but stale, and the bridge pill says so.
 */
export const todayOverride: SurfaceOverride = {
  key: "today",
  globals: ["TODAY_DATA"],
  events: ["surface:today"],
  refreshOnMessageInserts: true,
  debounceMs: 800, // the recap is aggregate, not per-thread — no need to be twitchy
  apply: async () => {
    // Calls are additive context, not a precondition — a voice outage must not
    // blank the brief — but they are fetched WITH the others rather than
    // waterfalled behind them, so the slowest request sets the wall clock.
    const [metricsRes, convData, escData, callsRes] = await Promise.all([
      fetchEnvelope<{ metrics: MetricsSummaryDto }>("/api/v1/metrics?days=1"),
      fetchEnvelope<{ conversations: ConversationDto[] }>("/api/v1/conversations"),
      fetchEnvelope<{ escalations: EscalationRow[] }>("/api/v1/escalations?state=open"),
      fetchEnvelope<{ calls: CallDto[] }>("/api/v1/calls").catch((e: unknown) => e as Error),
    ]);
    let calls: CallDto[] = [];
    try {
      if (callsRes instanceof Error) throw callsRes;
      calls = callsRes.calls;
    } catch (e) {
      console.error("today_calls_fetch_failed", e instanceof Error ? e.message : e);
    }
    (window as unknown as { TODAY_DATA?: TodayVM }).TODAY_DATA = toTodayVM(
      metricsRes.metrics,
      convData.conversations,
      escData.escalations,
      calls,
    );

    // The sidebar badge is seeded until the Inbox itself mounts, so a fresh
    // load put a fabricated "6" one inch from Today's honest "0 need you".
    // Today already holds the real rows — publish the count. Detail is
    // REQUIRED: a detail-less inbox:counts zeroes the badge instead of
    // correcting it.
    //
    // Counted with threadStanding, the same rule the Inbox itself uses. This
    // used to publish metrics.now.escalations_open, which is a DIFFERENT
    // number — it counts open escalations including ones a teammate has already
    // claimed, so it read high exactly when someone was doing the work, and
    // then overwrote the Inbox's correct count on every Today refresh.
    const openByConv = new Map(escData.escalations.map((e) => [e.conversation_id, e]));
    const needs = convData.conversations.filter(
      (c) => threadStanding(c, openByConv.get(c.id) ?? null).needsYou,
    ).length;
    window.dispatchEvent(new CustomEvent("inbox:counts", { detail: { needs } }));
  },
};

export const conversationsOverride: SurfaceOverride = {
  key: "conversations",
  globals: ["CONVERSATIONS_DATA"],
  events: ["surface:conversations"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [data, callsRes] = await Promise.all([
      fetchEnvelope<{ conversations: ConversationDto[] }>("/api/v1/conversations"),
      fetchEnvelope<{ calls: CallDto[] }>("/api/v1/calls").catch((e: unknown) => e as Error),
    ]);
    const w = window as unknown as {
      CONVERSATIONS_DATA?: { CONVERSATIONS: unknown[]; CV_CHANNELS: unknown[] };
    };
    // Calls get their OWN rows: a thread answers "am I on the hook to reply",
    // a call answers "is my AI saying the right things on the phone" — the
    // second is a transcript plus audio that cannot live in a chat bubble.
    // The call row carries no decision affordance; the Inbox owns "needs you".
    let callRows: unknown[] = [];
    try {
      if (callsRes instanceof Error) throw callsRes;
      callRows = callsRes.calls.map((c) => toCallVM(c));
    } catch (e) {
      console.error("calls_fetch_failed", e instanceof Error ? e.message : e);
    }
    // A customer who has only ever phoned is fully represented by their call
    // rows; a chat row for them would preview a call that is already on screen.
    const threads = data.conversations.map((c) => toConversationVM(c)).filter((t) => t.hasChat);
    // Newest first by REAL timestamp. The previous sort localeCompare'd the
    // display strings ("Aug 26" vs "3:22 AM"), which is not an ordering at
    // all — a message sent this morning listed below yesterday's calls.
    const merged = [...threads, ...callRows].sort(
      (a, b) => ((b as { ts?: number }).ts ?? 0) - ((a as { ts?: number }).ts ?? 0),
    );
    w.CONVERSATIONS_DATA = {
      CONVERSATIONS: merged,
      CV_CHANNELS: [
        { id: "all", label: "All" },
        ...(callRows.length ? [{ id: "phone", label: "Calls" }] : []),
        ...(threads.length ? [{ id: "chats", label: "WhatsApp" }] : []),
      ],
    };
  },
};

/**
 * Settings · Workspace — the business's own facts, and who is on the team.
 *
 * The pane rendered "Serenity Spa · +1 (415) 555-0100 · Lena Park, Jay Rivera"
 * — a fabricated business with fabricated staff, shown to a real owner as their
 * own settings. Both APIs behind it have existed since Session B with nothing
 * calling them.
 *
 * Team is fetched even though the card is small: leaving it seeded would mean
 * flipping this pane to "real" while half of it was still invented, which is
 * exactly the thing the surface registry exists to prevent.
 */
export interface WorkspaceSettings {
  brain?: {
    business_name?: string;
    phone_display?: string;
    booking_link?: string;
    profile?: Record<string, unknown>;
  };
}

export const settingsOverride: SurfaceOverride = {
  key: "settings",
  globals: ["__SETTINGS", "__TEAM"],
  events: ["surface:settings"],
  apply: async () => {
    const [cfg, team] = await Promise.all([
      fetchEnvelope<{ config: WorkspaceSettings; version: number; role: string }>("/api/v1/settings"),
      // A team read that fails must not blank the business card beside it.
      fetchEnvelope<{ members: unknown[] }>("/api/v1/team").catch((e: unknown) => e as Error),
    ]);
    const w = window as unknown as {
      __SETTINGS?: { config: WorkspaceSettings; version: number; role: string };
      __TEAM?: unknown[] | null;
    };
    w.__SETTINGS = { config: cfg.config ?? {}, version: cfg.version, role: cfg.role };
    if (team instanceof Error) {
      // null, not [] — "we could not read the team" and "there is nobody" are
      // different facts, and only one of them should render as an empty list.
      w.__TEAM = null;
      console.error("settings_team_fetch_failed", team.message);
    } else {
      w.__TEAM = team.members ?? [];
    }
  },
};
