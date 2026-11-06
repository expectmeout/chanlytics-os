/**
 * The rows the table's goldens are recorded over (decision 0083, step 1): People's and Leads' rows with every case their
 * orders and narrowings turn on — ties, accents, house numbers, a name that is only a number or an address, missing
 * contacts, visits, steps and deals; leads of every fit, left-out reason and reach. The goldens were recorded from the
 * engine that left (`goldens/*.json`); the table that replaced it is held to them.
 *
 * People's rows carry exactly what the sorts, the state tabs and the box's words read of a person's row, and nothing a
 * cell draws: both the old engine and the new one read these fields alone. Made-up people: every number is 555-01xx.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/** A person's row as the table's order and filters read it. */
const person = (id, name, over = {}) => ({
  id,
  name,
  waName: null,
  email: null,
  phone: null,
  quote: null,
  nextVisit: null,
  lastVisit: null,
  deal: null,
  openDeals: [],
  worksAt: null,
  state: "active",
  lastContact: { ts: null },
  consent: { marketing: "unknown" },
  calls: 0,
  nextVisitMs: null,
  lastVisitMs: null,
  firstContact: { ts: null },
  nextStep: null,
  ...over,
});

const step = (day) => ({ day: { day } });

export const PEOPLE = [
  person("p01", "Ada Example", {
    lastContact: { ts: 100 },
    consent: { marketing: "opted_in" },
    calls: 2,
    nextVisitMs: 5000,
    nextVisit: "Tue 3 Nov",
    firstContact: { ts: 10 },
    nextStep: step("2026-11-03"),
    deal: { service: "Cut", stage: "won" },
  }),
  person("p02", "Élodie Martin", {
    state: "needs_you",
    lastContact: { ts: 300 },
    firstContact: { ts: 5 },
    quote: "Can I move Saturday to 11?",
  }),
  person("p03", "Elodie Arnaud", {
    state: "quiet",
    lastContact: { ts: 300 },
    consent: { marketing: "opted_out" },
    calls: 5,
    lastVisitMs: 2000,
    lastVisit: "Mon 12 Oct",
    nextStep: step("2026-11-01"),
    openDeals: [
      { service: "Colour", stage: "proposed" },
      { service: "Trim", stage: "consultation" },
    ],
  }),
  person("p04", "+1 (555) 010-0123", { state: "new", lastContact: { ts: 50 }, calls: 1, phone: "+15550100123" }),
  person("p05", "house 10 Salon", {
    consent: { marketing: "opted_in" },
    calls: 3,
    nextVisitMs: 3000,
    firstContact: { ts: 20 },
    deal: { service: "Lease", stage: "lost" },
    worksAt: { name: "Salon Example", gone: false },
  }),
  person("p06", "house 2 Salon", {
    lastContact: { ts: 200 },
    consent: { marketing: "opted_in" },
    calls: 3,
    firstContact: { ts: 20 },
    nextStep: step("2026-11-03"),
  }),
  person("p07", "bo example", { state: "waiting_on_you", lastContact: { ts: 250 }, email: "bo@example.com" }),
  person("p08", "Cy Example", {
    state: "opted_out",
    lastContact: { ts: 120 },
    consent: { marketing: "opted_out" },
    calls: 9,
    lastVisitMs: 4000,
    deal: { service: "Consult", stage: "consultation" },
  }),
  person("p09", "dani@example.com", { state: "quiet", lastContact: { ts: 10 }, email: "dani@example.com" }),
  person("p10", "Zed Example", { state: "unheard" }),
  person("p11", "Ann Smith", {
    lastContact: { ts: 400 },
    consent: { marketing: "opted_in" },
    calls: 1,
    nextVisitMs: 1000,
    openDeals: [{ service: "Cut", stage: "won" }],
    waName: "Annie",
  }),
  person("p12", "ann smith", { lastContact: { ts: 400 }, consent: { marketing: "opted_in" }, phone: "+15550100155" }),
  person("p13", "Dee Example", { state: "needs_you", lastContact: { ts: 400 }, nextStep: step("2026-10-30") }),
];

