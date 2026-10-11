/**
 * Ask proposes a campaign by the channels it names (review item 11, 3 Oct 2026): propose_campaign's broadcast and its
 * playbook take an optional `channels` (whatsapp, sms, email; WhatsApp alone when none is named, as a campaign goes by
 * default), held to the same rules the composers' routes hold them to, never a second one:
 *
 *   a broadcast  core campaignHowOf (the route's own check): a channel the workspace cannot send on, whose message has no
 *                version, or that the purpose never carries is refused in the composers' words, before any count;
 *   a playbook   checkPlaybook (the route's own check): a channel its purpose never carries is refused; one the workspace
 *                cannot send on yet is kept, its runs holding those people until it can, and the card says so.
 *
 * The card then says the channels (and how many each reaches), commits them to the route, and a card that named none
 * says and commits what it always did. Executed through the real registry over a workspace in memory; the edge's answer
 * about email is a stubbed fetch.
 *
 * A message needs no WhatsApp row (lane 1): Ask reads the one the id names through the verb the routes read it by, so a
 * message with only an email version is offered by campaigns.audiences with the channels it holds, is proposed on by the
 * channels it holds on a workspace with no number, and is refused, when the proposal names none, in WhatsApp's words and
 * with what it can go by; a starter is found among the messages the composers offer, an email version of it among them.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext, runTool, toApiTools } = await import(
  at("apps/dashboard/src/server/ask/tools/index.ts")
);
const {
  PROPOSAL_SPECS,
  CHANNEL_WORDS,
  NEW_PLAYBOOK_TICKS_EVERY_CHANNEL,
  newCampaignChannels,
  noVersionWords,
  playbookChannelsRead,
} = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
// The route a channels card's Approve and Undo call, run here as the app runs it: the card's own call is sent to it.
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const playbookRoute = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const DAY = 86_400_000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
/** A message about their visit (a utility: only the yes to messages is needed), an offer (marketing), and a nudge. */
const REMINDER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const OFFER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const NUDGE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";

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
  tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" }],
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

const propose = (input, db = {}, people = PEOPLE) => {
  const supabase = fakeDb(tables(db), {}, { people_list: () => people });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return buildProposal(t, "propose_campaign", input);
};
const said = (r) => JSON.parse(r.result).error;
const BROADCAST = { action: "broadcast", template_id: REMINDER, audience_kind: "everyone", params: [] };
const commitBody = (p) => PROPOSAL_SPECS[p.kind].commit(p, { settings: null }).body;

test("a broadcast that names no channel says and commits what it always did: WhatsApp alone, no channels in the card or its body", async () => {
  const r = await propose(BROADCAST);
  assert.equal(r.isError, false, r.result);
  assert.equal("channels" in r.proposal.payload, false);
  assert.equal("channels" in commitBody(r.proposal), false, "the route reads WhatsApp alone, as before");
  assert.match(r.proposal.summary, /^2 people who said yes · “visit_reminder” · now: /, "no word of channels");
});

test("a broadcast by WhatsApp and email says the channels and how many each reaches, and commits them to the route", async () => {
  const r = await propose({ ...BROADCAST, channels: ["whatsapp", "email"] });
  assert.equal(r.isError, false, r.result);
  assert.deepEqual(r.proposal.payload.channels, ["whatsapp", "email"]);
  // Each person once, on the first channel that reaches them: a and c by WhatsApp, b (an address, no number) by email.
  assert.equal(r.proposal.payload.count, 3);
  assert.match(
    r.proposal.summary,
    /^3 people who said yes · on WhatsApp and by email \(2 on WhatsApp, 1 by email\) · “visit_reminder” · now: /,
  );
  assert.deepEqual(commitBody(r.proposal).channels, ["whatsapp", "email"], "the body POST broadcasts takes");
  // A channel named once, however it is ticked, is the composers' ticks in their order.
  const reversed = await propose({ ...BROADCAST, channels: ["email", "whatsapp"] });
  assert.deepEqual(reversed.proposal.payload.channels, ["whatsapp", "email"]);
  // By text: a number is all it needs; by WhatsApp alone, named, the card says so.
  const text = await propose({ ...BROADCAST, channels: ["sms"] });
  assert.equal(text.isError, false, text.result);
  assert.match(text.proposal.summary, /^2 people who said yes · by text · /);
  const wa = await propose({ ...BROADCAST, channels: ["whatsapp"] });
  assert.match(wa.proposal.summary, /^2 people who said yes · on WhatsApp · /);
});

