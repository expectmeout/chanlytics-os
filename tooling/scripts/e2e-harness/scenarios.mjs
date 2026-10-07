/**
 * The records the local harness shows a signed-in spec, and the one place each is spelled.
 *
 * The server answers the spec's own `/api/v1/settings` read from a scenario, and the page's fixture publishes the
 * tab's globals from the SAME scenario object (the server injects it into the bundle), so the spec and the page
 * cannot disagree the way two hand-built copies would.
 *
 * Settings left the standalone mockup (decision 0015 step 11; Ruben, 4 Oct 2026), so no record is drawn as the Business
 * tab any more: the nightly and the salon survive as the data the pipeline and the kit are built on, and as the
 * workspaces the mockup's other pages are drawn for (the style-equality recorder's).
 *
 *   nightly -- the seeded `chanlytics-e2e` workspace, DERIVED from tooling/scripts/ops/e2e-workspace.mjs rather than
 *              copied: the WHOLE config that converge writes (its notifications included, so what the read hands
 *              over is what the nightly's row holds), the line it provisions and the clock it sets. When the seed
 *              changes, this changes with it, which is the whole reason it imports rather than restates. No profile
 *              at all: every list is empty and every fold opens on nothing.
 *   pipeline -- a studio that sends proposals (deals on, 0008) with People REAL over it: eight people across the
 *              Pipeline's four groups, in people_list's row shape and the person read's own, so e2e/people/people.spec.ts's
 *              Pipeline walk runs here -- the list, the peek, the person's page. Fictional, as the salon is.
 *   salon    -- a fuller record, for the branches the nightly's data cannot reach: a week of hours, closures AT the
 *              cap, services, and one language short of the cap so a single Add fills it (the Business tab's folds,
 *              which were drawn here, are the app's own now). A FICTIONAL business: this
 *              file is committed, and no real business's name, address, number or link belongs in the tree.
 *   email-only -- the seeded workspace with no WhatsApp number: a mailbox to send from and two messages with no WhatsApp
 *              version (a starter written as an email and a text, and an offer written as an email), and a saved list of
 *              three people who wrote by email. For the Library and the composers a workspace with no number draws, which
 *              the nightly's line hides. DERIVED from the nightly's record and from the starter registry, as they are.
 *   kit      -- no workspace of its own: the nightly's record, whose page is the kit's gallery
 *              (e2e-harness/kit-gallery.mjs) instead of the mockup, for e2e/kit/kit.spec.ts and for a person reviewing
 *              the kit. Never served in production (decision 7).
 *
 * Every cap comes from contracts (`PROFILE_LIMITS`, `MAX_CLOSURES`), so a cap that moves moves the record with it.
 */
import {
  MAX_CLOSURES,
  PROFILE_LIMITS,
  channelsReady,
  dealsAreOn,
  feedSourceLabel,
  zoneDayKey,
  isConsultationTitle,
  newReceptionistDefaults,
  proposalMessage,
  starterByName,
  starterEmailText,
  starterSmsText,
  starterText,
  versionComponents,
} from "@chanlytics/contracts";
import { NAME, SLUG, TIMEZONE, workspaceChannel, workspaceConfig } from "../ops/e2e-workspace.mjs";

/** The workspace the harness signs into. The id is the harness's own: nothing here reaches a database. */
export const WORKSPACE = { id: "t-e2e", slug: SLUG, name: NAME };
/** Who the harness signs in as: the server's session, the runner's address and the fixture's __ME are this one. */
export const OWNER = { id: "u-e2e-owner", name: "E2E Owner", email: "e2e-owner@example.com" };

export const SCENARIOS = ["nightly", "salon", "pipeline", "email-only", "kit"];

/** A postal address from the block kept for fiction: what a fictional business's profile holds, and an offer's foot names. */
const EXAMPLE_ADDRESS = "1200 Example Avenue, Brooklyn, NY 11208";

