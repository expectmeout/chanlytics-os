/**
 * AI's form drafter, run as Campaigns › Forms runs it (the dashboard's server/ask/skills/form/write.ts), with the model
 * scripted: one craft call under the drafter's own purpose, its answer held in code before anyone sees it. An answer
 * that does not hold is asked once more with what is wrong said back; a second that does not hold is no form, never a
 * broken one. A sentence with no form in it is one question back. A model that does not answer is said as why, never
 * thrown.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { writeForm } = await import(at("apps/dashboard/src/server/ask/skills/form/write.ts"));
const { FORM_SKILL } = await import(at("apps/dashboard/src/server/ask/skills/form/skill.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));
const { FORM_CRAFT_JSON_SCHEMA, formDescriptionProblems, MODEL_ROUTES } = await import("@chanlytics/contracts");
after(() => setModelStream(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const caller = (ms = 60_000) => ({ tenantId: A, userId: "u1", deadline: Date.now() + ms });
const brief = {
  job: "draft",
  sentence: "A form for people who want a first visit",
  business: { name: "Harbor Studio", about: null, tone: "Warm and brief" },
  services: ["First visit", "Follow-up visit"],
  language: "en",
  chat: true,
};
const field = (kind, label, over = {}) => ({ id: "", kind, label, help: "", needed: true, choices: [], ...over });
const GOOD = {
  ask: "",
  heading: "First visit",
  intro: "Tell us what you need, and we'll get back to you.",
  lang: "en",
  thanks: "Thanks, we have your request.",
  fields: [field("short", "Your name"), field("email", "Email"), field("long", "What do you need?")],
  words: [],
  said: "",
};
const NO_WAY = { ...GOOD, fields: [field("short", "Your name"), field("long", "What do you need?")] };

/** The model answers each of `answers` in turn; every call it was made is kept. */
function modelSays(...answers) {
  const calls = [];
  let n = 0;
  setModelStream(async function* (call) {
    calls.push(call);
    const said = answers[Math.min(n++, answers.length - 1)];
    if (said === "error") {
      yield { type: "error", message: "the model is away" };
      return;
    }
    yield { type: "text", index: 0, text: JSON.stringify(said) };
    yield { type: "stop", stopReason: "end_turn" };
  });
  return calls;
}

test("one call under the drafter's own purpose, and what it wrote becomes a form that holds", async () => {
  const calls = modelSays(GOOD);
  const written = await writeForm(caller(), brief);
  assert.equal(written.wrote, "form");
  assert.deepEqual(formDescriptionProblems(written.form), []);
  assert.equal(written.form.fields.length, 3);
  assert.ok(
    written.form.fields.every((f) => /^q[0-9a-f]{8}$/.test(f.id)),
    "each question has an id of its own",
  );
  assert.deepEqual(written.form.next, { chat: true, draft: true, follow_up: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].purpose, "form_draft");
  assert.equal(calls[0].request.model, MODEL_ROUTES.form_draft.model);
  assert.deepEqual(calls[0].request.output_config, {
    effort: FORM_SKILL.craft.effort,
    format: { type: "json_schema", schema: FORM_CRAFT_JSON_SCHEMA },
  });
  assert.match(calls[0].request.system, /^You draft a short request form/);
  assert.match(calls[0].request.messages[0].content, /<record>\nA form for people who want a first visit/);
});

test("an answer that does not hold is asked once more, with what is wrong said back", async () => {
  const calls = modelSays(NO_WAY, GOOD);
  const written = await writeForm(caller(), brief);
  assert.equal(written.wrote, "form");
  assert.equal(calls.length, 2);
  assert.match(calls[1].request.messages[0].content, /Your last answer could not be used/);
  assert.match(calls[1].request.messages[0].content, /email address or a phone number/);
});

test("a second answer that does not hold is no form, never a broken one", async () => {
  const calls = modelSays(NO_WAY, NO_WAY);
  const written = await writeForm(caller(), brief);
  assert.equal(written.wrote, "nothing");
  assert.equal(written.kept, "checks");
  assert.match(written.problems.join(" "), /email address or a phone number/);
  assert.equal(calls.length, 2, "one try and one mend: no third");
});

test("a sentence with no form in it is one question back", async () => {
  modelSays({ ...GOOD, ask: "What should people ask you for?", fields: [] });
  const written = await writeForm(caller(), { ...brief, sentence: "more clients" });
  assert.deepEqual(written, { wrote: "ask", ask: "What should people ask you for?" });
});

test("a model that does not answer is said as why, never thrown; with no time left it is not asked at all", async () => {
  modelSays("error");
  const failed = await writeForm(caller(), brief);
  assert.equal(failed.wrote, "nothing");
  assert.notEqual(failed.kept, "checks");
  const calls = modelSays(GOOD);
  const late = await writeForm(caller(1_000), brief);
  assert.deepEqual([late.wrote, late.kept], ["nothing", "late"]);
  assert.equal(calls.length, 0);
});
