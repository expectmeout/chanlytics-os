/**
 * Chanlytics Messaging — Instagram DMs (the Instagram API with Instagram Login, decision 0001 step 8).
 *
 * The door is api/instagram.ts: GET is Meta's verification handshake, POST `door(receiveInstagramEvent)`. Everything a
 * delivery does is here, in order: Meta's signature over the raw body is checked (fail-closed, with the Instagram app's
 * secret or the Meta app's: channels metaSignatureValid, the one check both Meta webhooks ask), the delivery is kept as it
 * came (decision 0032), and each item of it is routed by the account it was written to (`entry.id`, the routing key, on
 * tenant_channels kind 'instagram') and acted on:
 *
 *   a person's DM     recorded through the receptionist's own ingest and answered by its job (dm-answer.ts), with the
 *                     name the person goes by on Instagram, read from their profile with the account's token (a person
 *                     is known by an Instagram-scoped id, never a number).
 *   an echo           the business's own message on the thread. One we sent is kept already (its row holds the id our
 *                     send was answered with) and changes nothing; one sent from the Instagram app is a person on the
 *                     team speaking: kept as their words, and the receptionist steps out of the thread for the
 *                     workspace's own hours, as a WhatsApp Business app echo does. A person nobody here holds has no
 *                     thread of ours to pause.
 *   an unsend         the person took the DM back: its words and attachment are no longer kept (00486 message_unsent).
 *   anything else     a reaction, a read, an edit: logged, and asks nothing of anyone.
 *
 * The ack rule is WhatsApp's: a DM, an echo or an unsend the database did not take, or whose account could not be
 * routed, is not acknowledged (503, so Meta sends the delivery again, and every one of them is safe to receive twice:
 * the ingest's replay gate, the echo's own id, the unsend's no-op); everything else is 200. An account the database says
 * is not ours, or is switched off, keeps nothing and is told to the platform, once a window. The lines carry no words, no
 * person's id and no token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  instagramDmChunks,
  instagramEventsOf,
  metaSignatureValid,
  readInstagramName,
  META_SIGNATURE_HEADER,
  type InstagramEvent,
} from "../packages/channels.js";
import {
  emitEvent,
  lastDmsSentTo,
  messageByExternalId,
  messageUnsent,
  personOfInstagramId,
  removeStoredMedia,
  recordEchoAndPause,
  resolveChannelDetailed,
  type Database,
  type RoutedChannel,
} from "../packages/db.js";
import { HOUR_MS, MIN_MS, pauseMsOf, WAITING_REASONS } from "../packages/contracts.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { digestId, keepDelivery, signatureHeaders } from "../intake/keep.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { IngestFailed } from "../whatsapp/persist.js";
import { alertUnroutable } from "../whatsapp/alerts.js";
import { env } from "../env.js";
import { errField, logger } from "../log.js";
import { instagramCredentials } from "./credentials.js";
import { recordThenAnswerDm } from "./dm-answer.js";

type Db = SupabaseClient<Database>;

const doorLog = logger();

/**
 * How long an echo whose id is not kept yet waits before it is taken for the team's own: our send's row is written the
 * moment Instagram answers it, and Meta's echo can arrive in between. Asked once more after this.
 */
export const ECHO_SETTLE_MS = 1_500;

/** A person's name, read from their profile, kept for a while per account: one read per person, not one per DM. */
const NAME_TTL_MS = HOUR_MS;
const NAMELESS_TTL_MS = 10 * MIN_MS;
const namesRead = new Map<string, { name: string | null; until: number }>();

/**
 * Meta's signature over the raw body, with the Instagram app's secret or the Meta app's (channels metaSignatureValid).
 * Fail-closed: no secret is a configuration fault, said once per delivery.
 */
function signedByInstagramApp(request: Request, raw: string): boolean {
  const secrets = [env.INSTAGRAM_APP_SECRET, env.META_APP_SECRET];
  if (!secrets.some(Boolean)) {
    doorLog.error("ig_missing_app_secret");
    return false;
  }
  return metaSignatureValid(raw, request.headers.get(META_SIGNATURE_HEADER), secrets);
}

/** Kept as it came, before the verdict (decision 0032): Meta names no delivery, so the key is the body's digest. */
async function keepIgDelivery(request: Request, raw: string): Promise<void> {
  const ledger = pg();
  if (!ledger) return;
  await keepDelivery(ledger, {
    provider: "meta",
    id: digestId(raw),
    door: "/api/instagram",
    url: request.url,
    tenantId: null,
    headers: signatureHeaders(request, [META_SIGNATURE_HEADER]),
    body: raw,
  });
}

