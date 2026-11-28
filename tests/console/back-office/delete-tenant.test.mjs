/**
 * Deleting a workspace, to this repo's bar for production-mutating work.
 *
 * The bar is dry-run by default, idempotent, a JSONL backup, and an explicit
 * --apply. An earlier draft of this task named that bar and then prescribed
 * hand-typed SQL guarded by a human reading a name off the screen, which meets
 * none of it — reproducing a failure mode while quoting the rule against it.
 *
 * The table list is the part that rots. A table added with a tenant_id and not
 * added here means a backup with a hole in it, which reads as complete.
 *
 * The files are the part no cascade reaches. A workspace's media folder, its
 * call recordings and its messages' media, is walked to the bottom over a bucket
 * that answers as storage does, and removed a batch at a time.
 *
 * Its folder beside this file holds the rest: every read whole (delete-tenant/every-read-is-whole), the work stopped
 * before the delete (stop-then-delete), the list of what is removed outside the database (clean-up-list), and a long
 * history deleted in slices (long-history).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../_source.mjs";
import { NAME, OTHER, STOPPED, STRANDED, T, deleteTenant, harbor } from "./_delete-tenant-world.mjs";
import { bucket } from "./_supabase-stand-in.mjs";

const run = await import(pathToFileURL(path.join(ROOT, "tooling/scripts/ops/delete-tenant.mjs")).href);
const { keyOf } = await import(pathToFileURL(path.join(ROOT, "tooling/scripts/ops/delete-tenant/tables.mjs")).href);
const WHO = ["--tenant", T, "--expect-name", NAME];

/** Every table carrying a tenant_id, read out of the migrations. */
function tablesWithTenantId() {
  const found = new Set();
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".sql")) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      if (/\btenant_id\b/.test(m[2])) found.add(m[1]);
    }
    // A table renamed keeps its rows under its new name (0060: playbooks became sequence_steps), and one dropped has none.
    for (const m of sql.matchAll(/alter table (?:if exists )?public\.(\w+) rename to (\w+);/g))
      if (found.delete(m[1])) found.add(m[2]);
    for (const m of sql.matchAll(/drop table (?:if exists )?public\.(\w+)[\s;]/g)) found.delete(m[1]);
  }
  return found;
}

test("the script backs up every table that carries a tenant_id", () => {
  // A row in every one of them, run as a dry run: each comes back in the backup, and a table the script names that has
  // no tenant_id, or is gone, is a read the database refuses, which the script refuses on (below).
  const inSchema = [...tablesWithTenantId()].sort();
  // Each with the key its pages are read by, and a date, which the history's months are read by.
  const rowOf = (t) => ({ ...Object.fromEntries(keyOf(t).map((column) => [column, "k-1"])), tenant_id: T });
  const tables = Object.fromEntries(inSchema.map((t) => [t, [rowOf(t)]]));
  tables.events[0].created_at = "2026-03-04T10:00:00Z";
  tables.tenants = harbor().tenants;
  const dry = deleteTenant({ tables }, ...WHO);
  assert.equal(dry.code, 0, dry.said);
  const backedUp = [...new Set(dry.backup.map((line) => line.table))].sort();
  assert.deepEqual(
    inSchema.filter((t) => !backedUp.includes(t)),
    [],
    "a table with a tenant_id that the backup would miss",
  );
  assert.deepEqual(
    backedUp.filter((t) => !inSchema.includes(t)),
    [],
    "a table the script names that no longer carries a tenant_id",
  );
});

test("it meets the bar it cites: dry run, backup, idempotent, --apply", () => {
  const dry = deleteTenant({ tables: harbor() }, ...WHO);
  assert.equal(dry.code, 0, "apply is opt-in: without it, a dry run that finishes");
  assert.deepEqual(
    dry.backup.map((line) => [line.table, line.row.tenant_id]),
    [
      ["contacts", T],
      ["events", T],
    ],
    "the backup is written on the dry run too, so --apply cannot outrun it, and holds this workspace's rows alone",
  );
  assert.deepEqual(dry.log, [], "and nothing is deleted");
  assert.match(dry.out, /Dry run only\. Re-run with --apply/, "and says so plainly");
  const applied = deleteTenant({ tables: harbor() }, ...WHO, "--apply");
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(
    applied.tables.tenants.map((t) => t.id),
    [OTHER],
  );
  assert.match(applied.out, /deleted "Harbor Nails" \(.*\); gone\./);
  // A second run against an already-deleted workspace is a no-op, not an error.
  const again = deleteTenant({ tables: { ...harbor(), tenants: applied.tables.tenants } }, ...WHO, "--apply");
  assert.equal(again.code, 0);
  assert.match(again.out, new RegExp(`No tenant ${T}\\. Nothing to do\\.`));
  assert.equal(again.backup, null, "and writes nothing");
});

