/**
 * The daily cap counts the receptionist's answers. An acknowledgement of a
 * photo ("a person will look") is recorded on the thread now that the door
 * records every send, and it must not spend the cap that exists to stop
 * loops: three photos in a morning would otherwise silence the receptionist
 * for the day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { readThreadState } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);

const T = "t1", C = "c1";
const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const row = (over) => ({ tenant_id: T, conversation_id: C, direction: "outbound", sender: "ai", status: "sent", type: "text", body: "…", channel: "whatsapp", channel_ts: null, meta: {}, ...over });

test("answers count, acknowledgements and backfills do not", async () => {
  const db = fakeDb({ messages: [
    row({ id: "a1", created_at: at(10), body: "We open at 9" }),
    row({ id: "a2", created_at: at(20), body: "See you then" }),
    row({ id: "k1", created_at: at(30), body: "Got your photo, a person will look", meta: { ack: true } }),
    row({ id: "b1", created_at: at(40), body: "imported", meta: { backfill: true } }),
    row({ id: "h1", created_at: at(50), sender: "human", body: "a person's words" }),
    row({ id: "f1", created_at: at(60), status: "failed", body: "never left" }),
  ] });
  const state = await readThreadState(db, T, C, null);
  assert.equal(state.replies.length, 2, "two answers spent the cap; the ack, the backfill, the person and the failure did not");
});
