/**
 * The Content-Security-Policy, as the middleware composes it (apps/dashboard/src/csp.ts).
 *
 * The header existed only as `frame-ancestors 'none'`: a real script-src needs a
 * per-request nonce threaded through the document, and the ported mockup's
 * inline styles need naming. This holds the policy that ships, report-only
 * first: what it withholds (inline script, eval in production, framing), what
 * it names (this request's nonce, the workspace's own Supabase origin over
 * https and wss, Meta's SDK), and that a development server gets eval and
 * production does not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { contentSecurityPolicy, CSP_HEADER } = await importSrc("apps/dashboard/src/csp.ts");

const directives = (policy) =>
  Object.fromEntries(
    policy
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values];
      }),
  );

test("script-src is the app's own origin, Meta's SDK host and inline by name (the nonce does not reach the render on Vercel); production has no eval; the policy refuses framing, objects and a foreign base", () => {
  const p = directives(contentSecurityPolicy({ supabaseUrl: "https://mwwy.supabase.co" }));
  assert.deepEqual(p["script-src"], ["'self'", "'unsafe-inline'", "https://connect.facebook.net"]);
  assert.ok(
    !p["script-src"].includes("'unsafe-eval'") &&
      !p["script-src"].some((v) => /^https?:\/\//.test(v) && v !== "https://connect.facebook.net"),
    "no eval, no foreign script origin",
  );
  assert.ok(
    !p["script-src"].some((v) => v.startsWith("'nonce-")),
    "no nonce: with one present, inline would be refused, and the render on Vercel never receives it",
  );
  assert.deepEqual(p["frame-ancestors"], ["'none'"]);
  assert.deepEqual(p["object-src"], ["'none'"]);
  assert.deepEqual(p["base-uri"], ["'self'"]);
  assert.deepEqual(p["form-action"], ["'self'"]);
  assert.ok("upgrade-insecure-requests" in p, "production upgrades");
  const reporting = directives(contentSecurityPolicy({ supabaseUrl: "https://x.supabase.co", reportOnly: true }));
  assert.ok(
    !("upgrade-insecure-requests" in reporting),
    "not while it only reports: the browser ignores it there and says so on every page",
  );
  assert.ok("script-src" in reporting, "the rest of the policy rides unchanged");
  assert.deepEqual(p["default-src"], ["'self'"]);
});

test("the workspace's Supabase origin is allowed over https and wss, and for the signed media it serves; Meta's origins for the sign-up SDK; nothing else", () => {
  const p = directives(contentSecurityPolicy({ supabaseUrl: "https://mwwy.supabase.co/" }));
  assert.deepEqual(p["connect-src"], [
    "'self'",
    "https://mwwy.supabase.co",
    "wss://mwwy.supabase.co",
    "https://connect.facebook.net",
    "https://www.facebook.com",
    "https://web.facebook.com",
    "https://graph.facebook.com",
  ]);
  assert.deepEqual(p["img-src"], [
    "'self'",
    "data:",
    "blob:",
    "https://mwwy.supabase.co",
    "https://*.googleusercontent.com",
  ]);
  assert.deepEqual(p["media-src"], ["'self'", "blob:", "https://mwwy.supabase.co"]);
  assert.deepEqual(p["frame-src"], ["https://www.facebook.com", "https://web.facebook.com"]);
  // The mockup's inline styles: attributes, which no nonce can reach. Said in the policy, not smuggled.
  assert.deepEqual(p["style-src"], ["'self'", "'unsafe-inline'"]);
  // next/font self-hosts the fonts: no font host is named.
  assert.deepEqual(p["font-src"], ["'self'"]);
});

test("no Supabase URL, or a malformed one, allows no Supabase origin rather than a wildcard; a dev server gets eval and no upgrade", () => {
  const none = directives(contentSecurityPolicy({ supabaseUrl: undefined }));
  assert.deepEqual(
    none["connect-src"].filter((v) => v.includes("supabase")),
    [],
  );
  const bad = directives(contentSecurityPolicy({ supabaseUrl: "not a url" }));
  assert.deepEqual(
    bad["connect-src"].filter((v) => v.includes("supabase")),
    [],
  );
  const dev = directives(contentSecurityPolicy({ supabaseUrl: "https://x.supabase.co", dev: true }));
  assert.ok(dev["script-src"].includes("'unsafe-eval'"), "fast refresh needs it");
  assert.ok(!("upgrade-insecure-requests" in dev), "a laptop is http");
  assert.equal(
    CSP_HEADER,
    "content-security-policy",
    "enforced: the nightly walked every page clean on 17 September 2026 (run 35170328083)",
  );
  const enforced = directives(contentSecurityPolicy({ supabaseUrl: "https://x.supabase.co", reportOnly: false }));
  assert.ok(
    "upgrade-insecure-requests" in enforced,
    "and upgrade-insecure-requests rides again on the enforcing header",
  );
});

test("the lead map's bundle origin is allowed for connections and images; a same-origin path names nothing", () => {
  const p = directives(
    contentSecurityPolicy({
      supabaseUrl: "https://mwwy.supabase.co",
      leadMapBase: "https://tiles.example.com/lead-map",
    }),
  );
  assert.ok(p["connect-src"].includes("https://tiles.example.com"), "the archive is read in byte ranges");
  assert.ok(p["img-src"].includes("https://tiles.example.com"), "and the sprites as images");
  assert.ok(!p["script-src"].includes("https://tiles.example.com"), "never as script");
  const same = directives(contentSecurityPolicy({ supabaseUrl: "https://mwwy.supabase.co", leadMapBase: "/lead-map" }));
  assert.deepEqual(
    same["connect-src"],
    directives(contentSecurityPolicy({ supabaseUrl: "https://mwwy.supabase.co" }))["connect-src"],
  );
});
