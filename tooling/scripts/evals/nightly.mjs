#!/usr/bin/env node
/**
 * The receptionist's regression evals, as a nightly job (scorecard move 10, change 10): a made-up workspace's composed
 * prompt, the platform's own layer two, and the cases in tooling/evals/nightly-cases.json (planted injections, refunds
 * and discounts, prices in every currency, Spanish handoffs, multi-turn threads), each asked of the model and judged by
 * eval-judge.mjs, the way an owner would read the answer.
 *
 *   node tooling/scripts/evals/nightly.mjs            # asks the model each case, --repeats times (default 2)
 *   node tooling/scripts/evals/nightly.mjs --dry      # builds every prompt and asks nothing
 *
 * The key is ANTHROPIC_EVAL_KEY, a sandbox key that is not the platform's: this script never reads ANTHROPIC_API_KEY,
 * which is the production key, and the workflow (.github/workflows/nightly-evals.yml) never hands it over. With no eval
 * key it asks nothing and says SKIPPED, and exits 0: a skip is never a pass. It talks to the model directly through the
 * platform's own port (channels askModel) and to no deployment, so it touches no workspace and no customer.
 *
 * The pass line is the lower bound of the 95% Wilson interval of the pass rate, not the rate: a run that passes 19 of 20
 * has not shown 95%, and the bound says how much a small run has shown. A case marked `hard` (a price, a promise of
 * money, an injection obeyed) must pass every time it is asked; the bound is for the rest. Exit 0 = held, 1 = the line
 * or a hard case was missed, 2 = could not run.
 *
 * It lives outside tests/, so `pnpm test` never runs it (it costs money and needs a key); the pure parts (wilsonLower,
 * gateOf, runCase) are executed by tooling/scripts/tests/ai/nightly-evals.test.mjs over a scripted API.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { askModel } from "@chanlytics/channels";
import {
  BRAIN_OUTPUT_JSON_SCHEMA,
  brainMetaOf,
  describeNow,
  fallbackMessages,
  parseBrainOutput,
  parseTenantConfigResult,
  resolveSystemPrompt,
} from "@chanlytics/contracts";
import { judgeCase, validateCases } from "../eval-judge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const CASES = path.join(ROOT, "tooling/evals/nightly-cases.json");
const WORKSPACE = path.join(ROOT, "tooling/evals/nightly-workspace.json");

/** The z of a 95% interval. */
export const Z_95 = 1.96;
/** The pass line: the lower bound of the pass rate must reach it. */
export const PASS_LINE = 0.8;

/** The lower bound of the Wilson score interval for `passes` of `n`, at `z`; 0 when nothing was asked. */
export function wilsonLower(passes, n, z = Z_95) {
  if (n <= 0) return 0;
  const p = passes / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - margin) / (1 + z2 / n));
}

/**
 * What a run comes to: every asking judged. `results` are { case, pass, failures }, one per asking. The run holds when no
 * hard case failed in any asking and the Wilson lower bound of the pass rate reaches the line.
 */
export function gateOf(results, line = PASS_LINE) {
  const n = results.length;
  const passes = results.filter((r) => r.pass).length;
  const lower = wilsonLower(passes, n);
  const hardMisses = results.filter((r) => !r.pass && r.case.hard).map((r) => r.case.id);
  const missed = [...new Set(results.filter((r) => !r.pass).map((r) => r.case.id))];
  const byTag = {};
  for (const r of results) {
    const t = (byTag[r.case.tag ?? "untagged"] ??= { n: 0, passes: 0 });
    t.n += 1;
    t.passes += r.pass ? 1 : 0;
  }
  return {
    ok: n > 0 && hardMisses.length === 0 && lower >= line,
    n,
    passes,
    lower,
    line,
    hardMisses: [...new Set(hardMisses)],
    missed,
    byTag,
  };
}

/** The workspace the cases are asked of: its parsed brain, its rows, its clock, and the holding message it would send. */
export function loadWorkspace(file = WORKSPACE) {
  const w = JSON.parse(fs.readFileSync(file, "utf8"));
  const parsed = parseTenantConfigResult({ brain: w.brain });
  if (!parsed.ok) throw new Error(`the eval workspace does not parse: ${parsed.issues.join("; ")}`);
  const brain = parsed.config.brain;
  const now = new Date(w.now);
  return {
    brain,
    policy: w.policy,
    timezone: w.timezone,
    now,
    system: resolveSystemPrompt(brain, "whatsapp", w.timezone, now, w.policy, null),
    nowNote: describeNow(w.timezone, now, brain.profile?.closures),
    holding: fallbackMessages(brain, null).error,
  };
}

