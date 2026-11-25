/**
 * The world the tests of core-broadcast/ share. Split by behaviour from core-broadcast.test.mjs on 25 Nov 2026 (layer
 * 14: a test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The broadcast batch, run: every branch of one batch through fakes that log
 * their calls. Until now this was the one handler no test executed.
 */
import { importSrc } from "../../_source.mjs";

export const { sendBroadcastBatch } = await importSrc("packages/core/src/messages/broadcast/batch.ts");

export const { BROADCAST_STALL_RETRY_MS, BROADCAST_STALLS_MAX } = await importSrc(
  "packages/core/src/messages/broadcast/stops.ts",
);

export const { BROADCAST_CHUNK, BROADCAST_THROTTLE_WAITS_MS, HELD_REASONS, OUTCOME_UNKNOWN, mayMessageFor } =
  await import("@chanlytics/contracts");

export const NOW = Date.parse("2026-09-11T12:00:00Z");

// An email is written before it is sent, and withdrawn when the provider did not take it (step 3): both are writes.
export const WRITES = new Set([
  "fail",
  "startSending",
  "mark",
  "deliver",
  "scheduleNext",
  "finish",
  "alert",
  "sleep",
  "queueEmail",
  "withdrawEmail",
]);

export const broadcast = (over = {}) => ({
  id: "b1",
  state: "scheduled",
  name: "Spring offer",
  template_name: "month_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }],
  recipient_count: 2,
  playbook_id: null,
  audience: null,
  ...over,
});

export const approved = {
  meta_status: "approved",
  body_preview: "Hi {{1}}, a spring offer from {{2}}.",
  category: "marketing",
};

export const contacts = {
  k1: { id: "k1", phone_e164: "+13475550101", erased_at: null, display_name: "Ada Lovelace", wa_profile_name: null },
  k2: { id: "k2", phone_e164: "+13475550102", erased_at: null, display_name: null, wa_profile_name: "Bo" },
};

/** A template row as the message port answers it (db listMessageVersionRows): every column the batch and contracts read, of the name and language asked. */
export const rowOf = (channel, name, language, over = {}) => ({
  id: `${channel}-${name}`,
  channel,
  name,
  language,
  meta_status: "approved",
  category: null,
  variables: [],
  hidden_at: null,
  title: null,
  source: channel === "whatsapp" ? "meta" : "chanlytics",
  components: [],
  body_preview: null,
  rejected_reason: null,
  ...over,
});

/** The message port over the versions a message holds, each channel's facts made a whole row of the message asked for; `asked` records each read. */
export const rowsOf =
  (versions, asked = []) =>
  (name, language) => {
    asked.push([name, language]);
    return Object.entries(versions).map(([channel, v]) => rowOf(channel, name, language, v));
  };

