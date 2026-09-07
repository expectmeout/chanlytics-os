/**
 * Sign-up: the schema and the words executed; the wiring pinned — the two
 * public paths, the guards on the one public route, the service-role
 * boundary, the migration's grants, the platform notice, the way back to
 * sign-in at the code step.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignupSchema, SIGNUP_WORDS, signupNext, deviceTimezone, EVENT_KINDS } from "@chanlytics/contracts";
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
  assert.ok(page.includes('fetch("/api/v1/signup", { method: "GET"') && page.includes("codeRequired &&"), "the code field appears only when the server asks for it");
});
