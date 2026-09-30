/**
 * The sheet's preview door, run (Reach out Part 4, F12, R11, R13): POST /api/admin/reach-out-preview over a database in
 * memory, the model answered by the test through the platform's one transport. Who may knock (a token minted for this
 * door's full path, about this workspace); what the body must name; the n-th business, capped at 199; its email as the
 * sender would write it, the opening written and read by the check's own code; and what the sender would hold, held
 * here too. Nothing is stored.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { answering } from "../ai/_model-world.mjs";
import { at, withEnv } from "../_cron-doors-world.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { setModelFetch } = await import(at("apps/edge/lib/model.ts"));
const door = await import(at("apps/edge/api/admin/reach-out-preview.ts"));
after(() => {
  setPg(null);
  setModelFetch(null);
});

const AUD = "/api/admin/reach-out-preview";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SEARCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CONFIG = (over = {}) => ({
  brain: {
    business_name: "Harbor Moving Co",
    system_prompt: "You answer for Harbor Moving Co, a moving company in Austin, Texas.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: { address: "100 Example St, Austin, TX 78701" },
    ...over,
  },
});

const token = (workspace = A, aud = AUD) => signEdgeToken(process.env.EDGE_CALL_SECRET, aud, { workspace, user: USER });
const knock = (body, headers = { "x-edge-token": token() }) =>
  door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];
const BODY = (over = {}) => ({
  tenant_id: A,
  user_id: USER,
  search_id: SEARCH,
  index: 0,
  include_unconfirmed: false,
  words: { subject: "Quick one for {{business}}", body: "{{opening}}\n\n{{your name}}" },
  signed_by: "Sam",
  language: "en",
  ...over,
});

/** The workspace's search: three businesses, strongest first; the audience's and the record's doors as the SQL keys them. */
function world({ config = CONFIG(), events = [] } = {}) {
  const leads = [1, 2, 3].map((i) => ({
    lead_id: `lead-${i}`,
    email: `owner-${i}@fixture-movers.example`,
    business_name: `Fixture Movers ${i}`,
    city: "Austin",
    region: "TX",
    hours: [],
  }));
  const asked = [];
  const db = fakeDb(
    {
      tenants: [{ id: A, name: "Harbor Moving Co" }],
      tenant_config: [{ tenant_id: A, config }],
      business_records: [{ tenant_id: A, about: "We move homes across Austin." }],
      events,
    },
    {},
    {
      reach_out_audience: (a) => {
        asked.push(a);
        return a.p_tenant_id === A && a.p_search_id === SEARCH ? leads.slice(0, a.p_limit) : [];
      },
      reach_out_record: (a) => {
        const l = leads.find((x) => x.lead_id === a.p_lead_id);
        return l
          ? [
              {
                business_name: l.business_name,
                category: "Moving company",
                city: "Austin",
                region: "TX",
                rating: 4.9,
                reviews: 16,
                website_host: "fixture-movers.example",
                hours: [],
                about: "Family-run since 2009.",
                email: l.email,
                why_it_fits: "Independent mover",
                what_you_asked: "movers",
                site_listings: 1,
                name_listings: 1,
                email_domain_shared: false,
              },
            ]
          : [];
      },
    },
  );
  setPg(db);
  return { asked, db, events };
}

