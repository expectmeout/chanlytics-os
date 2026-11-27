/**
 * The two public pages a phone network's reviewer and a customer open, run by their slug: `/yes/<slug>` (the sign-up
 * page, app/yes/[slug]/page.tsx) and `/b/<slug>` (the business's own page, app/b/[slug]/page.tsx). Each asks its reader
 * for the slug, draws its page for a workspace that answers, and is Not found for one that does not; each names its tab
 * by contracts' rule, the sign-up page for the people given the link and never indexed, the business's page indexed so a
 * reviewer can look the business up (30919). Read as the pages' text in consent/consent-page.test.mjs and
 * public/business-page.test.mjs until 26 Nov 2026.
 *
 * The real readers run over a database in memory (_pages.mjs), and the pages are the modules the app serves: next's
 * notFound() throws as it does under a server render, its digest naming the 404.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { businessPageMetadata, consentPageMetadata, notFoundPageMetadata } from "@chanlytics/contracts";
import { NAME, world } from "./_pages.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
globalThis.React ??= (await import("react")).default;
// next/navigation brings the router's client contexts, which this runner's react-server React cannot make; the page uses
// notFound() alone, so that one is next's own (client/components/not-found), as a server render throws it.
const { notFound: nextNotFound } = createRequire(path.join(ROOT, "apps/dashboard/package.json"))(
  "next/dist/client/components/not-found.js",
);
const load = Module._load;
Module._load = function (request, ...rest) {
  return request === "next/navigation"
    ? { __esModule: true, notFound: nextNotFound }
    : load.call(this, request, ...rest);
};
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { findConsentPage } = await import(at("apps/dashboard/src/server/public/consent-page.ts"));
const { findBusinessPage } = await import(at("apps/dashboard/src/server/public/business-page.ts"));
const yesPage = await import(at("apps/dashboard/app/yes/[slug]/page.tsx"));
const businessPage = await import(at("apps/dashboard/app/b/[slug]/page.tsx"));
const { SignUpPage } = await import(at("apps/dashboard/src/yes/SignUpPage.tsx"));
const { BusinessPublicPage } = await import(at("apps/dashboard/src/yes/BusinessPublicPage.tsx"));

const asked = (slug) => ({ params: Promise.resolve({ slug }) });
/** What next's notFound() throws: its digest, which Next reads as a 404. */
const notFound = (e) => {
  assert.match(String(e?.digest ?? ""), /404/, `a 404, not ${e?.message}`);
  return true;
};

test("/yes/<slug>: a workspace that answers is drawn as its sign-up page, one that does not is Not found, and the tab is never indexed", async (t) => {
  t.after(() => setServiceClient(null));
  const { slug } = world();
  const page = await yesPage.default(asked(slug));
  assert.equal(page.type, SignUpPage, "the sign-up page, drawn");
  assert.equal(page.props.slug, slug);
  assert.equal(page.props.businessName, NAME, "for the business the customer is agreeing to hear from");
  assert.deepEqual(
    page.props.vm.asks.map((a) => a.purpose),
    ["conversational", "marketing"],
    "its two asks",
  );
  assert.deepEqual(
    await yesPage.generateMetadata(asked(slug)),
    consentPageMetadata(await findConsentPage(slug)),
    "the tab is contracts' rule",
  );
  assert.deepEqual((await yesPage.generateMetadata(asked(slug))).robots, { index: false, follow: false });

  await assert.rejects(yesPage.default(asked("no-such-workspace-here")), notFound);
  assert.deepEqual(await yesPage.generateMetadata(asked("no-such-workspace-here")), notFoundPageMetadata());
});

test("/b/<slug>: a business on record is drawn and indexed; no workspace, or a record too thin to say who it is, is Not found", async (t) => {
  t.after(() => setServiceClient(null));
  const { slug } = world();
  const page = await businessPage.default(asked(slug));
  assert.equal(page.type, BusinessPublicPage, "the business's own page, drawn");
  assert.equal(page.props.vm.empty, false);
  const told = await businessPage.generateMetadata(asked(slug));
  assert.deepEqual(told, businessPageMetadata(await findBusinessPage(slug)), "the tab is contracts' rule");
  assert.deepEqual(told.robots, { index: true, follow: true }, "INDEXED, unlike the sign-up page");

  await assert.rejects(businessPage.default(asked("no-such-workspace-here")), notFound);
  // A page with no legal name or no address is the page 30919 refused: worse than none, a reviewer reads it as evasive.
  for (const missing of [{ legal_name: "" }, { street: "" }, { city: "" }]) {
    const thin = world({ record: missing });
    await assert.rejects(businessPage.default(asked(thin.slug)), notFound, JSON.stringify(missing));
    assert.deepEqual(
      await businessPage.generateMetadata(asked(thin.slug)),
      notFoundPageMetadata(),
      JSON.stringify(missing),
    );
  }
});
