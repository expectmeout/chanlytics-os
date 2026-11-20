#!/usr/bin/env node
/**
 * The yes check (the dashboard's server/ask/act/yes-check.ts), asked over what a person said to a card: how it is judged
 * before a typed or spoken yes is trusted with more, and after any change to its words or its model.
 *
 *   node --import tsx tooling/scripts/evals/yes-check.mjs                     # dry: builds every question, asks nothing, and says what a run costs, computed
 *   node --import tsx tooling/scripts/evals/yes-check.mjs --live              # asks each case once, as the press asks it
 *   node --import tsx tooling/scripts/evals/yes-check.mjs --live --runs 3 --only shorter_en,other_place_en   # some cases, each three times
 *
 * Each case (fixtures/yes/yes.json) is a card's own title and terms and what a person said to it, with whether that is a
 * go-ahead: true, false, or null where it is the product's call and not yet made (a thumbs up, "no, go ahead"), which a
 * run reports and never judges. The check is asked as the press asks it: the small JSON route's model (lead_json, the
 * dashboard's JSON_MODEL), its thinking as the route has it, effort low, and the system, schema, ceiling and two lines of
 * yes-check.ts.
 *
 * A false yes (it would have pressed where it should have waited) is the miss that matters: the card sends, posts or spends.
 * A false no costs a press. The run says each apart, and exits 1 on either or on an answer it could not read.
 *
 * The key is ANTHROPIC_EVAL_KEY, never the production edge's (skill-eval.mjs). With --live and no eval key it asks nothing,
 * judges nothing, says SKIPPED and exits 0: a skip is never a pass. A live run costs money: it runs on Ruben's word. It
 * writes no row and no file. It lives outside tests/ so `pnpm test` never runs it; its pure parts (loadCases,
 * validateCases, questionOf, verdictOf, callCost) are executed by tests/ask/act/yes-check-cases.test.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL_ROUTES, routeThinkingFor, usageDollars } from "@chanlytics/contracts";
import {
  YES_CHECK_MAX_TOKENS,
  YES_CHECK_SCHEMA,
  YES_CHECK_SYSTEM,
  YesCheckAnswerSchema,
  yesCheckQuestion,
} from "../../../apps/dashboard/src/server/ask/act/yes-check.ts";
import { argOf, evalKey, messagesClient } from "./skill-eval.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.join(HERE, "../fixtures/yes/yes.json");

/** The model the press asks: the small JSON route's, as the dashboard's askForJson names it. */
export const MODEL = MODEL_ROUTES.lead_json.model;
/** The thinking the edge's port sends it: off, as the route has it. */
const THINKING = routeThinkingFor("lead_json", MODEL);
const LANGS = ["en", "es"];

/** The cases, in the file's order. */
export function loadCases(file = CASES) {
  return JSON.parse(fs.readFileSync(file, "utf8")).cases;
}

/** What is wrong with a set, one sentence a problem; none for a set a run can trust. */
export function validateCases(cases) {
  const problems = [];
  const seen = new Set();
  for (const c of cases) {
    if (typeof c.id !== "string" || !c.id || seen.has(c.id))
      problems.push(`${c.id ?? "a case"}: needs an id of its own`);
    seen.add(c.id);
    if (!LANGS.includes(c.lang)) problems.push(`${c.id}: lang is en or es`);
    if (typeof c.action !== "string" || !c.action.trim()) problems.push(`${c.id}: the action is the card's own words`);
    if (typeof c.words !== "string" || !c.words.trim()) problems.push(`${c.id}: the words are what the person said`);
    if (c.expect !== true && c.expect !== false && c.expect !== null)
      problems.push(`${c.id}: expect is true, false or null`);
    if (typeof c.why !== "string" || c.why.length < 10) problems.push(`${c.id}: says why`);
  }
  return problems;
}

