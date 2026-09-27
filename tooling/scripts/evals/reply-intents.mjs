#!/usr/bin/env node
/**
 * The reply fixtures, read by the model (Reach out, Part 5, Task 1.5): how the reader's prompt is judged before PR 3
 * merges, and after any change to it.
 *
 *   node tooling/scripts/evals/reply-intents.mjs          # dry: builds every fixture's prompt and asks nothing
 *   node tooling/scripts/evals/reply-intents.mjs --live   # asks REACH_OUT_MODEL each fixture, with the real prompt
 *
 * Each fixture (fixtures/replies/replies.json) goes through what the job will do (PR 3): the intake's claim and plain
 * text (jobs' incomingEmailOf, the adapter the email job itself calls, so the two cannot drift), the reply's own words
 * (replyTextOf), the fenced user content and the fixed system prompt, the answer in REPLY_SCHEMA, and parseReplyReading.
 * Each reading is printed against the fixture's `expect`, and a live run that misses one exits 1.
 *
 * It sends no email, writes no row and no file. With --live and no ANTHROPIC_API_KEY it asks nothing, judges nothing,
 * says SKIPPED and exits 0: a skip is never a pass. It lives outside tests/ so `pnpm test` never runs it (it costs
 * money and needs a key), and in a directory of its own because tooling/scripts is at its module cap.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  REACH_OUT_MODEL,
  REPLY_READ_MAX_TOKENS,
  REPLY_SCHEMA,
  parseReplyReading,
  replySystemPrompt,
  replyTextOf,
  replyUserContent,
  zoneDayKey,
} from "@chanlytics/contracts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
// The built jobs package, as the database suites import it: tooling does not depend on it by name.
const { incomingEmailOf } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);
const FIXTURES = path.join(HERE, "../fixtures/replies/replies.json");

/** The fixture set: the lead the replies answer, the email they answer, and the replies. */
export function loadFixtures(file = FIXTURES) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** What the reader is asked about one reply: the claim, the system prompt and the fenced user content. */
export function readerInputOf(reply, set) {
  const e = incomingEmailOf(reply.email);
  const claim = e.claim;
  const user = replyUserContent({
    text: replyTextOf(e.text),
    subject: e.subject,
    automatic: claim === "auto_reply",
    receivedDay: zoneDayKey(Date.parse(e.receivedAt), set.lead.tz),
    answered: set.answered,
  });
  return { claim, system: replySystemPrompt(), user };
}

/** The names and addresses a referral must carry: each address, and each word that starts with a capital. */
const referralMarks = (s) => (s.match(/[^\s,;()]+@[^\s,;()]+|\b[A-Z][a-z]+\b/g) ?? []).map((t) => t.replace(/\.$/, ""));

/** One reading against its fixture's `expect`: the intent, the day, and who a wrong person pointed to. */
export function judgeReading(reply, reading) {
  const want = reply.expect;
  if (!reading) return { pass: false, failures: ["no reading (the answer did not parse)"] };
  const failures = [];
  if (reading.intent !== want.intent) failures.push(`intent ${reading.intent}, wanted ${want.intent}`);
  if (reading.day !== want.day) failures.push(`day ${reading.day ?? "none"}, wanted ${want.day ?? "none"}`);
  if (want.referTo) {
    const got = (reading.referTo ?? "").toLowerCase();
    for (const m of referralMarks(want.referTo))
      if (!got.includes(m.toLowerCase())) failures.push(`refer_to "${reading.referTo ?? ""}" misses ${m}`);
  } else if (reading.referTo) failures.push(`refer_to "${reading.referTo}", wanted none`);
  return { pass: failures.length === 0, failures };
}

/** The SDK the edge asks the model through (lib/model.ts), loaded only for a live run. */
async function messagesClient() {
  const require = createRequire(path.join(ROOT, "apps/edge/package.json"));
  const { default: Anthropic } = await import(pathToFileURL(require.resolve("@anthropic-ai/sdk")).href);
  return new Anthropic({ maxRetries: 1 });
}

/** One answer in REPLY_SCHEMA, as the edge's askJson asks for it; null for a refusal or an answer cut at its cap. */
async function ask(client, input) {
  const res = await client.messages.create({
    model: REACH_OUT_MODEL,
    max_tokens: REPLY_READ_MAX_TOKENS,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
    output_config: { format: { type: "json_schema", schema: REPLY_SCHEMA } },
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const set = loadFixtures();
  const inputs = set.replies.map((r) => ({ reply: r, input: readerInputOf(r, set) }));
  const unclaimed = inputs.filter(({ reply, input }) => input.claim !== reply.expect.claim);
  for (const { reply, input } of unclaimed)
    console.log(`! ${reply.email.id}: claimed ${input.claim}, the fixture says ${reply.expect.claim}`);
  if (!live) {
    console.log(`dry: ${inputs.length} replies, each prompt built and nothing asked. Pass --live to ask the model.`);
    process.exit(unclaimed.length ? 1 : 0);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`SKIPPED: ANTHROPIC_API_KEY is not set. Nothing was asked and nothing was judged: this is not a pass.`);
    process.exit(0);
  }
  const client = await messagesClient();
  let passed = 0;
  for (const { reply, input } of inputs) {
    let reading = null;
    let error = null;
    try {
      reading = parseReplyReading(await ask(client, input));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const verdict = error ? { pass: false, failures: [`the call failed: ${error}`] } : judgeReading(reply, reading);
    if (verdict.pass) passed++;
    const said = reading ? `${reading.intent} · ${reading.day ?? "no day"} · "${reading.summary}"` : "no reading";
    console.log(`${verdict.pass ? "ok  " : "MISS"} ${reply.email.id} (${input.claim}): ${said}`);
    for (const f of verdict.failures) console.log(`       ${f}`);
  }
  console.log(`${passed} of ${inputs.length} read as expected, by ${REACH_OUT_MODEL}.`);
  process.exit(passed === inputs.length && !unclaimed.length ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
