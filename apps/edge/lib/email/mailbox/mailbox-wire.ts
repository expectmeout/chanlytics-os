/**
 * The `own` routes of a workspace's email wire (decision 0056): one per mailbox the business connected that sends now,
 * each sending through that mailbox's own provider with its token; the addresses of those that do not send now
 * (signed out, paused, held, resting) as `held`, so a person's answer frozen with one says why it went from the hosted
 * mailbox. emailWireFor (../email.ts) binds them beside the hosted and campaigns routes.
 *
 * What a send learns about its mailbox, the mailbox learns at once: a provider's day used up rests it until the time
 * the provider names, else the next UTC midnight (the door then refuses its sends as not ready, a wait, and the clock
 * plans them again); a grant gone
 * sets it to reconnect and tells its owner once. Either way the send comes back as not taken, so the outbox's fresh
 * job meets the door's wait rather than a failure.
 */
import { mailboxSendsNow, DAY_MS } from "../../packages/contracts.js";
import { sendFromMailbox, sendsAsConnected, type EmailRequest, type SendResult } from "../../packages/channels.js";
import type { EmailRoute } from "../../packages/core.js";
import {
  emitEvent,
  mailboxConnectionsOf,
  patchMailboxConnection,
  type Database,
  type MailboxConnectionRow,
} from "../../packages/db.js";
import { tokenFor } from "./mailbox-credentials.js";
import { tellSignedOut } from "./mailbox-notices.js";
import { logger, errField, type Logger } from "../../log.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** The next UTC midnight after `now`: a provider's sending day turns over by then. */
const nextMidnight = (now: number): string => new Date(Math.floor(now / DAY_MS) * DAY_MS + DAY_MS).toISOString();

/** The mailbox signed out: set to reconnect (only from a state that sends), said, and its owner told once. */
export async function markSignedOut(db: Db, row: MailboxConnectionRow, log: Logger, now = Date.now()): Promise<void> {
  const moved = await patchMailboxConnection(db, {
    tenantId: row.tenant_id,
    id: row.id,
    from: ["connected", "paused", "held"],
    patch: {
      state: "reconnect",
      held_why: null,
      held_at: null,
      last_error: "Signed out by its provider: connect it again.",
      last_error_at: new Date(now).toISOString(),
    },
  });
  if (!moved) return;
  await emitEvent(db, row.tenant_id, "mailbox_connection.signed_out", "mailbox_connection", row.id, {
    address: row.address,
    provider: row.provider,
  });
  await tellSignedOut(db, row, log, new Date(now));
}

/**
 * The mailbox's own day, used up: it rests until the time its provider named (Gmail's "Retry after", its day being a
 * rolling one), else until the next UTC midnight.
 */
async function rest(db: Db, row: MailboxConnectionRow, now: number, until?: number): Promise<void> {
  await patchMailboxConnection(db, {
    tenantId: row.tenant_id,
    id: row.id,
    patch: { resting_until: until && until > now ? new Date(until).toISOString() : nextMidnight(now) },
  });
}

/** A send that did not leave, as the outbox hears it: not taken, so it is handed to a fresh job and meets the door. */
const notTaken = (status: number, why: string): SendResult => ({
  ok: false,
  wamid: null,
  status,
  errorBody: why,
  outcome: "retryable",
});

/** One mailbox's send, with what it learned about the mailbox applied. */
async function sendFrom(
  db: Db,
  row: MailboxConnectionRow,
  request: EmailRequest,
  bound: { deadlineMs?: number },
  log: Logger,
): Promise<SendResult> {
  const now = Date.now();
  const t = await tokenFor(db, row, now);
  if (!t.ok) {
    if (t.why === "signed_out")
      await markSignedOut(db, row, log, now).catch((e: unknown) =>
        log.error("mailbox_signed_out_unmarked", { mailbox: row.id, error: errField(e) }),
      );
    log.warn("mailbox_send_no_token", { mailbox: row.id, why: t.why });
    return notTaken(t.why === "signed_out" ? 401 : 503, `mailbox_${t.why}`);
  }
  const sent = await sendFromMailbox({
    provider: row.provider === "microsoft" ? "microsoft" : "google",
    token: t.token,
    mailbox: { id: row.id, host: row.host },
    request,
    deadlineMs: bound.deadlineMs,
  });
  if (sent.ok) return sent;
  if (sent.cause === "day_used") {
    await rest(db, row, now, sent.restUntil).catch((e: unknown) =>
      log.error("mailbox_rest_failed", { mailbox: row.id, error: errField(e) }),
    );
    return notTaken(sent.status, "mailbox_day_used");
  }
  if (sent.cause === "signed_out") {
    await markSignedOut(db, row, log, now).catch((e: unknown) =>
      log.error("mailbox_signed_out_unmarked", { mailbox: row.id, error: errField(e) }),
    );
    return notTaken(sent.status, "mailbox_signed_out");
  }
  return sent;
}

/**
 * A workspace's connected mailboxes as its email wire's routes: one `own` route each for those that send now, and the
 * addresses of the rest. A read that fails throws: the caller binds the wire unavailable, and the send waits.
 */
export async function ownRoutesFor(db: Db, tenantId: string): Promise<{ routes: EmailRoute[]; held: string[] }> {
  const log = logger({ tenant_id: tenantId });
  const now = Date.now();
  const routes: EmailRoute[] = [];
  const held: string[] = [];
  for (const row of await mailboxConnectionsOf(db, tenantId)) {
    const as = sendsAsConnected(row);
    if (mailboxSendsNow(row, now))
      routes.push({ lane: "own", as, send: (request, bound) => sendFrom(db, row, request, bound, log) });
    else held.push(as.address);
  }
  return { routes, held };
}
