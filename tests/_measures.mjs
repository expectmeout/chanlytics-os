/**
 * The measures behind docs/debt.md, in one module: every number the build holds, each with the rule it stands for
 * (RATCHETS, below).
 *
 * A number may only fall, and since 28 October 2026 (decision 0074) it is held change by change: CI measures a pull
 * request's base and its head (tooling/scripts/checks/debt.mjs), and a number that rose, or an offender that is new,
 * fails the change unless its description says why, in a line `Debt: <why>`. No baseline is committed for these, so a
 * fall needs no banking and no two changes meet in a file of numbers. The tests that held them (code-health-ratchets,
 * wire-casing, event-kinds, journey) now hold what each measure means, on sources written for it.
 *
 * The limits are the scorecard's proposal and, where ESLint has the rule, its
 * defaults: 150 lines a function, 30 branches, 5 levels; 800 lines a file; 20
 * modules a directory; a name in three files is a copy. When a tree holds no
 * function over the limits, the matching ESLint rule goes on for that tree and the limit stops
 * being a ratchet and becomes a lint error (eslint.config.mjs, LIMITED_TREES).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { ROOT, readCode, readRaw, readerFiles } from "./_source.mjs";
import {
  repoFiles,
  parse,
  functionsIn,
  linesOf,
  windowUse,
  copiesAmong,
  topLevelNames,
  castsIn,
  tableNames,
  tablesWrittenIn,
  rpcNames,
  serviceRoleClientsOf,
  serviceRoleReaches,
  importsMatching,
  workspacelessStatements,
  headerOf,
  durationsIn,
  zonelessDatesIn,
  zoneReadersIn,
  inlineStyles,
  handRoutesIn,
  needsHumanReads,
  resumesUnasked,
  sourceReads,
  mediaPreludes,
  mediaWidths,
  stringsIn,
  visitsWrittenIn,
  fixedWaitsIn,
  droppedDbErrorsIn,
  quarantinesIn,
  SOURCE,
} from "./_ast.mjs";
import { cssOf, isPrimitiveClass, STYLE_VALUE_FIELDS } from "./_css.mjs";
import { CLOCKS } from "./clocks/_clocks.mjs";
import { OUT as SCHEMA_SQL, functionChangesIn, statementsOf } from "../tooling/scripts/gen/schema-snapshot.mjs";
import { KEPT_WITH_NO_CALLER, clockOf, codeCallersOf, functionsOf, mapOf } from "../tooling/scripts/gen/sql-map.mjs";
import { ACTIVITY_NOISE_KINDS, ACTIVITY_NOISE_PREFIXES, EVENT_KINDS, SCHEMA_SETS } from "@chanlytics/contracts";
import { ERASURE_STRATEGIES } from "@chanlytics/db/erasure";
import { SUITES } from "../tooling/scripts/checks/test.mjs";
import { NAME_RATCHETS } from "./repo/names/_names.mjs";
import { BOUNDARY_RATCHETS } from "./repo/boundaries/_boundaries.mjs";
import { SIZE_RATCHETS } from "./repo/size/_size.mjs";
import { RULE_RATCHETS } from "./repo/rules/_rules.mjs";
import { WORD_RATCHETS } from "./repo/words/_words.mjs";
import { API_RATCHETS } from "./repo/api/_api.mjs";
import { TYPE_RATCHETS } from "./types/_types.mjs";

/** A function's limits: eslint.config.mjs's FUNCTION_LIMITS, as errors where this holds nothing. */
export const LIMIT = { lines: 150, branches: 30, depth: 5 };
const FILE_LIMIT = 800;
const DIRECTORY_LIMIT = 20;
const COPY_LIMIT = 3;
/** The suffix of a tables key that counts a file's `.rpc("…")` calls rather than its `.from("…")`. */
export const RPC_KEY = "::rpc";

