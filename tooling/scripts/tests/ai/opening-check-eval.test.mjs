/**
 * The cold email opening's graded eval (tooling/scripts/evals/opening-check.mjs): the edge's own check run over made-up
 * businesses, each opening it sends graded against the business's record, and the run held to its lines on what was
 * sent, not on how often the check passed. Nothing here asks a model: the business set's shape, the check's calls as
 * the edge's own transport makes them, the check and the grader over a scripted API, the arithmetic of the lines, and
 * the runner as run with no key are executed.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { MODELS, MODEL_ROUTES, OPENING_SCHEMA, routeThinkingFor } from "@chanlytics/contracts";
import { resetBreakers } from "@chanlytics/channels";
import { ROOT } from "../_source.mjs";
import { at, withEnv } from "../_cron-doors-world.mjs";
import { answering, json, said, scripted, status } from "./_model-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { askReachOutModel } = await import(at("apps/edge/lib/reach-out/check-one.ts"));
const { setModelFetch } = await import(at("apps/edge/lib/model.ts"));
const {
  GRADER_MODEL,
  LINES,
  SHAPES,
  askCheckModel,
  gateOf,
  gradeAll,
  graderRecordOf,
  inputsOf,
  loadSet,
  newSpend,
  report,
  runChecks,
  tallyOf,
  validateSet,
} = await import(new URL("../../evals/opening-check.mjs", import.meta.url).href);

after(() => setModelFetch(null));
beforeEach(() => resetBreakers());

const EVAL_KEY = "eval-key-for-this-file";
const PRODUCTION_KEY = "production-key-never-used-here";
const SET = loadSet();
const USAGE = { input_tokens: 1000, output_tokens: 50 };
const open = () => new AbortController().signal;

/* ----------------------------------------------------------- the business set -- */

test("the set is made-up businesses in the four shapes that guessed, each in words that ask for an opening", () => {
  assert.deepEqual(validateSet(SET), []);
  for (const shape of SHAPES)
    assert.ok(SET.businesses.filter((b) => b.shape === shape).length >= 2, `two businesses at least are ${shape}`);
  for (const b of SET.businesses) {
    assert.ok(b.record.website_host === null || b.record.website_host.endsWith(".example"), b.id);
    assert.equal(b.record.email ?? null, null, `${b.id} holds no email`);
  }
  const broken = structuredClone(SET);
  broken.businesses[0].record.website_host = "keylinelocks.com";
  broken.businesses[1].shape = "busy";
  broken.businesses[2].id = broken.businesses[0].id;
  broken.businesses[3].record.about = "Call us at 614-555-2290 any time.";
  broken.words.plain.body = "Hello there.";
  assert.deepEqual(validateSet(broken), [
    `${SET.businesses[0].id}: a website that is not made up (keylinelocks.com)`,
    `${SET.businesses[1].id}: no shape "busy"`,
    `${SET.businesses[0].id}: the id is taken twice`,
    `${SET.businesses[3].id}: a phone number in about`,
    `the words "plain" name no {{opening}}`,
  ]);
});

test("each business is checked as the edge's check builds it: an opening asked for, and no code hold before the words", async () => {
  const inputs = await inputsOf(SET);
  assert.equal(inputs.length, SET.businesses.length);
  for (const { business, input } of inputs) {
    assert.equal(input.needsOpening, true, business.id);
    assert.deepEqual([input.chain, input.customerDomain, input.abroad], [null, null, null], business.id);
    assert.equal(input.record.what_you_asked, business.record.what_you_asked);
    assert.equal(input.language, "en");
  }
  const towing = inputs.find((i) => i.business.id === "towing-all-hours").input;
  assert.match(towing.record.hours, /^Monday Open 24 hours; Tuesday Open 24 hours/);
  assert.equal(towing.workspace.name, SET.workspace.name);
  // The sentence its listing's own fields say (decision 0078), read before any writer is asked; a thin record has none.
  assert.equal(towing.fact.opening, "Ridgeway Towing is open 24 hours, seven days a week.");
  assert.equal(inputs.find((i) => i.business.id === "auto-thin").input.fact, null);
});

/* ------------------------------------------- the check's calls are the edge's own -- */

