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
 *   salon    -- a fuller record, for the branches the nightly's data cannot reach: a week of hours, closures AT the
 *              cap, services, and one language short of the cap so a single Add fills it. A FICTIONAL business: this
 *              file is committed, and no real business's name, address, number or link belongs in the tree.
 *
 * Every cap comes from contracts (`PROFILE_LIMITS`, `MAX_CLOSURES`), so a cap that moves moves the record with it.
 */
import { MAX_CLOSURES, PROFILE_LIMITS, newReceptionistDefaults } from "@chanlytics/contracts";
import { NAME, SLUG, TIMEZONE, workspaceChannel, workspaceConfig } from "../e2e-workspace.mjs";

/** The workspace the harness signs into. The id is the harness's own: nothing here reaches a database. */
export const WORKSPACE = { id: "t-e2e", slug: SLUG, name: NAME };

export const SCENARIOS = ["nightly", "salon"];

/** What the platform knows about a channel, as tenant_channels rows reach `resolveFacts` (contracts KnownFacts). */
const asKnownChannel = ({ kind, number_e164, status }) => ({ kind, number_e164, status });

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
    version: VERSION,
    role: "owner",
  };
}

/** One scenario, built now. Plain data, so the server can hand the page the very object it answers reads from. */
export function scenario(name, nowMs = Date.now()) {
  if (name === "nightly") return nightly(name);
  if (name === "salon") return salon(name, nowMs);
  throw new Error(`no scenario "${name}": ${SCENARIOS.join(", ")}`);
}