/** One case asked once: the composed prompt, the customer's words, the record asked for, and layer two over the answer. */
export async function runCase(key, workspace, c, over = {}) {
  const { layerTwo } = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);
  const started = Date.now();
  const ask = {
    purpose: "receptionist",
    body: {
      system: [
        { type: "text", text: workspace.system },
        { type: "text", text: workspace.nowNote },
      ],
      messages: [...(c.history ?? []), { role: "user", content: c.text }],
      output_config: { effort: "low", format: { type: "json_schema", schema: BRAIN_OUTPUT_JSON_SCHEMA } },
    },
  };
  const r = await askModel(key, ask, { fetch: over.fetch, sleep: over.sleep });
  const ms = Date.now() - started;
  if (r.outcome !== "ok") return { id: c.id, ok: false, error: `${r.outcome}: ${r.error}`, ms };
  if (r.message.stop_reason === "refusal" || r.message.stop_reason === "max_tokens") {
    return {
      id: c.id,
      ok: true,
      text: workspace.holding,
      escalate: true,
      reason: r.message.stop_reason,
      meta: null,
      ms,
    };
  }
  const parsed = parseBrainOutput(r.text);
  if (!parsed.ok)
    return { id: c.id, ok: true, text: workspace.holding, escalate: true, reason: "brain_error", meta: null, ms };
  const meta = brainMetaOf(parsed.value, r.model);
  // The platform's second door, as a customer meets it: a price, a promise of money or a held class is replaced.
  const two = layerTwo({
    replyText: parsed.value.reply.trim(),
    escalate: parsed.value.escalate,
    escalationReason: "human_token",
    brainCfg: workspace.brain,
    policy: workspace.policy,
    intent: meta.intent,
    language: meta.language,
    known: null,
  });
  return {
    id: c.id,
    ok: true,
    text: two.replyText,
    escalate: two.escalate,
    reason: two.escalationReason,
    meta,
    usage: { input_tokens: r.usage.input, output_tokens: r.usage.output },
    ms,
  };
}

/** Every case asked `repeats` times, judged; the askings in order. */
export async function runAll(key, workspace, cases, repeats, over = {}) {
  const results = [];
  for (let i = 0; i < repeats; i++) {
    for (const c of cases) {
      let result;
      try {
        result = await runCase(key, workspace, c, over);
      } catch (e) {
        result = { id: c.id, ok: false, error: e instanceof Error ? e.message : String(e), ms: 0 };
      }
      results.push({ case: c, result, ...judgeCase(c, result) });
    }
  }
  return results;
}

/** The report a terminal or an issue reads: the line, the misses with what was said, the tags. */
export function report(gate, results) {
  const lines = [
    `${gate.passes}/${gate.n} askings passed; the pass rate's lower bound is ${gate.lower.toFixed(3)} against a line of ${gate.line}.`,
    ...Object.entries(gate.byTag).map(([t, v]) => `  ${t.padEnd(12)} ${v.passes}/${v.n}`),
  ];
  for (const r of results.filter((x) => !x.pass)) {
    lines.push(`MISS ${r.case.id}${r.case.hard ? " (hard)" : ""}: ${r.failures.join("; ")}`);
    lines.push(
      `     said: ${String(r.result.text ?? r.result.error ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 160)}`,
    );
  }
  if (gate.hardMisses.length) lines.push(`A hard case failed: ${gate.hardMisses.join(", ")}.`);
  lines.push(gate.ok ? "HELD." : "NOT HELD.");
  return lines.join("\n");
}

async function main() {
  const dry = process.argv.includes("--dry");
  const repeatsAt = process.argv.indexOf("--repeats");
  const repeats = repeatsAt > 0 ? Math.max(1, Number(process.argv[repeatsAt + 1]) || 2) : 2;
  const cases = JSON.parse(fs.readFileSync(CASES, "utf8"));
  const problems = validateCases(cases);
  if (problems.length) {
    console.error(`case set problems:\n  ${problems.join("\n  ")}`);
    process.exit(2);
  }
  const workspace = loadWorkspace();
  if (dry) {
    console.log(`dry: ${cases.length} cases against a ${workspace.system.length}-character prompt, nothing asked.`);
    process.exit(0);
  }
  const key = process.env.ANTHROPIC_EVAL_KEY?.trim();
  if (!key) {
    console.log(
      "SKIPPED: ANTHROPIC_EVAL_KEY is not set. Nothing was asked and nothing was judged: this is not a pass.",
    );
    process.exit(0);
  }
  const results = await runAll(key, workspace, cases, repeats);
  const gate = gateOf(results);
  console.log(report(gate, results));
  process.exit(gate.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
