/**
 * What only a business's own website can show (decision 0095): a plan with a criterion on_site reads each place's home
 * page before its judge asks, once a host, and the judge cites what it says as one more quoted fact. The real runner and
 * the real database adapter over the world in memory, the provider, the judge and the page reader faked. A place the time
 * could not read for waits for the next job, whole, rather than being judged blind; and what was read is paid for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRound } from "../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../packages/core/src/leads/runner/collect.ts";
import { rejudgeProbe } from "../../../packages/core/src/leads/runner/rejudge.ts";
import { JUDGE_MARGIN_MS } from "../../../packages/core/src/leads/runner/rules.ts";
import {
  JUDGE_OUTPUT_SCHEMA,
  judgeQuestions,
  judgeScreenCalls,
  judgeShadowCalls,
  judgeSystemPrompt,
  judgeUserContent,
  parseJudgeAnswer,
} from "../../../packages/contracts/src/leads/lead-judge.ts";
import { classify } from "../../../packages/contracts/src/leads/search/class.ts";
import { LEAD_SITE_FACT_MAX, LEAD_SITE_READ_USD } from "../../../packages/contracts/src/leads/search/caps.ts";
import { estimateRoundUsd } from "../../../packages/contracts/src/leads/search/cards.ts";
import { planReadsSites } from "../../../packages/contracts/src/leads/search/plan.ts";
import { LeadSearchPlanSchema } from "../../../packages/contracts/src/leads/search/plan-schema.ts";
import { searchCardView } from "../../../packages/contracts/src/leads/search/search-card.ts";
import { leadPlanFactLine } from "../../../packages/contracts/src/leads/lead-plan.ts";
import { planLeadSearch } from "../../../packages/contracts/src/leads/lead-plan-schema.ts";
import { leadDb } from "../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";

const OWNER = "job-1";
/** The fixture's plan with a criterion only a website can show. */
const READING = {
  ...PLAN,
  criteria: [
    ...PLAN.criteria,
    { key: "offers_boxing", text: "offers boxing classes", standard: "seen", required: true, on_site: true },
  ],
};

/** A search on a plan, started and past its probe's start, its judge kept so what it was shown can be read. */
async function started(plan = READING) {
  const w = leadWorld({ plan });
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: plan, p_via: "people", p_estimate_usd: 2 });
  const db = leadDb(w.db);
  const shown = [];
  const asked = w.judge.judge;
  w.judge.judge = async (...a) => {
    shown.push(...a[1]);
    return asked.apply(w.judge, a);
  };
  const p = (owner = OWNER, o = {}) => w.ports(owner, { db, ...o });
  await startRound(p(), w.round().id, OWNER);
  w.finishRuns();
  return { w, db, p, shown };
}

/** The page reader, kept: each host read once is the point. */
function reader(w, ms = 0) {
  const asked = [];
  const read = w.wires.readSite;
  return {
    asked,
    readSite: async (host, timeoutMs) => {
      asked.push({ host, timeoutMs });
      w.clock.ms += ms;
      return read(host);
    },
  };
}