test("a broadcast is the business's own news: by email it reaches whoever has dealt with it or said yes to email, and an address alone is not counted (decision D1)", async () => {
  // The same three people, none of whom ever wrote to the business: b (an address, no number) has nothing but the address.
  const strangers = PEOPLE.map((p) => ({ ...p, last_wrote_at: null }));
  const none = await propose({ ...BROADCAST, channels: ["whatsapp", "email"] }, {}, strangers);
  assert.equal(none.isError, false, none.result);
  assert.deepEqual(none.proposal.payload.channels, ["whatsapp", "email"]);
  assert.equal(none.proposal.payload.count, 2, "a and c by WhatsApp; b is held, not counted as reached by email");
  // Only WhatsApp reaches anybody, so the card draws no split: the same words as a send by WhatsApp alone, the email tick kept.
  assert.match(none.proposal.summary, /^2 people who said yes · on WhatsApp and by email · “visit_reminder” · /);
  assert.doesNotMatch(none.proposal.summary, /by email \(/);
  // A yes covering email puts b back (the reminder is a utility: the yes to messages, kept for email as well).
  const withYes = strangers.map((p, i) => (i === 1 ? { ...p, consent_channels: ["whatsapp", "sms", "email"] } : p));
  const yes = await propose({ ...BROADCAST, channels: ["whatsapp", "email"] }, {}, withYes);
  assert.equal(yes.proposal.payload.count, 3);
  assert.match(yes.proposal.summary, /\(2 on WhatsApp, 1 by email\)/);
  // So does a relationship on record, a deal for one.
  const dealt = strangers.map((p, i) => (i === 1 ? { ...p, deal_id: "deal-2", deal_stage: "won" } : p));
  const deal = await propose({ ...BROADCAST, channels: ["whatsapp", "email"] }, {}, dealt);
  assert.match(deal.proposal.summary, /\(2 on WhatsApp, 1 by email\)/);
  // An unsubscribe from email holds them whatever else is on record (they wrote, so they have a relationship).
  const unsubscribed = PEOPLE.map((p, i) => (i === 1 ? { ...p, email_marketing: "opted_out" } : p));
  const out = await propose({ ...BROADCAST, channels: ["whatsapp", "email"] }, {}, unsubscribed);
  assert.match(out.proposal.summary, /^2 people who said yes · on WhatsApp and by email · /);
  assert.doesNotMatch(out.proposal.summary, /by email \(/);
});

test("a broadcast's channels are held to the route's own rule, in the composers' words, before anything is counted", async () => {
  // The purpose never carries it: texts carry no offers, and offers by email wait for their release.
  const offerByText = await propose({ ...BROADCAST, template_id: OFFER, channels: ["sms"] });
  assert.equal(offerByText.isError, true);
  assert.equal(said(offerByText), CHANNEL_WORDS.noOffersByText);
  await edgeSays(CLOSED_EDGE);
  const offerByEmail = await propose({ ...BROADCAST, template_id: OFFER, channels: ["whatsapp", "email"] });
  assert.equal(said(offerByEmail), CHANNEL_WORDS.noOffersByEmailYet);
  // The business's own news is held with them (decision D2): a utility message by email says the same, and by WhatsApp goes.
  const newsByEmail = await propose({ ...BROADCAST, channels: ["whatsapp", "email"] });
  assert.equal(said(newsByEmail), CHANNEL_WORDS.noOffersByEmailYet);
  assert.equal(newsByEmail.proposal, null, "no card for the person to approve");
  assert.equal(
    (await propose({ ...BROADCAST, channels: ["whatsapp", "sms"] })).isError,
    false,
    "by WhatsApp and text it goes",
  );
  await edgeSays(OPEN_EDGE);
  // The message has no version there.
  const noVersion = await propose(
    { ...BROADCAST, channels: ["email"] },
    { templates: [template(REMINDER, "visit_reminder")] },
  );
  assert.equal(said(noVersion), "This message has no email version yet.");
  // The workspace cannot send there: no texting line, no mailbox, and a deployment whose edge holds no key.
  assert.equal(said(await propose({ ...BROADCAST, channels: ["sms"] }, { lines: [] })), CHANNEL_WORDS.noTextLine);
  assert.equal(said(await propose({ ...BROADCAST, channels: ["email"] }, { mailboxes: [] })), CHANNEL_WORDS.noMailbox);
  // A deployment with no email wire cannot send the news either: offers by email wait for the campaigns domain, which is
  // what its absence is (contracts channelsReady).
  await edgeSays({ status: 200, body: { ok: true, ready: false } });
  assert.equal(said(await propose({ ...BROADCAST, channels: ["email"] })), CHANNEL_WORDS.noOffersByEmailYet);
  // A workspace with no postal address, which an offer's foot names: the same reason an offer's tick gives.
  await edgeSays(OPEN_EDGE);
  const bare = tables().tenant_config.map((r) => ({ ...r, config: { brain: { ...r.config.brain, profile: {} } } }));
  const noAddress = await propose({ ...BROADCAST, channels: ["email"] }, { tenant_config: bare });
  assert.equal(said(noAddress), "Add your business's address to send offers by email.");
  // An edge that could not be asked is not ready, and not guessed ready: the page's words for it.
  await edgeSays(new Error("connect ECONNREFUSED"));
  const unchecked = await propose({ ...BROADCAST, channels: ["email"] });
  assert.equal(said(unchecked), "This could not be checked just now.");
  // A card the route would refuse is never shown: with no card, nothing for the person to approve.
  assert.equal(unchecked.proposal, null);
});

test("an empty list is refused in words, a channel named twice is one tick, and an unknown channel never reaches the handler", async () => {
  const empty = await propose({ ...BROADCAST, channels: [] });
  assert.equal(empty.isError, true);
  assert.equal(
    said(empty),
    "channels: Pick WhatsApp, text or email to send by. Name them as whatsapp, sms or email, each once.",
  );
  const twice = await propose({ ...BROADCAST, channels: ["sms", "sms"] });
  assert.equal(twice.isError, false, twice.result);
  assert.deepEqual(twice.proposal.payload.channels, ["sms"], "as the route reads it: one tick");
  const unknown = await propose({ ...BROADCAST, channels: ["carrier pigeon"] });
  assert.equal(unknown.isError, true);
  assert.match(said(unknown), /channels/, "the schema names the field");
  assert.equal(unknown.proposal, null);
  // Null is absent, as any null is.
  const nul = await propose({ ...BROADCAST, channels: null });
  assert.equal(nul.isError, false, nul.result);
  assert.equal("channels" in nul.proposal.payload, false);
});

test("one rule for the channels a new campaign opens on, read by the composer and by Ask: a playbook every channel it may go by now, a broadcast the first alone, WhatsApp alone where there is none", () => {
  assert.equal(NEW_PLAYBOOK_TICKS_EVERY_CHANNEL, true, "decision 5 of the spec of 8 Oct 2026: the one switch");
  // The rule itself, over the channels a campaign may go by now for the message in view, in the product's order.
  assert.deepEqual(newCampaignChannels("playbook", ["whatsapp", "sms", "email"]), ["whatsapp", "sms", "email"]);
  assert.deepEqual(
    newCampaignChannels("broadcast", ["whatsapp", "sms", "email"]),
    ["whatsapp"],
    "a broadcast goes now",
  );
  assert.deepEqual(newCampaignChannels("broadcast", ["sms", "email"]), ["sms"], "the first that is open");
  // Nothing open, or no message in view: WhatsApp alone, as every campaign went before.
  assert.deepEqual(newCampaignChannels("playbook", []), ["whatsapp"]);
  assert.deepEqual(newCampaignChannels("playbook", null), ["whatsapp"]);
  // What is open is the one reading's (playbookChannelsRead, which Ask's proposal asks with "new" as the composer
  // does): what the workspace can send on, the versions the message holds, and what its purpose is carried by.
  const ready = (whatsapp, sms, email) => ({
    whatsapp: { ready: whatsapp, why: null },
    sms: { ready: sms, why: null },
    email: { ready: email, why: null, offers: { ok: true, why: null, paused: null } },
  });
  const holds = (whatsapp, sms, email) => {
    const v = (on) => (on ? { id: "v", status: "approved", hidden: false, blocked: null, reason: null } : null);
    return { category: "utility", versions: { whatsapp: v(whatsapp), sms: v(sms), email: v(email) } };
  };
  const opensOn = (p, message, workspace) => playbookChannelsRead(p, "new", message, workspace).kept;
  const visit = { trigger: "visit_tomorrow" };
  const open = ready(true, true, true);
  assert.deepEqual(opensOn(visit, holds(true, true, true), open), ["whatsapp", "sms", "email"]);
  assert.deepEqual(
    opensOn(visit, holds(true, false, true), open),
    ["whatsapp", "email"],
    "only what the message holds",
  );
  assert.deepEqual(
    opensOn(visit, holds(true, true, true), ready(true, false, true)),
    ["whatsapp", "email"],
    "only what the workspace can send on now",
  );
  assert.deepEqual(opensOn(visit, holds(false, false, true), open), ["email"], "written for email alone: email");
  // An offer: texts carry none, so a new win-back never opens on Text; and by email only once offers by email are open.
  const winBack = { trigger: "quiet_30" };
  const offer = { ...holds(true, true, true), category: "marketing" };
  assert.deepEqual(opensOn(winBack, offer, open), ["whatsapp", "email"]);
  const closed = { ...open, email: { ready: true, why: null, offers: { ok: false, why: "not yet", paused: null } } };
  assert.deepEqual(opensOn(winBack, offer, closed), ["whatsapp"], "an offer by email waits for the workspace's offers");
  assert.deepEqual(
    opensOn(visit, holds(true, true, true), closed),
    ["whatsapp", "sms", "email"],
    "a reminder does not",
  );
  // Nothing open at all: WhatsApp alone.
  assert.deepEqual(opensOn(visit, holds(true, true, true), ready(false, false, false)), ["whatsapp"]);
  // What the tool tells the model of a playbook that names no channel follows the same switch: it said "every one"
  // whichever way the switch stood.
  const told = toApiTools("owner", true).find((x) => x.name === "propose_campaign").description;
  const unnamedGoesBy = (which) =>
    told.includes(`when none is named it goes by ${which} the workspace can send on now`);
  assert.deepEqual([unnamedGoesBy("every one"), unnamedGoesBy("the first one")], [true, false]);
});

test("a playbook's channels are held to the route's own check: a purpose that never carries one is refused; named, the card says them and commits them", async () => {
  const quiet = { action: "playbook", trigger: "quiet_30", template_id: OFFER, params: [] };
  // No channel named: it goes by what the composer would tick for a new playbook (contracts newCampaignChannels; the spec
  // of 8 Oct 2026, decision 5): every channel the workspace can send on now that the message holds and an offer may go
  // by. Here WhatsApp and email (texts carry no offers), said on the card and committed, where it went by WhatsApp alone.
  const plain = await propose(quiet);
  assert.equal(plain.isError, false, plain.result);
  assert.deepEqual(plain.proposal.payload.channels, ["whatsapp", "email"]);
  assert.deepEqual(commitBody(plain.proposal).channels, ["whatsapp", "email"]);
  assert.match(plain.proposal.summary, / · on WhatsApp and by email/);
  // Where WhatsApp is all the workspace can send on, it says and commits what a proposal that named none always did.
  const alone = await propose(quiet, { mailboxes: [] });
  assert.equal(alone.isError, false, alone.result);
  assert.equal("channels" in alone.proposal.payload, false, "WhatsApp alone by default: as it always was");
  assert.equal("channels" in commitBody(alone.proposal), false);
  assert.doesNotMatch(alone.proposal.summary, /by email/);
  // A win-back is an offer: texts carry none. Offers by email are kept ticked, as a playbook keeps any channel that cannot
  // send yet (the check has no readiness): its run holds those people until the workspace can send them.
  assert.equal(said(await propose({ ...quiet, channels: ["sms"] })), CHANNEL_WORDS.noOffersByText);
  const kept = await propose({ ...quiet, channels: ["whatsapp", "email"] });
  assert.equal(kept.isError, false, kept.result);
  assert.deepEqual(kept.proposal.payload.channels, ["whatsapp", "email"]);
  const wa = await propose({ ...quiet, channels: ["whatsapp"] });
  assert.equal(wa.isError, false, wa.result);
  assert.deepEqual(wa.proposal.payload.channels, ["whatsapp"]);
  assert.deepEqual(commitBody(wa.proposal).channels, ["whatsapp"], "the body POST playbooks takes");
  assert.match(wa.proposal.summary, / · on WhatsApp · /);
  // The check's own words, the route's: a playbook's list is held by the one rule that holds the composer's.
  assert.equal(said(await propose({ ...quiet, channels: [] })), "Pick WhatsApp, text or email to send by.");
});

/* ---------------------- the channels a playbook that exists goes by, changed (8 Oct 2026) ---------------------- */

const VISIT_PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
/** A playbook as the table holds it: a visit reminder, running, that names no channels and so goes by WhatsApp alone. */
const playbookRow = (over = {}) => ({
  id: VISIT_PB,
  tenant_id: A,
  kind: "moment",
  name: "Visit reminder",
  trigger: "visit_tomorrow",
  list_id: null,
  list_key: null,
  template_id: REMINDER,
  template_name: "visit_reminder",
  template_language: "en",
  params: [],
  policy_class: "booking",
  state: "running",
  run_hour: 9,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-09-01T00:00:00Z",
  channels: null,
  ...over,
});
/**
 * A workspace that holds the playbook, kept in hand: the card's act and the route its Approve calls read and write the
 * same rows, as they do in the app.
 */
const holding = (over = {}) =>
  tables({ playbooks: [playbookRow()], broadcasts: [], broadcast_recipients: [], decisions: [], ...over });
/** The tool over those rows, and what it asked the database for. */
const askOver = (rows) => {
  let pool = 0;
  const supabase = fakeDb(rows, {}, { people_list: () => ((pool += 1), PEOPLE) });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return {
    channels: (channels, id = VISIT_PB) =>
      buildProposal(t, "propose_campaign", { action: "channels", playbook_id: id, channels }),
    reads: () => [...new Set(supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : q.table)))],
    pool: () => pool,
  };
};
/** propose_campaign's action channels on that playbook, over a workspace that holds it. */
const goesBy = (channels, db = {}, id = VISIT_PB) => askOver(holding(db)).channels(channels, id);
/** A card's commit or its undo, sent as the palette sends it: to the real PUT, over the same rows. */
const sendTo = async (rows, call) => {
  assert.equal(call.route, "PUT playbooks/[id]");
  setRateStore(memoryStore());
  const supabase = fakeDb(rows, {}, {});
  const out = await playbookRoute.PUT.run(
    new Request("http://localhost/api/v1/x", { method: "PUT", body: JSON.stringify(call.body) }),
    { supabase, userId: USER, email: "ada@example.com", params: call.params },
  );
  const written = supabase.seen.filter((s) => s.table === "playbooks" && s.op === "update").map((s) => s.values);
  return { out, written };
};

