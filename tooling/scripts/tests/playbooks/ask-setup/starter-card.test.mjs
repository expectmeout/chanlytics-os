/**
 * A playbook proposed on a moment whose starter this workspace does not hold yet (the moment spec's A0, D23): the card
 * carries the starter's key in place of a message, says the starter is added at Approve and, where no WhatsApp version of
 * it is on file, that its WhatsApp version goes to WhatsApp for review then, which cannot be taken back; one on file is
 * said as it stands (in review, refused), and the filing leaves it so. It counts who the moment names that said the yes
 * the starter needs. It is judged whole first, by the route's own function (checkStarterPlaybook), in the route's words,
 * and says every channel it goes by and which of them hold their people until they can send (the drawer's own reading,
 * over the message as the filing leaves it): WhatsApp until WhatsApp approves the version, email until offers by email
 * are open. Nothing is filed at the card. A starter that takes words of its own (the month's offer) is not proposed this
 * way, and one the workspace hid is never added back. The world is
 * tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs's, copied whole.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const {
  LIBRARY_STARTER_WORDS,
  PLAYBOOK_CARD_REFUSALS,
  PLAYBOOK_CARD_WORDS,
  PLAYBOOK_CLASS_LABEL,
  PROPOSAL_SPECS,
  SEQUENCE_MODE_WORDS,
  appointmentWordOf,
  appointmentWords,
  channelsWords,
  defaultParamSpecs,
  startersForTrigger,
  winBackWords,
} = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const DAY = 86_400_000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
/** A message about their visit (a utility: only the yes to messages is needed), and an offer (marketing). */
const REMINDER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const OFFER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

const row = (id, over = {}) => ({
  id,
  display_name: `Person ${id.slice(-1)}`,
  wa_profile_name: null,
  phone_e164: `+1555010${id.slice(-1)}00`,
  email: `p${id.slice(-1)}@example.com`,
  email_suppressed_at: null,
  consent: "opted_in",
  consent_source: "keyword",
  consent_updated_at: ago(40 * DAY),
  marketing_consent: "opted_in",
  marketing_consent_source: "customer_message",
  marketing_consent_updated_at: ago(40 * DAY),
  consent_channels: ["whatsapp", "sms"],
  marketing_channels: ["whatsapp"],
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${id.slice(-1)}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: ago(10 * DAY),
  last_message_at: ago(10 * DAY),
  last_message_direction: "inbound",
  last_message_sender: "client",
  last_inbound_text: "hi",
  last_inbound_at: ago(40 * DAY),
  // They wrote in their own words once (people_list's last_wrote_at): a relationship on record, which is what lets an email
  // the business chose to send reach a person with no yes covering email (decision D1). Not the card's subject here.
  last_wrote_at: ago(40 * DAY),
  last_inbound_channel: null,
  last_call_at: null,
  last_outbound_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: ago(60 * DAY),
  earliest_row_at: ago(60 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  created_at: ago(60 * DAY),
  ...over,
});
/** Three people: a number and an address, an address and no number, a number and no address. */
const PEOPLE = [
  row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"),
  row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", { phone_e164: null }),
  row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", { email: null }),
];

const template = (id, name, over = {}) => ({
  id,
  tenant_id: A,
  channel: "whatsapp",
  name,
  language: "en",
  meta_status: "approved",
  category: "utility",
  variables: [],
  body_preview: "Your visit is tomorrow.",
  hidden_at: null,
  components: null,
  ...over,
});
/** The email and text versions of a message: a templates row of the same name and language beside the WhatsApp one. */
const version = (channel, name) => ({
  ...template(
    `ffffffff-ffff-4fff-8fff-ffffffff${channel === "sms" ? "f1" : "f2"}${name.length % 10}0`.slice(0, 36),
    name,
    {
      channel,
      category: null,
    },
  ),
  components: channel === "email" ? { subject: "Your visit", body: "Your visit is tomorrow." } : null,
});

const tables = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }],
  // With its postal address: a broadcast's email is the business's news, an offer at the door, whose foot names it (decision D2).
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor Moving",
          system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: { address: "12 Main St, Springfield" },
        },
      },
      version: 1,
    },
  ],
  tenant_channels: [
    {
      tenant_id: A,
      kind: "whatsapp",
      status: "active",
      config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
    },
  ],
  lines: [
    {
      tenant_id: A,
      sms_state: "active",
      reg_mock: false,
      messaging_service_sid: "MG1",
      voice_state: "ok",
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  mailboxes: [{ tenant_id: A, local_part: "harbor" }],
  policies: [],
  templates: [
    template(REMINDER, "visit_reminder"),
    version("sms", "visit_reminder"),
    version("email", "visit_reminder"),
    template(OFFER, "month_offer", { category: "marketing", body_preview: "This month: 20% off." }),
    version("email", "month_offer"),
  ],
  contacts: PEOPLE.map((p) => ({ id: p.id, tenant_id: A, erased_at: null, display_name: p.display_name })),
  segments: [],
  segment_members: [],
  playbooks: [],
  deals: [],
  events: [],
  contact_identities: [],
  ...over,
});