test("it refuses rather than guesses", () => {
  const named = deleteTenant({ tables: harbor() }, "--tenant", T, "--expect-name", "Harbor", "--apply");
  assert.equal(named.code, 1, "the name has to be given and has to match");
  assert.match(named.err, /REFUSING: --expect-name is "Harbor" but the tenant is named "Harbor Nails"/);
  assert.deepEqual([named.backup, named.log], [null, []]);
  const usage = deleteTenant({ tables: harbor() }, "--tenant", T);
  assert.equal(usage.code, 2, "and a name not given is a usage error");
  const unread = deleteTenant(
    { tables: harbor(), faults: { "contacts.select": { message: "permission denied for table contacts" } } },
    ...WHO,
    "--apply",
  );
  assert.equal(unread.code, 1, "a table it cannot read is a backup with a hole in it");
  assert.match(unread.err, /REFUSING: could not read contacts: permission denied/);
  assert.deepEqual(unread.log, [], "and nothing is deleted");
  const uncounted = deleteTenant({ tables: harbor(), tenantDeleteAnswersNone: true }, ...WHO, "--apply");
  assert.equal(uncounted.code, 1, "and it counts what it deleted rather than assuming");
  assert.match(uncounted.err, /REFUSING TO REPORT SUCCESS: expected 1 tenant row deleted, got 0/);
});

test("the two tables that do not cascade are handled, not discovered afterwards", () => {
  // events carries a tenant_id with NO foreign key, because it is partitioned
  // and a partitioned table cannot reference one. Without this the whole
  // history is left pointing at a tenant that no longer exists.
  // That the history outlives its workspace, pointing at nobody, is run on the stack (console/console.db.test.mjs: "a
  // request is kept by name once its workspace is gone").
  const applied = deleteTenant({ tables: harbor() }, ...WHO, "--apply");
  assert.deepEqual(
    applied.tables.events.map((e) => e.tenant_id),
    [OTHER],
    "so the script deletes this workspace's events explicitly, and no one else's",
  );
  assert.deepEqual(
    applied.log,
    [...STOPPED, "events delete", "tenants delete"],
    "and does so BEFORE the tenant, while the rows can still be found",
  );

  // billing_events is ON DELETE SET NULL on purpose: Stripe's dedup ledger has
  // to outlive the workspace or a redelivered event is processed twice.
  // That ledger outliving its workspace, its key set null, is run on the stack beside the history (console.db).
  // A partner's earnings (0012) are money owed or paid, and outlive the workspace as the ledger does; so do what the
  // Console's staff did there and the request that asked for the delete (00467, decision 0066). The tally says which
  // rows survive, rather than a comment nobody reads; that they outlive their workspace, its key set null, is run on the
  // stack (console/console.db.test.mjs).
  const kept = deleteTenant(
    {
      tables: harbor({
        billing_events: [{ id: "evt_1", tenant_id: T, type: "invoice.paid" }],
        partner_earnings: [{ id: "pe-1", tenant_id: T, partner_id: "p-1" }],
        platform_acts: [{ id: "pa-1", tenant_id: T }],
        privacy_requests: [{ id: "pr-1", tenant_id: T }],
      }),
    },
    ...WHO,
  );
  for (const table of ["billing_events", "partner_earnings", "platform_acts", "privacy_requests"])
    assert.match(kept.out, new RegExp(`${table}\\s+1\\s+kept, tenant_id set to null`), table);
  assert.doesNotMatch(kept.out, /contacts\s+1\s+kept/, "and only those");
});