test("the channels a playbook that exists goes by are changed from a card: the channels alone to its own PUT, judged there against the playbook as it stands, and never a card for no change", async () => {
  const rows = holding();
  const ask = askOver(rows);
  const made = await ask.channels(["whatsapp", "email"]);
  assert.equal(made.isError, false, made.result);
  const p = made.proposal;
  assert.deepEqual([p.kind, p.needs, p.title], ["playbook_channels", "operator", "Channels: Visit reminder"]);
  assert.match(
    p.summary,
    /^Goes by WhatsApp and Email, where it went by WhatsApp · each person is still reached once, on the first of them that can reach them$/,
  );
  // The card carries the channels and nothing else of the playbook: no copy of it to write back.
  assert.deepEqual(p.payload, {
    playbook_id: VISIT_PB,
    name: "Visit reminder",
    channels: ["whatsapp", "email"],
    was: ["whatsapp"],
    run_waits: false,
  });
  // It read the one playbook, its message and what the workspace can send on: never the Playbooks page, which counts
  // everyone in People against every moment to list them all.
  assert.equal(ask.pool(), 0, "nobody in People was read");
  for (const table of ["contacts", "segments", "segment_members", "deals", "events"])
    assert.ok(!ask.reads().includes(table), `${table} was not read: ${ask.reads().join(", ")}`);
  assert.ok(ask.reads().includes("playbooks") && ask.reads().includes("broadcasts"), ask.reads().join(", "));

  const spec = PROPOSAL_SPECS.playbook_channels;
  const call = spec.commit(p, { settings: null });
  assert.deepEqual(call, {
    route: "PUT playbooks/[id]",
    params: { id: VISIT_PB },
    body: { channels: ["whatsapp", "email"] },
  });
  // Somebody changes the playbook in its composer after the card was made and before it is approved. The Approve goes
  // to the real route: it writes the channels and puts nothing of the older playbook back.
  const row = rows.playbooks[0];
  Object.assign(row, { name: "The day before", run_hour: 15, cap_per_run: 40, policy_class: "reengage" });
  const approved = await sendTo(rows, call);
  assert.deepEqual(approved.written, [{ channels: ["whatsapp", "email"] }], "the one column, and no other");
  assert.deepEqual(
    [row.name, row.run_hour, row.cap_per_run, row.policy_class, row.channels],
    ["The day before", 15, 40, "reengage", ["whatsapp", "email"]],
    "the edit stands, its class is not re-derived, and the channels are the card's",
  );
  assert.equal(spec.receipt(p, approved.out), "Visit reminder goes by WhatsApp and Email now", "the drawer's sentence");
  // The undo puts back what it had, by the same door and as narrowly: WhatsApp alone, named.
  assert.equal(p.undo, "Put it back to WhatsApp");
  const undo = spec.undo.call(spec.undo.record(p, approved.out, { settings: null }), { settings: null });
  assert.deepEqual(undo, { route: "PUT playbooks/[id]", params: { id: VISIT_PB }, body: { channels: ["whatsapp"] } });
  Object.assign(row, { run_hour: 16 });
  const undone = await sendTo(rows, undo);
  assert.deepEqual(undone.written, [{ channels: ["whatsapp"] }]);
  assert.deepEqual([row.name, row.run_hour, row.channels], ["The day before", 16, ["whatsapp"]]);

  // Named in any order, kept in the product's; and an id is one id in either case.
  assert.deepEqual((await goesBy(["email", "sms", "whatsapp"])).proposal.payload.channels, [
    "whatsapp",
    "sms",
    "email",
  ]);
  const shouted = await goesBy(["whatsapp", "email"], {}, VISIT_PB.toUpperCase());
  assert.equal(shouted.isError, false, shouted.result);
  assert.equal(shouted.proposal.payload.playbook_id, VISIT_PB);
  // No change is no card, said in words; so is a list of none, in the check's own.
  assert.equal(
    said(await goesBy(["whatsapp"])),
    "“Visit reminder” already goes by WhatsApp: say so, and change nothing",
  );
  assert.equal(said(await goesBy([])), "Pick WhatsApp, text or email to send by.");
  // One that already names its channels starts from them, and may drop one. A paused playbook is changed the same.
  const fewer = await goesBy(["email"], {
    playbooks: [playbookRow({ channels: ["whatsapp", "email"], state: "paused" })],
  });
  assert.equal(fewer.isError, false, fewer.result);
  assert.deepEqual([fewer.proposal.payload.channels, fewer.proposal.payload.was], [["email"], ["whatsapp", "email"]]);
  assert.match(fewer.proposal.summary, /^Goes by Email, where it went by WhatsApp and Email · /);
});