/** A person the server's search found past the loaded page, merged after them (plWithFound). */
export const PEOPLE_FOUND = [person("p14", "Found Example", { state: "quiet", lastContact: { ts: 500 } })];

export const PEOPLE_SORTS = ["name", "state", "next", "last", "visits", "offers", "since", "calls", "deal", "nope"];
export const PEOPLE_TABS = ["all", "active", "quiet", "needs_you"];
export const PEOPLE_LIST_IDS = ["p01", "p03", "p05", "p07", "p11", "p13"];
export const PEOPLE_WORDS = ["", "example", "salon", "555", "ann", "colour"];

/* --------------------------------------------------------------- leads -- */

/** A page row of Leads (`LeadRowDto`), as contracts' toLeadRowVM takes it. */
export const leadDto = (id, over = {}) => ({
  id,
  search_id: "5e000000-0000-4000-8000-000000000001",
  search_name: "Personal trainers · Austin",
  place_id: `ChIJfixture${id}`,
  business_name: "Zilker Strength Lab",
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  street: "1200 Barton Springs Rd",
  postal_code: "78704",
  phone: "+15125550101",
  phone_agrees: true,
  phone_wrong: false,
  email: "hello@zilkerstrength.example",
  email_state: "ok",
  email_checked_at: "2026-09-18T19:15:00.000Z",
  website: "zilkerstrength.example",
  instagram: null,
  rating: 5,
  reviews: 16,
  stage: "ready",
  closed_reason: null,
  contact_id: null,
  last_outcome: null,
  last_note: null,
  contacted_at: null,
  converted_at: null,
  places: 1,
  found_at: "2026-09-18T19:14:00.000Z",
  exported_at: null,
  version: 1,
  ...over,
  member: {
    class: "qualified",
    fit: "strong",
    reason: "Independent studio, one location, coaching only",
    excluded_by: null,
    distance_m: 1931,
    counted: true,
    checks: [],
    other_emails: [],
    ...(over.member || {}),
  },
});

const fit = (f) => ({ member: { fit: f } });
const out = (key) => ({ member: { class: "excluded", fit: null, excluded_by: key } });

/** In the order the server answered them: the narrowing keeps it. */
export const LEAD_ROWS = [
  leadDto("l01"),
  leadDto("l02", { business_name: "Barton Springs Boxing", email_state: "catch_all", ...fit("look") }),
  leadDto("l03", { business_name: "Bouldin Barre", phone_agrees: false, category: "Barre studio", ...fit("long") }),
  leadDto("l04", { business_name: "Chain Gym Austin", category: "Gym", ...out("chains") }),
  leadDto("l05", { business_name: "Round Rock Fitness", city: "Round Rock", ...out("too_far") }),
  leadDto("l06", {
    business_name: "Pilates Studio East",
    category: "Pilates studio",
    phone: null,
    phone_agrees: false,
  }),
  leadDto("l07", { business_name: "Mueller Movement", email: null, email_state: "none", ...fit("look") }),
  leadDto("l08", {
    business_name: "Hyde Park Yoga",
    phone_wrong: true,
    email_state: "invalid",
    category: "Yoga studio",
  }),
  leadDto("l09", { business_name: "Clarksville Coaching", email_state: "checking", ...fit("long") }),
  leadDto("l10", { business_name: "Tarrytown Trainers", email_state: "unknown", ...out("chains") }),
  leadDto("l11", { business_name: "Studio 6 Austin", category: "Personal trainer", ...fit("strong") }),
  leadDto("l12", { business_name: "Zilker Studio Two", ...fit("look") }),
];

export const LEAD_WORDS = ["", "studio", "austin", "zilker", "round rock"];
/** The chips say the reason in words, as the row holds it (toLeadRowVM `excludedBy`) and the page's chips name it. */
export const LEAD_CHIPS = [null, "Chains", "Too far"];
export const LEAD_FITS = [null, "strong", "look", "long"];
export const LEAD_REACH = [[], ["email"], ["phone"], ["email", "phone"]];