test("the eval asks the check's model exactly as the edge does, through the port, on the eval key alone", async () => {
  const answer = { opening: "Keyline Locksmith is open 24 hours.", angle: "open all hours", facts_used: ["hours"] };
  const scripts = {
    "an answer in its schema": () => [json(answer, { usage: USAGE })],
    "a schema the API refuses, asked again for plain JSON": () => [
      status(400, "output_config.format: json_schema is not supported"),
      json(answer, { usage: USAGE }),
    ],
    "a refusal, which is no answer": () => [said("", { stop_reason: "refusal", usage: USAGE })],
    "an overload, asked once of the fallback": () => [status(529, "overloaded"), json(answer, { usage: USAGE })],
  };
  for (const [name, replies] of Object.entries(scripts)) {
    resetBreakers();
    const edge = scripted(...replies());
    setModelFetch(edge.fetch);
    const theirs = await withEnv({ ANTHROPIC_API_KEY: "edge-key" }, () =>
      askReachOutModel("System.", "User.", OPENING_SCHEMA, 400, open(), { tenantId: null }),
    );
    resetBreakers();
    const ours = scripted(...replies());
    const mine = await askCheckModel(EVAL_KEY, { fetch: ours.fetch, sleep: async () => {} })(
      "System.",
      "User.",
      OPENING_SCHEMA,
      400,
      open(),
    );
    assert.deepEqual(mine, theirs, name);
    assert.deepEqual(
      ours.calls.map((c) => [c.url, c.body]),
      edge.calls.map((c) => [c.url, c.body]),
      name,
    );
    assert.ok(
      ours.calls.every((c) => c.headers["x-api-key"] === EVAL_KEY),
      name,
    );
  }
  const first = scripted(json(answer, { usage: USAGE }));
  await askCheckModel(EVAL_KEY, { fetch: first.fetch })("System.", "User.", OPENING_SCHEMA, 400, open());
  const model = MODEL_ROUTES.reach_out_check.model;
  assert.equal(first.calls[0].model, model, "the check's own route");
  assert.deepEqual(first.calls[0].body.thinking, routeThinkingFor("reach_out_check", model), "its thinking off");
});

test("a key whose credit ran out stops the run: no check after it is asked", async () => {
  const api = scripted(status(400, "Your credit balance is too low to access the Anthropic API."));
  const one = { ...SET, businesses: SET.businesses.slice(0, 3) };
  await assert.rejects(runChecks(EVAL_KEY, one, 2, { fetch: api.fetch }, 1), /credit balance is too low/);
  assert.equal(api.calls.length, 1);
});

/* ------------------------------------------------ the check and the grader, scripted -- */

const WRITER = /^You write the first sentence/;
const READER = /^You check one sentence/;
const GRADER = /^You grade the first sentence/;
/** The name a writer's or grader's prompt is about, from its record's first line. */
const nameIn = (text) => /\n(?:name|business_name): ([^\n]+)/.exec(text)?.[1] ?? "";
const message = (obj) => ({
  content: [{ type: "text", text: JSON.stringify(obj) }],
  stop_reason: "end_turn",
  usage: USAGE,
});

/**
 * A model that reads every sentence and writes for each business by its name. The reader refuses "a waiting list" and
 * passes the rest: every listing sentence the set says is true (#1952, 30 Oct 2026: the barber's names each weekend
 * day's close, where it said "and on weekends too" of a Sunday that ends at 4 PM). The thin auto shop's writer guesses
 * at first and then writes from the record; the thin cleaner's always claims a waiting list. The grader calls a
 * sentence with "probably" or "waiting" a guess, and the rest honest.
 */
function world() {
  return answering(async (body) => {
    const system = body.system;
    const user = body.messages[0].content;
    if (WRITER.test(system)) {
      const name = nameIn(user);
      const again = user.includes("Your last opening was:");
      const opening = name.startsWith("Euro Motors")
        ? again
          ? "Euro Motors Service is an auto repair shop in Newark."
          : "Euro Motors Service in Newark probably gets calls at 3 AM."
        : name.startsWith("Crestview")
          ? "Crestview Cleaners has a waiting list most Saturdays."
          : `${name} came up in my search.`;
      return message({ opening, angle: "their record", facts_used: [] });
    }
    if (READER.test(system)) {
      const sentence = user.slice(user.indexOf("The sentence: ") + 14);
      const unbacked = /waiting list/.exec(sentence)?.[0] ?? "";
      return message({ backed: !unbacked, unbacked, pitch: false, language: "en" });
    }
    if (GRADER.test(system)) {
      const lines = user.split("\n").filter((l) => /^\d+\. /.test(l));
      return message({
        labels: lines.map((l, i) => ({
          n: i + 1,
          label: /probably|waiting/.test(l) ? "guess" : "honest",
          why: /waiting/.test(l) ? "a waiting list" : "",
        })),
      });
    }
    throw new Error(`an unknown prompt: ${system.slice(0, 40)}`);
  });
}
const four = {
  ...SET,
  businesses: ["towing-all-hours", "auto-thin", "barber-many-reviews", "cleaner-thin"].map((id) =>
    SET.businesses.find((b) => b.id === id),
  ),
};

