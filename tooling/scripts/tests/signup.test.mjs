/**
 * Sign-up: the schema and the words executed; the wiring pinned — the two
 * public paths, the guards on the one public route, the service-role
 * boundary, the migration's grants, the platform notice, the way back to
 * sign-in at the code step.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignupSchema, SIGNUP_WORDS, signupNext, deviceTimezone, sendFailureIsOurs, EVENT_KINDS } from "@chanlytics/contracts";
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

test("the words and the way back: one neutral sentence, sign-in at the code step for the address", () => {
  assert.equal(SIGNUP_WORDS.sent("o@example.com"), "If o@example.com can receive email, a 6-digit code is on its way. Enter it on the next screen to open your workspace.");
  assert.equal(signupNext(" Owner@Example.com "), "/login?email=owner%40example.com&sent=1");
  assert.equal(deviceTimezone(() => "America/New_York"), "America/New_York");
  assert.equal(deviceTimezone(() => { throw new Error("no Intl"); }), undefined);
  assert.equal(deviceTimezone(() => "x".repeat(65)), undefined);
  assert.ok(EVENT_KINDS.includes("workspace.created"));
});

test("the wiring: two public paths, the guards on the route, the service role in one server module, the migration's grants", () => {
  const middleware = readCode("apps/dashboard/middleware.ts");
  assert.ok(middleware.includes('"/signup"') && middleware.includes('"/api/v1/signup"'), "public by a deliberate edit to PUBLIC_PATHS");
  const route = readCode("apps/dashboard/app/api/v1/signup/route.ts");
  assert.ok(!route.includes("withRoute"), "no session to verify: the route does not go through withRoute");
  assert.ok(route.includes("if (!isSameOrigin(req)) throw new AppError(\"forbidden\", SIGNUP_WORDS.crossSite);"), "same-origin, like every mutating route");
  assert.ok(route.includes('await takeRate(`ip:${hash(ipOf(req))}`, "signup_ip");') && route.includes('await takeRate(`email:${hash(input.email)}`, "signup_email");'), "a bucket per network and per address");
  assert.ok(route.includes("timingSafeEqual(a, b)") && route.includes("process.env.SIGNUP_CODE"), "the invite code compared in constant time");
  assert.ok(!route.includes("@chanlytics/db") && !route.includes("SUPABASE_SERVICE_ROLE_KEY"), "the route holds no key");
  const server = readCode("apps/dashboard/src/server/signup.ts");
  assert.ok(server.includes('import "server-only";'));
  assert.ok(server.includes("db.auth.admin.createUser({ email: input.email, email_confirm: true })"), "the user is made confirmed; the code is the proof of the inbox");
  assert.ok(server.includes('db.rpc("create_workspace_for"') && server.includes("await db.auth.admin.deleteUser(userId).catch(() => {});"), "a user without a workspace is undone");
  assert.ok(server.includes("options: { shouldCreateUser: false }"), "the code goes out the way /login sends it");
  assert.ok(server.includes('"workspace.created", "signup", "tenant"'));
  const rate = readCode("apps/dashboard/src/server/rate-limit.ts");
  assert.ok(rate.includes("signup_ip: {") && rate.includes("signup_email: {"));
  assert.ok(readRaw("apps/dashboard/.env.example").includes("SIGNUP_CODE="));
  const sql = readRaw("supabase/migrations/00072_signup.sql");
  assert.ok(sql.includes("revoke execute on function public.create_workspace_for(uuid, text, text) from public, anon, authenticated;"), "service role alone may name an owner");
  assert.ok(sql.includes("from public.create_workspace_for(auth.uid(), p_name, p_timezone) w"), "the signed-in wrapper delegates");
  assert.ok(sql.includes("if v_owned >= 10 then") && sql.includes("pg_timezone_names z where z.name = v_tz"), "the cap and the zone check moved with the body");
  const notice = readCode("apps/edge/api/admin/signup-notify.ts");
  assert.ok(notice.includes('request.headers.get("x-diag-key") !== process.env.DIAG_KEY') && notice.includes('error: "no_platform_mailbox"'));
  const login = readCode("apps/dashboard/app/login/page.tsx");
  assert.ok(login.includes('q.get("sent") === "1"') && login.includes('href="/signup"'), "sign-in opens at the code step after sign-up, and points at sign-up");
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

  // The sentence the person reads says three things: the workspace exists, the
  // code did not go out, and nothing is lost. It must NOT hint at the address.
  assert.match(SIGNUP_WORDS.notSent, /workspace is made/);
  assert.match(SIGNUP_WORDS.notSent, /could not send/);
  assert.match(SIGNUP_WORDS.notSent, /nothing is lost/);
  assert.doesNotMatch(SIGNUP_WORDS.notSent, /registered|exists|unknown|not found/i,
    "REGRESSION: a refusal that says whether we know the address");

  // And the opaque sentence is untouched: it still speaks conditionally.
  assert.match(SIGNUP_WORDS.sent("o@example.com"), /^If o@example\.com can receive email/);
});

