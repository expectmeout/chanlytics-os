/**
 * What every craft skill's eval shares (customer-message.mjs, ad.mjs): the eval key, the model's client, one structured
 * answer read by its zod, and the small things a run's arguments and timings need. A skill's own script holds its
 * cases, its brief and its verdicts.
 *
 * The key is ANTHROPIC_EVAL_KEY, never the production edge's: from the environment, or from .env.evals at the
 * repository's root (ignored by git). A live run costs money: it is run on Ruben's word.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The eval key: the environment's, else the one line of .env.evals at the root that names it. */
export function evalKey() {
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

/** The SDK the edge asks the model through (lib/ai/model.ts), loaded only for a live run, on the eval key. */
export async function messagesClient() {
  const require = createRequire(path.join(ROOT, "apps/edge/package.json"));
  const { default: Anthropic } = await import(pathToFileURL(require.resolve("@anthropic-ai/sdk")).href);
  return new Anthropic({ apiKey: evalKey(), maxRetries: 1 });
}

/** One structured answer, read by its zod; null for a refusal, a cut answer or one out of shape. */
export async function structured(client, { model, maxTokens, system, question, schema, zod }) {
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

export const argOf = (argv, name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
export const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
