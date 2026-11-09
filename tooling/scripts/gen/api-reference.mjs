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

/** What a write does with an Idempotency-Key (decision 0035), where it is not the rule the page's head states. */
function keyWords(policy) {
  if (policy.kind !== "write") return "";
  if (policy.idempotent === "own") return " Keeps its own `Idempotency-Key`.";
  if (policy.scope === "account" || policy.scope === "platform")
    return " Takes no `Idempotency-Key`: there is no workspace to keep it in.";
  return "";
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

/** One object's fields, as table rows. */
function objectRows(json) {
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties).map(
    ([name, s]) => `| \`${name}\` | ${cell(typeOf(s))} | ${required.has(name) ? "yes" : "no"} | ${cell(limitsOf(s))} |`,
  );
}

/** A body's table head, as the page writes it above a body's fields. */
const BODY_HEAD = ["| Body field | Type | Required | Limits |", "| --- | --- | --- | --- |"];

/**
 * The fields a route's input takes, as table rows; a schema that is no object is said in one row. A body that is one of
 * several objects (PUT playbooks/:id's three) is said body by body, each with its own table head, since "object or
 * object" says nothing: those lines are the whole of what the page prints for it (generate).
 */
export function fieldRows(schema) {
  if (!schema) return [];
  let json;
  try {
    json = toJSONSchema(schema, { unrepresentable: "any", io: "input" });
  } catch (e) {
    return [`| (input) | not describable as JSON: ${cell(e instanceof Error ? e.message : e)} | | |`];
  }
  const bodies = json.anyOf ?? json.oneOf;
  if (Array.isArray(bodies) && bodies.length > 1 && bodies.every((b) => b?.type === "object" && b.properties))
    return [
      `One of ${bodies.length} bodies.`,
      ...bodies.flatMap((b, i) => ["", `Body ${i + 1}:`, "", ...BODY_HEAD, ...objectRows(b)]),
    ];
  if (json.type !== "object" || !json.properties)
    return [`| (input) | ${cell(typeOf(json))} | yes | ${cell(limitsOf(json))} |`];
  return objectRows(json);
}

/** Whether fieldRows' lines are whole tables of their own (a body of several shapes), not one table's rows. */
const saysItsOwnTables = (rows) => rows.length > 0 && !rows[0].startsWith("|");

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

/**
 * The edge's doors, as contracts declares them (decision 0109): each one's path and the fields its body takes, which the
 * dashboard's `callEdge` sends and the door reads its body through. Who may knock on each is tests/edge/door-policy.json's.
 */
async function edgeDoorLines(root) {
  const contracts = await import(pathToFileURL(path.join(root, "packages/contracts/src/index.ts")).href);
  const doors = Object.entries(contracts)
    .filter(
      ([name, v]) =>
        name.endsWith("_DOOR") && v && typeof v.aud === "string" && typeof v.body?.safeParse === "function",
    )
    .map(([, v]) => v)
    .sort((a, b) => (a.aud < b.aud ? -1 : a.aud > b.aud ? 1 : 0));
  const lines = [
    "## The edge's doors",
    "",
    "Every door on the edge whose body contracts declares (`packages/contracts/src/<domain>/edge-doors.ts`, decision 0109):",
    "the dashboard's `callEdge` sends a declared door the body its schema takes, and the door reads its body through the same",
    "schema. Who may knock on each is `tests/edge/door-policy.json`'s.",
    "",
    `${doors.length} doors.`,
    "",
  ];
  for (const door of doors) {
    const read = door.body.safeParse(null).success;
    lines.push(`### \`${read ? "GET" : "POST"} ${door.aud}\``, "");
    if (read) {
      lines.push("Read with GET; takes no body.", "");
      continue;
    }
    const rows = fieldRows(door.body);
    if (saysItsOwnTables(rows)) lines.push(...rows, "");
    else lines.push(...BODY_HEAD, ...rows, "");
  }
  return lines;
}

