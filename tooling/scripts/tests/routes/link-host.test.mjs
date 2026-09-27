/**
 * The cold link host (apps/dashboard/src/link-host.ts, Reach out D17), run: on the host a cold email's unsubscribe links
 * point at, the dashboard answers the /u/ page and nothing else, so no sign-in form stands on a domain cold mail names;
 * off it, and with no such host, nothing changes. The proxy asks exactly this (apps/dashboard/proxy.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
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

test("the proxy asks it first, before any other rule, with the dashboard's UNSUBSCRIBE_ORIGIN", () => {
  const proxy = fs.readFileSync(path.join(ROOT, "apps/dashboard/proxy.ts"), "utf8");
  const asked = proxy.indexOf("linkHostAnswers(");
  assert.ok(asked > 0 && asked < proxy.indexOf("const moved = canonicalRedirect(request);"));
  assert.match(proxy, /linkHostOf\(process\.env\.UNSUBSCRIBE_ORIGIN\)/);
});