test("a playbook's channels are held to what its own class and message may go by; one it keeps and cannot go by yet waits, with the reason; a run that already waits keeps its own", async () => {
  // A win-back is an offer: texts carry none, in the composers' words, as the PUT would refuse it.
  const winBack = playbookRow({
    name: "Win-back",
    trigger: "quiet_30",
    template_id: OFFER,
    template_name: "month_offer",
    policy_class: "reengage",
  });
  assert.equal(said(await goesBy(["whatsapp", "sms"], { playbooks: [winBack] })), CHANNEL_WORDS.noOffersByText);
  // A playbook on a list sends under the class its row keeps: an offer too, judged by the row and not by its moment.
  const onList = playbookRow({
    name: "Regulars",
    trigger: "saved_list",
    list_key: "opted_in",
    template_id: OFFER,
    template_name: "month_offer",
    policy_class: "campaign",
  });
  assert.equal(said(await goesBy(["whatsapp", "sms"], { playbooks: [onList] })), CHANNEL_WORDS.noOffersByText);
  const listed = await goesBy(["whatsapp", "email"], { playbooks: [onList] });
  assert.equal(listed.isError, false, listed.result);
  assert.deepEqual(listed.proposal.payload.channels, ["whatsapp", "email"]);

  // No mailbox yet: email stays on the playbook and waits, its runs holding those people until it can.
  const waits = await goesBy(["whatsapp", "email"], { mailboxes: [] });
  assert.equal(waits.isError, false, waits.result);
  assert.deepEqual(waits.proposal.payload.channels, ["whatsapp", "email"]);
  assert.ok(
    waits.proposal.summary.endsWith(
      ` · Email waits: ${CHANNEL_WORDS.noMailbox} Its runs hold those people until it can.`,
    ),
    waits.proposal.summary,
  );
  // Email can send and offers by email are not open yet: an offer's email waits too, where the card said "by Email" as
  // if it went (the drawer's row and the rail's mark already said it waits: one reading now).
  await edgeSays(CLOSED_EDGE);
  const offerWaits = await goesBy(["whatsapp", "email"], { playbooks: [winBack] });
  assert.equal(offerWaits.isError, false, offerWaits.result);
  assert.match(offerWaits.proposal.summary, / · Email waits: .+ Its runs hold those people until it can\.$/);
  // The reminder is no offer: by email it goes, and nothing is said to wait.
  const reminderGoes = await goesBy(["whatsapp", "email"]);
  assert.ok(!reminderGoes.proposal.summary.includes("waits"), reminderGoes.proposal.summary);
  await edgeSays(OPEN_EDGE);

  // A run of it already waits for approval: it was made with the channels the playbook had, and the card, and then the
  // receipt, say so as the drawer does. A run of another playbook, or one that is not waiting, is nothing to this one.
  const run = (over = {}) => ({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01",
    tenant_id: A,
    playbook_id: VISIT_PB,
    state: "pending_approval",
    ...over,
  });
  const waiting = await goesBy(["whatsapp", "email"], { broadcasts: [run()] });
  assert.equal(waiting.proposal.payload.run_waits, true);
  assert.ok(
    waiting.proposal.summary.endsWith(" · the run that waits keeps the channels it was made with"),
    waiting.proposal.summary,
  );
  assert.equal(
    PROPOSAL_SPECS.playbook_channels.receipt(waiting.proposal, {}),
    "Visit reminder goes by WhatsApp and Email now · the run that waits keeps the channels it was made with",
  );
  for (const other of [run({ state: "sent" }), run({ playbook_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7" })])
    assert.equal((await goesBy(["whatsapp", "email"], { broadcasts: [other] })).proposal.payload.run_waits, false);

  // An id that is no id, one no playbook of this workspace has, and a reach-out's step (changed on its own sheet):
  // refused in words, no card.
  const step = playbookRow({ kind: "reach_out", trigger: "lead_first", name: "Dentists · step 1" });
  for (const [id, words, db] of [
    ["the visit reminder", /^playbook_id must be a playbook's id/, {}],
    ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9", /^no such playbook in this workspace/, {}],
    [VISIT_PB, /^no such playbook in this workspace/, { playbooks: [step] }],
  ]) {
    const no = await goesBy(["whatsapp", "email"], db, id);
    assert.equal(no.isError, true);
    assert.equal(no.proposal, null);
    assert.match(said(no), words);
  }
  // A channel the tool does not know never reaches the handler: the schema refuses it, naming the three.
  const odd = await goesBy(["whatsapp", "fax"]);
  assert.equal(odd.isError, true);
  assert.match(odd.result, /whatsapp|sms|email/);
});

test("campaigns with action playbooks says the channels each playbook goes by now, which a change of them must name whole", async () => {
  const supabase = fakeDb(
    holding({
      playbooks: [
        playbookRow(),
        playbookRow({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
          name: "Reminder by all three",
          channels: ["email", "whatsapp", "sms"],
        }),
      ],
    }),
    {},
    {
      people_list: () => PEOPLE,
      // Campaigns' 30 days (00329 campaign_series, as GET reports/campaigns?period=30d reads it): one source for the
      // visit reminder, none for the other. Any other window is not the ledger's, and answers nothing.
      campaign_series: (a) =>
        a.p_days === 30 && !a.p_end
          ? {
              timezone: TZ,
              days: 30,
              span_days: 60,
              today: "2026-09-14",
              series: [],
              sources: [
                {
                  id: VISIT_PB,
                  kind: "playbook",
                  name: "Visit reminder",
                  template_name: "visit_reminder",
                  runs: 4,
                  sent: 40,
                  delivered: 38,
                  read: 0,
                  replied: 6,
                  last_at: null,
                },
              ],
            }
          : null,
    },
  );
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  const out = await runTool(t, { name: "campaigns", input: { action: "playbooks" } });
  assert.equal(out.isError, false, out.result);
  const listed = Object.fromEntries(JSON.parse(out.result).playbooks.map((p) => [p.name, p.channels]));
  assert.deepEqual(listed, {
    // One made before channels goes by WhatsApp alone, as its runs read it.
    "Visit reminder": ["whatsapp"],
    "Reminder by all three": ["whatsapp", "sms", "email"],
  });
  // What each says it earned is its last 30 days, as its row on Campaigns says them (the moment spec, A6; D35), never
  // all-time totals; and the read names Campaigns, never outbound.
  const read = JSON.parse(out.result);
  assert.equal(read.route, "campaigns", "Campaigns' own word, never outbound");
  const days = Object.fromEntries(read.playbooks.map((p) => [p.name, p.last_30_days]));
  assert.deepEqual(days, {
    "Visit reminder": { sent: 40, replied: 6 },
    "Reminder by all three": { sent: 0, replied: 0 },
  });
  for (const p of read.playbooks)
    for (const k of ["runs", "sent", "replied"]) assert.equal(k in p, false, `no all-time ${k}`);
});

test("a proposal follow-up by WhatsApp and email: it answers their own request, so email carries it; a channel not ready yet stays on it, and the card says its runs hold those people", async () => {
  const proposed = (p, i) =>
    row(p.id, {
      phone_e164: i === 1 ? null : p.phone_e164,
      deal_id: `deal-${p.id.slice(-1)}`,
      deal_stage: "proposed",
      deal_service: "Remodel",
      deal_proposed_at: ago(10 * DAY),
      deal_amount_cents: 500_000,
      deal_proposal_url: `https://example.com/p/${p.id.slice(-1)}`,
    });
  const people = PEOPLE.map(proposed);
  const nudge = template(NUDGE, "proposal_nudge", {
    variables: [{ position: 1 }, { position: 2 }],
    body_preview: "Hi {{1}}, {{2}}",
  });
  const call = {
    action: "playbook",
    trigger: "proposal_waiting",
    template_id: NUDGE,
    params: ["@first_name", "@proposal_link"],
    channels: ["whatsapp", "email"],
  };
  const db = { templates: [nudge, version("email", "proposal_nudge")] };
  const ok = await propose(call, db, people);
  assert.equal(ok.isError, false, ok.result);
  assert.deepEqual(ok.proposal.payload.channels, ["whatsapp", "email"]);
  assert.match(ok.proposal.summary, / · on WhatsApp and by email \(2 on WhatsApp, 1 by email\) · /);
  assert.doesNotMatch(ok.proposal.summary, /hold those people/, "both can send: nothing is held");
  // No mailbox yet: the tick stays (a run holds those people until it can), and the card says so, as it says it of WhatsApp.
  const noMailbox = await propose(call, { ...db, mailboxes: [] }, people);
  assert.equal(noMailbox.isError, false, noMailbox.result);
  assert.deepEqual(noMailbox.proposal.payload.channels, ["whatsapp", "email"]);
  assert.ok(
    noMailbox.proposal.summary.includes(`${CHANNEL_WORDS.noMailbox} Its runs hold those people until it can.`),
    noMailbox.proposal.summary,
  );
});

/**
 * A message's email or text version with words of its own, in Meta's component shape as the library files it: an email's
 * subject its HEADER, the words its BODY. The test's `version` above carries the WhatsApp row's words under every channel,
 * which is the one thing these cards must not do.
 */
const own = (channel, name, id, subject, body) =>
  template(id, name, {
    channel,
    category: null,
    body_preview: body,
    components: [...(subject ? [{ type: "HEADER", format: "TEXT", text: subject }] : []), { type: "BODY", text: body }],
  });
const SAYING = {
  templates: [
    template(REMINDER, "visit_reminder", {
      variables: [{ position: 1 }],
      body_preview: "Hi {{1}}, your visit is tomorrow.",
    }),
    own(
      "email",
      "visit_reminder",
      "ffffffff-ffff-4fff-8fff-ffffffffff01",
      "Your visit, {{1}}",
      "Hi {{1}},\nwe will see you tomorrow.",
    ),
    own("sms", "visit_reminder", "ffffffff-ffff-4fff-8fff-ffffffffff02", null, "Visit tomorrow, {{1}}."),
  ],
};
const SAY = { ...BROADCAST, params: ["@first_name"] };
const endsWith = (r, words) => assert.ok(r.proposal.summary.endsWith(words), r.proposal.summary);

test("REGRESSION: a broadcast card quotes each channel's own words, named for the channel -- it quoted WhatsApp's under an email's and a text's name", async () => {
  // Named: each channel the card goes by says its own version, slots filled as the preview fills them.
  const both = await propose({ ...SAY, channels: ["whatsapp", "email"] }, SAYING);
  assert.equal(both.isError, false, both.result);
  endsWith(
    both,
    "now: On WhatsApp: Hi Dani, your visit is tomorrow. · By email: “Your visit, Dani” — Hi Dani, we will see you tomorrow.",
  );
  // A text's words carry the STOP line the sender adds: it is what goes.
  const text = await propose({ ...SAY, channels: ["sms"] }, SAYING);
  assert.equal(text.isError, false, text.result);
  endsWith(text, "now: By text: Visit tomorrow, Dani. Reply STOP to opt out");
  // By email alone, not one of WhatsApp's words is on the card.
  const mail = await propose({ ...SAY, channels: ["email"] }, SAYING);
  endsWith(mail, "now: By email: “Your visit, Dani” — Hi Dani, we will see you tomorrow.");
  assert.doesNotMatch(mail.proposal.summary, /your visit is tomorrow/);
  // Naming no channel is WhatsApp alone, and says the template's words as it always did: no channel's name before them.
  const plain = await propose(SAY, SAYING);
  endsWith(plain, "now: Hi Dani, your visit is tomorrow.");
});

test("a card whose version is not in hand is refused, never drawn as another channel's words", async () => {
  // The route's own rule refuses it first (core campaignHowOf); the card holds the words as well: with the email row gone
  // from the rows the composers read, nothing is quoted under email's name.
  const gone = { templates: SAYING.templates.filter((r) => r.channel !== "email") };
  assert.equal(said(await propose({ ...SAY, channels: ["email"] }, gone)), "This message has no email version yet.");
  // A playbook keeps a channel that cannot send yet, but a card has nothing to say of one with no version: refused.
  const offer = template(OFFER, "month_offer", { category: "marketing", body_preview: "This month: 20% off." });
  const quiet = {
    action: "playbook",
    trigger: "quiet_30",
    template_id: OFFER,
    params: [],
    channels: ["whatsapp", "email"],
  };
  const none = await propose(quiet, { templates: [offer] });
  assert.equal(none.isError, true);
  assert.match(said(none), /^This message has no email version yet\. Say so: /);
  assert.equal(none.proposal, null, "no card to approve");
  // With the version, the card says each: the playbook's own words under "Says:".
  const withMail = await propose(quiet, {
    templates: [
      offer,
      own(
        "email",
        "month_offer",
        "ffffffff-ffff-4fff-8fff-ffffffffff03",
        "20% off this month",
        "Save 20% on anything.",
      ),
    ],
  });
  assert.equal(withMail.isError, false, withMail.result);
  assert.ok(
    withMail.proposal.summary.endsWith(
      "Says: On WhatsApp: This month: 20% off. · By email: “20% off this month” — Save 20% on anything.",
    ),
    withMail.proposal.summary,
  );
  // A playbook that names no channel says WhatsApp's words alone, as before.
  const plain = await propose({ ...quiet, channels: undefined }, { templates: [offer] });
  assert.ok(plain.proposal.summary.endsWith("Says: This month: 20% off."), plain.proposal.summary);
});

/**
 * A message with an email version and no WhatsApp row beside it, as a workspace with no number writes one: the words in
 * Meta's component shape, one slot, filed as a visit's message (a utility).
 */
const NOTE = "ffffffff-ffff-4fff-8fff-ffffffffff11";
const emailNote = (over = {}) => ({
  ...own("email", "harbor_note", NOTE, "A note, {{1}}", "Hi {{1}}, we have news."),
  category: "utility",
  variables: [{ position: 1 }],
  ...over,
});
/** A mailbox and no number: the workspace has none connected. */
const NO_NUMBER = { tenant_channels: [] };
const NOTE_BROADCAST = { action: "broadcast", template_id: NOTE, audience_kind: "everyone", params: ["@first_name"] };

test("campaigns.audiences lists a message with an email version and no WhatsApp row as offered, by the channels it holds", async () => {
  const supabase = fakeDb(
    tables({ ...NO_NUMBER, templates: [emailNote(), ...SAYING.templates] }),
    {},
    { people_list: () => PEOPLE },
  );
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  const out = await runTool(t, { name: "campaigns", input: { action: "audiences" } });
  assert.equal(out.isError, false, out.result);
  const { templates } = JSON.parse(out.result);
  assert.deepEqual(
    templates.find((x) => x.name === "harbor_note"),
    {
      template_id: NOTE,
      name: "harbor_note",
      language: "en",
      category: "utility",
      channels: { whatsapp: false, email: true, sms: false },
      values: [{ position: 1, example: null }],
      body: "Hi {{1}}, we have news.",
    },
    "listed by the id a proposal takes, offered by the one channel it holds",
  );
  // A message with all three versions says so, under the id of its WhatsApp row (the anchor).
  const visit = templates.find((x) => x.name === "visit_reminder");
  assert.equal(visit.template_id, REMINDER);
  assert.deepEqual(visit.channels, { whatsapp: true, email: true, sms: true });
  assert.ok(t.read.template.has(NOTE), "a message it offers is a row an answer may cite, by the id it lists");
});

test("campaigns.audiences says its counts are by WhatsApp: with no number a message held on email is listed with a 0 in every can_be_sent count, and is still proposed, by email, to the people it reaches", async () => {
  const world = { ...NO_NUMBER, templates: [emailNote()] };
  const supabase = fakeDb(tables(world), {}, { people_list: () => PEOPLE });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  const out = await runTool(t, { name: "campaigns", input: { action: "audiences" } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  const everyone = read.audiences.find((a) => a.kind === "everyone");
  assert.deepEqual(
    [everyone.can_be_sent_offers, everyone.can_be_sent_messages],
    [0, 0],
    "no number: nobody by WhatsApp",
  );
  assert.deepEqual(
    read.templates.find((x) => x.name === "harbor_note").channels,
    { whatsapp: false, email: true, sms: false },
    "and the message is held by its email",
  );
  // The listing says what its counts are by, and what a zero in them is not.
  assert.ok(read.note.startsWith("Two consents, two counts each, all by WhatsApp."), read.note);
  assert.ok(
    read.note.includes(
      "A message whose channels hold email or sms is proposed with channels naming them, and its card then counts the people those channels reach: a 0 in these counts does not mean nobody can be reached for it.",
    ),
    read.note,
  );
  // That message, proposed by its channels, reaches people: the card's count is the one to quote, not the zero above.
  const card = await propose({ ...NOTE_BROADCAST, channels: ["email"] }, world);
  assert.equal(card.isError, false, card.result);
  assert.match(card.proposal.summary, /^2 people who said yes · by email/);
  // The tool's own words say the same, in the listing's sentences and in the tail the model reads before it quotes a count.
  const { toApiTools } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
  const listing = toApiTools("owner", true).find((x) => x.name === "campaigns").description;
  for (const words of [
    "four counts, all by WhatsApp,",
    "(who a promotional, or a utility or authentication, template reaches on WhatsApp)",
    "a message that holds email or sms is proposed with channels naming them, and its card then counts the people those channels reach, so a 0 in the four counts above does not mean nobody can be reached",
    "never a larger one, for a message that goes by WhatsApp; for a message whose channels hold email or sms, propose it with channels naming them and quote the card's count, since the can_be_sent counts are by WhatsApp alone and a 0 there does not mean nobody can be reached;",
    "when a WhatsApp message's count is 0 and its said_yes is not, and its channels hold no other, the ones who said yes have no number to send to",
  ])
    assert.ok(listing.includes(words), words);
  assert.ok(
    !listing.includes("never a larger one; when that count is 0"),
    "a zero is no longer said to be nobody, whatever channels the message holds",
  );
});

test("a message with no WhatsApp row is proposed by the channels it holds on a workspace with no number, and refused with what it can go by when none is named", async () => {
  const world = { ...NO_NUMBER, templates: [emailNote()] };
  const ok = await propose({ ...NOTE_BROADCAST, channels: ["email"] }, world);
  assert.equal(ok.isError, false, ok.result);
  assert.deepEqual([ok.proposal.payload.template_id, ok.proposal.payload.channels], [NOTE, ["email"]]);
  assert.match(ok.proposal.summary, /^2 people who said yes · by email · “harbor_note” · now: /);
  endsWith(ok, "now: By email: “A note, Dani” — Hi Dani, we have news.");
  assert.doesNotMatch(ok.proposal.summary, /WhatsApp/, "no WhatsApp preview that does not exist");
  // The values are counted by the message's slots, which a message with no WhatsApp row takes from its anchor.
  const few = await propose({ ...NOTE_BROADCAST, params: [], channels: ["email"] }, world);
  assert.equal(said(few), "this template takes 1 value, in order");
  // Naming no channel is WhatsApp alone, which the message has no version for: WhatsApp's words, and the channels it can go
  // by, for the model to name. No card, and nothing counted.
  const none = await propose(NOTE_BROADCAST, world);
  assert.equal(none.isError, true);
  assert.equal(none.proposal, null);
  assert.equal(said(none), "This message has no WhatsApp version. Say so, and name channels among email");
  // A message with a text version too names both, in the product's order.
  const both = await propose(NOTE_BROADCAST, {
    ...world,
    templates: [
      emailNote(),
      {
        ...own("sms", "harbor_note", "ffffffff-ffff-4fff-8fff-ffffffffff12", null, "News, {{1}}."),
        category: "utility",
      },
    ],
  });
  assert.equal(said(both), "This message has no WhatsApp version. Say so, and name channels among sms, email");
  // What the workspace is not ready on is not named: with no mailbox there is nothing to name.
  const bare = await propose(NOTE_BROADCAST, { ...world, mailboxes: [] });
  assert.equal(said(bare), "This message has no WhatsApp version. It can go by no other channel yet: say so");
  // A playbook on it is held to the same: by its email it is made, by none named it is refused in the same words.
  const quiet = { action: "playbook", trigger: "quiet_30", template_id: NOTE, params: ["@first_name"] };
  const offer = { ...world, templates: [emailNote({ category: "marketing" })] };
  const kept = await propose({ ...quiet, channels: ["email"] }, offer);
  assert.equal(kept.isError, false, kept.result);
  assert.deepEqual(kept.proposal.payload.channels, ["email"]);
  // Its WhatsApp tick is one the check would keep, but a card has no WhatsApp words to quote of it: refused, as for any
  // version the message lacks, never drawn as the email's.
  const waTick = await propose({ ...quiet, channels: ["whatsapp", "email"] }, offer);
  assert.equal(waTick.isError, true);
  assert.ok(said(waTick).startsWith(`${noVersionWords("whatsapp")} Say so: `), said(waTick));
  // Naming none, it goes by what the composer would tick for it: its email, the one channel that holds it here (8 Oct
  // 2026). It was refused in WhatsApp's words, with "name channels among email" for the model to ask again.
  const unnamed = await propose(quiet, offer);
  assert.equal(unnamed.isError, false, unnamed.result);
  assert.deepEqual(unnamed.proposal.payload.channels, ["email"]);
  assert.deepEqual(commitBody(unnamed.proposal).channels, ["email"]);
  // Where nothing can carry it (no mailbox either), the refusal stands, in WhatsApp's words.
  assert.equal(
    said(await propose(quiet, { ...offer, mailboxes: [] })),
    "This message has no WhatsApp version. It can go by no other channel yet: say so",
  );
});

test("a moment's starter is found among the messages the composers offer: one whose only version is an email row is held", async () => {
  const starter = "winback_reply";
  const email = own("email", starter, "ffffffff-ffff-4fff-8fff-ffffffffff21", "We miss you", "Hi {{1}}, from {{2}}.");
  const world = {
    ...NO_NUMBER,
    templates: [{ ...email, category: "marketing", variables: [{ position: 1 }, { position: 2 }] }],
  };
  const quiet = { action: "playbook", trigger: "quiet_30" };
  const found = await propose({ ...quiet, channels: ["email"] }, world);
  assert.equal(found.isError, false, found.result);
  assert.equal(found.proposal.payload.template_id, "ffffffff-ffff-4fff-8fff-ffffffffff21", "the message's anchor");
  endsWith(found, "Says: By email: “We miss you” — Hi Dani, from the business.");
  // With no version of it in hand the workspace holds no starter: the card adds it at its Approve (the moment spec's A0),
  // named by its key and with no message (tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs).
  const onStarter = (r) => [
    r.isError,
    r.proposal?.payload.starter_key,
    r.proposal && "template_id" in r.proposal.payload,
  ];
  const none = await propose({ ...quiet, channels: ["email"] }, { templates: [] });
  assert.deepEqual(onStarter(none), [false, starter, false], none.result);
  // A WhatsApp version this product cannot put on the wire whole holds nothing: a starter filed only so is not held, and
  // the card adds the starter's email version.
  const picture = template("dddddddd-dddd-4ddd-8ddd-ddddddddddd5", starter, {
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hi" },
    ],
  });
  const blocked = await propose({ ...quiet, channels: ["email"] }, { templates: [picture] });
  assert.deepEqual(onStarter(blocked), [false, starter, false], blocked.result);
  // The one the workspace hid is not held, whichever channel its version is on, and no card adds it back.
  const hidden = await propose(
    { ...quiet, channels: ["email"] },
    {
      ...world,
      templates: [{ ...world.templates[0], hidden_at: ago(DAY) }],
    },
  );
  // Said as hidden, not as having no version: it has one, and adding the starter set would leave it hidden.
  assert.match(
    said(hidden),
    /starter is hidden in this workspace's Library: show it again under Campaigns › Library, or name another message\./,
  );
  assert.doesNotMatch(said(hidden), /no version|starter set/);
});

test("a hidden message is refused a playbook, and a message whose WhatsApp row is pending is refused for WhatsApp, in WhatsApp's own standing", async () => {
  // The workspace keeps it out of the composers: no playbook on it, by the id the model was given.
  const kept = { ...template(REMINDER, "visit_reminder"), hidden_at: ago(DAY) };
  const hidden = await propose(
    { action: "playbook", trigger: "quiet_30", template_id: REMINDER, params: [] },
    { templates: [kept] },
  );
  assert.equal(hidden.isError, true);
  assert.equal(
    said(hidden),
    "that template is one the workspace keeps out of the composers; campaigns with action audiences names the ones that may send",
  );
  // A WhatsApp row still in review, beside an approved email: WhatsApp's tick says what WhatsApp says, alone or beside email.
  const waiting = {
    templates: [template(REMINDER, "visit_reminder", { meta_status: "pending" }), version("email", "visit_reminder")],
  };
  const STILL = "WhatsApp is still reviewing this message's WhatsApp version.";
  assert.equal(said(await propose({ ...BROADCAST, channels: ["whatsapp"] }, waiting)), STILL);
  assert.equal(said(await propose({ ...BROADCAST, channels: ["whatsapp", "email"] }, waiting)), STILL);
  // Naming none is WhatsApp alone: the same words, and the email it can go by.
  assert.equal(said(await propose(BROADCAST, waiting)), `${STILL} Say so, and name channels among email`);
  // By the email it holds it is made, and says only the email's words.
  const mail = await propose({ ...BROADCAST, channels: ["email"] }, waiting);
  assert.equal(mail.isError, false, mail.result);
  assert.doesNotMatch(mail.proposal.summary, /On WhatsApp/);
});

test("a WhatsApp version in review is no longer lost to Ask: its message is listed by the channels it holds now, and a starter whose WhatsApp row is in review is held by its email", async () => {
  // The composers' read answers the messages made of every row (readers/templates.ts), so a version still in review keeps
  // its standing inside its message: it is among the message's versions, and what holds the message is the email.
  const EMAIL = "ffffffff-ffff-4fff-8fff-ffffffffff31";
  const reviewing = [
    template(REMINDER, "visit_reminder", { meta_status: "pending" }),
    own("email", "visit_reminder", EMAIL, "Your visit", "Your visit is tomorrow."),
    // A message whose only version is in review is not one the composers offer, as it never was.
    template(OFFER, "month_offer", { meta_status: "pending", category: "marketing" }),
    // A message the workspace hid is hidden whole: its WhatsApp row anchors it, and an email beside it does not list it again.
    template(NUDGE, "nudge_note", { hidden_at: ago(DAY) }),
    own("email", "nudge_note", "ffffffff-ffff-4fff-8fff-ffffffffff33", "A nudge", "Hi {{1}}."),
  ];
  const supabase = fakeDb(tables({ templates: reviewing }), {}, { people_list: () => PEOPLE });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  const out = await runTool(t, { name: "campaigns", input: { action: "audiences" } });
  assert.equal(out.isError, false, out.result);
  const { templates } = JSON.parse(out.result);
  assert.deepEqual(
    templates.map((x) => [x.name, x.template_id, x.channels]),
    [["visit_reminder", EMAIL, { whatsapp: false, email: true, sms: false }]],
    "listed by the email it can go by, under the id of the row its words are read from; the one in review alone and the one the workspace hid are not listed",
  );
  assert.ok(t.read.template.has(EMAIL), "and the id it lists is a row an answer may cite");
  // The starter the quiet moment's playbook is written on: held by the email, its anchor the WhatsApp row in review.
  const starter = "winback_reply";
  const WAITING = "dddddddd-dddd-4ddd-8ddd-ddddddddddd6";
  const waiting = template(WAITING, starter, {
    meta_status: "pending",
    category: "marketing",
    variables: [{ position: 1 }, { position: 2 }],
  });
  const email = {
    ...own("email", starter, "ffffffff-ffff-4fff-8fff-ffffffffff32", "We miss you", "Hi {{1}}, from {{2}}."),
    category: "marketing",
    variables: [{ position: 1 }, { position: 2 }],
  };
  const quiet = { action: "playbook", trigger: "quiet_30", channels: ["email"] };
  const found = await propose(quiet, { templates: [waiting, email] });
  assert.equal(found.isError, false, found.result);
  assert.equal(found.proposal.payload.template_id, WAITING, "the message's anchor, whichever of its rows is held");
  endsWith(found, "Says: By email: “We miss you” — Hi Dani, from the business.");
  // With its WhatsApp row in review alone, no version of the starter can be sent: not held, as before, and the card adds
  // the starter's email version at its Approve (A0).
  const alone = await propose(quiet, { templates: [waiting] });
  assert.equal(alone.isError, false, alone.result);
  assert.equal(alone.proposal.payload.starter_key, starter);
});

test("Ask is told what a message is: a name with a version on each channel it is written for, sent on the channels it holds; its tools say to propose by the `channels` the listing gives, and none says one approved WhatsApp template", async () => {
  const { ASK_DEFINITIONS } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
  const { toApiTools } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
  assert.ok(ASK_DEFINITIONS.broadcast.startsWith("One message sent to the people on a list who said yes"));
  assert.ok(
    ASK_DEFINITIONS.broadcast.includes(
      "A message is a name with a version for each channel it is written for (WhatsApp, which WhatsApp approves; email and text, ready when saved) and goes on the channels it holds, each person once.",
    ),
  );
  assert.ok(
    ASK_DEFINITIONS.playbook.startsWith(
      "A standing rule that sends one message to newly eligible people who said yes:",
    ),
  );
  const tools = toApiTools("owner", true);
  const described = (name) => tools.find((t) => t.name === name).description;
  const listing = described("campaigns");
  const proposing = described("propose_campaign");
  assert.ok(
    listing.includes("channels (true for each of whatsapp, email and sms it can be sent on now;"),
    "the listing's channels are described",
  );
  assert.equal(
    proposing.split("name the channels its `channels` in action audiences say it holds").length - 1,
    1,
    "a broadcast is proposed by the channels the listing says a message holds",
  );
  // A playbook that names none goes by what the composer would tick for it (8 Oct 2026, decision 5's one rule), and the
  // model is told so, where it was told WhatsApp alone.
  assert.ok(
    proposing.includes(
      "when none is named it goes by every one the workspace can send on now that the message holds, as a new playbook opens in Campaigns",
    ),
    "the playbook's default is said",
  );

  // And an existing playbook's channels are changed by their own action, which says each person is still reached once.
  assert.ok(proposing.includes("Action channels takes playbook_id, a playbook that exists,"));
  assert.ok(proposing.includes("one more channel widens who it reaches and never sends a person two messages"));
  for (const text of [ASK_DEFINITIONS.broadcast, ASK_DEFINITIONS.playbook, listing, proposing])
    assert.ok(!/approved (WhatsApp )?templates?/i.test(text), text.slice(0, 120));
});

/* ---- The week's breath (spec §5.6): a broadcast card leaves out whoever heard this week, as the route does ---- */

const HEARD_RUN = "88888888-8888-4888-8888-888888888881";
/** A run sent two days ago to these people: who heard from a campaign or a broadcast this week (packages/db touchesSince). */
const heardBy = (...people) => ({
  broadcasts: [
    {
      id: HEARD_RUN,
      tenant_id: A,
      playbook_id: null,
      state: "sent",
      scheduled_for: ago(2 * DAY),
      created_at: ago(2 * DAY),
      run_for: null,
      params: [],
    },
  ],
  broadcast_recipients: people.map((p) => ({
    broadcast_id: HEARD_RUN,
    tenant_id: A,
    contact_id: p.id,
    state: "sent",
    reason: null,
    sent_at: ago(2 * DAY),
    facts: null,
  })),
});

test("a broadcast card leaves out whoever heard this week, as the route skips them: it counts who it sends to, says how many are left out, and its commit never carries breathe", async () => {
  const { allLeftOutWords, heardTooWords } = await import("@chanlytics/contracts");
  // By WhatsApp alone it reaches the two with a number: the first heard from a run two days ago.
  const r = await propose(BROADCAST, heardBy(PEOPLE[0]));
  assert.equal(r.isError, false, r.result);
  assert.equal(r.proposal.payload.count, 1, "who it sends to");
  assert.match(
    r.proposal.summary,
    /^1 person who said yes · 1 left out: they hear from you within a week of it · “visit_reminder” · now: /,
  );
  assert.equal("breathe" in commitBody(r.proposal), false, "absent is true: the route skips them as the card said");
  assert.equal("breathe" in r.proposal.payload, false);
  // Its action takes no breathe: the model cannot ask for one.
  assert.equal(JSON.stringify(toApiTools("owner", true)).includes("breathe"), false);
  // The receipt says who it went to and who was left out, from the route's answer.
  assert.equal(
    PROPOSAL_SPECS.broadcast.receipt(r.proposal, { id: "b1", name: "Visit note", recipient_count: 2, left_out: 1 }),
    "Broadcast “Visit note” — 1 person, sending now · 1 left out: they hear from you within a week of it",
  );
  // Whether it was scheduled is the route's answer, not the card's time: one set for a time that passed before it was
  // approved went now; one the route set ahead is scheduled.
  const lateCard = { ...r.proposal, payload: { ...r.proposal.payload, scheduled_for: "2026-09-01T09:00:00-04:00" } };
  const answer = { id: "b1", name: "Visit note", recipient_count: 2, left_out: 1 };
  assert.equal(
    PROPOSAL_SPECS.broadcast.receipt(lateCard, { ...answer, scheduled_ahead: false }),
    "Broadcast “Visit note” — 1 person, sending now · 1 left out: they hear from you within a week of it",
  );
  assert.equal(
    PROPOSAL_SPECS.broadcast.receipt(lateCard, { ...answer, scheduled_ahead: true }),
    "Broadcast “Visit note” — 1 person, scheduled · 1 left out: they hear from you within a week of it",
  );
  // Nobody heard: the card is what it always was.
  const quiet = await propose(BROADCAST, heardBy());
  assert.match(quiet.proposal.summary, /^2 people who said yes · “visit_reminder” · now: /);
  // By WhatsApp and email the split is counted over who it sends to.
  const both = await propose({ ...BROADCAST, channels: ["whatsapp", "email"] }, heardBy(PEOPLE[0]));
  assert.equal(both.proposal.payload.count, 2);
  assert.match(
    both.proposal.summary,
    /^2 people who said yes · on WhatsApp and by email \(1 on WhatsApp, 1 by email\) · 1 left out: they hear from you within a week of it · /,
  );
  // Everyone it reaches heard: no card, in words, and the way to send to them anyway is a person's, on the composer.
  const all = await propose(BROADCAST, heardBy(PEOPLE[0], PEOPLE[2]));
  assert.equal(all.isError, true);
  assert.ok(said(all).startsWith(allLeftOutWords("Everyone", 2)), said(all));
  assert.ok(said(all).includes(heardTooWords(2)), said(all));
});

test("campaigns.audiences counts what a card would: who it sends to, with how many are left out beside it, and says so when who heard could not be read", async () => {
  const listing = async (db, faults = {}) => {
    const supabase = fakeDb(tables(db), faults, { people_list: () => PEOPLE });
    const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
    return JSON.parse((await runTool(t, { name: "campaigns", input: { action: "audiences" } })).result);
  };
  const everyone = (r) => r.audiences.find((a) => a.kind === "everyone");
  // Nobody heard: the counts and the note are what they always were, and nothing is said of anyone left out.
  const quiet = await listing(heardBy());
  assert.equal(everyone(quiet).can_be_sent_messages, 2);
  assert.equal("left_out_messages" in everyone(quiet), false);
  // The first heard two days ago: the count is the card's (1), and the one left out is beside it.
  const heard = await listing(heardBy(PEOPLE[0]));
  assert.equal(everyone(heard).can_be_sent_messages, 1);
  assert.equal(everyone(heard).left_out_messages, 1);
  assert.ok(heard.note.includes("left out"), heard.note);
  // Counted for a send that goes now; a card set for later counts for its own time.
  assert.ok(heard.note.includes("who a send that goes now goes to"), heard.note);
  assert.ok(heard.note.includes("a card set for later counts for its own time"), heard.note);
  const card = await propose(BROADCAST, heardBy(PEOPLE[0]));
  assert.equal(
    card.proposal.payload.count,
    everyone(heard).can_be_sent_messages,
    "one number: the listing's and the card's",
  );
  // Who heard could not be read: no count it cannot stand behind, and it says why.
  const broken = await listing(heardBy(PEOPLE[0]), { "broadcasts.select": { message: "connection reset" } });
  assert.equal(everyone(broken).can_be_sent_messages, null);
  assert.ok(
    broken.could_not_read.some((w) =>
      w.startsWith("Who has had a message from you lately, or has one due, could not be read just now"),
    ),
    JSON.stringify(broken.could_not_read),
  );
});

test("a card whose week could not be read is no card, and the failed read is said in the log by the tool that asked: the broadcast's and the playbook's alike", async () => {
  const { PLAYBOOK_CARD_REFUSALS } = await import("@chanlytics/contracts");
  const card = (input) => {
    const supabase = fakeDb(
      tables(),
      { "broadcasts.select": { message: "connection reset" } },
      { people_list: () => PEOPLE },
    );
    const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
    return buildProposal(t, "propose_campaign", input);
  };
  const lines = [];
  const was = console.error;
  console.error = (...a) => lines.push(String(a[0]));
  let broadcast;
  let playbook;
  try {
    broadcast = await card(BROADCAST);
    playbook = await card({ action: "playbook", trigger: "quiet_30", template_id: OFFER, params: [] });
  } finally {
    console.error = was;
  }
  assert.equal(said(broadcast), PLAYBOOK_CARD_REFUSALS.weekUnread);
  assert.equal(said(playbook), PLAYBOOK_CARD_REFUSALS.weekUnread);
  const failed = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((l) => l?.event === "ask_tool_read_failed")
    .map((l) => [l.tool, l.read]);
  assert.deepEqual(failed, [
    ["propose_campaign.broadcast", "touches"],
    ["propose_campaign.playbook", "touches"],
  ]);
});

test("a card leaves out nobody for a message due weeks ahead, and one due within a week of it, as the route does", async () => {
  // The first is queued on a run due in twenty-five days, the third on one due in three: made today, waiting.
  const queued = (id, days, p) => ({
    broadcasts: [
      {
        id,
        tenant_id: A,
        playbook_id: null,
        state: "scheduled",
        scheduled_for: ago(-days * DAY),
        created_at: ago(0),
        run_for: null,
        params: [],
      },
    ],
    broadcast_recipients: [
      { broadcast_id: id, tenant_id: A, contact_id: p.id, state: "queued", reason: null, sent_at: null, facts: null },
    ],
  });
  const far = queued("88888888-8888-4888-8888-888888888825", 25, PEOPLE[0]);
  const soon = queued("88888888-8888-4888-8888-888888888803", 3, PEOPLE[2]);
  const card = await propose(BROADCAST, {
    broadcasts: [...far.broadcasts, ...soon.broadcasts],
    broadcast_recipients: [...far.broadcast_recipients, ...soon.broadcast_recipients],
  });
  assert.equal(card.isError, false, card.result);
  assert.equal(card.proposal.payload.count, 1, "the first goes; the third, due another in three days, is left out");
  assert.match(card.proposal.summary, /^1 person who said yes · 1 left out: they hear from you within a week of it · /);
});

test("a card scheduled ahead leaves out who hears from you within a week of it, and agrees with the route's own verb over the same world", async () => {
  const { allLeftOutWords, RECIPIENT_REASON_HEARD } = await import("@chanlytics/contracts");
  const { createBroadcast } = await import(at("packages/core/src/campaigns/create-broadcast.ts"));
  const { createBroadcastPorts } = await import(at("apps/dashboard/src/server/ports/campaign-ports.ts"));
  // The first heard two days ago, the third five days ago: each its own run, made when it was sent.
  const run = (id, days, p) => ({
    broadcasts: [
      {
        id,
        tenant_id: A,
        playbook_id: null,
        state: "sent",
        scheduled_for: ago(days * DAY),
        created_at: ago(days * DAY),
        run_for: null,
        params: [],
      },
    ],
    broadcast_recipients: [
      {
        broadcast_id: id,
        tenant_id: A,
        contact_id: p.id,
        state: "sent",
        reason: null,
        sent_at: ago(days * DAY),
        facts: null,
      },
    ],
  });
  const two = run("88888888-8888-4888-8888-888888888802", 2, PEOPLE[0]);
  const five = run("88888888-8888-4888-8888-888888888805", 5, PEOPLE[2]);
  const world = () => ({
    broadcasts: [...two.broadcasts, ...five.broadcasts],
    broadcast_recipients: [...two.broadcast_recipients, ...five.broadcast_recipients],
  });
  const inThree = new Date(NOW.getTime() + 3 * DAY).toISOString();
  // Now, both heard this week: no card.
  const now = await propose(BROADCAST, world());
  assert.ok(said(now).startsWith(allLeftOutWords("Everyone", 2)), said(now));
  // Three days ahead: only the first heard within a week of it.
  const card = await propose({ ...BROADCAST, scheduled_for: inThree }, world());
  assert.equal(card.isError, false, card.result);
  assert.equal(card.proposal.payload.count, 1);
  assert.match(
    card.proposal.summary,
    /^1 person who said yes · 1 left out: they hear from you within a week of it · “visit_reminder” · /,
  );
  // The route's verb over the same world, the same press and the same time: the same one left out.
  const tables_ = tables(world());
  const supabase = fakeDb(tables_, {}, { people_list: () => PEOPLE });
  const ctx = { supabase, userId: USER, email: "ada@example.com", params: {} };
  const holds = [];
  const ports = {
    ...createBroadcastPorts(ctx, A, { fresh: false }),
    assemble: async (_row, _people, _at, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    holdRecipients: async (_id, ids, reason) => (holds.push([ids, reason]), { skipped: ids, error: null }),
    monthSent: async () => 0,
  };
  const made = await createBroadcast(ports, {
    userId: USER,
    body: { template_id: REMINDER, params: [], audience: { kind: "everyone" }, scheduled_for: inThree },
    now: NOW,
  });
  assert.deepEqual(holds, [[[PEOPLE[0].id], RECIPIENT_REASON_HEARD]]);
  assert.equal(
    made.recipient_count - made.left_out,
    card.proposal.payload.count,
    "one number: the card's and the route's",
  );
  // The receipt over the route's own answer: scheduled, and who it left out.
  assert.ok(
    PROPOSAL_SPECS.broadcast
      .receipt(card.proposal, made)
      .endsWith("1 person, scheduled · 1 left out: they hear from you within a week of it"),
    PROPOSAL_SPECS.broadcast.receipt(card.proposal, made),
  );
});