test("every business is checked by the edge's loop: its listing's own sentence read first, the writer where there is none or it is refused", async () => {
  const api = world();
  const { results, spend } = await runChecks(EVAL_KEY, four, 2, { fetch: api.fetch });
  assert.deepEqual(
    results.map((r) => [r.id, r.round, r.kind, r.hold, r.rewritten, r.source]),
    [
      ["towing-all-hours", 1, "checked", null, false, "listing"],
      ["towing-all-hours", 2, "checked", null, false, "listing"],
      ["auto-thin", 1, "checked", null, true, "writer"],
      ["auto-thin", 2, "checked", null, true, "writer"],
      ["barber-many-reviews", 1, "checked", null, false, "listing"],
      ["barber-many-reviews", 2, "checked", null, false, "listing"],
      ["cleaner-thin", 1, "checked", "unbacked_fact", true, "writer"],
      ["cleaner-thin", 2, "checked", "unbacked_fact", true, "writer"],
    ],
  );
  assert.equal(results[0].opening, "Ridgeway Towing is open 24 hours, seven days a week.");
  assert.equal(results[2].opening, "Euro Motors Service is an auto repair shop in Newark.");
  assert.equal(
    results[4].opening,
    "Sharp Line Barbershop is open until 8 PM Monday to Saturday and until 4 PM on Sundays.",
    "each weekend day's close, as its listing gives it",
  );
  assert.equal(
    results[6].opening,
    "Crestview Cleaners has a waiting list most Saturdays.",
    "a held opening keeps its words",
  );
  // The towing service's and the barber's listing sentences are read once and sent. The auto shop has none: its
  // writer's first opening names a number its record does not hold (3 AM), so code asks for one rewrite. The cleaner has
  // none either, and its writer's is refused twice, and held.
  assert.equal(api.calls.length, 2 * (1 + 4 + 1 + 4));
  assert.equal(spend.calls, api.calls.length);
  assert.ok(
    Math.abs(spend.usd - (spend.calls * (1000 * 0.1 + 50 * 0.5)) / 1e6) < 1e-9,
    "priced at Haiku 5.5's list price",
  );
});

test("a run stops at its spend cap: no check or grade starts once it is reached, and the run says so", async () => {
  const api = world();
  await assert.rejects(
    runChecks(EVAL_KEY, four, 2, { fetch: api.fetch }, 1, newSpend(0.0001)),
    /spend cap of \$0\.0001 was reached/,
  );
  assert.equal(api.calls.length, 1, "the first check's one call crossed it; nothing started after");
  const { results } = await runChecks(EVAL_KEY, four, 1, { fetch: world().fetch });
  const grading = world();
  await assert.rejects(
    gradeAll(EVAL_KEY, four, results, { fetch: grading.fetch }, newSpend(0)),
    /spend cap of \$0\.0000 was reached/,
  );
  assert.equal(grading.calls.length, 0);
});

test("each business's written openings are graded in one call against its record, sent and held alike, each sentence once", async () => {
  const api = world();
  const { results, spend } = await runChecks(EVAL_KEY, four, 2, { fetch: api.fetch });
  const before = api.calls.length;
  await gradeAll(EVAL_KEY, four, results, { fetch: api.fetch }, spend);
  const graded = api.calls.slice(before);
  assert.equal(graded.length, 4, "one call per business");
  for (const body of graded) {
    assert.equal(body.model, GRADER_MODEL);
    assert.equal(GRADER_MODEL, MODELS.OPUS_5_5);
    assert.equal(body.output_config.effort, "low");
    assert.equal(body.output_config.format.type, "json_schema");
  }
  const towing = graded.map((b) => b.messages[0].content).find((u) => u.includes("Ridgeway"));
  assert.match(towing, /<record>\nbusiness_name: Ridgeway Towing \| 24 Hour/);
  assert.ok(
    !towing.includes("what_you_asked") && !towing.includes("null"),
    "what the owner asked is not the business's",
  );
  // Both of its checks wrote the same sentence: graded once, the grade given to each.
  assert.match(towing, /\nThe openings:\n1\. Ridgeway Towing is open 24 hours, seven days a week\.$/);
  assert.deepEqual(
    results.map((r) => r.grade.label),
    ["honest", "honest", "honest", "honest", "honest", "honest", "guess", "guess"],
  );
  assert.equal(results[6].grade.why, "a waiting list");
  const locksmith = (await inputsOf(SET)).find((i) => i.business.id === "locksmith-all-hours").input.record;
  assert.equal(
    graderRecordOf(locksmith),
    "business_name: Keyline Locksmith\ncategory: Locksmith\ncity: Columbus\nregion: OH\nrating: 4.9\nreviews: 167\n" +
      "website: keylinelocks.example\nhours: Monday Open 24 hours; Tuesday Open 24 hours; Wednesday Open 24 hours; " +
      "Thursday Open 24 hours; Friday Open 24 hours; Saturday Open 24 hours; Sunday Open 24 hours\n" +
      "why_it_fits: Independent locksmith, open around the clock, 4.9 from 167 reviews",
  );
});