/** The two lines a case is asked: the card's own words, then the person's, as the press joins them. */
export const questionOf = (c) => yesCheckQuestion(c.action, c.words);

/**
 * A reading against its case: a pass; a false yes (it would have pressed); a false no (it would have waited for a press);
 * no reading (refused, cut or out of shape: the press reads that as a no); or the product's call, never judged.
 */
export function verdictOf(c, yes) {
  if (c.expect === null) return "open";
  if (yes === null) return "unread";
  if (yes === c.expect) return "pass";
  return yes ? "false_yes" : "false_no";
}

/** What one case costs to ask at list price, computed from its text at 3.5 characters a token (no model key here). */
export function callCost(c) {
  const input = Math.ceil((YES_CHECK_SYSTEM.length + questionOf(c).length) / 3.5);
  return usageDollars(MODEL, { input, output: YES_CHECK_MAX_TOKENS, cacheWrite: 0, cacheRead: 0 }) ?? 0;
}

/** One answer, asked as the press asks it: true, false, or null for a refusal, a cut answer or one out of shape. */
async function ask(client, c) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: YES_CHECK_MAX_TOKENS,
    system: YES_CHECK_SYSTEM,
    messages: [{ role: "user", content: questionOf(c) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: YES_CHECK_SCHEMA } },
    ...(THINKING ? { thinking: THINKING } : {}),
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const parsed = YesCheckAnswerSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.yes : null;
  } catch {
    return null;
  }
}

const LABELS = {
  false_yes: "FALSE YES",
  false_no: "false no ",
  unread: "UNREAD   ",
  open: "your call",
};

const said = (yes) => (yes === null ? "nothing" : yes ? "a yes" : "not a yes");

async function main() {
  const argv = process.argv.slice(2);
  const all = loadCases();
  const problems = validateCases(all);
  for (const p of problems) console.log(`! ${p}`);
  if (problems.length) process.exit(1);
  const only = argOf(argv, "--only", "");
  const cases = only ? all.filter((c) => only.split(",").includes(c.id)) : all;
  const runs = Math.max(1, Number(argOf(argv, "--runs", "1")) || 1);
  const open = cases.filter((c) => c.expect === null).length;
  const cost = cases.reduce((sum, c) => sum + callCost(c), 0) * runs;
  if (!argv.includes("--live")) {
    console.log(
      `dry: ${cases.length} cases (${open} the product's call), each question built and nothing asked. ` +
        `A live run of ${runs} pass${runs === 1 ? "" : "es"} costs about $${cost.toFixed(4)}, computed. Pass --live to ask ${MODEL}.`,
    );
    process.exit(0);
  }
  if (!evalKey()) {
    console.log(
      "SKIPPED: ANTHROPIC_EVAL_KEY is not set. Nothing was asked and nothing was judged: this is not a pass.",
    );
    process.exit(0);
  }
  const client = await messagesClient();
  const tally = { pass: 0, false_yes: 0, false_no: 0, unread: 0, open: 0 };
  for (const c of cases) {
    for (let run = 1; run <= runs; run++) {
      let yes = null;
      let error = "";
      try {
        yes = await ask(client, c);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const verdict = error ? "unread" : verdictOf(c, yes);
      tally[verdict]++;
      if (verdict === "pass") continue;
      const which = runs > 1 ? ` #${run}` : "";
      console.log(
        `${LABELS[verdict]} ${c.id}${which} (${c.lang}): read ${said(yes)} · "${c.words}"${error ? ` · ${error}` : ""}`,
      );
    }
  }
  const judged = tally.pass + tally.false_yes + tally.false_no + tally.unread;
  console.log(
    `${tally.pass} of ${judged} read as expected by ${MODEL}: ${tally.false_yes} false yes (would have pressed), ` +
      `${tally.false_no} false no (would have waited for a press), ${tally.unread} unread; ${tally.open} left to the product's call.`,
  );
  process.exit(tally.false_yes || tally.false_no || tally.unread ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
