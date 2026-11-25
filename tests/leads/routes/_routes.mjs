/**
 * The world the tests of routes/ share. Split by behaviour from lead-routes.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The lead finder's routes, run through route(): the real route modules,
 * their `run` called with a database in memory and the doors faked. What is
 * proved is the policy each declares, the estimate the route computes, the
 * door's refusals said as sentences, and who is refused before anything
 * reaches a door.
 */
import { beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));

export const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));

export const searches = await import(at("apps/dashboard/app/api/v1/lead-searches/route.ts"));

export const search = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/route.ts"));

export const answerRoute = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/answer/route.ts"));

export const more = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/more/route.ts"));

export const stop = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/stop/route.ts"));

export const leads = await import(at("apps/dashboard/app/api/v1/leads/route.ts"));

export const keep = await import(at("apps/dashboard/app/api/v1/leads/[id]/keep/route.ts"));

export const exclude = await import(at("apps/dashboard/app/api/v1/leads/[id]/exclude/route.ts"));

export const putBack = await import(at("apps/dashboard/app/api/v1/leads/[id]/put-back/route.ts"));

export const undo = await import(at("apps/dashboard/app/api/v1/lead-operations/[id]/undo/route.ts"));

// Release B's ten.
export const searchUndo = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/undo/route.ts"));

export const stage = await import(at("apps/dashboard/app/api/v1/leads/[id]/stage/route.ts"));

export const draft = await import(at("apps/dashboard/app/api/v1/leads/[id]/draft/route.ts"));

export const erase = await import(at("apps/dashboard/app/api/v1/leads/[id]/route.ts"));

export const bulk = await import(at("apps/dashboard/app/api/v1/leads/bulk/route.ts"));

export const checkAgain = await import(at("apps/dashboard/app/api/v1/leads/check-again/route.ts"));

export const exportRoute = await import(at("apps/dashboard/app/api/v1/leads/export/route.ts"));

export const suggestions = await import(at("apps/dashboard/app/api/v1/lead-suggestions/route.ts"));

export const askIdea = await import(at("apps/dashboard/app/api/v1/ask/idea/route.ts"));

export const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));

export const { GatewayRefused } = await import(at("apps/dashboard/src/server/shared/model/gateway.ts"));

export const { planFacts } = await import(at("apps/dashboard/src/server/leads/leads.ts"));

// A by-hand sequence's mailto: is the reach-out's compose module's (00429): one helper, not two.
export const { mailtoOf: leadMailto } = await import(at("packages/contracts/src/campaigns/reach-out/owner/compose.ts"));

export const { setSuggestionsWriter } = await import(at("apps/dashboard/src/server/leads/suggestions.ts"));

export const { load, readerContext } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

export const { lead: leadReader, leads: leadsReader } = await import(at("apps/dashboard/src/server/readers/leads.ts"));

export const { search: searchReader, searches: searchesReader } = await import(
  at("apps/dashboard/src/server/readers/searches.ts")
);

export const { toSearchDto } = await import(at("apps/dashboard/src/server/leads/searches.ts"));

export const { runTool, newToolContext, READ_DEFS } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => setRateStore(memoryStore()));

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

export const R1 = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";

export const L1 = "cccccccc-1111-4111-8111-cccccccccccc";

export const O1 = "dddddddd-1111-4111-8111-dddddddddddd";

export const USER = "u1";

export const inA = `?workspace=${A}`;

export const member = (role) => [
  { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
];

export const paying = [{ tenant_id: A, mode: "direct", status: "active" }];

export const view = (over = {}) => ({
  id: S1,
  tenant_id: A,
  name: "Trainers",
  asked: "",
  via: "people",
  plan: PLAN,
  removed_at: null,
  created_at: "2026-09-19T00:00:00Z",
  round_id: R1,
  seq: 1,
  purpose: "probe",
  state: "waiting_on_owner",
  ending: null,
  question: { sentence: "…", criterionKey: "chains", dropTerm: null, asked_at: "2026-09-19T00:00:00Z" },
  answered: null,
  target: 20,
  plan_version: 1,
  qualified: 12,
  review: 0,
  excluded: 13,
  counted: 12,
  judge_tokens: 900,
  ending_pending: null,
  waiting_since: null,
  ended_at: null,
  emails_checked: 0,
  with_phone: 0,
  undo_op_id: null,
  undo_version: null,
  ...over,
});

export const ctxFor = (role, rpcs = {}, params = {}, tables = {}) => ({
  supabase: fakeDb(
    { memberships: member(role), billing_accounts: paying, lead_searches_view: [view()], ...tables },
    {},
    rpcs,
  ),
  userId: USER,
  email: "ada@example.com",
  // Past the second factor (0013, M3): a partner's seat asks for it; second-factor.test.mjs proves the refusal.
  aal: "aal2",
  params,
});

export const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);

