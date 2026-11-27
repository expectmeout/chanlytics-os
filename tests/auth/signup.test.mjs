/**
 * Sign-up: the schema, the words and the pending workspace executed; the
 * wiring pinned — the two public paths, the guards on the one public route,
 * the service-role boundary that makes no workspace, the migration's grants,
 * the one place workspaces are made, the way back to sign-in at the code step.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SignupSchema,
  SIGNUP_WORDS,
  addressAlreadyKnown,
  deviceTimezone,
  emailNotConfirmed,
  sendFailureIsOurs,
  pendingWorkspaceOf,
  PENDING_WORKSPACE_KEY,
  EVENT_KINDS,
  SIGNUP_WAITLIST,
  passwordProblem,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { AUTH, RATE, SAME, signupWorld } from "./_signup-route.mjs";

test("the form's shape: a name, a lower-cased address, an optional zone and code, nothing else", () => {
  const ok = SignupSchema.safeParse({
    name: "  Luna Studio ",
    email: "  Owner@Example.COM ",
    timezone: "America/New_York",
    code: "abc",
  });
  assert.ok(ok.success);
  assert.deepEqual(ok.data, {
    name: "Luna Studio",
    email: "owner@example.com",
    timezone: "America/New_York",
    code: "abc",
  });
  assert.ok(SignupSchema.safeParse({ name: "Luna", email: "o@example.com" }).success, "zone and code are optional");
  // A lead's own receptionist's link (decision 0079): its token, kept for the claim.
  assert.equal(
    SignupSchema.safeParse({ name: "Luna", email: "o@example.com", preview: "TokenTokenTokenToken01" }).data?.preview,
    "TokenTokenTokenToken01",
  );
  for (const bad of [
    { name: "L", email: "o@example.com" },
    { name: "Luna", email: "not-an-email" },
    { name: "Luna", email: "o@example.com", role: "owner" },
    { name: "x".repeat(121), email: "o@example.com" },
    { name: "Luna", email: "o@example.com", code: "c".repeat(81) },
    { name: "Luna", email: "o@example.com", preview: "not/a/token" },
  ])
    assert.equal(SignupSchema.safeParse(bad).success, false, JSON.stringify(bad));
});

test("the words and the way on: one neutral sentence, and the code step on this page rather than sign-in's", () => {
  assert.equal(
    SIGNUP_WORDS.sent("o@example.com"),
    "If o@example.com can receive email, a 6-digit code is on its way. Enter it below to finish.",
  );
  // `signupNext` lived here and sent people to /login at the code step. That
  // was right when the code WAS the credential; now somebody who has just
  // chosen a password and is shown a screen headed "sign in" has been told
  // their password did not work. It did — the ADDRESS is what is unproved, and
  // the sign-up page says so in its own words.
  assert.equal(SIGNUP_WORDS.confirmTitle, "Confirm your email");
  assert.match(SIGNUP_WORDS.confirmLead("o@example.com"), /^Enter the 6-digit code sent to o@example\.com\./);
  assert.match(SIGNUP_WORDS.confirmLead("o@example.com"), /10 minutes/, "how long they have, where they are typing it");
  assert.equal(
    deviceTimezone(() => "America/New_York"),
    "America/New_York",
  );
  assert.equal(
    deviceTimezone(() => {
      throw new Error("no Intl");
    }),
    undefined,
  );
  assert.equal(
    deviceTimezone(() => "x".repeat(65)),
    undefined,
  );
  assert.ok(EVENT_KINDS.includes("workspace.created"));
});

test("what the form said waits on the user, and is a prefilled form rather than a permission", () => {
  // THE WORKSPACE WAITS FOR ITS OWNER. Sign-up used to make it on the spot
  // for an address nobody had proved: a stranger typing someone else's email
  // got that person a workspace named by the stranger, owned by an account
  // they never asked for, and the real owner signed in later to the
  // stranger's choice of name. The form's two answers now ride on the auth
  // user under one key, and the create screen opens with them.
  assert.equal(PENDING_WORKSPACE_KEY, "pending_workspace");
  assert.deepEqual(
    pendingWorkspaceOf({ pending_workspace: { name: "  Luna Studio ", timezone: "America/New_York" } }),
    { name: "Luna Studio", timezone: "America/New_York" },
  );
  assert.deepEqual(
    pendingWorkspaceOf({ pending_workspace: { name: "Luna" } }),
    { name: "Luna", timezone: null },
    "no zone is null, and the screen falls back to the device's",
  );
  assert.deepEqual(
    pendingWorkspaceOf({ pending_workspace: { name: "Luna", timezone: null, extra: 1 } }),
    { name: "Luna", timezone: null },
    "a field this build does not know is dropped, not fatal",
  );
  // The preview sign-up came from, for the first screen to claim (decision 0079); one that is no token is none, and
  // the name and clock still stand.
  assert.deepEqual(
    pendingWorkspaceOf({ pending_workspace: { name: "Luna", timezone: null, preview: "TokenTokenTokenToken01" } }),
    { name: "Luna", timezone: null, preview: "TokenTokenTokenToken01" },
  );
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Luna", timezone: null, preview: "x" } }), {
    name: "Luna",
    timezone: null,
  });
  // Whatever Supabase holds: a user made by /login has no such key, an old
  // or hand-edited value has the wrong shape, and none of it may throw.
  for (const meta of [
    undefined,
    null,
    "x",
    42,
    {},
    { pending_workspace: null },
    { pending_workspace: "Luna" },
    { pending_workspace: { name: "L" } },
    { pending_workspace: { name: "x".repeat(121) } },
    { pending_workspace: { name: "Luna", timezone: "" } },
  ]) {
    assert.equal(pendingWorkspaceOf(meta), null, JSON.stringify(meta));
  }
});

test("the wiring: the door a stranger may use, its guards, an account made on the public key, and no workspace made", async () => {
  // Public by a deliberate edit to the proxy's list (/signup and /api/v1/signup): auth/auth-gate.test.mjs runs the gate
  // over every address. The route, run as a stranger meets it (_signup-route.mjs), with no session at all: it does not
  // go through withRoute, since there is none to verify.
  const who = { name: "Luna Studio", email: "owner@luna.example", password: "correct horse battery" };
  const open = signupWorld();
  const made = await open.post({ ...who, timezone: "America/New_York" });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  // THE SERVICE ROLE HAS LEFT THIS PATH. It used to create the user with the admin API and mark the address confirmed
  // with no proof at all. With confirmation on, the ordinary sign-up call does the whole job on the PUBLIC key: no
  // session for an unproved address, and the code sent as part of it. Nothing else is asked of anybody.
  assert.deepEqual(
    open.wire.map((r) => `${r.origin === AUTH ? "auth" : r.origin}${r.path}`),
    ["auth/auth/v1/signup"],
    "one call, the ordinary sign-up: no admin API, no workspace, nothing to undo, no notice to the platform",
  );
  const [signup] = open.signups();
  assert.equal(signup.headers.apikey, "anon-key-for-this-file", "on the public key: the route holds no service key");
  assert.ok(
    !Object.values(signup.headers).some((v) => String(v).includes(process.env.SUPABASE_SERVICE_ROLE_KEY)),
    "and never the service role's",
  );
  assert.deepEqual([signup.body.email, signup.body.password], [who.email, who.password]);
  // What the form said rides on the user, for the create screen to open with -- and the code it checked, so nothing is
  // typed twice. A workspace is made by the person who proved the inbox, signed in (workspace-creation.test.mjs runs
  // that route, and the platform's notice it sends).
  assert.deepEqual(signup.body.data, {
    [PENDING_WORKSPACE_KEY]: { name: "Luna Studio", timezone: "America/New_York" },
  });
  assert.deepEqual(open.tables.waitlist, [], "and nothing is written of ours");
  const invited = signupWorld({ code: "SPRING-2026" });
  await invited.post({ ...who, email: "two@luna.example", code: "SPRING-2026" });
  assert.deepEqual(
    invited.signups()[0].body.data[PENDING_WORKSPACE_KEY],
    { name: "Luna Studio", timezone: null, code: "SPRING-2026" },
    "the code rides with it when the door asked one",
  );

  // Same-origin, like every mutating route.
  const crossSite = await signupWorld().post(who, { "sec-fetch-site": "cross-site" });
  assert.deepEqual([crossSite.status, crossSite.body.error.message], [403, SIGNUP_WORDS.crossSite]);

  // The invite code, by the one function both doors use: no code, or another, is the code's sentence and no account.
  for (const code of [undefined, "WINTER-2025"]) {
    const w = signupWorld({ code: "SPRING-2026" });
    const r = await w.post({ ...who, ...(code ? { code } : {}) });
    assert.deepEqual([r.status, r.body.error.message], [403, SIGNUP_WORDS.codeWrong], String(code));
    assert.deepEqual(w.signups(), []);
  }
  assert.equal((await signupWorld({ code: "SPRING-2026" }).post({ ...who, code: "SPRING-2026" })).status, 200);

  // A bucket per address: the same address from new networks is refused once its own bucket is spent.
  const one = signupWorld();
  for (let i = 0; i < RATE.signup_email.limit; i++)
    await one.post({ ...who, email: "flood@luna.example" }, { ...SAME, "x-forwarded-for": `203.0.113.${i + 1}` });
  assert.equal(
    (await one.post({ ...who, email: "flood@luna.example" }, { ...SAME, "x-forwarded-for": "198.51.100.7" })).status,
    429,
    "the address's own bucket",
  );

  // The credential is insisted on by the creating path, not by the schema the waitlist also passes through: an open door
  // with no password is refused in the rule's words and makes nothing; the queue, which makes no account, never asks
  // for one. The one account made with none is a live preview's, whose link the route checked first (decision 0079):
  // run in previews/preview-claim.test.mjs ("from a live preview's link an account is made with no password").
  const bare = signupWorld();
  const noPassword = await bare.post({ name: who.name, email: who.email });
  assert.deepEqual([noPassword.status, noPassword.body.error.code], [400, "validation"]);
  assert.equal(noPassword.body.error.message, passwordProblem(undefined) ?? "Choose a password.");
  assert.deepEqual(bare.signups(), []);
  assert.equal((await signupWorld({ code: SIGNUP_WAITLIST }).post({ name: who.name, email: who.email })).status, 200);

  // When the platform DOES obfuscate an address it already has (no identities), and when it says so outright, the
  // answer is the one a new address gets: nothing made, nothing sent, the same sentence. An ordinary second sign-up is
  // never a 500, which is a dead end AND an oracle.
  const fresh = (await signupWorld().post(who)).body;
  for (const answer of [
    { status: 200, body: { id: "d1", email: who.email, identities: [], user_metadata: {} } },
    {
      status: 422,
      body: { code: "user_already_exists", error_code: "user_already_exists", msg: "User already registered" },
    },
  ]) {
    const again = await signupWorld({ signUp: () => answer }).post(who);
    assert.deepEqual([again.status, again.body], [200, fresh], JSON.stringify(answer.body));
  }
});

test("nowhere yet comes with what sign-up kept: the first workspace's create screen opens with it", async () => {
  // GET /api/v1/workspaces for someone with no workspace (server/workspace/list.ts): no workspace, and the name and
  // clock they typed before they had proved the inbox, from the user's metadata, so the create screen opens with them.
  const workspaces = await importSrc("apps/dashboard/app/api/v1/workspaces/route.ts");
  const kept = { name: "Luna Studio", timezone: "America/New_York" };
  const answer = await workspaces.GET.run(new Request("http://localhost/api/v1/workspaces"), {
    supabase: fakeDb(
      { memberships: [], tenants: [], profiles: [] },
      {},
      { platform_staff_state: () => null, handovers_mine: () => [] },
    ),
    userId: "u-new",
    email: "owner@luna.example",
    params: {},
    metadata: { [PENDING_WORKSPACE_KEY]: kept },
  });
  assert.deepEqual([answer.workspaces, answer.active_workspace_id], [[], null]);
  assert.deepEqual(answer.pending, pendingWorkspaceOf({ [PENDING_WORKSPACE_KEY]: kept }));
  assert.equal(answer.pending.name, "Luna Studio", "what sign-up kept");
});

// The service role alone may name an owner, and the signed-in wrapper delegates: create_workspace_for, redefined since
// 00072 through 00497, run on the stack (auth/workspace-created.db.test.mjs, partners/handover.db.test.mjs). Every
// workspace is recorded where it is made, naming the session when there was one (00104's trigger): the same suite.
// Sign-in (app/login) carries the address across, keeps the code door for every account with no password, never mints
// an account by its code, points at sign-up and a reset, and sends an unconfirmed address a fresh confirmation: drawn
// and pressed in sign-in-screen.test.mjs. The sign-up page asks the server which door it is and draws the code field for
// the invite's alone: signup-screen.test.mjs. Pinned as the proxy's, the route's, signup.ts's, auth.ts's, create.ts's,
// list.ts's, 00104's, the login page's and SignupScreen.tsx's text until 26 Nov 2026.

test("a send WE could not make is admitted; one about an ADDRESS is not", () => {
  // THE SECOND WALL IN THE GATE-9 WALKTHROUGH. The auth mailer has a declared
  // budget of two an hour (`[auth.rate_limit] email_sent = 2`) with no SMTP
  // configured, and the sign-in code is the ONLY way into a new workspace. The
  // third person to sign up in an hour had their workspace, membership and
  // billing row created, was told "a 6-digit code is on its way", and was sent to
  // /login to wait for something that would never arrive.
  //
  // The swallow was right about one thing and wrong about the other. Whether an
  // address is already registered is not a stranger's to learn from a public
  // form — answering differently for known and unknown addresses is an account
  // enumeration oracle. But "we are over our mail budget" is about US. It
  // discloses nothing about any address, and it is the only half a person can act
  // on.
  //
  // OURS — say so.
  assert.equal(sendFailureIsOurs({ code: "over_email_send_rate_limit" }), true);
  assert.equal(sendFailureIsOurs({ code: "email_provider_disabled" }), true);
  assert.equal(sendFailureIsOurs({ status: 429, message: "Request rate limit reached" }), true);
  assert.equal(sendFailureIsOurs({ message: "SMTP server not configured" }), true);
  assert.equal(sendFailureIsOurs({ message: "Email provider is disabled" }), true);
  // How Supabase says the mail provider refused the send. Production answered
  // sign-up with a 500 for this until 13 Sep 2026, because nothing above matched it.
  assert.equal(
    sendFailureIsOurs({ status: 500, code: "unexpected_failure", message: "Error sending confirmation email" }),
    true,
  );
  assert.equal(sendFailureIsOurs({ message: "Error sending recovery email" }), true);
  assert.equal(sendFailureIsOurs({ message: "Error sending magic link email" }), true);

  // THEIRS — stay opaque. These are the answers that would turn the form into an
  // oracle, and the fallback for anything unrecognised leans this way on purpose.
  for (const e of [
    { code: "email_exists", message: "User already registered" },
    { code: "user_not_found", message: "User not found" },
    { code: "validation_failed", message: "Unable to validate email address" },
    { status: 400, message: "Invalid login credentials" },
    { message: "something nobody has seen before" },
    {},
    null,
    undefined,
  ]) {
    assert.equal(sendFailureIsOurs(e), false, JSON.stringify(e));
  }

  // The sentence the person reads says two things: the code did not go out,
  // and nothing is lost -- true because nothing was made; the name they typed
  // waits on their account. It must NOT hint at the address, and must not
  // claim a workspace that does not exist yet.
  assert.match(SIGNUP_WORDS.notSent, /^Couldn't send/);
  assert.match(SIGNUP_WORDS.notSent, /nothing is lost/);
  assert.doesNotMatch(
    SIGNUP_WORDS.notSent,
    /workspace is made/,
    "REGRESSION: a workspace claimed before its owner has signed in",
  );
  assert.doesNotMatch(
    SIGNUP_WORDS.notSent,
    /registered|exists|unknown|not found/i,
    "REGRESSION: a refusal that says whether we know the address",
  );

  // And the opaque sentence is untouched: it still speaks conditionally.
  assert.match(SIGNUP_WORDS.sent("o@example.com"), /^If o@example\.com can receive email/);
});

test("an unconfirmed address is the one refusal safe to explain, and it is not confused with the others", () => {
  // Requiring confirmation created this state, so requiring it obliges us to
  // offer a way out. Only a caller who supplied the CORRECT password for an
  // existing account sees this answer, so it discloses nothing.
  for (const stuck of [{ code: "email_not_confirmed" }, { message: "Email not confirmed" }]) {
    assert.equal(emailNotConfirmed(stuck), true, JSON.stringify(stuck));
  }
  for (const not of [
    null,
    undefined,
    {},
    { code: "invalid_credentials" },
    { code: "email_exists" },
    { message: "Invalid login credentials" },
  ]) {
    assert.equal(emailNotConfirmed(not), false, JSON.stringify(not));
  }
  // Three judgements over the same error object, none claiming another's cases.
  assert.equal(addressAlreadyKnown({ code: "email_not_confirmed" }), false);
  assert.equal(sendFailureIsOurs({ code: "email_not_confirmed" }), false);
  // The words say the password was NOT the problem: without that, the obvious
  // next move is resetting a password that works perfectly well.
  const said = SIGNUP_WORDS.confirmFromSignIn("o@example.com");
  assert.match(said, /password is right/i);
  assert.match(said, /never confirmed/i);
  assert.match(said, /o@example\.com/);
});

test("an address we already have is recognised, and is a different judgement from a send we could not make", () => {
  // The two answers Supabase gives that this route must tell apart. One is
  // about an ADDRESS and is swallowed; the other is about US and is admitted.
  // Confusing them either leaks who has an account or strands somebody waiting
  // for a code that is never coming.
  for (const known of [
    { code: "email_exists" },
    { code: "user_already_exists" },
    { message: "User already registered" },
    { message: "A user with this email address has already been registered" },
  ])
    assert.equal(addressAlreadyKnown(known), true, JSON.stringify(known));

  for (const not of [
    null,
    undefined,
    {},
    { code: "over_email_send_rate_limit" },
    { code: "email_provider_disabled" },
    { message: "Signups not allowed for otp" },
    { message: "something nobody has seen before" },
  ])
    assert.equal(addressAlreadyKnown(not), false, JSON.stringify(not));

  // Disjoint, in both directions: neither judgement may claim the other's cases.
  assert.equal(sendFailureIsOurs({ code: "email_exists" }), false);
  assert.equal(addressAlreadyKnown({ code: "over_email_send_rate_limit" }), false);
  // A refused send is neither an address we already have nor an unconfirmed one:
  // swallowed as either, the person would wait for a code that never went out.
  assert.equal(addressAlreadyKnown({ message: "Error sending confirmation email" }), false);
  assert.equal(emailNotConfirmed({ message: "Error sending confirmation email" }), false);
});

test("what sign-up kept is a prefill, and a clock Postgres would refuse is dropped rather than failing the first Create", () => {
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Glow Studio", timezone: "America/New_York" } }), {
    name: "Glow Studio",
    timezone: "America/New_York",
  });
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Glow Studio", timezone: "Mars/Olympus" } }), {
    name: "Glow Studio",
    timezone: null,
  });
  assert.equal(
    pendingWorkspaceOf({ pending_workspace: { name: "G" } }),
    null,
    "a name below the minimum is not worth showing",
  );
  assert.equal(pendingWorkspaceOf(null), null);
  assert.equal(
    SIGNUP_WORDS.notSentTitle,
    "Couldn't send the code",
    "the page's heading when the code did not go out says so, not that a workspace exists",
  );
});
