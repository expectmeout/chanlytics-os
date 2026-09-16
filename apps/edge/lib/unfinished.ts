/**
 * Accepted means recoverable: the two things that could be accepted and then
 * forgotten, found and put in front of a person.
 *
 * 1. A customer's message the handler never finished with. The WhatsApp and
 *    SMS doors ingest the message first (the row exists, Meta is told 200 or
 *    retries into the replay gate) and answer it inside the same invocation.
 *    A crash or a timeout after the ingest commits leaves the row with no
 *    processed_at stamp, no reply, no escalation -- and the redelivery is a
 *    duplicate the gate skips, deliberately, because a second text is worse
 *    than a missed one. So the row sat there, and nobody was told. This
 *    sweep finds it, opens the thread for a person, tells the owner what the
 *    customer said, and stamps the row handled so it is raised once. It never
 *    answers on its own: the hours since are not a thing a receptionist
 *    should reply into unasked.
 *
 * 2. A queued reply nothing is sending. A reply is written `queued` and its
 *    outbound_send job is written after it, on another client; a death
 *    between the two, or a compensation that itself failed, leaves a row that
 *    says "Sending..." forever with no job to make it true. The settle path
 *    marks a row failed when its JOB dies; a row that never had one was
 *    nobody's. This sweep marks it failed with an honest note and flags the
 *    thread the way a failed delivery flags it.
 *
 * Run from the deadman tick (every ten minutes), so an accepted-and-forgotten
 * message is in front of a person within about a quarter of an hour. Bounded
 * to the last day and a hundred rows a question: the sweep is a safety net,
 * not a backlog processor, and a day-old message it did not see is the
 * platform's problem, paged elsewhere. Every write is guarded on the row's
 * present state, so two overlapping ticks cannot double-flag.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import type { EscalationOutcome } from "./workspace/jobs.js";
import type { logger } from "./log.js";
import type { notify as notifyFn, reachesTenant as reachesFn, NotifyTarget, NotifyMessage } from "./notify.js";
import type { loadTenantNotifications as loadFn } from "./tenant-runtime.js";

type Db = SupabaseClient<Database>;

/** A customer's message older than this with no processed_at stamp was never finished with. */
export const UNANSWERED_INBOUND_AFTER_MS = 3 * 60_000;
/** A queued reply older than this with no live job is nobody's. */
export const ORPHAN_QUEUED_AFTER_MS = 10 * 60_000;
/** Older than this is not this sweep's to raise. */
const LOOKBACK_MS = 24 * 3_600_000;
const BATCH = 100;

export const ORPHAN_NOTE = "no job was left to send this";

/** The deadman endpoint's own collaborators, passed in so the sweep is one function over ports. */
export interface UnfinishedPorts {
  db: Db;
  L: ReturnType<typeof logger>;
  upsertEscalation: (db: Db, tenantId: string, conversationId: string, reason: string, details: string) => Promise<EscalationOutcome>;
  markProcessed: (db: Db, tenantId: string, messageId: string) => Promise<void>;
  notify: typeof notifyFn;
  loadTenantNotifications: typeof loadFn;
  reachesTenant: typeof reachesFn;
  now?: () => number;
}

export interface UnfinishedSummary {
  /** Customer messages found unfinished and flagged. */
  unanswered: number;
  /** Queued replies found with no job and failed. */
  orphaned: number;
  /** Owners told, across both. */
  told: number;
}

interface InboundRow { id: string; tenant_id: string; conversation_id: string | null; body: string | null; created_at: string; meta: Record<string, unknown> | null }
interface QueuedRow { id: string; tenant_id: string; conversation_id: string | null; sender: string | null; created_at: string }

const iso = (ms: number) => new Date(ms).toISOString();
const short = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

