/**
 * The records the local harness shows a signed-in spec, and the one place each is spelled.
 *
 * The server answers the spec's own `/api/v1/settings` read from a scenario, and the page's fixture publishes the
 * tab's globals from the SAME scenario object (the server injects it into the bundle), so the spec and the page
 * cannot disagree the way two hand-built copies would.
 *
 *   nightly -- the seeded `chanlytics-e2e` workspace, DERIVED from tooling/scripts/e2e-workspace.mjs rather than
 *              copied: the WHOLE config that converge writes (its notifications included, so what the read hands
 *              over is what the nightly's row holds), the line it provisions and the clock it sets. When the seed
 *              changes, this changes with it, which is the whole reason it imports rather than restates. No profile
 *              at all, which is what makes it the record the committed spec must pass on -- every list is empty and
 *              every fold opens on nothing.
 *   pipeline -- a studio that sends proposals (deals on, 0008) with People REAL over it: eight people across the
 *              Pipeline's four groups, in people_list's row shape and the person read's own, so e2e/people.spec.ts's
 *              Pipeline walk runs here -- the list, the peek, the person's page. Fictional, as the salon is.
 *   salon    -- a fuller record, for the branches the nightly's data cannot reach: a week of hours, closures AT the
 *              cap, services, and one language short of the cap so a single Add fills it. A FICTIONAL business: this
 *              file is committed, and no real business's name, address, number or link belongs in the tree.
 *
 * Every cap comes from contracts (`PROFILE_LIMITS`, `MAX_CLOSURES`), so a cap that moves moves the record with it.
 */
import { MAX_CLOSURES, PROFILE_LIMITS, dealsAreOn, newReceptionistDefaults } from "@chanlytics/contracts";
import { NAME, SLUG, TIMEZONE, workspaceChannel, workspaceConfig } from "../e2e-workspace.mjs";

/** The workspace the harness signs into. The id is the harness's own: nothing here reaches a database. */
export const WORKSPACE = { id: "t-e2e", slug: SLUG, name: NAME };

export const SCENARIOS = ["nightly", "salon", "pipeline"];

/** What the platform knows about a channel, as tenant_channels rows reach `resolveFacts` (contracts KnownFacts). */
const asKnownChannel = ({ kind, number_e164, status }) => ({ kind, number_e164, status });

/**
 * The workspace's approved WhatsApp messages, as the template library hands them over.
 *
 * Said by the scenario, because whether a workspace HAS an approved booking-link message decides what its
 * receptionist can do: a call sends the booking link as a template and can send none without one (contracts
 * `bookingTemplate`, and the openings row's ", then the link" clause). The fixture published one for every record,
 * so the seeded workspace -- whose seed writes no template row at all -- was shown a message it does not have.
 */
const BOOKING_LINK_TEMPLATE = {
  name: "booking_link",
  language: "en_US",
  meta_status: "approved",
  channel: "whatsapp",
  variables: [{ position: 1 }, { position: 2 }, { position: 3 }],
};

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
          address: "1200 Example Avenue, Brooklyn, NY 11208",
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
/** A person's id as the app routes one (surface-registry.ts personRouteId: a UUID). */
const personId = (n) => `5c0e0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** One row as people_list hands it over (contracts PersonRowDto): WhatsApp, a yes on record, and what they last said. */
function personRow(nowMs, n, name, over = {}) {
  const heard = nowMs - (over.heardDays ?? 3) * DAY_MS;
  return {
    id: personId(n),
    display_name: name,
    wa_profile_name: null,
    phone_e164: `+1212555${String(1000 + n).slice(-4)}`,
    email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    came_from: "whatsapp",
    consent: "opted_in",
    consent_source: "in_person",
    consent_updated_at: iso(nowMs - 60 * DAY_MS),
    marketing_consent: null,
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: `cv-${n}`,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: iso(heard),
    last_message_at: iso(heard),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: over.said ?? "Thanks, looking it over",
    last_inbound_at: iso(heard),
    last_call_at: null,
    last_inbound_call_at: null,
    last_inbound_call_summary: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: iso(nowMs - 90 * DAY_MS),
    earliest_row_at: iso(nowMs - 90 * DAY_MS),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    effective_reply_mode: "auto",
    visits: over.visits ?? null,
    ...(over.deal ? dealColumns(over.deal) : {}),
  };
}

/** A deal as the person read hands it over (contracts DealDto). */
function dealOf(nowMs, n, stage, o = {}) {
  const proposed = nowMs - (o.proposedDays ?? 10) * DAY_MS;
  const decided = o.decidedDays === undefined ? null : iso(nowMs - o.decidedDays * DAY_MS);
  return {
    id: `d5c0e000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    contact_id: personId(n),
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

