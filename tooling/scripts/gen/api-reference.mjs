#!/usr/bin/env node
/**
 * The /api/v1 reference (docs/api.md), written from what each route declares with `route()`: its method and path, who
 * may call it (scope and role), the rate bucket it counts against, whether it may spend, and the fields its input
 * takes (a write's body, a read's query), read from the zod schema the route itself parses with.
 *
 * Before this the only reference was route-policy.json, which says who may call a route but not what it takes (the
 * scorecard's Documentation). What a route answers is its handler's return type, which the typed client reads
 * (apps/dashboard/src/client/api.ts `Output`), and which this page does not restate.
 *
 *   corepack pnpm gen:api-reference                 # write docs/api.md
 *   corepack pnpm gen:api-reference -- --check      # exit 1 when it is stale
 *
 * The route modules load under tsx with the react-server condition, as the suite loads them.
 * routes/api-reference.test.mjs regenerates the page in memory on every run and refuses a stale copy, as
 * route-types.test.mjs does for the typed client.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toJSONSchema } from "zod";

export const OUT = "docs/api.md";
const API = "apps/dashboard/app/api/v1";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Who may call it, in words: the scope's member and the role the route names. */
function who(policy) {
  const scope = {
    workspace: "a member of the workspace the request names",
    row: "a member of the row's own workspace",
    account: "any signed-in person, for themselves",
    platform: "platform staff",
  }[policy.scope];
  return policy.role ? `${scope}, ${policy.role} or above` : scope;
}

/** A JSON Schema's type, in a few words. */
function typeOf(s) {
  if (!s || typeof s !== "object") return "any";
  if (s.enum) return `one of ${s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(", ")}`;
  if (s.const !== undefined) return `\`${JSON.stringify(s.const)}\``;
  if (s.anyOf || s.oneOf) return (s.anyOf ?? s.oneOf).map(typeOf).join(" or ");
  if (s.type === "array") return `array of ${typeOf(s.items)}`;
  if (Array.isArray(s.type)) return s.type.join(" or ");
  if (s.type === "string" && s.format) return `string (${s.format})`;
  return s.type ?? "any";
}

/** The limits a field's schema states, in a few words. */
function limitsOf(s) {
  const out = [];
  if (!s || typeof s !== "object") return "";
  if (s.minLength !== undefined) out.push(`at least ${s.minLength} characters`);
  if (s.maxLength !== undefined) out.push(`at most ${s.maxLength} characters`);
  if (s.minimum !== undefined) out.push(`≥ ${s.minimum}`);
  if (s.maximum !== undefined) out.push(`≤ ${s.maximum}`);
  if (s.minItems !== undefined) out.push(`at least ${s.minItems}`);
  if (s.maxItems !== undefined) out.push(`at most ${s.maxItems}`);
  // A format (uuid, email, date-time) is the type's own words; the regular expression zod writes for it is not.
  if (s.pattern !== undefined && !s.format) out.push(`matches \`${s.pattern}\``);
  if (s.description) out.push(s.description);
  return out.join("; ");
}

/** A table cell: one line, no pipe that would end it. */
const cell = (text) => String(text).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");

/** The fields a route's input takes, as table rows; a schema that is no object is said in one row. */
export function fieldRows(schema) {
  if (!schema) return [];
  let json;
  try {
    json = toJSONSchema(schema, { unrepresentable: "any", io: "input" });
  } catch (e) {
    return [`| (input) | not describable as JSON: ${cell(e instanceof Error ? e.message : e)} | | |`];
  }
  if (json.type !== "object" || !json.properties)
    return [`| (input) | ${cell(typeOf(json))} | yes | ${cell(limitsOf(json))} |`];
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties).map(
    ([name, s]) => `| \`${name}\` | ${cell(typeOf(s))} | ${required.has(name) ? "yes" : "no"} | ${cell(limitsOf(s))} |`,
  );
}

/** Every route file under /api/v1, as its key's path ("conversations/[id]/snooze") and its file. */
function routeFiles(root) {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") files.push(p);
    }
  })(path.join(root, API));
  return files
    .map((f) => ({
      file: f,
      rel: path
        .relative(path.join(root, API), f)
        .replace(/\\/g, "/")
        .replace(/\/route\.ts$/, ""),
    }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/** The page, from the routes as they are: imported, asked what each handler declared. */
export async function generate(root) {
  // Modules that build a service client on first use read these; nothing here dials it.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "generator-only";
  const byDomain = new Map();
  let count = 0;
  for (const { file, rel } of routeFiles(root)) {
    const mod = await import(pathToFileURL(file).href);
    for (const m of METHODS) {
      const handler = mod[m];
      if (typeof handler !== "function" || !handler.policy) continue;
      const p = handler.policy;
      const domain = rel.split("/")[0];
      const lines = [
        `### \`${m} /api/v1/${rel}\``,
        "",
        `${p.kind === "read" ? "Reads" : "Writes"}; for ${who(p)}; ${p.rate ? `counts against the \`${p.rate}\` rate` : "no rate bucket"}; ${p.spend ? "may spend the workspace's money" : "spends nothing"}.`,
        "",
      ];
      const rows = fieldRows(handler.input);
      if (rows.length)
        lines.push(
          `| ${p.kind === "read" ? "Query" : "Body"} field | Type | Required | Limits |`,
          "| --- | --- | --- | --- |",
          ...rows,
          "",
        );
      else
        lines.push(
          `Declares no ${p.kind === "read" ? "query" : "body"} schema: it takes none${p.kind === "read" ? " beyond the workspace" : ""}, or reads its own (\`${API}/${rel}/route.ts\`).`,
          "",
        );
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(lines.join("\n"));
      count++;
    }
  }
  const out = [
    "<!-- Written by tooling/scripts/gen/api-reference.mjs from each route's route() declaration: do not edit. -->",
    "",
    "# The /api/v1 reference",
    "",
    "Every member-facing route, by domain: who may call it, the rate bucket it counts against, whether it may spend",
    "the workspace's money, and the fields it takes. A workspace-scoped route names its workspace with `?workspace=`",
    "(`apps/dashboard/src/server/route.ts`). What a route answers is its handler's return type, which the typed client",
    "reads (`apps/dashboard/src/client/api.ts`). Regenerate with `corepack pnpm gen:api-reference`; the suite fails a",
    "stale copy.",
    "",
    `${count} handlers in ${byDomain.size} domains.`,
    "",
  ];
  for (const [domain, entries] of byDomain) out.push(`## ${domain}`, "", ...entries);
  return `${out.join("\n").trimEnd()}\n`;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const text = await generate(root);
  const file = path.join(root, OUT);
  if (process.argv.includes("--check")) {
    const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
    console.log(now === text ? "api reference: current" : `api reference: STALE: run corepack pnpm gen:api-reference`);
    process.exit(now === text ? 0 : 1);
  }
  fs.writeFileSync(file, text);
  console.log(`wrote ${OUT}`);
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) await main();
