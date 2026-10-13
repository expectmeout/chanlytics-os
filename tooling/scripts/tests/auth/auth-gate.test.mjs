/**
 * The auth gate, made load-bearing.
 *
 * Auth is the one system where a regression is silent: nothing renders wrong,
 * no request fails, and the only symptom is that someone who should not be
 * inside is inside. Every assertion here corresponds to a specific way this
 * app could quietly stop being closed —
 *
 *   1. a new route under /auth shipping public because the gate matched a PREFIX
 *   2. a new /api/v1 route shipping without the wrapper that verifies the user
 *   3. a workspace's address escaping the proxy. The (os) layout checked the session too, as a guarantee should the
 *      proxy be bypassed (a recurring Next.js CVE class), until the frame became one prerender for every person
 *      (decision 0053, step 5): what it guarded was a spinner with no one's data in it, and every read verifies the
 *      session itself (2, below). The proxy is the page gate now, and it is held by running it
 *      ("the gate, run", below: every address and ending, signed out, forged, or with the auth server down), and the
 *      frame by the lint, which refuses it the session, a header and the database (lint-boundaries.test.mjs).
 *   4. getSession() replacing the verified check, which trusts an unverified cookie.
 *      The check is getClaims() (25 Sep 2026): the token's SIGNATURE verified, locally over
 *      the project's public signing key where it signs asymmetrically, over the Auth server
 *      where it still signs with the shared secret -- as getUser() always did, and paid a
 *      round trip for on every request, twice.
 *   5. the login form going back to confirming which emails have accounts
 *   6. the sign-out CSRF check going back to being skippable by omitting a header
 *   7. the hosted auth settings drifting back to their unsafe defaults
 *
 * Most are text assertions against source, not behavioural tests, because the
 * failure they guard is "someone edits this file and no one notices" — the edit
 * IS the bug, and the text is where it lands. The proxy itself is RUN, at the
 * end ("the gate, run"), since it is the page gate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { importSrc, readCode, readRaw } from "../_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../../..");
const DASH = path.join(ROOT, "apps/dashboard");

// Comment-stripping and LF-normalised reads are shared: see _source.mjs for
// why every code-scanning assertion needs both.
const read = (p) => readCode(p);

const middleware = read("apps/dashboard/proxy.ts");
const signout = read("apps/dashboard/app/auth/signout/route.ts");
const login = read("apps/dashboard/app/login/page.tsx");
const withRoute = read("apps/dashboard/src/server/with-route.ts");
const nextConfig = read("apps/dashboard/next.config.ts");
/**
 * TOML comments are `#`, and the JS stripper would misread an apostrophe in
 * prose ("the attacker's page") as opening a string literal and swallow real
 * settings after it. Strip per line, honouring quotes within that line.
 */