/** What each code tells a caller. A code added to ERROR_CODES with no line here stops the page from being written. */
const CODE_MEANS = {
  unauthorized: "Not signed in, or the session has ended.",
  forbidden: "Signed in, and this role may not.",
  not_found: "No such thing in this workspace.",
  validation: "What was sent cannot be taken; the words say why.",
  choose_workspace: "The account is in several workspaces and the request did not say which.",
  mfa_required: "A partner's seat needs its second factor first.",
  conflict: "It already exists, or what it depends on has moved.",
  rate_limited: "Too many for now; `details.retry_after_s` says when it lifts.",
  payment_required: "The workspace may not do this until it pays.",
  window_closed: "The channel's reply window has closed.",
  upstream_meta: "Meta refused or could not be reached.",
  upstream_retell: "The voice provider refused or could not be reached.",
  upstream_anthropic: "The model refused or could not be reached.",
  upstream_email: "The email provider refused or failed.",
  upstream_auth: "Sign-in could not be checked just now; the session stands.",
  upstream_voice: "Ask's voice refused, could not be reached, or is not set up here.",
  upstream_provider: "A provider, or the edge asked on our behalf, refused or never answered.",
  unavailable: "It could not be done just now; trying again may do it.",
  internal: "Something failed that nothing here expected; its text is only in the log.",
};

/**
 * What a caller can be refused with (decision 0114): the codes, the status each answers by default, the database's codes
 * a route answers by, and the edge's own. From the sets themselves, so a code cannot be added without it being said here.
 */
async function refusalLines(root) {
  const contracts = await import(pathToFileURL(path.join(root, "packages/contracts/src/index.ts")).href);
  const { DOOR_REFUSALS } = await import(
    pathToFileURL(path.join(root, "apps/dashboard/src/server/shared/with-route.ts")).href
  );
  const rows = contracts.ERROR_CODES.map((code) => {
    const means = CODE_MEANS[code];
    if (!means) throw new Error(`api-reference: say what ${code} means in CODE_MEANS`);
    return `| \`${code}\` | ${new contracts.AppError(code, "").status} | ${means} |`;
  });
  return [
    "## What a refusal answers",
    "",
    "A route refuses with `{ ok: false, error: { code, message, details? } }`: a code from one closed set, a sentence a",
    "person may read, and what the code's `ErrorDetailsByCode` says it carries. Every answer carries `x-request-id`, which",
    "finds its lines in the log. A failure's own text is never in an answer.",
    "",
    "| Code | Status | What it says |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "### What the database answers by",
    "",
    "A failed reply from the database keeps its code (`DbFailure`). These codes a door raises on purpose, so a route answers",
    "them as refusals, in the door's own sentence; a sentence Postgres wrote, which names a constraint or a table, is",
    "answered in plain words instead. Any other failure is `internal`.",
    "",
    "| Database code | Code | Status |",
    "| --- | --- | --- |",
    ...Object.entries(DOOR_REFUSALS).map(([db, door]) => `| \`${db}\` | \`${door.code}\` | ${door.status} |`),
    "",
    "### The edge's codes",
    "",
    "A door on the edge refuses with `{ ok: false, error, detail? }`: `error` is a code a caller compares, `detail` words a",
    "person or support may read (`packages/contracts/src/shared/edge-errors.ts`). A door that crashes answers `door_failed`,",
    "at 500, and logs `door_failed` with the stack and the request's name.",
    "",
    contracts.EDGE_ERROR_CODES.map((code) => `\`${code}\``).join(", "),
    "",
  ];
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
        `${p.kind === "read" ? "Reads" : "Writes"}; for ${who(p)}; ${p.rate ? `counts against the \`${p.rate}\` rate` : "no rate bucket"}; ${p.spend ? "may spend the workspace's money" : "spends nothing"}.${keyWords(p)}`,
        "",
      ];
      const rows = fieldRows(handler.input);
      if (saysItsOwnTables(rows)) lines.push(...rows, "");
      else if (rows.length)
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
    "(`apps/dashboard/src/server/shared/route.ts`). What a route answers is its handler's return type, which the typed client",
    "reads (`apps/dashboard/src/client/api.ts`). Regenerate with `corepack pnpm gen:api-reference`; the suite fails a",
    "stale copy.",
    "",
    "A write in a workspace that carries an `Idempotency-Key` header (at most 120 characters, one per intent) is answered",
    "once per key for a day: the same request sent again is given the first answer and changes nothing, the same key on",
    "another request (another method, path or body), or one that arrives while the first still runs, is refused with",
    "409 (decision 0035). A write that keeps its own key, or has no workspace to keep one in, says so.",
    "",
    `${count} handlers in ${byDomain.size} domains.`,
    "",
  ];
  for (const [domain, entries] of byDomain) out.push(`## ${domain}`, "", ...entries);
  out.push(...(await edgeDoorLines(root)));
  out.push(...(await refusalLines(root)));
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
