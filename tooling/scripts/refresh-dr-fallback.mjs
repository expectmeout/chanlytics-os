/**
 * Rewrite the disaster-recovery fallback from the live config it is meant to
 * mirror.
 *
 * WHY THIS IS A SCRIPT AND NOT A HABIT. `apps/edge/lib/tenant-fallback.ts` is
 * what the receptionist answers with when the control plane cannot be READ —
 * the only runtime file allowed to contain a tenant's facts. It is supposed to
 * be byte-identical to that tenant's stored config, and a golden test says so.
 *
 * It drifted anyway, and in the worst possible direction: the live config had
 * `phone_display` removed (so the published number follows the provisioned
 * line) while the fallback still carried the salon's TRANSFER number. A restore
 * on the day this was found would have reinstated the exact defect that work
 * existed to fix — every customer told to ring a person's mobile instead of the
 * receptionist standing by.
 *
 * Nobody forgot on purpose. Keeping two copies in step by remembering is a
 * practice that fails silently, so this makes the update mechanical: read the
 * row, regenerate the literal, and let the diff be the review.
 *
 * Dry run by default. --apply writes, after a backup.
 *
 *   node tooling/scripts/refresh-dr-fallback.mjs
 *   node tooling/scripts/refresh-dr-fallback.mjs --apply
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment -- or,
 * on a laptop that holds no key, --from <file>: the tenant_config row as JSON
 * ({ config, version, updated_at }), which the CLI's linked read produces
 * without one:
 *
 *   npx supabase db query --linked "select row_to_json(r) from (select config, version, updated_at from tenant_config where tenant_id = '<id>') r"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILE = path.join(ROOT, "apps/edge/lib/tenant-fallback.ts");
const APPLY = process.argv.includes("--apply");

/**
 * The ENV-DEFAULT tenant: the one whose channel matches WHATSAPP_PHONE_ID, and
 * the only tenant allowed to fall back at all. Every other workspace fails safe
 * into silence, because a leaked persona is worse than a missed reply.
 */
const TENANT = process.env.DR_TENANT_ID || "6a4405d1-1e68-4fcd-bc55-eef0df8e689a";

const FROM = (() => { const i = process.argv.indexOf("--from"); return i >= 0 ? process.argv[i + 1] : null; })();
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!FROM && (!URL_ || !KEY)) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to read the live config, or --from <file> holding the row.");
  process.exit(1);
}

/** A template literal that survives whatever the prompt contains. */
function backticked(text) {
  return "`" + String(text).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
}

/** The literal, in the shape and order the file already uses. */
function renderBrain(brain) {
  const line = (k) => `  ${k}: ${JSON.stringify(brain[k])},\n`;
  let out = "export const FALLBACK_BRAIN: BrainConfig = {\n";
  out += line("business_name");
  // phone_display is written ONLY when the live config sets one. Absent means
  // "the number it answers on", which the DR path cannot resolve because the
  // database it would read is the thing that is down — and stating a stale
  // number is precisely the defect this fallback once carried for weeks.
  if (brain.phone_display != null) out += line("phone_display");
  out += line("booking_link");
  out += "  fallbacks: {\n";
  for (const k of ["greeting", "error", "non_text"]) {
    out += `    ${k}:\n      ${JSON.stringify(brain.fallbacks[k])},\n`;
  }
  out += "  },\n";
  // The markers stay: the golden test strips them before evaluating, and they
  // are how a reader finds the prompt in a file of escaped strings.
  out += "  // PROMPT-START\n";
  out += `  system_prompt: ${backticked(brain.system_prompt)},\n`;
  out += "  // PROMPT-END\n";
  out += "};";
  return out;
}

const { data, error } = FROM
  ? { data: JSON.parse(fs.readFileSync(FROM, "utf8")), error: null }
  : await createClient(URL_, KEY, { auth: { persistSession: false } }).from("tenant_config").select("config, version, updated_at").eq("tenant_id", TENANT).single();
if (error) { console.error(`reading the live config: ${error.message}`); process.exit(1); }

const brain = data.config?.brain;
if (!brain) { console.error("that tenant has no brain config; refusing to write an empty fallback."); process.exit(1); }
for (const required of ["business_name", "booking_link", "system_prompt", "fallbacks"]) {
  if (!brain[required]) { console.error(`the live config has no ${required}; refusing to write a fallback that cannot answer.`); process.exit(1); }
}

const src = fs.readFileSync(FILE, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";
const START = "export const FALLBACK_BRAIN: BrainConfig = {";
const from = src.indexOf(START);
if (from === -1) { console.error("FALLBACK_BRAIN literal not found; the file's shape changed."); process.exit(1); }
// The file is CRLF, but the prompt's own newlines are LF — it is a template
// literal holding text written elsewhere — so the line before the closing brace
// ends with a bare \n. Match either, or this finds nothing.
const endMatch = /\r?\n\};/.exec(src.slice(from));
if (!endMatch) { console.error("the end of the FALLBACK_BRAIN literal was not found."); process.exit(1); }
const to = from + endMatch.index;
const after = to + endMatch[0].length;

// Only the code around the prompt is rewritten in the file's line endings; the
// prompt keeps whatever the database holds.
const next = src.slice(0, from) + renderBrain(brain).replace(/\n/g, eol) + src.slice(after);

console.log(`live config     v${data.version}, updated ${String(data.updated_at).slice(0, 16)}`);
console.log(`business        ${brain.business_name}`);
console.log(`phone_display   ${brain.phone_display == null ? "(absent — follows the provisioned line)" : JSON.stringify(brain.phone_display)}`);
console.log(`system_prompt   ${brain.system_prompt.length} characters`);

if (next === src) { console.log("\nThe fallback already matches the live config. Nothing to do."); process.exit(0); }

const changed = [];
const literal = `${src.slice(from + START.length - 1, to)}\n}`.replace(/\/\/ PROMPT-(START|END)\r?\n/g, "");
const before = new Function(`return (${literal});`)();
for (const k of ["business_name", "phone_display", "booking_link", "system_prompt"]) {
  if (before[k] !== brain[k]) changed.push(`  ${k}: ${JSON.stringify(String(before[k]).slice(0, 44))} -> ${JSON.stringify(String(brain[k]).slice(0, 44))}`);
}
for (const k of ["greeting", "error", "non_text"]) {
  if (before.fallbacks?.[k] !== brain.fallbacks[k]) changed.push(`  fallbacks.${k} changed`);
}
console.log("\nWhat moves:");
console.log(changed.length ? changed.join("\n") : "  (formatting only)");

if (!APPLY) { console.log("\nDRY RUN. --apply writes it."); process.exit(0); }

fs.writeFileSync(`${FILE}.bak`, src, "utf8");
fs.writeFileSync(FILE, next, "utf8");
console.log(`\nWritten. Backup at ${path.basename(FILE)}.bak — delete it once the diff looks right.`);