test("a grader that answers for the wrong number of openings fails the run: nothing is guessed at", async () => {
  const { results } = await runChecks(EVAL_KEY, four, 1, { fetch: world().fetch });
  // One sentence each: a grader answering for two has not graded the one it was asked about.
  const short = answering(async () =>
    message({
      labels: [
        { n: 1, label: "honest", why: "" },
        { n: 2, label: "honest", why: "" },
      ],
    }),
  );
  await assert.rejects(gradeAll(EVAL_KEY, four, results, { fetch: short.fetch }), /could not grade/);
});

/* ------------------------------------------------------------------ the lines -- */

/** A run's results as tallyOf reads them: `n` checks of one shape with a kind, a hold and a grade. */
const rows = (n, over) =>
  Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    shape: "open_all_hours",
    round: 1,
    kind: "checked",
    hold: null,
    source: "listing",
    opening: "Sentence.",
    grade: { label: "honest", why: "" },
    ...over,
  }));

test("a run is held on what it sent: honest openings of its checks, and honest openings of its sends, each by its Wilson bound", () => {
  // 29 Oct 2026, on the code then live: 30 checks, 25 sent, 2 of them honest.
  const before = tallyOf([
    ...rows(2, {}),
    ...rows(23, { grade: { label: "guess", why: "probably" } }),
    ...rows(5, { hold: "unbacked_fact" }),
  ]);
  const g1 = gateOf(before);
  assert.deepEqual([g1.ok, g1.code, g1.missed], [false, 1, ["honest_sent", "clean_sent"]]);
  // Over-strict, as the check was after #1941 on Haiku 4.5 (13 of 30 sent): what goes is clean, and too little goes.
  const strict = gateOf(tallyOf([...rows(26, {}), ...rows(22, { hold: "unbacked_fact" })]));
  assert.deepEqual([strict.ok, strict.missed], [false, ["honest_sent"]]);
  // The first run (30 Oct, main b56811f28): 47 honest openings sent of 48 checks, one guess held.
  const baseline = gateOf(
    tallyOf([...rows(47, {}), ...rows(1, { hold: "unbacked_fact", grade: { label: "guess", why: "clearly" } })]),
  );
  assert.deepEqual([baseline.ok, baseline.code, baseline.missed], [true, 0, []]);
  assert.deepEqual([LINES.honestSent, LINES.cleanSent], [0.75, 0.85]);
  // Two guesses of 47 sent still hold; a third does not.
  const guesses = (n) =>
    gateOf(
      tallyOf([
        ...rows(47 - n, {}),
        ...rows(n, { grade: { label: "guess", why: "probably" } }),
        ...rows(1, { hold: "unbacked_fact" }),
      ]),
    );
  assert.deepEqual([guesses(2).ok, guesses(3).ok, guesses(3).missed], [true, false, ["clean_sent"]]);
  // Haiku 5.5 on the five businesses production held on 29 Oct (51 honest of 60 checks, 4 slips sent) misses both.
  const hard = gateOf(
    tallyOf([
      ...rows(51, {}),
      ...rows(4, { grade: { label: "invented", why: "across Brooklyn" } }),
      ...rows(5, { hold: "unbacked_fact" }),
    ]),
  );
  assert.deepEqual(hard.missed, ["honest_sent", "clean_sent"]);
});