/** The same deal as a People row's columns carry it (people_list's lateral join). */
const dealColumns = (d) => ({
  deal_id: d.id,
  deal_stage: d.stage,
  deal_service: d.service,
  deal_proposed_at: d.proposed_at,
  deal_decided_at: d.decided_at,
  deal_ended_at: d.ended_at,
  deal_amount_cents: d.amount_cents,
  deal_per: d.per,
  deal_proposal_url: d.proposal_url,
  deal_valid_until: d.valid_until,
  deal_lost_reason: d.lost_reason,
});

/** A consultation on the calendar, as withVisits puts one on a row. */
const consultation = (startMs) => ({
  id: `v-${startMs}`,
  start: iso(startMs),
  end: iso(startMs + 3_600_000),
  title: "Consultation",
  all_day: false,
  via: "phone",
  consultation: true,
});
const visitsOf = (next, last) => ({ timezone: TIMEZONE, source: "your calendar", state: "ok", next, last });

function pipeline(name, nowMs) {
  const base = salon(name, nowMs);
  const BUSINESS = "Harbor Creative";
  const SERVICES = ["Brand identity", "Website", "Ad management"];
  const at = (days, hour = 10) => {
    const d = new Date(nowMs + days * DAY_MS);
    d.setUTCHours(hour + 4, 0, 0, 0);
    return d.getTime();
  };
  // Each with the deal their row shows, the one their person read lists.
  const cast = [
    { n: 1, name: "Maren Holt", visits: visitsOf(null, consultation(at(-2))) },
    { n: 2, name: "Idris Kane", visits: visitsOf(consultation(at(2, 14)), null) },
    { n: 3, name: "Sol Ferreira", deal: dealOf(nowMs, 3, "proposed", { proposedDays: 11 }), heardDays: 14 },
    {
      n: 4,
      name: "Tove Lind",
      deal: dealOf(nowMs, 4, "proposed", { proposedDays: 5, service: "Website", cents: 480_000 }),
      heardDays: 1,
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
  // How its customers buy (tenants.sells_by, 00160): by proposal, so deals are on wherever the app asks.
  const SELLS_BY = "proposal";
  const people = cast.map((c) => personRow(nowMs, c.n, c.name, c));
  const details = Object.fromEntries(
    cast.map((c, i) => [
      people[i].id,
      {
        row: people[i],
        identities: [],
        conversations: [],
        calls: [],
        escalations: [],
        decisions: [],
        receptionist_mode: null,
        workspace_reply_mode: "auto",
        deals: c.deal ? [c.deal] : [],
        deals_on: dealsAreOn(SELLS_BY),
        services: SERVICES,
        consult_first: ["Brand identity"],
        visits: c.visits ?? null,
      },
    ]),
  );
  return {
    ...base,
    config: {
      ...base.config,
      brain: {
        ...base.config.brain,
        business_name: BUSINESS,
        profile: {
          ...base.config.brain.profile,
          services: SERVICES.map((s) => ({ name: s, duration_min: 60, price_note: "quoted after a consultation" })),
          booking_rules: { ...base.config.brain.profile.booking_rules, consult_first: ["Brand identity"] },
        },
      },
    },
    known: { ...base.known, workspace: { name: BUSINESS, timezone: TIMEZONE } },
    // How GET contacts answers: every person on the first page, and the calendar connected.
    people,
    details,
    calendar: { state: "ok", source: "Google Calendar" },
    sellsBy: SELLS_BY,
  };
}

/** One scenario, built now. Plain data, so the server can hand the page the very object it answers reads from. */
export function scenario(name, nowMs = Date.now()) {
  if (name === "nightly") return nightly(name);
  if (name === "salon") return salon(name, nowMs);
  if (name === "pipeline") return pipeline(name, nowMs);
  throw new Error(`no scenario "${name}": ${SCENARIOS.join(", ")}`);
}
