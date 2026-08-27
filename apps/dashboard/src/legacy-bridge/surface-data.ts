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

export interface SurfaceOverride {
  /** Surface key, matching the slice that owns it (e.g. "conversations"). */
  key: string;
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

export async function fetchEnvelope<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) throw new UnauthorizedError();
  const j = (await res.json().catch(() => null)) as { ok: boolean; data?: T } | null;
  if (!j || !j.ok || j.data === undefined) throw new Error(`${url} -> ${res.status}`);
  return j.data;
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

export const workspaceOverride: SurfaceOverride & { current: () => Workspace | null } = {
  key: "workspace",
  current: () => (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES?.[0] ?? null,
  apply: async () => {
    const data = await fetchEnvelope<{ workspaces: Workspace[] }>("/api/v1/workspaces");
    (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES = data.workspaces;
  },
};

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
  events: ["surface:today"],
  refreshOnMessageInserts: true,
  debounceMs: 800, // the recap is aggregate, not per-thread — no need to be twitchy
  apply: async () => {
    const [metricsRes, convData, escData] = await Promise.all([
      fetchEnvelope<{ metrics: MetricsSummaryDto }>("/api/v1/metrics?days=1"),
      fetchEnvelope<{ conversations: ConversationDto[] }>("/api/v1/conversations"),
      fetchEnvelope<{ escalations: EscalationRow[] }>("/api/v1/escalations?state=open"),
    ]);
    // Calls are additive context, not a precondition — a voice outage must not
    // blank the whole brief.
    let calls: CallDto[] = [];
    try {
      calls = (await fetchEnvelope<{ calls: CallDto[] }>("/api/v1/calls")).calls;
    } catch (e) {
      console.error("today_calls_fetch_failed", e instanceof Error ? e.message : e);
    }
    (window as unknown as { TODAY_DATA?: TodayVM }).TODAY_DATA = toTodayVM(
      metricsRes.metrics,
      convData.conversations,
      escData.escalations,
      calls,
    );
  },
};

export const conversationsOverride: SurfaceOverride = {
  key: "conversations",
  events: ["surface:conversations"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const data = await fetchEnvelope<{ conversations: ConversationDto[] }>("/api/v1/conversations");
    const w = window as unknown as {
      CONVERSATIONS_DATA?: { CONVERSATIONS: unknown[]; CV_CHANNELS: unknown[] };
    };
    // Calls get their OWN rows: a thread answers "am I on the hook to reply",
    // a call answers "is my AI saying the right things on the phone" — the
    // second is a transcript plus audio that cannot live in a chat bubble.
    // The call row carries no decision affordance; the Inbox owns "needs you".
    let callRows: unknown[] = [];
    try {
      const callData = await fetchEnvelope<{ calls: CallDto[] }>("/api/v1/calls");
      callRows = callData.calls.map((c) => toCallVM(c));
    } catch (e) {
      console.error("calls_fetch_failed", e instanceof Error ? e.message : e);
    }
    const threads = data.conversations.map((c) => toConversationVM(c));
    const merged = [...threads, ...callRows].sort((a, b) => {
      const at = (x: unknown) => String((x as { at?: string }).at ?? "");
      return at(b).localeCompare(at(a));
    });
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