/** What the platform knows about a channel, as tenant_channels rows reach `resolveFacts` (contracts KnownFacts). */
const asKnownChannel = ({ kind, number_e164, status }) => ({ kind, number_e164, status });

/**
 * A template row as the table holds it, every column GET templates reads (readers/templates.ts COLUMNS): what a row leaves
 * alone is null, and its words are its one BODY unless it says otherwise. `templates-read.mjs` answers them as the route does.
 */
const templateRow = (o) => ({
  language: "en_US",
  category: null,
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "chanlytics",
  hidden_at: null,
  title: null,
  components: [{ type: "BODY", text: o.body_preview }],
  ...o,
});

/** A slot of a starter as a row carries it as a value: numbered from 1, with the label and the example a person sees. */
const valuesOf = (text) => text.slots.map((s, i) => ({ position: i + 1, label: s.label, example: s.example }));

/**
 * The workspace's approved WhatsApp messages, as the template library hands them over.
 *
 * Said by the scenario, because whether a workspace HAS an approved booking-link message decides what its
 * receptionist can do: a call sends the booking link as a template and can send none without one (contracts
 * `bookingTemplate`, and the openings row's ", then the link" clause). The fixture published one for every record,
 * so the seeded workspace -- whose seed writes no template row at all -- was shown a message it does not have.
 * It is the registry's own starter, in its words and values, filed the way the starter set files a WhatsApp version.
 */
const BOOKING_LINK_STARTER = starterByName("booking_link");
const BOOKING_LINK_WORDS = starterText(BOOKING_LINK_STARTER, "en_US");
const BOOKING_LINK_TEMPLATE = templateRow({
  id: "7e3a0000-0000-4000-8000-0000000000b1",
  channel: "whatsapp",
  name: BOOKING_LINK_STARTER.name,
  meta_status: "approved",
  category: BOOKING_LINK_STARTER.category,
  variables: valuesOf(BOOKING_LINK_WORDS),
  body_preview: BOOKING_LINK_WORDS.body,
});

/** A closure `n` days out, one day long. */
const closureAt = (nowMs, days, note) => ({
  date: new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10),
  note,
});

/**
 * The settings read's `version`. Nothing derives it: converge leaves whatever the row had, and the only thing that
 * reads it here is the spec's own before-and-after comparison, which needs it to be the same number twice.
 */
const VERSION = 1;

function nightly(name) {
  return {
    name,
    zone: TIMEZONE,
    // The whole config, not a brain taken out of it: the settings read hands over the row as it stands.
    config: workspaceConfig(),
    known: {
      workspace: { name: NAME, timezone: TIMEZONE },
      channels: [asKnownChannel(workspaceChannel())],
      listing: null,
    },
    // None: the seed writes no template row, so nothing drawn over this record may claim an approved message.
    templates: [],
    version: VERSION,
    role: "owner",
  };
}

/**
 * Languages to one short of the cap, whatever the cap is: the fold must offer a box to add one, and ONE add must
 * fill the list. Named ones while there are names to give, then numbered, so a cap that grows keeps both properties.
 */
const LANGUAGE_POOL = ["English", "Spanish", "Portuguese", "French", "Italian", "German", "Polish", "Dutch"];
const languagesToOneShortOfTheCap = () =>
  Array.from({ length: PROFILE_LIMITS.languages - 1 }, (_, i) => LANGUAGE_POOL[i] ?? `Language ${i + 1}`);

