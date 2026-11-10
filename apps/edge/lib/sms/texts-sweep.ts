/**
 * The texts Twilio could not hand us, taken in from Twilio's own record (the inbound review of 3 Nov 2026, B2).
 *
 * Twilio posts a text to the door once and retries nothing: a text that arrived while the database was down was answered
 * 503 and lost, and the door's 503 bought nothing (WhatsApp has Meta's seven days of redelivery; a text had none). Twilio
 * keeps every text a number received, so this reads each line's own record (the provider's recentTexts: the inbound texts
 * to the number, the last day) and knocks on the door again for each one the database never heard: no message holds its
 * id and no delivery was kept under it. The knock is the door's own request, its fields as Twilio sends them and signed
 * with the line's own token, so everything the door decides (the line, the routing, a one-time code, the carriers' hold,
 * recorded and answered by its job) is decided once, by the door; and it carries the time Twilio says the text was sent
 * (`DateSent`, covered by the signature), so a text that waited out an outage meets the stale gate as the late text it is
 * and is held for a person, not answered as if it had just arrived.
 *
 * Left alone: a text younger than TEXTS_SETTLE_MS (the door may be taking it in now), a one-time code (the door keeps none, by
 * design, so it would be knocked for every tick), and anything already heard. A text taken in twice is one message: the
 * door's replay gate (ingest_inbound) makes a second knock a no-op. A picture's bytes are not in the record read here, so
 * a picture message comes back as its words alone.
 *
 * pg_cron asks the clock every ten minutes ('texts-sweep', 00594) while a line that can text exists. The clock reads no
 * record itself: it hands each workspace with a line that texts one texts_read job (decision 0115, 00605), spread over five
 * minutes and one a workspace while one waits or runs, and says how many in one texts_swept. The ledger runs each job with
 * its retries and Health; the job reads its own workspace's lines, starting none past its deadline, and a line it left is
 * read on the next tick. The clock used to read every line inside its own tick, oldest first for forty seconds: about a
 * hundred lines, and past that the newest were never read.
 */
import { HOUR_MS, MIN_MS, oneTimeCodeOf, type TenantId } from "@chanlytics/contracts";
import { signTwilio, type ReceivedText } from "@chanlytics/channels/lines";
import { findLinesThatText } from "@chanlytics/db/lines";
import { findTextsAlreadyHeard } from "@chanlytics/db/events";
import { handOutJobs } from "@chanlytics/db/jobs";
import { env } from "../shared/env.js";
import { json } from "../shared/http.js";
import { errField, logger, type Logger } from "../shared/log.js";
import { HAND_OUT_SPREAD_SECONDS } from "../shared/sweep-rotation.js";
import { lineProviderFromEnv, type LineProviderChoice } from "../lines/lines.js";
import type { SweepTick } from "../ops/sweep-door.js";
import { receiveInboundText } from "./inbound-text.js";
import { findLineAccount } from "../lines/sms.js";

/** How far back a line's record is read: a day of an outage, at most, is taken in. */
const TEXTS_LOOKBACK_MS = 24 * HOUR_MS;
/** A text younger than this is the door's: it may be taking it in now. */
const TEXTS_SETTLE_MS = 2 * MIN_MS;
/** The door a text is knocked on again at, as Twilio is told to post it. */
const TEXT_DOOR_PATH = "/api/inbound-sms";

/** What the sweep reaches outside the database: the door, the line provider, the edge's own origin and the clock. */
interface TextsSweepWorld {
  door: (request: Request) => Promise<Response>;
  provider: LineProviderChoice | null;
  origin: string | null;
  now: () => number;
}

const realWorld = (): TextsSweepWorld => ({
  door: receiveInboundText,
  provider: lineProviderFromEnv(),
  origin: env.EDGE_ORIGIN ?? null,
  now: Date.now,
});

/** The door's request for one text, as Twilio would post it, signed with the line's own token. */
async function knockFor(url: string, token: string, form: Record<string, string>): Promise<Request> {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": await signTwilio(token, url, form),
    },
    body: new URLSearchParams(form).toString(),
  });
}

/** A line the sweep reads: the lines that text, each with its number. */
type SweptLine = Awaited<ReturnType<typeof findLinesThatText>>[number] & { e164: string };
/** One line's account and the texts its record holds. */
type LineRecord = { account: { sid: string; token: string }; texts: ReceivedText[] };
/** What one workspace's job did, as its one line says it. */
type TextsRead = { lines: number; read: number; unheard: number; taken: number; failed: number; left: number };

/** The line's account (its token is the vault's) and its record: null for a line with no account, which has none. */
async function readLineRecord(
  db: SweepTick["db"],
  choice: LineProviderChoice,
  line: SweptLine,
  world: TextsSweepWorld,
): Promise<LineRecord | null> {
  const account = await findLineAccount(db, line);
  return account
    ? { account, texts: await choice.provider.recentTexts(account, line.e164, world.now() - TEXTS_LOOKBACK_MS) }
    : null;
}

