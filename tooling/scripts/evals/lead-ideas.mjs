#!/usr/bin/env node
/**
 * The ideas for a new search, asked of the model over made-up workspaces (00398): how the ideas' prompt is judged
 * before it merges, and after any change to it or to what the code tells the model.
 *
 *   node --import tsx tooling/scripts/evals/lead-ideas.mjs                      # dry: builds every workspace's question and asks nothing
 *   node --import tsx tooling/scripts/evals/lead-ideas.mjs --live               # asks the ideas' own model (lead_suggest) each workspace, twice
 *   node --import tsx tooling/scripts/evals/lead-ideas.mjs --live --repeats 3   # three askings each: the model is not the same twice
 *
 * Each workspace (fixtures/lead-ideas/workspaces.json) goes through what the dashboard's reader does
 * (server/leads/lead-suggestions.ts): lead_suggest_history's answer narrowed (ideaHistoryOf), the code's decisions made
 * (ideaPacket: each kind's verdict, the places an idea may name, the sizes this month allows), the question and its
 * schema, the model's answer read leniently (LeadIdeasAnswerSchema) and back into plans (ideasFrom). The ideas are
 * judged by code: at least three, each a plan in a listed place, none of a kind that did not work nor the business's
 * own, none in a place its kind was searched in, none passed on twice, a close kind leaving out what went wrong,
 * something built on a kind that worked, the workspace's language, and no number in a why that the question did not
 * hold. Every asking of a workspace must pass (the model is not the same twice: --repeats, two by default), and what
 * the code dropped of the model's answer is said, so a prompt the model keeps breaking shows.
 *
 * The key is ANTHROPIC_EVAL_KEY, never the production key: from the environment, or from .env.evals at the repository's
 * root (ignored by git) when the environment has none. With --live and no eval key it asks nothing, judges nothing,
 * says SKIPPED and exits 0: a skip is never a pass. It writes no row and touches no workspace, and it lives
 * outside tests/ so `pnpm test` never runs it (it costs money and needs a key); its pure parts (workspaceOf,
 * judgeIdeas) are executed by tooling/scripts/tests/leads/finder/lead-ideas.test.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DAY_MS,
  LEAD_IDEAS_SYSTEM,
  LeadIdeasAnswerSchema,
  MODEL_ROUTES,
  ideaHistoryOf,
  ideaJsonSchema,
  ideaPacket,
  ideaPacketText,
  ideasRead,
} from "@chanlytics/contracts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const FIXTURES = path.join(HERE, "../fixtures/lead-ideas/workspaces.json");
/** The fewest ideas a workspace may come back with. */
const FEWEST = 3;

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

/** The fixture set. */
export function loadWorkspaces(file = FIXTURES) {
  return JSON.parse(fs.readFileSync(file, "utf8")).workspaces;
}

/**
 * One workspace as the reader would see it now: each search's `at_days_ago` made its `at` (and its last email and
 * contact set a day after it, where the fixture gives them), and the packet built.
 */
export function workspaceOf(fx, now = new Date()) {
  const searches = fx.history.searches.map(({ at_days_ago: days, ...s }) => {
    const at = new Date(now.getTime() - days * DAY_MS).toISOString();
    const then = (v) => (v ? new Date(now.getTime() - Math.max(0, days - 1) * DAY_MS).toISOString() : null);
    return {
      ...s,
      at,
      reach: { ...s.reach, last_sent_at: then(s.reach && s.reach.last_sent_at) },
      leads: { ...s.leads, last_contacted_at: then(s.leads && s.leads.last_contacted_at) },
    };
  });
  const history = ideaHistoryOf({ ...fx.history, searches });
  const packet = ideaPacket({
    line: fx.line,
    history,
    profileAddress: fx.address,
    leadsLeft: fx.leadsLeft,
    passed: fx.passed ?? [],
    language: fx.language ?? "en",
    now,
  });
  return { packet, text: ideaPacketText(packet), schema: ideaJsonSchema(packet) };
}

/** The whole numbers a text says, commas taken out: "$2,400 from 5 of 20" -> 2400, 5, 20. */
const numbersIn = (text) => (text.match(/\d[\d,]*/g) ?? []).map((n) => n.replace(/,/g, ""));

