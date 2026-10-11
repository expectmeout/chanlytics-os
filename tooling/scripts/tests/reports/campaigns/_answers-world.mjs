/**
 * The world campaign-answers.db.test.mjs reads: the database client, the workspaces and people a test makes (and removes),
 * and one workspace of thirty-five people on two runs whose answers are spelled out beside what they said (`buildWorld`),
 * with the instants of the days it is read over. Every instant of the big world is a whole millisecond, so the SQL's
 * `date_trunc('milliseconds', ...)` and the TypeScript rule's `Date.parse` read the same instant; a test that wants
 * a finer one writes its own (`stamp`).
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

export const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const ANON = process.env.SUPABASE_ANON_KEY;
export const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;
export const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
export const skipMembers =
  skip || (ANON ? false : "no SUPABASE_ANON_KEY in env: the members this test signs in as need it");

export const tenants = [];
export const users = [];
export const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

export const SECOND = 1_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const REPLY_WINDOW = 72 * HOUR;
export const iso = (ms) => new Date(ms).toISOString();
export const ymd = (ms) => iso(ms).slice(0, 10);
/** `hour:min` UTC on the day `n` days before today's UTC date, as milliseconds. */
export const dayAt = (n, hour, min = 0) => {
  const t = new Date();
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - n, hour, min);
};

/** Run A went out at nine, ten days ago; run B a day after it. */
export const A = dayAt(10, 9);
const B = A + DAY;
const SENT = { RA: A, RB: B };
/** campaign_series(t, 7) reads these 14 days: from this midnight to tomorrow's, the current period from CURRENT. */
export const SINCE = dayAt(13, 0);
export const UNTIL = dayAt(-1, 0);
export const CURRENT = dayAt(6, 0);

/** Every workspace and member a test made, removed: events keep no foreign key to their workspace, so by hand. */
export async function cleanup() {
  if (skip) return;
  for (const id of tenants) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
}

let seq = 0;
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A workspace, in UTC unless a zone is named; its days are its zone's. */
export async function workspace(slug, timezone = "UTC") {
  const tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${RUN}-${(seq += 1)}`, name: "Harbor Answers", timezone })
      .select("id")
      .single(),
  ).id;
  tenants.push(tenantId);
  return { tenantId };
}

/** The calendar day `n` days from a "YYYY-MM-DD". */
export const dayFrom = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The wall clock of an instant in `timeZone`, as the milliseconds the same reading would be in UTC. */
const wallClock = (date, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
};

/** The instant (milliseconds) at which `timeZone`'s clock reads `hour:min` on `day` ("YYYY-MM-DD"). */
export const localAt = (day, hour, min, timeZone) => {
  const reading = Date.parse(`${day}T00:00:00Z`) + (hour * 60 + min) * 60_000;
  let at = reading;
  for (let i = 0; i < 3; i += 1) at = reading - (wallClock(new Date(at), timeZone) - at);
  return at;
};

/** An instant to the microsecond, as the database writes one: `ms` whole milliseconds and `micros` of the next. */
export const stamp = (ms, micros) => `${iso(ms).slice(0, 23)}${String(micros).padStart(3, "0")}Z`;

/** A signed-in member of a workspace: the functions run on the caller's rights, so who calls decides what they read. */
export async function member(w) {
  const email = `answers-${RUN}-${users.length}@example.com`;
  const password = `pw-${RUN}-${users.length}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: w.tenantId, user_id: made.data.user.id, role: "viewer" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), "the sign-in");
  return client;
}

export const insert = async (table, rows) => ok(await db.from(table).insert(rows), `${table} written`);

export async function template(w) {
  return ok(
    await db
      .from("templates")
      .insert({
        tenant_id: w.tenantId,
        channel: "whatsapp",
        name: "answers_offer",
        language: "en_US",
        meta_status: "approved",
      })
      .select("id")
      .single(),
  ).id;
}