test("it refuses to strand what the cascade cannot reach", () => {
  // The cascade is thorough inside Postgres and blind outside it. The very
  // workspace this tool was written to delete turned out to own the product's
  // first real phone line, answering, with two inbound texts on it, a Stripe
  // trial and a live Retell agent. A dry run caught that; the hand-typed
  // DELETE the plan originally proposed would have taken all of it.
  const dry = deleteTenant({ tables: harbor(STRANDED) }, ...WHO);
  assert.match(dry.out, /WOULD BE STRANDED OUTSIDE THE DATABASE \(6\):/, "named, not merely counted");
  for (const [what, said] of [
    [
      "the phone line and its Twilio estate",
      /the phone line \+13055550123 — Twilio subaccount AC-test, number PN-test/,
    ],
    ["a live line says so loudly", /IT IS ANSWERING CALLS RIGHT NOW/],
    ["the Vault secrets have no foreign key and are named too", /line-creds Vault secret/],
    ["a Stripe customer or subscription", /a Stripe trial — customer cus_test, subscription sub_test/],
    ["a Google grant", /a Google Business Profile grant for owner@example\.com/],
    [
      "a footage account's grant, its push channels and its secret (00639)",
      /a connected footage account, owner@example\.com/,
    ],
    ["an active provider binding", /an active channel binding waba-1/],
    ["a Retell agent made before any number (00476)", /a Retell agent agent_test and its LLM llm_test/],
  ])
    assert.match(dry.out, said, what);
});

test("the refusal comes before anything is deleted", () => {
  // The order is the whole guarantee. A check after the first delete is not a
  // guard, it is a post-mortem.
  const refused = deleteTenant({ tables: harbor(STRANDED) }, ...WHO, "--apply");
  assert.equal(refused.code, 1, "an apply that would strand something refuses");
  assert.match(refused.err, /REFUSING: this workspace still holds 6 things the delete cannot reach/);
  assert.deepEqual(refused.log, [], "before the events delete, and before the tenant delete");
  assert.ok(refused.tables.tenants.some((t) => t.id === T));
  const stranded = deleteTenant({ tables: harbor(STRANDED) }, ...WHO, "--apply", "--orphans-ok");
  assert.equal(stranded.code, 0, "and only --orphans-ok gets past it");
  assert.match(stranded.out, /--orphans-ok: stranding 6 provider-side things on purpose/);
  assert.deepEqual(stranded.log, [...STOPPED, "events delete", "tenants delete"]);
});

test("a dry run reports the orphans and still finishes", () => {
  // Refusing the dry run too would hide the tally, which is the thing that
  // tells you what you are about to lose.
  const dry = deleteTenant({ tables: harbor(STRANDED) }, ...WHO);
  assert.equal(dry.code, 0, "the dry run exits 0 rather than refusing");
  assert.ok(
    dry.out.indexOf("WOULD BE STRANDED OUTSIDE THE DATABASE") < dry.out.indexOf("Dry run only. Re-run with --apply"),
    "the list is printed before the dry run exits",
  );
  assert.doesNotMatch(dry.said, /REFUSING/);
});

test("a workspace's media is read to the bottom: recordings, each thread's folder, and past a page", async () => {
  const objects = {
    [`${T}/thread-a/message-1.jpg`]: 2_000,
    [`${T}/thread-a/message-2.ogg`]: 3_000,
    [`${T}/thread-b/nested/message-3.pdf`]: 4_000,
    // Another workspace whose id this one's is a prefix of, and one beside it: neither is this workspace's.
    [`${T}0/calls/theirs.wav`]: 9_999,
    [`other/calls/theirs.wav`]: 9_999,
  };
  for (let i = 0; i < 150; i++) objects[`${T}/calls/call-${String(i).padStart(3, "0")}.wav`] = 1_000;
  const b = bucket(objects);

  const { files, error } = await run.filesUnder(b, T);

  assert.equal(error, null);
  assert.deepEqual(
    files.map((f) => f.path).sort(),
    Object.keys(objects)
      .filter((p) => p.startsWith(`${T}/`))
      .sort(),
    "every file under the folder, and nothing beside it",
  );
  assert.equal(
    files.reduce((n, f) => n + f.bytes, 0),
    150 * 1_000 + 2_000 + 3_000 + 4_000,
    "with its size, for the count the dry run says",
  );
  assert.ok(b.asked.list.filter((a) => a.dir === `${T}/calls`).length > 1, "a folder past a page is read page by page");
});

test("a workspace that never stored a file has no media, and that is not an error", async () => {
  assert.deepEqual(await run.filesUnder(bucket({ [`other/calls/x.wav`]: 1 }), T), { files: [], error: null });
});

