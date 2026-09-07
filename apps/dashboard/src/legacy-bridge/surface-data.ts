import { POLICY_CLASS_WORDS } from "@chanlytics/contracts";
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
import { DEFAULT_REFRESH_TABLES, type RealtimeChange } from "./surface-realtime";
import type { NotificationsDto } from "@chanlytics/contracts";
import type { PoliciesSurface, PolicyRecordLike } from "./policy-store";

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
  /** Re-apply on events from THESE tables instead — an explicit list wins
   *  over the flag (see surface-realtime.ts). */
  refreshOnTables?: string[];
  /** A finer rule per event on top of the table list — see surface-realtime. */
  refreshWhen?: (change: RealtimeChange) => boolean;
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

/**
 * Forget every in-flight response.
 *
 * The collapser above shares a pending request for two seconds, which is right
 * for three overrides asking for the same list at boot — and wrong the instant
 * something has been WRITTEN. A verb commits and then refreshes; that refresh
 * joins a request issued BEFORE the commit and repaints the thread exactly as
 * it was, under a pill still saying "live". That is a second cause of the
 * regression the runner's own comment describes as fixed, and one that
 * threading an AbortSignal would not have closed.
 *
 * Called by the verb courier on any 2xx: after a successful write, nothing
 * already in flight can be describing the world the operator is now in.
 */
export function invalidateInFlight(): void {
  inFlight.clear();
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
  toLiveVM,
  type LiveVM,
  threadStanding,
  toTodayVM,
  type ConversationDto,
  type EscalationDto,
  type CallDto,
  type MetricsSummaryDto,
  type TodayVM,
  toPersonRowVM,
  peopleAggregates,
  PEOPLE_LISTS,
  PEOPLE_LIST_GROUPS,
  peopleListAction,
  type PersonRowDto,
  type PersonRowVM,
  type PeopleAggregates,
  recencyCells,
  attentionRow,
  type AttentionRowVM,
  PEOPLE_TABS,
  toChannelVM,
  type ChannelDto,
  type ChannelVM,
  toReportVM,
  REPORT_RANGES,
  type ReportDto,
  type ReportVM,
  toCampaignReportVM,
  type CampaignReportDto,
  type CampaignReportVM,
  toCalendarVM,
  windowFor,
  toBookingReportVM,
  type BookingReportDto,
  type BookingReportVM,
  type CalendarWeekDto,
  type CalendarVM,
} from "@chanlytics/contracts";
import { EVERYONE_LABEL, HELD_REASONS, OFFERS_OPT_IN_PHRASES, eligibleFor, formatPhoneDisplay, numberHealth, optInLink, toBroadcastVM, type AudienceKind, type BroadcastDto, type BroadcastVM, type NumberHealth } from "@chanlytics/contracts";
import { PLAYBOOK_TRIGGERS, eligibleForPlaybook, nextRunLabel, scheduleLine, triggerOf, type PlaybookDto } from "@chanlytics/contracts";

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

/** One approved template, as the composer needs to know it. */
export interface ApprovedTemplate {
  id: string;
  channel: string;
  name: string;
  language: string;
  body_preview: string | null;
  variables: unknown;
}

/** Every template with its status, for Settings; the composer keeps ApprovedTemplate. */
export interface TemplateDto extends ApprovedTemplate {
  category: string | null;
  meta_status: string;
  quality: string | null;
  rejected_reason: string | null;
  synced_at: string | null;
  /** meta: written in WhatsApp Manager. chanlytics: written here. */
  source?: string | null;
  /** Hidden from the composers by the workspace; Settings still lists it. */
  hidden_at?: string | null;
  /** The workspace's own words for it; null means its name, made words. */
  title?: string | null;
}