/** A moment's playbook, for the run that came from one. */
export async function moment(w, tpl) {
  return ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: w.tenantId,
        name: "Win-back",
        trigger: "quiet_30",
        template_id: tpl,
        template_name: "answers_offer",
        template_language: "en_US",
        params: [],
        policy_class: "reengage",
        state: "running",
      })
      .select("id")
      .single(),
  ).id;
}

/** A run that went out at `at`; one of a playbook's when `playbook` is given. */
export async function broadcast(w, tpl, { name, at, playbook = null }) {
  return ok(
    await db
      .from("broadcasts")
      .insert({
        tenant_id: w.tenantId,
        name,
        template_id: tpl,
        template_name: "answers_offer",
        template_language: "en_US",
        scheduled_for: iso(at),
        state: "sent",
        playbook_id: playbook,
        run_for: playbook ? ymd(at) : null,
      })
      .select("id")
      .single(),
  ).id;
}

export const contactRow = (w, id, over = {}) => ({
  id,
  tenant_id: w.tenantId,
  phone_e164: `+1555016${String((seq += 1)).padStart(4, "0")}`,
  display_name: "Harbor Guest",
  erased_at: null,
  ...over,
});
export const conversationRow = (w, id, contact, at) => ({
  id,
  tenant_id: w.tenantId,
  contact_id: contact,
  state: "open",
  last_message_at: iso(at),
});
/** What a campaign sent, or an email the Inbox sent: an outbound message of the person's thread. */
export const messageRow = (w, id, { conversation, contact, channel, at, externalId = null, source = "broadcast" }) => ({
  id,
  tenant_id: w.tenantId,
  conversation_id: conversation,
  contact_id: contact,
  channel,
  direction: "outbound",
  sender: "human",
  type: source === "broadcast" ? "template" : "text",
  body: "an offer",
  status: "sent",
  external_id: externalId,
  meta: source === "broadcast" ? { source: "broadcast" } : {},
  created_at: iso(at),
});
export const recipientRow = (w, { run, contact, message, state = "sent", at, channel }) => ({
  tenant_id: w.tenantId,
  broadcast_id: run,
  contact_id: contact,
  message_id: message,
  state,
  sent_at: iso(at),
  channel,
});
export const consentRow = (w, contact, at, data, id = crypto.randomUUID()) => ({
  id,
  tenant_id: w.tenantId,
  kind: "contact.consent_changed",
  category: "contact",
  subject_type: "contact",
  subject_id: contact,
  data,
  created_at: iso(at),
});

/** One person reached by one campaign, with their thread, the message and the run's record of it. */
export async function sentTo(w, run, at, channel = "whatsapp") {
  const [contact, conversation, message] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await insert("contacts", contactRow(w, contact));
  await insert("conversations", conversationRow(w, conversation, contact, at));
  await insert("messages", messageRow(w, message, { conversation, contact, channel, at }));
  await insert("broadcast_recipients", recipientRow(w, { run, contact, message, at, channel }));
  return { contact, conversation, message };
}

/** The same person reached by another run: a message in their thread and the run's record of it. */
export async function sentAgain(w, run, person, at, channel = "whatsapp") {
  const { contact, conversation } = person;
  const message = crypto.randomUUID();
  await insert("messages", messageRow(w, message, { conversation, contact, channel, at }));
  await insert("broadcast_recipients", recipientRow(w, { run, contact, message, at, channel }));
  return { contact, conversation, message };
}

export const ANSWER = { IN: "opted_in", OUT: "opted_out" };
export const CONVERSATIONAL = "conversational";
export const OFFERS = "marketing";
export const EMAIL_OFFERS = "email_marketing";

/** A memo by key: the same person and run name the same message, provider id or contact every time. */
const memo = (make) => {
  const seen = new Map();
  return (...key) => {
    const k = key.join("|");
    if (!seen.has(k)) seen.set(k, make(...key));
    return seen.get(k);
  };
};