test("a pitch sent fails the run however clean the rest; failed checks count in neither, and too many say it could not run", () => {
  const pitched = gateOf(tallyOf([...rows(47, {}), ...rows(1, { grade: { label: "pitch", why: "14 days free" } })]));
  assert.deepEqual([pitched.ok, pitched.missed], [false, ["pitch_sent"]]);
  const flaky = tallyOf([...rows(40, {}), ...rows(4, { kind: "failed", opening: null, grade: null })]);
  assert.deepEqual([flaky.checks, flaky.answered, flaky.failed], [44, 40, 4]);
  assert.equal(gateOf(flaky).ok, true, "4 of 44 is under a tenth");
  const down = gateOf(tallyOf([...rows(40, {}), ...rows(5, { kind: "failed", opening: null, grade: null })]));
  assert.deepEqual([down.ok, down.code, down.missed], [false, 2, ["could_not_run"]]);
});

test("held openings the grader calls honest are counted as the check being too strict, by shape", () => {
  const t = tallyOf([
    ...rows(3, {}),
    ...rows(2, { shape: "thin", hold: "unbacked_fact", grade: { label: "honest", why: "" } }),
    ...rows(1, { shape: "thin", hold: "unbacked_fact", grade: { label: "guess", why: "busy" } }),
    ...rows(1, { shape: "thin", hold: "customer_domain", opening: null, grade: null }),
  ]);
  assert.deepEqual([t.held, t.heldWritten, t.heldHonest.length], [4, 3, 2]);
  assert.deepEqual(t.holds, { unbacked_fact: 3, customer_domain: 1 });
  assert.deepEqual(t.byShape.thin, { checks: 4, sent: 0, honestSent: 0, badSent: 0, heldHonest: 2 });
  assert.deepEqual(t.byShape.open_all_hours, { checks: 3, sent: 3, honestSent: 3, badSent: 0, heldHonest: 0 });
});

test("the report says the lines, every bad opening sent and every honest one held, what it cost, and the verdict", () => {
  const results = [
    ...rows(10, {}),
    {
      ...rows(1, {})[0],
      id: "towing-all-hours",
      round: 2,
      source: "writer",
      opening: "You probably get calls at 3 AM.",
      grade: { label: "guess", why: "probably" },
    },
    {
      ...rows(1, {})[0],
      id: "spa-open-late",
      shape: "open_late",
      hold: "unbacked_fact",
      detail: "8:30 PM",
      opening: "Open until 8:30 PM.",
      grade: { label: "honest", why: "" },
    },
  ];
  const t = tallyOf(results);
  const text = report(t, gateOf(t), results, { calls: 30, usd: 0.2345, byModel: { [MODELS.OPUS_5_5]: 0.2 } });
  assert.match(text, /^Opening check, graded: 12 checks\./);
  assert.match(text, /Honest and sent: 10 of 12 \(83%\); lower bound 0\.\d{3}, line 0\.75\./);
  assert.match(text, /Sent from the listing's own fields: 10 \(10 honest\); written by the model: 1 \(0 honest\)\./);
  assert.match(text, /SENT guess towing-all-hours #2 \(writer\): "You probably get calls at 3 AM\." \(probably\)/);
  assert.match(text, /TOO STRICT spa-open-late #1 \(listing\), held unbacked_fact \(8:30 PM\): "Open until 8:30 PM\."/);
  assert.match(text, /Spent \$0\.2345 at list price over 30 calls/);
  assert.match(text, /\n(HELD|NOT HELD)/);
});

/* ---------------------------------------------------------- the runner as run -- */

test("dry by default; asked to go live with no eval key it asks nothing, says SKIPPED and exits 0, never taking the production key", () => {
  const env = { ...process.env, ANTHROPIC_API_KEY: PRODUCTION_KEY };
  delete env.ANTHROPIC_EVAL_KEY;
  const run = (...args) =>
    spawnSync(process.execPath, ["--import", "tsx", "tooling/scripts/evals/opening-check.mjs", ...args], {
      cwd: ROOT,
      env,
      encoding: "utf8",
    });
  const dry = run();
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^dry: 12 businesses × 4 = 48 checks, every prompt built, nothing asked\./);
  const live = run("--live", "--repeats", "1");
  assert.equal(live.status, 0, live.stderr);
  assert.match(
    live.stdout,
    /^SKIPPED: ANTHROPIC_EVAL_KEY is not set\. Nothing was asked and nothing was graded: this is not a pass\./,
  );
  for (const out of [dry, live])
    assert.ok(!out.stdout.includes(PRODUCTION_KEY) && !out.stderr.includes(PRODUCTION_KEY));
});
