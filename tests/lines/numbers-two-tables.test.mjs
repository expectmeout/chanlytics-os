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
// Where the answer is written (the comments ON the tables, which anyone with a psql prompt can read) and what
// number_drift() reports -- silent about a channel with no line, a line still being set up and a config that holds no
// id; loud, each by its kind and in a person's words, about a route naming a line that is gone, a route publishing a
// number no line of its workspace has, a line answering with nothing routing to it and one texting with no route for
// its number -- run on the replayed stack in which-table-owns-a-number.db.test.mjs. Pinned as 00087's text here until
// 26 Nov 2026; no key but the service's may run it (database/tenancy/, beside the vault's doors).

// /api/diag reading number_drift(), with an empty list as agreement, is run in diag-door.test.mjs.

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