/** What the edge answers about its email wire; an Error is a network that failed. */
const OPEN_EDGE = { status: 200, body: { ok: true, ready: true, offers: true } };
/** Email can send, and the campaigns domain is not verified: offers by email are closed. */
const CLOSED_EDGE = { status: 200, body: { ok: true, ready: true, offers: false } };
let edge;
const real = globalThis.fetch;
/** The edge answers `answer` from now on, and the dashboard's kept answer is the one it gives. */
const edgeSays = async (answer) => {
  edge = answer;
  await emailWire({ fresh: true });
};
beforeEach(async () => {
  readerCache.clear();
  globalThis.fetch = async () => {
    if (edge instanceof Error) throw edge;
    return new Response(JSON.stringify(edge.body), {
      status: edge.status,
      headers: { "content-type": "application/json" },
    });
  };
  // The deployment can send email, and the campaigns domain is verified: offers by email, and the business's own news with them
  // (decision D2), can go. A case about them closed says so with `edgeSays(CLOSED_EDGE)`.
  await edgeSays(OPEN_EDGE);
});
after(() => (globalThis.fetch = real));

const propose = (input, db = {}) => {
  const rows = tables({ templates: [], ...db });
  const supabase = fakeDb(rows, {}, { people_list: () => PEOPLE });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return { made: buildProposal(t, "propose_sequence", { action: "moment", ...input }), rows };
};
const said = (r) => JSON.parse(r.result).error;
const STARTER = startersForTrigger("quiet_30").find((s) => !s.retired);
/** What the drawer says of a kept channel that waits, after its name (the channels card's sentence). */
const WAITS_WORDS = "Its runs hold those people until it can.";

