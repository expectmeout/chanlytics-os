/**
 * The channel-quality sweep (the Reports lenses spec, K9): every six hours, each connected WhatsApp number's quality
 * rating (GREEN, YELLOW, RED, NA or UNKNOWN) is read from Meta with the token its workspace already holds, and kept
 * through the database's door (channel_keep_quality, 00315), which writes a channel.quality_rating event { from, to }
 * when the word differs from the last one read. The word is kept beside the rating stored at connection
 * (config.quality_rating), never over it: what a broadcast is gated on does not change here. The reading is
 * readNumberQualities (lib/whatsapp/number-quality.ts); nothing here decides what a number's rating means.
 *
 * The work is bounded by time: up to MAX_DUE numbers are listed, the ones never read and then the longest unread, each
 * read once in five hours and AT_ONCE at a time, and no read starts after YIELD_AT_MS from the door's first line, so
 * what is left is first in line next tick.
 *
 * pg_cron runs it at minute 41 of every sixth hour ('channel-quality-sweep', 00315), and trigger_channel_quality_sweep
 * asks the edge (request_sweep) only when an active WhatsApp channel exists, and otherwise records only that it looked.
 * sweep_health() judges the answer and expects one at least every 19 hours (00315). Auth is authorizeCron: the
 * x-cron-key header against the sweep key held in Vault.
 *
 * It answers 200 with the counts, whatever Meta said: a Meta that is down, a token that was revoked, a word it has not
 * said before are not the sweep's fault, and those numbers are read next tick. It answers 503 only when the channels
 * cannot be read. Its lines carry `sweep: "channel_quality"`, and the tick ends in one channel_quality_swept.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger, errField, door } from "../../lib/log.js";
import { readNumberQualities } from "../../lib/whatsapp/number-quality.js";

/**
 * No read starts after this, counted from the door's first line: the last one may start just before it and run
 * GRAPH_TIMEOUT_MS (meta-graph.ts), then the writes. ops-hygiene.test.mjs holds the sum under the limit in vercel.json.
 */
export const YIELD_AT_MS = 30_000;

export const POST = door(async function POST(request: Request): Promise<Response> {
  // The budget's clock, from the first line: the door's own reads and a cold start are inside the limit too.
  const started = Date.now();
  const L = logger({ sweep: "channel_quality" });
  const db = pg();
  if (!db) {
    L.error("channel_quality_no_db");
    return refuse(503, "no_database");
  }
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  try {
    const out = await readNumberQualities({ db, log: L, now: Date.now, started, yieldAtMs: YIELD_AT_MS });
    // The count the answer calls no_token is logged as `tokenless`: the logger redacts a key that ends in `token`.
    const { no_token: tokenless, ...counts } = out;
    L.info("channel_quality_swept", { ...counts, tokenless });
    return json(200, { ok: true, ...out });
  } catch (e) {
    // The channels could not be read: nothing was asked of Meta, and sweep_health turns the 503 red.
    L.error("channel_quality_unreadable", { error: errField(e) });
    return refuse(503, "no_database");
  }
});
