/**
 * The daily canary on the real wires (the inbound review of 3 Nov 2026, D6): a text from a number of the platform's own
 * to the platform's own line, and, a quarter of an hour later, proof that the door took it in and the receptionist's
 * reply left. Nothing else shows that a real Twilio text gets a real answer while real traffic is near zero: the suite
 * fakes the wires, and the nightly cannot send one.
 *
 * pg_cron asks for it at 14:00 and 14:15 UTC ('text-canary', 00595). Each tick reads the line's own record from Twilio for the
 * canary's words in the last CHECK_WITHIN_MS: none, and it sends one (CANARY_SMS_SERVICE, a Messaging Service of the
 * master account holding the canary's number, to CANARY_SMS_TO, the platform workspace's line); one younger than
 * CHECK_AFTER_MS, and it waits; an older one, and it asks the database what became of it, and pages the platform when
 * the door never took it in, nothing answered it, or the answer did not leave. Each condition pages under its own key,
 * once a window (pageOperator).
 *
 * Off until both settings are set, and on a deployment with no line provider: it says so and sends nothing. The canary's
 * Messaging Service must answer nothing itself and post nothing to our door (no inbound request URL), or the
 * receptionist's reply to the canary's number would come back to a door that knows no line for it.
 *
 * A check that is not checking is no pass. Off answered 200 and a line in the log, and so did a record that could not
 * be read: on 13 November 2026 production's clock had been green every day since it was registered and no canary had
 * ever been sent. So where a line texts (packages/db findLinesThatText), off pages the platform under `text_canary_off`
 * with what to set, and a failed read pages under `text_canary_unread`: the pager's own window makes the day's two
 * ticks one page. With no line that texts there is nothing to check, and it stays quiet.
 */
import { MIN_MS } from "@chanlytics/contracts";
import { answerOfMessage } from "@chanlytics/db/channels";
import { findLinesThatText } from "@chanlytics/db/lines";
import { env } from "../shared/env.js";
import { json } from "../shared/http.js";
import { errField } from "../shared/log.js";
import { lineProviderFromEnv, type LineProviderChoice } from "../lines/lines.js";
import { pageOperator } from "../shared/alerts/page-operator.js";
import type { SweepTick } from "../ops/sweep-door.js";
import { findLineAccount, findLineByNumber } from "../lines/sms.js";

/** The canary's words: a customer's ordinary question, which the receptionist answers. Found in the record by them. */
const CANARY_WORDS = "Hi! Are you open today? (a daily check from Chanlytics)";
/** The check waits this long after the text was sent: the answer is a job, and the model takes its seconds. */
const CHECK_AFTER_MS = 10 * MIN_MS;
/** A canary text older than this is yesterday's: a new one is sent. */
const CHECK_WITHIN_MS = 45 * MIN_MS;

/** What the canary reaches outside the database: the provider, its two settings, the clock and the pager. */
interface CanaryWorld {
  provider: LineProviderChoice | null;
  service: string | null;
  to: string | null;
  now: () => number;
  page: (key: string, subject: string, body: string) => Promise<unknown>;
}

const realWorld = (tick: SweepTick): CanaryWorld => ({
  provider: lineProviderFromEnv(),
  service: env.CANARY_SMS_SERVICE ?? null,
  to: env.CANARY_SMS_TO ?? null,
  now: Date.now,
  page: (key, subject, body) => pageOperator({ db: tick.db }, key, subject, body),
});

/** Why the canary is off, as its page says it to the platform: what is missing, and what to do about it. */
const OFF_WORDS = {
  not_set:
    "Lines text customers, and nothing proves a real text gets a real answer: the daily check is switched off. " +
    'CANARY_SMS_SERVICE and CANARY_SMS_TO are not both set on the edge. Set them (runbook, "Turn on the daily text ' +
    'canary") and the next 14:00 UTC sends the first one; it costs two texts a day.',
  no_line_provider:
    "Lines are on file and this deployment holds no line provider's credentials, so the daily check cannot send its " +
    "text or read what became of it. Give the edge its line provider's keys.",
  no_line:
    "The daily check is set and cannot run: CANARY_SMS_TO names no line on file, or that line's credentials are not " +
    "in the vault. Set it to the platform workspace's own line.",
} as const;

