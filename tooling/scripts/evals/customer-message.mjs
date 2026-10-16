#!/usr/bin/env node
/**
 * Ask's customer message writer (contracts ask-skills/customer-message), asked over made-up businesses: how the skill is
 * judged before it merges, and after any change to its words, its brief or its checks.
 *
 *   node tooling/scripts/evals/customer-message.mjs                     # dry: builds every brief and asks nothing
 *   node tooling/scripts/evals/customer-message.mjs --live              # writes each case twice, and judges each
 *   node tooling/scripts/evals/customer-message.mjs --live --baseline   # judges the first drafts too: what the skill adds
 *   node tooling/scripts/evals/customer-message.mjs --live --only reminder_en_whatsapp_text,winback_es_whatsapp   # some cases, by id
 *
 * Each case (tooling/evals/skills/customer-message.json) is a business and the message Ask's card asked for, its versions
 * the first draft as the palette writes one today. The writer is asked as the dashboard asks it (server/ask/skills: the
 * skill's craftSystem, messageBriefText, the answer's schema, the skill's effort, Ask's route's model); what comes back is
 * read as a card reads it (craftedVersions) and judged: code first, the checks a card makes (messageCraftIssues) and the
 * case's own patterns, read with the values taken out; then a judge model, against the rubric (rubric.ts). A case passes
 * when every check and every hard criterion passes; the soft criteria are said as a share. Each writer call is timed: its
 * p50 and p90 say whether a craft call fits a palette turn (the design note's section 4).
 *
 * The key is ANTHROPIC_EVAL_KEY, never the production edge's: from the environment, or from .env.evals at the
 * repository's root (ignored by git). With --live and no eval key it asks nothing, judges nothing, says SKIPPED and exits
 * 0: a skip is never a pass. It costs money (about $3-4 for the set, twice, with the baseline): run it on Ruben's word.
 * It writes no row and touches no workspace; what it found is written to tooling/backups/ (ignored by git). It lives
 * outside tests/ so `pnpm test` never runs it; its pure parts (loadCases, validateCases, briefOf, patternFailures) are
 * executed by tooling/scripts/tests/ask/skills/customer-message-skill.test.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  APPOINTMENT_WORDS,
  CRAFT_CHANNELS,
  CUSTOMER_MESSAGE_SKILL,
  MESSAGE_CRAFT_JSON_SCHEMA,
  MESSAGE_JUDGE_JSON_SCHEMA,
  MODEL_ROUTES,
  MessageCraftAnswerSchema,
  MessageJudgeAnswerSchema,
  PARAM_SOURCES,
  craftSystem,
  craftedVersions,
  messageBriefText,
  messageCraftIssues,
  messageJudgeQuestion,
  messageJudgeSystem,
  messageVerdict,
} from "@chanlytics/contracts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const CASES = path.join(ROOT, "tooling/evals/skills/customer-message.json");
/** The writer's model, as the dashboard's craft call asks it (model-json.ts SKILL_MODEL): the one Ask's route asks. */
const WRITER_MODEL = MODEL_ROUTES.ask.model;
/** The judge: the same model, at high effort, reading strictly. */
const JUDGE_MODEL = MODEL_ROUTES.ask.model;
const JUDGE_MAX_TOKENS = 6_000;

