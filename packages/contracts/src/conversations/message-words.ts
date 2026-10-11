/**
 * What a message says and what became of it: its words wherever they are shown, its send status in the
 * operator's words, whether it reached the customer, whether it is a held draft, and words clipped at a whole
 * word. Its attachment is message-media.ts, an email's quoted chain message-email.ts, its sender message-author.ts.
 */
import type { MessageDto } from "./thread-dto";
import { MEDIA_LABEL, mediaKind } from "./message-media";
import { splitQuotedReply } from "./message-email";
import { isChatMessage, writtenChannelOf } from "./thread-channel";

/** What an email's `delivered` receipt says: their mail server took it, which is as far as an email can be followed. */
const EMAIL_DELIVERED = "Reached their mail server";

/**
 * What happened to a message we tried to send, in the operator's words.
 *
 * ONE vocabulary. The Inbox had its own ternary and the Conversations pane had
 * nothing at all, so the same message read as "Canceled before sending" on one
 * screen and as an ordinary delivered reply on the other — and Conversations is
 * the screen whose entire job is "what is my receptionist saying to people".
 *
 * The wire is an input because one word does not mean one thing on every wire: a text's or a WhatsApp message's
 * "Delivered" is on their phone, but an email's receipt says only that the receiving mail server accepted it (the
 * provider's `delivered`), which is not the same as being in front of them. The email says what it knows. Every other
 * wire, and a row that names none, keeps the words it always had.
 */
export function messageStatusLabel(status: string | undefined, channel?: string | null): string | undefined {
  switch (status) {
    case "queued":
      return "Sending…";
    case "failed":
      return "Didn't send";
    case "canceled":
      return "Canceled before sending";
    case "read":
      return "Read";
    case "delivered":
      return channel === "email" ? EMAIL_DELIVERED : "Delivered";
    default:
      return undefined;
  }
}

/* ---- why it did not arrive ---- */

/**
 * What a WhatsApp error code means, in the owner's words. Each is the meaning Meta documents for the code (WhatsApp Cloud
 * API, "Error codes", read 5 Oct 2026), or one this repository already says of it (channels whatsapp.ts: 130429, 131048
 * and 131056). A code that is not here is never given a meaning: it is said by its number (sendFailureWords).
 */
const WHATSAPP_FAILURES: Readonly<Record<number, string>> = {
  130429: "Your number has reached WhatsApp's message limit for now",
  131026:
    "WhatsApp couldn't deliver it: their number may not be on WhatsApp, or they haven't accepted its latest terms or updated the app",
  131031: "Your WhatsApp Business account is restricted or disabled, or WhatsApp couldn't verify its details",
  131042: "WhatsApp reports a problem with your payment method",
  131047:
    "WhatsApp wouldn't send it: more than 24 hours have passed since they last replied, so only a template message can reach them now",
  131048:
    "WhatsApp is limiting how many messages your number can send, because earlier ones were blocked or flagged as spam",
  131049:
    "WhatsApp held it back: Meta limits marketing messages to each person, and isn't delivering marketing messages to US numbers at all for now",
  131050: "They've chosen to stop receiving marketing messages from your business on WhatsApp",
  131053: "WhatsApp couldn't upload the attachment, for a reason such as a file type it doesn't support",
  131056:
    "Your number sent them too many messages in a short while, and WhatsApp asks you to wait before sending more to them",
  132000: "The template's variable values didn't match the ones it defines",
  132001: "That template doesn't exist in this language, or hasn't been approved",
  132012: "The template's variable values were formatted wrongly",
  132015: "That template is paused because of its low quality",
  132016: "That template was permanently disabled for low quality",
};

/**
 * What a Twilio error code means for a text, in the owner's words: the meaning Twilio documents for the code (twilio.com
 * "Error and warning dictionary", read 5 Oct 2026), or one this repository already says of it (channels sms.ts: 21610, 30003,
 * 30007 and 30034). Any other code is said by its number.
 */
const SMS_FAILURES: Readonly<Record<number, string>> = {
  21211: "That isn't a valid phone number",
  21408: "Texts to that region are turned off for your account",
  21610: "They've opted out of texts from your number",
  21614: "That number isn't a valid mobile number",
  30003: "Their phone couldn't be reached: it may be off, out of signal, or unable to receive texts",
  30004: "The text was blocked from reaching this number",
  30005: "The carrier says this number is unknown and may no longer exist",
  30006: "This number can't receive texts, which is typical of a landline",
  30007: "The text was filtered as a possible policy violation",
  30008: "The carrier gave no reason for not delivering it",
  30034: "Your texting line isn't registered with the carriers yet, so they blocked it",
};

/** The provider's own word for a text's fate when it gives no code (Twilio's message statuses). */
const SMS_STATUS_WORDS: Readonly<Record<string, string>> = {
  undelivered: "The carrier didn't deliver it.",
  failed: "The text couldn't be sent.",
  canceled: "The text was canceled before it left.",
};