export const send = (body, q = inA) =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export async function refused(p, code, status) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}

/* ------------------------------------------------- release B's ten routes */
/**
 * B's cases build a whole workspace (`world`) and hand it to `ctxOf`, the way
 * people-routes.test.mjs does, because a row-scoped route resolves its member
 * from the row it loaded: the lead, the search and the membership must agree
 * or the role is judged in the wrong workspace. The model is a fake stream, so
 * a draft and the first day's suggestions are exercised without a key.
 */
export const LEAD = "cccccccc-2222-4222-8222-cccccccccccc";

export const SEARCH = S1;

export const OP = "dddddddd-2222-4222-8222-dddddddddddd";

export const CONTACT = "eeeeeeee-2222-4222-8222-eeeeeeeeeeee";

export const NAME = "Travis Heights Coaching Co.";

export const ctxOf = (tables, params = {}, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  // Past the second factor (0013, M3): a partner's seat asks for it; second-factor.test.mjs proves the refusal.
  aal: "aal2",
  params,
});

export const req = (method, body, q = inA) =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** One workspace with one search, one lead and one membership, in the real shape. */
export function world(over = {}) {
  const role = over.role ?? "owner";
  const address = over.address === undefined ? "1 Main St, Austin, TX 78704" : over.address;
  return {
    memberships: member(role),
    billing_accounts: paying,
    tenants: [{ id: A, name: "Zilker Strength", timezone: "America/Chicago", slug: "harbor" }],
    tenant_config: [
      {
        tenant_id: A,
        version: 1,
        config: {
          brain: {
            business_name: "Zilker Strength",
            booking_link: "https://book.example/zilker",
            system_prompt: "Answer as the front desk of Zilker Strength: brief and warm.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: {
              ...(address ? { address } : {}),
              services: [{ name: "small-group training" }, { name: "one-to-one coaching" }],
            },
          },
        },
      },
    ],
    lead_searches: [{ id: SEARCH, tenant_id: A, name: "Trainers", plan: PLAN, removed_at: null }],
    lead_searches_view: [view()],
    lead_search_members: [{ id: "m-1", search_id: SEARCH, lead_id: LEAD, tenant_id: A, blanked_at: null }],
    lead_counters: [
      { tenant_id: A, kind: "allowance", period: "2026-09", used: 14, reserved: 0 },
      { tenant_id: A, kind: "budget", period: "2026-09", used: 1.5, reserved: 0 },
    ],
    leads: [
      {
        id: LEAD,
        tenant_id: A,
        business_name: NAME,
        email: "hello@travisheightscoaching.example",
        email_state: over.emailState ?? "ok",
        stage: "ready",
        closed_reason: null,
        contact_id: null,
        place_id: "ChIJfixture0001",
        erased_at: null,
        blanked_at: null,
        category: "Personal trainer",
        city: "Austin",
        region: "TX",
        website_host: "travisheightscoaching.example",
        rating: 4.9,
        reviews: 61,
      },
    ],
    lead_suggestions: over.suggestions ?? [],
    decisions: [],
    ...over.tables,
  };
}

