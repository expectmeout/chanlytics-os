/**
 * A read cut at the row cap says so (decision 0111). PostgREST answers every read with at most `api.max_rows` rows,
 * 1,000, and says nothing when it stops there: a list of a workspace's people, sends or leads that reached it looked
 * whole. The database client's transport (packages/db shared/observe.ts namedFetch, which every server client takes)
 * logs `db_answer_at_cap` when a read that asked for no page came back holding exactly the cap, before the caller reads
 * the answer (its own `.then` is the first on the call).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { namedFetch, observeDb } from "@chanlytics/db/shared";

const lines = [];
observeDb({
  log: {
    info: () => {},
    warn: (event, fields) => lines.push({ event, ...fields }),
    error: () => {},
  },
  requestId: () => "req-1",
});

/** A transport answering every call with `contentRange`, as PostgREST would. */
const answering = (contentRange) => async () =>
  new Response("[]", { status: 200, headers: contentRange ? { "content-range": contentRange } : {} });
const BASE = "https://db.example.com/rest/v1";

test("a read that asked for no page and came back holding the cap is said, with its table", async () => {
  lines.length = 0;
  await namedFetch(answering("0-999/*"))(`${BASE}/contacts?select=id&tenant_id=eq.t1`);
  assert.deepEqual(lines, [{ event: "db_answer_at_cap", table: "contacts", rows: 1000, request_id: "req-1" }]);
});

test("a read under the cap, one that pages, a write and a function's call say nothing", async () => {
  lines.length = 0;
  const fetch = namedFetch(answering("0-999/*"));
  await namedFetch(answering("0-41/*"))(`${BASE}/contacts?select=id`);
  await fetch(`${BASE}/contacts?select=id&limit=1000`);
  await fetch(`${BASE}/contacts?select=id&offset=1000`);
  await fetch(`${BASE}/contacts?select=id`, { headers: { range: "0-999" } });
  await fetch(`${BASE}/contacts`, { method: "POST", body: "{}" });
  await fetch(`${BASE}/rpc/people_page`, { method: "POST", body: "{}" });
  await namedFetch(answering(null))(`${BASE}/contacts?select=id`);
  assert.deepEqual(lines, []);
});

test("outside a request it is said too, with no request to name", async () => {
  lines.length = 0;
  observeDb({
    log: { info: () => {}, warn: (event, fields) => lines.push({ event, ...fields }), error: () => {} },
    requestId: () => null,
  });
  await namedFetch(answering("0-999/4210"))(`${BASE}/sequence_sends?select=id`);
  assert.deepEqual(lines, [{ event: "db_answer_at_cap", table: "sequence_sends", rows: 1000, request_id: null }]);
});