function stripTomlComments(src) {
  return src
    .split("\n")
    .map((line) => {
      let quote = null;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === "#") {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}
const supabaseConfig = stripTomlComments(readRaw("supabase/config.toml"));

/* ------------------------------------------------------------------ 1 + 4 -- */

test("the public path list is exact, never a prefix", () => {
  // startsWith("/auth") made every future /auth/* route public on creation.
  assert.ok(
    !/startsWith\(\s*["']\/auth/.test(middleware),
    "middleware matches /auth by PREFIX — a new route under /auth would ship unauthenticated",
  );
  assert.match(middleware, /PUBLIC_PATHS\.has\(path\)/, "the gate must test exact membership");
});

test("one address: the deploy alias redirects, and a preview never does", () => {
  // Cookies are per-origin, and Google's callback is registered against one
  // host — so a person who started on the alias came back to a host they had
  // no session on, and Connect Google simply failed.
  assert.match(middleware, /const canonical = env\.CANONICAL_HOST;/);
  assert.match(
    middleware,
    /if \(!canonical \|\| !isProduction\(\)\) return null;/,
    "a preview is also a vercel.app host and must answer as itself",
  );
  assert.match(middleware, /!host\.endsWith\("\.vercel\.app"\)/, "only the alias is moved, never a custom domain");
  assert.match(
    middleware,
    /NextResponse\.redirect\(url, 308\)/,
    "permanent, so it is cached and so search engines follow it",
  );
  // Except the unsubscribe link, which RFC 8058 says a mail client presses with no redirect in its answer.
  const spared = middleware.indexOf('if (request.nextUrl.pathname.startsWith("/u/")) return null;');
  assert.ok(
    spared > 0 && spared < middleware.indexOf("NextResponse.redirect(url, 308)"),
    "the unsubscribe link is answered where it is pressed, before the alias would move it",
  );
  const before = middleware.indexOf("const moved = canonicalRedirect(request);");
  assert.ok(
    before > 0 && before < middleware.indexOf("PUBLIC_PATHS.has(path)"),
    "before the auth gate: the redirect is not a place to leak whether a path exists",
  );
});

test("the one public door under /api/ask is the voice agent's brain door, at its three exact paths, and nothing else of Ask is public", () => {
  // The ElevenLabs agent calls the dashboard for a voice conversation's words (docs/decisions/0026): a provider with
  // no cookie, so the gate cannot stand in front of it. It was let in on these terms: the door proves the caller
  // twice before it reads a byte of the body (the agent's static secret, compared in constant time, then a session
  // row the member wrote), it runs the turn as that member under RLS with the token the row keeps sealed, and the
  // paths are exact, since the vendor appends /chat/completions to the address it is given.
  const block = /PUBLIC_PATHS\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(middleware);
  assert.ok(block, "PUBLIC_PATHS must be a literal set so this test can read it");
  const paths = [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(
    paths.filter((p) => p.startsWith("/api/ask")),
    ["/api/ask/voice/llm", "/api/ask/voice/llm/chat/completions", "/api/ask/voice/llm/v1/chat/completions"],
  );
  assert.ok(!paths.some((p) => p.startsWith("/api/v1/ask")), "every member route of Ask stays behind the gate");
});

test("five public PREFIXES, and only a workspace's own pages, the unsubscribe link and a partner's link live under them", () => {
  const block = /PUBLIC_PREFIXES\s*=\s*\[([^\]]*)\]/.exec(middleware);
  assert.ok(block, "PUBLIC_PREFIXES must be a literal array so this test can read it");
  const prefixes = [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  // Pinned BY VALUE like the paths above: a prefix opens EVERY path beneath it,
  // so widening this is a deliberate edit HERE, reviewed, and never a side
  // effect of adding a route.
  //
  // `/b/` was added when a workspace's own page shipped, and it had to be: the
  // page is filed with the carriers as a campaign's website and privacy policy,
  // so its reader is often a REVIEWER — and a reviewer who gets a login screen
  // has been shown a business that cannot be looked up, which is error 30919
  // with extra steps. Caught on production, where the page 307'd to /login.
  //
  // `/.well-known/` joined with the phone app: a phone's OS fetches the app-links
  // files with no session before it lets a link open the app, and the one route
  // under the prefix answers a store's file or 404, nothing else (app-links.ts).
  //
  // `/u/` joined with Reach out (Part 2): the unsubscribe link every campaign
  // email carries, which RFC 8058 says a mail client presses with a POST and no
  // session, and which the law says must work without one (CAN-SPAM). It is the
  // one public route that takes input, and it was let in on these terms: its
  // only write is the person's own stop, through a service-role door that can
  // only narrow what may be sent (00174 set_email_marketing); the token is the
  // authority, sealed under a key only we hold, so nothing is asked of the
  // database for a link we did not make; and a GET changes nothing, because
  // link scanners open every URL in an email (unsubscribe-door.test.mjs).
  //
  // `/p/` joined with partners (decision 0012): a partner's link, which the
  // reader opens before they have an account. It reads nothing and writes one
  // cookie naming a code; who is credited is decided later, by create_workspace,
  // so the link is not a door that can be probed (partner.test.mjs).
  assert.deepEqual(prefixes, ["/yes/", "/b/", "/.well-known/", "/u/", "/p/"]);
  assert.match(middleware, /PUBLIC_PREFIXES\.some\(\(p\) => path\.startsWith\(p\)\)/);
  //
  // `/yes/<slug>/form` joined the opt-in page when a yes to offers had to be
  // WRITTEN (00100): the filing names the printable form as one way to give it,
  // and a reviewer who gets a login screen instead of the form has been shown a
  // consent method nobody can check. It is a page like its neighbour -- printed
  // and signed by hand, it takes no input.
  //
  // `/yes/<slug>/sign` joined when the offers code needed somewhere to be
  // printed with the words a customer reads before scanning it: a page like its
  // neighbours, read by slug, showing nothing the opt-in page does not, and
  // taking no input. Its markup lives in src/yes, not beside it, so this folder
  // still holds pages and nothing else.
  for (const [dir, what, beneath] of [
    ["yes", "the opt-in page, its paper form and its desk sign", ["form", "page.tsx", "sign"]],
    ["b", "the workspace's own page and its texting terms", ["page.tsx", "terms"]],
  ]) {
    const at = path.join(ROOT, "apps/dashboard/app", dir);
    assert.deepEqual(fs.readdirSync(at), ["[slug]"], `nothing but ${what} may live under its public prefix`);
    assert.deepEqual(
      fs.readdirSync(path.join(at, "[slug]")).sort(),
      beneath,
      `and ${what} are pages, not routes that take input`,
    );
  }
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, "apps/dashboard/app/yes/[slug]/form")),
    ["page.tsx"],
    "the paper form is a page, not a route that takes input",
  );
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, "apps/dashboard/app/yes/[slug]/sign")),
    ["page.tsx"],
    "the desk sign is a page, not a route that takes input",
  );
  // `/b/<slug>/terms` joined when the campaign's terms URL became the business's
  // own: the reviewers' guide lists eight things a program's terms must carry,
  // and Chanlytics' /terms -- a software agreement for workspace owners --
  // carries none of them. A page like its neighbour: read by slug, no input.
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, "apps/dashboard/app/b/[slug]/terms")),
    ["page.tsx"],
    "the terms are a page, not a route that takes input",
  );
  // Under /u/, one route and nothing else: the link's own door. A second file
  // here would be a second public way in, and it takes a new argument above.
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "apps/dashboard/app/u")), ["[token]"]);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "apps/dashboard/app/u/[token]")), ["route.ts"]);
});

