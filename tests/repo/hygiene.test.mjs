/**
 * The deferred hygiene from the Tier 1 review, closed.
 *
 * F44 the session role could UPDATE any column the row policies allowed —
 * an operator could rewrite an inbound message's body through PostgREST;
 * F48 opening one person's profile materialised every message the tenant
 * ever exchanged, and the metrics CTEs were materialised where an index was
 * meant to be used; F51 a GET wrote invitations on the way through, exempt
 * from the cross-site check by being a GET; F15 a hundred calls with
 * per-word timings on every refresh were most of the payload.
 *
 * Where each is held since 26 Nov 2026, when this file stopped reading 00037's text (an applied migration that later
 * ones replaced: people_list, metrics_summary and report_series have each been made again since):
 *   F44 the grants are the catalog's, asked in database/privileges.db.test.mjs ("the session role updates a thread, a
 *       message and an escalation in the columns the dashboard's verbs set"); that the verbs set only those columns
 *       is this file's rule, below;
 *   F48 one person's row alone is people_list run with p_contact_id in broadcasts/campaign-channels.db.test.mjs, and
 *       the logged-out key executes no function at all (database/privileges.db.test.mjs, "anon executes no function");
 *   F51 the list of workspaces seats nobody and writes nothing: reads-never-write/a-read-never-writes.test.mjs (R1c),
 *       the accept its own POST (reads-never-write/an-invitation-is-accepted-by-one-post.test.mjs);
 *   F15 run below, through the call's own DTO.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toLiveCallVM, toCallVM } from "@chanlytics/contracts";
import { readCode, stripComments } from "../_source.mjs";
import { repoFiles, parse, importsOf, packageOf } from "../_ast.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const here = path.dirname(fileURLToPath(import.meta.url));
const { stripWordTimings, toCallDto } = await import(
  pathToFileURL(path.join(here, "../../apps/dashboard/src/server/conversations/dto.ts")).href
);

test("F44: every session-client UPDATE in the dashboard sets only the columns the session role is granted", () => {
  // A rule over the dashboard's code: every UPDATE its session client makes of the three tables names only columns the
  // catalog grants the session role, the lists database/privileges.db.test.mjs holds the catalog to.
  const granted = {
    conversations: ["state", "paused_until", "snooze_until", "assignee_user_id", "last_message_at"],
    messages: ["status", "error"],
    escalations: ["state", "resolved_by_user_id", "decision_id"],
  };
  const files = [
    "apps/dashboard/src/server/conversations/ports.ts",
    "apps/dashboard/src/server/campaigns/ports.ts",
    "apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts",
    "apps/dashboard/src/server/shared/verbs.ts",
  ];
  for (const rel of files) {
    const src = readCode(rel);
    const re = /\.from\("(conversations|messages|escalations)"\)\s*\.update\(\{([\s\S]*?)\}\)/g;
    let m;
    while ((m = re.exec(src))) {
      const cols = m[2]
        .split(",")
        .map((s) => s.split(":")[0].trim())
        .filter(Boolean);
      for (const c of cols) assert.ok(granted[m[1]].includes(c), `${rel}: ${m[1]}.${c} is not a granted column`);
    }
  }
});

test("F15: the list route ships each turn's start and end, not every word's timing, and the viewers read either", () => {
  const stripped = stripWordTimings([
    { role: "agent", content: "hi", words: [{ word: "hi", start: 0.4, end: 0.6 }] },
    {
      role: "user",
      content: "when?",
      words: [
        { word: "when", start: 27.2, end: 27.5 },
        { word: "?", start: 27.5, end: 27.6 },
      ],
    },
    { role: "injected", content: "owner text" },
  ]);
  // Where each line ends as well as where it starts: the thread plays a call from a line and lights the one being said.
  assert.deepEqual(stripped, [
    { role: "agent", content: "hi", start: 0.4, end: 0.6 },
    { role: "user", content: "when?", start: 27.2, end: 27.6 },
    { role: "injected", content: "owner text" },
  ]);
  assert.equal(stripWordTimings(null), null);
  assert.ok(!JSON.stringify(stripped).includes("words"));
  const dto = (transcript_object) => ({
    id: "k1",
    retell_call_id: "r1",
    direction: "inbound",
    call_type: null,
    status: "ended",
    from_e164: "+19175550137",
    from_raw: null,
    to_e164: null,
    started_at: "2026-09-05T03:00:00Z",
    ended_at: "2026-09-05T03:01:00Z",
    duration_ms: 60000,
    disconnection_reason: null,
    sentiment: null,
    call_successful: null,
    in_voicemail: null,
    summary: "ok",
    transcript_object,
    recording: null,
    conversation_id: "c1",
    contact_id: "p1",
    message_id: null,
    created_at: "2026-09-05T03:00:00Z",
    updated_at: "2026-09-05T03:01:00Z",
    contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175550137" },
  });
  const now = new Date("2026-09-05T03:05:00Z");
  assert.equal(toLiveCallVM(dto(stripped), ZONE, now).transcript[1].t, "0:27", "the Live page reads `start`");
  assert.equal(toCallVM(dto(stripped), ZONE, now).transcript[1].t, "0:27", "so does the Conversations viewer");
  assert.equal(
    toCallVM(dto([{ role: "user", content: "x", words: [{ start: 61 }] }]), ZONE, now).transcript[0].t,
    "1:01",
    "and the raw provider shape still works",
  );
  // What the list route ships is the call's DTO, built the one way: its turns stripped of the words' timings.
  const raw = dto([
    { role: "agent", content: "hi", words: [{ word: "hi", start: 0.4, end: 0.6 }] },
    { role: "user", content: "when?", words: [{ word: "when", start: 27.2, end: 27.5 }] },
  ]);
  assert.deepEqual(toCallDto({ ...raw, contacts: raw.contact }).transcript_object, [
    { role: "agent", content: "hi", start: 0.4, end: 0.6 },
    { role: "user", content: "when?", start: 27.2, end: 27.5 },
  ]);
});

test("every route pg_cron calls stands behind the one door", () => {
  // apps/edge/lib/shared/cron-auth.ts is proved by running it (cron-auth.test.mjs).
  // This holds each scheduled route to it, so a route written tomorrow cannot
  // carry a tenth copy of the comparison that drifts from the others.
  const dir = path.join(here, "../../apps/edge/api/cron");
  const routes = [
    ...fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `apps/edge/api/cron/${f}`),
    "apps/edge/api/jobs/tick.ts",
  ];
  assert.ok(routes.length >= 9, `found ${routes.length} scheduled routes`);
  for (const r of routes) {
    const src = readCode(r);
    // A sweep's route is sweepDoor (lib/ops/sweep-door.ts, which cron-auth.test.mjs runs: the sweep is reached only with
    // the key); the jobs tick, which is no sweep, asks for the key itself.
    assert.ok(
      src.includes("sweepDoor(") || src.includes("await authorizeCron(request, db, log)"),
      `${r} stands behind authorizeCron`,
    );
    assert.ok(
      !src.includes("timingSafeEqual") && !src.includes('rpc("get_cron_sweep_key")'),
      `${r} keeps no door of its own`,
    );
  }
});

test("every bridge request goes through the typed client", () => {
  // Eleven couriers each owned a fetch, the envelope, the 401 and the workspace;
  // src/client/api.ts owns them once. A new fetch in the bridge is a courier
  // re-implementing them, and this says so. The two requests api() owns none of
  // (the version check on boot, and the public sign-up door the first-workspace
  // screen posts the waitlist to) go through the page's own-route client,
  // client/own-route.ts askOwnRoute, since 25 and 26 Nov 2026.
  const dir = path.join(here, "../../apps/dashboard/src/bridge");
  const offenders = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !(d === dir && e.name === "api.ts")) {
        const src = stripComments(fs.readFileSync(p, "utf8"));
        if (/\bfetch\(/.test(src)) offenders.push(path.relative(dir, p).split(path.sep).join("/"));
      }
    }
  })(dir);
  assert.deepEqual(offenders, [], "a request outside api() re-implements the envelope, the sign-out and the refresh");
});

/**
 * The files of packages/core that are adapters by design, each with the reason and the only modules it may import
 * beyond what a verb may (a file on this list is not free to import anything else). Every other module of core is a
 * verb or a rule: it takes the world through its ports.
 */