/** Each text of one line's record the database never heard, knocked on the door again, the job's counts kept. */
async function knockUnheard(
  { db, log }: { db: SweepTick["db"]; log: Logger },
  { line, record, url }: { line: SweptLine; record: LineRecord; url: string },
  world: TextsSweepWorld,
  counts: TextsRead,
): Promise<void> {
  const { account, texts } = record;
  counts.read += texts.length;
  const settled = texts.filter((t) => t.atMs <= world.now() - TEXTS_SETTLE_MS && !oneTimeCodeOf(t.body));
  const heard = await findTextsAlreadyHeard(
    db,
    settled.map((t) => t.sid),
  );
  for (const text of settled) {
    if (heard.has(text.sid)) continue;
    counts.unheard += 1;
    const form: Record<string, string> = {
      MessageSid: text.sid,
      AccountSid: account.sid,
      From: text.from,
      To: line.e164,
      Body: text.body,
      NumMedia: "0",
      DateSent: new Date(text.atMs).toISOString(),
      ...(line.messaging_service_sid ? { MessagingServiceSid: line.messaging_service_sid } : {}),
    };
    const answered = await world.door(await knockFor(url, account.token, form));
    if (answered.ok) counts.taken += 1;
    else counts.failed += 1;
    // The line and when it was sent, never the number or the words.
    log.warn("text_unheard_taken_in", {
      tenant_id: line.tenant_id,
      line: line.id,
      status: answered.status,
      sent_at: form.DateSent,
    });
  }
}

/** The lines of every workspace, or of one, that text on the provider this edge runs. */
async function sweptLines(db: SweepTick["db"], choice: LineProviderChoice, tenantId?: TenantId): Promise<SweptLine[]> {
  return (await findLinesThatText(db, tenantId)).flatMap((line) =>
    line.provider === choice.name && line.e164 ? [{ ...line, e164: line.e164 }] : [],
  );
}

/** One tick of the clock: each workspace with a line that texts handed one texts_read job, and how many said. */
export async function sweepUnheardTexts({ db, L }: SweepTick, world: TextsSweepWorld = realWorld()): Promise<Response> {
  const choice = world.provider;
  if (!choice || !world.origin) {
    const skipped = !choice ? "no_line_provider" : "no_origin";
    L.info("texts_swept", { skipped });
    return json(200, { ok: true, skipped });
  }
  let tenants: TenantId[];
  try {
    tenants = [...new Set((await sweptLines(db, choice)).map((line) => line.tenant_id))];
  } catch (e) {
    L.error("texts_read_failed", { error: errField(e) });
    return json(500, { ok: false });
  }
  const handed = await handOutJobs(db, { kind: "texts_read", tenants, spreadSeconds: HAND_OUT_SPREAD_SECONDS });
  L.info("texts_swept", { workspaces: tenants.length, handed });
  return json(200, { ok: true, workspaces: tenants.length, handed });
}

/** Where one workspace's job reads: its database, the workspace, when it stops starting a line, and its log. */
interface TextsTurn {
  db: SweepTick["db"];
  tenantId: TenantId;
  deadline: number;
  log: Logger;
}

/**
 * One workspace's texts_read: its lines' records read, and each text the database never heard knocked on the door again.
 * No line is started past the deadline, and one left is read on the next tick; a line whose record cannot be read is said
 * and counted, and the next tick reads it again. Null when this edge reads no texts, or the workspace has no line that texts.
 */
async function readWorkspaceTexts(
  { db, tenantId, deadline, log }: TextsTurn,
  world: TextsSweepWorld,
): Promise<TextsRead | null> {
  const choice = world.provider;
  if (!choice || !world.origin) return null;
  const lines = await sweptLines(db, choice, tenantId);
  if (lines.length === 0) return null;
  const url = `${world.origin.replace(/\/+$/, "")}${TEXT_DOOR_PATH}`;
  const out: TextsRead = { lines: 0, read: 0, unheard: 0, taken: 0, failed: 0, left: 0 };
  for (const [i, line] of lines.entries()) {
    if (world.now() > deadline) {
      out.left += lines.length - i;
      break;
    }
    out.lines += 1;
    let record: LineRecord | null;
    try {
      record = await readLineRecord(db, choice, line, world);
    } catch (e) {
      out.failed += 1;
      log.warn("texts_read_failed", { tenant_id: tenantId, line: line.id, error: errField(e) });
      continue;
    }
    if (record) await knockUnheard({ db, log }, { line, record, url }, world, out);
  }
  log.info("texts_read", { tenant_id: tenantId, ...out });
  return out;
}

/** texts_read as the job runner takes it. */
export function textsReader(db: SweepTick["db"], world: TextsSweepWorld = realWorld()) {
  return {
    read: async (
      job: { tenant_id: TenantId },
      deadline: number,
    ): Promise<{ read: TextsRead } | { skipped: string }> => {
      const turn = { db, tenantId: job.tenant_id, deadline, log: logger({ tenant_id: job.tenant_id }) };
      const read = await readWorkspaceTexts(turn, world);
      return read ? { read } : { skipped: "no line that texts" };
    },
  };
}