test("only these sixteen paths are reachable without a session", () => {
  const block = /PUBLIC_PATHS\s*=\s*new Set\(\[([^\]]*)\]/.exec(middleware);
  assert.ok(block, "PUBLIC_PATHS must be a literal Set so this test can read it");
  const paths = [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]).sort();
  // Pinned BY VALUE: widening the product's unauthenticated surface is a
  // deliberate edit here, reviewed, not a side effect of adding a file.
  // The manifest joined in the phone-shell slice: a phone's installer fetches
  // it without credentials, and it names the product and its icons, nothing else.
  // Sign-up joined in the accounts slice: the page and its route, the one door a stranger may use.
  // Privacy and terms joined in the connections slice: the two pages every platform review links to; static, and they read nothing.
  // Deleting your data joined with them: Meta's app settings, Google's consent
  // screen and the app stores each ask for a URL whose whole subject is
  // deletion, and pointing that field at a policy's midpoint is how it ends up
  // pointing at facebook.com instead.
  // The sign-in callback joined with Sign in with Google: a provider sends the
  // browser back with a code and no session, which is the point. Exact path.
  // Resetting a password joined with the password itself: nobody who has
  // forgotten one has a session to show. Its second half VERIFIES a recovery
  // code, which is what creates the session the new password is written on —
  // so it is also deliberately absent from the signed-in redirect below, where
  // bouncing a signed-in person would break the page's own second step.
  // The filler calendar joined with the filler: a workspace that carries the
  // filler's people points its calendar address at this feed, and the calendar
  // reader fetches it from the server with no session, the way it fetches any
  // feed. It is generated from the clock, names nobody real, and reads nothing.
  // The native app's door joined with the phone app: the app posts an identity
  // token from Apple or Google and has no session yet, exactly as the callback
  // has none. Exact path; it answers only a redirect.
  // The voice agent's brain door joined with Ask, spoken (0026): ElevenLabs
  // calls it for a conversation's words, with no cookie; the door proves the
  // caller twice before it reads the body (the test above). Three exact paths,
  // since the vendor appends /chat/completions to the address it is given.
  assert.deepEqual(paths, [
    "/api/ask/voice/llm",
    "/api/ask/voice/llm/chat/completions",
    "/api/ask/voice/llm/v1/chat/completions",
    "/api/v1/calendar/filler.ics",
    "/api/v1/signup",
    "/api/version",
    "/auth/callback",
    "/auth/native",
    "/auth/signout",
    "/data-deletion",
    "/login",
    "/manifest.webmanifest",
    "/privacy",
    "/reset-password",
    "/signup",
    "/terms",
  ]);
  assert.match(
    middleware,
    /path === "\/login" \|\| path === "\/signup"/,
    "and the two doors a signed-in person is sent away from stay those two",
  );
});