/** The code that ships: the two apps and the packages' sources. Tests and specs are not held to a function's size. */
const SRC = repoFiles(["apps", "packages"]);
/** Where a directory's size is measured: everything hand-written, the tests included. */
const TREES = repoFiles(["apps", "packages", "tooling/scripts", "tests", "e2e"]);
/** The shell and its bridge: the only code that may touch `window` at all. */
const SHELL = SRC.filter((f) => /^apps\/dashboard\/(src|mockup)\//.test(f));
/** A route module exports what the framework names (GET, POST, default); those are not copies. */
const notARoute = (f) => !/^apps\/dashboard\/app\/|^apps\/edge\/api\//.test(f);
/**
 * The URL trees, where a folder is a path a request names (docs/naming.md; CLAUDE.md, "Where new code goes"): a door's
 * folder holds the doors its address holds, so it is not grouped by domain and its size is not a directory's.
 */
const URL_TREE = /^apps\/dashboard\/app\/|^apps\/edge\/api\/|^apps\/mobile\/src\/app\//;
/**
 * React Native's idiom, one `const styles = StyleSheet.create({…})` beside each component of the phone app: a screen's
 * own styles, not a helper spelled out in three files.
 */
function isOwnStyleSheet(sf, name) {
  return sf.statements.some(
    (st) =>
      ts.isVariableStatement(st) &&
      st.declarationList.declarations.some(
        (d) =>
          ts.isIdentifier(d.name) &&
          d.name.text === name &&
          !!d.initializer &&
          ts.isCallExpression(d.initializer) &&
          d.initializer.expression.getText(sf) === "StyleSheet.create",
      ),
  );
}
/** The doors: the edge's provider webhooks, sweeps and admin doors, and the dashboard's member routes. */
export const ROUTES = SRC.filter((f) => /^apps\/edge\/api\/|^apps\/dashboard\/app\/api\//.test(f) && /\.tsx?$/.test(f));
/**
 * What a door does not import (specifiers as written, so the edge's relative facade of a package is a pattern of its
 * own beside the package): a repository (`@chanlytics/db`, or supabase-js, which is one's client) and a provider client
 * (`@chanlytics/channels`, whose `providerFetch` and wires are the providers' own). A door that holds one holds a rule
 * or a table query the layer behind it should. The edge's `lib/pg` handle is not named: nearly every door takes it to
 * pass on, and the tables ratchet already counts the ones that query it.
 */
export const DOOR_FORBIDS = [/^@chanlytics\/(db|channels)(\/|$)/, /^@supabase\/supabase-js$/];
/**
 * Where a length of time is measured: the shipped sources, less what cannot import the units' home — the shell's
 * classic scripts (mockup/) and the static files the browser loads as they are (public/) — and less the home itself.
 */
const TIMED = SRC.filter(
  (f) =>
    !/^apps\/dashboard\/mockup\/|^apps\/dashboard\/public\/|(^|\/)test\/|\.test\.|^packages\/[^/]+\/(?!src\/)/.test(
      f,
    ) && f !== "packages/contracts/src/shared/time.ts",
);

/** Where a date said with no zone is counted: every module that runs, the tests and what a package builds left out. */
const ZONED = SRC.filter((f) => !/(^|\/)test\/|\.test\.|^packages\/[^/]+\/(?!src\/)/.test(f));

/**
 * The dashboard's stylesheets, which the interface kit's measures hold
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.7). The tokens are where a literal value belongs, so
 * they are measured by neither; the kit is where a primitive belongs, so it is measured for its values, never for its
 * primitives. A class the kit's registry lists (kit/classes.json, which _css.mjs reads) is a primitive in every other
 * stylesheet, whatever its words.
 */
export const TOKENS_CSS = "apps/dashboard/src/styles/tokens.css";
const KIT_CSS = "apps/dashboard/src/surfaces/kit/kit.css";
const STYLES = repoFiles(["apps/dashboard"], { keep: /\.css$/ }).filter((f) => f !== TOKENS_CSS);
/**
 * Where the dashboard's layout changes: every stylesheet's @media rules, the tokens' own among them, and the media
 * queries its scripts write (a matchMedia call, a named query, a <source media>).
 */
const DASHBOARD_CSS = repoFiles(["apps/dashboard"], { keep: /\.css$/ });
const DASHBOARD_SRC = SRC.filter((f) => f.startsWith("apps/dashboard/"));

/**
 * The widths the set holds, read from the tokens themselves (`--bp-phone`, `--bp-narrow`), so the set is written once.
 * A token file that writes none leaves the ratchet nothing to hold a width to, and says so rather than count every
 * width a stray.
 */
export function breakpointSet() {
  const css = readRaw(TOKENS_CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  const set = [...css.matchAll(/--bp-[a-z-]+\s*:\s*(\d+)px\s*;/g)].map((m) => Number(m[1]));
  if (!set.length) throw new Error(`${TOKENS_CSS} writes no --bp- token: the breakpoints ratchet has no set`);
  return new Set(set);
}
/**
 * The markup the kit styles: the surfaces, and the mockup's stand-ins
 * (§3.7). The app's own error screens and the bridge's host draw before the stylesheets or without them, so a prop is
 * all they have and they are not held.
 */
const MARKUP = SRC.filter((f) => /^apps\/dashboard\/(mockup|src\/surfaces)\/.*\.(jsx|tsx)$/.test(f));

/** The tables whose every row belongs to one workspace: each names `tenant_id` in its Row (the generated types). */
export function tenantTablesOf() {
  const tables = new Set();
  let table = null;
  let inRow = false;
  let inTables = false;
  for (const line of fs.readFileSync(path.join(ROOT, "packages/db/src/database.types.ts"), "utf8").split(/\r?\n/)) {
    if (/^ {2}public: \{/.test(line)) inTables = true;
    else if (/^ {2}\w+: \{/.test(line)) inTables = false;
    if (!inTables) continue;
    const t = /^ {6}(\w+): \{$/.exec(line);
    if (t) table = t[1];
    if (/^ {8}Row: \{$/.test(line)) inRow = true;
    else if (inRow && /^ {8}\}$/.test(line)) inRow = false;
    else if (inRow && table && /^ {10}tenant_id: /.test(line)) tables.add(table);
  }
  return tables;
}

/** The column types that can hold a person's words: text, json, and their arrays (decision 0036). */
const WORD_TYPES = new Set(["text", "text[]", "jsonb", "jsonb[]", "json", "character varying", "citext", "bytea"]);

/**
 * Every column of a workspace table that can hold a person's words, as `table.column`, from the schema a replay builds
 * (supabase/schema.sql): a table that names `tenant_id`, its partitions read through it; a column of a word type the
 * schema does not hold to a closed set (contracts SCHEMA_SETS). What packages/db's ERASURE_STRATEGIES must name.
 */
export function personalColumns() {
  const sql = readRaw(SCHEMA_SQL);
  const partitions = new Set([...sql.matchAll(/ATTACH PARTITION public\.(\w+)/g)].map((m) => m[1]));
  const out = [];
  for (const [, table, body] of sql.matchAll(/^CREATE TABLE public\.(\w+) \(\n([\s\S]*?)\n\)/gm)) {
    if (partitions.has(table)) continue;
    const columns = body
      .split("\n")
      .map((line) => line.trim().replace(/,$/, ""))
      .filter((line) => line && !line.startsWith("CONSTRAINT"))
      .map((line) => /^"?(\w+)"? (.+?)(?: DEFAULT .*| NOT NULL.*| GENERATED .*)?$/.exec(line))
      .filter(Boolean)
      .map(([, name, type]) => ({ name, type: type.trim() }));
    if (!columns.some((c) => c.name === "tenant_id")) continue;
    for (const c of columns)
      if (WORD_TYPES.has(c.type) && !Object.hasOwn(SCHEMA_SETS, `${table}.${c.name}`)) out.push(`${table}.${c.name}`);
  }
  return out.sort();
}

/** A file that reads across workspaces on purpose says so in its header, as a line `Cross-workspace: <why>`. */
export const CROSS_WORKSPACE = /^\s*(?:\/\/|\/\*\*|\*)?\s*Cross-workspace: \S/m;
/** The edge's own code: its doors and what they call. */
const EDGE = SRC.filter((f) => /^apps\/edge\/(api|lib)\//.test(f));
/** The code behind the doors, both apps' and the packages' that run there, less what never runs: a test, a type test. */
export const BEHIND_THE_DOORS = SRC.filter(
  (f) =>
    /^apps\/edge\/(api|lib)\/|^apps\/dashboard\/(app\/api|src\/server)\/|^packages\/(core|db|jobs|channels)\/src\//.test(
      f,
    ) && !/(^|\/)test\/|\.test\.|\.type-test\./.test(f),
);

/** `{ file: n }` for each of `files` whose syntax tree `count` puts over `floor`. */
const perFile = (files, count, floor = 0) =>
  Object.fromEntries(files.map((f) => [f, count(parse(f))]).filter(([, n]) => n > floor));

/**
 * The writes a module of the dashboard's browser code makes past the verb layer (bridge/verbs): each call
 * `api()("POST …")`, `PUT`, `PATCH` or `DELETE` with its route written in place. A write that goes through its verb's spec
 * makes the same call Ask's card makes for the same act, says the same receipt and offers the same undo (the sheets as
 * verbs, 14 Oct 2026); one made here makes its own.
 */
const BROWSER_WRITERS = SHELL.filter(
  (f) => /^apps\/dashboard\/src\/(surfaces|bridge)\//.test(f) && !f.startsWith("apps/dashboard/src/bridge/verbs/"),
);
function writesPastVerbs(sf) {
  let n = 0;
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "api"
    ) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteralLike(first) && /^(POST|PUT|PATCH|DELETE) /.test(first.text)) n += 1;
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return n;
}

/** One entry per baseline under tests/baselines/: what it holds, and what to do when it rises. */
/* ---- Writers per table (decision 0031, invariant 1: one record, one door writes it) ---- */

/** A token of the snapshot's SQL that is the word `v`, in any case. */
const isSqlWord = (t, v) => t?.type === "word" && t.value.toLowerCase() === v;

/**
 * The schema's tables, by name: each `create table public.<name>` the replayed migrations' snapshot holds. Its `views`
 * names each view drawn from one table with that table (00440's old names): a write through such a view is a write of
 * its table.
 */
function schemaTables(sql) {
  const tables = new Set();
  const views = new Map();
  for (const { tokens } of statementsOf(sql)) {
    if (!isSqlWord(tokens[0], "create")) continue;
    if (isSqlWord(tokens[1], "view")) {
      const name = isSqlWord(tokens[2], "public") && tokens[3]?.value === "." ? tokens[4] : tokens[2];
      const from = tokens.flatMap((t, k) => (isSqlWord(t, "from") || isSqlWord(t, "join") ? [k] : []));
      const base = from.length === 1 ? tokens[from[0] + (isSqlWord(tokens[from[0] + 1], "public") ? 3 : 1)] : null;
      if (name && base) views.set(name.value.toLowerCase(), base.value.toLowerCase());
      continue;
    }
    if (!isSqlWord(tokens[1], "table")) continue;
    const at = isSqlWord(tokens[2], "if") ? 5 : 2;
    const name = isSqlWord(tokens[at], "public") && tokens[at + 1]?.value === "." ? tokens[at + 2] : tokens[at];
    if (name?.type === "word" || name?.type === "ident") tables.add(name.value.toLowerCase());
  }
  for (const [view, base] of views) if (!tables.has(base)) views.delete(view);
  return Object.assign(tables, { views });
}

/**
 * The tables a SQL function's body writes, read from its tokens: `insert into`, `delete from`, and `update` that is not
 * an upsert's `do update` or a lock's `for update` / `for no key update`. A name the schema has no table for (a CTE,
 * `set`) is not one. A statement built as a string (`execute format(…)`) is not seen. With `inserts`, only the tables
 * it inserts into.
 */
export function tablesWrittenBy(body, tables, { inserts = false } = {}) {
  const out = new Set();
  const toks = statementsOf(body).flatMap((x) => x.tokens);
  const nameAt = (k) => (isSqlWord(toks[k], "public") && toks[k + 1]?.value === "." ? toks[k + 2] : toks[k]);
  for (let k = 0; k < toks.length; k++) {
    let t = null;
    if (isSqlWord(toks[k], "insert") && isSqlWord(toks[k + 1], "into")) t = nameAt(k + 2);
    else if (inserts) continue;
    else if (isSqlWord(toks[k], "delete") && isSqlWord(toks[k + 1], "from")) t = nameAt(k + 2);
    else if (isSqlWord(toks[k], "update") && !["do", "for", "key"].some((w) => isSqlWord(toks[k - 1], w)))
      t = nameAt(isSqlWord(toks[k + 1], "only") ? k + 2 : k + 1);
    const name = t?.type === "word" || t?.type === "ident" ? t.value.toLowerCase() : null;
    const table = name && (tables.has(name) ? name : tables.views?.get(name));
    if (table) out.add(table);
  }
  return out;
}

/**
 * Written from many places by design, so not held to one door: `events`, which every door writes in its own fact's
 * transaction (0031, invariant 2); `decisions`, the row every verb writes beside the change to its subject; and
 * `sweep_status`, where each clock stamps its own row.
 */
const MANY_WRITERS_BY_DESIGN = new Set(["events", "decisions", "sweep_status"]);

/**
 * A writer that only removes what age or an erasure takes, which reaches its tables by design: a purge, a scrub, the
 * erasure's own legs (erase_contact, and the triggers its tombstone fires, `<table>_erase_on_contact` and
 * `<column>_on_erase`), and lead_blank, the one function retention and erasure blank a lead through. 0036's registry is
 * what holds those, not this count. Waived for what such a writer updates and deletes, never for a table it inserts into:
 * a row it adds (a suppression an erasure leaves, say) is a writer of that table like any other.
 */
const takesAway = (who) =>
  /^(purge_|erase_)|scrub|(_erase_on_contact|_on_erase)\(\)$|^lead_blank\(\)$/.test(who) ||
  who === "packages/db/src/repositories/erasure/legs.ts";

/**
 * Each table and who writes it: every source module whose supabase-js chain writes it (_ast.mjs tablesWrittenIn), and
 * every live SQL function whose body does, as supabase/schema.sql holds the functions the migrations leave standing.
 * A table written from many places by design, and what a writer that takes away updates or deletes, are left out.
 */
export function writersByTable() {
  const sql = readRaw(SCHEMA_SQL);
  const tables = schemaTables(sql);
  const writers = new Map();
  const add = (table, who, inserted = false) => {
    if (!tables.has(table) || MANY_WRITERS_BY_DESIGN.has(table) || (takesAway(who) && !inserted)) return;
    if (!writers.has(table)) writers.set(table, new Set());
    writers.get(table).add(who);
  };
  for (const f of SRC) for (const t of tablesWrittenIn(parse(f))) add(t, f);
  for (const c of functionChangesIn(sql))
    if (c.kind === "create" && c.body) {
      const inserted = tablesWrittenBy(c.body, tables, { inserts: true });
      for (const t of tablesWrittenBy(c.body, tables)) add(t, `${c.name}()`, inserted.has(t));
    }
  return writers;
}

/**
 * How many writers a table has, as the measure counts them (Ruben, 26 Nov 2026): each source module that writes it, and
 * the database's doors together as one, each verb its own door under the table's guards. A table written only through
 * its doors has one writer; one a module writes beside them, or two modules write, has more.
 */
export const codeWritersOf = (who) => {
  const modules = [...who].filter((w) => !w.endsWith("()")).length;
  return modules + (modules < who.size ? 1 : 0);
};

/* ---- Doors writing a record with no event (decision 0031, invariant 2: a fact and its event share a transaction) ---- */

/** The spine's own rows: an event's outbox row and its deliveries, and the jobs that carry reactions. What a fact causes. */
const SPINE = new Set(["event_outbox", "event_deliveries", "jobs"]);

/** A statement of the snapshot that does not run on past a blank line, which ends every statement it writes. */
const ONE_STATEMENT = String.raw`(?:(?!\n\n)[\s\S])*?`;

/** Why a door that writes rows keeps no fact: each kind of row that is the machine's, not a record's news. */
const NO_FACT = {
  lease:
    "A lease, a claim or a hand-out of work: the queue's own bookkeeping of who holds what until when, a reply queued with its send's job, an inbound message marked processed. The door that does the work writes its fact when it lands (message.sent at the send door).",
  meter:
    "A meter: what an allowance spent, a link or a form was opened, an import counted, by day, what a message cost at its provider. A number Reports reads, not a fact a reaction follows.",
  ownMark:
    "A member's own mark or device: what they have seen or read, how their lists sort, where their phone is told. Theirs alone, not news of the workspace's records.",
  providerId:
    "The id a provider knows a caller or a message by, made once: whom Anthropic is told a call is for (decision 0097), and an email's ids once it left (its Message-ID, its thread, the mailbox it went from, whether it left as the mailbox's own), stamped on a message whose message.sent the send door wrote. Bookkeeping with the provider, which no reaction follows.",
  aiWorking:
    "AI's working copy, or its reading of the world: a draft while it is written, a turn kept for the evals (invariant 11), what it saw or heard in a file, the numbers a platform gave, how it handled a message that came in. The act that takes it up writes the fact.",
  platform:
    "The platform's own, with no workspace to write an event in: the Console's staff, its pause of a job kind, and the erasure key's re-keying of every workspace's tombstones, run by hand.",
  partner:
    "A partner's own account, kept apart from every workspace: each row of the ledger names a workspace (events.tenant_id), and a partner has none. Its own row says it: a code taken, its letters on or off, how far its letter is written.",
  projection: "A projection filled again from records that wrote their own events: a person's moments.",
  harness:
    "A sequence's own list, made inside sequence_create_leads, whose event says it; an e2e harness calls it alone to draw a state.",
  decided:
    "Its fact is the decision it writes in the same transaction (team_decision), the Activity log's line of it: a visit marked, a handover the owner settled from the Business app, a broadcast sent now (its steps' words_ok_at beside it is the plan's memory, read by contracts batchModeOf).",
};

/**
 * The doors that write rows and keep no fact, each with why (decision 0031, invariant 2: an event is a record's news).
 * The measure leaves them out, and repo/measures.test.mjs holds each one to still be a door that writes no event, so the
 * list cannot outlive what it argues.
 */
export const NO_FACT_DOORS = Object.fromEntries(
  Object.entries({
    lease: [
      "conversation_draft_claim",
      "fact_candidates",
      "file_copy_returning",
      "file_shelf_requeue",
      "lead_check_retry",
      "lead_run_claim",
      "lead_run_lease",
      "lead_run_mark_unknown",
      "lead_run_reconcile",
      "lead_run_record_start",
      "lead_run_release",
      "mark_processed",
      "note_candidates",
      "queue_send",
      "reach_out_recheck",
      "reach_out_release_unavailable",
      "reach_out_reply_tell_claim",
      "reach_out_reply_told",
      "reach_out_run_recheck",
      "sequence_claim_drafts",
      "sequence_claim_from",
      "sequence_unchecked",
      "source_takes_hand_out",
    ],
    meter: [
      "billing_card_mark",
      "billing_event_keep_amount",
      "form_booking_open",
      "found_read_spend",
      "import_ledger_note",
      "lead_site_reads_spent",
      "link_open",
      "message_keep_cost",
      "reach_out_check_take",
      "reach_out_read_take",
      "source_take_spend",
      "source_units_spend",
    ],
    ownMark: [
      "contact_mark",
      "member_push_off_set",
      "member_view_set",
      "notification_mark",
      "notifications_read_through",
      "notifications_seen",
      "profile_set",
      "push_device_forget",
      "push_device_register",
      "push_devices_forget_all",
      "words_seen",
    ],
    providerId: ["anthropic_profile_claim", "stamp_email_from_mailbox", "stamp_email_left_as", "stamp_email_sent"],
    aiWorking: [
      "ad_draft_writing",
      "ad_draft_written",
      "comment_answer_draft_keep",
      "conversation_draft_write",
      "file_look_keep",
      "file_moments_keep",
      "file_sound_keep",
      "message_stamp_handled",
      "model_turn_keep",
      "piece_version_kept",
      "post_observations_keep",
      "reach_out_reply_draft",
      "touches_keep",
    ],
    platform: ["erasure_rekey", "job_kind_pause", "job_kind_resume", "platform_admin_add"],
    partner: ["partner_become", "partner_letter_written", "partner_letters_set"],
    projection: ["person_moments_fill"],
    harness: ["reach_out_list_for"],
    decided: ["assemble_broadcast", "conversation_echo_settles", "mark_visit"],
  }).flatMap(([why, doors]) => doors.map((d) => [`${d}()`, NO_FACT[why]])),
);

/**
 * The vault's doors (a credential put or dropped), each kept from the count only where the connection's own door
 * writes the connect or the disconnect as its event: `{ "door()": { by: "the covering door()", kind } }`, held by
 * repo/measures.test.mjs to a door that exists and writes that kind. A vault door no event covers is counted. The
 * mailbox's and the line's are covered since 00721, the Google profile's since 00722, a channel's and a footage
 * account's since 00723.
 */
export const VAULT_DOORS_COVERED = {
  // A mailbox's token kept as its connect stands, and dropped as it is removed: mailbox_connection_move says each.
  "put_mailbox_credentials()": { by: "mailbox_connection_move()", kind: "mailbox_connection.connected" },
  "drop_mailbox_credentials()": { by: "mailbox_connection_move()", kind: "mailbox_connection.removed" },
  // A line's provider key kept as the line is provisioned: the line's own row says it answers (lines_tell_their_moves).
  "put_line_credentials()": { by: "lines_tell_their_moves()", kind: "line.answering" },
  // The Google profile's token kept as its connect finishes, and dropped before its row goes (00722).
  "put_google_credentials()": { by: "google_connect_finish()", kind: "google.connected" },
  "drop_google_credentials()": { by: "google_connection_remove()", kind: "google.disconnected" },
  // A channel's token kept as it connects: a WhatsApp number's row turns active with channel.connected
  // (whatsapp_channel_activate, 00723), and an Instagram account's connect writes its own (instagram_account_connect).
  "put_channel_credentials()": { by: "whatsapp_channel_activate()", kind: "channel.connected" },
  // A footage account's token kept as its connect stands, and dropped as the account is removed (00723); a refresh
  // keeps the token alone, as the same connection's.
  "source_credentials_put()": { by: "source_connection_connected()", kind: "source.connected" },
  "source_credentials_drop()": { by: "source_connection_remove()", kind: "source.disconnected" },
};

/** sql-map.mjs's callers, read once a process: the code's and the scripts' are a walk of every module. */
let outsideCallers = null;

/**
 * The functions of the schema something outside the database reaches (docs/sql-map.md's "called by"): the code, by
 * `.rpc("…")` or its name as a string a helper hands on; a script a person runs, or an operator by hand (sql-map's
 * KEPT_WITH_NO_CALLER); the clock (`cron.schedule`); a rule or a column's default; or a browser, through a grant to a
 * signed-in person or to anyone. A function none of those reaches runs only when another function calls it: a step of
 * the doors that do.
 */
export function reachedFromOutside(sql) {
  if (!outsideCallers) {
    const { fns } = functionsOf(sql);
    const map = mapOf(sql, { clock: clockOf(), ...codeCallersOf([...fns.keys()]) });
    outsideCallers = new Set(
      map
        .filter(
          (r) =>
            ["code", "scripts", "clock", "rules"].some((k) => r.calledBy[k].length > 0) ||
            r.mayCall.includes("anyone") ||
            r.mayCall.includes("a signed-in person"),
        )
        .map((r) => r.name.toLowerCase()),
    );
    for (const n of Object.keys(KEPT_WITH_NO_CALLER)) outsideCallers.add(n.toLowerCase());
  }
  return outsideCallers;
}

/**
 * Each door of the schema (0031) that writes a record and writes no event, with the number of records it writes:
 * `{ "name()": n }`. A door is a `security definer` function something outside the database reaches
 * (reachedFromOutside). A trigger is not one: it runs inside the statement that fires it, so the door that wrote its
 * table owns the event. Nor is a step, a function only other functions call. Each door is held to what it writes
 * itself, what the functions it calls write and what the triggers on the tables it writes write, each followed to the
 * end; it writes its event when any of them inserts into `events`, but a trigger that fires on a condition (a `WHEN`, or
 * `UPDATE OF` its columns: a line's move to answering, a run's to failed) is no door's event, since nothing here can
 * tell whether a door's write meets it. The tables many places write by design, the spine's
 * own rows and what a writer that only takes away updates or deletes (the writers measure's) are no record here. A
 * statement built as a string (`execute format(…)`) is not seen. `reached` stands in for the repository's callers.
 */
export function doorsWithoutEventsIn(sql, { reached = reachedFromOutside(sql) } = {}) {
  const tables = schemaTables(sql);
  const headers = [
    ...sql.matchAll(new RegExp(String.raw`^CREATE FUNCTION public\.(\w+)\(${ONE_STATEMENT}\n {4}AS `, "gm")),
  ];
  const definer = new Set(
    headers
      .filter((m) => /\bSECURITY DEFINER\b/.test(m[0]) && !/\bRETURNS trigger\b/.test(m[0]))
      .map((m) => m[1].toLowerCase())
      .filter((n) => reached.has(n)),
  );
  const bodies = new Map();
  for (const c of functionChangesIn(sql)) if (c.kind === "create" && c.body) bodies.set(c.name, c.body);
  const writes = new Map([...bodies].map(([n, b]) => [n, tablesWrittenBy(b, tables)]));
  const calls = new Map(
    [...bodies].map(([n, b]) => [
      n,
      [...b.matchAll(/\b(?:public\.)?(\w+)\s*\(/g)]
        .map((m) => m[1].toLowerCase())
        .filter((f) => f !== n && bodies.has(f)),
    ]),
  );
  // Every trigger on a table, for what a door's write reaches; the unconditional ones alone, for whose event it is.
  const fired = new Map();
  const firedAlways = new Map();
  const trigger = String.raw`^CREATE TRIGGER \w+ (${ONE_STATEMENT}) ON public\.(\w+) (${ONE_STATEMENT})EXECUTE FUNCTION public\.(\w+)\(`;
  for (const [, when, table, how, fn] of sql.matchAll(new RegExp(trigger, "gm"))) {
    fired.set(table, [...(fired.get(table) ?? []), fn.toLowerCase()]);
    if (!/\bUPDATE OF\b/.test(when) && !/\bWHEN\b/.test(how))
      firedAlways.set(table, [...(firedAlways.get(table) ?? []), fn.toLowerCase()]);
  }
  const evented = new Set([...writes].filter(([, w]) => w.has("events")).map(([n]) => n));
  const writesItsEvent = (n) =>
    calls.get(n).some((f) => evented.has(f)) ||
    [...writes.get(n)].some((t) => (firedAlways.get(t) ?? []).some((f) => evented.has(f)));
  for (let grew = true; grew;) {
    grew = false;
    for (const n of writes.keys())
      if (!evented.has(n) && writesItsEvent(n)) {
        evented.add(n);
        grew = true;
      }
  }
  // A door and every function its run reaches: what it calls, and what fires on the tables any of them writes. Not
  // what fires on the ledger: an event's own reactions (its outbox, its subscribers) are what a fact causes, the spine's,
  // and a door that reaches the ledger only through a trigger that fires on a condition gains none of them as records.
  const reachOf = (n) => {
    const seen = new Set([n]);
    for (const go = [n]; go.length;) {
      const f = go.pop();
      const next = [
        ...(calls.get(f) ?? []),
        ...[...(writes.get(f) ?? [])].filter((t) => t !== "events").flatMap((t) => fired.get(t) ?? []),
      ];
      for (const g of next)
        if (!seen.has(g) && bodies.has(g)) {
          seen.add(g);
          go.push(g);
        }
    }
    return seen;
  };
  const out = {};
  for (const n of [...definer].sort()) {
    if (evented.has(n)) continue;
    const records = new Set();
    for (const f of reachOf(n)) {
      // A writer that takes away is waived for what it updates and deletes, as the writers measure waives it.
      const inserted = takesAway(`${f}()`) ? tablesWrittenBy(bodies.get(f), tables, { inserts: true }) : null;
      for (const t of writes.get(f) ?? [])
        if (!MANY_WRITERS_BY_DESIGN.has(t) && !SPINE.has(t) && (!inserted || inserted.has(t))) records.add(t);
    }
    if (records.size) out[`${n}()`] = records.size;
  }
  return out;
}

/**
 * The places the dashboard writes on the window for code that is not the app's, each with why. Every other write
 * is a part the bridge holds (bridge/provided.ts) or a module's own value (decision 0151).
 */
export const WINDOW_CONTRACTS = {
  "apps/dashboard/src/bridge/app-bridge.ts":
    "the phone app's door: its native shell calls `window.__appBridge` by that name, from outside the page",
  "apps/dashboard/src/bridge/ask.ts":
    "the nightly e2e's specs, in its own build alone (NEXT_PUBLIC_E2E=1): they ask `window.__ask` what the page would send (e2e/ask.spec.ts, e2e/today/today.spec.ts) from outside the bundle; no customer's page has it, and nothing of the app reads it",
  "apps/dashboard/src/surfaces/settings/connections/whatsapp.ts":
    "Meta's SDK: it calls `window.fbAsyncInit` once loaded, and its sign-in opens through `window.open`, which the page wraps for that press alone",
};

export const MEASURES = [
  {
    name: "functions over the limit",
    file: "complexity.json",
    measure: () => {
      const out = {};
      for (const f of SRC) {
        for (const fn of functionsIn(parse(f))) {
          if (fn.lines > LIMIT.lines || fn.branches > LIMIT.branches || fn.depth > LIMIT.depth) {
            out[`${f}::${fn.key}`] = { lines: fn.lines, branches: fn.branches, depth: fn.depth };
          }
        }
      }
      return out;
    },
    advice:
      "Split it — one builder per band, a table for a decision table, a hook for a component's concern — or keep it under 150 lines, 30 branches and 5 levels.",
  },
  {
    name: "files over the limit",
    file: "file-length.json",
    measure: () => perFile(SRC, linesOf, FILE_LIMIT),
    advice: "Move a domain out of it into its own module; a file over 800 lines is two files.",
  },
  {
    name: "directories over the limit",
    file: "tree-shape.json",
    measure: () => {
      const perDir = {};
      for (const f of TREES) {
        if (!SOURCE.test(f) || URL_TREE.test(f)) continue;
        const dir = path.posix.dirname(f);
        perDir[dir] = (perDir[dir] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(perDir).filter(([, n]) => n > DIRECTORY_LIMIT));
    },
    advice: "Group it by domain, the way apps/edge/lib is: a folder per domain, the plumbing at the root.",
  },
  {
    name: "window globals",
    file: "window-globals.json",
    mode: "set",
    measure: () => {
      const files = {};
      for (const f of SHELL.filter((file) => !(file in WINDOW_CONTRACTS)))
        for (const n of windowUse(parse(f)).names) files[n] = (files[n] ?? 0) + 1;
      return files;
    },
    advice: "No new global: feed the surface through the seam (surface-data.ts), or reuse one that exists.",
  },
  {
    name: "window publishers",
    file: "window-publishers.json",
    measure: () =>
      perFile(
        SHELL.filter((f) => !(f in WINDOW_CONTRACTS)),
        (sf) => windowUse(sf).publishers,
      ),
    advice: "Publish nothing new on window: import it, or add the name to a component that already publishes.",
  },
  {
    // Every hand-written module of the apps and the packages: a server reader compared the column as readily as a page.
    name: "needs_human compared outside the standing rule",
    file: "needs-human-reads.json",
    measure: () =>
      perFile(
        SRC.filter((f) => /\.(tsx?|jsx?|mjs)$/.test(f)),
        needsHumanReads,
      ),
    advice:
      "Ask who has a thread through the standing rule (contracts standingOf, personStanding, packages/db getThreadIdsWaitingOnYou), never the raw state: needs_human is a thread flagged, and a reply a member took stays flagged until handed back (the wiring's second audit, S9-1).",
  },
  {
    name: "resumes sent without the question",
    file: "resumes-unasked.json",
    measure: () =>
      perFile(
        SHELL.filter((f) => /\.tsx?$/.test(f)),
        resumesUnasked,
      ),
    advice:
      "Resume a campaign or a reach-out through the ledger's question (ResumeAct, or ResumePress and ResumeQuestion with useResumeAsk), fed by contracts' act (rowResumeOf, chainResumeOf): it says when it runs next, to about how many, and whether it sends on its own (the wiring's second audit, S9-2).",
  },
  {
    name: "writes past the verb layer",
    file: "writes-past-verbs.json",
    measure: () => perFile(BROWSER_WRITERS, writesPastVerbs),
    advice:
      "Commit it through its verb (bridge/verbs commitVerb, its spec in contracts PROPOSAL_SPECS): the call, the receipt and the undo a sheet and Ask's card share. A verb no spec has yet gets one, beside the family it belongs with (contracts ask-proposals/).",
  },
  {
    name: "copies",
    file: "copies.json",
    measure: () => {
      const files = SRC.filter(notARoute).map(parse);
      const copies = copiesAmong(files, COPY_LIMIT);
      const declaring = (name) => files.filter((sf) => topLevelNames(sf).includes(name));
      return Object.fromEntries(
        Object.entries(copies).filter(([name]) => !declaring(name).every((sf) => isOwnStyleSheet(sf, name))),
      );
    },
    advice:
      "Give it one home and import it from there — a helper declared in three files is a fact spelled out three times — or, when the new one is a different thing, give it a name that says which.",
  },
  {
    name: "casts: as unknown as, as never and x!",
    file: "casts.json",
    measure: () => {
      const out = {};
      for (const f of SRC) {
        const counts = castsIn(parse(f));
        if (Object.keys(counts).length > 0) out[f] = counts;
      }
      return out;
    },
    advice:
      "Name the shape and parse it, or narrow it with a type guard: a value laundered through unknown, told it is never, or told it is not null is a type the compiler no longer checks. An index read that can miss is guarded (const first = rows[0]; if (!first) …), never asserted with !.",
  },
  {
    // A file's `.from("…")` count under its path, and its `.rpc("…")` count under `<path>${RPC_KEY}`: a SQL function
    // called by name outside packages/db is a table read or written there all the same.
    name: "table names outside packages/db",
    file: "tables.json",
    measure: () => {
      const outside = SRC.filter((f) => !f.startsWith("packages/db/"));
      const rpcs = perFile(outside, rpcNames);
      return {
        ...perFile(outside, tableNames),
        ...Object.fromEntries(Object.entries(rpcs).map(([f, n]) => [f + RPC_KEY, n])),
      };
    },
    advice:
      "A table, and a SQL function, is named once, in packages/db (CLAUDE.md, what not to introduce): add a repository or a reader there and call it.",
  },
  {
    // The dashboard's own code (the edge is the service role's by design): each place a module takes the client with
    // RLS off, so a read or write there is fenced to its workspace by hand, not by the database (the setup review's B2).
    name: "service-role reaches in the dashboard",
    file: "service-role.json",
    measure: () =>
      perFile(
        SRC.filter((f) => f.startsWith("apps/dashboard/") && f !== "apps/dashboard/src/server/shared/service-db.ts"),
        serviceRoleReaches,
      ),
    advice:
      "Read and write as the member (the route's session client, where RLS fences the workspace) or through a SQL door that checks it. The service role is for what no member may do: a cross-workspace read for the platform, an invite before the person is a member, a provider's callback.",
  },
  {
    name: "route files that hold a repository or a provider client",
    file: "route-doors.json",
    measure: () => perFile(ROUTES, (sf) => importsMatching(sf, DOOR_FORBIDS)),
    advice:
      "A route file is a door: it verifies, parses its input and answers, and everything else is a call into lib/ (the edge), src/server (the dashboard) or a core verb. Read or write through a repository behind that call, and reach a provider through a wire in packages/channels behind it too.",
  },
  {
    name: "edge statements that name no workspace",
    file: "workspaceless.json",
    measure: () => {
      const tables = tenantTablesOf();
      const out = {};
      for (const f of EDGE) {
        const sf = parse(f);
        if (CROSS_WORKSPACE.test(headerOf(sf))) continue;
        const n = workspacelessStatements(sf, tables);
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "A statement on a workspace's table names the workspace: tenantDb(db, tenantId).from(...) (packages/db), or .eq(\"tenant_id\", …), or a row that carries its tenant_id. A module that reads across workspaces on purpose (a sweep, a provider's webhook) says why in its header, on a line that begins Cross-workspace: and is not measured.",
  },
  {
    // The edge's measure, on the dashboard's statements built on the service role (decision 0111): a session's statement
    // is fenced by row-level security, so only a statement on `serviceDb()`, or a name bound to it, is read.
    name: "dashboard statements as the service role that name no workspace",
    file: "dashboard-workspaceless.json",
    measure: () => {
      const tables = tenantTablesOf();
      const out = {};
      for (const f of SRC.filter((x) => /^apps\/dashboard\/(src\/server|app)\//.test(x))) {
        const sf = parse(f);
        if (serviceRoleReaches(sf) === 0 || CROSS_WORKSPACE.test(headerOf(sf))) continue;
        const n = workspacelessStatements(sf, tables, [], { onClient: serviceRoleClientsOf(sf) });
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      'Build the statement on tenantDb(serviceDb(), tenantId) (packages/db), or name the workspace with .eq("tenant_id", …) or a row that carries it; a module that reads across workspaces on purpose says why in its header, on a line that begins Cross-workspace:, and is not measured.',
  },
  {
    name: "database results whose error is dropped",
    key: "dropped-db-errors",
    measure: () => perFile(BEHIND_THE_DOORS, (sf) => droppedDbErrorsIn(sf).length),
    advice:
      "Read the error where the statement is: `const { data, error } = await …`, or `r.error` on a result held by a name, then throw it, or log it and answer so. supabase-js answers a failed statement with `{ error }` and never throws, and tenantDb throws only on misuse, so a try catches nothing: a failed write looks done, and a failed read looks like no row. A write that may fail on purpose still logs its error. `.throwOnError()`, a `.then`, or a helper handed the statement or the result counts as read.",
  },
  {
    name: "unnamed durations",
    file: "durations.json",
    measure: () => {
      const out = {};
      for (const f of TIMED) {
        const n = durationsIn(parse(f)).length;
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "Name the length of time: a whole minute, hour or day from contracts' shared/time.ts (5 * MIN_MS, DAY_MS), anything else a constant in its module that says what it is (const RETRY_MS = 800; const LEASE_MS = 5 * MIN_MS). A value that is not a time says its unit in its name (RADIUS_MAX_M, TAB_TOTAL_CHARS).",
  },
  // One is left, argued (26 Nov 2026): the phone app's widget (apps/mobile/src/shell/widget.ios.ts) says its "as of" in
  // the phone's own clock, since the widget's runtime has no workspace zone. It is counted, and it waits for the phone
  // app, paused since 7 Oct 2026, whose change nothing but a phone build could prove.
  {
    name: "dates said with no zone",
    key: "zoneless-dates",
    measure: () => {
      const out = {};
      for (const f of ZONED) {
        const n = zonelessDatesIn(parse(f)).length;
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "Say it by the workspace's clock: contracts' clock.ts (clockTime, clockDate, clockNearWhen and the rest) with the workspace's zone, which a page reads from pageClock().zone() and a server from its tenant, or dateFormat(locale, { timeZone, … }). A day key, which is no instant, is formatted from its UTC noon with timeZone: \"UTC\" (calendar/words.ts).",
  },
  {
    name: "zones read outside zone-math",
    key: "zone-readers",
    measure: () => {
      const out = {};
      for (const f of ZONED) {
        if (f === "packages/contracts/src/shared/zone/math.ts") continue;
        const n = zoneReadersIn(parse(f)).length;
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "Read the zone through contracts' shared/zone/math.ts, its one reading: zoneParts(tz, at) for the parts, dayInZone(tz, ms).key for the day, clockInZone for the wall clock, dayPlusInZone to step a day by the calendar, and usableZone(tz) first where a zone Intl cannot use must read as UTC rather than throw.",
  },
  {
    name: "breakpoints outside the set",
    file: "breakpoints.json",
    // `file::width`: where the width is and where it splits the screens (_ast.mjs mediaWidths), so a page cannot trade
    // one stray for another; its count, how many conditions split there.
    measure: () => {
      const set = breakpointSet();
      const out = {};
      const hold = (file, widths) => {
        for (const w of widths) if (!set.has(w)) out[`${file}::${w}`] = (out[`${file}::${w}`] ?? 0) + 1;
      };
      for (const f of DASHBOARD_CSS) hold(f, mediaPreludes(readRaw(f)).flatMap(mediaWidths));
      for (const f of DASHBOARD_SRC) hold(f, stringsIn(parse(f)).flatMap(mediaWidths));
      return out;
    },
    advice:
      "Change the layout at one of tokens.css's breakpoints, from either side: (max-width: 720px) or (min-width: 721px), (max-width: 900px) or (width > 900px). A page that needs a width of its own says why in its row of docs/debt.md, and a new width for the whole product is a new --bp- token.",
  },
  {
    name: "literal style values",
    file: "style-values.json",
    measure: () => {
      const out = {};
      for (const f of STYLES) {
        const { values } = cssOf(f);
        if (STYLE_VALUE_FIELDS.some((k) => values[k] > 0)) out[f] = values;
      }
      return out;
    },
    advice:
      "Read a token: a type size, radius, shadow, colour or blur is declared once, in apps/dashboard/src/styles/tokens.css, and a stylesheet reads it with var(). If no token fits, add one there (the interface kit's rule 1, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md).",
  },
  {
    name: "primitives outside the kit",
    file: "kit-primitives.json",
    // Held by count, not as a set: `.btn` is already named in ten page stylesheets, and a new `.pl-peek .btn { … }`
    // in any of them is one more selector restyling the kit from a page.
    measure: () => {
      const out = {};
      for (const f of STYLES.filter((f) => f !== KIT_CSS)) {
        for (const [name, n] of Object.entries(cssOf(f).classes)) if (isPrimitiveClass(name)) out[`${f}::${name}`] = n;
      }
      return out;
    },
    advice:
      "Draw it with the kit's primitive, never a class of the page's own: the kit's rules are in apps/dashboard/src/surfaces/kit/kit.css, their names in classes.json beside it. Place it through a class of the page's own that names no kit class and holds no primitive's word, since a selector naming a kit class counts even when it only places it. If the kit has nothing that fits, it takes a new variant with its gallery entry (the interface kit's rule 3, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md; .claude/skills/chanlytics-interface/SKILL.md).",
  },
  {
    name: "inline style props",
    file: "inline-styles.json",
    measure: () => perFile(MARKUP, inlineStyles),
    advice:
      "Style it with a class that reads tokens, not a style prop: a value in a prop is one no look can reach (the interface kit's rule 1, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md).",
  },
  {
    // contracts holds the one writer of a record's route and of a link (addressOf, appLink); the code that ships beside it
    // is counted. Its tests are not: a test spells the route it expects.
    name: "routes and links written by hand",
    file: "hand-routes.json",
    measure: () =>
      perFile(
        SRC.filter(
          (f) => /\.(tsx?|jsx?|mjs)$/.test(f) && !f.startsWith("packages/contracts/") && !f.includes("/dist/"),
        ),
        handRoutesIn,
      ),
    advice:
      "Write a record's route with contracts addressOf({ kind, id }) and a link to a workspace's page with appLink(slug, route): the one writer, so a route is spelled as its page reads it and a retired one moves in one place (the wiring's second audit, S5-6).",
  },
  {
    // Each registered clock's kind is clocks/_clocks.mjs's; ops/sweep-registry.db.test.mjs holds every row to one.
    name: "event-shaped clocks",
    file: "event-shaped-clocks.json",
    measure: () =>
      Object.fromEntries(
        Object.entries(CLOCKS)
          .filter(([, c]) => c.kind === "event-shaped")
          .map(([name]) => [name, 1]),
      ),
    advice:
      "A clock that runs a timer or a reaction belongs on a due row or after its event (decision 0031, invariant 6): set the job's due_at where the timer starts, or subscribe to the event, and keep the clock to reconcile, judge, keep or roll.",
  },
  {
    // A table's writers: the modules and the live SQL functions that write it (writersByTable); one is a door.
    name: "tables with more than one writer",
    file: "writers.json",
    measure: () =>
      Object.fromEntries(
        [...writersByTable()].map(([table, who]) => [table, codeWritersOf(who)]).filter(([, n]) => n > 1),
      ),
    advice:
      "One record, one door writes it (decision 0031, invariant 1): write the table through the door that already writes it, the SQL function or the repository in packages/db, rather than adding a writer.",
  },
  {
    name: "doors writing a record with no event",
    file: "doors-without-events.json",
    measure: () =>
      Object.fromEntries(
        Object.entries(doorsWithoutEventsIn(readRaw(SCHEMA_SQL))).filter(
          ([door]) => !Object.hasOwn(NO_FACT_DOORS, door) && !Object.hasOwn(VAULT_DOORS_COVERED, door),
        ),
      ),
    advice:
      "A fact and its event share a transaction (decision 0031, invariant 2): write the record's event in the door, beside the write (insert into public.events, or a trigger on the table that does). A door whose rows are the machine's and no record's news is named in NO_FACT_DOORS with why.",
  },
  {
    // Each column's strategy is packages/db's ERASURE_STRATEGIES; people/erasure/erasure-registry.test.mjs holds it to
    // the schema. Per column, so a column named while another arrives unnamed is still a new offender.
    name: "personal columns with no erasure strategy",
    file: "erasure-strategies.json",
    measure: () =>
      Object.fromEntries(
        personalColumns()
          .filter((c) => {
            const [table, column] = c.split(".");
            return !ERASURE_STRATEGIES[table]?.[column];
          })
          .map((c) => [c, 1]),
      ),
    advice:
      "Say how an erasure reaches the column, in the change that adds it (decision 0036): its strategy in packages/db/src/repositories/erasure/registry.ts, gone with the person, scrubbed by a named leg, kept as a digest, removed by age, or not personal.",
  },
];

/* ---- Source-text reads in tests (repo/source-scan-ratchet.test.mjs) ---- */

export const TESTS_DIR = "tests";
const SOURCE_SCAN_SELF = "repo/source-scan-ratchet.test.mjs";

/**
 * The test files the REPOSITORY has, not the files this laptop has, each keyed
 * by its path relative to tests (`people/person-notes.test.mjs`).
 *
 * Learned from CI, on the source-scan ratchet's first run: its baseline was
 * seeded from a working tree that held another session's UNTRACKED test file,
 * and CI, checking out the repo, found four fewer source reads than the baseline
 * claimed. A number that differs between a checkout and a desk is not a ratchet
 * but a number two people can argue about, so the set is `git ls-files`, and an
 * untracked scratch test cannot move a repo-wide count in either direction. The
 * same lesson, in reverse, on the day the ratchets were seeded: a file that is
 * not yet tracked is not yet counted, so seed after staging.
 *
 * Falls back to the directory when git is unavailable, because a test that
 * cannot run at all is worse than one measuring a slightly wider set.
 */
function repoTestFiles() {
  // A test file, or the world a folder of them shares (`<folder>/_<name>.mjs`): since 25 Nov 2026, when the long files
  // were split by behaviour (layer 14), a helper that reads source may live in its folder's world, and a read moved
  // there is the same read. The suite's root helpers (tests/_source.mjs, _measures.mjs, _ast.mjs and the rest) are the
  // reading's own machinery, not a test's reads, and are left out.
  const counted = (l) => l.endsWith(".test.mjs") || /^[^/]+\/(.+\/)?_[^/]+\.mjs$/.test(l);
  try {
    return execFileSync("git", ["ls-files", TESTS_DIR], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith(`${TESTS_DIR}/`))
      .map((l) => l.slice(TESTS_DIR.length + 1))
      .filter(counted);
  } catch {
    return fs
      .readdirSync(path.join(ROOT, TESTS_DIR), { recursive: true })
      .map((f) => String(f).split(path.sep).join("/"))
      .filter(counted);
  }
}

/**
 * Every test file and, for those that read source as text, how many times: `readCode(` and `readRaw(` on the
 * comment-stripped file, and each call of a helper of the file's own that reads a source file with `readFileSync`
 * (`sourceReads`, measured on the syntax tree). The helpers went uncounted until 29 Sep 2026: 22 reads in 7 files the
 * count did not see, banked then as a correction of the measure.
 */
export function sourceScan() {
  const files = repoTestFiles().filter((f) => f !== SOURCE_SCAN_SELF && fs.existsSync(path.join(ROOT, TESTS_DIR, f)));
  const counts = Object.fromEntries(
    files
      .map((f) => {
        const rel = `${TESTS_DIR}/${f}`;
        return [f, (readCode(rel).match(/\b(readCode|readRaw)\(/g) ?? []).length + sourceReads(parse(rel))];
      })
      .filter(([, n]) => n > 0),
  );
  return { files, counts };
}

/**
 * Where a rule test lives: a test whose whole purpose is a rule of the repository (every write names a workspace, every
 * variable is declared where it is read, the words a screen may say, no trade's words before another's customers). Its
 * reads of source are the rule, so they are counted apart from the behaviour tests' (RULE_SCAN), and held there too.
 * Since 25 Nov 2026 (layer 14) the home of the repository's rules, `tests/repo/`, is where one is; before, eight files
 * were named in a list, and the rest of `tests/repo/` was counted as if it pinned one module's behaviour.
 */
export const RULE_TESTS_DIR = "repo/";

/**
 * The rule tests that live beside the domain they hold, not under `tests/repo/`: each a repo-wide lint of its kind,
 * named here with the change that argued it. The list is the part that rots, so it stays a handful
 * (repo/source-scan-ratchet.test.mjs holds it to three), and a file added to it is a line of this module in review.
 * edge/runtime-freshness.test.mjs left it on 26 Nov 2026: what it read is run now, so it is a behaviour test.
 */
export const RULE_TESTS_ELSEWHERE = [
  "ai/flag-registry.test.mjs",
  "e2e/e2e-shape.test.mjs",
  "routes/workspace-scoping.test.mjs",
];

/** Whether a test file (relative to `tests/`) is a rule test, whose reads of source are its rule. */
export const isRuleTest = (f) => f.startsWith(RULE_TESTS_DIR) || RULE_TESTS_ELSEWHERE.includes(f);

/** Source-text reads in the behaviour tests, by file: every test that reads source, the rule tests left out. */
export const SOURCE_SCAN = {
  name: "source-text reads in tests",
  key: "source-scan",
  measure: () => Object.fromEntries(Object.entries(sourceScan().counts).filter(([f]) => !isRuleTest(f))),
  advice:
    "Write a behaviour test instead: run the code and assert what it does. A test whose whole purpose is a rule of the repository lives in tests/repo/ (RULE_TESTS_DIR, _measures.mjs), where its reads are counted apart.",
};

/** Source-text reads in the rule tests, by file: held apart, since reading the source is what such a test is for. */
export const RULE_SCAN = {
  name: "source-text reads in rule tests",
  key: "rule-scan",
  measure: () => Object.fromEntries(Object.entries(sourceScan().counts).filter(([f]) => isRuleTest(f))),
  advice:
    "A rule test reads what its rule is about and no more. Where the rule can be asked of the code (a type, a parsed config, a list the code exports), ask it there and drop the read.",
};

/* ---- The wire's names (routes/wire/wire-casing.test.mjs) ---- */

/**
 * The typed client's registry: every /api/v1 handler under the key route-policy.json gives it, as a type that
 * carries what the handler takes and answers (the phantom `Shape<I, O>` of apps/dashboard/src/server/route.ts).
 */
export const WIRE_REGISTRY = "apps/dashboard/src/client/routes.generated.ts";
/** How many levels below a route's body, query or answer its names are read. */
export const WIRE_DEPTH = 6;
/** The wire's one casing (docs/naming.md): lower-case words joined by underscores, one word included. */
export const isSnakeCase = (name) => /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
/** Objects JSON writes as a string or as nothing: their members are not names on the wire. */
const NOT_OBJECTS_ON_THE_WIRE = new Set([
  "Date",
  "Map",
  "Set",
  "Promise",
  "Response",
  "Blob",
  "ArrayBuffer",
  "Uint8Array",
  "ReadableStream",
  "Headers",
  "URL",
]);

/**
 * Every property name in `type`, to WIRE_DEPTH levels below it: through unions, intersections, arrays and a record's
 * values, never a record's keys (a workspace's id is data, not a name). A type met again is walked again only from
 * higher up, where more of it is in reach, so what is found does not depend on the order it is met in.
 */
function namesIn(checker, type, at, out, depth = 0, seen = new Map()) {
  if (!type || depth > WIRE_DEPTH || (seen.get(type) ?? Infinity) <= depth) return out;
  seen.set(type, depth);
  if (type.isUnion() || type.isIntersection()) {
    for (const t of type.types) namesIn(checker, t, at, out, depth, seen);
  } else if (checker.isArrayType(type) || checker.isTupleType(type)) {
    for (const t of checker.getTypeArguments(type)) namesIn(checker, t, at, out, depth + 1, seen);
  } else if (type.flags & ts.TypeFlags.Object && !NOT_OBJECTS_ON_THE_WIRE.has(type.getSymbol()?.getName())) {
    for (const info of checker.getIndexInfosOfType(type)) namesIn(checker, info.type, at, out, depth + 1, seen);
    for (const p of checker.getPropertiesOfType(type)) {
      // A symbol-keyed member (a brand, the phantom shape itself) is a type's, never JSON's.
      if (p.getName().startsWith("__@")) continue;
      out.add(p.getName());
      namesIn(checker, checker.getTypeOfSymbolAtLocation(p, at), at, out, depth + 1, seen);
    }
  }
  return out;
}

/**
 * What each route in a registry takes and answers, by name: `{ [route]: { takes, answers, hidden } }`, each list
 * sorted, or null for a handler that carries no shape. `hidden` says which side, `takes` or `answers`, is `any` or
 * `unknown` as a whole, so has no names the walk can read. The registry is a module whose `Routes` type names each
 * handler; a handler's module the checker could not resolve reads as `any`, which has no shape, so it cannot read as
 * clean.
 */
export function wireShapes(program, registry) {
  const checker = program.getTypeChecker();
  const alias = program
    .getSourceFile(registry)
    ?.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Routes");
  if (!alias) throw new Error(`${registry} has no Routes type for the checker to read`);
  const typeOf = (io, name) => {
    const s = io.getProperty(name);
    return s && checker.getTypeOfSymbolAtLocation(s, alias);
  };
  const side = (io, name) => [...namesIn(checker, typeOf(io, name), alias, new Set())].sort();
  const opaque = (io, name) => Boolean(typeOf(io, name)?.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown));
  const out = {};
  for (const route of checker.getPropertiesOfType(checker.getTypeAtLocation(alias.name))) {
    const handler = checker.getTypeOfSymbolAtLocation(route, alias);
    const shape = checker.getPropertiesOfType(handler).find((p) => p.getName().startsWith("__@shape"));
    const io = shape && checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(shape, alias));
    out[route.getName()] = io
      ? {
          takes: side(io, "input"),
          answers: side(io, "output"),
          hidden: [
            ["takes", "input"],
            ["answers", "output"],
          ]
            .filter(([, name]) => opaque(io, name))
            .map(([said]) => said),
        }
      : null;
  }
  return out;
}

let dashboard;
/**
 * The dashboard's registry read with the dashboard's own compiler options, as its typecheck reads it, once per
 * process: the program takes seconds to build, and the ratchet and the guards beside it read the same shapes.
 */
export function dashboardWire() {
  if (!dashboard) {
    const config = ts.getParsedCommandLineOfConfigFile(
      path.join(ROOT, "apps/dashboard/tsconfig.json"),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => {
          throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
        },
      },
    );
    const registry = path.join(ROOT, WIRE_REGISTRY).split(path.sep).join("/");
    const program = ts.createProgram({
      rootNames: [registry],
      options: { ...config.options, noEmit: true, incremental: false },
    });
    dashboard = wireShapes(program, registry);
  }
  return dashboard;
}

/** One entry per name a route takes or answers that is not snake_case: `<route> takes <name>`, `<route> answers <name>`. */
export function offTheWire(shapes) {
  const out = {};
  for (const [route, io] of Object.entries(shapes)) {
    for (const name of io?.takes ?? []) if (!isSnakeCase(name)) out[`${route} takes ${name}`] = 1;
    for (const name of io?.answers ?? []) if (!isSnakeCase(name)) out[`${route} answers ${name}`] = 1;
  }
  return out;
}

/** The register's two numbers for the wire: how many distinct names are not snake_case, and in how many routes. */
export function wireCounts(held) {
  const parts = Object.keys(held ?? {}).map((k) => /^(.*) (?:takes|answers) (\S+)$/.exec(k) ?? [k, k, k]);
  return { names: new Set(parts.map((p) => p[2])).size, routes: new Set(parts.map((p) => p[1])).size };
}

/** The wire's ratchet: its own test file, because it needs the type checker's program, not the syntax trees above. */
export const WIRE_CASING = {
  name: "wire names not in snake_case",
  file: "wire-casing.json",
  measure: () => offTheWire(dashboardWire()),
  advice:
    "The wire is snake_case (docs/naming.md, decision 0022): name the field in snake_case in the route's type, and turn a view model into it in a named mapping, never a converter. A field a page or the phone app reads is answered in both spellings for one release.",
};

/* ---- The workspace's projects, as the compiler reads them ---- */

/** A project's tsconfig as the compiler resolves it, its `extends` followed. */
export function resolvedConfig(tsconfig) {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfig,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      },
    },
  );
  if (!parsed) throw new Error(`${tsconfig} could not be read`);
  return parsed;
}

/** Every workspace project's tsconfig.json, by its project's path: the packages and the apps. */
export function projectConfigs() {
  const out = [];
  for (const group of ["packages", "apps"]) {
    for (const name of fs.readdirSync(path.join(ROOT, group)).sort()) {
      const tsconfig = path.join(ROOT, group, name, "tsconfig.json");
      if (fs.existsSync(tsconfig)) out.push({ project: `${group}/${name}`, tsconfig });
    }
  }
  return out;
}

/* ---- Test files over the limit ---- */

/*
 * The suite's own test files, held by their length as file-length holds the code that ships. The largest cannot be
 * reviewed, and running one of their cases runs all of them: the runner's unit is the file. A test file's limit is
 * twice a module's: a case writes its world and its assertions out longhand, and the suite's median file ran about
 * twice the median module's length on 26 October 2026, at e9d6325f0, with the limit above nineteen files in twenty, so
 * it holds the tail and not the body. A file file-length already holds is left to it: the phone app's tests
 * (apps/mobile/test) ship with the app and meet a module's limit there first, so each file answers to one limit.
 */
export const TEST_FILE_LIMIT = 1600;

/**
 * The node suite's own test files, tracked, as its launcher globs them (`SUITES.test`, checks/test.mjs): git's
 * `:(glob)` pathspec reads `**` and `*` as the runner does. A glob that lists nothing stops the measure, since an empty
 * listing would read as every offender gone.
 */
export function suiteFiles() {
  return SUITES.test.flatMap((glob) => {
    const found = repoFiles([`:(glob)${glob}`]);
    if (!found.length)
      throw new Error(
        `git ls-files lists nothing for the launcher's ${glob}: the test-length measure has nothing to read`,
      );
    return found;
  });
}

/**
 * A file's text as `linesOf` reads a syntax tree (file-length's measure): TypeScript's own line map of it, and no
 * parse. A length needs no tree, and parsing every test file to count its lines would cost seconds and memory.
 */
export const lineMapOf = (text) => ({
  text,
  end: text.length,
  getLineAndCharacterOfPosition: (pos) => ts.getLineAndCharacterOfPosition({ text }, pos),
});
export const testLength = (file) => linesOf(lineMapOf(fs.readFileSync(path.join(ROOT, file), "utf8")));

export const TEST_LENGTH = {
  name: "test files over the limit",
  file: "test-length.json",
  measure: () => {
    const held = MEASURES.find((m) => m.file === "file-length.json").measure();
    return Object.fromEntries(
      suiteFiles()
        .filter((f) => !(f in held))
        .map((f) => [f, testLength(f)])
        .filter(([, n]) => n > TEST_FILE_LIMIT),
    );
  },
  advice: `Split it by concern: a file each, named for what it proves, the world they share in their folder's _<name>.mjs, and a folder of their own where this one is at its limit of modules (tree-shape). A test file over ${TEST_FILE_LIMIT} lines is two files.`,
};

/* ---- Waits that count turns of the loop, or time, in the suite's tests ---- */

/**
 * The node suite's waits for work a test cannot await that wait a fixed count of turns of the loop, or a fixed time
 * (fixedWaitsIn, _ast.mjs), by file. Such a wait passes while the work takes no longer than it counts, and fails once in
 * a while when it does: on 29 Oct 2026 two did beside a second run of the suite, where an import() went through tsx's
 * loader off the main thread. A wait for what the next lines read (`until`, tests/shared/_until.mjs) holds on any
 * machine. Seeded on 30 Oct 2026; a wait before asserting that nothing more happened stays one, since there is nothing
 * to wait for, so the measure falls as waits are moved to conditions and never reaches nothing.
 *
 * The worlds the tests share are read too (TEST_WORLDS, every `_<name>.mjs` under tests/): since 25 Nov 2026, when the
 * suite's long files were split by behaviour (layer 14), a helper that waits lives in its folder's world as often as in
 * a test file, and a wait moved there is the same wait.
 */
export const TEST_WORLDS = /^tests\/(.+\/)?_[^/]+\.mjs$/;
export const COUNTED_WAITS = {
  name: "waits that count turns or time in tests",
  key: "counted-waits",
  measure: () =>
    Object.fromEntries(
      [...suiteFiles(), ...repoFiles(["tests"]).filter((f) => TEST_WORLDS.test(f))]
        .map((f) => [f, fixedWaitsIn(parse(f)).length])
        .filter(([, n]) => n > 0),
    ),
  advice:
    'Wait for what the next lines read: `await until(() => <it>, "<what>")` from tests/shared/_until.mjs (a toast up, a write the fake wire saw, the page drawn as it is after the answer). A wait before asserting that nothing more happened is the one a count is for: argue it in the pull request.',
};

/* ---- Browser specs in quarantine ---- */

/**
 * Tests that are red, known and not worth today (quarantinesIn, _ast.mjs), by spec file. The nightly's whole suite is held
 * green by these, so a new one is a decision a pull request says out loud, and they may only fall. Without the count a
 * quarantine is the same always-red by another name: the nightly was red 32 nights in a row, and nobody read it.
 */
export const E2E_QUARANTINE = {
  name: "browser specs in quarantine",
  key: "e2e-quarantine",
  measure: () =>
    Object.fromEntries(
      repoFiles(["e2e"])
        .filter((f) => f.endsWith(".spec.ts"))
        .map((f) => [f, quarantinesIn(parse(f))])
        .filter(([, n]) => n > 0),
    ),
  advice:
    "Fix the spec or the page it found. Where it is truly not worth today, say why in the pull request's `Debt:` line, in the one shape: `test.fixme(true, \"quarantine: <date> <why>\")` as the test body's first line.",
};

/* ---- Event kinds written only from TypeScript (repo/event-kinds.test.mjs reads the same map) ---- */

/** An event kind as the product spells it: `<record>.<what happened>`. */
export const EVENT_KIND = /^[a-z_]+\.[a-z_]+$/;

export function walkTypeScript(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (["node_modules", "dist", ".next", ".types", "tests"].includes(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walkTypeScript(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

/**
 * kind → the files that write it. The emitters are found the way they are written: `insert into events` in a
 * migration, `emitEvent(...)` and `recordEvent(...)` (packages/db events.ts), the send door's own `event(...)`, a direct
 * `.from("events").insert({ kind })`, a verdict that names its event, and a `*_KIND` constant.
 */
export function emittedKinds() {
  const by = new Map();
  const add = (kind, file) => {
    if (!by.has(kind)) by.set(kind, new Set());
    by.get(kind).add(file);
  };
  // SQL: each insert into events, the first dotted literal in its values.
  for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((n) => n.endsWith(".sql"))) {
    const src = readRaw(`supabase/migrations/${f}`);
    for (const m of src.matchAll(/insert into (?:public\.)?events\b([\s\S]*?);/g)) {
      const lit = m[1].match(/'([a-z_]+\.[a-z_]+)'/);
      if (lit) add(lit[1], `supabase/migrations/${f}`);
    }
  }
  // TypeScript: the runtimes and the packages, never the tests or the built copies.
  for (const dir of [
    "apps/edge",
    "apps/dashboard/src",
    "apps/dashboard/app",
    "packages/db/src",
    "packages/core/src",
    "packages/jobs/src",
    "packages/log/src",
    "packages/channels/src",
    "packages/contracts/src",
  ]) {
    for (const f of walkTypeScript(dir)) {
      const src = readRaw(f);
      const consts = new Map(
        [...src.matchAll(/const ([A-Z_]+_KIND)\s*=\s*"([a-z_]+\.[a-z_]+)"/g)].map((m) => [m[1], m[2]]),
      );
      // Every literal inside the call, to its closing paren: a conditional that picks one of three billing kinds
      // names all three.
      // The dashboard's events ledger named its kinds the same way, without the client, until its callers' doors (00724).
      for (const m of src.matchAll(/\b(?:emitEvent|recordEvent|emitWorkspaceEvent|recordWorkspaceEvent)\(/g)) {
        let depth = 0;
        let i = m.index;
        for (; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        const call = src.slice(m.index, i + 1);
        for (const lit of call.matchAll(/"([a-z_]+\.[a-z_]+)"/g)) if (EVENT_KIND.test(lit[1])) add(lit[1], f);
        for (const c of call.matchAll(/\b([A-Z_]+_KIND)\b/g)) if (consts.has(c[1])) add(consts.get(c[1]), f);
      }
      for (const m of src.matchAll(/\.from\("events"\)\s*\.insert\(\{[\s\S]{0,400}?kind:\s*"([a-z_]+\.[a-z_]+)"/g))
        add(m[1], f);
      // The send door's own event(db, delivery, kind, ...): the delivery by whatever name the door gives it.
      for (const m of src.matchAll(/\bevent\(\s*(?:ports\.)?db,\s*[\w$]+,\s*"([a-z_]+\.[a-z_]+)"/g)) add(m[1], f);
      // A verdict that names its own event kind (channels/a2p: the line's texting state).
      for (const m of src.matchAll(/\bevent:\s*"(line\.[a-z_]+)"/g)) add(m[1], f);
    }
  }
  return by;
}

/** Whether Activity shows a kind: one it does not keep from its rows and its picker (contracts' noise kinds and families). */
export const shownInActivity = (kind) =>
  !ACTIVITY_NOISE_KINDS.includes(kind) && !ACTIVITY_NOISE_PREFIXES.some((p) => kind.startsWith(p));

/** The repository's migrations, in order: `[{ name, sql }]`. */
const migrationTexts = () =>
  fs
    .readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => ({ name: n.replace(/\.sql$/, ""), sql: readRaw(`supabase/migrations/${n}`) }));

/**
 * Every function the migrations define, as its last definition left it: `Map(name → { kinds, migration })`, `kinds`
 * the declared event kinds among the dotted literals of its `insert into events` statements (a kind a `case` picks is
 * one of them). `each` is told every definition in order, with the kinds of the one before it (an empty set for a
 * function's first).
 */
export function kindsByFunction(migrations = migrationTexts(), each = () => {}) {
  const declared = new Set(EVENT_KINDS);
  const last = new Map();
  for (const { name: migration, sql } of migrations) {
    for (const m of sql.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi)) {
      const as = /\bas\s+(\$\w*\$)/i.exec(sql.slice(m.index));
      if (!as) continue;
      const open = m.index + as.index + as[0].length;
      const body = sql.slice(open, sql.indexOf(as[1], open));
      const kinds = new Set();
      for (const ins of body.matchAll(/\binsert\s+into\s+(?:public\.)?events\b([\s\S]*?);/gi))
        for (const lit of ins[1].matchAll(/'([a-z_]+\.[a-z_]+)'/g)) if (declared.has(lit[1])) kinds.add(lit[1]);
      const fn = m[1].toLowerCase();
      each({ fn, migration, kinds, before: last.get(fn)?.kinds ?? new Set() });
      last.set(fn, { kinds, migration });
    }
  }
  return last;
}

/**
 * The migration the shown kinds are held from: every door it and the migrations after it define writes a kind Activity
 * shows only where the door's own definition before wrote it, or where SHOWN_KINDS_NEW_TO_A_DOOR argues the pair.
 */
export const SHOWN_KINDS_HELD_FROM = "00723";

/**
 * A kind Activity shows says one act, often in one channel's words ("The owner replied from the WhatsApp Business app,
 * and AI stepped back"), so a door that starts writing one puts that line in Activity for every call it takes, true
 * or not. Each pair a migration from SHOWN_KINDS_HELD_FROM on makes, a door and a shown kind its definition before did
 * not write, is argued here with the act, its words, and why they are true of this door: `{ "door() <- kind": why }`.
 * The owner's own email first wrote the WhatsApp echo's kind here (00723, before review): it writes one of its own
 * now, conversation.owner_emailed, kept from Activity's rows.
 */
export const SHOWN_KINDS_NEW_TO_A_DOOR = {
  "workspace_own_fields_write() <- settings.changed":
    "The workspace's name, zone or word for a booking changed: its words (\"Settings changed\") are this door's act, which the dashboard wrote after a session's update of the row from TypeScript until the door (00724)",
  "ad_accounts_stop_launches() <- ad.made":
    "An ad made here whose campaign's switch was out or done as its account was let go is the ad it is, never one that stopped part way (00725): its words (\"An ad was set up at Meta\") are the launch's own act, which ad_launch_keep writes where a launch ends by itself and this trigger writes, once, where the account was let go first. Every other launch it stops writes ad.setup_stopped, as before",
  "whatsapp_channel_activate() <- channel.connected":
    "A WhatsApp number connected: its words (\"A WhatsApp number was connected\") are this door's act, the number's row turned active, which the edge wrote after the row from TypeScript until the door (00723)",
};

/**
 * Each door a migration from `from` on defines that writes a kind Activity shows which the door's definition before it
 * did not write: `{ "door() <- kind": "the migration" }`. `shown` says which kinds Activity shows.
 */
export function shownKindsNewToADoor({
  migrations = migrationTexts(),
  from = SHOWN_KINDS_HELD_FROM,
  shown = shownInActivity,
} = {}) {
  const found = {};
  kindsByFunction(migrations, ({ fn, migration, kinds, before }) => {
    if (migration < from) return;
    for (const k of kinds) if (!before.has(k) && shown(k)) found[`${fn}() <- ${k}`] = migration;
  });
  return found;
}

/**
 * The families of evidence: a token count, a webhook's knock, a message no workspace takes (Activity's own noise
 * families, contracts ACTIVITY_NOISE_PREFIXES). Such an event is the only thing written, where it is observed, so it
 * has no record to share a transaction with, and it is no kind this measure holds.
 */
export const EVIDENCE_FAMILIES = ACTIVITY_NOISE_PREFIXES;

/**
 * Kinds whose event is the only thing written where it is observed, each with why: no row of ours changes for them, so
 * there is no record for the event to share a transaction with. repo/measures.test.mjs holds each to be written from
 * TypeScript alone still, so one a door comes to write leaves this list.
 */
export const LEDGER_ONLY_KINDS = {
  "policy.veto_window_skipped":
    "A hold the workspace configured that did not happen, because its scheduling failed: the one write that would have been the record is the one that failed, and the event is what tells the owner",
  "billing.trial_ending":
    "Stripe's word that a trial ends in three days: no row of ours changes for it; its bell is kept once under the Stripe event, and the event records the word",
  "call.screened":
    "A call turned away, or let pass with no call back owed (decision 0138): a count for Reports (ACTIVITY_NOISE_KINDS), observed before any row of the call exists; the third writer, a reply draft that reads its sender as selling, sets the thread aside through its own door first, and moves with it",
  "google.reply_held":
    "A reply the receptionist wrote for a review and did not post, as it named a price or money: no row changes for it, and the event is the hold's one record, which the next sync reads back so the review is not drafted again (getSubjectsWith)",
  "file.posted":
    "A post put on the Google profile: Google holds the post, and no row of ours is written for it; the event is the record of where it is, which the file's page reads back (findFilePosted)",
  "file.unposted":
    "A post taken off the Google profile: the same record's other half, read back the same way (findFilePosted)",
};

export const TS_ONLY_EVENTS = {
  name: "event kinds written only from TypeScript",
  file: "ts-only-events.json",
  mode: "set",
  measure: () =>
    Object.fromEntries(
      [...emittedKinds()]
        .filter(([kind]) => !EVIDENCE_FAMILIES.some((family) => kind.startsWith(family)))
        .filter(([kind]) => !Object.hasOwn(LEDGER_ONLY_KINDS, kind))
        .filter(([, files]) => [...files].every((f) => !f.startsWith("supabase/")))
        .map(([kind, files]) => [kind, files.size]),
    ),
  advice:
    "A fact and its event share a transaction (decision 0031, invariant 2; the wiring's second audit, S11-9): write the event in the SQL door that writes the fact, beside the write, rather than from TypeScript after it.",
};

/* ---- Appointment words written in (journey/journey.test.mjs holds what the count reads) ---- */

/**
 * Each place a person reads "visit" in a sentence or a label the code writes in (_ast.mjs visitsWrittenIn), by file.
 * It reached zero on 25 Nov 2026, and journey.test.mjs holds it there.
 */
export function appointmentWordsWrittenIn() {
  const out = {};
  for (const file of readerFiles()) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const n = visitsWrittenIn(parse(rel)).length;
    if (n > 0) out[rel] = n;
  }
  return out;
}

export const APPOINTMENT_WORDS = {
  name: "appointment words written in",
  file: "appointment-words.json",
  measure: appointmentWordsWrittenIn,
  advice:
    'A sentence a person reads says the workspace\'s appointment word (contracts appointmentWords), or none: never "visit" written in.',
};

/* ---- Every number the build holds ---- */

/**
 * Each ratchet: its `key` (the name check:debt and the register give it; until 28 October 2026 the baseline file it was
 * kept in, `file`, which a base from before then is read from), its name, its mode ("count": each key's numbers may
 * only fall; "set": the keys may only go away, the numbers beside them a record), its measure and its advice.
 */
export const RATCHETS = [
  ...MEASURES,
  WIRE_CASING,
  TEST_LENGTH,
  COUNTED_WAITS,
  E2E_QUARANTINE,
  TS_ONLY_EVENTS,
  APPOINTMENT_WORDS,
  SOURCE_SCAN,
  RULE_SCAN,
  ...NAME_RATCHETS,
  ...BOUNDARY_RATCHETS,
  ...SIZE_RATCHETS,
  ...RULE_RATCHETS,
  ...WORD_RATCHETS,
  ...API_RATCHETS,
  ...TYPE_RATCHETS,
].map((m) => ({ mode: "count", ...m, key: m.key ?? m.file.replace(/\.json$/, "") }));
