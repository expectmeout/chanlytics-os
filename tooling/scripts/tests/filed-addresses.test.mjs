/**
 * The addresses a carrier filing names, as the dashboard answers them.
 *
 * A filing outlives the workspace's slug. RJ Capital LLC's brand was registered while
 * its workspace was "billing-probe", and Trust Hub holds `/yes/billing-probe` as the
 * brand's WEBSITE. Refiling an approved brand re-vets it, so the dashboard answers
 * the old address instead. These run the dashboard's own `redirects()` through
 * Next's own matcher, first match wins, the way the server picks one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as configModule from "../../../apps/dashboard/next.config.ts";

const require = createRequire(import.meta.url);
// The config is TypeScript loaded through tsx, which may hand its default export back wrapped once more.
const nextConfig = configModule.default?.redirects ? configModule.default : configModule.default?.default;
const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match");

/** Where a path goes: the first rule whose source matches, with its params put into the destination. */
async function whereTo(path) {
  for (const r of await nextConfig.redirects()) {
    const params = getPathMatch(r.source, { strict: true, removeUnnamedParams: true })(path);
    if (!params) continue;
    const to = r.destination.replace(/:(\w+)\*/g, (_, k) => {
      const v = params[k];
      return Array.isArray(v) ? v.join("/") : (v ?? "");
    });
    return { to: to.replace(/\/$/, "") || "/", permanent: r.permanent };
  }
  return null;
}

test("the address filed as the brand's website opens the company's website, not the sign-up page", async () => {
  // The eighth and ninth refusals (30919, 21 and 22 Sep 2026) were both for this address read as a
  // website: a page asking for a yes cannot show a business model.
  assert.deepEqual(await whereTo("/yes/billing-probe"), { to: "https://www.chanlytics.com", permanent: false });
});

test("the pages beneath it still answer as the workspace's own, under its current slug", async () => {
  assert.deepEqual(await whereTo("/yes/billing-probe/form"), { to: "/yes/chanlytics/form", permanent: true });
  assert.deepEqual(await whereTo("/yes/billing-probe/sign"), { to: "/yes/chanlytics/sign", permanent: true });
  assert.deepEqual(await whereTo("/b/billing-probe"), { to: "/b/chanlytics", permanent: true });
  assert.deepEqual(await whereTo("/b/billing-probe/terms"), { to: "/b/chanlytics/terms", permanent: true });
});

test("no other workspace's pages are moved", async () => {
  assert.equal(await whereTo("/yes/chanlytics"), null);
  assert.equal(await whereTo("/yes/billing-probe-2"), null);
  assert.equal(await whereTo("/b/marisas-beauty-salon"), null);
});
