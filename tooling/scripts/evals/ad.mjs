#!/usr/bin/env node
/**
 * AI's ad writer (contracts ask/skills/ad), asked over made-up businesses in several trades: how the skill is judged
 * before it is relied on, and after any change to its words, its brief or its checks.
 *
 *   node --import tsx tooling/scripts/evals/ad.mjs                      # dry: builds every brief, asks nothing, and says what a call costs, computed
 *   node --import tsx tooling/scripts/evals/ad.mjs --live               # writes each case twice, and judges each
 *   node --import tsx tooling/scripts/evals/ad.mjs --live --only dental_first_visit_en,change_area_en   # some cases, by id
 *
 * Each case (tooling/evals/skills/ad.json) is a business, the service an ad offers and what its owner stands behind,
 * for one of the writer's three jobs. The writer is asked as the product will ask it (the skill's craftSystem,
 * adBriefText, the answer's schema, the skill's effort, Ask's route's model); what comes back is read as a draft
 * reads it (adVersionsOf, adChangeOf) and judged: code first, the checks a draft makes (adCraftIssues) and the case's
 * own expectations; then a judge model, against the rubric (rubric.ts). Some cases are ads Meta would refuse if the
 * writer followed the brief's temptation: there the pass is leaving it out, or writing no versions at all.
 *
 * The key is ANTHROPIC_EVAL_KEY, never the production edge's (skill-eval.mjs). With --live and no eval key it asks
 * nothing, judges nothing, says SKIPPED and exits 0: a skip is never a pass. A live run costs money: it runs on
 * Ruben's word. It writes no row and touches no workspace; what it found is written to tooling/backups/ (ignored by
 * git). It lives outside tests/ so `pnpm test` never runs it; its pure parts (loadCases, validateCases, briefOf,
 * expectFailures, callCost) are executed by tests/ask/skills/ad-skill.test.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  AD_CRAFT_JSON_SCHEMA,
  AD_JOBS,
  AD_JUDGE_JSON_SCHEMA,
  AD_PLACES,
  APPOINTMENT_WORDS,
  AdCraftAnswerSchema,
  AdJudgeAnswerSchema,
  MODEL_ROUTES,
  adBriefText,
  adChangeOf,
  adCraftIssues,
  adJudgeQuestion,
  adJudgeSystem,
  adVerdict,
  adVersionsOf,
  craftSystem,
  usageDollars,
} from "@chanlytics/contracts";
import { adBriefOf } from "../../../apps/dashboard/src/server/ask/skills/ad/brief.ts";
import { AD_SKILL } from "../../../apps/dashboard/src/server/ask/skills/ad/skill.ts";
import { argOf, evalKey, messagesClient, pct, structured } from "./skill-eval.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const CASES = path.join(ROOT, "tooling/evals/skills/ad.json");
/** The writer's model: the one Ask's route asks, as every craft call does. The judge is the same, reading strictly. */
const MODEL = MODEL_ROUTES.ask.model;
const JUDGE_MAX_TOKENS = 6_000;

/** The case set. */
export function loadCases(file = CASES) {
  return JSON.parse(fs.readFileSync(file, "utf8")).cases;
}

/** What is wrong with the case set, each a line; none when every case can be asked and judged. */
export function validateCases(cases) {
  const problems = [];
  const seen = new Set();
  if (!Array.isArray(cases) || cases.length === 0) return ["no cases"];
  for (const entry of cases) {
    const id = entry.id ?? "?";
    if (!entry.id || seen.has(entry.id)) problems.push(`a case with no id, or a second ${id}`);
    seen.add(entry.id);
    if (!AD_JOBS.includes(entry.job)) problems.push(`${id}: a job is one of ${AD_JOBS.join(", ")}`);
    if (!entry.business?.name || !APPOINTMENT_WORDS.includes(entry.business.word))
      problems.push(`${id}: a business needs a name and a word for a booking`);
    if (!entry.service?.name) problems.push(`${id}: an ad offers a service`);
    if (!["en", "es"].includes(entry.language)) problems.push(`${id}: an ad is in en or es`);
    if (!Array.isArray(entry.places) || entry.places.some((place) => !AD_PLACES.includes(place)))
      problems.push(`${id}: places are of ${AD_PLACES.join(", ")}`);
    if (entry.job === "rewrite" && !(entry.refused?.version?.text && entry.refused?.words))
      problems.push(`${id}: a rewrite needs the version Meta turned down and Meta's words`);
    if (entry.job === "change" && !(entry.change?.asked && entry.change?.versions?.length === 3))
      problems.push(`${id}: a change needs what the owner asked and the draft's three versions`);
    for (const pattern of [...(entry.expect?.includes ?? []), ...(entry.expect?.excludes ?? [])]) {
      let expression;
      try {
        expression = new RegExp(pattern, "iu");
      } catch {
        problems.push(`${id}: bad pattern ${pattern}`);
        continue;
      }
      // A pattern that matches nothing at all, or lost an escape to a control character, judges nothing.
      if (expression.test("") || [...pattern].some((letter) => letter.charCodeAt(0) < 0x20))
        problems.push(`${id}: the pattern ${JSON.stringify(pattern)} matches any words, or lost an escape`);
    }
  }
  return problems;
}