test("a moment whose starter is not on file: a card that names the starter, says it is added at Approve with its WhatsApp version sent to WhatsApp for review then, and commits the key in place of a message", async () => {
  const { made, rows } = propose({ trigger: "quiet_30" });
  const r = await made;
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.equal(p.kind, "playbook");
  assert.match(p.title, /^Campaign: /, "the word a person reads");
  assert.equal(p.payload.starter_key, STARTER.key);
  assert.equal("template_id" in p.payload, false);
  // Its slots, filled with the starter's own sources: what the route fills them with at Approve.
  assert.deepEqual(p.payload.params, defaultParamSpecs({ name: STARTER.name, variables: [] }));
  assert.ok(p.summary.includes(` · ${LIBRARY_STARTER_WORDS.addsFirst(STARTER.title)} · `), p.summary);
  assert.equal(LIBRARY_STARTER_WORDS.addsFirst(STARTER.title), `adds the “${STARTER.title}” starter first`);
  assert.match(p.summary, /said yes to offers/);
  // Every channel it goes by (its email version at once, WhatsApp where there is a number), and the one that holds its
  // people until it can send: WhatsApp, whose version nothing has sent yet. It goes for review at Approve, which cannot
  // be taken back, and its people wait until WhatsApp approves it: no review is said to be under way, and no time is
  // promised for one.
  assert.deepEqual(p.payload.channels, ["whatsapp", "email"]);
  assert.match(p.summary, / · on WhatsApp and by email/);
  assert.equal(
    LIBRARY_STARTER_WORDS.whatsappForReview,
    "WhatsApp waits: its WhatsApp version goes to WhatsApp for review when you approve, and that cannot be taken back. Its runs hold those people until WhatsApp approves it.",
  );
  assert.ok(p.summary.includes(` · ${LIBRARY_STARTER_WORDS.whatsappForReview}`), p.summary);
  assert.ok(!/still reviewing|Meta|minutes/.test(p.summary), p.summary);
  assert.ok(!p.summary.includes("Email waits"), p.summary);
  const body = PROPOSAL_SPECS.playbook.commit(p, { settings: null }).body;
  assert.deepEqual([body.starter_key, body.template_id, body.trigger], [STARTER.key, undefined, "quiet_30"]);
  assert.deepEqual(body.params, p.payload.params);
  assert.deepEqual(body.channels, ["whatsapp", "email"], "the channels the card said");
  assert.equal(
    PROPOSAL_SPECS.playbook.open(p, null),
    "campaigns/sequences/new:moment:quiet_30",
    "Open in New sequence",
  );
  assert.deepEqual([rows.templates, rows.playbooks], [[], []], "nothing is filed at the card");
  // The card as a sheet (the answer canvas, C1): the summary's own pieces, a row a fact in the order an owner checks
  // them, and the wait read first, apart. One derivation: every row's words are the summary's.
  assert.deepEqual(
    p.sheet.rows.map((r) => r.label),
    ["Where", "Runs", "Goes", "Reaches", "Sends", "Message"],
  );
  // The summary as the sheet says its pieces: each separator a comma, case aside (a row starts with a capital).
  const flat = p.summary.replaceAll(" · ", ", ").toLowerCase();
  for (const { label, value } of p.sheet.rows) assert.ok(flat.includes(value.toLowerCase()), `${label}: ${value}`);
  assert.equal(p.sheet.rows.find((r) => r.label === "Goes").value, "On WhatsApp and by email");
  assert.equal(p.sheet.rows.find((r) => r.label === "Message").value, `Adds the “${STARTER.title}” starter first`);
  assert.ok(p.sheet.holds.includes(LIBRARY_STARTER_WORDS.whatsappForReview), JSON.stringify(p.sheet.holds));
  assert.ok(
    p.sheet.rows.every((r) => !r.value.includes(" · ") && !/^[·\s]/.test(r.value)),
    JSON.stringify(p.sheet.rows),
  );
});

test("a starter card is refused for what its Approve would be refused for, in the same words, and nothing is filed: a number out of bounds, a moment this workspace is not offered, WhatsApp alone before WhatsApp approves the version", async () => {
  const one = propose({ trigger: "quiet_30", run_hour: 7 });
  assert.equal(said(await one.made), "The hour must be a whole number from 9 to 20.");
  // The win-back by appointments needs a calendar, and this world has none: momentOffered refuses it, as the route does.
  const two = propose({ trigger: "lapsed" });
  const word = appointmentWordOf("meeting");
  assert.equal(said(await two.made), winBackWords(word).lapsed);
  // WhatsApp named alone: its version would go to Meta and carry nothing until approved, so no card.
  const three = propose({ trigger: "quiet_30", channels: ["whatsapp"] });
  assert.equal(
    said(await three.made),
    LIBRARY_STARTER_WORDS.waitsForWhatsApp(STARTER.title, channelsWords(["whatsapp"]), channelsWords(["email"])),
  );
  for (const { rows } of [one, two, three]) assert.deepEqual([rows.templates, rows.playbooks], [[], []]);
});

test("a starter card says every channel it goes by and which hold their people until they can send: with no number email alone and nothing for WhatsApp; with offers by email closed, email waits too", async () => {
  const noNumber = await propose({ trigger: "quiet_30" }, { tenant_channels: [] }).made;
  assert.equal(noNumber.isError, false, noNumber.result);
  assert.deepEqual(noNumber.proposal.payload.channels, ["email"]);
  assert.match(noNumber.proposal.summary, / · by email/);
  assert.ok(!/Meta|WhatsApp/.test(noNumber.proposal.summary), noNumber.proposal.summary);
  await edgeSays(CLOSED_EDGE);
  const closed = await propose({ trigger: "quiet_30" }).made;
  assert.equal(closed.isError, false, closed.result);
  assert.ok(closed.proposal.summary.includes(` · ${LIBRARY_STARTER_WORDS.whatsappForReview}`), closed.proposal.summary);
  assert.match(closed.proposal.summary, / · Email waits: [^·]+ Its runs hold those people until it can\./);
});

