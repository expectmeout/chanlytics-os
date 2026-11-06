/**
 * A phone's call activity belongs to one person (00221), on a real Postgres with real sessions: the register door
 * takes an activity token from any other row that holds it, two rows can never hold one token, and a phone that has
 * not said its token this time keeps the one it said before. Runs against the database `supabase start` builds on
 * this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

let admin;
const made = [];
const PASSWORD = "activity-token-test-password-1";

async function person(tag) {
  const email = `activity-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  made.push(data.user.id);
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const signed = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  return { id: data.user.id, db: c };
}
const register = (db, token, activity) =>
  db.rpc("push_device_register", {
    p_token: token,
    p_platform: "ios",
    p_app_version: "1.0.0",
    ...(activity === undefined ? {} : { p_activity_token: activity }),
  });
const holders = async (activity) =>
  (await admin.from("push_devices").select("user_id, token").eq("activity_token", activity)).data ?? [];

before(async () => {
  if (skip) return;
  admin = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

test(
  "a phone's activity token passes to the person who registers it; nobody else's row keeps it",
  { skip },
  async () => {
    const stamp = Date.now();
    const a = await person("a");
    const b = await person("b");
    const act = `act-${stamp}`;
    assert.equal((await register(a.db, `ExponentPushToken[a${stamp}]`, act)).error, null);
    assert.deepEqual(
      (await holders(act)).map((h) => h.user_id),
      [a.id],
    );
    // The same phone, signed in as the next person: a new push token, the same activity token.
    assert.equal((await register(b.db, `ExponentPushToken[b${stamp}]`, act)).error, null);
    assert.deepEqual(
      (await holders(act)).map((h) => h.user_id),
      [b.id],
      "REGRESSION: the first person's row kept the token, and their calls went on showing on the phone",
    );
    // A launch that does not say its activity token keeps the one it said.
    assert.equal((await register(b.db, `ExponentPushToken[b${stamp}]`)).error, null);
    assert.equal((await holders(act)).length, 1);
  },
);

test("two rows can never hold one activity token", { skip }, async () => {
  const stamp = Date.now();
  const a = await person("c");
  const act = `dup-${stamp}`;
  assert.equal((await register(a.db, `ExponentPushToken[c${stamp}]`, act)).error, null);
  const { error } = await admin
    .from("push_devices")
    .insert({ user_id: a.id, token: `ExponentPushToken[d${stamp}]`, platform: "android", activity_token: act });
  assert.ok(error, "the unique index refuses a second holder");
  assert.match(error.code ?? "", /23505/);
});
