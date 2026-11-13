/**
 * A read past its cap is never taken for the whole (packages/db paged.ts, ReadNeeds). The pager used to log a line at
 * its cap and hand back what it had read, and a send, a count or a scrub took that for everyone. Now each caller says
 * what the cap means for it: a read an act depends on refuses there, and the act stops in words an owner can act on; a
 * read that only draws a list answers its part, marked. One real caller of each kind, over a database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { DEFAULT_ROW_CAP, ReadCutShort } from "@chanlytics/db/shared";
import { wasSequenceReached } from "@chanlytics/db/campaigns";
import { getEarlierVisitRows } from "@chanlytics/db/calendar";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { answerOfThrow, personWordsOf } = await importSrc("apps/dashboard/src/server/shared/with-route.ts");

const T = "00000000-0000-4000-8000-0000000000a1";
const SEQUENCE = "00000000-0000-4000-8000-0000000000b1";
const PERSON = "00000000-0000-4000-8000-0000000000c1";

/** `count` people a list's sequence has reached, each in it now. */
const reached = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `e-${String(i).padStart(6, "0")}`,
    tenant_id: T,
    sequence_id: SEQUENCE,
    lead_id: null,
    contact_id: `p-${i}`,
    state: "in",
    sent_at: null,
  }));

test("who a sequence reached, past the cap, refuses: its run sends nobody rather than again to whoever fell past it", async () => {
  await assert.rejects(
    () => wasSequenceReached(fakeDb({ sequence_enrollments: reached(DEFAULT_ROW_CAP + 1) }), T, SEQUENCE),
    (e) => e instanceof ReadCutShort && e.what === "who the sequence reached" && e.cap === DEFAULT_ROW_CAP,
  );
  const whole = await wasSequenceReached(fakeDb({ sequence_enrollments: reached(DEFAULT_ROW_CAP) }), T, SEQUENCE);
  assert.equal(whole.size, DEFAULT_ROW_CAP, "exactly the cap is everyone, and nobody is refused");
});

test("a refusal at the cap reaches an owner as what happened, that it stays, and the one thing to do", () => {
  const cut = new ReadCutShort("segment_members", DEFAULT_ROW_CAP);
  const answer = answerOfThrow(cut, { route: "/api/v1/broadcasts", started: Date.now() });
  assert.equal(answer.status, 409);
  assert.equal(answer.body.error.code, "conflict");
  const words = answer.body.error.message;
  assert.match(words, /more than 20,000/, "what is happening");
  assert.match(words, /nothing was done/, "and that none of it was done");
  assert.match(words, /won't clear by itself/, "whether it mends itself");
  assert.match(words, /Get help/, "the one thing to do");
  assert.doesNotMatch(words, /segment_members|rows|cap\b/, "never the read's own name or the platform's words");
  assert.equal(personWordsOf(cut), words, "Ask says it in the same words");
});

/** `count` visits the person kept, each before the last. */
const visits = (count) =>
  Array.from({ length: count }, (_, i) => {
    const at = Date.parse("2026-10-01T15:00:00Z") - i * 86_400_000;
    return {
      id: `v-${String(i).padStart(5, "0")}`,
      tenant_id: T,
      contact_id: PERSON,
      client_phone: null,
      client_email: null,
      status: "kept",
      vanished_at: null,
      starts_at: new Date(at).toISOString(),
      ends_at: new Date(at + 3_600_000).toISOString(),
    };
  });
const ASKED = { id: PERSON, phone: null, email: null };

test("a person's earlier visits past their cap are the newest, marked as a part, never counted from", async () => {
  const read = await getEarlierVisitRows(fakeDb({ appointments: visits(1001) }), T, ASKED, "2026-11-01T00:00:00Z");
  assert.equal(read.capped, true);
  assert.equal(read.rows.length, 1000);
  assert.equal(read.rows[0].id, "v-00000", "newest first");
  const all = await getEarlierVisitRows(fakeDb({ appointments: visits(1000) }), T, ASKED, "2026-11-01T00:00:00Z");
  assert.deepEqual([all.capped, all.rows.length], [false, 1000], "exactly the cap is all of them, unmarked");
});
