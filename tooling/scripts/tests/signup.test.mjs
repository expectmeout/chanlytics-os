/**
 * Sign-up: the schema, the words and the pending workspace executed; the
 * wiring pinned — the two public paths, the guards on the one public route,
 * the service-role boundary that makes no workspace, the migration's grants,
 * the one place workspaces are made, the way back to sign-in at the code step.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignupSchema, SIGNUP_WORDS, deviceTimezone, sendFailureIsOurs, pendingWorkspaceOf, PENDING_WORKSPACE_KEY, EVENT_KINDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

test("the form's shape: a name, a lower-cased address, an optional zone and code, nothing else", () => {
  const ok = SignupSchema.safeParse({ name: "  Luna Studio ", email: "  Owner@Example.COM ", timezone: "America/New_York", code: "abc" });
  assert.ok(ok.success);
  assert.deepEqual(ok.data, { name: "Luna Studio", email: "owner@example.com", timezone: "America/New_York", code: "abc" });
  assert.ok(SignupSchema.safeParse({ name: "Luna", email: "o@example.com" }).success, "zone and code are optional");
  for (const bad of [
    { name: "L", email: "o@example.com" },
    { name: "Luna", email: "not-an-email" },
    { name: "Luna", email: "o@example.com", role: "owner" },
    { name: "x".repeat(121), email: "o@example.com" },
    { name: "Luna", email: "o@example.com", code: "c".repeat(81) },
  ]) assert.equal(SignupSchema.safeParse(bad).success, false, JSON.stringify(bad));
});

test("the words and the way on: one neutral sentence, and the code step on this page rather than sign-in's", () => {
  assert.equal(SIGNUP_WORDS.sent("o@example.com"), "If o@example.com can receive email, a 6-digit code is on its way. Enter it below to finish.");
  // `signupNext` lived here and sent people to /login at the code step. That
  // was right when the code WAS the credential; now somebody who has just
  // chosen a password and is shown a screen headed "sign in" has been told
  // their password did not work. It did — the ADDRESS is what is unproved, and
  // the sign-up page says so in its own words.
  assert.equal(SIGNUP_WORDS.confirmTitle, "Confirm your email");
  assert.match(SIGNUP_WORDS.confirmLead("o@example.com"), /^Enter the 6-digit code we sent to o@example\.com\./);
  assert.match(SIGNUP_WORDS.confirmLead("o@example.com"), /10 minutes/, "how long they have, where they are typing it");
  assert.equal(deviceTimezone(() => "America/New_York"), "America/New_York");
  assert.equal(deviceTimezone(() => { throw new Error("no Intl"); }), undefined);
  assert.equal(deviceTimezone(() => "x".repeat(65)), undefined);
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
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "  Luna Studio ", timezone: "America/New_York" } }), { name: "Luna Studio", timezone: "America/New_York" });
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Luna" } }), { name: "Luna", timezone: null }, "no zone is null, and the screen falls back to the device's");
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Luna", timezone: null, extra: 1 } }), { name: "Luna", timezone: null }, "a field this build does not know is dropped, not fatal");
  // Whatever Supabase holds: a user made by /login has no such key, an old
  // or hand-edited value has the wrong shape, and none of it may throw.
  for (const meta of [undefined, null, "x", 42, {}, { pending_workspace: null }, { pending_workspace: "Luna" }, { pending_workspace: { name: "L" } }, { pending_workspace: { name: "x".repeat(121) } }, { pending_workspace: { name: "Luna", timezone: "" } }]) {
    assert.equal(pendingWorkspaceOf(meta), null, JSON.stringify(meta));
  }
});

test("the wiring: two public paths, the guards on the route, a service role that makes no workspace, the one place workspaces are made", () => {
  const middleware = readCode("apps/dashboard/middleware.ts");
  assert.ok(middleware.includes('"/signup"') && middleware.includes('"/api/v1/signup"'), "public by a deliberate edit to PUBLIC_PATHS");
  const route = readCode("apps/dashboard/app/api/v1/signup/route.ts");
  assert.ok(!route.includes("withRoute"), "no session to verify: the route does not go through withRoute");
  assert.ok(route.includes("if (!isSameOrigin(req)) throw new AppError(\"forbidden\", SIGNUP_WORDS.crossSite);"), "same-origin, like every mutating route");
  assert.ok(route.includes('await takeRate(`ip:${hash(ipOf(req))}`, "signup_ip");') && route.includes('await takeRate(`email:${hash(input.email)}`, "signup_email");'), "a bucket per network and per address");
  assert.ok(route.includes("inviteCodeMatches(input.code)") && route.includes("process.env.SIGNUP_CODE"), "the invite code compared in constant time, by the one function both doors use");
  assert.ok(!route.includes("@chanlytics/db") && !route.includes("SUPABASE_SERVICE_ROLE_KEY"), "the route holds no key");
  const server = readCode("apps/dashboard/src/server/signup.ts");
  assert.ok(server.includes('import "server-only";'));
  // THE SERVICE ROLE HAS LEFT THIS PATH. It used to create the user with the
  // admin API and mark the address confirmed with no proof at all, because
  // confirmation was off and nothing else would send one. With confirmation on,
  // the ordinary sign-up call does the whole job on the PUBLIC key: no session
  // for an unproved address, an obfuscated answer for an address we already
  // have, and the code sent as part of it.
  assert.ok(!server.includes("admin.createUser") && !server.includes("email_confirm"), "REGRESSION: an address marked proved by the thing that has not proved it");
  assert.ok(server.includes("await anon.auth.signUp({"), "the ordinary sign-up call, on the public key");
  assert.ok(server.includes("options: { data: { [PENDING_WORKSPACE_KEY]: { name: input.name, timezone: input.timezone ?? null } } },"), "what the form said rides on the user, for the create screen to open with");
  assert.ok(!server.includes("create_workspace") && !server.includes("deleteUser") && !server.includes("emitEvent"), "REGRESSION: a workspace, or anything to undo, for an address nobody has proved");
  assert.ok(server.includes("identities?.length ?? 0) > 0"), "an address we already have comes back obfuscated: the empty identities array is the tell, and it is read for the LOG alone");
  // Read from the `route` already in hand rather than a second read of the
  // same file: the ratchet counts source reads per test file, and it is right
  // to — a file that reads more source is a file pinning more text.
  assert.ok(route.includes("if (!isUsablePassword(input.password))"), "the credential is insisted on by the creating path, not by the schema the waitlist also passes through");
  assert.ok(route.indexOf('if (posture === "waitlist")') < route.indexOf("isUsablePassword(input.password)"), "and the queue, which makes no account, is never asked for one");
  assert.ok(!route.includes("notifyPlatformSignup"), "the public route has no workspace to tell anyone about");
  // Every workspace starts in one place, the first one included, and that
  // place tells the mailbox and hands the create screen what sign-up kept.
  const create = readCode("apps/dashboard/app/api/v1/workspaces/create/route.ts");
  assert.ok(create.includes('await notifyPlatformSignup(data.id, ctx.email ?? "");'), "the mailbox hears about a workspace where workspaces are made");
  const list = readCode("apps/dashboard/app/api/v1/workspaces/route.ts");
  assert.ok(list.includes("pending: pendingWorkspaceOf(ctx.metadata)"), "nowhere yet comes with what sign-up kept");
  const sql = readRaw("supabase/migrations/00072_signup.sql");
  assert.ok(sql.includes("revoke execute on function public.create_workspace_for(uuid, text, text) from public, anon, authenticated;"), "service role alone may name an owner");
  assert.ok(sql.includes("from public.create_workspace_for(auth.uid(), p_name, p_timezone) w"), "the signed-in wrapper delegates");
  const record = readRaw("supabase/migrations/00104_a_workspace_is_recorded_where_it_is_made.sql");
  assert.ok(record.includes("after insert on public.tenants") && record.includes("'workspace.created'") && record.includes("jsonb_build_object('by', auth.uid()"), "every workspace is recorded where it is made, naming the session when there was one");
  const login = readCode("apps/dashboard/app/login/page.tsx");
  // Sign-in no longer opens at a code step handed to it by sign-up; it carries
  // the address across so nobody types it twice, keeps the code door for every
  // account that has no password, and still points at sign-up.
  assert.ok(login.includes('href="/signup"') && login.includes("signInWithPassword({ email: email.trim(), password })"), "a password door, pointing at sign-up");
  assert.ok(login.includes("shouldCreateUser: false"), "REGRESSION: the code door must never mint an account");
  assert.ok(login.includes('href={`/reset-password'), "and a way out for somebody who has forgotten it");
  const page = readCode("apps/dashboard/app/signup/page.tsx");
  // The server says which of the three doors this is; the field belongs to
  // exactly one of them.
  assert.ok(page.includes('fetch("/api/v1/signup", { method: "GET"') && page.includes('{posture === "invite" && ('), "the code field appears only when the server asks for it");
});

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
  assert.match(SIGNUP_WORDS.notSent, /could not send/);
  assert.match(SIGNUP_WORDS.notSent, /nothing is lost/);
  assert.doesNotMatch(SIGNUP_WORDS.notSent, /workspace is made/, "REGRESSION: a workspace claimed before its owner has signed in");
  assert.doesNotMatch(SIGNUP_WORDS.notSent, /registered|exists|unknown|not found/i,
    "REGRESSION: a refusal that says whether we know the address");

  // And the opaque sentence is untouched: it still speaks conditionally.
  assert.match(SIGNUP_WORDS.sent("o@example.com"), /^If o@example\.com can receive email/);
});

test("what sign-up kept is a prefill, and a clock Postgres would refuse is dropped rather than failing the first Create", () => {
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Glow Studio", timezone: "America/New_York" } }), { name: "Glow Studio", timezone: "America/New_York" });
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Glow Studio", timezone: "Mars/Olympus" } }), { name: "Glow Studio", timezone: null });
  assert.equal(pendingWorkspaceOf({ pending_workspace: { name: "G" } }), null, "a name below the minimum is not worth showing");
  assert.equal(pendingWorkspaceOf(null), null);
  assert.equal(SIGNUP_WORDS.notSentTitle, "We could not send your code", "the page's heading when the code did not go out says so, not that a workspace exists");
});
