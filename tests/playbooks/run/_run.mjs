/**
 * The world the tests of run/ share. Split by behaviour from core-run-playbook.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * A playbook's run, run: every branch through fakes that log their calls.
 * Until now the edge's runner was executed by no test; playbooks.test.mjs
 * pinned its text.
 */
import { channelsReady, numberHealth, toPersonRowVM } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

export const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");

export const NOW = new Date("2026-09-06T14:00:00Z");
// 10:00 in New York
export const TZ = "America/New_York";

export const D = 86_400_000;

export const WRITES = new Set(["record", "assemble", "holdRecipients", "notify"]);

/** A person as the People page reads them: quiet for 40 days, said yes to both. */
export const person = (id, over = {}) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555123000${id}`,
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
  ...over,
  // They wrote last when they were last in touch: Quiet 30+ days reads the days since (lists.ts).
  heardDays: over.heardDays ?? Math.round((NOW.getTime() - (over.lastContact?.ts ?? NOW.getTime() - 40 * D)) / D),
});

/** A person as people_list answers, with a calendar: the visit run reads their visits. */
export const iso = (msAgo) => new Date(NOW.getTime() - msAgo).toISOString();

export function dto(id, over = {}) {
  return {
    id,
    display_name: `Person ${id}`,
    wa_profile_name: null,
    phone_e164: `+1305555000${id}`,
    consent: "opted_in",
    consent_source: "keyword",
    consent_updated_at: iso(30 * D),
    dnc: false,
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    marketing_consent_updated_at: iso(30 * D),
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: `cv-${id}`,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: iso(3 * D),
    last_message_at: iso(3 * D),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "hi",
    last_inbound_at: iso(3 * D),
    last_call_at: null,
    last_inbound_call_at: null,
    last_inbound_call_summary: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: iso(60 * D),
    earliest_row_at: iso(60 * D),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    effective_reply_mode: "auto",
    visits: null,
    ...over,
  };
}

export const visit = (startIso, title) => ({
  id: `v-${startIso}`,
  start: startIso,
  end: new Date(Date.parse(startIso) + 3_600_000).toISOString(),
  title,
  all_day: false,
  via: "phone",
});

export const playbook = (over = {}) => ({
  id: "p1",
  tenant_id: "t1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  policy_class: "reengage",
  // Its sequence sends on its own and its words were seen going (decision 0064): what the run plans by.
  mode: "auto",
  words_ok_at: "2026-09-01T10:00:00.000Z",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: null,
  ...over,
});

/**
 * What the workspace can send on now, as the run reads it (contracts channelsReady): WhatsApp by its number, and by default
 * nothing else set up, as every workspace was before the channels.
 */
export const ready = ({ textLine = null, mailbox = false, domain = false } = {}) =>
  channelsReady({ whatsapp: { canSend: true, refusal: null }, textLine, email: { mailbox, domain } });

export const context = (over = {}) => ({
  tz: TZ,
  now: NOW,
  people: [person("a"), person("b", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } })],
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  ready: ready(),
  touches: { byThis: new Map(), byAny: new Map() },
  calendar: "none",
  visits: new Map(),
  ...over,
});

export const cmd = (over = {}) => ({
  playbook: playbook(),
  ctx: context(),
  runFor: "2026-09-06",
  by: { kind: "system" },
  ...over,
});

/** A run's reach with nobody named and nobody left out: every count a run keeps, at zero. */
export const NOBODY_LEFT = {
  pool: 0,
  will: 0,
  noNumber: 0,
  stopped: 0,
  noYes: 0,
  heardThis: 0,
  heardAny: 0,
  overCap: 0,
  overLimit: 0,
  // Step 3: who it could not reach for want of an address, an address mail no longer goes to, or a channel, and who it reaches on each.
  no_address: 0,
  address_stopped: 0,
  no_channel: 0,
  by_channel: { whatsapp: 0, sms: 0, email: 0 },
};

/** Who a run reaches on each channel, WhatsApp alone: every run before the channels. */
export const onWhatsApp = (n) => ({ whatsapp: n, sms: 0, email: 0 });

/** A template row as the port answers it (db listMessageVersionRows): one version of a message, on its channel. */
export const versionRow = (channel, over = {}) => ({
  id: `tpl-${channel}`,
  channel,
  name: "winback_offer",
  language: "en_US",
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

/**
 * The port's answer for a message: the rows the workspace holds of the name and language it is asked for. `whatsapp` is
 * Meta's row as it stands (null: the message has none), `own` the channels, of email and text, that hold a version of it,
 * and `ownCategory` the category those rows carry (the one a message with no WhatsApp row is read by).
 */
export const messageOf =
  ({ whatsapp = { meta_status: "approved" }, own = [], ownCategory = null } = {}) =>
  (name, language) => [
    ...(whatsapp ? [versionRow("whatsapp", { name, language, ...whatsapp })] : []),
    ...own.map((channel) => versionRow(channel, { name, language, category: ownCategory })),
  ];

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
export function fakes(over = {}) {
  const log = [];
  const answers = {
    // The message's rows (db listMessageVersionRows): Meta's approved row, and no email or text version of it.
    message: messageOf(),
    alreadyRan: false,
    record: undefined,
    // The run, its people, its job and its decision, whole (00381): the run's id, and the decision's when one was asked for.
    assemble: (_row, _recipients, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    // The month's allowance, counted before anyone is enrolled: what this workspace's campaigns have sent by email and by
    // text this month (none here), and the write that holds those past it the moment the run exists.
    monthSent: 0,
    // The hold answers who it skipped (db holdRecipients): everyone it was handed, unless a test says otherwise.
    holdRecipients: (_id, ids) => ({ skipped: ids, error: null }),
    notify: undefined,
    ...over,
  };
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

/* ---- One message, every channel (step 3): a run goes by the channels its playbook ticks ---- */

/** A message about their visit, as Meta files it: a utility, which only the yes to messages is needed for. */
export const UTILITY = { meta_status: "approved", category: "utility" };

export const TEXT_LINE = { sms_state: "active", reg_mock: false };

/** A visit reminder, ticking all three channels: a message about their visit, which text and email carry. */
export const reminder = (over = {}) =>
  playbook({
    trigger: "visit_tomorrow",
    policy_class: "booking",
    template_name: "visit_reminder",
    params: [{ kind: "first_name" }],
    channels: ["whatsapp", "sms", "email"],
    ...over,
  });

export const NEXT_VISIT = visit("2026-09-07T18:00:00Z", "Balayage");
// tomorrow, 2:00 PM in New York
export const LAST_VISIT = { ...visit("2026-09-05T18:00:00Z", "Balayage"), said: "kept" };
// yesterday, 2:00 PM, kept
/** People with a visit tomorrow, as people_list reads them: what they can be reached by, said yes to, last wrote on. */
export function visitors(specs, when = { next: NEXT_VISIT, last: null }) {
  const visits = new Map(specs.map(([id]) => [id, { timezone: TZ, source: "calendar", state: "ok", ...when }]));
  const people = specs.map(([id, over]) =>
    toPersonRowVM(
      dto(id, {
        visits: visits.get(id),
        // A yes to messages by WhatsApp and by text; a visit message by email needs none.
        consent_channels: ["whatsapp", "sms"],
        email: `${id}@example.com`,
        ...over,
      }),
      TZ,
      NOW,
    ),
  );
  return { people, visits };
}

export const reminderCtx = (specs, over = {}) => ({
  ...visitors(specs),
  calendar: "ok",
  ready: ready({ textLine: TEXT_LINE, mailbox: true, domain: true }),
  ...over,
});

/* ---- A message needs no WhatsApp row (lane 1): the run reads its message once, from the rows it has ---- */

/** The people a visit reminder reaches by text and email, and the two it leaves out: nowhere to send, and a yes on WhatsApp alone. */
export const BY_TEXT_AND_EMAIL = [
  ["a", {}], // a number and an address, said yes by text too: text, the first of the two that is ticked
  ["c", { phone_e164: null }], // an address and no number: email
  ["d", { phone_e164: null, email: null }], // nowhere to send
  ["w", { consent_channels: ["whatsapp"], email: null }], // a yes on WhatsApp alone: neither text nor email reaches them
];

/* ---- The month's allowance, at enrolment ---- */

/** A proposal's follow-up, ticking WhatsApp and email: a message that answers their own request, so email carries it. */
export const followUp = (over = {}) =>
  playbook({
    trigger: "proposal_waiting",
    policy_class: "follow_up",
    template_name: "proposal_nudge",
    params: [{ kind: "first_name" }],
    channels: ["whatsapp", "email"],
    ...over,
  });

/** People with a proposal out ten days, as people_list reads them; the specs say who has no number (email only). */
export function proposals(specs) {
  const people = specs.map(([id, over]) =>
    toPersonRowVM(
      dto(id, {
        deal_id: `deal-${id}`,
        deal_stage: "proposed",
        deal_service: "Remodel",
        deal_proposed_at: iso(10 * D),
        deal_amount_cents: 500_000,
        deal_proposal_url: `https://example.com/p/${id}`,
        last_inbound_at: iso(12 * D),
        consent_channels: ["whatsapp", "sms"],
        email: `${id}@example.com`,
        ...over,
      }),
      TZ,
      NOW,
    ),
  );
  return people;
}

export const followUpCtx = (people, over = {}) => ({
  people,
  calendar: "none",
  pace: null,
  ready: ready({ textLine: TEXT_LINE, mailbox: true, domain: true }),
  touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
  ...over,
});

export const FOLLOW_UPS = [
  ["w", {}], // a number and an address: WhatsApp, which Meta limits and this never does
  ["e1", { phone_e164: null }], // an address and no number: email
  ["e2", { phone_e164: null }],
  ["e3", { phone_e164: null }],
];
