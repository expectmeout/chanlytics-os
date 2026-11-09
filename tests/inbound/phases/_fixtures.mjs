/**
 * What the phase files beside this one share: the messages, models, runtimes and consent record the receptionist's
 * world (../_world.mjs) is run with. Split out of tests/whatsapp/inbound-executed.test.mjs (the inbound review of
 * 3 Nov 2026, D4), whose cases run the channel-neutral verb and now live here by the phase they prove.
 */
import { HOUR_MS } from "@chanlytics/contracts";
import { FROM, ingested, runtime, text, world } from "../_world.mjs";

/**
 * The person's consent as the database keeps it since 00361: a message's STOP or START is written by the take that
 * keeps it, and a message taken in again (a text's answer job, a redelivery) reads the consent that stands. The door
 * refuses whatever is sent to a person who said STOP, as deliver does.
 */
export function consentOnRecord() {
  const record = { consent: "unknown", dnc: false };
  const kept = new Set();
  return {
    record,
    ingest: async (_db, _tenant, n) => {
      if (!kept.has(n.externalId)) {
        kept.add(n.externalId);
        if (n.consent.optOut) Object.assign(record, { consent: "opted_out", dnc: true });
        if (n.consent.optIn) Object.assign(record, { consent: "opted_in", dnc: false });
      }
      return { ...ingested(n), ...record };
    },
    get delivered() {
      return record.consent === "opted_out" ? { outcome: "refused", reason: "opted_out", messageId: null } : undefined;
    },
  };
}

export const photo = (id = "wamid.pic", caption = undefined) => ({
  from: FROM,
  id,
  type: "image",
  timestamp: String(Math.floor(Date.now() / 1000)),
  image: { id: "media-1", mime_type: "image/jpeg", ...(caption ? { caption } : {}) },
});

/* ------------------------------------------ one reply per thread at a time (00284, category 15) */

export const sure = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };

export const answers = (words) => ({
  brain: async () => ({
    generateReply: async () => ({ text: words, escalate: false, meta: sure, usage: { input_tokens: 40 } }),
  }),
});

export const modelWorld = (turn) => world({ env: { modelKey: "sk-test" }, turn });

/* ------------------------------------- what each message became (K1) -------------------------------------- */

export const handledOf = (w) => w.seen.handled.map((s) => [s.how, s.intent]);

export const reply = (words, meta = sure, escalate = false) => ({
  brain: async () => ({ generateReply: async () => ({ text: words, escalate, meta, usage: { input_tokens: 40 } }) }),
});

export const never = {
  brain: async () => {
    throw new Error("the model must not be asked");
  },
};

export const refused = { outcome: "refused", reason: "paused", messageId: null };

export const failed = { outcome: "failed", reason: "provider", status: 500, errorBody: null, messageId: null };

export const voice = (id = "wamid.vn") => ({
  from: FROM,
  id,
  type: "audio",
  timestamp: String(Math.floor(Date.now() / 1000)),
  audio: { id: "a1", mime_type: "audio/ogg" },
});

export const veto = runtime({ policy: { reply: { mode: "veto", limits: { reply_delay_ms: 60_000 } } } });

export const floor = runtime({
  policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } },
});

export const onAsk = runtime({ policy: { reply: { mode: "ask", limits: {} } } });

export const unsure = { ...sure, confidence: 0.3 };
// A first delivery that reached us three hours after it was sent: past the two the receptionist may still answer in.

export const lateText = (id = "wamid.late") => ({
  ...text("when do you open?", id),
  timestamp: String(Math.floor((Date.now() - 3 * HOUR_MS) / 1000)),
});
// A texting line the carriers have not approved: every message on it is held for a person.

export const carriersHold = {
  channel: "sms",
  send: async () => ({ ok: true, wamid: "s1", status: 200 }),
  body: (t) => t,
  held: { reason: "carriers", details: "The line is not approved for texting yet." },
};
// A day's model budget of a thousand tokens, and (in the world's `tokensUsed`) more than that spent.

export const overBudget = runtime({ policy: { reply: { mode: "auto", limits: { max_llm_tokens_day: 1000 } } } });
