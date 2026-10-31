/**
 * The second model screens before the lead judge (decision 0085). Before the judge reads a batch, Jev is asked the
 * questions that leave a place out, the kind and every exclusion, word for word as the shadow asks them; a place it fails
 * at 0.9 or over is left out on its answer and never put to the judge. Proved three ways: the rule over Jev's answers
 * (contracts), the collect over the lead world with a screen on its judge (core: every place lands in the class it lands
 * in without one, and the judge reads only the rest), and the edge's screen over a fake TypeSafe (its switch, its calls,
 * its rows in the usage ledger, a call that fails).
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels";
import {
  isSystemOneModel,
  judgeScreenCalls,
  judgeScreenKeys,
  judgeShadowCalls,
  screenedAnswer,
  screenFloorOf,
  systemOneDollars,
} from "@chanlytics/contracts";
import { startRound } from "../../../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../../../packages/core/src/leads/runner/collect.ts";
import { leadDb } from "../../../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { LABELS, PLAN } from "../../_lead-fixtures.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { at, withEnv } from "../../_cron-doors-world.mjs";
import { INPUT_TOKENS, JEV, aKey, failing, jev } from "../../ai/_system-one-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TYPESAFE_API_KEY", "TYPESAFE_SCREEN", "TYPESAFE_SHADOW"])
  delete process.env[k];

/** A choice as Jev answers it: the option, and how sure. */
const choice = (option, confidence) => ({ type: "choice", choice: option, probabilities: {}, confidence });
const FLOOR = screenFloorOf("lead_judge");

/* ------------------------------------------------------------------ the rule */

test("the screen is the judge's alone, at 0.9, and asks what leaves a place out, word for word as the shadow does", () => {
  assert.equal(FLOOR, 0.9);
  assert.equal(screenFloorOf("reply_read"), null, "a purpose with no screen asks its primary everything");
  assert.equal(screenFloorOf("receptionist"), null);
  assert.deepEqual(judgeScreenKeys(PLAN), ["kind", "chains"], "the kind, then each exclusion: never a criterion");
  const place = { ref: 4, name: "Iron Room", category: "Gym", city: "Austin", state: "TX", host: null };
  const [screen] = judgeScreenCalls(PLAN, [
    { ...place, rating: null, reviews: null, emails: [], phone_matches_site: null },
  ]);
  const [shadow] = judgeShadowCalls(PLAN, [
    { ...place, rating: null, reviews: null, emails: [], phone_matches_site: null },
  ]);
  assert.equal(screen.ref, 4);
  assert.equal(screen.state, shadow.state, "the same state the shadow is put");
  assert.deepEqual(Object.keys(screen.questions), ["kind", "chains"]);
  for (const key of ["kind", "chains"]) assert.deepEqual(screen.questions[key], shadow.questions[key], key);
});

test("only a sure fail leaves a place out; a pass, an unknown and a fail under the floor leave it to the judge", () => {
  const out = (answers) => screenedAnswer(PLAN, 7, answers, FLOOR);
  assert.deepEqual(out({ kind: choice("pass", 0.97), chains: choice("fail", 0.95) }), {
    ref: 7,
    criteria: [
      { key: "kind", answer: "pass", facts: [] },
      { key: "chains", answer: "fail", facts: [] },
    ],
    email_index: null,
    reason: "Chain gyms",
  });
  assert.equal(
    out({ kind: choice("fail", 0.9) }).reason,
    "Not one of the Personal trainers in Austin",
    "at the floor exactly, the kind's own words",
  );
  for (const [answers, why] of [
    [{ chains: choice("fail", 0.89) }, "a fail under the floor"],
    [{ chains: choice("pass", 0.99), kind: choice("pass", 0.99) }, "a sure pass"],
    [{ chains: choice("unknown", 0.99) }, "a sure unknown"],
    [{ chains: choice("maybe", 0.99) }, "an option it was not offered"],
    [{ chains: { type: "noul", noul: 0.99 } }, "an answer of another kind"],
    [{ right_kind: choice("fail", 0.99), independent: choice("fail", 0.99) }, "a criterion is never the screen's"],
    [{}, "nothing answered"],
  ])
    assert.equal(out(answers), null, why);
  const unsure = out({ kind: choice("pass", 0.5), chains: choice("fail", 0.93) });
  assert.deepEqual(
    unsure.criteria.map((c) => c.key),
    ["chains"],
    "a question it was unsure of is not kept, so the answer is never reused for it (rejudge.ts reads every key)",
  );
  assert.ok(isSystemOneModel(JEV) && !isSystemOneModel("claude-opus-5-5") && !isSystemOneModel(null));
});

/* -------------------------------------------------------------- the collect */

const OWNER = "job-1";

