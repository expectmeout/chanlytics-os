/**
 * The front door has three postures, not two.
 *
 * THE STATE THIS EXISTS FOR. On production, `SIGNUP_CODE` was unset — so the
 * route reported `code_required: false` and anyone could create a workspace.
 * That is the right posture eventually and the wrong one before the product
 * can carry the people it lets in: each new workspace provisions a phone
 * number and files a carrier registration, and doing that badly at volume is
 * worse for the businesses already inside than making the next ones wait.
 *
 * The only alternative was a wall — an invite code — which turns away the very
 * people who wanted this enough to type their address. So: a queue.
 *
 * One switch chooses, because the posture has to change on the day the queue is
 * longer than the product can serve, and a deploy is too slow to be the lever.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { signupPosture, signupPostureFor, SIGNUP_WAITLIST, SIGNUP_WORDS } from "@chanlytics/contracts";
import { readRaw } from "../_source.mjs";
import { RATE, signupWorld } from "./_signup-route.mjs";

test("one environment variable, three postures", () => {
  assert.equal(signupPosture(undefined), "open", "unset: anyone");
  assert.equal(signupPosture(""), "open", "empty is unset — a blank env var is not a code");
  assert.equal(signupPosture(SIGNUP_WAITLIST), "waitlist");
  assert.equal(signupPosture("SPRING-2026"), "invite", "anything else IS the code");
  // The sentinel is a word nobody would choose as an invite code by accident,
  // and short enough to type into a Vercel field without a mistake.
  assert.equal(SIGNUP_WAITLIST, "waitlist");
});

test("a lead's own receptionist's live link opens sign-up whatever the posture, and only a live one", () => {
  // Only Chanlytics sends one (decision 0079), so it stands for an invite code; the route and the page ask the same
  // rule, and previews/preview-claim.test.mjs runs the route under each posture.
  for (const posture of ["open", "waitlist", "invite"]) {
    assert.equal(signupPostureFor(posture, true), "open", posture);
    assert.equal(signupPostureFor(posture, false), posture, `${posture}: no link, the switch's`);
  }
});

test("the waitlist branch creates nothing, and returns before it could", async () => {
  // The route, run under the waitlist's posture (_signup-route.mjs): the queue row is written, and nothing else.
  // Somebody on the list is not a customer. Half a customer would be a workspace nobody owns and a trial nobody started.
  const w = signupWorld({ code: SIGNUP_WAITLIST });
  const r = await w.post({ name: "Luna Studio", email: "owner@luna.example", password: "correct horse battery" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, { sent: true, waitlisted: true, next: null }, "the same shape a sign-up returns");
  assert.deepEqual(
    w.tables.waitlist.map((row) => [row.email, row.business]),
    [["owner@luna.example", "Luna Studio"]],
    "it writes the queue row",
  );
  assert.deepEqual(w.signups(), [], "and never an account: the branch returns before the sign-up path can run");
  // The limiter runs FIRST, deliberately: this is the posture a launch runs in, so it is the one that most needs
  // limiting, and a queue is what a script would want to flood. One network's bucket, spent on the queue alone.
  const flood = signupWorld({ code: SIGNUP_WAITLIST });
  for (let i = 0; i < RATE.signup_ip.limit; i++)
    assert.equal((await flood.post({ name: "Bot", email: `bot-${i}@spam.example` })).status, 200, `press ${i + 1}`);
  const refused = await flood.post({ name: "Bot", email: "one-more@spam.example" });
  assert.equal(refused.status, 429, "the queue's presses spend the network's bucket");
  assert.equal(flood.tables.waitlist.length, RATE.signup_ip.limit, "and the one past it joins nothing");
});

/**
 * THE TEST THAT WAS HERE PINNED THE DEFECT.
 *
 * It read `signup.ts` and asserted that it contained `onConflict: "email"` and
 * `if (error && !/duplicate|unique/i.test(error.message))` -- the two lines
 * that between them meant NOBODY WAS EVER PUT ON THE LIST. The table's unique
 * index is on `lower(email)`, an expression PostgREST cannot name in an ON
 * CONFLICT clause, so every call came back 42P10 whose message contains the
 * word "unique" and was swallowed as a duplicate. A test that reads source can
 * say the code is the code; it cannot say the code works, and here it spent
 * months asserting that a broken statement was the right one.
 *
 * What replaces it runs against Postgres, where the expression index and the
 * error it raises actually exist: tests/auth/waitlist.db.test.mjs.
 * It fails against the previous build, all five cases.
 */
test("the page is told which posture to render, and older clients still work", async () => {
  // The page and the API ship separately, so the two booleans a client already reads keep their old meaning rather than
  // disappearing under the posture: GET, run under each.
  for (const [code, data] of [
    [undefined, { posture: "open", open: true, code_required: false }],
    [SIGNUP_WAITLIST, { posture: "waitlist", open: false, code_required: false }],
    ["SPRING-2026", { posture: "invite", open: true, code_required: true }],
  ]) {
    const r = await signupWorld({ code }).get();
    assert.deepEqual([r.status, r.body.data], [200, data], String(code));
  }
});

test("the words say what is true and when they will hear", () => {
  assert.match(SIGNUP_WORDS.waitlistLead, /small groups/);
  assert.match(SIGNUP_WORDS.waitlistSent("a@b.com"), /a@b\.com/);
  assert.match(
    SIGNUP_WORDS.waitlistSent("a@b.com"),
    /within a week/,
    "a promise with a number in it, or it is not a promise",
  );
  // No apology and no marketing. The reason given is the real one.
  for (const w of [SIGNUP_WORDS.waitlistTitle, SIGNUP_WORDS.waitlistLead, SIGNUP_WORDS.waitlistCta]) {
    assert.doesNotMatch(w, /sorry|unfortunately|exclusive|VIP|early access/i, w);
  }
});

test("the table is a queue, not a mailing list", () => {
  const sql = readRaw("supabase/migrations/00088_waitlist.sql");
  assert.match(sql, /create table public\.waitlist/);
  assert.match(
    sql,
    /create unique index waitlist_email_idx on public\.waitlist \(lower\(email\)\)/,
    "one row per address",
  );
  assert.match(sql, /where invited_at is null/, "the partial index is the queue");
  // Deny-all: the people on this list have no workspace to be scoped to, so
  // there is no membership that could make a row legitimately session-readable.
  assert.match(sql, /alter table public\.waitlist enable row level security/);
  assert.ok(!/create policy/.test(sql), "no policies at all — service role only");
  assert.match(sql, /revoke all on public\.waitlist from anon, authenticated/);
});

// The page renders the door it actually is: nothing can be pressed until the server has named the door, each door
// sends only what it takes and draws only its own fields (the code field the invite's alone), a waitlist answer is its
// joined card with nowhere to go, and an older API's booleans still name the door. Drawn and pressed in
// signup-screen.test.mjs ("nothing can be pressed until the server has named the door", "each answer has its card",
// "an older API that names no posture"). Pinned as SignupScreen.tsx's text until 26 Nov 2026.
