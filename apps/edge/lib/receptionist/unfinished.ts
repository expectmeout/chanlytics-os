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
 * platform's problem, paged elsewhere. And bounded in time: past the deadline
 * the tick hands it, the rest wait for the next tick, unstamped, so the
 * escalations behind it keep theirs. Every write is guarded on the row's
 * present state, so two overlapping ticks cannot double-flag.
 *
 * Cross-workspace: the deadman sweep visits every workspace; each write carries the row's own tenant_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { isAutomatedSend, isCampaignEmail, MIN_MS, HOUR_MS } from "../packages/contracts.js";
import type { EscalationOutcome } from "../packages/jobs.js";
import type { logger } from "../log.js";
import type { notify as notifyFn, reachesTenant as reachesFn, NotifyTarget, NotifyMessage } from "../ops/notify.js";
import type { loadTenantNotifications as loadFn } from "../tenant-runtime.js";

type Db = SupabaseClient<Database>;

/**
 * The channels whose intake runs INSIDE the webhook, and whose unfinished work
 * is therefore this sweep's to find.
 *
 * A watchdog may notice work that was abandoned. It must not declare somebody
 * else's work finished -- and stamping `processed_at` is exactly that
 * declaration. Email's intake is a job with its own lease, its own retries and
 * its own settlement (jobs settle.ts), so a row it is still working on is not
 * abandoned; it is in progress. This sweep used to claim those rows three
 * minutes in, flag the thread `brain_error` with the words "The receptionist
 * never answered this", and mark them handled -- after which the retrying job
 * read `processed` and stopped, so `email_review` was never raised and the
 * mailbox's last-received stamp never moved.
 *
 * A new channel is excluded by construction, which is the safe direction: a
 * channel is added here only once somebody decides this sweep owns it. A text
 * is answered after its acknowledgement by a job (inbound_answer, 00347): its
 * message is left alone while that job waits or runs and is not long overdue,
 * and is this sweep's again once the job has failed for good.
 */
const INLINE_INTAKE = ["whatsapp", "sms"] as const;

/** A customer's message older than this with no processed_at stamp was never finished with. */
const UNANSWERED_INBOUND_AFTER_MS = 3 * MIN_MS;
/**
 * How long a text's answer job holds its text from this sweep once due: its one retry's wait and a lease, with room.
 * Past it the ledger has stopped claiming replies (which pages the platform within the minute, jobs_replies_late).
 */
const ANSWER_JOB_GRACE_MS = 10 * MIN_MS;
/** A queued reply older than this with no live job is nobody's. */
const ORPHAN_QUEUED_AFTER_MS = 10 * MIN_MS;
/** Older than this is not this sweep's to raise. */
const LOOKBACK_MS = 24 * HOUR_MS;
const BATCH = 100;

const ORPHAN_NOTE = "no job was left to send this";

/**
 * What a reply's row says once the words have left, or are in hand to: a held draft (queued) is sent by its own job,
 * and when no job will, the second question below fails it and flags its thread. A reply that failed, or was
 * withdrawn, is no answer.
 */
const ANSWER_STATES = ["queued", "sent", "delivered", "read"];

/** The deadman endpoint's own collaborators, passed in so the sweep is one function over ports. */
interface UnfinishedPorts {
  db: Db;
  L: ReturnType<typeof logger>;
  upsertEscalation: (
    db: Db,
    tenantId: string,
    conversationId: string,
    reason: string,
    details: string,
  ) => Promise<EscalationOutcome>;
  markProcessed: (db: Db, tenantId: string, messageId: string) => Promise<void>;
  notify: typeof notifyFn;
  loadTenantNotifications: typeof loadFn;
  reachesTenant: typeof reachesFn;
  /** When to stop raising and leave the rest to the next tick (epoch ms): the deadman tick's own work comes after. */
  deadline: number;
  now?: () => number;
}