/** What a case asks the writer to do, with what only that job is handed. */
function askOf(entry) {
  if (entry.job === "rewrite") return { job: "rewrite", refused: entry.refused };
  if (entry.job === "change") return { job: "change", change: entry.change };
  return { job: "write" };
}

/**
 * A case as the craft call's brief, made by the builder New ad's route and AI's own turn use (adBriefOf), so a case is
 * judged on the question the product asks: a price is handed only where the business quotes prices.
 */
export function briefOf(entry) {
  return adBriefOf(
    {
      name: entry.business.name,
      tone: entry.business.tone ?? null,
      word: entry.business.word,
      neverPrices: !!entry.business.neverPrices,
      language: entry.language,
    },
    {
      service: { name: entry.service.name, price: entry.service.price ?? null },
      facts: entry.facts ?? [],
      picture: entry.picture ?? null,
      area: { place: entry.area?.place ?? null, miles: entry.area?.miles ?? 5 },
      places: entry.places,
    },
    askOf(entry),
  );
}

/**
 * A case's own expectations against what was written: each pattern it must hold and does not, each it must not and
 * does, versions where it wants none, a change other than the one it names, and a missing word on what was left out.
 */
export function expectFailures(entry, written) {
  const { versions, couldNot, change } = written;
  const text = versions.map((version) => `${version.headline}\n${version.text}`).join("\n");
  const expect = entry.expect ?? {};
  const failures = [
    ...(expect.includes ?? [])
      .filter((pattern) => !new RegExp(pattern, "iu").test(text))
      .map((pattern) => `missing /${pattern}/`),
    ...(expect.excludes ?? [])
      .filter((pattern) => new RegExp(pattern, "iu").test(text))
      .map((pattern) => `must not say /${pattern}/`),
  ];
  if (expect.noVersions && versions.length > 0) failures.push("wrote versions for an ad that is not run here");
  if (expect.couldNot && !couldNot) failures.push("said nothing of what it left out");
  if ("change" in expect && JSON.stringify(change ?? null) !== JSON.stringify(expect.change))
    failures.push(`change ${JSON.stringify(change ?? null)}, expected ${JSON.stringify(expect.change)}`);
  return failures;
}

/**
 * What one call costs at list price, computed from its own text and never measured (a lane holds no model key): about
 * three and a half characters a token going in, and the most the skill may write coming out, its thinking included.
 */
export function callCost(question) {
  const input = Math.ceil((craftSystem(AD_SKILL).length + question.length) / 3.5);
  const output = AD_SKILL.craft.maxTokens;
  return { input, output, dollars: usageDollars(MODEL, { input, output, cacheWrite: 0, cacheRead: 0 }) };
}

/** What the writer wrote for a case, read as a draft reads it. */
function writtenOf(entry, brief, answer) {
  const { versions, couldNot } = adVersionsOf(answer);
  return { versions, couldNot, change: entry.job === "change" ? adChangeOf(answer, brief) : undefined };
}

