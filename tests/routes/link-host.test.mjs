/**
 * The cold link host (apps/dashboard/src/link-host.ts, Reach out D17), run: on the host a cold email's unsubscribe links
 * point at, the dashboard answers the /u/ page and nothing else, so no sign-in form stands on a domain cold mail names;
 * off it, and with no such host, nothing changes. The proxy asks exactly this (apps/dashboard/proxy.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { linkHostAnswers, linkHostOf } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/link-host.ts")).href
);

test("the link host is the host an https origin names; anything else turns the rule off", () => {
  assert.equal(linkHostOf("https://Links.ColdMail.example"), "links.coldmail.example");
  assert.equal(linkHostOf("https://links.coldmail.example/"), "links.coldmail.example", "a trailing slash is the same");
  for (const no of [
    "",
    null,
    undefined,
    "links.coldmail.example",
    "http://links.coldmail.example",
    "https://x.example/u",
  ])
    assert.equal(linkHostOf(no), null, String(no));
});

test("on the link host only /u/ answers; any other host, or no link host, answers everything", () => {
  const linkHost = "links.coldmail.example";
  assert.equal(linkHostAnswers({ host: "links.coldmail.example", path: "/u/abc", linkHost }), true);
  for (const p of ["/", "/login", "/w/harbor/", "/api/v1/me", "/b/abc", "/signup"])
    assert.equal(linkHostAnswers({ host: "Links.ColdMail.example", path: p, linkHost }), false, p);
  assert.equal(linkHostAnswers({ host: "links.coldmail.example:443", path: "/login", linkHost }), false, "with a port");
  assert.equal(linkHostAnswers({ host: "app.chanlytics.com", path: "/login", linkHost }), true);
  assert.equal(linkHostAnswers({ host: "links.coldmail.example", path: "/login", linkHost: null }), true);
  assert.equal(linkHostAnswers({ host: null, path: "/login", linkHost }), true);
});

test("the proxy asks it first, before any other rule, with the dashboard's UNSUBSCRIBE_ORIGIN", async () => {
  // The proxy, run (apps/dashboard/proxy.ts). A link host on a vercel.app name is the case that tells the order: the
  // alias redirect would send its /login to the app (308) if it came first; asked first, the link host says Not found.
  // Its /u/ page is never redirected, and with no UNSUBSCRIBE_ORIGIN the same host answers as any other.
  const require = createRequire(import.meta.url);
  const { NextRequest } = require("next/server");
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://link-host.supabase.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test-only";
  const { proxy } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/proxy.ts")).href);
  const host = "links-cold.vercel.app";
  const ask = (address) => proxy(new NextRequest(new URL(address, `https://${host}`), { headers: { host } }));
  const kept = Object.fromEntries(
    ["UNSUBSCRIBE_ORIGIN", "CANONICAL_HOST", "VERCEL_ENV"].map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, {
    UNSUBSCRIBE_ORIGIN: `https://${host}`,
    CANONICAL_HOST: "app.example.com",
    VERCEL_ENV: "production",
  });
  try {
    const login = await ask("/login");
    assert.equal(login.status, 404, "on the link host, the sign-in page is not found: never redirected first");
    assert.equal(await login.text(), "Not found");
    const page = await ask("/u/token-1");
    assert.notEqual(page.status, 404, "its unsubscribe page answers");
    assert.notEqual(page.status, 308, "where it is pressed: a mail client's one click is never redirected");
    delete process.env.UNSUBSCRIBE_ORIGIN;
    const anyHost = await ask("/login");
    assert.equal(anyHost.status, 308, "with no link host, the same host is the alias, redirected to the app");
    assert.equal(new URL(anyHost.headers.get("location")).host, "app.example.com");
  } finally {
    for (const [k, v] of Object.entries(kept))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
