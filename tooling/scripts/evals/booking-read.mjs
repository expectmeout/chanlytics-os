#!/usr/bin/env node
/**
 * The booking reader (booking_read: contracts calendar/booking-notice.ts, asked by the edge's lib/calendar/booking-read.ts),
 * asked over booking tools' emails: how it is judged before a change to its words or its model, and after.
 *
 *   node --import tsx tooling/scripts/evals/booking-read.mjs                  # dry: builds every prompt, asks nothing, and says what a run costs, computed
 *   node --import tsx tooling/scripts/evals/booking-read.mjs --live           # reads each email once, as the job reads it
 *   node --import tsx tooling/scripts/evals/booking-read.mjs --live --runs 3 --only moved,no_year
 *
 * Each case (fixtures/bookings/bookings.json) is one email and the reading a right reader answers. The reader is asked as
 * the job asks it: the booking_read route's model, its thinking as the route has it, the prompt of noticePrompt, the
 * schema NOTICE_SCHEMA and its ceiling. Both readings are then read as the job reads them (noticeAnswerOf, strict), and
 * compared on what writes the calendar: whether it is a booking at all (or held, and why), its kind, its start and end,
 * a move's old time, and who the client is (clientKeyOf: the number, else the address, else the name).
 *
 * A wrong visit written (a booking that is none, a wrong time, a wrong client, a cancel read as a booking) is the miss that
 * matters: a time is offered or taken, a person is told. A booking held for a person costs a look. The run says each
 * apart, and exits 1 on either.
 *
 * The key is ANTHROPIC_EVAL_KEY, never the production edge's (skill-eval.mjs). With --live and no eval key it asks nothing,
 * judges nothing, says SKIPPED and exits 0: a skip is never a pass. A live run costs money: it runs on Ruben's word. It
 * writes no row and no file. It lives outside tests/ so `pnpm test` never runs it; its pure parts (loadCases,
 * validateCases, promptOf, outcomeOf, judgeReading, callCost) are executed by tests/calendar/notices/booking-read-cases.test.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BOOKING_TOOL_IDS,
  MODEL_ROUTES,
  NOTICE_READ_MAX_TOKENS,
  NOTICE_SCHEMA,
  clientKeyOf,
  noticeAnswerOf,
  noticePrompt,
  routeThinkingFor,
  usageDollars,
} from "@chanlytics/contracts";
import { argOf, evalKey, messagesClient } from "./skill-eval.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.join(HERE, "../fixtures/bookings/bookings.json");

/** The model the job asks: the booking_read route's. */
export const MODEL = MODEL_ROUTES.booking_read.model;
/** The thinking the edge's port sends it: off, as the route has it. */
const THINKING = routeThinkingFor("booking_read", MODEL);
const OUTCOMES = ["booked", "changed", "cancelled", "held:not_a_booking"];

/** The set: the business's zone, and the cases in the file's order. */
export function loadCases(file = CASES) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** What is wrong with a set, one sentence a problem; none for a set a run can trust. */
export function validateCases(set) {
  const problems = [];
  const seen = new Set();
  if (typeof set.tz !== "string" || !set.tz) problems.push("the set names the business's zone");
  for (const c of set.cases) {
    if (typeof c.id !== "string" || !c.id || seen.has(c.id))
      problems.push(`${c.id ?? "a case"}: needs an id of its own`);
    seen.add(c.id);
    if (!BOOKING_TOOL_IDS.includes(c.tool)) problems.push(`${c.id}: the tool is one of BOOKING_TOOL_IDS`);
    if (!Number.isFinite(Date.parse(c.receivedAt))) problems.push(`${c.id}: receivedAt is an instant`);
    if (typeof c.text !== "string" || !c.text.trim()) problems.push(`${c.id}: the text is the email's words`);
    if (!OUTCOMES.includes(c.expect?.outcome))
      problems.push(`${c.id}: expect.outcome is one of ${OUTCOMES.join(", ")}`);
    if (!c.answer || typeof c.answer !== "object") problems.push(`${c.id}: the answer is the right reading`);
    if (typeof c.why !== "string" || c.why.length < 10) problems.push(`${c.id}: says why`);
  }
  return problems;
}

/** What the reader is told and shown about a case, as the job builds it. */
export const promptOf = (set, c) =>
  noticePrompt({
    tool: c.tool,
    subject: c.subject ?? null,
    text: c.text,
    tz: set.tz,
    receivedAtMs: Date.parse(c.receivedAt),
  });