export async function sweepUnfinished(p: UnfinishedPorts): Promise<UnfinishedSummary> {
  const now = p.now ? p.now() : Date.now();
  const out: UnfinishedSummary = { unanswered: 0, orphaned: 0, told: 0 };
  const addressing = new Map<string, Awaited<ReturnType<typeof loadFn>>>();
  const tell = async (tenantId: string, n: NotifyMessage): Promise<boolean> => {
    if (!addressing.has(tenantId)) addressing.set(tenantId, await p.loadTenantNotifications(p.db, tenantId));
    const target: NotifyTarget = { tenantId, ...addressing.get(tenantId)! };
    if (!p.reachesTenant(target)) return false;
    return p.notify(target, n);
  };

  // 1. A customer's message never finished with.
  const { data: inbound, error: inErr } = await p.db
    .from("messages")
    .select("id, tenant_id, conversation_id, body, created_at, meta")
    .eq("direction", "inbound")
    .eq("sender", "customer")
    .gt("created_at", iso(now - LOOKBACK_MS))
    .lt("created_at", iso(now - UNANSWERED_INBOUND_AFTER_MS))
    .is("meta->>processed_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (inErr) throw new Error(`unfinished: cannot read inbound messages: ${inErr.message}`);
  const rows = (inbound ?? []) as unknown as InboundRow[];
  if (rows.length) {
    // A reply that went out after the message, before the stamp, is not a
    // customer with no answer: the crash was between the send and the mark.
    const convIds = [...new Set(rows.map((r) => r.conversation_id).filter((c): c is string => !!c))];
    const { data: answered, error: ansErr } = await p.db
      .from("messages")
      .select("conversation_id, created_at")
      .eq("direction", "outbound")
      .in("conversation_id", convIds)
      .gt("created_at", rows[0].created_at);
    if (ansErr) throw new Error(`unfinished: cannot read replies: ${ansErr.message}`);
    const repliesBy = new Map<string, string[]>();
    for (const a of (answered ?? []) as { conversation_id: string; created_at: string }[]) {
      repliesBy.set(a.conversation_id, [...(repliesBy.get(a.conversation_id) ?? []), a.created_at]);
    }
    for (const r of rows) {
      try {
        const replied = !!r.conversation_id && (repliesBy.get(r.conversation_id) ?? []).some((t) => t > r.created_at);
        if (!replied && r.conversation_id) {
          const waitedMin = Math.max(1, Math.round((now - new Date(r.created_at).getTime()) / 60_000));
          const words = short(r.body);
          const detail = `The receptionist never answered this: the message arrived ${waitedMin} minutes ago and its handling did not finish (a crash or a timeout after it was accepted). Nothing has been sent — ${words ? `"${words}"` : "no text"}`;
          await p.upsertEscalation(p.db, r.tenant_id, r.conversation_id, "brain_error", detail.slice(0, 400));
          out.unanswered += 1;
          const told = await tell(r.tenant_id, {
            kind: "deadman",
            route: "inbox",
            subject: "A customer wrote and nothing answered",
            body:
              `A message arrived ${waitedMin} minutes ago and the receptionist never finished with it, so the customer has had no reply.\n\n` +
              `${words ? `They wrote: "${words}"\n\n` : ""}` +
              `The thread is flagged for you in the Inbox. Reply there; nothing will be sent on its own.`,
            redactedBody: `A customer in this workspace wrote ${waitedMin} minutes ago and nothing answered; the thread is flagged.`,
          });
          if (told) out.told += 1;
          p.L.warn("unfinished_inbound_flagged", { tenant_id: r.tenant_id, message: r.id, waited_min: waitedMin, told });
        }
        // Handled now, one way or the other: raised once, or a reply was there all along.
        await p.markProcessed(p.db, r.tenant_id, r.id);
      } catch (e) {
        p.L.error("unfinished_inbound_failed", { tenant_id: r.tenant_id, message: r.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // 2. A queued reply nothing is sending.
  const { data: queued, error: qErr } = await p.db
    .from("messages")
    .select("id, tenant_id, conversation_id, sender, created_at")
    .eq("status", "queued")
    .gt("created_at", iso(now - LOOKBACK_MS))
    .lt("created_at", iso(now - ORPHAN_QUEUED_AFTER_MS))
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (qErr) throw new Error(`unfinished: cannot read queued replies: ${qErr.message}`);
  const stuck = (queued ?? []) as unknown as QueuedRow[];
  if (stuck.length) {
    const { data: jobs, error: jErr } = await p.db
      .from("jobs")
      .select("payload")
      .eq("kind", "outbound_send")
      .in("state", ["scheduled", "fired"])
      .in("payload->>message_id", stuck.map((s) => s.id));
    if (jErr) throw new Error(`unfinished: cannot read the jobs: ${jErr.message}`);
    const live = new Set(((jobs ?? []) as { payload: { message_id?: unknown } | null }[]).map((j) => String(j.payload?.message_id ?? "")));
    for (const s of stuck) {
      if (live.has(s.id)) continue;
      try {
        const { data: changed, error } = await p.db
          .from("messages")
          .update({ status: "failed", error: { reason: "orphaned", note: ORPHAN_NOTE } })
          .eq("id", s.id)
          .eq("tenant_id", s.tenant_id)
          .eq("status", "queued")
          .select("id");
        if (error) throw new Error(error.message);
        if (!changed?.length) continue; // another tick, or the send itself, got there first
        out.orphaned += 1;
        if (s.conversation_id) {
          const who = s.sender === "ai" ? "The receptionist's reply" : "A reply";
          await p.upsertEscalation(p.db, s.tenant_id, s.conversation_id, "send_failed", `${who} never left: ${ORPHAN_NOTE}. Check the conversation before sending it again.`);
          const told = await tell(s.tenant_id, {
            kind: "deadman",
            route: "inbox",
            subject: "A reply never left",
            body: `${who} was queued and ${ORPHAN_NOTE}, so it never reached the customer. The thread is flagged for you in the Inbox; check it before sending again.`,
            redactedBody: "A queued reply in this workspace never left; the thread is flagged.",
          });
          if (told) out.told += 1;
        }
        p.L.warn("unfinished_queued_failed", { tenant_id: s.tenant_id, message: s.id });
      } catch (e) {
        p.L.error("unfinished_queued_sweep_failed", { tenant_id: s.tenant_id, message: s.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return out;
}
