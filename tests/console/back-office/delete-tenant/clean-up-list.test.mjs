/**
 * Deleting a workspace: what it keeps outside the database is on a list before anything is deleted, and the list
 * outlives the run (tooling/scripts/ops/delete-tenant.mjs, delete-tenant/outside.mjs).
 *
 * The lists of what to remove elsewhere lived in the run's memory. A provider that was down for one call left a video
 * billed with a line on the screen to say so, and a second run found no workspace and stopped. Now the list is a file
 * beside the backup, each removal marks its line, the run ends non-zero while a line is not done, and `--resume` asks
 * again for only what stayed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME, T, deleteTenant, harbor, runsIn } from "../_delete-tenant-world.mjs";

const WHO = ["--tenant", T, "--expect-name", NAME];
const APPLY = [...WHO, "--apply", "--wait-minutes", "0.005"];
const SHELF_FILE = "0b0e6c1e-6f0a-4b6e-9d3e-2a1f5c7d9e11";
const KEYS = {
  ANTHROPIC_API_KEY: "sk-test-only",
  CLOUDFLARE_ACCOUNT_ID: "acct-test",
  CLOUDFLARE_STREAM_API_TOKEN: "token-test",
  FOOTAGE_RELAY_URL: "https://relay.example",
  FOOTAGE_TICKET_KEY: "ticket-key-for-this-file",
};

/** A workspace with one or more of everything it can keep outside the database. */
const world = (over = {}) => ({
  tables: harbor({
    files: [
      { id: "f-1", tenant_id: T, media_ref: "stream-1", claude_copy: { id: "file_1" } },
      { id: "f-2", tenant_id: T, media_ref: "stream-2", claude_copy: null },
      { id: "f-3", tenant_id: T, media_ref: "stream-3", claude_copy: null },
    ],
    file_archive_parts: [{ id: "p-1", tenant_id: T, shelf_key: `${T}/${SHELF_FILE}/video` }],
  }),
  buckets: {
    "workspace-logos": { [`${T}/logo.png`]: 10 },
    files: { [`${T}/f-1/original.jpg`]: 20, [`${T}/f-2/original.mp4`]: 30 },
    media: { [`${T}/calls/a.wav`]: 40, [`${T}/thread-a/m.jpg`]: 50 },
  },
  env: KEYS,
  ...over,
});
/** A run's tables and buckets, as the next run's world finds them. */
const after = (run, over = {}) => ({
  tables: run.tables,
  buckets: Object.fromEntries(
    Object.entries(run.buckets).map(([name, paths]) => [name, Object.fromEntries(paths.map((p) => [p, 1]))]),
  ),
  env: KEYS,
  ...over,
});
const lineOf = (item) =>
  item.what === "storage" ? `${item.bucket}/${item.path}` : `${item.what} ${item.id ?? item.file}`;
const undone = (list) =>
  list
    .slice(1)
    .filter((item) => !item.done)
    .map(lineOf);

test("the list is written before any delete: one line for each thing outside the database, none done", () => {
  // The workspace's own delete answers no row, so the run stops there: after the list, before any removal.
  const stopped = deleteTenant(world({ tenantDeleteAnswersNone: true }), ...APPLY);
  assert.equal(stopped.code, 1);
  const [head, ...items] = stopped.list;
  assert.deepEqual(
    { clean_up: head.clean_up, tenant: head.tenant, name: head.name },
    { clean_up: 1, tenant: T, name: NAME },
    "the list says whose it is",
  );
  assert.deepEqual(
    items.map(lineOf),
    [
      `workspace-logos/${T}/logo.png`,
      `files/${T}/f-1/original.jpg`,
      `files/${T}/f-2/original.mp4`,
      "anthropic file_1",
      "stream stream-1",
      "stream stream-2",
      "stream stream-3",
      `shelf ${SHELF_FILE}`,
      `media/${T}/calls/a.wav`,
      `media/${T}/thread-a/m.jpg`,
    ],
    "in the order they are removed",
  );
  assert.ok(
    items.every((item, i) => item.n === i + 1 && item.done === false),
    "each numbered, none done",
  );
  assert.deepEqual(stopped.fetched, [], "and nothing outside the database was asked for");
});

