/**
 * The world the tests of core-campaigns/ share. Split by behaviour from core-campaigns.test.mjs on 25 Nov 2026 (layer
 * 14: a test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The dashboard's campaign verbs, run: a person's broadcast, the approval,
 * the cancel and the playbook's check, every branch through fakes that log
 * their writes. outbound-routes.test.mjs keeps running the routes, now
 * adapters, through route().
 */
import assert from "node:assert/strict";
import { PEOPLE_LISTS, err, channelsReady, numberHealth, SEND_ONCE_STOP_MS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
export const ZONE = "America/New_York";

export const { createBroadcast } = await importSrc("packages/core/src/campaigns/create-broadcast.ts");

export const { approveRun } = await importSrc("packages/core/src/campaigns/approve.ts");

export const { cancelBroadcast } = await importSrc("packages/core/src/campaigns/cancel.ts");

export const { checkPlaybook } = await importSrc("packages/core/src/campaigns/check-playbook.ts");

export const NOW = new Date("2026-09-06T14:00:00Z");

/** When a send pressed NOW goes: ten minutes on, with a Stop (decision 0064, step 3). */
export const GOES = new Date(NOW.getTime() + SEND_ONCE_STOP_MS);

export const D = 86_400_000;

export const T1 = "77777777-7777-4777-8777-777777777771";

export const S1 = "66666666-6666-4666-8666-666666666661";

export const WRITES = new Set([
  "assemble",
  "holdRecipients",
  "fail",
  "schedule",
  "record",
  "release",
  "hold",
  "approve",
  "withdraw",
  "cancel",
]);

/** A template row as the port answers it (db listMessageVersionRows): WhatsApp's, as Meta holds it. */
export const template = (over = {}) => ({
  id: T1,
  channel: "whatsapp",
  name: "month_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  variables: [],
  hidden_at: null,
  title: null,
  source: "meta",
  components: [],
  body_preview: null,
  rejected_reason: null,
  ...over,
});

/** The ids of an email's and a text's version of the message, which a broadcast may be made on as well as WhatsApp's. */
export const EMAIL_V = "77777777-7777-4777-8777-777777777772";

export const TEXT_V = "77777777-7777-4777-8777-777777777773";

/** One of the message's own versions, written here and approved the moment it was saved. */
export const ownRow = (channel, over = {}) =>
  template({
    id: channel === "email" ? EMAIL_V : TEXT_V,
    channel,
    meta_status: "approved",
    category: null,
    source: "chanlytics",
    ...over,
  });

/**
 * The port's answer for a message (db listMessageVersionRows, by id): the rows of the name and language that id belongs to,
 * and none for an id the workspace does not hold. `whatsapp` is Meta's row as it stands (null: the message has none), `own`
 * the channels, of email and text, that hold a version of it, `ownCategory` the category those rows carry and `ownOver`
 * what else they differ in.
 */
export const messageOf =
  ({ whatsapp = template(), own = [], ownCategory = null, ownOver = {} } = {}) =>
  (id) => {
    const rows = [...(whatsapp ? [whatsapp] : []), ...own.map((c) => ownRow(c, { category: ownCategory, ...ownOver }))];
    const hit = rows.find((r) => r.id === id);
    return hit ? rows.filter((r) => r.name === hit.name && r.language === hit.language) : [];
  };

/** A person as the People page reads them: quiet for 40 days, said yes to both. */
export const person = (id, over = {}) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555123${String(id).padStart(4, "0")}`,
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "in_person",
    marketing: "opted_in",
    marketingSource: "in_person",
    marketingSub: "",
  },
  lastContact: { ts: NOW.getTime() - 40 * D, label: "" },
  // Last heard from forty of the workspace's days ago: Quiet 30+ days reads this (lists.ts).
  heardDays: 40,
  ...over,
});

export const people = [
  person("a"),
  person("b", { state: "active", heardDays: 3 }),
  person("c", { consent: { state: "opted_in", dnc: false, marketing: "unknown" } }),
  person("d", { consent: { state: "unknown", dnc: false, marketing: "unknown" } }),
];

export const noOne = [person("d", { consent: { state: "unknown", dnc: false, marketing: "unknown" } })];

export const GREEN = numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" });

export const ACTIVE_LINE = { sms_state: "active", reg_mock: false };

/**
 * What the workspace can send on, as the channels port answers it (the adapter's, over contracts channelsReady): WhatsApp
 * by its number's health, a text by its line, an email by its mailbox and the deployment's domain. By default WhatsApp
 * alone is ready, as every workspace was before the channels.
 */
export const workspace = ({
  health = GREEN,
  textLine = null,
  mailbox = false,
  domain = false,
  offers = null,
  paused = false,
} = {}) => ({
  ready: channelsReady({
    whatsapp: health ? { canSend: health.canSend, refusal: health.refusal } : null,
    textLine,
    email: { mailbox, domain, ...(offers ? { offers } : {}) },
    paused,
  }),
  health,
});

/** Offers by email can go: the campaigns domain verified, the business's address on file, no pause. */
export const OFFERS_OPEN = { campaigns: true, address: true, paused: null };

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
export function fakes(over = {}) {
  const log = [];
  const answers = {
    // The message the id names, as every row the workspace holds of it (db listMessageVersionRows): Meta's approved row, and no
    // email or text version beside it.
    message: messageOf(),
    bookingLink: "https://book.example/m",
    people,
    // One list, resolved and counted the one way (the adapter's findPoolList): here, a People list over the people these
    // fakes hold, and no list of the workspace's own unless a test gives one.
    list: null,
    // Step 3: the number's health and the workspace's other channels come from one read.
    channels: workspace(),
    // 14:00 UTC is 10:00 in New York: inside the hours a send may go out in.
    timezone: "America/New_York",
    // Whether the workspace is paused (tenants.status): not, unless a test says so.
    paused: false,
    // The run, its people, its job and its decision, whole (00381): the run's id, and the decision's when one was asked for.
    assemble: (_row, _recipients, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    // The month's allowance, counted before anyone is enrolled: the emails and texts this workspace's campaigns have sent
    // this month. None here; a test gives the count, or a refusal to read it.
    monthSent: 0,
    // The hold answers who it skipped (db holdRecipients): everyone it was handed, unless a test says otherwise.
    holdRecipients: (_id, ids) => ({ skipped: ids, error: null }),
    // Who heard from a campaign or a broadcast this week (the week's breath): nobody, unless a test says who
    // (broadcasts/audience/a-send-breathes.test.mjs is about them).
    touches: {},
    fail: undefined,
    schedule: undefined,
    record: "d1",
    release: true,
    hold: true,
    // A run approved whole (00353 approve_broadcast): the decision's id, or null when the run was no longer waiting.
    approve: "d1",
    withdraw: 1,
    cancel: true,
    // 2 Oct 2026: whether a calendar is connected, which win-back a new playbook may be (check-playbook).
    calendarOn: false,
    // What the workspace calls an appointment (contracts appointmentWordOf): "visit" here, so every sentence and name
    // these tests wrote before the word existed reads as it did; a test that is about the word names another.
    appointmentWord: "visit",
    ...over,
  };
  if (answers.list === null) {
    const pool = answers.people;
    answers.list = (ref) => {
      if (ref.kind !== "builtin") return null;
      const l = PEOPLE_LISTS.find((x) => x.id === ref.id);
      return l ? { label: l.label, memberIds: pool.filter(l.test).map((r) => r.id) } : null;
    };
  }
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]), of: (name) => log.filter((l) => l[0] === name) };
}

export async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

/**
 * What a refusal costs the person and the log: the envelope the route answers it with (withRoute sends an AppError's code,
 * message and details as they stand), and the lines the call logged (the logger writes one JSON object to console.error).
 */
export async function refusedLoudly(p) {
  const said = [];
  const error = console.error;
  console.error = (...args) => said.push(JSON.parse(args[0]));
  try {
    const e = await p.then(
      () => assert.fail("it should have been refused"),
      (x) => x,
    );
    return { e, wire: JSON.stringify(err(e.code, e.message, e.details)), said };
  } finally {
    console.error = error;
  }
}

export const everyone = { kind: "everyone" };

export const make = (f, body) => createBroadcast(f.ports, { userId: "u1", body, now: NOW });

/**
 * A person with an email address too, who said yes on WhatsApp and by text, and last wrote on a channel or none: what
 * reachFor picks a channel from (an offer by email waits for its release). They have dealt with the business (a
 * relationship on record, as a customer has), which is what lets an email the business chose to send reach them with no
 * yes covering email: a broadcast's message is ours (decision D1), and these tests' subject is the channels, not that rule.
 */
export const reachable = (id, over = {}) => {
  const p = person(id);
  return {
    ...p,
    email: `p${id}@example.com`,
    lastChannel: null,
    consent: { ...p.consent, channels: ["whatsapp", "sms"], marketingChannels: null, relationship: true },
    ...over,
  };
};

/* ---- The month's allowance, at enrolment ---- */

/** Four people on a visit message who go by email (an address, no number) and three by text (a number, no address). */
export const byEmailAndText = () => [
  ...["e1", "e2", "e3", "e4"].map((id) => reachable(id, { phone: null })),
  ...["t1", "t2", "t3"].map((id) => reachable(id, { email: null, lastChannel: "sms" })),
];

export const MONTH = {
  message: messageOf({ whatsapp: template({ category: "utility" }), own: ["email", "sms"] }),
  channels: workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true, offers: OFFERS_OPEN }),
};

export const ALL_THREE = { template_id: T1, audience: everyone, channels: ["sms", "email"] };

/* ---- A message needs no WhatsApp row (lane 1): the create path reads the message, whichever version is picked ---- */

/** A workspace with no WhatsApp number at all, a mailbox on the campaigns domain, and offers open by email. */
export const EMAIL_ONLY = workspace({ health: null, mailbox: true, domain: true, offers: OFFERS_OPEN });

/** A workspace with a number, a texting line and a mailbox: every channel ready. */
export const EVERY_CHANNEL = workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true, offers: OFFERS_OPEN });

/** A message with an email version and no other, filed utility as only a starter may be. */
export const EMAIL_VISIT = () => messageOf({ whatsapp: null, own: ["email"], ownCategory: "utility" });

/** A message WhatsApp is still reviewing, with an email version beside it. */
export const IN_REVIEW = (own = ["email"]) =>
  messageOf({ whatsapp: template({ meta_status: "pending", category: "utility" }), own });

export const NO_WHATSAPP = "This message has no WhatsApp version.";