/**
 * The world's thirty-five people: where each was reached (`sends`: run, then the way and, where it is not `sent`, the
 * state), what they said (`says`: a label, the instant, `data` as the ledger keeps it, and an id's last twelve digits
 * where two events of one person must tie), and the answers the rule gives (`answers`: run, event, consent, purpose,
 * whether a key found it), spelled out. P1 to P14 are the brief's; the rest are the edges the rule names.
 */
function peopleOf({ messageOf, wireOf, inboxOf }) {
  const own = { source: "customer_message" };
  const yes = (extra = {}) => ({ consent: "opted_in", ...extra });
  const stop = (extra = {}) => ({ consent: "opted_out", ...extra });
  const unsubscribe = (message_id, source = "unsubscribe") => stop({ purpose: EMAIL_OFFERS, source, message_id });
  const wa = { channel: "whatsapp" };
  const old = { channel: null }; // a row from before channels went by WhatsApp
  const text = { channel: "sms" };
  const mail = { channel: "email" };
  const [IN, OUT] = [ANSWER.IN, ANSWER.OUT];
  return {
    P1: {
      sends: { RA: old },
      says: [["yes", A + HOUR, yes(own)]],
      answers: [["RA", "yes", IN, CONVERSATIONAL, false]],
    },
    P2: { sends: { RA: wa }, says: [["late", A + REPLY_WINDOW + SECOND, yes(own)]], answers: [] },
    P3: {
      sends: { RA: wa },
      says: [["edge", A + REPLY_WINDOW, yes(own)]],
      answers: [["RA", "edge", IN, CONVERSATIONAL, false]],
    },
    P4: {
      sends: { RA: mail },
      says: [["unsub", A + 10 * DAY, unsubscribe(messageOf("P4", "RA"))]],
      answers: [["RA", "unsub", OUT, EMAIL_OFFERS, true]],
    },
    P5: {
      sends: { RA: text },
      says: [["reply", A + 2 * HOUR, stop({ purpose: EMAIL_OFFERS, source: "reply" })]],
      answers: [],
    },
    P6: {
      sends: { RA: text },
      says: [
        ["carrier", A + 5 * DAY, stop({ purpose: OFFERS, source: "carrier", message_external_id: wireOf("P6", "RA") })],
      ],
      answers: [["RA", "carrier", OUT, OFFERS, true]],
    },
    P7: { sends: { RA: wa }, says: [["merge", A + HOUR, yes({ source: "merge" })]], answers: [] },
    P8: {
      sends: { RA: wa },
      says: [
        ["stop", A + HOUR, { consent: "unknown", source: "stop" }],
        ["reset", A + 2 * HOUR, { consent: "unknown" }],
        ["shout", A + 3 * HOUR, { consent: "OPTED_IN" }],
        ["word", A + 4 * HOUR, "opted_in"],
        ["list", A + 5 * HOUR, ["opted_in"]],
      ],
      answers: [],
    },
    P9: { erased: true, sends: { RA: wa }, says: [["yes", A + HOUR, yes(own)]], answers: [] },
    P10: { sends: { RA: wa }, says: [["desk", A + 10 * DAY, yes({ source: "in_person" })]], answers: [] },
    P11: {
      sends: { RA: wa },
      says: [
        ["yes", A + HOUR, yes(own)],
        ["stop", A + 5 * HOUR, stop(own)],
      ],
      answers: [["RA", "stop", OUT, CONVERSATIONAL, false]],
    },
    P12: {
      sends: { RA: wa, RB: wa },
      says: [["yes", A + 30 * HOUR, yes(own)]],
      answers: [
        ["RA", "yes", IN, CONVERSATIONAL, false],
        ["RB", "yes", IN, CONVERSATIONAL, false],
      ],
    },
    P13: {
      sends: { RA: mail },
      inbox: true,
      says: [["unsub", A + 2 * HOUR, unsubscribe(inboxOf("P13"))]],
      answers: [],
    },
    P14: {
      sends: { RB: mail },
      says: [["yes", B + 2 * HOUR, yes({ purpose: EMAIL_OFFERS, source: "form" })]],
      answers: [["RB", "yes", IN, EMAIL_OFFERS, false]],
    },
    // A number is no key: the carrier's stop goes by its time.
    P15: {
      sends: { RA: wa },
      says: [["carrier", A + 2 * HOUR, stop({ source: "carrier", message_external_id: 42 })]],
      answers: [["RA", "carrier", OUT, CONVERSATIONAL, false]],
    },
    // Either consent is exact by a carrier's or WhatsApp's key.
    P16: {
      sends: { RA: wa },
      says: [["yes", A + 6 * DAY, yes({ source: "whatsapp", message_external_id: wireOf("P16", "RA") })]],
      answers: [["RA", "yes", IN, CONVERSATIONAL, true]],
    },
    // A key that is not a uuid, in capitals, or someone else's, finds no send of the person: no run, and not their time.
    P17: { sends: { RA: mail }, says: [["unsub", A + 2 * HOUR, unsubscribe("not-a-uuid")]], answers: [] },
    P18: {
      sends: { RA: mail },
      says: [["unsub", A + 2 * HOUR, unsubscribe(messageOf("P18", "RA").toUpperCase(), "complaint")]],
      answers: [],
    },
    // '' and a number are no key either: the unsubscribe goes by its time, to the run that reached them by email.
    P19: {
      sends: { RA: mail },
      says: [["unsub", A + 2 * HOUR, unsubscribe("")]],
      answers: [["RA", "unsub", OUT, EMAIL_OFFERS, false]],
    },
    P20: {
      sends: { RA: mail },
      says: [["unsub", A + 2 * HOUR, unsubscribe(42)]],
      answers: [["RA", "unsub", OUT, EMAIL_OFFERS, false]],
    },
    // At the send is not after it, and before it is no answer to it.
    P21: {
      sends: { RA: wa },
      says: [
        ["at", A, yes(own)],
        ["before", A - HOUR, yes(own)],
      ],
      answers: [],
    },
    P22: { merged: true, sends: { RA: wa }, says: [["yes", A + HOUR, yes(own)]], answers: [] },
    // A run's record that is not a send is no send: a failed and a skipped person have no answer to give it.
    P23: {
      sends: { RA: { channel: "whatsapp", state: "failed" }, RB: { channel: "whatsapp", state: "skipped" } },
      says: [["yes", A + HOUR, yes(own)]],
      answers: [],
    },
    // A yes by the clock, then the email's own unsubscribe nine days later: the key outranks the clock, the later stands.
    P24: {
      sends: { RA: mail },
      says: [
        ["yes", A + 2 * HOUR, yes({ purpose: EMAIL_OFFERS, source: "form" })],
        ["unsub", A + 9 * DAY, unsubscribe(messageOf("P24", "RA"))],
      ],
      answers: [["RA", "unsub", OUT, EMAIL_OFFERS, true]],
    },
    // On two runs: the stop at 26 hours is both runs' by the clock, and the unsubscribe names run A's email alone.
    P25: {
      sends: { RA: mail, RB: wa },
      says: [
        ["stop", B + 2 * HOUR, stop(own)],
        ["unsub", A + 10 * DAY, unsubscribe(messageOf("P25", "RA"))],
      ],
      answers: [
        ["RA", "unsub", OUT, EMAIL_OFFERS, true],
        ["RB", "stop", OUT, CONVERSATIONAL, false],
      ],
    },
    // Two yeses on two runs: run A's window ends before the second, run B's holds both.
    P26: {
      sends: { RA: wa, RB: wa },
      says: [
        ["first", A + 30 * HOUR, yes(own)],
        ["second", A + 80 * HOUR, yes(own)],
      ],
      answers: [
        ["RA", "first", IN, CONVERSATIONAL, false],
        ["RB", "second", IN, CONVERSATIONAL, false],
      ],
    },
    // The same instant twice: the greater id stands, whichever consent it carries.
    P27: {
      sends: { RA: wa },
      says: [
        ["lo", A + 4 * HOUR, yes(own), "00000000000a"],
        ["hi", A + 4 * HOUR, stop(own), "00000000000b"],
      ],
      answers: [["RA", "hi", OUT, CONVERSATIONAL, false]],
    },
    P28: {
      sends: { RA: wa },
      says: [
        ["hi", A + 4 * HOUR, yes(own), "00000000000b"],
        ["lo", A + 4 * HOUR, stop(own), "00000000000a"],
      ],
      answers: [["RA", "hi", IN, CONVERSATIONAL, false]],
    },
    // A purpose this world has no word for is the conversational one; an event naming no source counts.
    P29: {
      sends: { RA: wa },
      says: [["odd", A + HOUR, yes({ source: "customer_message", purpose: "reminders" })]],
      answers: [["RA", "odd", IN, CONVERSATIONAL, false]],
    },
    P30: { sends: { RA: wa }, says: [["bare", A + HOUR, yes()]], answers: [["RA", "bare", IN, CONVERSATIONAL, false]] },
    // A provider's id of someone else's send, and in the wrong case, finds no send of the person.
    P31: { sends: { RA: wa }, says: [], answers: [] },
    P32: {
      sends: { RA: wa },
      says: [["other", A + 2 * HOUR, stop({ source: "whatsapp", message_external_id: wireOf("P31", "RA") })]],
      answers: [],
    },
    P33: {
      sends: { RA: wa },
      says: [
        ["case", A + 2 * HOUR, stop({ source: "carrier", message_external_id: wireOf("P33", "RA").toLowerCase() })],
      ],
      answers: [],
    },
    // Offers by the clock, and a STOP on WhatsApp that carries no id.
    P34: {
      sends: { RA: wa },
      says: [["offer", A + 3 * HOUR, stop({ purpose: OFFERS, source: "customer_message" })]],
      answers: [["RA", "offer", OUT, OFFERS, false]],
    },
    P35: {
      sends: { RA: wa },
      says: [["word", A + HOUR, stop({ source: "whatsapp" })]],
      answers: [["RA", "word", OUT, CONVERSATIONAL, false]],
    },
  };
}