/** The eval key: the environment's, else the one line of .env.evals at the root that names it. */
function evalKey() {
  if (process.env.ANTHROPIC_EVAL_KEY) return process.env.ANTHROPIC_EVAL_KEY;
  const file = path.join(ROOT, ".env.evals");
  if (!fs.existsSync(file)) return "";
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("ANTHROPIC_EVAL_KEY="));
  return line
    ? line
        .slice("ANTHROPIC_EVAL_KEY=".length)
        .trim()
        .replace(/^["']|["']$/g, "")
    : "";
}

/** The case set. */
export function loadCases(file = CASES) {
  return JSON.parse(fs.readFileSync(file, "utf8")).cases;
}

/** What is wrong with the case set, each a line; none when every case can be asked and judged. */
export function validateCases(cases) {
  const problems = [];
  const seen = new Set();
  if (!Array.isArray(cases) || cases.length === 0) return ["no cases"];
  for (const c of cases) {
    if (!c.id || seen.has(c.id)) problems.push(`a case with no id, or a second ${c.id}`);
    seen.add(c.id);
    const b = c.business ?? {};
    const m = c.message ?? {};
    if (!b.name || !APPOINTMENT_WORDS.includes(b.word))
      problems.push(`${c.id}: a business needs a name and a word for a booking`);
    if (!["marketing", "utility"].includes(m.category) || !["en", "es"].includes(m.language))
      problems.push(`${c.id}: a message is marketing or utility, in en or es`);
    const positions = (m.values ?? []).map((v) => v.position);
    if (positions.some((p, i) => p !== i + 1)) problems.push(`${c.id}: values are numbered 1, 2, 3 in order`);
    if ((m.values ?? []).some((v) => !PARAM_SOURCES.includes(v.kind) || !v.label))
      problems.push(`${c.id}: each value has a label and a kind`);
    const channels = CRAFT_CHANNELS.filter((ch) => m.draft?.[ch]);
    if (channels.length === 0) problems.push(`${c.id}: the draft has no version`);
    if (m.category === "marketing" && m.draft?.sms) problems.push(`${c.id}: a text never carries an offer`);
    for (const p of [...(c.expect?.includes ?? []), ...(c.expect?.excludes ?? [])]) {
      let re;
      try {
        re = new RegExp(p, "iu");
      } catch {
        problems.push(`${c.id}: bad pattern ${p}`);
        continue;
      }
      // A pattern that matches nothing at all ("$", once its backslash was lost) passes or fails every message, and a
      // control character is an escape that was eaten ("\b" read as a backspace): either judges nothing.
      if (re.test("") || /[\u0000-\u001f]/.test(p))
        problems.push(`${c.id}: the pattern ${JSON.stringify(p)} matches any words, or lost an escape`);
    }
  }
  return problems;
}

/** A case as the craft call's brief (contracts MessageBrief). */
export function briefOf(c) {
  return {
    business: {
      name: c.business.name,
      tone: c.business.tone ?? null,
      services: c.business.services ?? [],
      notes: c.business.notes ?? [],
      word: c.business.word,
    },
    message: {
      name: c.message.name,
      category: c.message.category,
      language: c.message.language,
      values: c.message.values,
      reused: !!c.message.reused,
      asked: c.message.asked ?? null,
      draft: c.message.draft,
    },
  };
}

/** The words of every version, the values taken out: what a case's own patterns are read against. */
const wordsOf = (v) =>
  [v.whatsapp?.body, v.email?.subject, v.email?.body, v.sms?.body]
    .filter(Boolean)
    .join("\n")
    .replace(/\{\{\d+\}\}/g, "…");

/** A case's own patterns against what was written: each one it must hold and does not, each it must not and does. */
export function patternFailures(c, versions) {
  const text = wordsOf(versions);
  const e = c.expect ?? {};
  return [
    ...(e.includes ?? []).filter((p) => !new RegExp(p, "iu").test(text)).map((p) => `missing /${p}/`),
    ...(e.excludes ?? []).filter((p) => new RegExp(p, "iu").test(text)).map((p) => `must not say /${p}/`),
  ];
}

/** The SDK the edge asks the model through (lib/model.ts), loaded only for a live run, on the eval key. */
async function messagesClient() {
  const require = createRequire(path.join(ROOT, "apps/edge/package.json"));
  const { default: Anthropic } = await import(pathToFileURL(require.resolve("@anthropic-ai/sdk")).href);
  return new Anthropic({ apiKey: evalKey(), maxRetries: 1 });
}

/** One structured answer, read by its zod; null for a refusal, a cut answer or one out of shape. */
async function structured(client, { model, maxTokens, system, question, schema, zod }) {
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: question }],
    output_config: { effort: "high", format: { type: "json_schema", schema } },
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return { answer: null, usage: res.usage };
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed;
  try {
    parsed = zod.safeParse(JSON.parse(text));
  } catch {
    return { answer: null, usage: res.usage };
  }
  return { answer: parsed.success ? parsed.data : null, usage: res.usage };
}

/** The writer, as the dashboard asks it: the skill's own words, the brief, its schema, its effort, its ceiling. */
async function write(client, brief) {
  const t0 = Date.now();
  const r = await structured(client, {
    model: WRITER_MODEL,
    maxTokens: CUSTOMER_MESSAGE_SKILL.craft.maxTokens,
    system: craftSystem(CUSTOMER_MESSAGE_SKILL),
    question: messageBriefText(brief),
    schema: MESSAGE_CRAFT_JSON_SCHEMA,
    zod: MessageCraftAnswerSchema,
  });
  return { ...r, ms: Date.now() - t0 };
}

/** The judge's verdicts on some words, with the code's checks of them: the case's verdict. */
async function judge(client, c, brief, versions, missing, couldNot) {
  const issues = messageCraftIssues(versions, brief, missing);
  const r = await structured(client, {
    model: JUDGE_MODEL,
    maxTokens: JUDGE_MAX_TOKENS,
    system: messageJudgeSystem(),
    question: messageJudgeQuestion(brief, versions, couldNot),
    schema: MESSAGE_JUDGE_JSON_SCHEMA,
    zod: MessageJudgeAnswerSchema,
  });
  const verdict = r.answer
    ? messageVerdict(issues, r.answer)
    : { pass: false, failed: ["the judge gave no answer"], soft: { passed: 0, of: 0 }, notes: [] };
  const patterns = patternFailures(c, versions);
  return { ...verdict, pass: verdict.pass && patterns.length === 0, failed: [...verdict.failed, ...patterns] };
}