test("a folder it cannot list is said, never read as empty", async () => {
  const b = bucket({ [`${T}/calls/a.wav`]: 1, [`${T}/thread-a/m.jpg`]: 1 }, { list: { [`${T}/calls`]: "timed out" } });
  const { error } = await run.filesUnder(b, T);
  assert.match(error, /timed out/);
  assert.match(error, /calls/, "naming the folder it could not read");
  // An unread folder would be a delete that strands what it could not see, which is the gap this closes: the script
  // refuses on it, before anything is deleted.
  const unlisted = deleteTenant(
    {
      tables: harbor(),
      buckets: { media: { [`${T}/calls/a.wav`]: 1, [`${T}/thread-a/m.jpg`]: 1 } },
      bucketFaults: { media: { [`${T}/calls`]: "timed out" } },
    },
    ...WHO,
    "--apply",
  );
  assert.equal(unlisted.code, 1);
  assert.match(unlisted.err, new RegExp(`REFUSING: could not list media/${T}: ${T}/calls: timed out`));
  assert.deepEqual(unlisted.log, []);
});

test("the files go a batch at a time, and a batch storage refuses does not stop the rest", async () => {
  const objects = {};
  for (let i = 0; i < 230; i++) objects[`${T}/calls/c${String(i).padStart(3, "0")}.wav`] = 1;
  const b = bucket(objects, { remove: (paths) => paths.includes(`${T}/calls/c150.wav`) });
  const gone = `${T}/calls/already-gone.wav`;
  const paths = [...Object.keys(objects), gone];

  const out = await run.removeAll(b, paths);

  assert.deepEqual(
    b.asked.remove.map((batch) => batch.length),
    [100, 100, 31],
  );
  assert.equal(out.removed.length, 130, "the batches storage took");
  assert.deepEqual(out.failed, b.asked.remove[1], "the batch it refused, by path");
  assert.equal(out.error, "storage said no");
  assert.ok(!out.failed.includes(gone) && !out.removed.includes(gone), "a path already gone is neither");
  assert.equal(b.store.size, 100, "what is left is the refused batch");
});

test("the media is counted in the dry run and removed only after the rows are gone", () => {
  const media = { [`${T}/calls/a.wav`]: 1_000_000, [`${T}/thread-a/m.jpg`]: 500_000, [`${OTHER}/calls/b.wav`]: 1 };
  const dry = deleteTenant({ tables: harbor(), buckets: { media } }, ...WHO);
  assert.match(
    dry.out,
    /media files\s+2\s+1\.5 MB, removed from media after the rows/,
    "the workspace's own folder, said",
  );
  assert.equal(dry.buckets.media.length, 3, "and a dry run removes nothing");
  const applied = deleteTenant({ tables: harbor(), buckets: { media } }, ...WHO, "--apply");
  assert.deepEqual(
    applied.log,
    [...STOPPED, "events delete", "tenants delete", "storage media remove 2"],
    "after the tenant delete",
  );
  assert.deepEqual(applied.buckets.media, [`${OTHER}/calls/b.wav`], "this workspace's alone");
  const uncounted = deleteTenant(
    { tables: harbor(), buckets: { media }, tenantDeleteAnswersNone: true },
    ...WHO,
    "--apply",
  );
  assert.equal(uncounted.code, 1);
  assert.equal(uncounted.buckets.media.length, 3, "and after it is counted as done");
});

/* ------------------------------------------------------------------------------------------------- the shelf -- */

// A workspace's videos on Chanlytics' own shelf (the archive plan's B2): a private bucket behind the relay, which no
// cascade reaches. The relay's own handler answers here, over a bucket in memory.
const { shelfRelay } = await import(pathToFileURL(path.join(ROOT, "tests/files/shelf/_shelf.mjs")).href);
const relayTicket = await import(pathToFileURL(path.join(ROOT, "apps/relay/src/ticket.ts")).href);
const SHELF_KEY = "ticket-key-for-this-file";
const SHELF_URL = "https://relay.example";
const SHELF_FILES = ["0b0e6c1e-6f0a-4b6e-9d3e-2a1f5c7d9e11", "3c2d1e0f-9a8b-4c7d-8e6f-5a4b3c2d1e0f"];

test("a workspace's shelved videos are read off its pieces' keys, and a piece in the owner's Drive is not one", () => {
  const parts = [
    { shelf_key: `${T}/${SHELF_FILES[0]}/video`, drive_file_id: null },
    { shelf_key: null, drive_file_id: "drive-file-1" },
    { shelf_key: `${T}/${SHELF_FILES[1]}/video`, drive_file_id: null },
    { shelf_key: "not a key", drive_file_id: null },
  ];
  assert.deepEqual(run.shelvedOf(parts), [
    { tenant: T, file: SHELF_FILES[0] },
    { tenant: T, file: SHELF_FILES[1] },
  ]);
  assert.deepEqual(run.shelvedOf(undefined), [], "a database older than the shelf has none");
});

