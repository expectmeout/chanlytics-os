/**
 * Ask says of the sequences what their list says needs you (decision 0128, stage 2).
 *
 * The list files a sequence under Needs you when something waits on its owner, when a one-off failed, and when it should
 * be going and isn't (leads that could not be checked, a run that did nothing), and its header counts those sequences.
 * Ask's read of the list (its sequences tool, action list) says the same of each: its group, its line, and, for every one under
 * Needs you, the words of what needs them. The number on top is the page's: the sequences under Needs you. Before this
 * it summed the people and emails waiting, so a stuck sequence added nothing and two emails in one sequence counted two.
 * How many people or emails wait stays on each row (needs_count).
 *
 * Run through Ask's own tool over the database in memory, in New York on Wednesday 11 Nov 2026 at 3:00 PM.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { clearContextCache } = await import(at("apps/dashboard/src/server/ask/context.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

beforeEach(() => {
  readerCache.clear();
  clearContextCache();
});

const TID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TZ = "America/New_York";
const NOW = new Date("2026-11-11T20:00:00Z");
const id = (n) => `11111111-1111-4111-8111-00000000000${n}`;
const NONE = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
const first = (n, over = {}) => ({
  id: id(n),
  kind: "moment",
  trigger: "visit_tomorrow",
  state: "running",
  policy_class: "reminder",
  run_hour: 9,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  source_search_id: null,
  source_name: null,
  owner_sends: false,
  until: null,
  words_ok_at: null,
  template_name: "reminder",
  template_language: "en_US",
  ...over,
});
const row = (n, name, over = {}) => ({
  id: id(n),
  name,
  starts: "moment",
  state: "on",
  mode: "veto",
  created_at: `2026-11-0${n}T14:00:00Z`,
  first: first(n),
  date: null,
  steps: 2,
  unwritten: 0,
  channels: ["whatsapp"],
  needs: NONE,
  next: null,
  last: null,
  in_it: 0,
  ...over,
});
const cold = (n, name, over = {}) =>
  row(n, name, {
    starts: "leads",
    first: first(n, { kind: "reach_out", trigger: "lead_first" }),
    channels: ["email"],
    ...over,
  });

const ROWS = [
  cold(1, "Held", { in_it: 5, needs: { ...NONE, held: 2, oldest_at: "2026-10-30T13:00:00Z" } }),
  cold(2, "Stuck", { in_it: 3, stuck: { leads: 3, since: "2026-10-29T15:10:00Z", reason: "unchecked" } }),
  row(3, "Did not run", { last_run_off: "no_calendar", last_run_for: "2026-11-10" }),
  row(4, "Failed once", {
    starts: "date",
    mode: null,
    first: null,
    date: { batch_id: id(4), state: "failed", at: "2026-11-09T15:00:00Z", people: 186 },
  }),
  row(5, "Goes as it should"),
];

const listed = async () => {
  const supabase = fakeDb(
    { tenants: [{ id: TID, name: "Harbor Studio", timezone: TZ, config: {} }], policies: [] },
    {},
    { sequence_overview: () => ROWS },
    { missing: true },
  );
  const ctx = { supabase, userId: "u1", email: "ada@example.com", params: {} };
  const said = await runTool(newToolContext(ctx, TID, "owner", TZ, NOW), {
    name: "sequences",
    input: { action: "list" },
  });
  return JSON.parse(said.result);
};
const named = (said, name) => said.sequences.find((s) => s.name === name);

test("the number on top is the page's: the sequences under Needs you", async () => {
  const said = await listed();
  const under = said.sequences.filter((s) => s.group === "needs").map((s) => s.name);
  assert.deepEqual(under.sort(), ["Did not run", "Failed once", "Held", "Stuck"]);
  assert.equal(said.needs_you, 4);
});

test("each sequence under Needs you says what needs them, and one that goes says nothing", async () => {
  const said = await listed();
  assert.equal(named(said, "Held").needs_you, "2 emails held for your look · since Oct 30");
  assert.equal(named(said, "Stuck").needs_you, "3 leads couldn’t be checked · since Oct 29");
  assert.equal(named(said, "Did not run").needs_you, "Didn’t run · no calendar is connected");
  assert.equal(named(said, "Failed once").needs_you, "Didn’t go · 186 people · Mon");
  for (const name of ["Stuck", "Did not run", "Failed once"])
    assert.equal(named(said, name).needs_you, named(said, name).line, `${name}: the row's own line`);
  assert.equal("needs_you" in named(said, "Goes as it should"), false);
});

test("how many people or emails wait stays on its row, and only where an OK or an answer clears them", async () => {
  const said = await listed();
  assert.equal(named(said, "Held").needs_count, 2);
  for (const name of ["Stuck", "Did not run", "Failed once", "Goes as it should"])
    assert.equal("needs_count" in named(said, name), false, name);
});