const argOf = (argv, name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

async function main() {
  const argv = process.argv;
  const live = argv.includes("--live");
  const baseline = argv.includes("--baseline");
  const repeats = Math.max(1, Number(argOf(argv, "--repeats", "2")) || 2);
  const only = argOf(argv, "--only", null);
  const all = loadCases();
  const problems = validateCases(all);
  if (problems.length) {
    console.log(`The cases are not well formed:\n${problems.join("\n")}`);
    process.exit(1);
  }
  const cases = only ? all.filter((c) => only.split(",").includes(c.id)) : all;
  if (!live) {
    for (const c of cases) {
      const text = messageBriefText(briefOf(c));
      console.log(`${c.id}: ${c.message.category}, ${c.message.language}, brief ${text.length} characters`);
    }
    const system = craftSystem(CUSTOMER_MESSAGE_SKILL);
    console.log(
      `dry: ${cases.length} cases, each brief built and nothing asked (the skill's system prompt is ${system.length} characters). Pass --live to ask the model.`,
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
  for (const c of cases) {
    const brief = briefOf(c);
    if (baseline) {
      const draft = c.message.draft;
      const v = await judge(client, c, brief, draft, [], null);
      rows.push({ id: c.id, kind: "draft", rep: 0, verdict: v, versions: draft });
      console.log(`${v.pass ? "ok  " : "MISS"} ${c.id} (first draft): soft ${v.soft.passed}/${v.soft.of}`);
      for (const f of v.failed) console.log(`     ! ${f}`);
    }
    for (let n = 1; n <= repeats; n++) {
      let row;
      try {
        const w = await write(client, brief);
        times.push(w.ms);
        if (!w.answer) {
          row = {
            id: c.id,
            kind: "skill",
            rep: n,
            ms: w.ms,
            verdict: { pass: false, failed: ["no answer"], soft: { passed: 0, of: 0 }, notes: [] },
          };
        } else {
          const { versions, missing, couldNot } = craftedVersions(w.answer, brief);
          const v = await judge(client, c, brief, versions, missing, couldNot);
          row = { id: c.id, kind: "skill", rep: n, ms: w.ms, usage: w.usage, versions, couldNot, verdict: v };
        }
      } catch (e) {
        row = {
          id: c.id,
          kind: "skill",
          rep: n,
          verdict: {
            pass: false,
            failed: [`the call failed: ${e instanceof Error ? e.message : String(e)}`],
            soft: { passed: 0, of: 0 },
            notes: [],
          },
        };
      }
      rows.push(row);
      const v = row.verdict;
      console.log(
        `${v.pass ? "ok  " : "MISS"} ${c.id} (${n}/${repeats}): soft ${v.soft.passed}/${v.soft.of}${row.ms ? `, ${(row.ms / 1000).toFixed(1)} s` : ""}`,
      );
      for (const f of v.failed) console.log(`     ! ${f}`);
      for (const note of v.notes) console.log(`     ~ ${note}`);
    }
  }
  const skill = rows.filter((r) => r.kind === "skill");
  const passed = skill.filter((r) => r.verdict.pass).length;
  const soft = skill.reduce((a, r) => ({ p: a.p + r.verdict.soft.passed, of: a.of + r.verdict.soft.of }), {
    p: 0,
    of: 0,
  });
  const sorted = [...times].sort((a, b) => a - b);
  const drafts = rows.filter((r) => r.kind === "draft");
  const lines = [
    `${passed} of ${skill.length} written messages held, by ${WRITER_MODEL} at ${CUSTOMER_MESSAGE_SKILL.craft.effort}; soft criteria ${soft.p} of ${soft.of}.`,
    `Writer time: p50 ${(pct(sorted, 0.5) / 1000).toFixed(1)} s, p90 ${(pct(sorted, 0.9) / 1000).toFixed(1)} s, most ${((sorted.at(-1) ?? 0) / 1000).toFixed(1)} s.`,
    ...(drafts.length
      ? [
          `First drafts: ${drafts.filter((r) => r.verdict.pass).length} of ${drafts.length} held; soft ${drafts.reduce((n, r) => n + r.verdict.soft.passed, 0)} of ${drafts.reduce((n, r) => n + r.verdict.soft.of, 0)}.`,
        ]
      : []),
  ];
  for (const l of lines) console.log(l);
  const out = path.join(
    ROOT,
    "tooling/backups",
    `skill-customer-message-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ at: new Date().toISOString(), model: WRITER_MODEL, repeats, rows, summary: lines }, null, 2),
  );
  console.log(`Written to ${path.relative(ROOT, out)}.`);
  process.exit(passed === skill.length ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
