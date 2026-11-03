/**
 * The texts Twilio could not hand us, taken in from Twilio's own record (the inbound review of 3 Nov 2026, B2).
 *
 * Twilio posts a text to the door once and retries nothing: a text that arrived while the database was down was answered
 * 503 and lost, and the door's 503 bought nothing (WhatsApp has Meta's seven days of redelivery; a text had none). Twilio
 * keeps every text a number received, so this reads each line's own record (the provider's recentTexts: the newest
 * inbound texts to the number, the last day) and knocks on the door again for each one the database never heard: no
 * message holds its id and no delivery was kept under it. The knock is the door's own request, its fields as Twilio sends
 * them and signed with the line's own token, so everything the door decides (the line, the routing, a one-time code, the
 * carriers' hold, recorded and answered by its job) is decided once, by the door; and it carries the time Twilio says the
 * text was sent (`DateSent`, covered by the signature), so a text that waited out an outage meets the stale gate as the
 * late text it is and is held for a person, not answered as if it had just arrived.
 *
 * Left alone: a text younger than TEXTS_SETTLE_MS (the door may be taking it in now), a one-time code (the door keeps none, by
 * design, so it would be knocked for every tick), and anything already heard. A text taken in twice is one message: the
 * door's replay gate (ingest_inbound) makes a second knock a no-op. A picture's bytes are not in the record read here, so
 * a picture message comes back as its words alone.
 *
 * pg_cron asks for it every ten minutes ('texts-sweep', 00517) while a line that can text exists; the work is bounded by
 * time (TEXTS_YIELD_AT_MS from the door's first line), and the tick ends in one texts_swept with its counts.
 */
import { HOUR_MS, MIN_MS, oneTimeCodeOf } from "../packages/contracts.js";
import { twilioSignature, type ReceivedText } from "../packages/channels.js";
import { linesThatText, textsAlreadyHeard } from "../packages/db.js";
import { env } from "../env.js";
import { json } from "../http.js";
import { errField } from "../log.js";
import { lineProviderFromEnv, type LineProviderChoice } from "../lines/lines.js";
import type { SweepTick } from "../ops/sweep-door.js";
import { receiveInboundText } from "./inbound-text.js";
import { lineAccount } from "./sms.js";

/** How far back a line's record is read: a day of an outage, at most, is taken in. */
export const TEXTS_LOOKBACK_MS = 24 * HOUR_MS;
/** A text younger than this is the door's: it may be taking it in now. */
export const TEXTS_SETTLE_MS = 2 * MIN_MS;
/** No line is read after this, counted from the door's first line (vercel.json holds the function at sixty seconds). */
export const TEXTS_YIELD_AT_MS = 40_000;
/** The door a text is knocked on again at, as Twilio is told to post it. */
export const TEXT_DOOR_PATH = "/api/inbound-sms";

/** What the sweep reaches outside the database: the door, the line provider, the edge's own origin and the clock. */
export interface TextsSweepWorld {
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
      "x-twilio-signature": await twilioSignature(token, url, form),
    },
    body: new URLSearchParams(form).toString(),
  });
}

/** One tick: every line's record read, and each text the database never heard knocked on the door again. */
export async function sweepUnheardTexts(tick: SweepTick, world: TextsSweepWorld = realWorld()): Promise<Response> {
  const { db, L, started } = tick;
  const counts = { lines: 0, read: 0, unheard: 0, taken: 0, failed: 0 };
  const choice = world.provider;
  if (!choice || !world.origin) {
    L.info("texts_swept", { ...counts, skipped: !choice ? "no_line_provider" : "no_origin" });
    return json(200, { ok: true, ...counts });
  }
  const url = `${world.origin.replace(/\/+$/, "")}${TEXT_DOOR_PATH}`;
  for (const line of await linesThatText(db)) {
    if (line.provider !== choice.name || !line.e164) continue;
    if (world.now() - started > TEXTS_YIELD_AT_MS) break;
    counts.lines += 1;
    // The line's account (its token is the vault's) and its record: a line with no account has no texts to read.
    let read: { account: { sid: string; token: string }; texts: ReceivedText[] } | null;
    try {
      const account = await lineAccount(db, line);
      read = account
        ? { account, texts: await choice.provider.recentTexts(account, line.e164, world.now() - TEXTS_LOOKBACK_MS) }
        : null;
    } catch (e) {
      counts.failed += 1;
      L.warn("texts_read_failed", { tenant_id: line.tenant_id, line: line.id, error: errField(e) });
      continue;
    }
    if (!read) continue;
    const { account, texts } = read;
    counts.read += texts.length;
    const settled = texts.filter((t) => t.atMs <= world.now() - TEXTS_SETTLE_MS && !oneTimeCodeOf(t.body));
    const heard = await textsAlreadyHeard(
      db,
      settled.map((t) => t.sid),
    );
    for (const t of settled) {
      if (heard.has(t.sid)) continue;
      counts.unheard += 1;
      const form: Record<string, string> = {
        MessageSid: t.sid,
        AccountSid: account.sid,
        From: t.from,
        To: line.e164,
        Body: t.body,
        NumMedia: "0",
        DateSent: new Date(t.atMs).toISOString(),
        ...(line.messaging_service_sid ? { MessagingServiceSid: line.messaging_service_sid } : {}),
      };
      const answered = await world.door(await knockFor(url, account.token, form));
      if (answered.ok) counts.taken += 1;
      else counts.failed += 1;
      // The line and when it was sent, never the number or the words.
      L.warn("text_unheard_taken_in", {
        tenant_id: line.tenant_id,
        line: line.id,
        status: answered.status,
        sent_at: form.DateSent,
      });
    }
  }
  L.info("texts_swept", counts);
  return json(200, { ok: true, ...counts });
}