/** Why an email did not arrive, by what the provider's receipt was (`messages.error.provider`: the email door's own words). */
const EMAIL_FAILURES: Readonly<Record<string, string>> = {
  bounced: "The email bounced: their address didn't accept it.",
  failed: "The mail provider couldn't send it.",
  suppressed: "The mail provider has stopped sending to this address after an earlier bounce or complaint.",
};

/** Why a send that never went out says so, by the reason the ledger settled it with (jobs settle.ts, edge unfinished.ts). */
const SETTLED_FAILURES: Readonly<Record<string, string>> = {
  never_delivered: "It was never sent: the job that would have sent it never ran.",
  run_interrupted: "It may not have gone: the run that was sending it did not finish.",
  orphaned: "It was never sent: no job was left to send it.",
};

const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** A table's words for a key it holds itself: `constructor` and `toString` belong to every object, and are no word of any table. */
function tableWord<K extends string | number>(table: Readonly<Record<K, string>>, key: K): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** A code as a number: a number, or digits in a string; nothing else is one. */
function codeOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 ? v : null;
  return typeof v === "string" && /^\d{3,6}$/.test(v.trim()) ? Number(v.trim()) : null;
}

/**
 * The provider's error code on a failed row, wherever the writer put it: a receipt's `errors` list (WhatsApp), a
 * receipt's `code` (a text's status callback), or the answer to the send itself, as `body`: Graph's JSON, cut at two
 * hundred characters so read for its `"code"` rather than parsed, or "Twilio 30034".
 *
 * Said again once in SQL, `public.provider_code_of` (00399), which the Campaigns ledger groups why sends failed by;
 * reports/campaigns/provider-code.db.test.mjs holds the two to the same answer for every shape of error.
 */
export function providerCodeOf(error: Record<string, unknown>): number | null {
  const listed = Array.isArray(error.errors) ? record(error.errors[0]) : null;
  const direct = codeOf(listed?.code) ?? codeOf(error.code);
  if (direct !== null) return direct;
  const body = error.body;
  if (typeof body === "string") {
    const graph = /"code"\s*:\s*(\d{3,6})/.exec(body);
    if (graph) return Number(graph[1]);
    const twilio = /^Twilio (\d{5})$/.exec(body.trim());
    return twilio ? Number(twilio[1]) : null;
  }
  return codeOf(record(record(body)?.error)?.code);
}

/**
 * ONE sentence on why a message did not arrive, from what its row's `error` says (the provider's code and words, kept
 * by the receipt or the send that failed), for the owner and never for a customer: the thread draws it under "Didn't
 * send", and the hold a late failure raises says it. A code whose meaning is documented (above) is said in plain words
 * with its number after it; any other code is said by the provider and the number, never a guess ("WhatsApp didn't
 * deliver it (error 131000)."). Null when the row says nothing it can be read by, which is the honest answer.
 */
export function sendFailureWords(error: unknown, channel: string | null | undefined): string | null {
  const e = record(error);
  if (!e) return null;
  const wire = writtenChannelOf(channel);
  if (wire === "email") {
    const provider = typeof e.provider === "string" ? e.provider : "";
    return tableWord(EMAIL_FAILURES, provider) ?? settledWords(e);
  }
  const code = providerCodeOf(e);
  const sms = wire === "sms";
  if (code !== null) {
    const meaning = tableWord(sms ? SMS_FAILURES : WHATSAPP_FAILURES, code);
    if (meaning) return `${meaning} (${sms ? "Twilio" : "WhatsApp"} error ${code}).`;
    return sms ? `Twilio didn't deliver it (error ${code}).` : `WhatsApp didn't deliver it (error ${code}).`;
  }
  const carrier = typeof e.carrier === "string" ? tableWord(SMS_STATUS_WORDS, e.carrier) : undefined;
  return carrier ?? settledWords(e);
}

/** The ledger's word for a send the provider never answered (`outcome: "unknown"` on the row): it may have gone. */
const OUTCOME_UNKNOWN_KIND = "outcome_unknown";

/**
 * The sentence `sendFailureWords` says for a failure the Campaigns ledger keeps as a closed pair instead of the row's
 * `error` (00399, `failed_sends.by_code`: no body, no number, no address ever leaves the database). The pair is the
 * provider's `code` (a text's or a WhatsApp message's; an email carries none, its word decides) or, with no code, one `kind`
 * of a closed set, read as the channel reads it:
 *   - an email's `provider`: bounced, failed, suppressed;
 *   - a text's `carrier`: undelivered, failed, canceled;
 *   - a settled row's `reason`, on any wire: never_delivered, run_interrupted, orphaned;
 *   - `outcome_unknown`, on any wire: the provider never answered (`outcome: "unknown"`), so it may have gone.
 * `unknown`, a word the channel does not have and a null kind say null. The Inbox's thread and Reports therefore say a
 * failure alike, from the one set of tables.
 */