/** A case's verdict: the code's checks, the case's own expectations, and the judge's reading where there are words. */
async function judge(client, entry, brief, written) {
  const wordless = written.versions.length === 0;
  const issues = wordless ? [] : adCraftIssues(written.versions, brief);
  const failures = expectFailures(entry, written);
  if (wordless) return { pass: failures.length === 0, failed: failures, soft: { passed: 0, of: 0 }, notes: [] };
  const read = await structured(client, {
    model: MODEL,
    maxTokens: JUDGE_MAX_TOKENS,
    system: adJudgeSystem(),
    question: adJudgeQuestion(brief, written.versions, written.couldNot),
    schema: AD_JUDGE_JSON_SCHEMA,
    zod: AdJudgeAnswerSchema,
  });
  const verdict = read.answer
    ? adVerdict(issues, read.answer)
    : { pass: false, failed: ["the judge gave no answer"], soft: { passed: 0, of: 0 }, notes: [] };
  return { ...verdict, pass: verdict.pass && failures.length === 0, failed: [...verdict.failed, ...failures] };
}

async function main() {
  const argv = process.argv;
  const live = argv.includes("--live");
  const repeats = Math.max(1, Number(argOf(argv, "--repeats", "2")) || 2);
  const only = argOf(argv, "--only", null);
  const all = loadCases();
  const problems = validateCases(all);
  if (problems.length) {
    console.log(`The cases are not well formed:\n${problems.join("\n")}`);
    process.exit(1);
  }
  const cases = only ? all.filter((entry) => only.split(",").includes(entry.id)) : all;
  if (!live) {
    let most = 0;
    for (const entry of cases) {
      const question = adBriefText(briefOf(entry));
      most = Math.max(most, callCost(question).dollars ?? 0);
      console.log(`${entry.id}: ${entry.job}, ${entry.language}, brief ${question.length} characters`);
    }
    console.log(
      `dry: ${cases.length} cases, each brief built and nothing asked (the skill's system prompt is ${craftSystem(AD_SKILL).length} characters). One call costs at most about $${most.toFixed(2)} at list price, computed, not measured. Pass --live to ask the model.`,
    );
    process.exit(0);
  }
  if (!evalKey()) {
    console.log(
      "SKIPPED: ANTHROPIC_EVAL_KEY is not set (the environment, or .env.evals at the root). Nothing was asked and nothing was judged: this is not a pass.",
    );
    process.exit(0);
  }
  const client = await messagesClient();
  const rows = [];
  const times = [];
  for (const entry of cases) {
    const brief = briefOf(entry);
    for (let rep = 1; rep <= repeats; rep++) {
      let verdict;
      let written = null;
      let ms = 0;
      try {
        const began = Date.now();
        const read = await structured(client, {
          model: MODEL,
          maxTokens: AD_SKILL.craft.maxTokens,
          system: craftSystem(AD_SKILL),
          question: adBriefText(brief),
          schema: AD_CRAFT_JSON_SCHEMA,
          zod: AdCraftAnswerSchema,
        });
        ms = Date.now() - began;
        times.push(ms);
        written = read.answer ? writtenOf(entry, brief, read.answer) : null;
        verdict = written
          ? await judge(client, entry, brief, written)
          : { pass: false, failed: ["no answer"], soft: { passed: 0, of: 0 }, notes: [] };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        verdict = { pass: false, failed: [`the call failed: ${reason}`], soft: { passed: 0, of: 0 }, notes: [] };
      }
      rows.push({ id: entry.id, rep, ms, written, verdict });
      console.log(
        `${verdict.pass ? "ok  " : "MISS"} ${entry.id} (${rep}/${repeats}): soft ${verdict.soft.passed}/${verdict.soft.of}${ms ? `, ${(ms / 1000).toFixed(1)} s` : ""}`,
      );
      for (const line of verdict.failed) console.log(`     ! ${line}`);
      for (const note of verdict.notes) console.log(`     ~ ${note}`);
    }
  }
  const passed = rows.filter((row) => row.verdict.pass).length;
  const sorted = [...times].sort((first, second) => first - second);
  const lines = [
    `${passed} of ${rows.length} ads held, by ${MODEL} at ${AD_SKILL.craft.effort}.`,
    `Writer time: p50 ${(pct(sorted, 0.5) / 1000).toFixed(1)} s, p90 ${(pct(sorted, 0.9) / 1000).toFixed(1)} s.`,
  ];
  for (const line of lines) console.log(line);
  const out = path.join(ROOT, "tooling/backups", `skill-ad-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), model: MODEL, repeats, rows, lines }, null, 2));
  console.log(`Written to ${path.relative(ROOT, out)}.`);
  process.exit(passed === rows.length ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