test("the three legal pages are static, read nothing, and point at each other", () => {
  const pages = { privacy: "privacy", terms: "terms", deletion: "data-deletion" };
  for (const [name, dir] of Object.entries(pages)) {
    const src = readRaw(`apps/dashboard/app/${dir}/page.tsx`);
    // A page a stranger may open must not reach for a session, a database or
    // the network: it is served to whoever asks, including a reviewer.
    for (const forbidden of ["createClient", "supabase", "fetch(", "cookies()", "headers()", "use client"]) {
      assert.ok(!src.includes(forbidden), `${name} must not use ${forbidden}`);
    }
    assert.ok(src.includes("robots: { index: true }"), `${name} must be indexable — a review checks it is reachable`);
  }
  // A dead end is how the deletion URL gets pasted as facebook.com: the pages
  // carry each other, so whichever one a reviewer lands on leads to the rest.
  const privacy = readRaw("apps/dashboard/app/privacy/page.tsx");
  assert.ok(privacy.includes('href="/data-deletion"'), "the policy names the deletion page");
  const deletion = readRaw("apps/dashboard/app/data-deletion/page.tsx");
  assert.ok(
    deletion.includes('href="/privacy"') && deletion.includes('href="/terms"'),
    "the deletion page names the other two",
  );
  // The one promise a reviewer reads it for, and the one an end customer needs.
  assert.ok(/within 30 days/.test(deletion), "it says how long deletion takes");
  assert.ok(deletion.includes("<b>STOP</b>"), "and how to stop messages without deleting anything");
});

test("the session is VERIFIED, never read from the cookie", () => {
  // getSession() decodes the cookie without checking its signature — a forged session passes. getClaims() verifies
  // the signature (locally over the public key, or over the Auth server), and getUser() asks the Auth server; either
  // is a verification, and the gate takes the one that costs no round trip.
  for (const [name, src] of [
    ["middleware", middleware],
    ["withRoute", withRoute],
  ]) {
    assert.ok(!/getSession\(/.test(src), `${name} must not use getSession()`);
    assert.match(src, /getClaims\(/, `${name} must verify with getClaims()`);
  }
});

test("the proxy passes a bearer request to the route wrapper only under /api/v1 and only with the header", () => {
  // Decision 0011: a native screen's call carries the session's access token as a bearer and no cookie. The proxy
  // reads the cookie only, so it lets such a request through to withRoute, which verifies the token. The bypass
  // must name the API prefix and the header's scheme, and nothing else may widen it.
  assert.match(
    middleware,
    /path\.startsWith\("\/api\/v1\/"\)\s*&&\s*\/\^Bearer\\s\+\\S\+\/i\.test\(request\.headers\.get\("authorization"\)/,
    "the bypass is the /api/v1/ prefix AND a Bearer authorization header",
  );
  assert.match(withRoute, /verifyBearer\(bearer\)/, "and the wrapper verifies the bearer itself");
  assert.match(withRoute, /!bearer && req\.method !== "GET"/, "the same-origin rule stays the cookie's");
});

/* ---------------------------------------------------------------------- 2 -- */

test("every /api/v1 route verifies the user itself", () => {
  const dir = path.join(DASH, "app/api/v1");
  const routes = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.ts") routes.push(full);
    }
  })(dir);

  assert.ok(routes.length >= 20, `expected the v1 surface, found ${routes.length} routes`);
  // route()'s read() and write() are withRoute underneath: a route declared
  // through them verifies the user exactly as a bare withRoute does.
  const raw = routes.filter((f) => {
    const src = fs.readFileSync(f, "utf8");
    return !src.includes("withRoute") && !src.includes('from "@/server/route"');
  });
  assert.deepEqual(
    raw.map((f) => path.relative(DASH, f)),
    [],
    "these routes bypass withRoute, so they depend on middleware alone for auth",
  );
});