/** The probe of the lead world collected, with what the judge read by name; `screen` is put on its judge first. */
async function probed(screen) {
  const w = leadWorld({ plan: PLAN });
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: PLAN, p_via: "people", p_estimate_usd: 2 });
  const db = leadDb(w.db);
  const p = (owner = OWNER) => w.ports(owner, { db });
  const read = [];
  const judge = w.judge.judge;
  w.judge.judge = (plan, places, ...rest) => {
    read.push(...places.map((x) => x.name));
    return judge(plan, places, ...rest);
  };
  const asked = [];
  if (screen)
    w.judge.screen = async (plan, places, tenantId, roundId) => {
      asked.push({ names: places.map((x) => x.name), tenantId, roundId });
      return screen(plan, places);
    };
  await startRound(p(), w.round().id, OWNER);
  w.finishRuns();
  const [r1, r2] = w.runs();
  await collect(p("c1"), r1.id, "p0", "c1");
  await collect(p("c2"), r2.id, "p0", "c2");
  return { w, read, asked };
}

/** Jev, as the screen reads it: every chain gym a sure fail of the exclusion, every other place a sure pass. */
const chainsScreen = (plan, places) => ({
  answers: places.flatMap((x) => {
    const a = screenedAnswer(
      plan,
      x.ref,
      { kind: choice("pass", 0.95), chains: choice(LABELS.get(x.name) === "chain" ? "fail" : "pass", 0.96) },
      FLOOR,
    );
    return a ? [a] : [];
  }),
  model: JEV,
});

/** A world's members by their place on Maps: a lead's id is the world's own, and two worlds share only the places. */
const byPlace = (w) => {
  const placeOf = new Map(w.T.leads.map((l) => [l.id, l.place_id]));
  return new Map(w.members().map((m) => [placeOf.get(m.lead_id), m]));
};

test("ACCEPTANCE: a place the screen leaves out never reaches the judge, and lands where the judge would have put it", async () => {
  const before = await probed(null);
  const after = await probed(chainsScreen);
  const chains = before.read.filter((name) => LABELS.get(name) === "chain");
  assert.ok(chains.length > 0, "the probe holds chain gyms the judge read");
  assert.deepEqual(
    after.read,
    before.read.filter((name) => LABELS.get(name) !== "chain"),
    "the judge reads every place it read, but the chains",
  );
  assert.ok(after.asked.length > 0);
  assert.deepEqual(
    after.asked.flatMap((a) => a.names),
    before.read,
    "the screen is asked every place the judge would have read, before it",
  );
  assert.ok(after.asked.every((a) => a.tenantId === TENANT && a.roundId === after.w.round().id));

  const was = byPlace(before.w);
  const now = byPlace(after.w);
  assert.equal(now.size, was.size);
  for (const [placeId, m] of now)
    assert.deepEqual(
      [m.class, m.excluded_by],
      [was.get(placeId).class, was.get(placeId).excluded_by],
      `REGRESSION: ${placeId} landed elsewhere than the judge would have put it`,
    );
  const screened = [...now.values()].filter((m) => m.judgment?.model === JEV);
  assert.equal(screened.length, chains.length, "each chain answered by the second model, under its own name");
  for (const m of screened) {
    assert.deepEqual([m.class, m.excluded_by, m.reason], ["excluded", "chains", "Chain gyms"]);
    assert.equal(m.judgment.op_id, null, "no judge's call paid for it");
    assert.deepEqual(
      m.judgment.answer.criteria.map((c) => c.key),
      ["kind", "chains"],
    );
  }
  assert.ok(
    after.w.T.lead_judgments.length < before.w.T.lead_judgments.length,
    "fewer of the judge's calls kept: fewer were made",
  );
  assert.deepEqual(
    [after.w.round().state, after.w.round().question?.criterionKey],
    [before.w.round().state, before.w.round().question?.criterionKey],
    "the probe's question is asked from the same exclusions",
  );
});

test("a screen that is off, leaves nothing out or throws changes nothing: the judge reads every place", async () => {
  const before = await probed(null);
  for (const [screen, why] of [
    [async () => null, "off"],
    [async () => ({ answers: [], model: JEV }), "sure of nothing"],
    [
      async () => {
        throw new Error("a screen that broke its promise");
      },
      "threw",
    ],
  ]) {
    const run = await probed(screen);
    assert.deepEqual(run.read, before.read, why);
    assert.ok(![...byPlace(run.w).values()].some((m) => m.judgment?.model === JEV), why);
  }
});

/* ------------------------------------------------------------------ the edge */

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { setModelFetch } = await import(at("apps/edge/lib/model.ts"));
const { screened } = await import(at("apps/edge/lib/leads/lead-screen.ts"));
after(() => {
  setPg(null);
  setModelFetch(null);
});
let typesafe = null;
setModelFetch((url, init) => typesafe(url, init));
beforeEach(() => resetBreakers());