const CORE_WALL_EXCEPTIONS = {
  // The one send door (CLAUDE.md): it writes the outbound ledger and puts a message on the wire, so it holds db's
  // writers and channels' senders. Ends when the send door takes a ledger port and a wire port.
  "deliver/deliver.ts": {
    reason: "the one send door, over db's writers and channels' senders",
    may: ["@chanlytics/db", "@chanlytics/channels", "@supabase/supabase-js"],
  },
  // deliver's wire half, split out of deliver.ts for its length (#1327): channels' senders. The edge and the jobs
  // call them too, for a wire that is not a customer's message.
  "deliver/wire-senders.ts": { reason: "deliver's wire half, over channels' senders", may: ["@chanlytics/channels"] },
  // The lead runner starts Apify's runs through a port typed as Apify's own client, and asks it for the run-end
  // webhook Apify's names. Ends when Apify's actors move behind the lead port (the scorecard's domain step).
  "leads/runner/check.ts": {
    reason: "Apify's run-end webhook names, until Apify moves behind the lead port",
    may: ["@chanlytics/channels"],
  },
  "leads/runner/start.ts": {
    reason: "Apify's run-end webhook names, until Apify moves behind the lead port",
    may: ["@chanlytics/channels"],
  },
  // The people card's round (00430) starts its one run as the places round does, with the same webhook names.
  "leads/runner/people.ts": {
    reason: "Apify's run-end webhook names, until Apify moves behind the lead port",
    may: ["@chanlytics/channels"],
  },
};

