/**
 * Sign in with Google, the pure parts: where the provider sends the browser
 * back, what the callback exchanges and where it lands, and the door a first
 * workspace meets afterwards. Run, not read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { firstWorkspaceDoor, googleCallbackUrl, providerNameOf, SIGNUP_WORDS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { callbackPlan, landingAfter, safeNext, OAUTH_FAILED } = await import(
  at("apps/dashboard/src/server/auth/oauth-callback.ts")
);

test("the callback exchanges a code and lands on this site only", () => {
  assert.deepEqual(callbackPlan({ code: "abc", next: "/#/inbox", error: null }), {
    exchange: "abc",
    to: "/#/inbox",
    refused: null,
  });
  assert.deepEqual(callbackPlan({ code: "abc", next: null, error: null }), { exchange: "abc", to: "/", refused: null });
  // Nothing to exchange is a sign-in to start, not an error page; the
  // provider's own refusal says so once.
  assert.deepEqual(callbackPlan({ code: null, next: "/x", error: null }), {
    exchange: null,
    to: "/login",
    refused: null,
  });
  assert.deepEqual(callbackPlan({ code: null, next: null, error: "access_denied" }), {
    exchange: null,
    to: OAUTH_FAILED,
    refused: { error: "access_denied", code: null, description: null },
  });
  const beside = callbackPlan({ code: "abc", next: null, error: "server_error" });
  assert.equal(beside.exchange, null, "a code beside an error is not exchanged");
  assert.equal(beside.to, OAUTH_FAILED);
  assert.equal(OAUTH_FAILED, "/login?error=oauth");
});

test("a refusal keeps its reason for the log: the code and the description, clipped to one line", () => {
  // The three fields Supabase sends. The last two are the only place the
  // reason is said -- a wrong client secret reads exactly like this -- and the
  // callback used to read `error` alone.
  const said = callbackPlan({
    code: null,
    next: "/",
    error: "server_error",
    errorCode: "unexpected_failure",
    errorDescription: "Unable to exchange external code: 4/0AbC",
  });
  assert.deepEqual(said.refused, {
    error: "server_error",
    code: "unexpected_failure",
    description: "Unable to exchange external code: 4/0AbC",
  });
  assert.equal(said.to, OAUTH_FAILED, "the page still hears one neutral sentence");
  // A query string is written by whoever builds the link: one line, 200 characters.
  const long = callbackPlan({
    code: null,
    next: null,
    error: "x",
    errorCode: "  ",
    errorDescription: `a\r\nb${"c".repeat(400)}`,
  });
  assert.equal(long.refused.code, null, "blank is absent");
  assert.equal(long.refused.description.length, 200);
  assert.ok(!/[\r\n]/.test(long.refused.description));
  // No refusal, nothing to log.
  assert.equal(
    callbackPlan({ code: "abc", next: "/", error: null, errorCode: "ignored", errorDescription: "ignored" }).refused,
    null,
  );
});

test("`next` is a path on this site, or the root", () => {
  for (const ok of ["/", "/#/inbox", "/w/marisas#/people", "/settings?tab=team"]) assert.equal(safeNext(ok), ok, ok);
  for (const bad of [
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "",
    null,
    undefined,
    "/x\r\nSet-Cookie: a=b",
    "inbox",
    // A tab is dropped by URL parsing, so this resolves to https://evil.example/; a backslash reads as a slash.
    "/\t/evil.example",
    "/a\\evil.example",
    "/x\u0000y",
    "/\u007f",
  ]) {
    assert.equal(safeNext(bad), "/", JSON.stringify(bad));
  }
});

test("the page sends Google back to the callback, with where to land encoded", () => {
  assert.equal(
    googleCallbackUrl("https://app.chanlytics.com", "/#/inbox"),
    "https://app.chanlytics.com/auth/callback?next=%2F%23%2Finbox",
  );
  assert.equal(googleCallbackUrl("http://localhost:3000", ""), "http://localhost:3000/auth/callback?next=%2F");
});

test("the first workspace's door: the posture, for an account with no membership yet", () => {
  assert.deepEqual(firstWorkspaceDoor({ posture: "open", memberships: 0, codeMatches: false }), { open: true });
  assert.deepEqual(firstWorkspaceDoor({ posture: "waitlist", memberships: 0, codeMatches: true }), {
    open: false,
    code: "forbidden",
    message: SIGNUP_WORDS.waitlistLead,
  });
  assert.deepEqual(firstWorkspaceDoor({ posture: "invite", memberships: 0, codeMatches: false }), {
    open: false,
    code: "forbidden",
    message: SIGNUP_WORDS.codeWrong,
  });
  assert.deepEqual(firstWorkspaceDoor({ posture: "invite", memberships: 0, codeMatches: true }), { open: true });
  // Already inside, by an invitation or a first workspace: no door, whatever the posture.
  for (const posture of ["open", "waitlist", "invite"])
    assert.deepEqual(firstWorkspaceDoor({ posture, memberships: 1, codeMatches: false }), { open: true }, posture);
});

test("the name a provider gave stands in, trimmed to what a profile holds, and never comes from an email", () => {
  assert.equal(providerNameOf({ full_name: "  Ada   Lovelace ", name: "Ada" }), "Ada Lovelace");
  assert.equal(providerNameOf({ name: "Ada" }), "Ada");
  assert.equal(providerNameOf({ full_name: "x".repeat(200) }).length, 80);
  for (const none of [
    null,
    undefined,
    "Ada",
    {},
    { email: "hi@chanlytics.agency" },
    { full_name: "   " },
    { full_name: 7 },
  ])
    assert.equal(providerNameOf(none), null, JSON.stringify(none));
});

test("the landing is a RELATIVE redirect, so no header can choose the host it lands on", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-only";
  // safeNext() guarantees `to` is a path on this site -- and the route used to
  // undo that by resolving it against `https://${x-forwarded-host}`, a header
  // the requester writes. A freshly signed-in browser could be sent anywhere.
  const { GET } = await import(at("apps/dashboard/app/auth/callback/route.ts"));
  // No code to exchange, so nothing reaches Supabase and the route is just the
  // landing. The header is the hostile part: it used to become the redirect's
  // origin, so a signed-in browser could be sent to whatever host the request
  // named.
  const res = await GET(
    new Request("http://internal.vercel/auth/callback?error=access_denied", {
      headers: { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
    }),
  );
  assert.equal(res.status, 307);
  assert.equal(
    res.headers.get("location"),
    OAUTH_FAILED,
    "a path on this site, resolved by the browser against the address it asked for",
  );
  assert.ok(!(res.headers.get("location") ?? "").includes("evil.example"), "no header chooses the host");
  assert.equal(
    res.headers.get("cache-control"),
    "private, no-store",
    "a redirect that depends on a cookie is never cacheable",
  );
  const noCode = await GET(
    new Request("http://internal.vercel/auth/callback", { headers: { "x-forwarded-host": "evil.example" } }),
  );
  assert.equal(noCode.headers.get("location"), "/login");
  const { printableOrigin, canonicalOrigin } = await import(at("apps/dashboard/src/server/origin.ts"));
  const CANONICAL_ORIGIN = canonicalOrigin();
  assert.equal(
    printableOrigin("https", "evil.example"),
    CANONICAL_ORIGIN,
    "a host we do not answer on is not printed as ours",
  );
  assert.equal(
    printableOrigin("https", "app.chanlytics.com.evil.example"),
    CANONICAL_ORIGIN,
    "nor one that merely starts with ours",
  );
  assert.equal(printableOrigin("https", "APP.CHANLYTICS.COM"), CANONICAL_ORIGIN);
  assert.equal(printableOrigin(null, null), CANONICAL_ORIGIN);
  assert.equal(
    printableOrigin("http", "localhost:3000"),
    "http://localhost:3000",
    "development still prints where it runs",
  );
});

test("the words on the two doors", () => {
  assert.equal(SIGNUP_WORDS.google, "Continue with Google");
  assert.match(SIGNUP_WORDS.googleFailed, /use your email/);
  assert.match(SIGNUP_WORDS.firstWorkspaceCode, /invite code/);
});

test("an account with an authenticator shows its code before it lands anywhere; Google is never the second factor (0013)", () => {
  assert.equal(landingAfter("/#/inbox", { currentLevel: "aal1", nextLevel: "aal2" }), "/verify");
  assert.equal(landingAfter("/#/inbox", { currentLevel: "aal1", nextLevel: "aal1" }), "/#/inbox", "no factor");
  assert.equal(landingAfter("/#/inbox", { currentLevel: "aal2", nextLevel: "aal2" }), "/#/inbox", "shown");
  assert.equal(landingAfter("/#/inbox", null), "/#/inbox", "unread lands as planned; the partner door asks again");
});