/** The ideas against the workspace's `expect`, and against the rules every workspace holds. */
export function judgeIdeas(fx, ws, items) {
  const failures = [];
  const want = fx.expect ?? {};
  if (items.length < FEWEST) failures.push(`${items.length} ideas, wanted at least ${FEWEST}`);
  const listed = new Set(ws.packet.places.map((p) => p.area.label.toLowerCase()));
  const given = new Set(numbersIn(ws.text));
  for (const it of items) {
    const where = it.plan ? it.plan.area.label.toLowerCase() : null;
    if (!it.plan) failures.push(`"${it.words}" has no plan`);
    else if (!listed.has(where)) failures.push(`"${it.words}" is in a place not listed`);
    if ((want.avoid ?? []).includes(it.category_key)) failures.push(`"${it.words}" is a kind that did not work`);
    for (const [kind, place] of want.taken ?? [])
      if (it.category_key === kind && where === place) failures.push(`"${it.words}" is ${kind} again in ${place}`);
    for (const [kind, place] of want.passed ?? [])
      if (it.category_key === kind && where === place) failures.push(`"${it.words}" was passed on twice`);
    if (want.ownKind && it.category_key === want.ownKind) failures.push(`"${it.words}" is the business's own kind`);
    // A kind close to one that did not work leaves out what went wrong with it.
    if (
      (want.closeKinds ?? []).includes(it.category_key) &&
      !(it.plan ? it.plan.exclusions : []).some((x) => x.text.toLowerCase().includes(want.closeKindNeeds))
    )
      failures.push(
        `"${it.words}" is close to a kind that did not work and leaves out nothing of "${want.closeKindNeeds}"`,
      );
    if (want.language === "es" && !/\b(de|para|con|que|los|las|en)\b/i.test(it.who_for))
      failures.push(`"${it.words}": its why is not in Spanish ("${it.who_for}")`);
    // A number in a why must be one the question held: the model is told it may cite nothing else.
    for (const n of numbersIn(it.who_for))
      if (!given.has(n)) failures.push(`"${it.words}" says ${n}, which it was not given`);
  }
  if (
    want.worked &&
    !items.some((it) => it.category_key === want.worked || it.who_for.toLowerCase().includes(want.workedWord))
  )
    failures.push(`nothing builds on ${want.worked}, which worked`);
  return { pass: failures.length === 0, failures };
}

/** The SDK the edge asks the model through (lib/model.ts), loaded only for a live run, on the eval key. */
async function messagesClient() {
  const require = createRequire(path.join(ROOT, "apps/edge/package.json"));
  const { default: Anthropic } = await import(pathToFileURL(require.resolve("@anthropic-ai/sdk")).href);
  return new Anthropic({ apiKey: evalKey(), maxRetries: 1 });
}

/** One answer in the ideas' schema, as the dashboard's askForJson asks for it; null for a refusal or a cut answer. */
async function ask(client, ws) {
  const route = MODEL_ROUTES.lead_suggest;
  const res = await client.messages.create({
    model: route.model,
    max_tokens: route.maxTokens,
    system: LEAD_IDEAS_SYSTEM,
    messages: [{ role: "user", content: ws.text }],
    output_config: { effort: "low", format: { type: "json_schema", schema: ws.schema } },
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = LeadIdeasAnswerSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

/** How many times each workspace is asked: --repeats N, two unless said. */
function repeatsOf(argv) {
  const at = argv.indexOf("--repeats");
  const n = at >= 0 ? Number(argv[at + 1]) : 2;
  return Number.isInteger(n) && n >= 1 ? n : 2;
}

async function main() {
  const live = process.argv.includes("--live");
  const repeats = repeatsOf(process.argv);
  const set = loadWorkspaces();
  const built = set.map((fx) => ({ fx, ws: workspaceOf(fx) }));
  if (!live) {
    for (const { fx, ws } of built)
      console.log(
        `${fx.id}: ${ws.packet.places.length} places, ${ws.packet.kinds.length} kinds, sizes ${ws.packet.sizes}`,
      );
    console.log(
      `dry: ${built.length} workspaces, each question built and nothing asked. Pass --live to ask the model.`,
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
  let passed = 0;
  let asked = 0;
  const droppedAll = {};
  for (const { fx, ws } of built)
    for (let n = 1; n <= repeats; n++) {
      asked++;
      let answer = null;
      let error = null;
      try {
        answer = await ask(client, ws);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const read = answer ? ideasRead(answer, ws.packet) : { items: [], dropped: {} };
      for (const [why, c] of Object.entries(read.dropped)) droppedAll[why] = (droppedAll[why] ?? 0) + c;
      const verdict = error
        ? { pass: false, failures: [`the call failed: ${error}`] }
        : answer
          ? judgeIdeas(fx, ws, read.items)
          : { pass: false, failures: ["no answer (a refusal, a cut answer, or one out of shape)"] };
      if (verdict.pass) passed++;
      const dropped = Object.entries(read.dropped)
        .map(([why, c]) => `${c} ${why}`)
        .join(", ");
      console.log(
        `${verdict.pass ? "ok  " : "MISS"} ${fx.id} (${n}/${repeats}): ${read.items.length} ideas${dropped ? `, dropped ${dropped}` : ""}`,
      );
      for (const it of read.items) console.log(`       ${it.words} (${it.plan ? it.plan.count : "-"}) · ${it.who_for}`);
      for (const f of verdict.failures) console.log(`     ! ${f}`);
    }
  const droppedLine = Object.entries(droppedAll)
    .map(([why, c]) => `${why} ${c}`)
    .join(", ");
  console.log(
    `${passed} of ${asked} askings held, by ${MODEL_ROUTES.lead_suggest.model}.${droppedLine ? ` Dropped by the rules: ${droppedLine}.` : ""}`,
  );
  process.exit(passed === asked ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