function salon(name, nowMs) {
  const BUSINESS = "Northside Studio";
  const day = { open: "09:30", close: "18:00" };
  return {
    name,
    zone: TIMEZONE,
    config: {
      brain: {
        business_name: BUSINESS,
        booking_link: "https://example.com/book/northside",
        ...newReceptionistDefaults(BUSINESS),
        profile: {
          address: EXAMPLE_ADDRESS,
          website: "https://example.com/northside",
          tone: "Warm and unhurried.",
          languages: languagesToOneShortOfTheCap(),
          hours: {
            mon: day,
            tue: day,
            wed: day,
            thu: day,
            fri: { open: "09:30", close: "19:00" },
            sat: { open: "10:00", close: "17:00" },
            sun: {},
          },
          // At the cap, so the closures fold offers no Add at all.
          closures: Array.from({ length: MAX_CLOSURES }, (_, i) =>
            closureAt(nowMs, i + 3, i === 0 ? "A public holiday" : `Closed ${i + 1}`),
          ),
          services: [
            { name: "The long one", duration_min: 180, price_note: "quoted at consult" },
            { name: "The quick one", duration_min: 45, price_note: "quoted at consult" },
            { name: "The one with a consult", duration_min: 240, price_note: "quoted at consult" },
            { name: "The evening one", duration_min: 60, price_note: "from $45" },
            { name: "The short one", duration_min: 30, price_note: "$35" },
          ],
          notes: [{ title: "Walk-ins", text: "Walk-ins are welcome; booking ahead is best for the long ones." }],
          escalate_when: ["They ask for the owner", "They are upset, or have a complaint"],
          booking_rules: {
            lead_hours: 2,
            slot_min: 30,
            max_days_ahead: 14,
            party_max: 4,
            consult_first: ["The one with a consult"],
          },
          guardrails: {
            never_quote_prices: true,
            never_confirm_booking: true,
            disclose_ai: true,
            no_health_advice: true,
          },
          handoff_number: "+12125550188",
        },
      },
      calendar: { ical_url: "https://example.com/calendar.ics" },
    },
    known: {
      workspace: { name: BUSINESS, timezone: TIMEZONE },
      channels: [
        { kind: "whatsapp", number_e164: "+12125550177", status: "active" },
        { kind: "voice", number_e164: "+12125550166", status: "active" },
      ],
      listing: null,
    },
    // Both lines AND the approved booking-link message, which is what lets this record's call send the link at all.
    templates: [BOOKING_LINK_TEMPLATE],
    version: VERSION,
    role: "owner",
  };
}