interface UnfinishedSummary {
  /** Customer messages found unfinished and flagged. */
  unanswered: number;
  /** Queued replies found with no job and failed. */
  orphaned: number;
  /** Owners told, across both. */
  told: number;
}

interface InboundRow {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  body: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}
interface QueuedRow {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  sender: string | null;
  created_at: string;
  meta: { email?: { request?: unknown } } | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const short = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * The messages, of these, that a job of this kind still waiting or running names (payload.message_id); with `dueSince`,
 * only a job due since then, so one the ledger has left overdue holds nothing.
 */
async function liveJobsNaming(
  db: Db,
  kind: "outbound_send" | "inbound_answer",
  ids: string[],
  dueSince?: string,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  let q = db
    .from("jobs")
    .select("payload")
    .eq("kind", kind)
    .in("state", ["scheduled", "fired"])
    .in("payload->>message_id", ids);
  if (dueSince) q = q.gt("due_at", dueSince);
  const { data, error } = await q;
  if (error) throw new Error(`unfinished: cannot read the jobs: ${error.message}`);
  const named = (data ?? []).map((j) => {
    const p = j.payload;
    return p !== null && typeof p === "object" && !Array.isArray(p) && typeof p.message_id === "string"
      ? p.message_id
      : "";
  });
  return new Set(named.filter(Boolean));
}

/**
 * The texts, of these, whose answer is a job still in hand (inbound_answer, 00347): waiting or running, and due since
 * ANSWER_JOB_GRACE_MS ago. Not abandoned, so not this sweep's; one overdue past it is a ledger that stopped, and the
 * text is a person's.
 */
const textsInHand = (db: Db, rows: InboundRow[], now: number) =>
  liveJobsNaming(
    db,
    "inbound_answer",
    rows.map((r) => r.id),
    iso(now - ANSWER_JOB_GRACE_MS),
  );

/**
 * When each of these threads was answered since `since`: the receptionist's or the team's words, left or in hand
 * (ANSWER_STATES). A broadcast's send, a playbook's reminder or a reach-out's email on the same thread is written as
 * the team's and answers nobody (contracts isAutomatedSend), so a customer who wrote in the hour a reminder went out
 * is still a customer with no answer.
 */
async function answersSince(db: Db, rows: InboundRow[], since: string): Promise<Map<string, string[]>> {
  const convIds = [...new Set(rows.map((r) => r.conversation_id).filter((c): c is string => !!c))];
  const { data: answered, error } = await db
    .from("messages")
    .select("conversation_id, created_at, meta")
    .eq("direction", "outbound")
    .in("sender", ["ai", "human"])
    .in("status", ANSWER_STATES)
    .in("conversation_id", convIds)
    .gt("created_at", since);
  if (error) throw new Error(`unfinished: cannot read replies: ${error.message}`);
  const repliesBy = new Map<string, string[]>();
  for (const a of answered ?? []) {
    if (isAutomatedSend(a.meta)) continue;
    repliesBy.set(a.conversation_id, [...(repliesBy.get(a.conversation_id) ?? []), a.created_at]);
  }
  return repliesBy;
}

/** One tick of the sweep: its ports, its moment, its counts, how an owner is told, and whether its time is up. */
interface Tick {
  p: UnfinishedPorts;
  now: number;
  out: UnfinishedSummary;
  tell: (tenantId: string, n: NotifyMessage) => Promise<boolean>;
  /**
   * Past the deadline, what is left is the next tick's: a message keeps no stamp and a queued reply stays queued, so
   * each is found again, and the deadman tick keeps its own time for the escalations nobody picked up.
   */
  late: () => boolean;
}

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
  const late = () => (p.now ? p.now() : Date.now()) > p.deadline;
  const tick: Tick = { p, now, out, tell, late };
  await raiseUnanswered(tick);
  await failOrphans(tick);
  return out;
}

