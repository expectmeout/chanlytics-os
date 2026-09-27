/** A link into the app (src/site.ts workspaceLinkOf): the site's path becomes the tab and the page route it belongs to. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceLinkOf } from "../src/site.ts";
import { tabOf } from "../src/shell/notifications-pure.ts";

test("a workspace link names its workspace and the page route, today when it names none", () => {
  assert.deepEqual(workspaceLinkOf("/w/acme-plumbing"), { slug: "acme-plumbing", route: "today" });
  assert.deepEqual(workspaceLinkOf("/w/acme-plumbing/"), { slug: "acme-plumbing", route: "today" });
  assert.deepEqual(workspaceLinkOf("/w/acme-plumbing#/inbox"), { slug: "acme-plumbing", route: "inbox" });
  assert.deepEqual(workspaceLinkOf("https://app.chanlytics.com/w/acme#/inbox/th-abc"), {
    slug: "acme",
    route: "inbox/th-abc",
  });
  assert.deepEqual(workspaceLinkOf("chanlytics:///w/acme#/clients/abc-123"), {
    slug: "acme",
    route: "clients/abc-123",
  });
  assert.deepEqual(workspaceLinkOf("/w/acme%20shop"), { slug: "acme shop", route: "today" });
  assert.equal(workspaceLinkOf("/w/acme#/https://evil.example").route, "today", "a hash that is no route is Today");
});

test("anything else is not a link into a workspace", () => {
  for (const p of ["/", "/today", "/login", "/u/abc", "/p/abc", "/w/", "/w//x", "/signup", "not a url at all"]) {
    assert.equal(workspaceLinkOf(p), null, p);
  }
});

test("the tab a link lands in is the route's tab", () => {
  assert.equal(tabOf(workspaceLinkOf("/w/acme#/inbox/th-1").route), "inbox");
  assert.equal(tabOf(workspaceLinkOf("/w/acme#/clients").route), "people");
  assert.equal(tabOf(workspaceLinkOf("/w/acme#/settings").route), "more");
  assert.equal(tabOf(workspaceLinkOf("/w/acme").route), "today");
});