/** Every alert any run in this file raised, for the last test: a notice that names its run opens it. */
export const alertsRaised = [];

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
export function fakes(over = {}) {
  const log = [];
  const answers = {
    broadcast: broadcast(),
    workspacePaused: false,
    sendingStopped: false,
    message: rowsOf({ whatsapp: approved }),
    // UTC, where noon is inside the day's sending hours on any machine the suite runs on.
    facts: { businessName: "Marisa's", bookingLink: "https://book.example/m", timezone: "UTC" },
    // The Google listing's review link is read only where a slot asks for it: a case whose message has no review slot
    // never asks, so this fails any that would.
    reviewLink: new Error("the review link was read for a message with no review slot"),
    batch: [
      { contact_id: "k1", facts: null },
      { contact_id: "k2", facts: null },
    ],
    contacts: (ids) => new Map(ids.filter((id) => contacts[id]).map((id) => [id, contacts[id]])),
    target: (phone) => ({ conversationId: `c-${phone.slice(-2)}` }),
    alreadySent: () => new Map(),
    remaining: 0,
    state: "sending",
    tally: { sent: 2, held: 0 },
    wireUnavailable: null,
    // Offers by email are not closed on this runtime unless a case says why they are (the campaigns domain unverified).
    offersClosed: null,
    // Nor unknown: the campaigns domain was asked about, unless a case says it could not be (offersUnread).
    offersUnread: null,
    now: () => NOW,
    // No jitter unless a case asks for it: a wait reads as the table's own.
    random: () => 0,
    fail: undefined,
    startSending: true,
    // The claim answers whether it took the person (a compare-and-set): true unless a case says another run did.
    mark: true,
    // Nobody on the run goes another way than the channel asked about, unless a case says so: a hold on one channel then
    // holds that channel's people alone (WhatsApp's template not approved; the workspace's offers and news by email).
    byOtherChannels: false,
    // Nobody on the run was skipped for a reason its news names only when counted (contracts HELD_WHEN_COUNTED: the
    // workspace's holds on email, the week's breath, the month's allowance), unless a case says which.
    heldFor: [],
    deliver: (d) => ({ outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" }),
    scheduleNext: undefined,
    finish: undefined,
    alert: undefined,
    sleep: undefined,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    if (name === "now" || name === "random") {
      ports[name] = answer;
      continue;
    }
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (name === "alert") alertsRaised.push(args[0]);
      if (answer instanceof Error) throw answer;
      const value = typeof answer === "function" ? answer(...args) : answer;
      // The batch read keeps `not` as the database does (db listQueuedRecipients): a row with no channel is WhatsApp's.
      const others = name === "batch" && args[2]?.not === "whatsapp";
      return others ? value.filter((r) => (r.channel ?? "whatsapp") !== "whatsapp") : value;
    };
  }
  return {
    ports,
    log,
    ops: () => log.map((l) => l[0]),
    // The calls of one write, by name (step 3: the email rows it writes and withdraws).
    of: (name) => log.filter((l) => l[0] === name),
    marks: () => log.filter((l) => l[0] === "mark").map((l) => [l[2], l[3].state, l[3].reason ?? null]),
  };
}

export const cmd = (over = {}) => ({ tenantId: "t1", broadcastId: "b1", deadline: NOW + 60_000, ...over });

/* ------------------------------------------------ WhatsApp says "not now" -- */

export const WAITS = BROADCAST_THROTTLE_WAITS_MS;

/** The door's answer when Graph refused the send as too many, too fast (channels graphThrottled): nothing was taken. */
export const throttled = (d) => ({
  outcome: "failed",
  reason: "provider",
  status: 400,
  errorBody: '{"error":{"code":130429}}',
  messageId: `m-${d.contactId}`,
  throttled: true,
});

export const facts = (timezone) => ({ businessName: "Marisa's", bookingLink: null, timezone });

export const call = (log, name) => log.find((l) => l[0] === name);

/* --------------------------------------- WhatsApp never reached, and runs that stall (E:0, E:1, 29 Sep) -- */

/** What the door throws when the provider provably did not take the send (core NotTakenError): 0 is no answer at all. */
export const notTaken = (status) => () => {
  throw Object.assign(new Error(`deliver: the whatsapp provider did not take it (${status || "no answer"})`), {
    name: "NotTakenError",
    status,
  });
};

/** A run on its way, at the moment the last of the day's sending hours has just ended (20:59 is the last minute). */
export const AFTER_NINE = Date.parse("2026-09-11T21:05:00Z");

export const BEFORE_NINE = Date.parse("2026-09-11T20:58:00Z");

/* ------------------------- One message, every channel (step 3): a batch goes by each person's channel -- */

/**
 * What a visit's run says of itself when it stops (contracts playbookRunNext): the runs below are a visit reminder's, a
 * playbook's, which nobody sends again. Each said "send it again" after its cause.
 */
export const VISIT_RUN_NEXT =
  "It does not run again today, and a reminder belongs to its day, so the people it did not reach will not be sent it later.";

/** A message about their visit: Meta's row, and the text and email versions beside it, each filling the same slots. */
export const VISIT_WORDS = "Hi {{1}}, your visit is {{2}}.";

export const visitRows = {
  whatsapp: { meta_status: "approved", body_preview: VISIT_WORDS, category: "utility" },
  sms: {
    meta_status: "approved",
    body_preview: VISIT_WORDS,
    category: "utility",
    components: [{ type: "BODY", text: VISIT_WORDS }],
  },
  email: {
    meta_status: "approved",
    body_preview: VISIT_WORDS,
    category: "utility",
    components: [
      { type: "HEADER", format: "TEXT", text: "Your visit, {{1}}" },
      { type: "BODY", text: VISIT_WORDS },
    ],
  },
};

/** The message port over its versions by channel, remembering each read it was asked for: a batch reads the message once. */
export const versionsOf = (asked = [], rows = visitRows) => rowsOf(rows, asked);

export const reachable = {
  k1: {
    id: "k1",
    phone_e164: "+13475550101",
    email: "ada@example.com",
    erased_at: null,
    display_name: "Ada Lovelace",
    wa_profile_name: null,
  },
  k2: { id: "k2", phone_e164: "+13475550102", email: null, erased_at: null, display_name: null, wa_profile_name: "Bo" },
  k3: {
    id: "k3",
    phone_e164: null,
    email: "cy@example.com",
    erased_at: null,
    display_name: "Cy Twombly",
    wa_profile_name: null,
  },
};

export const VISIT = { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" };

export const reminder = (over = {}) =>
  broadcast({
    name: "Visit reminder · 2026-09-11",
    template_name: "visit_reminder",
    params: [{ kind: "first_name" }, { kind: "visit_when" }],
    playbook_id: "p1",
    // A playbook run's audience as run-playbook writes it: the playbook, its moment, its name.
    audience: { kind: "playbook", id: "p1", label: "Visit reminder", trigger: "visit_tomorrow" },
    ...over,
  });

export const on = (channel, contact_id = "k1", facts = VISIT) => ({ contact_id, facts, channel });

export const visitFacts = {
  businessName: "Marisa's",
  bookingLink: null,
  timezone: "UTC",
  address: "12 Main St, Springfield",
};

/** The request the adapter freezes, as these fakes build it from what core hands the port. */
export const frozen = (i) => ({
  from: '"Marisa\'s" <marisa@mail.example.com>',
  to: [i.to],
  reply_to: ["r+tok@mail.example.com"],
  subject: i.subject,
  text: `${i.body}\n\n${i.footer}`,
  html: `<p>${i.body}</p>`,
  headers: {},
  tags: [{ name: "cl_message", value: i.messageId }],
  idempotency_key: i.messageId,
});

export const world = (over = {}) => {
  const asked = [];
  return {
    asked,
    f: fakes({
      broadcast: reminder(),
      message: versionsOf(asked),
      facts: visitFacts,
      contacts: (ids) => new Map(ids.filter((id) => reachable[id]).map((id) => [id, reachable[id]])),
      targetOfContact: (id) => ({ conversationId: `cv-${id}` }),
      emailRequest: frozen,
      // The link the adapter seals for this person and this email (an offer's foot and headers carry it).
      unsubscribeUrl: ({ messageId, contactId }) => `https://app.example.com/u/${contactId}-${messageId}`,
      queueEmail: { status: "queued" },
      withdrawEmail: undefined,
      monthSent: 0,
      ...over,
    }),
  };
};

export const sendsOf = (f) => f.log.filter((l) => l[0] === "deliver").map((l) => l[1]);

/* ---------- The review of the send pipeline (3 Oct): the mail provider's limit, WhatsApp's template, the queued row, the claim -- */

/** The door's answer when the mail provider's day or month is used up (channels resendLimitOf). */
export const quota = (limit) => (d) => ({
  outcome: "failed",
  reason: "provider",
  status: 429,
  errorBody: JSON.stringify({ name: `${limit}_quota_exceeded` }),
  messageId: `m-${d.contactId}`,
  limit,
});

/* ---------- The review of 4 Oct: offers by email with no verified campaigns domain; a released person's new id -- */

/** Meta's row and the email version of a message that is an OFFER: marketing, so it needs the campaigns domain. */
export const offerRows = {
  whatsapp: { ...visitRows.whatsapp, category: "marketing" },
  email: { ...visitRows.email, category: "marketing" },
};

/* ------------- Decision D4: the day-before reminder given back for a live hold; workspace-wide refusals stop the run -- */

/** The door answering that somebody holds the thread: for a day-before reminder, which passes the 24-hour pause, only a live hold can. */
export const heldBy = (reason) => (d) => ({ outcome: "refused", reason, messageId: d.messageId ?? null });

/** A playbook run's audience for a moment, as run-playbook writes it. */
export const forMoment = (trigger) =>
  broadcast({ playbook_id: "p1", audience: { kind: "playbook", id: "p1", label: "A moment", trigger } });

export const { BROADCAST_HOLD_WAIT_MS } = await import("@chanlytics/contracts");

/* ---------- Decision D2: the business's own news by email is an offer at the batch's head and in its foot -- */

export const NEWS_WORDS = "Hi {{1}}, a note from the business.";

export const newsRows = {
  whatsapp: { meta_status: "approved", body_preview: NEWS_WORDS, category: "utility" },
  email: {
    meta_status: "approved",
    body_preview: NEWS_WORDS,
    category: "utility",
    components: [
      { type: "HEADER", format: "TEXT", text: "A note, {{1}}" },
      { type: "BODY", text: NEWS_WORDS },
    ],
  },
};

/** A broadcast of news: a utility message, no moment, one slot. */
export const news = (over = {}) => {
  const made = [];
  const w = world({
    broadcast: broadcast({
      template_name: "a_note",
      params: [{ kind: "first_name" }],
      playbook_id: null,
      audience: null,
    }),
    message: versionsOf([], newsRows),
    emailRequest: (i) => (made.push(i), frozen(i)),
    ...over,
  });
  return { ...w, made };
};