/** What the platform is told when the line's record could not be read: the day's check was not judged. */
const UNREAD_WORDS =
  "The line provider did not answer the read of the platform line's received texts, so today's check was not judged " +
  "on this tick. The next tick asks again. If this page repeats, read text_canary_read_failed in the edge's log for " +
  "what the provider said.";

/** One tick: send today's canary, wait for it, or judge it. */
export async function sweepCanary(tick: SweepTick, world: CanaryWorld = realWorld(tick)): Promise<Response> {
  const { db, L } = tick;
  const off = async (reason: keyof typeof OFF_WORDS) => {
    L.info("text_canary_off", { why: reason });
    // Off is told where there is something to check, and only there: a deployment with no line that texts is quiet.
    if ((await findLinesThatText(db)).length > 0)
      await world.page("text_canary_off", "The daily text check is not checking", OFF_WORDS[reason]);
    return json(200, { ok: true, off: reason });
  };
  if (!world.service || !world.to) return off("not_set");
  if (!world.provider) return off("no_line_provider");
  const line = await findLineByNumber(db, world.to);
  const account = line ? await findLineAccount(db, line) : null;
  if (!line || !account) return off("no_line");

  const now = world.now();
  let sent;
  try {
    sent = (await world.provider.provider.recentTexts(account, world.to, now - CHECK_WITHIN_MS)).filter(
      (t) => t.body === CANARY_WORDS,
    )[0];
  } catch (e) {
    L.warn("text_canary_read_failed", { error: errField(e) });
    // Not judged is not passed: the platform is told, in words of ours (the provider's own stay in the log).
    await world.page("text_canary_unread", "The daily text check could not read the line's record", UNREAD_WORDS);
    return json(200, { ok: true, step: "read_failed" });
  }

  if (!sent) {
    const out = await world.provider.provider.sendSms(world.provider.master, {
      serviceSid: world.service,
      to: world.to,
      body: CANARY_WORDS,
    });
    L.info("text_canary_sent", { ok: out.ok, status: out.status });
    if (!out.ok)
      await world.page(
        "text_canary_send_failed",
        "The daily text canary could not be sent",
        `Twilio refused the canary's text to the platform's line (status ${out.status}). The answer path was not tried today.`,
      );
    return json(200, { ok: true, step: "sent", sent: out.ok });
  }
  if (now - sent.atMs < CHECK_AFTER_MS) {
    L.info("text_canary_waiting", { age_ms: now - sent.atMs });
    return json(200, { ok: true, step: "waiting" });
  }

  const became = await answerOfMessage(db, sent.sid);
  // What failed, as the page says it: its key (one page a window each), its subject and its body.
  const failed: [key: string, subject: string, body: string] | null = !became.kept
    ? [
        "text_canary_not_taken_in",
        "The door never took in today's canary text",
        "Twilio has the text; the database does not. The texts sweep should take it in: read texts_swept and text_unheard_taken_in.",
      ]
    : !became.reply
      ? [
          "text_canary_no_reply",
          "Nothing answered today's canary text",
          'The door kept the text and no reply names it. Read its trail: runbook, "A customer says nobody answered".',
        ]
      : !["sent", "delivered", "read"].includes(became.reply)
        ? [
            "text_canary_reply_failed",
            "The answer to today's canary text did not leave",
            `The reply is ${became.reply}. Read the message's row and its send_failed hold.`,
          ]
        : null;
  if (failed) {
    L.warn("text_canary_failed", { key: failed[0] });
    await world.page(failed[0], failed[1], failed[2]);
    return json(200, { ok: true, step: "checked", passed: false, key: failed[0] });
  }
  L.info("text_canary_ok", { reply: became.reply, waited_ms: now - sent.atMs });
  return json(200, { ok: true, step: "checked", passed: true });
}
