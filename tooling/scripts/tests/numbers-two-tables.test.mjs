/**
 * Which table owns a number.
 *
 * Two tables model a phone number and nothing said which one wins. Asked
 * directly -- "lines or tenant_channels?" -- nobody could answer from the
 * schema, and the answer decides two different things: what a customer dials,
 * and whose workspace an arriving message belongs to.
 *
 *   lines            the ASSET, and the saga that made it work
 *   tenant_channels  the ROUTING derived from it, joined by config.line_id
 *
 * The asymmetry is the part that misleads: a channel row with NO line is a
 * perfectly good state -- a voice number bought inside Retell, or a WhatsApp
 * number that came through Meta and never touched Twilio. Both exist in
 * production right now. A drift report that treated those as broken would fire
 * on every workspace we have, which is why number_drift() is written to be
 * silent about them and loud about the reverse: a line that answers with
 * nothing routing to it is a number ringing into a workspace nobody can name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readCode, readRaw } from "./_source.mjs";

const SQL = readRaw("supabase/migrations/00087_which_table_owns_a_number.sql");

test("the answer is written where it cannot be lost: on the tables themselves", () => {
  // A comment in a migration is findable by grep; a comment ON THE TABLE is
  // findable by anyone with a psql prompt, which is who asks this question.
  assert.match(SQL, /comment on table public\.lines is/);
  assert.match(SQL, /comment on table public\.tenant_channels is/);
  assert.match(SQL, /comment on column public\.tenant_channels\.config is/);
  assert.ok(SQL.includes("config.line_id points back here"), "lines says which way the arrow points");
  assert.ok(SQL.includes("The ROUTING table"), "and tenant_channels says what it is for");
  // The two shapes a reader gets wrong. A voice route is per RECEPTIONIST, so
  // two numbers on one agent share it -- which is why the row's number names
  // whichever line got there first, by design and not by drift.
  assert.ok(SQL.includes("keyed on the receptionist (external_id = agent id)"));
  assert.ok(SQL.includes("keyed on the number, because a message arrives addressed to one"));
});

test("number_drift() is silent about the states that are fine and loud about the ones that are not", () => {
  const fn = SQL.slice(SQL.indexOf("create or replace function public.number_drift"));
  for (const kind of ["orphan_route", "route_number_unknown", "answering_unrouted", "texting_unrouted"]) {
    assert.ok(fn.includes(`'${kind}'::text`), `${kind} is reported`);
  }
  // Every case requires a line_id or a finished line, so a Retell-bought voice
  // number and a Meta WhatsApp number -- both of which have a channel row and
  // no line, in production, today -- produce nothing.
  assert.ok(!/config \? 'line_id'\s*is not true/.test(fn), "a channel without a line is not drift");
  assert.ok(fn.includes("l.voice_state = 'answering'"), "a line still provisioning is not expected to be routable");
  assert.ok(fn.includes("l.sms_state = 'active'"));
  // Case 2 asks whether ANY line of the workspace has the number, not whether
  // the row's own line does: sharing a receptionist leaves the first number in
  // place, and that number is still the workspace's own.
  assert.ok(fn.includes("where l.tenant_id = c.tenant_id and l.e164 = c.number_e164"));
  // A diagnostic that dies on the data it is diagnosing is worse than none.
  assert.match(fn, /~\* '\^\[0-9a-f\]\{8\}-/, "the line_id is shaped like an id before it is cast to one");
  assert.ok(fn.includes("revoke execute on function public.number_drift() from public, anon, authenticated;") || SQL.includes("revoke execute on function public.number_drift() from public, anon, authenticated;"));
});

test("/api/diag reads it, so agreement is something an operator can see", () => {
  const diag = readCode("apps/edge/api/diag.ts");
  assert.ok(diag.includes('await db.rpc("number_drift")'));
  assert.ok(diag.includes("out.numbers = { ok: rows.length === 0, drift: rows };"), "empty means agreement");
  // readCode strips comments, so the reason an empty list is the RIGHT answer
  // is asserted on the raw file -- it is the one thing a future reader needs
  // before deciding this check is broken because it never fires.
  assert.ok(readRaw("apps/edge/api/diag.ts").includes("legitimately has none"), "and says why an empty list is the expected answer");
});

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;

test("the live database agrees with itself", { skip }, async () => {
  // Its own test, like the watchdog's: a red here means production has a number
  // ringing into a workspace nobody can identify, not that the function is
  // wrong. The failure message IS the detail string.
  const db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("number_drift");
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, [], (data ?? []).map((r) => `${r.kind}: ${r.detail}`).join("; "));
});