/** The world: its workspace, two runs, thirty-five people, and the names that make a failure readable. */
export async function buildWorld() {
  const w = await workspace("campaign-answers");
  const tpl = await template(w);
  const runs = {
    RA: await broadcast(w, tpl, { name: "Win-back", at: A, playbook: await moment(w, tpl) }),
    RB: await broadcast(w, tpl, { name: "Open week", at: B }),
  };
  const contactOf = memo(() => crypto.randomUUID());
  const messageOf = memo(() => crypto.randomUUID());
  const inboxOf = memo(() => crypto.randomUUID());
  const wireOf = memo((person, run) => `SM-${person}-${run}`);
  const spec = peopleOf({ messageOf, wireOf, inboxOf });

  const names = { person: new Map(), run: new Map(), event: new Map(), at: new Map() };
  for (const [run, id] of Object.entries(runs)) names.run.set(id, run);
  const rows = { contacts: [], conversations: [], messages: [], recipients: [], events: [] };
  const expected = [];
  for (const [person, p] of Object.entries(spec)) {
    const contact = contactOf(person);
    const conversation = crypto.randomUUID();
    names.person.set(contact, person);
    rows.contacts.push(contactRow(w, contact, { erased_at: p.erased ? iso(Date.now()) : null }));
    rows.conversations.push(conversationRow(w, conversation, contact, A));
    for (const [run, send] of Object.entries(p.sends)) {
      const { channel, state = "sent" } = send;
      const message = state === "sent" ? messageOf(person, run) : null;
      if (message) {
        rows.messages.push(
          messageRow(w, message, {
            conversation,
            contact,
            channel: channel ?? "whatsapp",
            at: SENT[run],
            externalId: wireOf(person, run),
          }),
        );
      }
      rows.recipients.push(recipientRow(w, { run: runs[run], contact, message, state, at: SENT[run], channel }));
    }
    if (p.inbox) {
      // An email the Inbox sent them, which no run's record names.
      rows.messages.push(
        messageRow(w, inboxOf(person), { conversation, contact, channel: "email", at: A - DAY, source: "inbox" }),
      );
    }
    const base = crypto.randomUUID().slice(0, 24);
    const eventId = {};
    for (const [label, at, data, tail] of p.says) {
      const id = tail ? base + tail : crypto.randomUUID();
      eventId[label] = id;
      names.event.set(id, `${person}.${label}`);
      names.at.set(id, at);
      rows.events.push(consentRow(w, contact, at, data, id));
    }
    for (const [run, label, consent, purpose, exact] of p.answers) {
      expected.push({
        person,
        consent,
        at: names.at.get(eventId[label]),
        key: [run, person, `${person}.${label}`, consent, purpose, exact].join("|"),
      });
    }
  }
  await insert("contacts", rows.contacts);
  // A merged-away record is marked, and nothing moves its rows (the merge door would): only liveness keeps it out.
  for (const person of Object.keys(spec)) {
    if (spec[person].merged) {
      ok(
        await db
          .from("contacts")
          .update({ merged_into_contact_id: contactOf("P1") })
          .eq("id", contactOf(person)),
      );
    }
  }
  await insert("conversations", rows.conversations);
  await insert("messages", rows.messages);
  await insert("broadcast_recipients", rows.recipients);
  await insert("events", rows.events);

  const key = (run, contact, event, consent, purpose, exact) =>
    [names.run.get(run), names.person.get(contact), names.event.get(event), consent, purpose, exact].join("|");
  return { w, runs, expected, names, key, spec };
}

