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
 *   3. the layout's own getUser() being deleted as "redundant with middleware"
 *      (it is not — middleware bypass is a recurring Next.js CVE class)
 *   4. getSession() replacing getUser(), which trusts an unverified cookie
 *   5. the login form going back to confirming which emails have accounts
 *   6. the sign-out CSRF check going back to being skippable by omitting a header
 *   7. the hosted auth settings drifting back to their unsafe defaults
 *
 * These are text assertions against source, not behavioural tests, because the
 * failure they guard is "someone edits this file and no one notices" — the edit
 * IS the bug, and the text is where it lands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const DASH = path.join(ROOT, "apps/dashboard");

// Comment-stripping and LF-normalised reads are shared: see _source.mjs for
// why every code-scanning assertion needs both.
const read = (p) => readCode(p);

const middleware = read("apps/dashboard/middleware.ts");
const signout = read("apps/dashboard/app/auth/signout/route.ts");
const login = read("apps/dashboard/app/login/page.tsx");
const osLayout = read("apps/dashboard/app/(os)/layout.tsx");
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
  assert.match(middleware, /const canonical = process\.env\.CANONICAL_HOST;/);
  assert.match(middleware, /process\.env\.VERCEL_ENV !== "production"/, "a preview is also a vercel.app host and must answer as itself");
  assert.match(middleware, /!host\.endsWith\("\.vercel\.app"\)/, "only the alias is moved, never a custom domain");
  assert.match(middleware, /NextResponse\.redirect\(url, 308\)/, "permanent, so it is cached and so search engines follow it");
  const before = middleware.indexOf("const moved = canonicalRedirect(request);");
  assert.ok(before > 0 && before < middleware.indexOf("PUBLIC_PATHS.has(path)"), "before the auth gate: the redirect is not a place to leak whether a path exists");
});

test("two public PREFIXES, and only a workspace's own two pages live under them", () => {
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
  assert.deepEqual(prefixes, ["/yes/", "/b/"]);
  assert.match(middleware, /PUBLIC_PREFIXES\.some\(\(p\) => path\.startsWith\(p\)\)/);
  //
  // `/yes/<slug>/form` joined the opt-in page when a yes to offers had to be
  // WRITTEN (00100): the filing names the printable form as one way to give it,
  // and a reviewer who gets a login screen instead of the form has been shown a
  // consent method nobody can check. It is a page like its neighbour -- printed
  // and signed by hand, it takes no input -- and it is the only thing that joined.
  for (const [dir, what, beneath] of [
    ["yes", "the opt-in page and its paper form", ["form", "page.tsx"]],
    ["b", "the workspace's own page and its texting terms", ["page.tsx", "terms"]],
  ]) {
    const at = path.join(ROOT, "apps/dashboard/app", dir);
    assert.deepEqual(fs.readdirSync(at), ["[slug]"], `nothing but ${what} may live under its public prefix`);
    assert.deepEqual(fs.readdirSync(path.join(at, "[slug]")).sort(), beneath, `and ${what} are pages, not routes that take input`);
  }
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "apps/dashboard/app/yes/[slug]/form")), ["page.tsx"], "the paper form is a page, not a route that takes input");
  // `/b/<slug>/terms` joined when the campaign's terms URL became the business's
  // own: the reviewers' guide lists eight things a program's terms must carry,
  // and Chanlytics' /terms -- a software agreement for workspace owners --
  // carries none of them. A page like its neighbour: read by slug, no input.
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "apps/dashboard/app/b/[slug]/terms")), ["page.tsx"], "the terms are a page, not a route that takes input");
});

test("only these ten paths are reachable without a session", () => {
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
  assert.deepEqual(paths, ["/api/v1/signup", "/api/version", "/auth/callback", "/auth/signout", "/data-deletion", "/login", "/manifest.webmanifest", "/privacy", "/signup", "/terms"]);
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
  assert.ok(deletion.includes('href="/privacy"') && deletion.includes('href="/terms"'), "the deletion page names the other two");
  // The one promise a reviewer reads it for, and the one an end customer needs.
  assert.ok(/within 30 days/.test(deletion), "it says how long deletion takes");
  assert.ok(deletion.includes("<b>STOP</b>"), "and how to stop messages without deleting anything");
});

test("the session is VERIFIED, never read from the cookie", () => {
  // getSession() decodes the cookie without asking the auth server whether it is
  // still valid — a revoked or forged session passes.
  for (const [name, src] of [["middleware", middleware], ["withRoute", withRoute], ["(os) layout", osLayout]]) {
    assert.ok(!/getSession\(/.test(src), `${name} must not use getSession()`);
    assert.match(src, /getUser\(/, `${name} must verify with getUser()`);
  }
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

/* ---------------------------------------------------------------------- 3 -- */

test("the signed-in layout gates independently of middleware", () => {
  // If middleware is bypassed (CVE-2025-29927 and its successors), this is the
  // gate that still holds. It is not redundant.
  assert.match(osLayout, /getUser\(/);
  assert.match(osLayout, /redirect\(\s*["']\/login["']\s*\)/);
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
  assert.ok(
    !/function isSameOrigin/.test(signout),
    "one implementation, imported — not a second copy that can drift",
  );

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