export const inboxOverride: SurfaceOverride = {
  key: "inbox",
  globals: ["INBOX_DATA", "__TEMPLATES"],
  // inbox:counts is NOT dispatched here — a detail-less event zeroes the
  // sidebar badge; the reseeded Inbox emits the real count itself.
  events: ["surface:inbox"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [convData, escData, tplRes] = await Promise.all([
      fetchEnvelope<{ conversations: ConversationDto[] }>("/api/v1/conversations"),
      fetchEnvelope<{ escalations: EscalationRow[] }>("/api/v1/escalations?state=open"),
      // The one send that works outside the 24-hour window. The composer named
      // a template by a hardcoded literal and this endpoint had no caller at
      // all, so a workspace whose approved template is registered under any
      // other name — or which has none yet, which is every new workspace —
      // showed a working-looking button that failed on click with a message
      // the operator could do nothing about.
      //
      // Additive, like calls: a template read that fails must not blank the
      // Inbox. It degrades to "no approved template", which is the honest
      // reading of "we do not know of one".
      fetchEnvelope<{ templates: ApprovedTemplate[] }>("/api/v1/templates").catch(
        (e: unknown) => e as Error,
      ),
    ]);
    const w0 = window as unknown as { __TEMPLATES?: ApprovedTemplate[] };
    if (tplRes instanceof Error) {
      w0.__TEMPLATES = [];
      console.error("templates_fetch_failed", tplRes.message);
    } else {
      w0.__TEMPLATES = (tplRes.templates ?? []).filter((t) => t.channel === "whatsapp");
    }
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
      CHANNEL_LABELS: { ...(prev.CHANNEL_LABELS ?? {}), whatsapp: "WhatsApp", phone: "Phone" },
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
  // Calls too: the brief now shows who is on the line, and a call that ends
  // must leave it. The default trio never included the calls table — and the
  // transcript turn every few seconds (an UPDATE that keeps the status
  // ongoing) must NOT re-run three plpgsql aggregates; a start or an end does.
  refreshOnTables: [...DEFAULT_REFRESH_TABLES, "calls"],
  refreshWhen: (c) => c.table !== "calls" || c.event !== "UPDATE" || c.row.status !== "ongoing",
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
  globals: ["__SETTINGS", "__TEAM", "__TEAM_INVITES", "__POLICIES", "__CHANNELS", "__TEMPLATES_ALL"],
  events: ["surface:settings"],
  apply: async () => {
    const [cfg, team, pol, ch, tpl] = await Promise.all([
      fetchEnvelope<{ config: WorkspaceSettings | null; version: number; role: string; configBroken?: boolean; issues?: string[] }>("/api/v1/settings"),
      // A team read that fails must not blank the business card beside it.
      fetchEnvelope<{ members: unknown[]; invites?: unknown[] }>("/api/v1/team").catch((e: unknown) => e as Error),
      // The autonomy matrix. Same rule: a failed read is its own state (null),
      // never the mockup's charter.
      fetchEnvelope<{ policies: PolicyRecordLike[]; role?: string }>("/api/v1/policies").catch((e: unknown) => e as Error),
      // The numbers the business is reachable on, for Integrations.
      fetchEnvelope<{ channels: ChannelDto[] }>("/api/v1/channels").catch((e: unknown) => e as Error),
      // Every template with its status, for the Integrations pane's card.
      fetchEnvelope<{ templates: TemplateDto[] }>("/api/v1/templates?all=1").catch((e: unknown) => e as Error),
    ]);
    const w = window as unknown as {
      __SETTINGS?: { config: WorkspaceSettings | null; version: number; role: string; broken: { issues: string[] } | null };
      __TEAM?: unknown[] | null;
      __TEAM_INVITES?: unknown[] | null;
      __POLICIES?: PoliciesSurface | null;
      __CHANNELS?: ChannelVM[] | null;
      __TEMPLATES_ALL?: TemplateDto[] | null;
    };
    // `broken` is its own state, not an empty config: the pane closes its
    // forms on it, because a save from a form that read {} would replace the
    // broken row with the form's few fields.
    w.__SETTINGS = cfg.configBroken
      ? { config: null, version: cfg.version, role: cfg.role, broken: { issues: cfg.issues ?? [] } }
      : { config: cfg.config ?? {}, version: cfg.version, role: cfg.role, broken: null };
    if (ch instanceof Error) {
      w.__CHANNELS = null;
      console.error("settings_channels_fetch_failed", ch.message);
    } else {
      const now = new Date();
      w.__CHANNELS = (ch.channels ?? []).map((c) => toChannelVM(c, now));
    }
    if (tpl instanceof Error) {
      w.__TEMPLATES_ALL = null;
      console.error("settings_templates_fetch_failed", tpl.message);
    } else {
      w.__TEMPLATES_ALL = (tpl.templates ?? []).filter((t) => t.channel === "whatsapp");
    }
    if (pol instanceof Error) {
      w.__POLICIES = null;
      console.error("settings_policies_fetch_failed", pol.message);
    } else {
      w.__POLICIES = {
        rows: (pol.policies ?? []).map((r) => ({ class: r.class, mode: r.mode, limits: r.limits ?? {} })),
        role: pol.role ?? null,
      };
    }
    if (team instanceof Error) {
      // null, not [] — "we could not read the team" and "there is nobody" are
      // different facts, and only one of them should render as an empty list.
      w.__TEAM = null;
      w.__TEAM_INVITES = null;
      console.error("settings_team_fetch_failed", team.message);
    } else {
      w.__TEAM = team.members ?? [];
      // The API has always returned open invitations and nothing rendered
      // them, so an invitation that was sent, accepted or revoked was
      // invisible on the one card whose job is saying who has access.
      w.__TEAM_INVITES = team.invites ?? [];
    }
  },
};

/* ------------------------------- People ---------------------------------- */

/** What the People surface reads: rows already mapped, the rail's list
 *  counts, and the header totals — all from one fetch. */
export interface PeopleSurface {
  rows: PersonRowVM[];
  /** The rail's smart lists with their members — the predicates stay in
   *  contracts; the mockup only needs the ids. Each carries its group and,
   *  when it has one, the obvious next step. */
  lists: { id: string; label: string; group: string; count: number; ids: string[]; action: { text: string; cta: string; to: string; enabled: boolean } | null }[];
  groups: { id: string; label: string }[];
  /** The lists kept by hand (segments), counted over the rows on the page so
   *  an erased person never counts. */
  saved: { id: string; name: string; count: number; ids: string[] }[];
  aggregates: PeopleAggregates;
  /** Days-since-last-contact histogram per state, for the console strip. */
  recency: Record<string, { label: string; count: number }[]>;
  /** One row of the attention strip per person: the sentence, the state line, the one button. */
  attention: Record<string, AttentionRowVM>;
  /** The workspace's calendar: the outcome lists and the Booked cell exist only when it is "ok". */
  calendar: { state: "ok" | "unavailable" | "none"; source: string };
  /** The booking link on file, so a row can offer to text it. */
  bookingLink: string | null;
  fetchedAt: number;
}

/**
 * People · Clients — everyone who has written to or phoned the business.
 *
 * The mockup drew sixty invented clients with health scores, packages and
 * therapists. The real surface renders what the schema holds: who they are,
 * which channels, who spoke last and when, what the receptionist is doing
 * for them, and whether they need a person. The state a row is in comes from
 * the tested rule in contracts, never from this file.
 *
 * Realtime message inserts re-apply, so a customer who writes moves rows the
 * way they move threads in the Inbox.
 */
export const peopleOverride: SurfaceOverride = {
  key: "people",
  globals: ["__PEOPLE"],
  events: ["surface:clients"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [data, savedData] = await Promise.all([
      fetchEnvelope<{ people: PersonRowDto[]; calendar?: { state: "ok" | "unavailable" | "none"; source: string }; booking_link?: string | null }>("/api/v1/contacts"),
      fetchEnvelope<{ lists: { id: string; name: string; ids: string[] }[] }>("/api/v1/segments"),
    ]);
    const now = new Date();
    const rows = data.people.map((r) => toPersonRowVM(r, now));
    const rowIds = new Set(rows.map((r) => r.id));
    const calendar = data.calendar ?? { state: "none" as const, source: "your calendar" };
    (window as unknown as { __PEOPLE?: PeopleSurface }).__PEOPLE = {
      rows,
      // The outcome lists only when there is a calendar to read them from.
      lists: PEOPLE_LISTS.filter((l) => !l.needsCalendar || calendar.state === "ok").map((l) => {
        const members = rows.filter(l.test);
        return { id: l.id, label: l.label, group: l.group, count: members.length, ids: members.map((r) => r.id), action: peopleListAction(l.id, members) };
      }),
      groups: PEOPLE_LIST_GROUPS.map((g) => ({ id: g.id, label: g.label })),
      calendar,
      bookingLink: data.booking_link ?? null,
      saved: savedData.lists.map((l) => {
        const ids = l.ids.filter((id) => rowIds.has(id));
        return { id: l.id, name: l.name, count: ids.length, ids };
      }),
      aggregates: peopleAggregates(rows, now.getTime()),
      recency: Object.fromEntries(
        PEOPLE_TABS.filter((t) => t.id !== "all").map((t) => [t.id, recencyCells(rows.filter((r) => r.state === t.id), now.getTime())]),
      ),
      attention: Object.fromEntries(rows.map((r) => [r.id, attentionRow(r, now.getTime())])),
      fetchedAt: now.getTime(),
    };
  },
};

/* ------------------------------ Broadcasts ------------------------------- */

export interface AudienceOption {
  kind: AudienceKind;
  id: string | null;
  label: string;
  /** How many of them may receive an offer: a recorded yes and a number. */
  count: number;
  hint: string;
}

export interface BroadcastsSurface {
  rows: BroadcastVM[];
  /** The approved WhatsApp templates, with their variables. */
  templates: TemplateDto[];
  audiences: AudienceOption[];
  /** The WhatsApp number a broadcast goes out on, and what WhatsApp has said about it. */
  number: { present: boolean; display: string | null; health: NumberHealth };
  /** The words for a held-back reason, for the detail view. */
  heldReasons: Record<string, string>;
  /** How a customer says yes in their own words: the phrase, the link that
   *  opens WhatsApp with it ready, and the QR of that link. Null link without
   *  a number. */
  optIn: { phrase: string; phraseEs: string; link: string | null; qrPath: string | null };
  /** The business's own words for the slots that name it, and whether a booking link is on file. */
  businessName: string;
  bookingLink: boolean;
  fetchedAt: number;
}

/**
 * Broadcasts: the rows with the numbers their messages earned, the approved
 * templates, and every audience with the count of people who may receive an
 * offer — computed here by the same contracts predicate the route enrols
 * with, so the number on the chip is the number the route will find.
 */
export const broadcastsOverride: SurfaceOverride = {
  key: "broadcasts",
  globals: ["__BROADCASTS"],
  events: ["surface:broadcasts"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [bc, people, saved, tpl, ch, cfg] = await Promise.all([
      fetchEnvelope<{ broadcasts: BroadcastDto[] }>("/api/v1/broadcasts"),
      fetchEnvelope<{ people: PersonRowDto[]; calendar?: { state: string } }>("/api/v1/contacts"),
      fetchEnvelope<{ lists: { id: string; name: string; ids: string[] }[] }>("/api/v1/segments").catch((e: unknown) => e as Error),
      fetchEnvelope<{ templates: TemplateDto[] }>("/api/v1/templates").catch((e: unknown) => e as Error),
      fetchEnvelope<{ channels: ChannelDto[] }>("/api/v1/channels").catch((e: unknown) => e as Error),
      // The business's name and whether a booking link is on file, for the slots that name them.
      fetchEnvelope<{ config: { brain?: { business_name?: string; booking_link?: string } } | null }>("/api/v1/settings").catch((e: unknown) => e as Error),
    ]);
    const wa = ch instanceof Error ? null : (ch.channels ?? []).find((c) => c.kind === "whatsapp" && c.status === "active") ?? null;
    const brain = cfg instanceof Error ? null : cfg.config?.brain ?? null;
    if (ch instanceof Error) console.error("broadcasts_channels_fetch_failed", ch.message);
    const now = new Date();
    const rows = people.people.map((r) => toPersonRowVM(r, now));
    const audiences: AudienceOption[] = [
      { kind: "everyone", id: null, label: EVERYONE_LABEL, count: eligibleFor(rows, "everyone", null, null).length, hint: "Every person with a recorded yes and a number" },
      // The calendar lists are audiences only when there is a calendar to read them from.
      ...PEOPLE_LISTS.filter((l) => l.id !== "opted_in" && l.id !== "opted_out" && (!l.needsCalendar || people.calendar?.state === "ok")).map((l) => ({
        kind: "list" as const, id: l.id, label: l.label, count: eligibleFor(rows, "list", l.id, null).length, hint: `${l.label} — of those who said yes`,
      })),
      ...(saved instanceof Error ? [] : saved.lists.map((s) => ({
        kind: "saved" as const, id: s.id, label: s.name, count: eligibleFor(rows, "saved", null, new Set(s.ids)).length, hint: "A list kept by hand — of those who said yes",
      }))),
    ];
    if (saved instanceof Error) console.error("broadcasts_lists_fetch_failed", saved.message);
    if (tpl instanceof Error) console.error("broadcasts_templates_fetch_failed", tpl.message);
    (window as unknown as { __BROADCASTS?: BroadcastsSurface }).__BROADCASTS = {
      rows: bc.broadcasts.map((b) => toBroadcastVM(b, now)),
      templates: tpl instanceof Error ? [] : (tpl.templates ?? []).filter((t) => t.channel === "whatsapp" && t.meta_status === "approved"),
      audiences,
      number: {
        present: !!wa,
        display: wa?.number_e164 ? formatPhoneDisplay(wa.number_e164) : null,
        health: numberHealth({ quality: wa?.quality ?? null, event: wa?.quality_event ?? null, limit: wa?.messaging_limit ?? null }),
      },
      heldReasons: HELD_REASONS,
      businessName: brain?.business_name || "the business",
      bookingLink: !!brain?.booking_link,
      optIn: {
        phrase: OFFERS_OPT_IN_PHRASES.en,
        phraseEs: OFFERS_OPT_IN_PHRASES.es,
        link: optInLink(wa?.number_e164),
        qrPath: optInLink(wa?.number_e164) ? scoped("/api/v1/consent/qr") : null,
      },
      fetchedAt: now.getTime(),
    };
  },
};

/* ------------------------------- Playbooks ------------------------------- */

export interface PlaybookTotalsVM {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  lastRun: { id: string; state: string; run_for: string | null; recipient_count: number } | null;
  /** A run waiting for a person: the broadcast to approve or skip. */
  waiting: { id: string; recipient_count: number; name: string } | null;
}

export interface PlaybookCardVM extends PlaybookDto {
  totals: PlaybookTotalsVM;
  /** The trigger's words: "Win-back", "Nothing heard in 30 days". */
  triggerLabel: string;
  triggerHint: string;
  /** "Daily 10:00 · up to 25 · once per person, again after 90 days". */
  schedule: string;
  /** "today 10:00", "tomorrow 10:00" or "paused", by the business's clock. */
  next: string;
  /** How many are on the trigger's list with a recorded yes right now —
   *  before the gap and the week's breath, which only the run applies. */
  candidates: number;
}

export interface PlaybookTriggerOption {
  id: string;
  label: string;
  hint: string;
  cls: string;
  list: string | null;
  /** list, cadence or visit — a visit trigger needs the calendar and has no gap. */
  kind: string;
  candidates: number;
}

export interface PlaybooksSurface {
  rows: PlaybookCardVM[];
  timezone: string;
  /** Whether a visit trigger can run: the workspace's calendar state. */
  calendar: "ok" | "unavailable" | "none";
  triggers: PlaybookTriggerOption[];
  /** The Autonomy rows' words, so a playbook names its row the way the matrix does. */
  classWords: typeof POLICY_CLASS_WORDS;
  /** The approved WhatsApp templates, with their variables. */
  templates: TemplateDto[];
  number: { present: boolean; health: NumberHealth };
  businessName: string;
  bookingLink: boolean;
  fetchedAt: number;
}

/** Count the whole pool, not one run's cap. */
const PLAYBOOK_POOL = 100_000;

/**
 * Playbooks: the rows with what their runs earned, the four triggers with
 * the count of people on each list who said yes — computed here by the same
 * contracts predicate the runner uses, so the number on the chip is the
 * number a run starts from — and the approved templates a playbook may send.
 */
export const playbooksOverride: SurfaceOverride = {
  key: "playbooks",
  globals: ["__PLAYBOOKS"],
  events: ["surface:playbooks"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [pb, people, tpl, ch, cfg] = await Promise.all([
      fetchEnvelope<{ playbooks: Array<PlaybookDto & { totals: PlaybookTotalsVM }>; timezone: string }>("/api/v1/playbooks"),
      fetchEnvelope<{ people: PersonRowDto[]; calendar?: { state: "ok" | "unavailable" | "none" } }>("/api/v1/contacts"),
      fetchEnvelope<{ templates: TemplateDto[] }>("/api/v1/templates").catch((e: unknown) => e as Error),
      fetchEnvelope<{ channels: ChannelDto[] }>("/api/v1/channels").catch((e: unknown) => e as Error),
      fetchEnvelope<{ config: { brain?: { business_name?: string; booking_link?: string } } | null }>("/api/v1/settings").catch((e: unknown) => e as Error),
    ]);
    const now = new Date();
    const rows = people.people.map((r) => toPersonRowVM(r, now));
    const untouched = { byThis: new Map<string, number>(), byAny: new Map<string, number>() };
    const pool = (trigger: string) =>
      eligibleForPlaybook(rows, { trigger: trigger as PlaybookDto["trigger"], cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0 }, untouched, now.getTime()).length;
    const wa = ch instanceof Error ? null : (ch.channels ?? []).find((c) => c.kind === "whatsapp" && c.status === "active") ?? null;
    const brain = cfg instanceof Error ? null : cfg.config?.brain ?? null;
    if (tpl instanceof Error) console.error("playbooks_templates_fetch_failed", tpl.message);
    if (ch instanceof Error) console.error("playbooks_channels_fetch_failed", ch.message);
    const tz = pb.timezone || "America/New_York";
    (window as unknown as { __PLAYBOOKS?: PlaybooksSurface }).__PLAYBOOKS = {
      classWords: POLICY_CLASS_WORDS,
      rows: pb.playbooks.map((p) => {
        const t = triggerOf(p.trigger);
        return {
          ...p,
          triggerLabel: t?.label ?? p.trigger,
          triggerHint: t?.hint ?? "",
          schedule: scheduleLine(p),
          next: nextRunLabel(p, tz, now),
          candidates: pool(p.trigger),
        };
      }),
      timezone: tz,
      calendar: people.calendar?.state ?? "none",
      triggers: PLAYBOOK_TRIGGERS.map((t) => ({ id: t.id, label: t.label, hint: t.hint, cls: t.cls, list: t.list, kind: t.kind, candidates: pool(t.id) })),
      templates: tpl instanceof Error ? [] : (tpl.templates ?? []).filter((t) => t.channel === "whatsapp" && t.meta_status === "approved"),
      number: {
        present: !!wa,
        health: numberHealth({ quality: wa?.quality ?? null, event: wa?.quality_event ?? null, limit: wa?.messaging_limit ?? null }),
      },
      businessName: brain?.business_name || "the business",
      bookingLink: !!brain?.booking_link,
      fetchedAt: now.getTime(),
    };
  },
};

/* ------------------------------- Calendar -------------------------------- */

/** The window loaded: a day key and a length in days; null is the window around today. Not persisted — a reload opens on today. */
let calendarFrom: string | null = null;
let calendarDays = 63;

/** Today by the browser's clock — the business's zone may differ by a day at midnight, and the window has a week of margin. */
function localDayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getCalendarSpan(): { from: string | null; days: number } {
  return { from: calendarFrom, days: calendarDays };
}

export function setCalendarSpan(from: string | null, days = 63): void {
  calendarFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
  calendarDays = Math.min(63, Math.max(1, Math.round(days) || 63));
}

export interface CalendarSurface {
  vm: CalendarVM;
  fetchedAt: number;
}

/**
 * Calendar: the owner's calendar as the receptionist reads it — what the
 * feed says is taken, the hours and closures, and the windows a caller
 * would be offered — one span of days by the business's clock. The feed's
 * address never reaches the browser; the route reads it.
 */
export const calendarOverride: SurfaceOverride = {
  key: "calendar",
  globals: ["__CALENDAR"],
  events: ["surface:calendar"],
  apply: async () => {
    const from = calendarFrom;
    const days = calendarDays;
    const w = from ? { from, days } : windowFor(localDayKey());
    const data = await fetchEnvelope<{ calendar: CalendarWeekDto }>(`/api/v1/calendar?from=${w.from}&days=${w.days}`);
    // Two moves in a row: the earlier read may land after the later one. A
    // read for a span the page has since left is dropped, never painted.
    if (from !== calendarFrom || days !== calendarDays) return;
    (window as unknown as { __CALENDAR?: CalendarSurface }).__CALENDAR = {
      vm: toCalendarVM(data.calendar, new Date()),
      fetchedAt: Date.now(),
    };
  },
};

/* ------------------------------- Reports --------------------------------- */

const REPORT_DAYS_KEY = "chanlytics.report.days";
let reportDays = 30;
try {
  if (typeof window !== "undefined") {
    const saved = Number(window.localStorage.getItem(REPORT_DAYS_KEY));
    if (REPORT_RANGES.some((r) => r.days === saved)) reportDays = saved;
  }
} catch {
  /* storage unavailable: the default range stands */
}

export function getReportDays(): number {
  return reportDays;
}

/** The one period every chart on Reports is scoped to. Only the presets. */
export function setReportDays(days: number): void {
  if (!REPORT_RANGES.some((r) => r.days === days)) return;
  reportDays = days;
  try {
    window.localStorage.setItem(REPORT_DAYS_KEY, String(days));
  } catch {
    /* a preference, not a fact */
  }
}

export interface ReportsSurface {
  vm: ReportVM;
  /** What the offers earned over the same period. */
  campaigns: CampaignReportVM;
  /** Asked, then booked: the one conversion line, from the calendar. */
  booking: BookingReportVM;
  days: number;
  fetchedAt: number;
}

/**
 * Reports — the receptionist's own numbers over a period.
 *
 * The mockup drew revenue, bookings and eight agents. This publishes the
 * report view model built from one SQL function that already applies the
 * Today metrics' rules (tenant time zone, no undated imports, answered-by =
 * first reply). Realtime message inserts re-apply so today's column moves.
 */
export const reportsOverride: SurfaceOverride = {
  key: "reports",
  globals: ["__REPORTS"],
  events: ["surface:reports"],
  refreshOnMessageInserts: true,
  debounceMs: 800,
  apply: async () => {
    const days = reportDays;
    const [data, campaigns] = await Promise.all([
      fetchEnvelope<{ report: ReportDto; booking?: BookingReportDto | null }>(`/api/v1/reports?days=${days}`),
      fetchEnvelope<{ report: CampaignReportDto }>(`/api/v1/reports/campaigns?days=${days}`),
    ]);
    (window as unknown as { __REPORTS?: ReportsSurface }).__REPORTS = {
      vm: toReportVM(data.report),
      campaigns: toCampaignReportVM(campaigns.report),
      booking: toBookingReportVM(data.booking),
      days,
      fetchedAt: Date.now(),
    };
  },
};

/* ---------------------------- Notifications ------------------------------ */

export interface NotificationsSurface {
  dto: NotificationsDto;
  fetchedAt: number;
}

/**
 * Notifications: the month's kept rows and this person's seen moment. The
 * bell reads them beside what it derives from the surfaces around it, and
 * repaints as the edge writes a row.
 */
export const notificationsOverride: SurfaceOverride = {
  key: "notifications",
  globals: ["__NOTIFICATIONS"],
  events: ["surface:notifications"],
  refreshOnTables: ["notifications"],
  apply: async () => {
    const dto = await fetchEnvelope<NotificationsDto>("/api/v1/notifications");
    (window as unknown as { __NOTIFICATIONS?: NotificationsSurface }).__NOTIFICATIONS = { dto, fetchedAt: Date.now() };
  },
};

/**
 * Live — the phone line right now.
 *
 * Deliberately NOT cached: `globals` is empty, so the runner never snapshots
 * it and a reload cannot paint a call that ended while the tab was closed.
 * A cold load waits on the fetch like every other real surface. Realtime on
 * the calls table (a call starting, each live turn, its end, its analysis)
 * re-runs this apply; the page itself runs the clock and re-applies the
 * heartbeat rule between refreshes.
 */
export const liveOverride: SurfaceOverride = {
  key: "live",
  globals: [],
  events: ["surface:live"],
  // Calls only: a transcript turn is a calls UPDATE and nothing else needs
  // to repaint for it; the note a call leaves in the thread is a messages
  // INSERT the default surfaces already follow.
  refreshOnTables: ["calls"],
  debounceMs: 300,
  apply: async () => {
    const [callsRes, chRes] = await Promise.all([
      fetchEnvelope<{ calls: CallDto[] }>("/api/v1/calls"),
      // The line's number and switch are context, not a precondition.
      fetchEnvelope<{ channels: ChannelDto[] }>("/api/v1/channels").catch((e: unknown) => e as Error),
    ]);
    if (chRes instanceof Error) console.error("live_channels_fetch_failed", chRes.message);
    (window as unknown as { __LIVE?: LiveVM }).__LIVE = toLiveVM(
      callsRes.calls,
      chRes instanceof Error ? null : chRes.channels,
    );
  },
};