test("a starter card on a number WhatsApp flagged keeps the workspace's own reason why WhatsApp waits, and says the review beside it: approving the version does not release those people", async () => {
  const red = [
    { tenant_id: A, kind: "whatsapp", status: "active", config: { quality_rating: "RED", messaging_limit: "TIER_1K" } },
  ];
  const r = await propose({ trigger: "quiet_30" }, { tenant_channels: red }).made;
  assert.equal(r.isError, false, r.result);
  const s = r.proposal.summary;
  assert.match(
    s,
    / · WhatsApp waits: WhatsApp flagged this number's quality[^·]* Its runs hold those people until it can\./,
  );
  assert.ok(!s.includes(LIBRARY_STARTER_WORDS.whatsappForReview), s);
  assert.ok(!s.includes("until WhatsApp approves it"), s);
  assert.equal(
    LIBRARY_STARTER_WORDS.whatsappSentForReview,
    "Its WhatsApp version goes to WhatsApp for review when you approve, and that cannot be taken back.",
  );
  assert.ok(s.includes(` · ${LIBRARY_STARTER_WORDS.whatsappSentForReview}`), s);
});

/** The starter's WhatsApp version on file, as the filing finds it (in English, as a new campaign's starter is filed). */
const onFile = (status, over = {}) =>
  template("dddddddd-dddd-4ddd-8ddd-ddddddddddd7", STARTER.name, {
    language: "en_US",
    meta_status: status,
    category: STARTER.category,
    ...over,
  });

test("a starter whose WhatsApp version is on file says what it is, never that it goes for review: in review, WhatsApp is still reviewing it; refused, WhatsApp refused it; the filing leaves it as it is", async () => {
  // In review (not yet a version that can send, so the workspace holds no starter, and the card adds its email version).
  const { made: inReview, rows } = propose({ trigger: "quiet_30" }, { templates: [onFile("pending")] });
  const pending = await inReview;
  assert.equal(pending.isError, false, pending.result);
  assert.deepEqual(pending.proposal.payload.channels, ["whatsapp", "email"]);
  assert.ok(
    pending.proposal.summary.includes(
      ` · WhatsApp waits: WhatsApp is still reviewing this message's WhatsApp version. ${WAITS_WORDS}`,
    ),
    pending.proposal.summary,
  );
  assert.ok(pending.proposal.summary.includes(` · ${LIBRARY_STARTER_WORDS.addsFirst(STARTER.title)} · `));
  assert.ok(!/for review|taken back/.test(pending.proposal.summary), pending.proposal.summary);
  assert.equal(rows.templates.length, 1, "nothing is filed at the card");
  // Refused, with WhatsApp named: it waits on a version WhatsApp refused, said so, and nothing goes for review.
  const named = await propose(
    { trigger: "quiet_30", channels: ["whatsapp", "email"] },
    { templates: [onFile("rejected")] },
  ).made;
  assert.equal(named.isError, false, named.result);
  assert.deepEqual(named.proposal.payload.channels, ["whatsapp", "email"]);
  assert.ok(
    named.proposal.summary.includes(
      ` · WhatsApp waits: WhatsApp refused this message's WhatsApp version. ${WAITS_WORDS}`,
    ),
    named.proposal.summary,
  );
  assert.ok(!/for review|taken back|still reviewing/.test(named.proposal.summary), named.proposal.summary);
  // Refused, with none named: it goes by its email alone, and says nothing of WhatsApp.
  const unnamed = await propose({ trigger: "quiet_30" }, { templates: [onFile("rejected")] }).made;
  assert.equal(unnamed.isError, false, unnamed.result);
  assert.deepEqual(unnamed.proposal.payload.channels, ["email"]);
  assert.ok(!/WhatsApp/.test(unnamed.proposal.summary), unnamed.proposal.summary);
});

test("a starter the workspace hid is never added back, and the card says it is hidden in the Library, not that it has no version", async () => {
  const hidden = await propose({ trigger: "quiet_30" }, { templates: [onFile("approved", { hidden_at: ago(DAY) })] })
    .made;
  assert.equal(hidden.isError, true);
  assert.ok(said(hidden).startsWith(LIBRARY_STARTER_WORDS.hiddenInLibrary(STARTER.title)), said(hidden));
  assert.equal(
    LIBRARY_STARTER_WORDS.hiddenInLibrary(STARTER.title),
    `The “${STARTER.title}” starter is hidden in this workspace: show it again under Campaigns › Messages, or name another message.`,
  );
  assert.ok(!/no version|starter set/.test(said(hidden)), said(hidden));
});