/**
 * Whether core may import this: its own modules, contracts, the platform's own logger (a line in the request's log, not a provider), and the types (never a value) of db and channels.
 */
const coreMayImport = ({ specifier, typeOnly }) =>
  specifier.startsWith(".") ||
  specifier === "@chanlytics/contracts" ||
  specifier === "@chanlytics/log" ||
  // The normalised inbound message is the channels package's shape and the inbound verb speaks it, so the TYPE
  // crosses. A VALUE from channels would be a provider inside a verb, which is a port, not a widening.
  (typeOnly && (packageOf(specifier) === "@chanlytics/db" || packageOf(specifier) === "@chanlytics/channels"));

test("a core verb knows no database, framework, provider or environment", () => {
  // A verb takes the world through its ports; the adapter in apps/dashboard/src/server/conversations/ports.ts is where
  // the tables are. The wall is all of packages/core/src, but the files named above.
  const offenders = [];
  const walled = [];
  const excepted = [];
  for (const file of repoFiles(["packages/core/src"])) {
    const rel = file.slice("packages/core/src/".length);
    const bad = importsOf(parse(file)).filter((i) => !coreMayImport(i));
    const exception = CORE_WALL_EXCEPTIONS[rel];
    if (exception) {
      excepted.push(rel);
      if (bad.length === 0) offenders.push(`${rel}: keeps the wall now; take it off CORE_WALL_EXCEPTIONS`);
      for (const i of bad.filter((b) => !exception.may.includes(packageOf(b.specifier) ?? b.specifier)))
        offenders.push(
          `${rel}: ${i.typeOnly ? "type" : "value"} from ${i.specifier}, which its exception (${exception.reason}) does not cover`,
        );
      continue;
    }
    walled.push(rel);
    for (const i of bad) offenders.push(`${rel}: ${i.typeOnly ? "type" : "value"} from ${i.specifier}`);
  }
  assert.deepEqual(excepted.sort(), Object.keys(CORE_WALL_EXCEPTIONS).sort(), "every exception is a file that exists");
  assert.ok(walled.length > 60, "the wall walks every module of core, not a few folders");
  assert.deepEqual(offenders, [], "a verb takes the world through its ports; core-ports.ts is where the tables are");
});