const KEY = aKey();
const T = "aaaaaaaa-0000-4000-8000-000000000001";
const ROUND = "dddddddd-0000-4000-8000-000000000001";
const place = (ref) => ({
  ref,
  name: `Place ${ref}`,
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  host: `place${ref}.example`,
  rating: 4.8,
  reviews: 40,
  emails: [],
  phone_matches_site: null,
});
/** The judge the screen is put before: never asked here. */
const inner = {
  judge: async () => ({ refused: true, why: "not asked" }),
  judgeCompanies: async () => ({ refused: true, why: "not asked" }),
};

/** One screen of two places under `env`, over `api`: what it answered, the ledger's rows and the lines written. */
async function screenTwo(api, env) {
  const tables = { ai_usage: [] };
  setPg(fakeDb(tables));
  typesafe = api.fetch;
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args.map(String).join(" "));
  try {
    const result = await withEnv(env, () => screened(inner).screen(PLAN, [place(1), place(2)], T, ROUND));
    return { result, rows: tables.ai_usage, lines };
  } finally {
    Object.assign(console, real);
  }
}

/** Jev: the second place a chain gym, surely; the first the right kind and nothing left out. */
const secondIsAChain = () =>
  jev((body) =>
    body.state.includes("Place 2")
      ? { kind: { choice: "pass", confidence: 0.95 }, chains: { choice: "fail", confidence: 0.97 } }
      : { kind: { choice: "pass", confidence: 0.95 }, chains: { choice: "pass", confidence: 0.95 } },
  );

test("the edge's screen asks nothing while its switch is off or its key unset, whatever the shadow's switch says", async () => {
  for (const env of [
    { TYPESAFE_API_KEY: undefined, TYPESAFE_SCREEN: undefined },
    { TYPESAFE_API_KEY: KEY, TYPESAFE_SCREEN: undefined },
    { TYPESAFE_API_KEY: KEY, TYPESAFE_SCREEN: "", TYPESAFE_SHADOW: "1" },
    { TYPESAFE_API_KEY: undefined, TYPESAFE_SCREEN: "1" },
    { TYPESAFE_API_KEY: KEY, TYPESAFE_SCREEN: "bbbbbbbb-0000-4000-8000-000000000002" },
  ]) {
    const api = secondIsAChain();
    const { result, rows } = await screenTwo(api, env);
    assert.equal(result, null, JSON.stringify(env));
    assert.deepEqual([api.calls.length, rows.length], [0, 0], `nothing sent, nothing kept: ${JSON.stringify(env)}`);
  }
});

test("on, a call a place, the kind and the exclusions alone; the sure chain is left out; each call a row of the ledger, not a shadow", async () => {
  for (const value of ["1", `x, ${T.toUpperCase()}`]) {
    const api = secondIsAChain();
    const { result, rows } = await screenTwo(api, { TYPESAFE_API_KEY: KEY, TYPESAFE_SCREEN: value });
    assert.equal(api.calls.length, 2, `${value}: a call a place`);
    assert.ok(api.calls.every((c) => JSON.stringify(Object.keys(c.body.questions)) === '["kind","chains"]'));
    assert.deepEqual(result, {
      answers: [screenedAnswer(PLAN, 2, { kind: choice("pass", 0.95), chains: choice("fail", 0.97) }, FLOOR)],
      model: JEV,
    });
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.deepEqual(
        [r.tenant_id, r.purpose, r.port, r.shadow, r.subject_id, r.outcome, r.model],
        [T, "lead_judge", "typesafe", false, ROUND, "answered", JEV],
      );
      assert.equal(r.usd, systemOneDollars(INPUT_TOKENS), "its input, priced; its output is free");
      assert.equal(r.question ?? null, null, "no comparison columns: it is no shadow (00275's check)");
    }
  }
});

test("a call that fails screens nothing of its place, which goes to the judge; the row and the line say so", async () => {
  const ok = secondIsAChain();
  const bad = failing(500);
  const api = {
    calls: ok.calls,
    fetch: (url, init) =>
      JSON.parse(init.body).state.includes("Place 2") ? bad.fetch(url, init) : ok.fetch(url, init),
  };
  const { result, rows, lines } = await screenTwo(api, { TYPESAFE_API_KEY: KEY, TYPESAFE_SCREEN: "1" });
  assert.deepEqual(result, { answers: [], model: JEV }, "the chain's call failed: it is the judge's to read");
  assert.deepEqual(rows.map((r) => r.outcome).sort(), ["answered", "unreachable"]);
  assert.ok(
    lines.some((l) => l.includes("lead_screen_failed")),
    "the failure is a line alerting can find",
  );
  assert.ok(!lines.some((l) => l.includes(KEY)), "the key is never written");
});