/** One page row, exactly the columns `leads_page` answers (4.2). */
export const pageRow = (over = {}) => ({
  member_id: "m-1",
  lead_id: LEAD,
  place_id: "ChIJfixture0001",
  search_id: SEARCH,
  round_id: R1,
  class: "qualified",
  excluded_by: null,
  fit: "strong",
  reason: "independent, in the area",
  distance_m: 2400,
  counted: true,
  counted_month: "2026-09",
  judgment: {
    op_id: OP,
    term: "personal trainer",
    model: "m",
    reasons: ["fit"],
    answer: {
      ref: 1,
      reason: "one address, no brand in the name",
      criteria: [{ key: "independent", answer: "pass", facts: ["name"] }],
    },
  },
  shares: [],
  business_name: NAME,
  category: "Personal trainer",
  street: "1400 S Congress Ave",
  city: "Austin",
  region: "TX",
  postal_code: "78704",
  lat: 30.24,
  lng: -97.75,
  website_host: "travisheightscoaching.example",
  instagram_url: null,
  phone_e164: "+15125550142",
  phone_sources: 2,
  phone_wrong: false,
  email: "hello@travisheightscoaching.example",
  email_alternates: [{ email: "careers@travisheightscoaching.example", why: "for job seekers" }],
  email_state: "ok",
  email_checked_at: "2026-09-19T12:00:00Z",
  rating: 4.9,
  reviews: 61,
  stage: "ready",
  closed_reason: null,
  last_outcome: null,
  last_note: null,
  contact_id: null,
  contacted_at: null,
  converted_at: null,
  exported_at: null,
  found_at: "2026-09-19T10:00:00Z",
  places: 1,
  version: 3,
  page_key: "0000123456",
  sort_key: "0000123456|m-1",
  ...over,
});

export const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };

export let calls = [];

export const rpcCalls = (name) => calls.filter((c) => c.name === name).map((c) => c.args);

/** Every door B's routes reach, answering the real shape and recording what it was asked. */
export function doors(over = {}) {
  const seen = (name, fn) => (args) => {
    calls.push({ name, args });
    return fn(args);
  };
  return {
    lead_set_stage: seen(
      "lead_set_stage",
      over.lead_set_stage ??
        ((a) => ({
          stage: a.p_outcome === "interested" ? "converted" : (a.p_stage ?? "ready"),
          closed_reason: a.p_reason ?? null,
          contact_id: a.p_outcome === "interested" ? CONTACT : null,
          existed: false,
          converted: a.p_outcome === "interested",
          op_id: OP,
          version: 4,
        })),
    ),
    lead_bulk: seen("lead_bulk", over.lead_bulk ?? (() => ({ done: 2, op_id: OP, version: 1 }))),
    lead_check_again: seen("lead_check_again", over.lead_check_again ?? (() => ({ scheduled: 2, skipped: 1 }))),
    lead_erase: seen("lead_erase", over.lead_erase ?? (() => ({ erased: true, already: false }))),
    lead_export_mark: seen("lead_export_mark", over.lead_export_mark ?? (() => 1)),
    leads_page: seen("leads_page", over.leads_page ?? (() => [pageRow()])),
    lead_list_counts: seen("lead_list_counts", over.lead_list_counts ?? (() => COUNTS)),
    lead_niche_prior: seen(
      "lead_niche_prior",
      over.lead_niche_prior ?? (() => ({ places: 1200, matched: 700, with_email: 406 })),
    ),
    lead_search_rename: seen(
      "lead_search_rename",
      over.lead_search_rename ?? ((a) => ({ search_id: a.p_search_id, name: a.p_name })),
    ),
    lead_search_remove: seen(
      "lead_search_remove",
      over.lead_search_remove ?? (() => ({ op_id: OP, version: 1, blanked: 40 })),
    ),
    lead_search_undo: seen(
      "lead_search_undo",
      over.lead_search_undo ?? (() => ({ removed: 3, credited: 2, op_id: OP, version: 1 })),
    ),
  };
}

/** What the service wrote, held instead of sent: the one write in this module that is not the caller's own. */
export let saved = [];

/** The model, faked: what it was asked is kept, and it answers the JSON its schema asks for. */
export let modelCalls = [];

export function fakeModel(answerOfPurpose = {}) {
  return async function* (call) {
    modelCalls.push(call);
    const said =
      answerOfPurpose[call.purpose] ??
      (call.purpose === "lead_draft"
        ? {
            subject: "A question about your members",
            body: "Hi — we run small-group training two blocks away and often have people asking for one-to-one coaching. Worth a quick call?",
          }
        : {
            line: "a personal training studio in Austin",
            ideas: [
              {
                words: "chiropractors",
                why: "Partners: their patients often need a trainer next",
                who: "chiropractors",
                who_one: "chiropractor",
                category_key: "chiropractors",
                terms: ["chiropractor"],
                place: "P1",
                count: 50,
                contact: "email",
                criteria: [],
                leave_out: ["chains"],
              },
            ],
          });
    yield { type: "text", index: 0, text: JSON.stringify(said) };
    yield { type: "stop", stopReason: "end_turn" };
  };
}

