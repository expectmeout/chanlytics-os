/**
 * A mailbox's provider saying it changed (decision 0056), heard: each push reads that one mailbox now (mailbox-sync.ts),
 * and the five-minute sweep reads every one whatever was pushed, so a push lost costs minutes, never a reply.
 *
 *   Gmail   a Pub/Sub push (api/mailbox/gmail.ts): its bearer token checked (signed by Google, for this deployment's
 *           GMAIL_PUSH_AUDIENCE), its message read for the address that changed, and that address's live mailbox read.
 *           Answered 204 whatever the mailbox: a non-2xx is redelivered, and a push for a mailbox no longer connected
 *           would be for ever.
 *   Graph   a notification (api/mailbox/graph.ts): the validation Graph sends once when a subscription is made, echoed;
 *           otherwise each notification's clientState checked against GRAPH_NOTIFY_SECRET, and its subscription's
 *           mailbox read. Answered 202.
 *
 * What a push says is only "read this mailbox now": no body is trusted for more, and the sync reads the rest from the
 * provider with the mailbox's own grant. A push that cannot be checked is refused (401) and nothing is read.
 */
import {
  gmailPushOf,
  graphNotificationsOf,
  clientStateMatches,
  verifyGooglePushToken,
} from "../../packages/channels.js";
import { liveMailboxByAddress, liveMailboxByWatch, type MailboxConnectionRow } from "../../packages/db.js";
import { refuse, text } from "../../http.js";
import { pg } from "../../pg.js";
import { errField, logger, type Logger } from "../../log.js";
import { gmailPush, graphPush } from "./mailbox-config.js";
import { syncMailbox } from "./mailbox-sync.js";

/** A push heard: 204 carries no body (a Response with one, even empty, is refused). */
const pushHeard = (): Response => new Response(null, { status: 204 });

/** The longest a validation token Graph sends may be: it is echoed, so nothing longer is. */
const VALIDATION_MAX = 1_024;

/**
 * No provider read of a push's sync starts after this, counted from the push's arrival: the read in flight then and the
 * writes still end inside the door's limit in vercel.json (repo/ops-hygiene.test.mjs adds them up). What is left is the
 * next push's, or the clock's.
 */
export const PUSH_READS_UNTIL_MS = 5_000;

async function readOne(
  db: NonNullable<ReturnType<typeof pg>>,
  row: MailboxConnectionRow | null,
  L: Logger,
  until: number,
) {
  if (!row) return "no_mailbox";
  if (Date.now() >= until) return "later";
  const s = await syncMailbox(db, row, L.child({ tenant_id: row.tenant_id }), Date.now(), until);
  return s.outcome;
}

/** A Pub/Sub push for a Gmail mailbox. */
export async function receiveGmailPush(request: Request): Promise<Response> {
  const until = Date.now() + PUSH_READS_UNTIL_MS;
  const L = logger({ push: "gmail" });
  const push = gmailPush();
  if (!push) return refuse(404, "not_found");
  const token = await verifyGooglePushToken(request.headers.get("authorization"), push.audience);
  if (!token.ok) {
    L.warn("mailbox_push_refused", { why: token.why });
    return refuse(401, "unauthorized");
  }
  const said = gmailPushOf(await request.json().catch(() => null));
  if (!said) return pushHeard();
  const db = pg();
  if (!db) return refuse(503, "no_database");
  try {
    const outcome = await readOne(db, await liveMailboxByAddress(db, said.address), L, until);
    L.info("mailbox_pushed", { provider: "google", outcome });
  } catch (e) {
    // Read again by the sweep: a push redelivered for a database that is down helps nobody.
    L.error("mailbox_push_failed", { provider: "google", error: errField(e) });
  }
  return pushHeard();
}

/** A Graph notification for a Microsoft mailbox, or the validation Graph sends when a subscription is made. */
export async function receiveGraphPush(request: Request): Promise<Response> {
  const until = Date.now() + PUSH_READS_UNTIL_MS;
  const L = logger({ push: "microsoft" });
  const push = graphPush();
  if (!push) return refuse(404, "not_found");
  const validation = new URL(request.url).searchParams.get("validationToken");
  if (validation !== null) {
    if (validation.length > VALIDATION_MAX) return refuse(400, "bad_request");
    return text(200, validation, { "content-type": "text/plain" });
  }
  const notes = graphNotificationsOf(await request.json().catch(() => null));
  const trusted = notes.filter((n) => clientStateMatches(n.clientState, push.clientState));
  if (notes.length > 0 && trusted.length === 0) {
    L.warn("mailbox_push_refused", { why: "client_state", notes: notes.length });
    return refuse(401, "unauthorized");
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");
  for (const id of new Set(trusted.map((n) => n.subscriptionId))) {
    try {
      const outcome = await readOne(db, await liveMailboxByWatch(db, id), L, until);
      L.info("mailbox_pushed", { provider: "microsoft", outcome });
    } catch (e) {
      L.error("mailbox_push_failed", { provider: "microsoft", error: errField(e) });
    }
  }
  return text(202, "");
}