test("a starter that takes words of its own (the month's offer) is not proposed on a key: the model is told to ask for the words and name a message", async () => {
  const r = await propose({ trigger: "everyone_monthly" }).made;
  assert.equal(r.isError, true);
  assert.match(said(r), /takes words of its own/);
});

/** Each class's Autonomy row: the win-back's (reengage) and the appointment moments' (booking) at `mode`. */
const modes = (mode) =>
  ["reengage", "booking"].map((cls) => ({ tenant_id: A, class: cls, mode, subject_type: null, limits: null }));
test("a new campaign's card says what its batches will do: its first waits for your OK whatever the mode (decision 0064), and after that by the mode its class's row gives a new sequence (under ask, each, said once); nothing of a trial is carried or committed", async () => {
  const approved = onFile("approved", { variables: ["1", "2"] });
  for (const mode of ["auto", "veto", "ask"]) {
    const onStarter = await propose({ trigger: "quiet_30" }, { policies: modes(mode) }).made;
    const onFile_ = await propose({ trigger: "quiet_30" }, { policies: modes(mode), templates: [approved] }).made;
    for (const r of [onStarter, onFile_]) {
      assert.equal(r.isError, false, r.result);
      const p = r.proposal;
      assert.equal(p.payload.mode, mode);
      assert.equal("trial" in p.payload, false, "no trial: the first batch's OK is the trial");
      // Under ask every batch waits, the first among them: said once.
      const batches =
        mode === "ask"
          ? "Each batch waits for your OK"
          : `Its first batch waits for your OK; after that, ${SEQUENCE_MODE_WORDS[mode].does}`;
      assert.ok(p.summary.includes(`${batches} (${PLAYBOOK_CLASS_LABEL.reengage}).`), p.summary);
      const body = PROPOSAL_SPECS.playbook.commit(p, { settings: null }).body;
      assert.deepEqual(["trial" in body, "trial_until" in body], [false, false]);
    }
    assert.equal(onStarter.proposal.payload.starter_key, STARTER.key, "the starter path");
    assert.ok(onFile_.proposal.payload.template_id, "the message-on-file path");
  }
  // A class with no row asks, as a new sequence of it would (00462 sequence_mode_for).
  const unrowed = await propose({ trigger: "quiet_30" }, { policies: [] }).made;
  assert.equal(unrowed.proposal.payload.mode, "ask");
});

/** The workspace's settings with a calendar connected (the feed's address on file). */
const withCalendar = () => {
  const [row] = tables().tenant_config;
  return [{ ...row, config: { ...row.config, calendar: { ical_url: "https://calendar.example/harbor.ics" } } }];
};