/** 1. A customer's message never finished with: opened for a person, its owner told, and stamped handled. */
async function raiseUnanswered({ p, now, out, tell, late }: Tick): Promise<void> {
  const { data: inbound, error: inErr } = await p.db
    .from("messages")
    .select("id, tenant_id, conversation_id, body, created_at, meta")
    .eq("direction", "inbound")
    .eq("sender", "customer")
    .in("channel", INLINE_INTAKE as unknown as string[])
    .gt("created_at", iso(now - LOOKBACK_MS))
    .lt("created_at", iso(now - UNANSWERED_INBOUND_AFTER_MS))
    .is("meta->>processed_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (inErr) throw new Error(`unfinished: cannot read inbound messages: ${inErr.message}`);
  const found = (inbound ?? []) as unknown as InboundRow[];
  const answering = await textsInHand(p.db, found, now);
  const rows = found.filter((r) => !answering.has(r.id));
  const first = rows[0];
  if (!first) return;
  // A reply that went out after the message, before the stamp, is not a
  // customer with no answer: the crash was between the send and the mark.
  const repliesBy = await answersSince(p.db, rows, first.created_at);
  for (const [i, r] of rows.entries()) {
    if (late()) {
      p.L.warn("unfinished_over_budget", { question: "unanswered", left: rows.length - i });
      return;
    }
    try {
      const replied = !!r.conversation_id && (repliesBy.get(r.conversation_id) ?? []).some((t) => t > r.created_at);
      if (!replied && r.conversation_id) {
        const waitedMin = Math.max(1, Math.round((now - new Date(r.created_at).getTime()) / MIN_MS));
        const words = short(r.body);
        const detail = `The receptionist never answered this: the message arrived ${waitedMin} minutes ago and its handling did not finish (a crash or a timeout after it was accepted). No reply has been sent — ${words ? `"${words}"` : "no text"}`;
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
        p.L.warn("unfinished_inbound_flagged", {
          tenant_id: r.tenant_id,
          message: r.id,
          waited_min: waitedMin,
          told,
        });
      }
      // Handled now, one way or the other: raised once, or a reply was there all along.
      await p.markProcessed(p.db, r.tenant_id, r.id);
    } catch (e) {
      p.L.error("unfinished_inbound_failed", {
        tenant_id: r.tenant_id,
        message: r.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/** 2. A queued reply nothing is sending: failed with an honest note, and its thread flagged. */
async function failOrphans({ p, now, out, tell, late }: Tick): Promise<void> {
  const { data: queued, error: qErr } = await p.db
    .from("messages")
    .select("id, tenant_id, conversation_id, sender, created_at, meta")
    .eq("status", "queued")
    .gt("created_at", iso(now - LOOKBACK_MS))
    .lt("created_at", iso(now - ORPHAN_QUEUED_AFTER_MS))
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (qErr) throw new Error(`unfinished: cannot read queued replies: ${qErr.message}`);
  const stuck = (queued ?? []) as unknown as QueuedRow[];
  if (!stuck.length) return;
  const live = await liveJobsNaming(
    p.db,
    "outbound_send",
    stuck.map((s) => s.id),
  );
  for (const [i, s] of stuck.entries()) {
    if (late()) {
      p.L.warn("unfinished_over_budget", { question: "orphaned", left: stuck.length - i });
      return;
    }
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
      // A campaign's email (a reach-out's) is its run's to count: the clock plans it again (orphaned never left), and
      // no thread nobody wrote on is flagged, nor its owner told (Reach out D4, contracts isCampaignEmail).
      if (s.conversation_id && !isCampaignEmail(s.meta?.email?.request)) {
        const who = s.sender === "ai" ? "The receptionist's reply" : "A reply";
        await p.upsertEscalation(
          p.db,
          s.tenant_id,
          s.conversation_id,
          "send_failed",
          `${who} never left: ${ORPHAN_NOTE}. Check the conversation before sending it again.`,
        );
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
      p.L.error("unfinished_queued_sweep_failed", {
        tenant_id: s.tenant_id,
        message: s.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
