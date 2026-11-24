/**
 * AI hands a form to Forms on one card (Campaigns in three tabs, the plan's B4; decision 0148, calls 9 and 10): asked for
 * a form, AI proposes `form_draft` carrying the owner's sentence alone; its press is Forms' own (POST forms, act make,
 * the same drafter), waits the drafter's whole minute on every leg, and opens Forms on the draft it made. Pressed twice
 * (two tabs, or Try again after a press that ran out) it is one press: the card's write is kept under the card's own id,
 * so the second is answered with the first's form, and AI is asked once. Run through the dashboard's own Forms route over
 * a database in memory, the model scripted.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { A, emailWire, formWorld } from "./_form-requests.mjs";
import { at } from "../_cron-doors-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const name of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[name];

const forms = await import(at("apps/dashboard/app/api/v1/forms/route.ts"));
const { formDraftAct } = await import(at("apps/dashboard/src/server/ask/tools/act/forms/draft.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));
const { getEmailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
const { ASK_ACT_WAIT_MS, FORM_LIMITS, FORM_PRESS_WAIT_MS, PROPOSAL_SPECS, formsRouteOf, FORMS_ROUTE } =
  await import("@chanlytics/contracts");

const wire = emailWire(getEmailWire);
after(() => {
  setModelStream(null);
  setServiceClient(null);
  wire.undo();
});

const U = "11111111-1111-4111-8111-111111111111";
const spec = PROPOSAL_SPECS.form_draft;
const card = (sentence) => ({ id: "p-card-1", kind: "form_draft", title: "", summary: "", payload: { sentence } });

/** The model answers `said` to every call, and every call is kept. */
function modelSays(said) {
  const calls = [];
  setModelStream(async function* (call) {
    calls.push(call);
    yield { type: "text", index: 0, text: JSON.stringify(said) };
    yield { type: "stop", stopReason: "end_turn" };
  });
  return calls;
}
const field = (kind, label) => ({ id: "", kind, label, help: "", needed: true, choices: [] });
const DRAFTED = {
  ask: "",
  heading: "Colour consultation",
  intro: "Tell us about your hair, and we'll get back to you.",
  lang: "en",
  thanks: "Thanks, we have it.",
  fields: [field("short", "Your name"), field("email", "Email"), field("long", "What colour are you after?")],
  words: [],
  said: "",
};

/** The salon's world with an owner signed in; `press` is the card's call, as Ask's door or the tab makes it. */
async function world() {
  setRateStore(memoryStore());
  await wire.says(true);
  const made = formWorld({
    more: {
      memberships: [
        {
          user_id: U,
          tenant_id: A,
          role: "owner",
          tenants: { slug: "luma-salon", name: "Luma Salon", timezone: "America/New_York" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      messages: [],
      idempotency_keys: [],
    },
  });
  setServiceClient(made.db);
  const ctx = { supabase: made.db, userId: U, email: "ada@example.com", params: {} };
  const press = (call, key) =>
    forms.POST.run(
      new Request(`http://localhost/api/v1/forms?workspace=${A}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key, "x-via": "ask" },
        body: JSON.stringify(call.body),
      }),
      ctx,
    );
  return { ...made, press };
}

test("the card is Forms' own press, waiting the drafter's whole minute, carrying the owner's sentence alone", () => {
  assert.deepEqual([spec.needs, spec.gate], ["operator", "approve"]);
  const long = `  a consultation form for new colour clients ${"and more ".repeat(100)}`;
  const call = spec.commit({ ...card(long), payload: { sentence: long } });
  assert.equal(call.route, "POST forms");
  assert.equal(call.body.act, "make");
  assert.equal(call.body.sentence.length, FORM_LIMITS.sentence, "held to the sentence Forms' line takes");
  assert.ok(call.body.sentence.startsWith("a consultation form"), "trimmed, in the owner's own words");
  assert.deepEqual(Object.keys(call.body).sort(), ["act", "sentence"], "nothing of the form itself");
  assert.equal(call.waitMs, FORM_PRESS_WAIT_MS, "the drafter's minute, and a little more");
  assert.ok(ASK_ACT_WAIT_MS > FORM_PRESS_WAIT_MS, "the tab waits Ask's door longer than the door waits Forms");
});

test("its receipt: the draft made and opened, AI's one question said and nothing opened, or nothing made", () => {
  const c = card("a consultation form");
  const madeAnswer = { form_id: "f-1", failed: false, asked: false, said: "" };
  assert.equal(spec.made(c, madeAnswer), "f-1");
  assert.equal(spec.open(c, { made: { kind: "form_draft", id: "f-1" } }), formsRouteOf({ form: "f-1" }));
  assert.equal(spec.open(c, null), FORMS_ROUTE, "with no draft, Forms itself");
  const asked = spec.receipt(c, { form_id: null, failed: false, asked: true, said: "Which services should it list?" });
  assert.match(asked, /Which services should it list\?/, "AI's question, said on the card");
  assert.equal(spec.made(c, { form_id: null, failed: false, asked: true, said: "Which services?" }), null);
  assert.notEqual(spec.receipt(c, madeAnswer), asked);
});

test("AI's act: the owner's sentence as the card's heading where it fits, said under it where not; too short refused", async () => {
  const build = Object.values(formDraftAct.actions)[0].build;
  const short = await build({}, { sentence: "a consultation form for new colour clients" });
  assert.equal(short.proposal.kind, "form_draft");
  assert.equal(short.proposal.title, "A consultation form for new colour clients");
  assert.deepEqual(short.proposal.payload, { sentence: "a consultation form for new colour clients" });
  const sentence = `a form for ${"every new client who wants colour, cuts or treatments ".repeat(3)}`.trim();
  const long = await build({}, { sentence });
  assert.equal(long.proposal.title, "A new form");
  assert.match(long.proposal.summary, /^You asked for: a form for every new client/);
  const refused = await build({}, { sentence: " x " });
  assert.equal(refused.proposal, null);
  assert.ok(refused.refusal);
});

test("pressed twice, from two tabs or after a press that ran out, it is one press: one draft, AI asked once", async () => {
  const w = await world();
  const calls = modelSays(DRAFTED);
  const call = spec.commit(card("a consultation form for new colour clients"));
  const first = await w.press(call, "p-card-1");
  const again = await w.press(call, "p-card-1");
  assert.equal(first.failed, false);
  assert.equal(again.form_id, first.form_id, "the second press answered with the first's form");
  assert.equal(calls.length, 1, "AI drafted once");
  const drafts = w.tables.forms.filter((f) => f.id === first.form_id);
  assert.deepEqual(
    drafts.map((f) => f.state),
    ["draft"],
    "one draft, never live by itself",
  );
  assert.equal(
    spec.open(card(""), { made: { kind: "form_draft", id: spec.made(card(""), again) } }),
    formsRouteOf({ form: first.form_id }),
  );

  // Another card is another press.
  const other = await w.press(spec.commit(card("a sign-up for our news")), "p-card-2");
  assert.notEqual(other.form_id, first.form_id);
  assert.equal(calls.length, 2);
});