/** A reading as the job reads it: the booking it writes, or why it is held. */
const readOf = (set, c, answer) => noticeAnswerOf(answer, set.tz, Date.parse(c.receivedAt));

/** What a reading comes to, in the set's words: the kind it writes, or `held:` and the reason. */
export function outcomeOf(set, c, answer) {
  const read = readOf(set, c, answer);
  return read.hold ? `held:${read.hold}` : read.reading.kind;
}

/**
 * A live reading against the right one: whether it passes, what differs, and whether it wrote a wrong visit (`wrong`) or
 * held for a person what should have been written (`held`).
 */
export function judgeReading(set, c, answer) {
  const want = readOf(set, c, c.answer);
  const got = readOf(set, c, answer);
  if (want.hold) {
    if (got.hold === want.hold) return { pass: true, failures: [], miss: null };
    if (got.hold) return { pass: false, failures: [`held as ${got.hold}, wanted ${want.hold}`], miss: "held" };
    return { pass: false, failures: [`wrote a ${got.reading.kind}, wanted it held as ${want.hold}`], miss: "wrong" };
  }
  if (got.hold) return { pass: false, failures: [`held as ${got.hold}, wanted a ${want.reading.kind}`], miss: "held" };
  const a = got.reading;
  const b = want.reading;
  const iso = (ms) => (ms === null ? "none" : new Date(ms).toISOString());
  const failures = [];
  if (a.kind !== b.kind) failures.push(`kind ${a.kind}, wanted ${b.kind}`);
  if (a.start !== b.start) failures.push(`start ${iso(a.start)}, wanted ${iso(b.start)}`);
  if (a.end !== b.end) failures.push(`end ${iso(a.end)}, wanted ${iso(b.end)}`);
  if (a.previousStart !== b.previousStart)
    failures.push(`previous start ${iso(a.previousStart)}, wanted ${iso(b.previousStart)}`);
  if (clientKeyOf(a.client) !== clientKeyOf(b.client))
    failures.push(`client "${clientKeyOf(a.client)}", wanted "${clientKeyOf(b.client)}"`);
  return { pass: failures.length === 0, failures, miss: failures.length ? "wrong" : null };
}

/** What one email costs to read at list price, computed from its text at 3.5 characters a token (no model key here). */
export function callCost(set, c) {
  const { system, user } = promptOf(set, c);
  const input = Math.ceil((system.length + user.length + JSON.stringify(NOTICE_SCHEMA).length) / 3.5);
  return usageDollars(MODEL, { input, output: NOTICE_READ_MAX_TOKENS, cacheWrite: 0, cacheRead: 0 }) ?? 0;
}

/** One reading, asked as the job asks it; null for a refusal or an answer cut at its ceiling or out of JSON. */
async function ask(client, set, c) {
  const { system, user } = promptOf(set, c);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: NOTICE_READ_MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema: NOTICE_SCHEMA } },
    ...(THINKING ? { thinking: THINKING } : {}),
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const set = loadCases();
  const problems = validateCases(set);
  for (const p of problems) console.log(`! ${p}`);
  if (problems.length) process.exit(1);
  const only = argOf(argv, "--only", "");
  const cases = only ? set.cases.filter((c) => only.split(",").includes(c.id)) : set.cases;
  const runs = Math.max(1, Number(argOf(argv, "--runs", "1")) || 1);
  const cost = cases.reduce((sum, c) => sum + callCost(set, c), 0) * runs;
  if (!argv.includes("--live")) {
    console.log(
      `dry: ${cases.length} emails, each prompt built and nothing asked. ` +
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
  const tally = { pass: 0, wrong: 0, held: 0 };
  for (const c of cases) {
    for (let run = 1; run <= runs; run++) {
      let verdict;
      try {
        verdict = judgeReading(set, c, await ask(client, set, c));
      } catch (e) {
        verdict = {
          pass: false,
          failures: [`the call failed: ${e instanceof Error ? e.message : String(e)}`],
          miss: "held",
        };
      }
      if (verdict.pass) {
        tally.pass++;
        continue;
      }
      tally[verdict.miss]++;
      const label = verdict.miss === "wrong" ? "WRONG VISIT" : "held      ";
      console.log(`${label} ${c.id}${runs > 1 ? ` #${run}` : ""}: ${verdict.failures.join("; ")}`);
    }
  }
  console.log(
    `${tally.pass} of ${tally.pass + tally.wrong + tally.held} read as expected by ${MODEL}: ` +
      `${tally.wrong} wrote a wrong visit, ${tally.held} held for a person what should have been written.`,
  );
  process.exit(tally.wrong || tally.held ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