/** The world's sends and events as the rule reads them, from the tables. */
export async function readWorld(w) {
  const recipients = ok(
    await db
      .from("broadcast_recipients")
      .select("broadcast_id, contact_id, sent_at, channel, message_id")
      .eq("tenant_id", w.tenantId)
      .eq("state", "sent"),
  );
  const messages = ok(await db.from("messages").select("id, external_id").eq("tenant_id", w.tenantId));
  const contacts = ok(
    await db.from("contacts").select("id, erased_at, merged_into_contact_id").eq("tenant_id", w.tenantId),
  );
  const events = ok(
    await db
      .from("events")
      .select("id, subject_id, created_at, data")
      .eq("tenant_id", w.tenantId)
      .eq("kind", "contact.consent_changed"),
  );
  const externalOf = new Map(messages.map((m) => [m.id, m.external_id]));
  const liveOf = new Map(contacts.map((c) => [c.id, c.erased_at === null && c.merged_into_contact_id === null]));
  const sends = recipients.map((r) => ({
    runId: r.broadcast_id,
    contactId: r.contact_id,
    sentAt: r.sent_at,
    byEmail: r.channel === "email",
    live: liveOf.get(r.contact_id) === true,
    messageId: r.message_id,
    messageExternalId: (r.message_id && externalOf.get(r.message_id)) || null,
  }));
  return {
    sends,
    events: events.map((e) => ({ id: e.id, contactId: e.subject_id, at: e.created_at, data: e.data })),
  };
}

export const answersOf = async (w, since, until, client = db) =>
  ok(await client.rpc("campaign_answers", { p_tenant_id: w.tenantId, p_since: iso(since), p_until: iso(until) }));
export const seriesOf = async (w, days = 7, end = null) =>
  ok(await db.rpc("campaign_series", { p_tenant_id: w.tenantId, p_days: days, p_end: end }));
export const total = (series, field) => series.reduce((sum, d) => sum + d[field], 0);

/** The distinct (person, answer, period) pairs of the world's expected answers, each at its earliest instant. */
export function pairsOf(world) {
  const first = new Map();
  for (const x of world.expected) {
    const pair = `${x.person}|${x.consent}|${x.at >= CURRENT ? "now" : "before"}`;
    first.set(pair, Math.min(first.get(pair) ?? Infinity, x.at));
  }
  return first;
}