test("the ticket this script signs is one the relay reads: to delete that workspace's one file, for minutes", async () => {
  const now = Date.parse("2026-11-23T03:00:00Z");
  const ticket = run.shelfDeleteTicket(SHELF_KEY, { tenant: T, file: SHELF_FILES[0] }, now);
  assert.deepEqual(await relayTicket.readShelfTicket(SHELF_KEY, ticket, now), {
    ok: true,
    tenant: T,
    file: SHELF_FILES[0],
    use: "delete",
    expiresAt: now / 1000 + 300,
  });
  assert.equal((await relayTicket.readShelfTicket("another-key", ticket, now)).ok, false);
});

test("each shelved video is taken off the shelf through the relay, and one that stays is counted", async () => {
  const relay = shelfRelay({ relayUrl: SHELF_URL, ticketKey: SHELF_KEY, from: "", source: () => new Response(null) });
  for (const file of SHELF_FILES)
    relay.shelf.held.set(`${T}/${file}/video`, { bytes: Buffer.from("x"), sha256: "a".repeat(64) });
  // Another workspace's video, under its own key: not this delete's to touch.
  relay.shelf.held.set(`another-workspace/${SHELF_FILES[0]}/video`, {
    bytes: Buffer.from("y"),
    sha256: "b".repeat(64),
  });
  const videos = SHELF_FILES.map((file) => ({ tenant: T, file }));
  const stayed = await run.removeShelved({ url: `${SHELF_URL}/`, ticketKey: SHELF_KEY }, videos, relay.answer);
  assert.equal(stayed, 0);
  assert.deepEqual([...relay.shelf.held.keys()], [`another-workspace/${SHELF_FILES[0]}/video`]);
  assert.ok(
    relay.asked.every((ask) => ask.method === "DELETE" && !ask.url.includes("ticket")),
    "the ticket rides the header",
  );
  // Asked again, they are gone already: none stays. A relay that gives no answer leaves every one, and says how many.
  assert.equal(await run.removeShelved({ url: SHELF_URL, ticketKey: SHELF_KEY }, videos, relay.answer), 0);
  relay.state.down = true;
  assert.equal(await run.removeShelved({ url: SHELF_URL, ticketKey: SHELF_KEY }, videos, relay.answer), 2);
  // The wrong key removes nothing, and says so.
  relay.state.down = false;
  relay.shelf.held.set(`${T}/${SHELF_FILES[0]}/video`, { bytes: Buffer.from("x"), sha256: "a".repeat(64) });
  assert.equal(await run.removeShelved({ url: SHELF_URL, ticketKey: "another-key" }, videos, relay.answer), 2);
  assert.ok(relay.shelf.held.has(`${T}/${SHELF_FILES[0]}/video`));
});

test("the shelf is counted in the dry run, holds an apply that would strand it, and is emptied only after the rows are gone", () => {
  const world = (over = {}) => ({
    tables: harbor({
      file_archive_parts: [
        { id: "fp-1", tenant_id: T, shelf_key: `${T}/${SHELF_FILES[0]}/video`, drive_file_id: null },
      ],
    }),
    ...over,
  });
  const dry = deleteTenant(world(), ...WHO);
  assert.match(dry.out, /videos on the shelf\s+1\s+removed there after the rows/, "the workspace's own shelved videos");
  assert.ok(
    dry.out.indexOf("videos on the shelf") < dry.out.indexOf("Dry run only. Re-run with --apply"),
    "said before the dry run exits",
  );
  assert.match(
    dry.out,
    /1 videos on Chanlytics' own shelf\. Set FOOTAGE_RELAY_URL/,
    "counted among what would be stranded",
  );
  const held = deleteTenant(world(), ...WHO, "--apply");
  assert.equal(held.code, 1, "an apply without the relay would strand it");
  const relay = { FOOTAGE_RELAY_URL: SHELF_URL, FOOTAGE_TICKET_KEY: SHELF_KEY };
  const applied = deleteTenant(world({ env: relay }), ...WHO, "--apply");
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(
    applied.log,
    [...STOPPED, "events delete", "tenants delete", "fetch DELETE relay.example"],
    "after the tenant delete",
  );
  assert.match(applied.out, /removed 1 of 1 videos from the shelf/);
  const uncounted = deleteTenant(world({ env: relay, tenantDeleteAnswersNone: true }), ...WHO, "--apply");
  assert.ok(!uncounted.log.some((l) => l.startsWith("fetch")), "and after it is counted as done");
});
