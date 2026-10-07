/**
 * A write that answers when the server accepts, with the surfaces re-read behind it.
 *
 * By default a write's promise waits for the re-read the refresh map names, which is right for a form that must
 * show what it saved. An act in a list the owner is working down -- Keep, Exclude, the next one -- has already shown
 * its result on the row; waiting for two more reads before the next press is a second of nothing per lead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const { createApi } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/client/api.ts")).href);
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "1ead0000-0000-4000-8000-000000000001";
const SEARCH = "5e000000-0000-4000-8000-000000000001";
const envelope = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });

function tab({ answer = () => envelope({ op_id: "op-1", version: 2 }), refresh } = {}) {
  const events = [];
  let land;
  const landed = new Promise((r) => {
    land = r;
  });
  const client = createApi({
    fetch: async () => answer(),
    workspace: () => A,
    onSignedOut: () => {},
    onChooseWorkspace: () => {},
    refresh:
      refresh ??
      (async (key) => {
        events.push(`re-read started:${key}`);
        await landed;
        events.push("re-read landed");
      }),
    now: () => 1_000,
  });
  return { client, events, land };
}
const keep = (client, opts) =>
  client("POST leads/[id]/keep", { params: { id: LEAD }, body: { search_id: SEARCH }, ...opts });

test("by default a write answers only once the surfaces it changed have been re-read", async () => {
  const t = tab();
  let answered = false;
  const p = keep(t.client).then((r) => {
    answered = true;
    return r;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([answered, t.events], [false, ["re-read started:POST leads/[id]/keep"]]);
  t.land();
  assert.equal((await p).ok, true);
});

test('refresh: "behind" answers when the server accepts, and the re-read still happens', async () => {
  const t = tab();
  const r = await keep(t.client, { refresh: "behind" });
  assert.equal(r.ok, true, "answered without the re-read having landed");
  assert.deepEqual(t.events, ["re-read started:POST leads/[id]/keep"], "and the re-read is on its way, not skipped");
  t.land();
  await new Promise((res) => setTimeout(res, 0));
  assert.deepEqual(t.events.at(-1), "re-read landed");
});

test("a re-read behind a write that fails does not reject anything: the surface's own failure state says so", async () => {
  const unhandled = [];
  const on = (e) => unhandled.push(e);
  process.on("unhandledRejection", on);
  try {
    const t = tab({
      refresh: async () => {
        throw new Error("the read failed");
      },
    });
    assert.equal((await keep(t.client, { refresh: "behind" })).ok, true);
    await new Promise((res) => setTimeout(res, 20));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", on);
  }
});

test("a write the server refuses re-reads nothing, behind or not", async () => {
  const t = tab({
    answer: () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: "conflict", message: "That lead changed since you opened it." } }),
        { status: 409 },
      ),
  });
  const r = await keep(t.client, { refresh: "behind" });
  assert.deepEqual([r.ok, t.events], [false, []]);
});