/** An account's routing, as one delivery reads it: the channel, none (not ours, or switched off), or a read that failed. */
type Route = { routed: RoutedChannel | null; failed: boolean };

/** What an account's routing means for an item that must be kept: nothing to do, owed again (503), or go on. */
function routeVerdict(route: Route, account: string): "owed" | "skip" | RoutedChannel {
  if (route.failed) {
    doorLog.error("ig_skip_routing_failed", { account });
    return "owed";
  }
  return route.routed ?? "skip";
}

/** A person's name on Instagram, read with the account's token and kept a while; null when it could not be read. */
async function profileNameOf(db: Db, routed: RoutedChannel, igsid: string): Promise<string | null> {
  const key = `${routed.externalId}:${igsid}`;
  const kept = namesRead.get(key);
  if (kept && kept.until > Date.now()) return kept.name;
  const read = await instagramCredentials(db, { id: routed.channelId, credentials_ref: routed.credentialsRef });
  const name = read.outcome === "present" ? await readInstagramName(read.credentials.accessToken, igsid) : null;
  namesRead.set(key, { name, until: Date.now() + (name ? NAME_TTL_MS : NAMELESS_TTL_MS) });
  return name;
}

/** A person's DM: recorded and its answer scheduled. 1 when the database did not take it, so it is owed again. */
async function takeMessage(
  db: Db,
  routed: RoutedChannel,
  e: Extract<InstagramEvent, { kind: "message" }>,
): Promise<number> {
  const log = logger({ tenant_id: routed.tenantId });
  log.info("ig_inbound", { id: e.mid });
  try {
    await recordThenAnswerDm(db, routed, e.item, await profileNameOf(db, routed, e.from));
    return 0;
  } catch (err) {
    log.error("ig_inbound_failed", { id: e.mid, error: errField(err) });
    return err instanceof IngestFailed && !err.kept ? 1 : 0;
  }
}

/**
 * Whether an echo's words are one part of a DM we sent this person lately: a reply too long for one DM left as several
 * (channels instagramDmChunks, the same split), and its row keeps the first part's id alone.
 */
async function isPartOfOurs(db: Db, tenantId: string, person: string, text: string | null): Promise<boolean> {
  const said = text?.trim();
  if (!said) return false;
  const sent = await lastDmsSentTo(db, tenantId, person);
  return sent.some((body) => instagramDmChunks(body).some((part) => part.trim() === said));
}

/**
 * Whether an echo is of a message we sent: kept already under its id, or a later part of a reply we split, or either a
 * moment later (ECHO_SETTLE_MS: our row is written the moment Instagram answers the send). `person` is who it went to
 * here, null for an id nobody holds.
 */
async function isOurs(
  db: Db,
  tenantId: string,
  echo: { mid: string; text: string | null; person: string | null },
  settleMs: number,
): Promise<boolean> {
  const { mid, text, person } = echo;
  const ours = async () =>
    (await messageByExternalId(db, tenantId, mid)) !== null ||
    (person !== null && (await isPartOfOurs(db, tenantId, person, text)));
  if (await ours()) return true;
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  return ours();
}

/**
 * The business's own message on a thread: ours changes nothing; the team's from the Instagram app is kept as their words
 * and pauses the receptionist there, for the workspace's own hours. 1 when it is owed again (a read or a write failed).
 */
async function takeEcho(
  db: Db,
  routed: RoutedChannel,
  e: Extract<InstagramEvent, { kind: "echo" }>,
  settleMs: number,
): Promise<number> {
  const log = logger({ tenant_id: routed.tenantId });
  try {
    const person = e.to ? await personOfInstagramId(db, routed.tenantId, e.to) : null;
    if (await isOurs(db, routed.tenantId, { mid: e.mid, text: e.text, person }, settleMs)) return 0;
    if (!person) {
      log.info("ig_echo_unheld", { id: e.mid });
      return 0;
    }
    const rt = await loadTenantRuntime(db, routed);
    const pauseMs = pauseMsOf(rt.policy["reply"]?.limits);
    const kept = await recordEchoAndPause(db, {
      tenantId: routed.tenantId,
      customerId: person,
      channel: "instagram",
      body: e.text,
      externalId: e.mid,
      pausedUntilIso: new Date(Date.now() + pauseMs).toISOString(),
      // A reply typed in the Instagram app settles the holds it answers, as a dashboard reply does (00438).
      settles: WAITING_REASONS,
    });
    if (kept) log.info("ig_paused_by_echo", { id: e.mid });
    return kept ? 0 : 1;
  } catch (err) {
    log.error("ig_echo_failed", { id: e.mid, error: errField(err) });
    return 1;
  }
}