/* ---------------------------------------------------------------------- 5 -- */

test("the login form does not reveal which emails have accounts", () => {
  assert.ok(
    !/isn't on a Chanlytics workspace/i.test(login),
    "this copy told an anonymous caller whether an address has an account",
  );
  // The tell is structural: the code-request step must reach the code stage on
  // the error path too, so "no such account" and "code sent" look identical.
  assert.match(
    login,
    /requestCodeWords\(error\)/,
    "the request step must route errors through the non-revealing translator",
  );
  assert.match(
    login,
    /if\s*\(shown\)\s*\{\s*setError\(shown\);\s*return;/,
    "only an actionable error may stop the form advancing to the code stage",
  );
});

/* ---------------------------------------------------------------------- 6 -- */

test("same-origin evidence must be POSITIVE, and every mutation demands it", () => {
  // The rule moved out of the sign-out route into a shared guard once every
  // mutating /api/v1 route needed it too. The invariants are unchanged and now
  // cover twenty-two more endpoints; they are asserted where the code lives.
  const guards = read("apps/dashboard/src/server/request-guards.ts");
  // The old check read `if (origin && host && ...)`: omitting Origin skipped it.
  assert.ok(
    !/if\s*\(\s*origin\s*&&\s*host\s*&&/.test(guards),
    "a request that omits Origin must be REJECTED, not exempted",
  );
  assert.match(guards, /sec-fetch-site/, "Fetch Metadata is the primary signal");
  assert.ok(
    !/["']same-site["']/.test(guards),
    "same-site is not same-origin: on vercel.app a sibling subdomain is someone else's app",
  );

  // Both callers still make the check, and there is only one implementation.
  assert.match(signout, /isSameOrigin\(request\)/);
  assert.match(signout, /status:\s*403/);
  assert.ok(!/function isSameOrigin/.test(signout), "one implementation, imported — not a second copy that can drift");

  const wrapper = read("apps/dashboard/src/server/with-route.ts");
  assert.match(wrapper, /isSameOrigin\(req\)/, "every mutating route inherits it");
  // Reads stay exempt: a GET changes nothing, and cross-site GETs are how link
  // previews and prefetches legitimately arrive.
  assert.match(wrapper, /req\.method !== "GET"/);
});

/* ---------------------------------------------------------------------- 7 -- */

/** Value of `key` inside the [section] table of config.toml. */
function toml(section, key) {
  const body = supabaseConfig.split(`\n[${section}]\n`)[1];
  assert.ok(body !== undefined, `[${section}] missing from config.toml`);
  const m = new RegExp(`^${key}\\s*=\\s*(.+)$`, "m").exec(body.split("\n[")[0]);
  return m ? m[1].trim() : undefined;
}

test("the hosted project lets a provider make the user; the door is the first workspace", () => {
  // Sign in with Google makes the auth user before anything of ours runs, so
  // signups are allowed at the server -- and the posture is asked where every
  // first workspace is made instead (account-routes.test: the door). An account
  // with no workspace can reach nothing else.
  assert.equal(toml("auth", "enable_signup"), "true");
  assert.equal(toml("auth", "enable_anonymous_sign_ins"), "false");
});

test("the email provider stays ENABLED — this key does not mean what it says", () => {
  // Setting this false does not mean "no new signups by email". It disables the
  // email provider outright: every existing operator gets 422
  // email_provider_disabled and nobody can sign in. That was a live outage.
  // Invite-only is [auth] enable_signup above; this must stay true.
  assert.equal(toml("auth.email", "enable_signup"), "true");
});

test("an address is CONFIRMED, in both of the two places that decide it", () => {
  // THE HINGE OF THE PASSWORD FLOW. With a password and no confirmation,
  // signUp() hands back a live session immediately: a stranger who types
  // someone else's address is signed in as them, and the real owner can never
  // sign up because the address is taken.
  assert.equal(toml("auth.email", "enable_confirmations"), "true");
  // Phone confirmation is the OTHER half of hiding whether an address is known,
  // and it is deliberately not used: the dashboard only offers it behind a
  // phone provider that demands SMS credentials and switches on phone sign-in.
  // The invariant is kept in code instead (addressAlreadyKnown), which is
  // pinned by signup.test. Nothing here asserts that flag in either direction —
  // turning it on later is pure hardening and must not fail this suite.
  assert.equal(toml("auth.sms", "enable_signup"), "false", "nobody signs up by phone");
});

test("Sign in with Google is on HERE too, because config push is a loaded gun", () => {
  // The hosted project has the provider on; this file said false, so a
  // `supabase config push` would have switched Sign in with Google off in
  // production while pushing something unrelated, and the only symptom would
  // be the button quietly not drawing.
  assert.equal(toml("auth.external.google", "enabled"), "true");
  // Neither half of the credential is in git. The secret being wrong or stale
  // in the dashboard is the one thing that can fail this flow silently, which
  // is why it lives in the environment and not here.
  assert.match(toml("auth.external.google", "client_id"), /^"env\(/, "the client id comes from the environment");
  assert.match(toml("auth.external.google", "secret"), /^"env\(/, "and so does the secret");
});

test("a password has a floor, and the floor is length rather than punctuation", () => {
  assert.equal(toml("auth", "minimum_password_length"), "12");
  // Empty on purpose: composition classes push people toward Passw0rd!. The
  // strength check that earns its keep is the hosted breach list.
  assert.equal(toml("auth", "password_requirements"), '""');
});

test("a 6-digit code is not left guessable for an hour", () => {
  // Supabase rate-limits verification by IP and does not lock a code after N
  // failures, so the code's LIFETIME is the brute-force budget.
  assert.ok(Number(toml("auth.email", "otp_expiry")) <= 600, "otp_expiry must be <= 10 minutes");
  assert.equal(toml("auth.email", "otp_length"), "6");
});

test("the inbox cannot be flooded by calling the API directly", () => {
  // The form's 60s resend cooldown is client state; this is the server's.
  assert.equal(toml("auth.email", "max_frequency"), '"60s"');
});

test("no development origin is trusted by the production project", () => {
  const urls = toml("auth", "additional_redirect_urls") ?? "";
  assert.ok(!/localhost|127\.0\.0\.1/.test(urls), `dev origin still allowlisted: ${urls}`);
});

/* ------------------------------------------------------------- headers ---- */

test("the dashboard cannot be framed", () => {
  // Its signed-in surface has Approve, Send and Take-over buttons; without this
  // an attacker's page can embed it invisibly and harvest those clicks.
  assert.match(nextConfig, /frame-ancestors 'none'/);
  assert.match(nextConfig, /X-Frame-Options["']?\s*,\s*value:\s*["']DENY/);
  assert.match(nextConfig, /X-Content-Type-Options/);
  assert.match(nextConfig, /Referrer-Policy/);
  assert.match(nextConfig, /Permissions-Policy/);
});

test("the sign-in page is never stored in a shared cache", () => {
  assert.match(nextConfig, /source:\s*["']\/login["']/);
  assert.match(nextConfig, /no-store/);
});

/* ------------------------------------------------------------ the gate, run -- */

/**
 * THE GATE, RUN. The OS's page gate is the proxy (decision 0053, step 5).
 *
 * The (os) layout read the session too, as a guarantee should the proxy be bypassed, until the frame became one
 * prerender for every person and workspace. What it guarded is that frame's HTML, a spinner with no one's data in it,
 * which Next's client never asked it for on a move or a prefetch; every read verifies the session itself
 * (with-route.ts). So the proxy is held here by running it, not by reading it:
 *
 *   - every address of a workspace, whatever it ends in and however the router asks for it, signed out, is sent to
 *     sign in, and the answer is never stored;
 *   - a session whose token is signed by a key the project does not hold is no session, and one it does hold passes;
 *   - an auth server that cannot be reached is "try again", never "signed out";
 *   - Next's own matcher says the proxy runs for every one of those addresses, and not for the build's own files;
 *   - next.config's headers keep a workspace's documents out of every cache, and leave the router's requests to Next.
 */
const SUPABASE = "https://gate-test.supabase.example";
const APP = "https://app.example.com";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-only";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const {
  unstable_doesMiddlewareMatch,
  unstable_getResponseFromNextConfig,
} = require("next/experimental/testing/server");
const { proxy, config } = await importSrc("apps/dashboard/proxy.ts");
const configModule = await importSrc("apps/dashboard/next.config.ts");
// The config is TypeScript loaded through tsx, which may hand its default export back wrapped once more.
const loadedConfig = configModule.default?.headers ? configModule.default : configModule.default?.default;

/* ------------------------------------------------------------ a project's keys -- */

const { subtle } = globalThis.crypto;
const ES256 = { name: "ECDSA", namedCurve: "P-256" };
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const KID = "project-key-1";
const projectKey = await subtle.generateKey(ES256, true, ["sign", "verify"]);
const strangerKey = await subtle.generateKey(ES256, true, ["sign", "verify"]);
const JWKS = {
  keys: [{ ...(await subtle.exportKey("jwk", projectKey.publicKey)), kid: KID, alg: "ES256", use: "sig" }],
};

/** An access token signed with `key` under the project's key id, as Supabase signs one with an asymmetric key. */
async function signed(key, alg = "ES256") {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg, kid: KID, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub: "u1", aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, aal: "aal1" }),
  );
  const sig =
    alg === "ES256"
      ? await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, Buffer.from(`${header}.${payload}`))
      : Buffer.from("not-a-signature");
  return `${header}.${payload}.${b64url(sig)}`;
}

/** The session cookie @supabase/ssr reads, holding `accessToken`. */
function sessionCookie(accessToken) {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "refresh-test-only",
    user: { id: "u1", aud: "authenticated", role: "authenticated", email: "ada@example.com", app_metadata: {} },
  };
  return `sb-gate-test-auth-token=base64-${b64url(JSON.stringify(session))}`;
}

/** The project's auth server: its public keys, a 401 for anything asked of it, or nothing at all while it is down. */
let authDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(SUPABASE)) return realFetch(input, init);
  if (authDown) throw new TypeError("fetch failed");
  if (url.endsWith("/auth/v1/.well-known/jwks.json")) return Response.json(JWKS);
  return Response.json({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }, { status: 401 });
};

/* ------------------------------------------------------------------ requests -- */

/** What the router sends for a page it moves to or warms: the page's own address, asking for its payload. */
const ROUTER = { rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree" };

const ask = (path, headers = {}) => proxy(new NextRequest(new URL(path, APP), { headers }));

/** A redirect to sign in, its answer never stored. */
function sentToSignIn(res, path, workspace) {
  assert.equal(res.status, 307, `${path}: a redirect`);
  const to = new URL(res.headers.get("location"));
  assert.equal(to.pathname, "/login", `${path}: to sign in`);
  assert.equal(to.searchParams.get("w"), workspace, `${path}: in the workspace it named`);
  assert.equal(res.headers.get("cache-control"), "private, no-store", `${path}: never stored`);
}

const passed = (res) => res.headers.get("x-middleware-next") === "1";

/* --------------------------------------------------------------------- tests -- */

test("signed out, every address of a workspace is sent to sign in, whatever it ends in, and the home too", async () => {
  for (const path of ["/w/acme", "/w/acme/inbox/th-1?private=1", "/w/acme/people/x.png", "/w/acme/settings/x.css"]) {
    sentToSignIn(await ask(path), path, "acme");
  }
  // A workspace whose slug ends in an extension's letters, and an address in capitals, which Vercel routes to the same
  // page: the gate's first pattern skipped both by their ending.
  for (const path of ["/w/acme.js", "/W/acme/people/x.png"]) {
    const res = await ask(path);
    assert.equal(res.status, 307, path);
    assert.equal(new URL(res.headers.get("location")).pathname, "/login", path);
    assert.equal(res.headers.get("cache-control"), "private, no-store", path);
  }
  sentToSignIn(await ask("/"), "/", null);
  // The query never rides to the sign-in page: a conversation's id in it would reach the logs.
  const deep = new URL((await ask("/w/acme/inbox/th-1?private=1")).headers.get("location"));
  assert.ok(!deep.search.includes("private"));
});

test("signed out, the router's own requests for a page, a move or a warm, are sent to sign in, never answered", async () => {
  for (const path of ["/w/acme/inbox", "/w/acme/people/x.png", "/w/acme.js", "/"]) {
    const res = await ask(path, ROUTER);
    assert.equal(res.status, 307, `${path} as the router asks for it`);
    assert.ok(!passed(res), `${path}: nothing of the page is served`);
  }
});

test("a read signed out is a 401 the client can read, and a page outside the OS passes", async () => {
  const api = await ask("/api/v1/workspaces");
  assert.equal(api.status, 401);
  assert.equal((await api.json()).error.code, "unauthorized");
  assert.equal(api.headers.get("cache-control"), "private, no-store");
  for (const path of ["/login", "/privacy", "/b/acme", "/yes/acme/form"]) assert.ok(passed(await ask(path)), path);
});

test("a token signed by a key the project does not hold is no session; one signed by its own key passes", async () => {
  const forged = sessionCookie(await signed(strangerKey));
  for (const path of ["/w/acme/inbox", "/w/acme/people/x.png"]) {
    sentToSignIn(await ask(path, { cookie: forged }), path, "acme");
    sentToSignIn(await ask(path, { cookie: forged, ...ROUTER }), path, "acme");
  }
  assert.equal((await ask("/api/v1/workspaces", { cookie: forged })).status, 401);
  const real = sessionCookie(await signed(projectKey));
  for (const path of ["/w/acme/inbox", "/w/acme/people/x.png", "/"]) {
    const res = await ask(path, { cookie: real });
    assert.ok(passed(res), `${path}: a verified session passes`);
    assert.ok(res.headers.get("content-security-policy") ?? res.headers.get("content-security-policy-report-only"));
  }
  // A signed-in person is sent from the sign-in page to the app.
  const login = await ask("/login", { cookie: real });
  assert.equal(login.status, 307);
  assert.equal(new URL(login.headers.get("location")).pathname, "/");
});

test("an auth server that cannot be reached is 'try again', never 'signed out'", async () => {
  // A token signed with the shared secret is verified by the auth server, so it is asked, and does not answer.
  const cookie = sessionCookie(await signed(projectKey, "HS256"));
  authDown = true;
  try {
    const page = await ask("/w/acme/inbox", { cookie });
    assert.equal(page.status, 503);
    assert.equal(page.headers.get("cache-control"), "private, no-store");
    const api = await ask("/api/v1/workspaces", { cookie });
    assert.equal(api.status, 503);
    assert.equal((await api.json()).error.code, "upstream_auth");
  } finally {
    authDown = false;
  }
});

test("Next's own matcher runs the proxy for every address of a workspace, and never for the build's own files", () => {
  const runs = (path) => unstable_doesMiddlewareMatch({ config, url: `${APP}${path}` });
  for (const path of [
    "/",
    "/w/acme",
    "/w/acme/inbox",
    "/w/acme/people/x.png",
    "/w/acme/settings/x.css",
    "/w/acme.js",
    // Vercel routes a workspace's address in either case (production, 12 Oct 2026).
    "/W/acme/people/x.png",
    "/W/acme.js",
    "/w/acme/inbox.rsc",
    "/api/v1/workspaces",
    "/login",
  ]) {
    assert.equal(runs(path), true, path);
  }
  for (const path of [
    "/_next/static/chunks/a.js",
    "/_next/image",
    "/icons/a.png",
    "/fonts/a.woff2",
    "/favicon.ico",
    "/www/a.png",
  ]) {
    assert.equal(runs(path), false, path);
  }
});

test("a workspace's documents and the home are never stored; the router's requests keep what Next says of them", async () => {
  const cacheOf = async (path, headers = {}) =>
    (await unstable_getResponseFromNextConfig({ url: `${APP}${path}`, nextConfig: loadedConfig, headers })).headers.get(
      "cache-control",
    );
  for (const path of ["/", "/w/acme", "/w/acme/inbox/th-1", "/login", "/signup", "/reset-password"]) {
    assert.equal(await cacheOf(path), "private, no-store, max-age=0", path);
  }
  for (const path of ["/w/acme/inbox", "/"]) {
    assert.equal(await cacheOf(path, { rsc: "1" }), null, `${path}: the router's request is Next's to say`);
  }
  assert.equal(await cacheOf("/b/acme"), null, "a business's public page says its own");
});
