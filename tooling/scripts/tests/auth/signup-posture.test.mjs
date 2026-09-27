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
import { signupPosture, SIGNUP_WAITLIST, SIGNUP_WORDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";

test("one environment variable, three postures", () => {
  assert.equal(signupPosture(undefined), "open", "unset: anyone");
  assert.equal(signupPosture(""), "open", "empty is unset — a blank env var is not a code");
  assert.equal(signupPosture(SIGNUP_WAITLIST), "waitlist");
  assert.equal(signupPosture("SPRING-2026"), "invite", "anything else IS the code");
  // The sentinel is a word nobody would choose as an invite code by accident,
  // and short enough to type into a Vercel field without a mistake.
  assert.equal(SIGNUP_WAITLIST, "waitlist");
});

test("the waitlist branch creates nothing, and returns before it could", () => {
  const route = readCode("apps/dashboard/app/api/v1/signup/route.ts");
  const branch = route.slice(
    route.indexOf('if (posture === "waitlist")'),
    route.indexOf('if (posture === "invite" && !inviteCodeMatches(input.code))'),
  );
  assert.ok(branch.includes("await joinWaitlist("), "it writes the queue row");
  assert.ok(!branch.includes("signUp("), "and never the workspace");
  assert.ok(branch.includes("return NextResponse.json"), "and returns before the sign-up path can run");
  // Somebody on the list is not a customer. Half a customer would be a
  // workspace nobody owns and a trial nobody started.
  // Matched on the CALL rather than the whole statement: what this test is
  // about is that the queue returns before anything creates an account, and
  // pinning the arguments too made it fail the day the credential was handed
  // over explicitly — a green-to-red that said nothing about the invariant.
  assert.ok(
    route.indexOf('if (posture === "waitlist")') < route.indexOf("await signUp("),
    "the branch is ahead of every creating call",
  );
  // The limiter runs FIRST, deliberately: this is the posture a launch runs in,
  // so it is the one that most needs limiting, and a queue is what a script
  // would want to flood.
  assert.ok(route.indexOf("takeRate(`ip:") < route.indexOf('if (posture === "waitlist")'));
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
 * error it raises actually exist: tooling/scripts/tests/auth/waitlist.db.test.mjs.
 * It fails against the previous build, all five cases.
 */
test("the page is told which posture to render, and older clients still work", () => {
  const route = readCode("apps/dashboard/app/api/v1/signup/route.ts");
  assert.ok(route.includes('ok({ posture, open: posture !== "waitlist", code_required: posture === "invite" })'));
  // The page and the API ship separately, so the two booleans a client already
  // reads keep their old meaning rather than disappearing under it.
  assert.ok(
    readRaw("apps/dashboard/app/api/v1/signup/route.ts").includes(
      "keeps working, which matters because the page and the API ship separately",
    ),
  );
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

test("the page renders the door it actually is", () => {
  const page = readCode("apps/dashboard/app/signup/page.tsx");
  // A button that says "Create workspace" on a page that is really a waitlist
  // is a promise the next screen breaks, so nothing renders until the server
  // has said which door this is.
  assert.ok(page.includes('const [posture, setPosture] = useState<"open" | "waitlist" | "invite" | null>(null);'));
  assert.ok(page.includes("disabled={busy || posture === null}"), "disabled until the posture is known");
  assert.match(page, /waiting\s*\?\s*SIGNUP_WORDS\.waitlistCta\s*:\s*"Create workspace"/);
  assert.ok(page.includes("waiting ? SIGNUP_WORDS.waitlistTitle : SIGNUP_WORDS.title"));

  // A waitlist submission has nowhere to navigate: no code is coming and no
  // screen would accept one.
  assert.match(page, /if \(j\.data\?\.waitlisted\) \{\s*setJoined\(true\);\s*return;\s*\}/);
  assert.ok(page.includes('data-testid="signup-joined"'));

  // The code field belongs to the invite posture alone — an open sign-up must
  // never show a blank the person cannot fill.
  assert.ok(page.includes('{posture === "invite" && ('));
  // The STATE is gone; SIGNUP_WORDS.codeRequired is a sentence and stays.
  assert.ok(
    !/\bconst \[codeRequired/.test(page) && !/\bcodeRequired &&/.test(page),
    "the old boolean state is gone from the page",
  );

  // The API and the page ship separately, so an older API is still understood.
  assert.ok(page.includes('setPosture(j?.data?.posture ?? (j?.data?.code_required ? "invite" : "open"))'));
});