test("an appointment moment is proposed where a calendar is connected (D2): the reminder the day before is a card on its starter that says it goes whatever else they hear from you around it; with none connected it is refused in the check's own words, and nothing is filed", async () => {
  const REMINDER = startersForTrigger("visit_tomorrow").find((s) => !s.retired);
  const { made, rows } = propose({ trigger: "visit_tomorrow" }, { tenant_config: withCalendar() });
  const r = await made;
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  // What the eval's remind_day_before reads off the card (ask-cases.json card_fields).
  assert.deepEqual([p.kind, p.payload.trigger, p.payload.starter_key], ["playbook", "visit_tomorrow", REMINDER.key]);
  // The breath is two-sided (a message sent or due within a week of it, contracts BREATH_WHY), so the words never say
  // "this week".
  assert.equal(
    PLAYBOOK_CARD_WORDS.appointmentBreath,
    "exempt from one a week per person: each goes whatever else they hear from you within a week of it",
  );
  assert.ok(p.summary.includes(` · ${PLAYBOOK_CARD_WORDS.appointmentBreath} · `), p.summary);
  assert.deepEqual([rows.templates, rows.playbooks], [[], []], "nothing is filed at the card");
  // The check after one, likewise, and only an appointment moment says it: a win-back is held to the week.
  const after = await propose({ trigger: "visited" }, { tenant_config: withCalendar() }).made;
  assert.equal(after.isError, false, after.result);
  assert.ok(after.proposal.summary.includes(PLAYBOOK_CARD_WORDS.appointmentBreath), after.proposal.summary);
  const winBack = await propose({ trigger: "lapsed" }, { tenant_config: withCalendar() }).made;
  assert.equal(winBack.isError, false, winBack.result);
  assert.ok(!winBack.proposal.summary.includes(PLAYBOOK_CARD_WORDS.appointmentBreath), winBack.proposal.summary);
  // No calendar: refused in core checkPlaybook's own words, in the workspace's word for an appointment.
  const needs = appointmentWords(appointmentWordOf("meeting")).needsCalendar;
  for (const trigger of ["visit_tomorrow", "visited"]) {
    const none = propose({ trigger });
    assert.equal(said(await none.made), needs, trigger);
    assert.deepEqual([none.rows.templates, none.rows.playbooks], [[], []]);
  }
  // A message on file for it changes nothing: the moment is judged first, before its message or its channels.
  const held = template("dddddddd-dddd-4ddd-8ddd-ddddddddddd8", REMINDER.name, { language: "en_US" });
  assert.equal(said(await propose({ trigger: "visit_tomorrow" }, { templates: [held] }).made), needs);
});

test("the action can name the moment's starter to file at Approve: the day after's review ask, where the Google listing keeps a review link, is a card on it that commits its key; without the link it is refused in the route's own words; unnamed, the day after is still its check", async () => {
  const { TEMPLATE_VALUE_WORDS } = await import(at("packages/core/src/campaigns/template-values.ts"));
  const REVIEW = startersForTrigger("visited").find((s) => s.key === "after_visit_review");
  const CHECK = startersForTrigger("visited").find((s) => s.key === "after_visit_check");
  const listing = [{ tenant_id: A, new_review_uri: "https://example.com/review/harbor" }];
  const world = { tenant_config: withCalendar(), google_listings: listing };
  const { made, rows } = propose({ trigger: "visited", starter: REVIEW.key }, world);
  const r = await made;
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.deepEqual([p.payload.trigger, p.payload.starter_key], ["visited", REVIEW.key]);
  assert.ok(p.summary.includes(` · ${LIBRARY_STARTER_WORDS.addsFirst(REVIEW.title)} · `), p.summary);
  assert.deepEqual(p.payload.params, defaultParamSpecs({ name: REVIEW.name, variables: [] }));
  assert.ok(
    p.payload.params.some((s) => s.kind === "review_link"),
    "its third value is the listing's link, filled at the send",
  );
  // Its Approve files that starter, then starts on it (POST playbooks with its key: starter-playbook.test.mjs files it).
  const body = PROPOSAL_SPECS.playbook.commit(p, { settings: null }).body;
  assert.deepEqual([body.starter_key, body.template_id, body.trigger], [REVIEW.key, undefined, "visited"]);
  assert.deepEqual([rows.templates, rows.playbooks], [[], []], "nothing is filed at the card");

  // No review link on the listing: refused before a card, in the words the route refuses its Approve in.
  const none = propose({ trigger: "visited", starter: REVIEW.key }, { tenant_config: withCalendar() });
  assert.equal(said(await none.made), TEMPLATE_VALUE_WORDS.noReviewLink);
  assert.deepEqual([none.rows.templates, none.rows.playbooks], [[], []]);

  // Unnamed, the day after's own starter stays How did it go, link or none.
  const unnamed = await propose({ trigger: "visited" }, world).made;
  assert.equal(unnamed.isError, false, unnamed.result);
  assert.equal(unnamed.proposal.payload.starter_key, CHECK.key);

  // Another moment's starter is refused in the route's words, and a starter beside a message is one too many.
  const other = startersForTrigger("visit_tomorrow").find((s) => !s.retired);
  const wrong = await propose({ trigger: "visited", starter: other.key }, world).made;
  assert.equal(wrong.isError, true);
  assert.match(said(wrong), /^That starter is not one /);
  const both = await propose({ trigger: "visited", starter: REVIEW.key, template_id: REMINDER }, world).made;
  assert.equal(said(both), PLAYBOOK_CARD_REFUSALS.starterOrMessage);
});
