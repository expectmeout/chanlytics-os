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
  type ConversationDto,
  type EscalationDto,
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

export const inboxOverride: SurfaceOverride = {
  key: "inbox",
  events: ["surface:inbox", "inbox:counts"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [convData, escData] = await Promise.all([
      fetchEnvelope<{ conversations: ConversationDto[] }>("/api/v1/conversations"),
      fetchEnvelope<{ escalations: EscalationRow[] }>("/api/v1/escalations?state=open"),
    ]);
    const byConv = new Map<string, EscalationRow>();
    for (const e of escData.escalations) byConv.set(e.conversation_id, e);
    const threads = convData.conversations.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null));
    const w = window as unknown as {
      INBOX_DATA?: Record<string, unknown> & { CHANNEL_LABELS?: Record<string, string>; INBOX_BASELINE?: Record<string, unknown> };
    };
    const prev = w.INBOX_DATA ?? {};
    w.INBOX_DATA = {
      ...prev,
      THREADS: threads,
      CHANNEL_LABELS: { ...(prev.CHANNEL_LABELS ?? {}), whatsapp: "WhatsApp" },
      INBOX_BASELINE: { ...(prev.INBOX_BASELINE ?? {}), doneThisWeek: 0 },
    };
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
    const channels = w.CONVERSATIONS_DATA?.CV_CHANNELS ?? [];
    w.CONVERSATIONS_DATA = {
      CONVERSATIONS: data.conversations.map((c) => toConversationVM(c)),
      CV_CHANNELS: channels,
    };
  },
};