test("a plan reads sites only where a criterion says so, and says so on its card; a plan made before it was asked reads none", () => {
  assert.equal(planReadsSites(PLAN), false);
  assert.equal(planReadsSites(READING), true);
  const parsed = LeadSearchPlanSchema.parse(READING);
  assert.equal(parsed.criteria.at(-1).on_site, true, "the flag rides the schema, or a saved plan would lose it");
  assert.equal(LeadSearchPlanSchema.parse(PLAN).criteria[0].on_site, undefined);
  const planned = planLeadSearch({
    looking_for: "local_businesses",
    country: "US",
    count: 50,
    who: "gyms",
    who_one: "gym",
    category_key: "gym",
    terms: ["gym"],
    city: "Austin",
    region: "TX",
    zip: null,
    contact: "phone",
    criteria: [
      { text: "offers boxing classes", standard: "seen", required: true, on_site: true },
      { text: "family-owned", standard: "likely", required: false },
    ],
    leave_out: [],
    asked: "gyms in Austin with boxing classes",
  });
  assert.equal(planned.ok, true);
  assert.deepEqual(
    planned.plan.criteria.map((c) => c.on_site),
    [true, undefined],
    "made by the planner: set where asked, and absent elsewhere, so a plan that reads none is the plan it always was",
  );
  const view = searchCardView({ kind: "lead_search", plan: null, payload: { plan: planned.plan } });
  assert.match(view.sheet.rows.find((r) => r.label === "Must have").value, /Offers boxing classes \(on its website\)/);
  assert.match(leadPlanFactLine(planned.plan, null), /reads each one's website/);
  assert.doesNotMatch(leadPlanFactLine(PLAN, null), /website/);
});

test("a plan that reads sites reserves for it, at a read a place, with the same room; one that does not is priced as it was", () => {
  const places = 100;
  const more = estimateRoundUsd(READING, "main", places) - estimateRoundUsd(PLAN, "main", places);
  assert.ok(Math.abs(more - places * LEAD_SITE_READ_USD * 1.3) < 0.001, `${more}`);
});

test("the judge is told what the site says only where the plan reads sites: its words as one quoted fact, the key it may cite, and the question that needs it", () => {
  const place = {
    ref: 0,
    name: "Rock Gym",
    category: "Gym",
    city: "Austin",
    state: "TX",
    host: "rock.example",
    rating: 4.5,
    reviews: 12,
    emails: [],
    phone_matches_site: true,
  };
  assert.doesNotMatch(judgeUserContent([place]), /"site"/, "a plan that reads none shows what it always did");
  assert.doesNotMatch(judgeSystemPrompt(PLAN), /\bsite\b(?!_)/, "and is told nothing of it");
  const shown = judgeUserContent([
    { ...place, site: `We <b>teach</b> boxing\u202e ${"x".repeat(LEAD_SITE_FACT_MAX)}` },
  ]);
  const [fact] = JSON.parse(shown.slice("<places>\n".length, -"\n</places>".length));
  assert.ok(fact.site.startsWith("We b teach /b boxing"), "no angle bracket and no format character rides in");
  assert.ok(fact.site.length <= LEAD_SITE_FACT_MAX);
  assert.equal(JSON.parse(judgeUserContent([{ ...place, site: null }]).slice(9, -10))[0].site, null);
  const prompt = judgeSystemPrompt(READING);
  assert.match(prompt, /in site what its own website says/);
  assert.match(prompt, /phone_matches_site, site\)/);
  assert.match(judgeQuestions(READING).offers_boxing, /SEEN on the business's own website/);
  assert.ok(
    JUDGE_OUTPUT_SCHEMA.properties.places.items.properties.criteria.items.properties.facts.items.enum.includes("site"),
  );

  const answer = (facts) => ({
    places: [
      {
        ref: 0,
        criteria: ["kind", ...READING.criteria.map((c) => c.key), "chains"].map((key) => ({
          key,
          answer: "pass",
          facts,
        })),
        email_index: null,
        reason: "Says it on its site",
      },
    ],
  });
  assert.equal(parseJudgeAnswer(answer(["site"]), READING, [{ ...place, site: "We teach boxing" }]).ok, true);
  const blind = parseJudgeAnswer(answer(["site"]), READING, [{ ...place, site: null }]);
  assert.equal(blind.ok, false, "a pass cannot cite a site it was not shown");
  const seen = parseJudgeAnswer(answer(["site"]), READING, [{ ...place, site: "We teach boxing" }]).answers[0];
  assert.equal(classify(READING, seen, { ...place, site: "We teach boxing" }, "none", true, "ok").class, "qualified");

  // Code holds the rubric's word: a pass that cites anything but the site is the listing's say, whatever its standard.
  const listing = parseJudgeAnswer(answer(["host"]), READING, [{ ...place, site: "We teach boxing" }]).answers[0];
  const held = (plan) => classify(plan, listing, { ...place, site: "We teach boxing" }, "none", true, "ok");
  assert.deepEqual([held(READING).class, held(READING).reasons], ["review", ["inferred:offers_boxing"]]);
  const likely = { ...READING, criteria: READING.criteria.map((c) => (c.on_site ? { ...c, standard: "likely" } : c)) };
  assert.deepEqual(held(likely).reasons, ["inferred:offers_boxing"]);
});

test("a page's words never reach a second model: the shadow and the screen see no site, and are not asked what only a site can answer", () => {
  const place = {
    ref: 0,
    name: "Rock Gym",
    category: "Gym",
    city: "Austin",
    state: "TX",
    host: "rock.example",
    rating: 4.5,
    reviews: 12,
    emails: [],
    phone_matches_site: true,
    site: "Ask for Maria, the owner",
  };
  for (const [call] of [judgeShadowCalls(READING, [place]), judgeScreenCalls(READING, [place])]) {
    assert.doesNotMatch(call.state, /Maria/);
    assert.equal(call.questions.offers_boxing, undefined);
  }
  assert.ok(judgeShadowCalls(READING, [place])[0].questions.right_kind, "the rest of the rubric is compared as before");
});

test("the collect reads each place's site once, before the judge, shows it what it says, and finds the page in hand for the mark; what it read is paid for against its round", async () => {
  const { w, p, shown } = await started();
  w.sites["https://place0001.example"] = "# Rock Gym\n\nWe teach [boxing](https://x.example/b) classes.";
  w.pages["https://place0002.example"] = `<head><link rel="apple-touch-icon" sizes="180x180" href="/mark.png"></head>`;
  const r = reader(w);
  const out = await collect(p("c1", { readSite: r.readSite }), w.runs()[0].id, "p0", "c1");
  assert.equal(out.kind, "committed", JSON.stringify(out));
  const hosts = r.asked.map((a) => a.host);
  assert.equal(
    new Set(hosts).size,
    hosts.length,
    "no host read twice: not for the judge and the mark, not for two listings",
  );
  const one = shown.find((f) => f.host === "place0001.example");
  assert.equal(one.site, "Rock Gym We teach boxing classes.", "its words, in one line, not its Markdown");
  assert.equal(
    shown.find((f) => f.host === "place0003.example").site,
    null,
    "a site that answered nothing says nothing",
  );
  assert.equal(
    w.T.leads.find((l) => l.place_id === "ChIJfixture0002")?.logo_url,
    "https://place0002.example/mark.png",
    "the mark is read off the page the judge's read brought",
  );
  assert.equal(out.siteReads, hosts.length, "the line the job logs says how many");
  assert.deepEqual(
    w.siteSpends,
    [{ tenant_id: TENANT, round_id: w.round().id, reads: hosts.length, usd: hosts.length * LEAD_SITE_READ_USD }],
    "paid once, against the round, as the collect lets go of its run",
  );
});

test("a site's booking link reaches the judge whatever its main words say: a real salon's header said Book online, and its main words said call", async () => {
  const { w, p, shown } = await started();
  w.sites["https://place0001.example"] = "Call us to book your visit.";
  w.pages["https://place0001.example"] = `<a href="https://www.vagaro.com/rockgym">Book online</a>`;
  w.sites["https://place0002.example"] = "We teach boxing.";
  w.pages["https://place0002.example"] = `<a href="https://www.vagaro.com/pro/">Powered by Vagaro</a>`;
  w.sites["https://place0003.example"] = "y ".repeat(LEAD_SITE_FACT_MAX);
  w.pages["https://place0003.example"] = `<a href="https://rockgym.zenoti.com/webstoreNew/services">Book</a>`;
  await collect(p("c1", { readSite: reader(w).readSite }), w.runs()[0].id, "p0", "c1");
  const said = (host) => shown.find((f) => f.host === host).site;
  assert.equal(
    said("place0001.example"),
    "Booking link on this site: https://www.vagaro.com/rockgym · Call us to book your visit.",
  );
  assert.equal(said("place0002.example"), "We teach boxing.", "a platform's badge is no way to book");
  assert.ok(said("place0003.example").startsWith("Booking link on this site: https://rockgym.zenoti.com/"));
  assert.ok(said("place0003.example").length <= LEAD_SITE_FACT_MAX, "the link is inside the fact's own size");
});

test("a plan that reads no sites shows the judge what it always did, and reads a site for a mark alone", async () => {
  const { w, p, shown } = await started(PLAN);
  const r = reader(w);
  await collect(p("c1", { readSite: r.readSite }), w.runs()[0].id, "p0", "c1");
  assert.ok(shown.length > 0);
  assert.ok(shown.every((f) => !("site" in f)));
  assert.ok(r.asked.length > 0, "its marks still read");
  assert.equal(w.siteSpends[0].reads, new Set(r.asked.map((a) => a.host)).size, "and those are paid for too");
});

test("no more sites are read at once than the reader's plan renders, for the judge or for the marks: a sixth would wait in its queue with its own timeout running", async () => {
  for (const plan of [READING, PLAN]) {
    const { w, p } = await started(plan);
    w.pages["https://place0001.example"] = "<title>Rock Gym</title>";
    const read = w.wires.readSite;
    let open = 0;
    let most = 0;
    const readSite = async (host) => {
      most = Math.max(most, ++open);
      const page = await read(host);
      open -= 1;
      return page;
    };
    await collect(p("c1", { readSite }), w.runs()[0].id, "p0", "c1");
    assert.equal(most, 5, planReadsSites(plan) ? "reading for the judge" : "reading for the marks alone");
  }
});

test("a reader that answers none of a batch's sites is the reader, not the sites: the job is tried again, nothing judged and nothing committed", async () => {
  const { w, p, shown } = await started();
  const before = w.runs()[0].read_offset;
  await assert.rejects(collect(p("c1"), w.runs()[0].id, "p0", "c1"), (e) => e.name === "LeadRetry");
  assert.deepEqual([shown.length, w.members().length, w.runs()[0].read_offset], [0, 0, before]);
  assert.equal(w.siteSpends[0].reads > 0, true, "what it asked for is still paid for");
});

test("short of time, a batch stops at the first place whose site could not be asked for: judged, committed and offset up to it, and the rest is the next job's, whole", async () => {
  const { w, p, shown } = await started();
  for (let n = 1; n <= 25; n++) w.sites[`https://place${String(n).padStart(4, "0")}.example`] = "We teach boxing.";
  const r = reader(w, 2_000);
  // A deadline that leaves the reads a moment over the judge's bound: enough for a few, not for all.
  const ports = p("c1", { readSite: r.readSite, deadline: w.clock.ms + JUDGE_MARGIN_MS + 9_000 });
  const out = await collect(ports, w.runs()[0].id, "p0", "c1");
  assert.equal(out.kind, "committed", JSON.stringify(out));
  const read = new Set(r.asked.map((a) => a.host));
  assert.ok(read.size > 0 && read.size < 12, `${read.size} of the batch's sites`);
  assert.ok(
    shown.every((f) => read.has(f.host)),
    "no place is judged without its site for want of time",
  );
  assert.ok(
    r.asked.every((a) => a.timeoutMs >= 4_000),
    "and none is given less than its least",
  );
  const run = w.runs()[0];
  assert.ok(run.read_offset > 0 && run.read_offset < 25, `moved as far as it read: ${run.read_offset}`);
  assert.deepEqual(
    w.jobsOf("lead_collect").filter((j) => j.payload.seq === `p${run.read_offset}`).length,
    1,
    "the next collect rides the commit, from where this one stopped",
  );
  const later = await collect(p("c2"), run.id, `p${run.read_offset}`, "c2");
  assert.equal(later.kind, "committed", JSON.stringify(later));
  const ids = w.T.lead_search_members.map((m) => m.lead_id);
  assert.equal(new Set(ids).size, ids.length, "and nothing is judged or committed twice");
});

test("a batch the time cut short has no judge behind it, so its marks are given the time that judge would have kept", async () => {
  const { w, p } = await started();
  for (let n = 1; n <= 25; n++) {
    const at = `https://place${String(n).padStart(4, "0")}.example`;
    w.sites[at] = "We teach boxing.";
    w.pages[at] = `<head><link rel="apple-touch-icon" sizes="180x180" href="/touch.png"></head>`;
  }
  const r = reader(w, 2_000);
  const pictures = [];
  // The reads end a moment over the judge's bound, and each picture takes longer than that moment.
  const out = await collect(
    {
      ...p("c1", { readSite: r.readSite, deadline: w.clock.ms + JUDGE_MARGIN_MS + 9_000 }),
      fetchBytes: async (url) => {
        pictures.push(url);
        w.clock.ms += 3_000;
        return null;
      },
      storeMark: async () => null,
    },
    w.runs()[0].id,
    "p0",
    "c1",
  );
  assert.equal(out.kind, "committed", JSON.stringify(out));
  assert.ok(pictures.length > 1, `${pictures.length} of the marks of the ${r.asked.length} places it read`);
});

test("with no time to read even the first site nothing moves, and the job that waits is one of its own: this job already holds the name its offset would give it", async () => {
  const { w, p, shown } = await started();
  const r = reader(w);
  const ports = p("c1", { readSite: r.readSite, deadline: w.clock.ms + JUDGE_MARGIN_MS + 1_000 });
  const out = await collect(ports, w.runs()[0].id, "p0", "c1");
  assert.equal(out.kind, "committed", JSON.stringify(out));
  assert.deepEqual([r.asked.length, shown.length, w.members().length], [0, 0, 0], "nothing read, judged or kept");
  const run = w.runs()[0];
  assert.equal(run.read_offset, 0);
  const waiting = w.jobsOf("lead_collect").filter((j) => /^p0\.w\d+$/.test(j.payload.seq));
  assert.equal(waiting.length, 1, JSON.stringify(w.jobsOf("lead_collect").map((j) => j.payload.seq)));
  assert.equal(Date.parse(waiting[0].due_at) - w.clock.ms, 15_000, "a poll's wait: the next tick's start has the time");
});

test("re-judging under a plan that reads sites reads them first, and pays; short of time for them the job is tried again, nothing judged blind", async () => {
  const { w, p, shown } = await started(PLAN);
  await collect(p("c1", { readSite: async () => null }), w.runs()[0].id, "p0", "c1");
  // The owner's answer changes the plan to one that asks what only a site shows.
  const round = { ...w.round(), plan: READING, plan_version: 2 };
  shown.length = 0;
  w.sites["https://place0001.example"] = "We teach boxing.";
  const r = reader(w);
  const out = await rejudgeProbe(p("r1", { readSite: r.readSite }), round);
  assert.ok(out.judged > 0, JSON.stringify(out));
  assert.equal(shown.find((f) => f.host === "place0001.example").site, "We teach boxing.");
  assert.ok(w.siteSpends.some((s) => s.round_id === round.id && s.reads > 0));
  const short = await rejudgeProbe(p("r2", { readSite: r.readSite, deadline: w.clock.ms + JUDGE_MARGIN_MS + 1_000 }), {
    ...round,
    plan_version: 3,
  }).catch((e) => e);
  assert.equal(short.name, "LeadRetry", String(short));
});
