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
const { buildProposal, newToolContext, runTool } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { PROPOSAL_SPECS, CHANNEL_WORDS, PREVIEW_WORDS } = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));

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

test("a playbook's channels are held to the route's own check: a purpose that never carries one is refused; named, the card says them and commits them", async () => {
  const quiet = { action: "playbook", trigger: "quiet_30", template_id: OFFER, params: [] };
  const plain = await propose(quiet);
  assert.equal(plain.isError, false, plain.result);
  assert.equal("channels" in plain.proposal.payload, false, "no channel named: as it always was");
  assert.equal("channels" in commitBody(plain.proposal), false);
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
  assert.match(said(none), /^This message has no email version to show here\. Say so: /);
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
  assert.ok(said(waTick).startsWith(`${PREVIEW_WORDS.noVersion("whatsapp")} Say so: `), said(waTick));
  assert.equal(
    said(await propose(quiet, offer)),
    "This message has no WhatsApp version. Say so, and name channels among email",
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
  // With no version of it in hand the workspace holds no starter, and says so.
  const none = await propose({ ...quiet, channels: ["email"] }, { templates: [] });
  assert.match(said(none), /starter has no version this workspace can send yet/);
  // A WhatsApp version this product cannot put on the wire whole holds nothing: a starter filed only so is not held.
  const picture = template("dddddddd-dddd-4ddd-8ddd-ddddddddddd5", starter, {
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hi" },
    ],
  });
  const blocked = await propose({ ...quiet, channels: ["email"] }, { templates: [picture] });
  assert.match(said(blocked), /starter has no version this workspace can send yet/);
  // The one the workspace hid is not held, whichever channel its version is on.
  const hidden = await propose(
    { ...quiet, channels: ["email"] },
    {
      ...world,
      templates: [{ ...world.templates[0], hidden_at: ago(DAY) }],
    },
  );
  assert.match(said(hidden), /starter has no version this workspace can send yet/);
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
  // With its WhatsApp row in review alone, no version of the starter can be sent: not held, as before.
  const alone = await propose(quiet, { templates: [waiting] });
  assert.match(said(alone), /starter has no version this workspace can send yet/);
});
