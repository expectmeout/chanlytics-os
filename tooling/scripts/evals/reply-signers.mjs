#!/usr/bin/env node
/**
 * Who signed a reply, read by the model and kept by the gate (decision 0052): what automatic naming waits on.
 *
 *   node --import tsx tooling/scripts/evals/reply-signers.mjs          # dry: each fixture's scripted answer through the gate
 *   node --import tsx tooling/scripts/evals/reply-signers.mjs --live   # asks REACH_OUT_MODEL each fixture, with the real prompt
 *
 * Each fixture (fixtures/replies/signers.json) answers the reach-out in replies.json, and goes through what the job does:
 * the intake's claim and words (jobs' incomingEmailOf), the reader's fenced input (reply-intents.mjs readerInputOf), the
 * answer in REPLY_SCHEMA and parseReplyReading, then the gate (contracts signerOf) with the workspace's own names as the
 * names a signer can never be. What the gate keeps is held to the fixture's `expect.signer`; a live run that misses one
 * exits 1. AUTOMATIC_NAMING is turned on only once a live run here passes whole.
 *
 * It sends no email, writes no row and no file. With --live and no ANTHROPIC_API_KEY it asks nothing, says SKIPPED and
 * exits 0: a skip is never a pass. Outside tests/, so `pnpm test` never runs it (it costs money and needs a key).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  REACH_OUT_MODEL,
  REPLY_READ_MAX_TOKENS,
  REPLY_SCHEMA,
  parseReplyReading,
  signerOf,
} from "@chanlytics/contracts";
import { loadFixtures, readerInputOf } from "./reply-intents.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIGNERS = path.join(HERE, "../fixtures/replies/signers.json");

/** The signer fixtures, and the reach-out they answer (replies.json's lead and email). */
export function loadSigners(file = SIGNERS) {
  return { signers: JSON.parse(fs.readFileSync(file, "utf8")), set: loadFixtures() };
}

/** What the gate keeps of a reading of one fixture: the signer's name, or null. */
export function gatedSigner(fixture, reading, set, signers) {
  if (!reading) return null;
  const kept = signerOf({
    name: reading.signer?.name,
    title: reading.signer?.title,
    text: fixture.email.text,
    intent: reading.intent,
    claim: fixture.expect.claim,
    business: set.lead.business,
    from: fixture.email.from?.address ?? null,
    notNames: [signers.workspace.name, ...signers.workspace.members, signers.workspace.from],
  });
  return kept ? kept.name : null;
}

/** One fixture's verdict: the gate's answer against `expect.signer`. */
export function judgeSigner(fixture, kept) {
  const want = fixture.expect.signer;
  return kept === want
    ? { pass: true, failures: [] }
    : {
        pass: false,
        failures: [`kept ${kept === null ? "no signer" : `"${kept}"`}, wanted ${want === null ? "none" : `"${want}"`}`],
      };
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
  const { signers, set } = loadSigners();
  let passed = 0;
  let client = null;
  if (live) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(
        "SKIPPED: ANTHROPIC_API_KEY is not set. Nothing was asked and nothing was judged: this is not a pass.",
      );
      process.exit(0);
    }
    const { createRequire } = await import("node:module");
    const require = createRequire(path.join(HERE, "../../../apps/edge/package.json"));
    const { default: Anthropic } = await import(pathToFileURL(require.resolve("@anthropic-ai/sdk")).href);
    client = new Anthropic({ maxRetries: 1 });
  }
  for (const fixture of signers.replies) {
    const input = readerInputOf(fixture, set);
    let reading = null;
    let error = null;
    try {
      reading = parseReplyReading(live ? await ask(client, input) : fixture.answer);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const kept = gatedSigner(fixture, reading, set, signers);
    const verdict = error ? { pass: false, failures: [`the call failed: ${error}`] } : judgeSigner(fixture, kept);
    if (verdict.pass) passed++;
    const said = reading ? `read "${reading.signer?.name ?? "nobody"}", kept "${kept ?? "nobody"}"` : "no reading";
    console.log(`${verdict.pass ? "ok  " : "MISS"} ${fixture.email.id}: ${said}`);
    for (const f of verdict.failures) console.log(`       ${f}`);
  }
  const by = live ? `by ${REACH_OUT_MODEL}` : "from the scripted answers";
  console.log(`${passed} of ${signers.replies.length} signers kept as expected, ${by}.`);
  process.exit(passed === signers.replies.length ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
