/**
 * Every WhatsApp send and every media download must use the credentials of the
 * tenant it belongs to.
 *
 * Three paths used `process.env` regardless of whose message it was. At one
 * tenant that is invisible, because the environment pair IS that tenant's. At
 * two it means a business's reply leaving from another business's number, on
 * another business's token — and a media download attempted against a WABA the
 * token cannot read, so every photo and voice note their customers send fails
 * to store.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode } from "./_source.mjs";

const runtime = readCode("apps/edge/lib/tenant-runtime.ts");
const fire = readCode("apps/edge/api/jobs/fire.ts");
const wa = readCode("apps/edge/api/whatsapp.ts");

test("the runtime resolves WhatsApp credentials by tenant and kind, not by the routed channel", () => {
  // It asked for the ROUTED channel's credentials, which is only ever right
  // when the request arrived over WhatsApp. A phone call routes on the voice
  // channel, whose credentials_ref is null — so retell-fn could never send
  // with the tenant's own credentials. And because the result is cached under
  // the tenant id alone, what a WhatsApp webhook got back depended on which
  // endpoint had most recently warmed that lambda.
  assert.match(runtime, /resolveWaCredentials/);
  const fn = runtime.slice(runtime.indexOf("async function resolveWaCredentials"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.match(body, /\.eq\("kind", "whatsapp"\)/, "the WhatsApp channel is found by kind");
  assert.match(body, /\.eq\("tenant_id", routed\.tenantId\)/, "and scoped to the tenant");
});

test("a credential lookup failure falls back rather than silencing the tenant", () => {
  // Throwing here would put the whole runtime into its DR posture over a
  // lookup the env-credentials tenant never needed.
  const fn = runtime.slice(runtime.indexOf("async function resolveWaCredentials"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.match(body, /wa_credentials_lookup_failed/, "loud");
  assert.ok(!/throw new Error/.test(body), "but not fatal");
});

test("the job runner sends on the job's own tenant credentials", () => {
  assert.match(fire, /waCfg: await waCredentialsForTenant\(db, job\.tenant_id\)/);
  assert.ok(
    !/waCfg: \{ phoneId: process\.env/.test(fire),
    "the environment pair must not be handed to every tenant's job",
  );
});

test("the inbound media download uses the tenant's runtime", () => {
  // fetchMediaBytes ran on waCfg() with no argument while the runtime holding
  // this tenant's credentials was already in scope at every call site.
  assert.match(wa, /fetchMediaBytes\(waCfg\(rt\)/);
  assert.ok(!/fetchMediaBytes\(waCfg\(\)/.test(wa), "no argument means the environment pair");
});

test("the sink carries the runtime, so a future send inside it cannot regress", () => {
  assert.match(wa, /pgSink\(db, tenantId, ing, rt\)/);
  assert.ok(
    !/pgSink\(db, tenantId, ing\)/.test(wa),
    "every call site must pass the runtime",
  );
});