/** A DM the person took back: no longer kept, its stored attachment removed. 1 when the write failed. */
async function takeUnsend(
  db: Db,
  routed: RoutedChannel,
  e: Extract<InstagramEvent, { kind: "unsent" }>,
): Promise<number> {
  const log = logger({ tenant_id: routed.tenantId });
  try {
    const out = await messageUnsent(db, routed.tenantId, e.mid);
    if (out.outcome === "forgot" && out.storagePath && !(await removeStoredMedia(db, out.storagePath)))
      log.error("ig_unsent_media_kept", { id: e.mid });
    log.info("ig_unsent", { id: e.mid, outcome: out.outcome });
    return 0;
  } catch (err) {
    log.error("ig_unsent_failed", { id: e.mid, error: errField(err) });
    return 1;
  }
}

/** An account no workspace routes: kept nowhere, said on the ledger and to the platform, once a window. */
async function unroutable(db: Db, account: string, n: number): Promise<void> {
  doorLog.error("ig_unroutable", { account, items: n });
  await emitEvent(db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", null, null, {
    channel: "instagram",
    account,
  }).catch(() => {});
  await alertUnroutable("instagram", account, n);
}

/** What api/instagram.ts's POST runs: a delivery, with an echo not kept yet waiting ECHO_SETTLE_MS. */
export async function receiveInstagramEvent(request: Request): Promise<Response> {
  return receiveWith(request, ECHO_SETTLE_MS);
}

/**
 * The same verb with a shorter wait for an echo, for a test. Never an optional second argument of the door's verb itself,
 * which a platform may fill.
 */
export function instagramReceiver(settleMs: number): (request: Request) => Promise<Response> {
  return (request) => receiveWith(request, settleMs);
}

async function receiveWith(request: Request, settleMs: number): Promise<Response> {
  const raw = await request.text();
  if (!signedByInstagramApp(request, raw)) return refuse(401, "bad_signature");
  await keepIgDelivery(request, raw);
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* acknowledged: nothing in it can be read, and no redelivery would change that */
  }
  const events = instagramEventsOf(body);
  const db = pg();
  if (!db) {
    // Nowhere to keep anything: owed again for a DM, as WhatsApp's door owes one it could not record.
    const owed = events.filter((e) => e.kind !== "ignored").length;
    if (owed > 0) doorLog.error("ig_no_database", { items: owed });
    return owed > 0 ? json(503, { ok: false, unrecorded: owed }) : json(200, { ok: true });
  }
  const routes = new Map<string, Promise<Route>>();
  const routeOf = (account: string): Promise<Route> => {
    const known = routes.get(account);
    if (known) return known;
    const read = resolveChannelDetailed(db, "instagram", account).then((r) => ({
      routed: r.channel,
      failed: r.lookupFailed,
    }));
    routes.set(account, read);
    return read;
  };
  // DMs, echoes and unsends the database did not take, or whose account could not be routed: the one thing not acknowledged.
  let unrecorded = 0;
  const unroutableCounts = new Map<string, number>();
  for (const e of events) {
    if (e.kind === "ignored") {
      doorLog.info("ig_event", { what: e.what });
      continue;
    }
    const verdict = routeVerdict(await routeOf(e.account), e.account);
    if (verdict === "owed") {
      unrecorded += 1;
      if (e.kind === "message") await alertUnroutable("instagram_unreadable", e.account, 1);
      continue;
    }
    if (verdict === "skip") {
      if (e.kind === "message") unroutableCounts.set(e.account, (unroutableCounts.get(e.account) ?? 0) + 1);
      continue;
    }
    if (e.kind === "message") unrecorded += await takeMessage(db, verdict, e);
    else if (e.kind === "echo") unrecorded += await takeEcho(db, verdict, e, settleMs);
    else unrecorded += await takeUnsend(db, verdict, e);
  }
  for (const [account, n] of unroutableCounts) await unroutable(db, account, n);
  if (unrecorded > 0) return json(503, { ok: false, unrecorded });
  return json(200, { ok: true });
}