/** The writer and the reader, by their prompts. */
function model({ language = "en", down = false } = {}) {
  const api = answering(async (body) => {
    if (down) throw Object.assign(new Error("overloaded"), { status: 529 });
    const writer = String(body.system).includes("You write");
    const a = writer
      ? { opening: "A 4.9 from 16 reviews says people find you.", angle: "their reviews", facts_used: ["rating"] }
      : { backed: true, unbacked: "", pitch: false, language };
    return {
      content: [{ type: "text", text: JSON.stringify(a) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  });
  setModelFetch(api.fetch);
  return api.calls;
}

test("a token for this door's full path previews the n-th business, its email as it would read, checked", async () => {
  model();
  world();
  const [status, body] = await answer(await knock(BODY({ index: 1 })));
  assert.equal(status, 200);
  const p = body.preview;
  assert.deepEqual(p.lead, {
    id: "lead-2",
    business_name: "Fixture Movers 2",
    email: "owner-2@fixture-movers.example",
  });
  assert.equal(p.subject, "Quick one for Fixture Movers 2");
  assert.equal(p.body, "A 4.9 from 16 reviews says people find you.\n\nSam");
  assert.deepEqual([p.angle, p.hold, p.refused, p.unavailable], ["their reviews", null, null, false]);
  // Past the last business: none.
  const [, past] = await answer(await knock(BODY({ index: 7 })));
  assert.equal(past.preview.lead, null);
});

test("who may knock: a token for another workspace, or minted for the short name, is refused", async () => {
  model();
  world();
  assert.deepEqual(await answer(await knock(BODY(), { "x-edge-token": token(B) })), [
    403,
    { ok: false, error: "workspace_mismatch" },
  ]);
  const [status] = await answer(await knock(BODY(), { "x-edge-token": token(A, "reach-out-preview") }));
  assert.equal(status, 403, "the audience is the full path (R13)");
});

test("a body without words, or with an index or a language that is not one, is a 400", async () => {
  world();
  for (const bad of [
    BODY({ words: null }),
    BODY({ words: { subject: "Hi", body: "  " } }),
    BODY({ index: -1 }),
    BODY({ index: 1.5 }),
    BODY({ include_unconfirmed: "yes" }),
    BODY({ language: "english!" }),
    BODY({ search_id: "not-a-search" }),
  ])
    assert.deepEqual(await answer(await knock(bad)), [400, { ok: false, error: "bad_request" }], JSON.stringify(bad));
});

test("an index past 199 is refused, never clamped; the catch-all addresses come when the chain includes them (R11)", async () => {
  model();
  const w = world();
  assert.deepEqual(await answer(await knock(BODY({ index: 200 }))), [400, { ok: false, error: "bad_request" }]);
  assert.equal(w.asked.length, 0, "nothing was read for it");
  await knock(BODY({ index: 199, include_unconfirmed: true }));
  assert.deepEqual([w.asked[0].p_limit, w.asked[0].p_include_unconfirmed], [200, true]);
});

test("it holds what the sender holds: no booking link, a subject posing as a reply, a slot that is none of six (R11)", async () => {
  model();
  world();
  const noLink = (await answer(await knock(BODY({ words: { subject: "Hi", body: "Book: {{booking link}}" } }))))[1];
  assert.deepEqual([noLink.preview.refused, noLink.preview.body], ["no_booking_link", null]);
  const re = (await answer(await knock(BODY({ words: { subject: "Re: your quote", body: "Hello." } }))))[1];
  assert.equal(re.preview.refused, "words_unsendable");
  const slot = (await answer(await knock(BODY({ words: { subject: "Hi", body: "Hi {{first name}}" } }))))[1];
  assert.equal(slot.preview.refused, "unknown_slot");
  const noName = (await answer(await knock(BODY({ signed_by: null }))))[1];
  assert.equal(noName.preview.refused, "no_signed_by");
  // With the workspace's link, it reads.
  world({ config: CONFIG({ booking_link: "https://example.com/book" }) });
  const linked = (await answer(await knock(BODY({ words: { subject: "Hi", body: "Book: {{booking link}}" } }))))[1];
  assert.equal(linked.preview.body, "Book: https://example.com/book");
});

test("the step's language is the reader's measure; a model that cannot answer is said, not refused", async () => {
  model({ language: "en" });
  world();
  const es = (await answer(await knock(BODY({ language: "es" }))))[1];
  assert.deepEqual([es.preview.hold, es.preview.detail], ["language", "en"]);
  model({ down: true });
  const down = (await answer(await knock(BODY())))[1];
  assert.deepEqual([down.preview.unavailable, down.preview.refused, down.preview.body], [true, null, null]);
  await withEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
    const none = (await answer(await knock(BODY())))[1];
    assert.equal(none.preview.unavailable, true);
  });
});

test("a preview spends the model, so it counts in Ask's daily budget as a lead draft does: recorded against who asked, and refused past the day's tokens before anything is read (R12)", async () => {
  model();
  const w = world();
  const [status] = await answer(await knock(BODY()));
  assert.equal(status, 200);
  const spent = w.events.filter((e) => e.kind === "usage.ask_tokens");
  assert.equal(spent.length, 1, "one row of what it cost");
  assert.deepEqual(
    [spent[0].tenant_id, spent[0].subject_id, spent[0].data.purpose, spent[0].data.input_tokens > 0],
    [A, USER, "reach_out_preview", true],
  );
  const full = world({
    events: [
      {
        tenant_id: A,
        kind: "usage.ask_tokens",
        created_at: new Date().toISOString(),
        data: { input_tokens: 10_000_000, output_tokens: 0 },
      },
    ],
  });
  const [s2, b2] = await answer(await knock(BODY()));
  assert.deepEqual([s2, b2.error], [429, "ask_budget"]);
  assert.equal(full.asked.length, 0, "no business was read for it");
  // The token's person is the asker. A token about no person leaves the body to say who, and a body that names no
  // person is refused; a token that names one is believed over whatever the body says.
  const nobody = { "x-edge-token": signEdgeToken(process.env.EDGE_CALL_SECRET, AUD, { workspace: A, user: null }) };
  assert.deepEqual(await answer(await knock(BODY({ user_id: "ada" }), nobody)), [
    400,
    { ok: false, error: "bad_request" },
  ]);
});