const DAY_MS = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
/** An id in the app's own shape, numbered: a person's route is a UUID (surface-registry.ts personRouteId), as every row's is. */
const uuidOf = (head, n) => `${head}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A message as the person read hands one over (contracts MessageDto): words on WhatsApp, or on the channel `via` names. */
const messageOf = (id, direction, body, at, via = "whatsapp") => ({
  id,
  direction,
  sender: direction === "inbound" ? "customer" : "human",
  channel: via,
  type: "text",
  body,
  media: null,
  meta: null,
  status: direction === "inbound" ? "received" : "read",
  created_at: at,
  channel_ts: at,
});

/**
 * A person's thread as the person read hands it over (contracts ConversationDto): how they first wrote, the proposal
 * sent to them where their deal has a link (in contracts proposalMessage's words, which the one-step send puts in the
 * composer), and the last thing they said. Their row's message columns are read off it, so the list and the page agree.
 * `via` is the channel they wrote on: WhatsApp's window is open only where they wrote there.
 */
function threadOf(who, firstMs, heardMs, said, deal, via = "whatsapp") {
  const m = (k, direction, body, at) => messageOf(uuidOf("3e550000", who.n * 10 + k), direction, body, at, via);
  const messages = [
    m(1, "inbound", "Hi! Are you taking on new projects this season?", iso(firstMs)),
    ...(deal?.proposal_url ? [m(2, "outbound", proposalMessage(deal.proposal_url), deal.proposed_at)] : []),
    m(3, "inbound", said, iso(heardMs)),
  ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return {
    id: uuidOf("c0a00000", who.n),
    state: "open",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    last_wa_inbound_at: via === "whatsapp" ? iso(heardMs) : null,
    last_message_at: messages.at(-1).created_at,
    contact: {
      id: who.id,
      display_name: who.name,
      wa_profile_name: null,
      phone_e164: who.phone,
      email: who.email,
      proposal_url: null,
      consent: "opted_in",
      dnc: false,
      marketing_consent: null,
    },
    messages,
  };
}

/** A deal as the person read hands it over (contracts DealDto). */
function dealOf(nowMs, n, stage, o = {}) {
  const proposed = nowMs - (o.proposedDays ?? 10) * DAY_MS;
  const decided = o.decidedDays === undefined ? null : iso(nowMs - o.decidedDays * DAY_MS);
  return {
    id: uuidOf("d5c0e000", n),
    contact_id: uuidOf("5c0e0000", n),
    service: o.service ?? "Brand identity",
    stage,
    proposed_at: iso(proposed),
    decided_at: decided,
    ended_at: null,
    amount_cents: o.cents ?? 240_000,
    per: o.per ?? "once",
    currency: "USD",
    note: null,
    version: 1,
    created_at: iso(proposed),
    proposal_url: o.url === undefined ? "https://example.com/proposals/harbor" : o.url,
    valid_until: o.validUntil ?? null,
    lost_reason: o.reason ?? null,
  };
}

/** The deal a People row carries, as people_list's lateral join does: its columns, every one null for someone with none. */
const DEAL_COLUMNS = [
  "id",
  "stage",
  "service",
  "proposed_at",
  "decided_at",
  "ended_at",
  "amount_cents",
  "per",
  "proposal_url",
  "valid_until",
  "lost_reason",
];
const dealColumns = (d) => Object.fromEntries(DEAL_COLUMNS.map((k) => [`deal_${k}`, d ? d[k] : null]));

/**
 * One row as GET contacts hands it over: people_list's columns in its order, every one on every row, then the reply
 * mode listPeople adds and the visits withVisits lays on it. The message columns are the thread's, on the channel `via`.
 */
function personRow(who, thread, deal, visits, step = null, via = "whatsapp") {
  const first = thread.messages[0];
  const last = thread.messages.at(-1);
  const said = thread.messages.filter((x) => x.direction === "inbound").at(-1);
  return {
    id: who.id,
    display_name: who.name,
    wa_profile_name: null,
    phone_e164: who.phone,
    email: who.email,
    consent: "opted_in",
    consent_source: "in_person",
    consent_updated_at: first.created_at,
    dnc: false,
    marketing_consent: null,
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    channels: [via],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: thread.id,
    latest_state: thread.state,
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: thread.last_wa_inbound_at,
    last_message_at: last.created_at,
    last_message_direction: last.direction,
    last_message_sender: last.sender,
    last_inbound_text: said.body,
    last_inbound_at: said.created_at,
    last_call_at: null,
    last_inbound_call_at: null,
    last_inbound_call_summary: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: first.created_at,
    earliest_row_at: first.created_at,
    has_backfill: false,
    has_chat: true,
    message_channels: [via],
    queued_reply_at: null,
    came_from: via,
    ...dealColumns(deal),
    // Their next step (00166): the earliest open note with a day, every column null for someone with none.
    step_id: step?.id ?? null,
    step_body: step?.body ?? null,
    step_due_on: step?.due_on ?? null,
    step_for_user_id: step?.for_user_id ?? null,
    step_deal_id: step?.deal_id ?? null,
    effective_reply_mode: "auto",
    visits,
  };
}

/** An appointment as the server reads one off the calendar's feed (contracts VisitDto), matched by the number. */
const visitAt = (n, startMs, title) => ({
  id: `v-${n}-${startMs}`,
  start: iso(startMs),
  end: iso(startMs + 3_600_000),
  title,
  all_day: false,
  via: "phone",
});

function pipeline(name, nowMs) {
  const base = salon(name, nowMs);
  const BUSINESS = "Harbor Creative";
  const SERVICES = ["Brand identity", "Website", "Ad management"];
  // How its customers buy (tenants.sells_by, 00160): by proposal, so deals are on wherever the app asks.
  const SELLS_BY = "proposal";
  const profile = {
    ...base.config.brain.profile,
    services: SERVICES.map((s) => ({ name: s, duration_min: 60, price_note: "quoted after a consultation" })),
    booking_rules: { ...base.config.brain.profile.booking_rules, consult_first: ["Brand identity"] },
  };
  const config = { ...base.config, brain: { ...base.config.brain, business_name: BUSINESS, profile } };
  // The salon's calendar feed, read, and named as the server names a feed: from its address alone.
  const calendar = { state: "ok", source: feedSourceLabel(config.calendar?.ical_url), timezone: TIMEZONE };
  const feed = { timezone: calendar.timezone, source: calendar.source, state: "ok" };
  // Which visit is a consultation, as withVisits marks the list's: its title says so, or names a consult-first service.
  const marked = (v) =>
    v && { ...v, consultation: isConsultationTitle(v.title, profile.services, profile.booking_rules) };
  const at = (days, hour = 10) => {
    const d = new Date(nowMs + days * DAY_MS);
    d.setUTCHours(hour + 4, 0, 0, 0);
    return d.getTime();
  };
  // Each with the deal their row shows, the one their person read lists.
  const cast = [
    { n: 1, name: "Maren Holt", last: visitAt(1, at(-2), "Consultation · Brand identity") },
    { n: 2, name: "Idris Kane", next: visitAt(2, at(2, 14), "Consultation") },
    { n: 3, name: "Sol Ferreira", deal: dealOf(nowMs, 3, "proposed", { proposedDays: 11 }), heardDays: 14 },
    {
      n: 4,
      name: "Tove Lind",
      deal: dealOf(nowMs, 4, "proposed", { proposedDays: 5, service: "Website", cents: 480_000 }),
      heardDays: 1,
      said: "Thanks, looking it over. One question on the timeline",
      // A step on her deal, due in two days: the person page's notes and her deal card say it.
      step: { body: "Call about the timeline", inDays: 2 },
    },
    {
      n: 5,
      name: "Ravi Menon",
      deal: dealOf(nowMs, 5, "proposed", { proposedDays: 2, service: "Ad management", cents: 150_000, per: "month" }),
    },
    {
      n: 6,
      name: "Juno Park",
      deal: dealOf(nowMs, 6, "won", {
        proposedDays: 30,
        decidedDays: 20,
        service: "Ad management",
        cents: 150_000,
        per: "month",
      }),
    },
    { n: 7, name: "Ada Brennan", deal: dealOf(nowMs, 7, "won", { proposedDays: 60, decidedDays: 45, cents: 320_000 }) },
    { n: 8, name: "Nico Varga", deal: dealOf(nowMs, 8, "lost", { proposedDays: 20, decidedDays: 9, reason: "price" }) },
  ];
  const people = [];
  const details = {};
  for (const c of cast) {
    // A number from the block kept for fiction (555-0100 to 0199), as the salon's are.
    const who = {
      n: c.n,
      id: uuidOf("5c0e0000", c.n),
      name: c.name,
      phone: `+1212555${String(100 + c.n).padStart(4, "0")}`,
      email: `${c.name.split(" ")[0].toLowerCase()}@example.com`,
    };
    const heardMs = nowMs - (c.heardDays ?? 3) * DAY_MS;
    const thread = threadOf(who, nowMs - 90 * DAY_MS, heardMs, c.said ?? "Sounds good, talk soon", c.deal);
    const next = c.next ?? null;
    const last = c.last ?? null;
    // A step as the person read lists a note (contracts PersonNoteDto), written by the one signed in.
    const step = c.step
      ? {
          id: uuidOf("a0e5f000", c.n),
          body: c.step.body,
          author_kind: "member",
          author_name: OWNER.name,
          mine: true,
          for_user_id: null,
          for_name: null,
          for_me: false,
          team_only: true,
          state: "kept",
          source: "page",
          version: 1,
          created_at: iso(nowMs - DAY_MS),
          updated_at: iso(nowMs - DAY_MS),
          due_on: zoneDayKey(nowMs + c.step.inDays * DAY_MS, TIMEZONE),
          done_at: null,
          done_by_name: null,
          done_by_me: false,
          deal_id: c.deal?.id ?? null,
        }
      : null;
    const row = personRow(who, thread, c.deal ?? null, { ...feed, next: marked(next), last: marked(last) }, step);
    people.push(row);
    // The person read as GET contacts/:id composes it (contracts PersonDetailDto), their notes and the team with it.
    details[row.id] = {
      row,
      identities: [{ channel: "whatsapp", external_id: who.phone.slice(1), created_at: row.first_contact_at }],
      conversations: [thread],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
      // The feed's own visits, unmarked, as personVisits reads them, with every one of theirs for the timeline.
      visits: { ...feed, next, last, all: [last, next].filter(Boolean) },
      notes: null,
      person_notes: step ? [step] : [],
      // The team a note can be for: the one signed in, as the notes read names them.
      note_team: [{ id: OWNER.id, name: OWNER.name, me: true }],
      proposal_url: null,
      booking_link: config.brain.booking_link?.trim() || null,
      consent_history: [],
      campaigns: [],
      lead: null,
      deals: c.deal ? [c.deal] : [],
      deals_on: dealsAreOn(SELLS_BY),
      services: SERVICES,
      consult_first: [...profile.booking_rules.consult_first],
    };
  }
  return {
    ...base,
    config,
    known: { ...base.known, workspace: { name: BUSINESS, timezone: TIMEZONE } },
    // How GET contacts answers: every person on the first page, and the calendar they were read against.
    people,
    details,
    calendar,
    sellsBy: SELLS_BY,
  };
}

/**
 * The messages of a workspace with no WhatsApp number, as the library files a message with no WhatsApp version
 * (00296 save_template_version, 00342 create_message_version): a starter written as an email and a text, and an offer
 * written as an email alone, since a text never carries one.
 *
 * The starter is the registry's "How did it go", whose category is utility, so a text may carry it, and whose slots are
 * the ones a broadcast and a playbook can fill: its name, category, values and words are the registry's, so a change to
 * the set changes this record. The offer is a custom message, which is always an offer (design Section 0, Q1), with a title
 * of its own and one value.
 */
function emailOnlyTemplates() {
  const starter = starterByName("after_visit_check");
  const email = starter && starterEmailText(starter, "en_US");
  const text = starter && starterSmsText(starter, "en_US");
  if (!starter || !email || !text) throw new Error("the starter set has no after_visit_check with an email and a text");
  const values = valuesOf(starterText(starter, "en_US"));
  const filed = (n, channel, name, words, filing) =>
    templateRow({
      id: uuidOf("7e3a0000", n),
      channel,
      name,
      meta_status: "approved",
      body_preview: words.body,
      components: versionComponents(channel, words),
      ...filing,
    });
  const offer = {
    subject: "Spring is here",
    body: "Hi {{1}}, we are open late on Thursdays this spring. Reply to this email to book.",
  };
  return [
    filed(1, "email", starter.name, email, { category: starter.category, variables: values }),
    filed(
      2,
      "sms",
      starter.name,
      { subject: null, body: text.body },
      { category: starter.category, variables: values },
    ),
    filed(3, "email", "spring_offer", offer, {
      category: "marketing",
      variables: [{ position: 1, label: "First name", example: "Dani" }],
      title: "Spring offer",
    }),
  ];
}

/**
 * The seeded workspace with no WhatsApp number. Its config, its clock and its name are the nightly's, which is derived from
 * the seed; what it lacks is the line the seed provisions, and what it has is a mailbox the campaigns can send from and the
 * postal address every offer's foot names (so its news by email can go: contracts channelsReady, with no WhatsApp number and
 * no text line), two messages with no WhatsApp version, and three people who wrote by email, each with an address and no
 * phone, on a saved list.
 *
 * That is what lets the Library, the broadcast composer and the playbook composer be read on a workspace whose messages
 * need no WhatsApp row. The people are in people_list's row shape, so People over this record reads as it does over the
 * pipeline's; a person's own page is not served, so no `details`.
 */
function emailOnly(name, nowMs) {
  const base = nightly(name);
  const cast = [
    { n: 1, name: "Nora Quill" },
    { n: 2, name: "Teo Marsh" },
    { n: 3, name: "Ines Vale" },
  ];
  const people = cast.map((c) => {
    const who = {
      n: c.n,
      id: uuidOf("5c0e0000", c.n),
      name: c.name,
      phone: null,
      email: `${c.name.split(" ")[0].toLowerCase()}@example.com`,
    };
    const thread = threadOf(who, nowMs - 60 * DAY_MS, nowMs - 3 * DAY_MS, "Sounds good, talk soon", undefined, "email");
    return personRow(who, thread, null, null, null, "email");
  });
  return {
    ...base,
    config: { ...base.config, brain: { ...base.config.brain, profile: { address: EXAMPLE_ADDRESS } } },
    // No WhatsApp line: the seed's is the only channel the nightly has.
    known: { ...base.known, channels: [] },
    templates: emailOnlyTemplates(),
    ready: channelsReady({
      whatsapp: null,
      textLine: null,
      email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
    }),
    people,
    lists: [
      {
        id: uuidOf("11570000", 1),
        name: "Spring regulars",
        ids: people.map((p) => p.id),
        rule: null,
        archived_at: null,
      },
    ],
  };
}

/** One scenario, built now. Plain data, so the server can hand the page the very object it answers reads from. */
export function scenario(name, nowMs = Date.now()) {
  const record =
    name === "nightly"
      ? nightly(name)
      : name === "salon"
        ? salon(name, nowMs)
        : name === "pipeline"
          ? pipeline(name, nowMs)
          : name === "email-only"
            ? emailOnly(name, nowMs)
            : name === "kit"
              ? { ...nightly(name), gallery: true }
              : null;
  if (!record) throw new Error(`no scenario "${name}": ${SCENARIOS.join(", ")}`);
  return { ...record, notifications: bellNotes(nowMs) };
}

/**
 * The bell's kept rows, as GET notifications hands them over (contracts NotificationDto), for every record: what a
 * morning's bell holds -- a run of calls, two searches done, a job the runner wrote in its old words (a uuid and all),
 * a customer named by their number, a rating -- so the phone's bell specs have rows to measure (25 Sep). Made-up
 * numbers, as every fixture's are.
 */
function bellNotes(nowMs) {
  const at = (h) => new Date(nowMs - h * 3_600_000).toISOString();
  const note = (id, kind, title, body, route, h, about = null) => ({
    id,
    kind,
    title,
    body,
    route,
    subject_type: about ? about.type : null,
    subject_id: about ? about.id : null,
    created_at: at(h),
    read: false,
    dismissed: false,
  });
  return [
    note("hx-n1", "call", "+1 (555) 010-0101 phoned · 12 s", "No conversation happened.", "conversations/phone", 1),
    note("hx-n2", "leads_ready", "Your search for florists is done", "31 found.", "clients/leads", 2),
    note("hx-n3", "call", "+1 (555) 010-0102 phoned · 3 min", "Asked about Saturday.", "conversations/phone", 3),
    note(
      "hx-n4",
      "job_failed",
      "A lead_collect job failed",
      "Job 00000000-0000-4000-8000-000000000001 (lead_collect) failed and will not retry on its own.\n\nboom",
      "inbox",
      4,
    ),
    note("hx-n5", "leads_ready", "Your search for bakeries is done", "7 found.", "clients/leads", 5),
    note("hx-n6", "call", "+1 (555) 010-0103 phoned · 1 min", "Booked a visit.", "conversations/phone", 6),
    note("hx-n7", "handoff", "WhatsApp handoff needed: +15550100104", "Asked for a discount.", "inbox", 7),
    note("hx-n8", "review", "1 new rating on Google", "Five stars.", "reports", 30),
  ];
}