export function failureWordsOf(
  channel: string | null | undefined,
  key: { code: number | null; kind: string | null },
): string | null {
  if (key.code !== null) return sendFailureWords({ code: key.code }, channel);
  if (key.kind === null) return null;
  if (key.kind === OUTCOME_UNKNOWN_KIND) return sendFailureWords({ outcome: "unknown" }, channel);
  const wire = writtenChannelOf(channel);
  const own = wire === "email" ? { provider: key.kind } : wire === "sms" ? { carrier: key.kind } : {};
  return sendFailureWords({ ...own, reason: key.kind }, channel);
}

/** Why this message did not arrive, when it failed and its row says why (sendFailureWords); null for any other message. */
function messageFailedWhy(m: Pick<MessageDto, "status" | "error" | "channel">): string | null {
  return m.status === "failed" ? sendFailureWords(m.error, m.channel) : null;
}

/**
 * What became of one of our messages, as a bubble says it: the words for its status, why it failed when its row says,
 * and whether it reached them. The words themselves live here (messageStatusLabel, sendFailureWords), so the Inbox's thread
 * and Conversations cannot describe the same message differently -- which is exactly what they were doing.
 */
export function sentFactsOf(m: Pick<MessageDto, "status" | "error" | "channel">): {
  statusLabel?: string;
  failedWhy?: string;
  reachedCustomer: boolean;
} {
  const statusLabel = messageStatusLabel(m.status, m.channel);
  const failedWhy = messageFailedWhy(m);
  return {
    ...(statusLabel ? { statusLabel } : {}),
    ...(failedWhy ? { failedWhy } : {}),
    reachedCustomer: reachedCustomer(m.status),
  };
}

/** The words for a failure that carries no provider's code: the ledger's own reasons, or a send whose outcome is not known. */
function settledWords(e: Record<string, unknown>): string | null {
  const settled = typeof e.reason === "string" ? tableWord(SETTLED_FAILURES, e.reason) : undefined;
  if (settled) return settled;
  return e.outcome === "unknown"
    ? "The provider didn't answer in time, so it may have gone: check the thread before sending it again."
    : null;
}

/** Did the customer actually receive these words? */
export function reachedCustomer(status: string | undefined): boolean {
  return status !== "queued" && status !== "failed" && status !== "canceled";
}

/**
 * The last thing that happened between them: the newest message of the conversation (isChatMessage) they sent, or we
 * sent and they received (reachedCustomer). A note, a call's note, a draft still held or canceled and a send that failed
 * are not it. THE reading of who had the last word: Conversations' row, the Inbox's last word and Today's waiting rows
 * ask it. Today read the thread's last row, and a teammate's note made a waiting customer look answered.
 */
export function lastExchanged<M extends Pick<MessageDto, "type" | "direction" | "status">>(
  messages: readonly M[],
): M | null {
  return (
    [...messages].reverse().find((m) => isChatMessage(m) && (m.direction === "inbound" || reachedCustomer(m.status))) ??
    null
  );
}

const CALL_NOTE_PREFIX =
  /^\[voice call note [^\]]*\]\s*(Caller phoned the (?:salon|business) line\.\s*)?(Summary:\s*)?/; // trade-word: the older notes said "salon"; the newer say "business"

/**
 * A reply the receptionist has WRITTEN but not sent — it is sitting out its veto
 * window, and until that expires a human can withdraw or replace it.
 *
 * The distinction matters most in the UI: rendered as an ordinary agent bubble a
 * held draft looks exactly like a message the customer has already read, so an
 * operator would either ignore it or apologise for something that never went out.
 */
export function isHeldDraft(m: MessageDto): boolean {
  return m.status === "queued" && m.sender === "ai";
}

/** When a held draft is due to send, in epoch ms. */
export function draftSendsAtMs(m: MessageDto): number {
  const delay = typeof m.meta?.delay_ms === "number" ? m.meta.delay_ms : 0;
  return new Date(m.created_at).getTime() + delay;
}

/* What a message says, wherever it is shown: an email's own words, without the chain it quoted back
   (splitQuotedReply). One function, because each place that said it its own way drifted: the bubble split
   the chain, while the Conversations row previewed it and the status band's "They wrote" printed it whole. */
export function messageWords(m: MessageDto): string {
  return m.channel === "email" ? splitQuotedReply(messageText(m)).text : messageText(m);
}

export function messageText(m: MessageDto): string {
  if (m.type === "call_summary" && m.body) {
    // the body already names itself ("Inbound call · 3 min — …"); the legacy
    // Blob-era prefix is stripped for rows written before Slice 3
    return m.body.replace(CALL_NOTE_PREFIX, "").trim();
  }
  if (m.body) return m.body;
  if (m.type === "media") {
    // "Photo: the caption" over "[image attachment]": the thread draws the
    // attachment itself now, and this line is what sits above it.
    const label = MEDIA_LABEL[mediaKind(m.media?.mime_type, (m.meta && (m.meta.raw_type as string)) || null)];
    const caption = m.media?.caption?.trim();
    return caption ? `${label}: ${caption}` : label;
  }
  return `[${m.type}]`;
}

/** Words cut after a whole word, with an ellipsis, when they run past `max`; whole when they fit. */
export function clipAtWord(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,;:—-]+$/u, "")}…`;
}
