/**
 * A text arrives on a workspace's line: everything the door decides before a
 * word is answered, apart from the transport.
 *
 * WHY THIS IS A FUNCTION AND NOT THE ENDPOINT. The endpoint's decisions are
 * the ones a customer and the platform actually feel -- whether Twilio is
 * told to redeliver, whether the platform is alerted and in what words,
 * whether the receptionist may speak at all -- and every one of them was
 * held by nothing but a source scan reading the file as text. The house
 * already answers this the same way three times over: `judgeHealth` is the
 * health route's judgement apart from its transport, `callbackPlan` is the
 * OAuth return decided without a network, and `replyPosture` is the
 * handler's own four booleans as a truth table. This is the fourth.
 *
 * IT RETURNS THE ALERT RATHER THAN SENDING IT, which is not tidiness. Both
 * of the things this used to call keep module-level state: the channel
 * lookup caches a routing answer for five minutes, and the unroutable alert
 * suppresses a repeat for fifteen. A decision that sends its own alert can
 * therefore be proved once and never again, and the second proof would pass
 * by saying nothing. Returning the verdict leaves the suppression where it
 * belongs -- on the wire, at the door -- and makes the judgement itself
 * repeatable.
 *
 * Nothing here is injected. Every reader it calls takes its database as an
 * argument, so a test hands it one in memory and the real functions run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { resolveChannelDetailed } from "../packages/db.js";
import type { RoutedChannel } from "../packages/db.js";
import {
  verifyTwilioSignature,
  smsBody,
  carrierConsent,
  smsKeywordConsent,
  mergeConsent,
  SMS_HELD_REASON,
  SMS_HELD_DETAILS,
} from "../packages/channels.js";
import type { ProviderAccount, SmsInbound } from "../packages/channels.js";
import { lineByNumber, lineAccount } from "./sms.js";
import type { SmsLine, SmsSender } from "./sms.js";
import type { InboundCarrier } from "../whatsapp/inbound.js";

type Db = SupabaseClient<Database>;

/**
 * What the door does with this text.
 *
 * A refusal carries everything the wire needs: the status Twilio hears, the
 * line for the log with the level it is logged at, and the sentence the
 * platform is told -- or null, when nobody should be told. A bad signature
 * is the one refusal that alerts nobody: it is what an unsigned probe looks
 * like, and paging a person for it is how an alarm stops being read.
 *
 * `alertKey` is what that sentence is suppressed BY. The default is the number
 * the text came to, which is right for every refusal about a line we know --
 * one alert per number per window. It is exactly wrong for a refusal that
 * happens BEFORE the signature can be checked: the number is then attacker-
 * chosen, so a fresh one every request means a fresh key every request, and
 * the only alarm channel this system has sends one email per POST to a public
 * URL. Those name a constant instead, so the whole class is capped like one.
 */
export type SmsVerdict =
  | { kind: "refuse"; status: number; log: string; level: "warn" | "error"; alert: string | null; alertKey?: string }
  | { kind: "accept"; line: SmsLine; acct: ProviderAccount; routed: RoutedChannel; held: boolean };

/** One suppression key for every text to a number no line carries, whatever the caller writes in `To`. */
export const UNKNOWN_LINE_ALERT_KEY = "unknown-line";

export async function planSmsIngress(o: {
  inbound: SmsInbound;
  /** Twilio's POST fields, exactly as they arrived: the signature covers every one. */
  form: Record<string, string>;
  /** The URL as requested, query string included -- it is part of what was signed. */
  url: string;
  signature: string | null;
  db: Db;
}): Promise<SmsVerdict> {
  const { inbound, form, url, signature, db } = o;

  // The line and its account before anything is trusted. Twilio does not
  // retry an inbound text, so a read that throws was once a customer's words
  // disappearing behind a 500 nobody looked at.
  let line: SmsLine | null;
  let acct: ProviderAccount | null;
  try {
    line = await lineByNumber(db, inbound.to);
    acct = line ? await lineAccount(db, line) : null;
  } catch {
    return {
      kind: "refuse",
      status: 503,
      log: "sms_line_unreadable",
      level: "error",
      alert: "the line or its token could not be read",
    };
  }
  if (!line) {
    // Before the signature: the token that verifies it belongs to the line's
    // own subaccount, so an unknown number cannot be authenticated at all.
    // The signal is worth keeping -- a Twilio number still pointing here whose
    // row was deleted -- but it is suppressed as ONE thing, not one per `To`.
    return {
      kind: "refuse",
      status: 404,
      log: "sms_unknown_line",
      level: "warn",
      alert: "no line row carries this number",
      alertKey: UNKNOWN_LINE_ALERT_KEY,
    };
  }
  if (!acct) {
    return {
      kind: "refuse",
      status: 503,
      log: "sms_line_without_account",
      level: "error",
      alert: "the line has no subaccount or no token in the vault",
    };
  }

  // The dry provider signs nothing, and never exists in production.
  if (line.provider !== "dry") {
    const ok = await verifyTwilioSignature(acct.token, url, form, signature);
    if (!ok) return { kind: "refuse", status: 403, log: "sms_bad_signature", level: "warn", alert: null };
  }

  const { channel: routed, lookupFailed } = await resolveChannelDetailed(db, "sms", inbound.to);
  if (!routed) {
    // A lookup that FAILED is ours to retry; a row that is missing or switched
    // off is an answer, and Twilio is told the text was received so it stops
    // asking. The two must not share a status.
    return lookupFailed
      ? {
          kind: "refuse",
          status: 503,
          log: "sms_routing_lookup_failed",
          level: "error",
          alert: "the sms channel row could not be read",
        }
      : {
          kind: "refuse",
          status: 200,
          log: "sms_unroutable",
          level: "error",
          alert: "the sms channel row is missing or not active",
        };
  }

  // Held: the carriers have not approved this line for texting yet, so the
  // text is kept for a person instead of answered.
  return { kind: "accept", line, acct, routed, held: line.sms_state !== "active" };
}

/**
 * This message's wire, for the handler that already knows how to answer it.
 *
 * Pure: the sender is handed in, so a held line is expressed as no sender at
 * all rather than as a flag some branch might forget to read. A send with no
 * sender is a refusal with a status, never a silent success.
 */
export function carrierFor(inbound: SmsInbound, held: boolean, sender: SmsSender | null): InboundCarrier {
  return {
    channel: "sms",
    send: async (to, body) => {
      if (!sender) return { ok: false, wamid: null, status: 503 };
      return sender.send(to.startsWith("+") ? to : `+${to}`, body);
    },
    body: (text, isFirstReply) => smsBody(text, isFirstReply),
    held: held ? { reason: SMS_HELD_REASON, details: SMS_HELD_DETAILS } : null,
    // The carrier's own verdict and the carriers' words, for this wire only.
    consent: mergeConsent(carrierConsent(inbound), smsKeywordConsent(inbound.body)),
  };
}

/**
 * What Twilio hears when the handler threw.
 *
 * The distinction is redelivery. A text the database did not accept is the
 * one loss the provider can undo, so it is refused with a 503 and the
 * platform is told; Twilio's own log then carries the trace. Anything else
 * already happened after the words were recorded, and asking for the same
 * text again would only duplicate it.
 */
export function smsAfterThrow(unrecorded: boolean): { status: number; alert: string | null } {
  return unrecorded ? { status: 503, alert: "the text could not be recorded" } : { status: 200, alert: null };
}