test("a whole run marks every line, ends at zero and says what it removed", () => {
  const applied = deleteTenant(world(), ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(undone(applied.list), []);
  assert.match(applied.out, /clean-up list: 10 things to remove outside the database -> .*\.clean-up\.jsonl/);
  for (const said of [
    /removed 1 of 1 logo files from workspace-logos/,
    /removed 2 of 2 files from files/,
    /deleted 1 of 1 copies at Anthropic/,
    /deleted 3 of 3 videos at Stream/,
    /removed 1 of 1 videos from the shelf/,
    /removed 2 of 2 media files from media/,
  ])
    assert.match(applied.out, said);
  assert.deepEqual(applied.buckets, { "workspace-logos": [], files: [], media: [] });
});

test("a removal that fails once leaves its line, ends the run non-zero, and --resume asks only for it", () => {
  const place = runsIn();
  try {
    // Stream refuses the first call it gets, then answers.
    const first = place.run(world({ fetchFails: { "api.cloudflare.com": 1 } }), ...APPLY);
    assert.equal(first.code, 1, "the run ends non-zero while anything stays");
    assert.deepEqual(undone(first.list), ["stream stream-1"], "the list says which");
    assert.match(first.err, /1 thing still there outside the database:\n\s+· a video at Cloudflare Stream, stream-1/);
    assert.match(first.err, /--resume .*\.clean-up\.jsonl --apply/, "and how to ask again");
    assert.match(first.out, /deleted 2 of 3 videos at Stream/);
    assert.ok(!first.tables.tenants.some((t) => t.id === T), "the rows are gone all the same");

    const look = place.run(after(first), "--resume", first.listFile);
    assert.equal(look.code, 1, "a look at the list ends non-zero too while a line is not done");
    assert.match(look.out, /1 thing still there outside the database:\n\s+· a video at Cloudflare Stream, stream-1/);
    assert.deepEqual(look.fetched, [], "and asks for nothing without --apply");

    const again = place.run(after(first), "--resume", first.listFile, "--apply");
    assert.equal(again.code, 0, again.said);
    assert.deepEqual(
      again.fetched.map((f) => `${f.method} ${f.host}${f.path}`),
      ["DELETE api.cloudflare.com/client/v4/accounts/acct-test/stream/stream-1"],
      "only what stayed is asked for again",
    );
    assert.deepEqual(undone(place.readList(first.listFile)), []);

    const done = place.run(after(first), "--resume", first.listFile, "--apply");
    assert.equal(done.code, 0);
    assert.match(done.out, /Nothing on this list is still there\./);
    assert.deepEqual(done.fetched, []);
  } finally {
    place.close();
  }
});

test("a bucket that refuses a batch keeps its lines for the next run", () => {
  const place = runsIn();
  try {
    const first = place.run(world({ removeFails: { media: 1 } }), ...APPLY);
    assert.equal(first.code, 1);
    assert.deepEqual(undone(first.list), [`media/${T}/calls/a.wav`, `media/${T}/thread-a/m.jpg`]);
    assert.match(first.err, /2 media files stayed from media: storage said no/);
    const again = place.run(after(first), "--resume", first.listFile, "--apply");
    assert.equal(again.code, 0, again.said);
    assert.deepEqual(again.log, ["storage media remove 2"], "the bucket's lines, and nothing that was already done");
    assert.deepEqual(again.buckets.media, []);
  } finally {
    place.close();
  }
});

test("what a run has no key for stays on the list, to be asked for with the key", () => {
  const place = runsIn();
  try {
    const noStream = { ...KEYS, CLOUDFLARE_ACCOUNT_ID: "", CLOUDFLARE_STREAM_API_TOKEN: "" };
    const held = place.run(world({ env: noStream }), ...APPLY);
    assert.equal(held.code, 1, "an apply that would strand its videos refuses, as before");
    assert.match(held.err, /REFUSING: this workspace still holds 1 thing the delete cannot reach/);
    const stranded = place.run(world({ env: noStream }), ...APPLY, "--orphans-ok");
    assert.equal(stranded.code, 1, "stranded on purpose is still not done");
    assert.deepEqual(undone(stranded.list), ["stream stream-1", "stream stream-2", "stream stream-3"]);
    assert.match(stranded.err, /3 videos stayed at Stream: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN/);
    const again = place.run(after(stranded), "--resume", stranded.listFile, "--apply");
    assert.equal(again.code, 0, again.said);
    assert.equal(again.fetched.length, 3);
  } finally {
    place.close();
  }
});

test("--resume removes nothing while the workspace's row is still there, and refuses a file that is no list", () => {
  const place = runsIn();
  try {
    const stopped = place.run(world({ tenantDeleteAnswersNone: true }), ...APPLY);
    assert.equal(stopped.code, 1);
    const early = place.run(after(stopped), "--resume", stopped.listFile, "--apply");
    assert.equal(early.code, 1);
    assert.match(early.err, /REFUSING: the workspace "Harbor Nails" is still there/);
    assert.deepEqual([early.fetched, early.log], [[], []], "its files go only once its rows have");
    const wrong = place.run(
      after(stopped),
      "--resume",
      stopped.listFile.replace(".clean-up.jsonl", ".jsonl"),
      "--apply",
    );
    assert.equal(wrong.code, 2);
    assert.match(wrong.err, /is not a clean-up list/);
  } finally {
    place.close();
  }
});