beforeEach(() => {
  calls = [];
  modelCalls = [];
  saved = [];
  setModelStream(fakeModel());
  setSuggestionsWriter(async (tenantId, row) => {
    saved.push({ tenantId, ...row });
  });
});

/** GET leads/[id]'s world (PR 9): one lead, its two memberships, its places; and lead_member_of answering from them. */
export const OTHER_SEARCH = "aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa";

// The lead as `leads` holds it, and two memberships of it: an older one in another search, and this search's.
export const oneLeadTables = (over = {}) => {
  const w = world({ role: "viewer" });
  const page = pageRow();
  w.leads = [
    {
      ...w.leads[0],
      street: page.street,
      postal_code: page.postal_code,
      neighborhood: null,
      lat: page.lat,
      lng: page.lng,
      mark_path: null,
      instagram_url: null,
      phone_e164: page.phone_e164,
      phone_sources: 2,
      phone_wrong: false,
      email_alternates: page.email_alternates,
      email_checked_at: page.email_checked_at,
      last_outcome: null,
      last_note: null,
      about: null,
      hours: [],
      contacted_at: null,
      converted_at: null,
      exported_at: null,
      found_at: page.found_at,
      version: 3,
      ...over.lead,
    },
  ];
  w.lead_search_members = [
    {
      id: "m-0",
      tenant_id: A,
      lead_id: LEAD,
      search_id: OTHER_SEARCH,
      class: "review",
      excluded_by: null,
      fit: "look",
      reason: "older",
      distance_m: null,
      counted: false,
      judgment: {},
      blanked_at: null,
      created_at: "2026-09-10T00:00:00Z",
    },
    {
      id: "m-1",
      tenant_id: A,
      lead_id: LEAD,
      search_id: SEARCH,
      class: page.class,
      excluded_by: null,
      fit: page.fit,
      reason: page.reason,
      distance_m: page.distance_m,
      counted: true,
      judgment: page.judgment,
      blanked_at: null,
      created_at: "2026-09-19T10:00:00Z",
      ...over.member,
    },
  ];
  w.lead_places = [
    { id: "p1", lead_id: LEAD, tenant_id: A },
    { id: "p2", lead_id: LEAD, tenant_id: A },
  ];
  return w;
};

// The membership the page would show is the database's to choose (00212 lead_member_of, over lead_member_shown, the
// one rule leads_page asks): proved in leads.db.test.mjs. Here it answers from the table what the door is asked.
export const memberOf = (t) => (a) => {
  calls.push({ name: "lead_member_of", args: a });
  return (
    t.lead_search_members
      .filter(
        (m) =>
          m.tenant_id === a.p_tenant_id &&
          m.lead_id === a.p_lead_id &&
          (!a.p_search_id || m.search_id === a.p_search_id) &&
          !m.blanked_at,
      )
      .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0] ?? null
  );
};

/** A kept row of ideas, as 00398 keeps it: written over the newest round (basis "" where none has ended). */
export const keptIdeas = (over = {}) => [
  {
    tenant_id: A,
    business_line: "a personal training studio in Denver",
    by_owner: true,
    made_at: new Date().toISOString(),
    basis: "",
    failed_at: null,
    passed: [],
    items: [
      {
        words: "Chiropractors near 78704",
        who_for: "Partners",
        category_key: "chiropractor",
        reach: null,
        plan: {
          ...PLAN,
          category_key: "chiropractor",
          area: { ...PLAN.area, kind: "zip", label: "near 78704", zip: "78704" },
        },
        ask: "Find 50 chiropractors near 78704",
      },
    ],
    ...over,
  },
];

/** What the ideas' store answers a test: the home known, no search yet. */
export const ideaStore = (over = {}) => ({
  history: async () => ({ home: { city: "Austin", region: "TX", zip: "78704" }, searches: [] }),
  keep: async (tenantId, _claim, row) => {
    saved.push({ tenantId, ...row });
    return true;
  },
  ...over,
});

/** Sets the world's `modelCalls` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setModelCalls = (value) => (modelCalls = value);
