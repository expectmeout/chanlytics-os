/**
 * Meta's ads wire (packages/channels/src/ads): what an ad account, a Page and a sign-in say, read into what Chanlytics
 * keeps; Meta's money, converted from its own units; Meta's pace, read from an answer's headers; what a refusal was,
 * named; and the signed request Meta posts when a business removes the app. Pure, over Meta's answers as its reference
 * pages document them (read 19 November 2026), with a network that is handed in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const account = await import(at("packages/channels/src/ads/meta-account.ts"));
const { callMetaAds, metaUsageOf } = await import(at("packages/channels/src/ads/meta-call.ts"));
const { readMetaSignedRequest } = await import(at("packages/channels/src/ads/meta-signed.ts"));
const { resetBreakers } = await import(at("packages/channels/src/shared/provider-fetch.ts"));

const SECRET = "app-secret-for-this-file";

test("money: Meta's units become each currency's own minor units, and nothing else converts", () => {
  // A hundred to the dollar on both sides.
  assert.equal(account.metaUnitsToMinor("7000", "USD"), 7000);
  // The yen is its own smallest unit on both sides.
  assert.equal(account.metaUnitsToMinor("7000", "JPY"), 7000);
  // Meta counts the forint whole; the world's list counts a hundred fillér to it.
  assert.equal(account.metaUnitsToMinor("7000", "HUF"), 700000);
  assert.equal(account.metaUnitsToMinor(15, "TWD"), 1500);
  // Meta counts the Bahraini dinar in hundredths; the world's list counts a thousand fils to it.
  assert.equal(account.metaUnitsToMinor("250", "BHD"), 2500);
  // What an ad spent is a decimal of the currency itself.
  assert.equal(account.metaDecimalToMinor("12.34", "USD"), 1234);
  assert.equal(account.metaDecimalToMinor("1200", "JPY"), 1200);
  assert.equal(account.metaDecimalToMinor("1.5", "BHD"), 1500);
  for (const odd of [null, undefined, "", "-5", "1e9", "12.34.5", {}, []]) {
    assert.equal(account.metaUnitsToMinor(odd, "USD"), null, JSON.stringify(odd));
    assert.equal(account.metaDecimalToMinor(odd, "USD"), null, JSON.stringify(odd));
  }
});

const ACCOUNT = {
  account_id: "1200000000000042",
  id: "act_1200000000000042",
  name: "Harbor ads",
  currency: "USD",
  timezone_name: "America/New_York",
  account_status: 1,
  funding_source: "9900000000000001",
  spend_cap: "0",
  min_daily_budget: 100,
  business: { id: "583355900000001" },
};

test("an ad account is read into what the row keeps: its standing in Chanlytics' words, its payment method, its limit", () => {
  assert.deepEqual(account.parseMetaAdAccount(ACCOUNT), {
    id: "1200000000000042",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    standing: "active",
    funded: true,
    spendLimitMinor: null,
    minDailyMinor: 100,
    businessId: "583355900000001",
  });
  const words = {
    1: "active",
    2: "disabled",
    3: "unsettled",
    7: "review",
    8: "grace",
    9: "grace",
    100: "closing",
    101: "closed",
  };
  for (const [status, word] of Object.entries(words))
    assert.equal(account.parseMetaAdAccount({ ...ACCOUNT, account_status: Number(status) }).standing, word, status);
  // A number Meta may add later is one Chanlytics does not know: no word is kept, and nothing is claimed.
  assert.equal(account.parseMetaAdAccount({ ...ACCOUNT, account_status: 555 }).standing, null);
  const bare = account.parseMetaAdAccount({
    ...ACCOUNT,
    funding_source: undefined,
    spend_cap: "50000",
    business: undefined,
  });
  assert.deepEqual([bare.funded, bare.spendLimitMinor, bare.businessId], [false, 50000, null]);
  assert.throws(
    () => account.parseMetaAdAccount({ error: { message: "Unsupported get request", code: 100 } }),
    /Unsupported get request/,
  );
  assert.throws(
    () => account.parseMetaAdAccount({ account_id: "12", currency: "USD", timezone_name: "x" }),
    /did not describe/,
  );
});

test("a Page says the WhatsApp number and the Instagram account it is linked to, each or neither", () => {
  assert.deepEqual(
    account.parseMetaPage({
      id: "100200300400500",
      name: "Harbor Nails",
      whatsapp_number: "+1 555-010-0142",
      instagram_business_account: { id: "17841500000000001", username: "harbor.nails" },
    }),
    { id: "100200300400500", name: "Harbor Nails", whatsapp: "15550100142", instagram: "harbor.nails" },
  );
  assert.deepEqual(account.parseMetaPage({ id: "100200300400500", name: "Harbor Nails" }), {
    id: "100200300400500",
    name: "Harbor Nails",
    whatsapp: null,
    instagram: null,
  });
  assert.throws(() => account.parseMetaPage({ name: "No id" }), /did not describe the Page/);
});

test("a sign-in's own description names the ad accounts and the Pages it reaches, each once", () => {
  assert.deepEqual(
    account.metaReachOf({
      ads_read: ["1200000000000042"],
      ads_management: ["1200000000000042", "1200000000000043"],
      pages_show_list: ["100200300400500"],
      pages_manage_ads: ["100200300400500"],
      instagram_basic: ["17841500000000001"],
    }),
    { accountIds: ["1200000000000042", "1200000000000043"], pageIds: ["100200300400500"] },
  );
  assert.deepEqual(account.metaReachOf({}), { accountIds: [], pageIds: [] });
  assert.equal(account.parseMetaTokenUser({ data: { user_id: "61550000000001" } }), "61550000000001");
  assert.equal(account.parseMetaTokenUser({ data: {} }), null);
  assert.deepEqual(
    account.parseMetaAssignedAdAccounts({ data: [{ account_id: "1200000000000042" }, { account_id: "x" }] }),
    ["1200000000000042"],
  );
  assert.throws(() => account.parseMetaAssignedAdAccounts({ error: { message: "(#10) no", code: 10 } }), /no/);
});

test("every call carries the token's proof, and an account is asked for by Meta's own name for it", () => {
  const request = account.metaAdAccountRequest("the-token", SECRET, "1200000000000042");
  const url = new URL(request.url);
  assert.equal(request.method, "GET");
  assert.equal(url.pathname, "/v27.0/act_1200000000000042");
  assert.equal(url.searchParams.get("appsecret_proof"), createHmac("sha256", SECRET).update("the-token").digest("hex"));
  assert.match(url.searchParams.get("fields"), /account_status/);
  // An id that came with its prefix is asked for once, never as act_act_.
  assert.equal(
    new URL(account.metaAdAccountRequest("t", SECRET, "act_1200000000000042").url).pathname,
    "/v27.0/act_1200000000000042",
  );
});

const usageHeaders = (parts) =>
  new Headers(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, JSON.stringify(v)])));

test("Meta's pace is read from an answer's headers: the largest share of any limit, and the longest wait", () => {
  assert.equal(metaUsageOf(null), null);
  assert.equal(metaUsageOf(new Headers()), null);
  assert.deepEqual(
    metaUsageOf(usageHeaders({ "x-ad-account-usage": { acc_id_util_pct: 9.67, reset_time_duration: 0 } })),
    {
      pct: 9.67,
      waitS: 0,
    },
  );
  assert.deepEqual(
    metaUsageOf(
      usageHeaders({
        "x-ad-account-usage": { acc_id_util_pct: 40, reset_time_duration: 120 },
        "x-app-usage": { call_count: 12, total_time: 3, total_cputime: 5 },
        "x-business-use-case-usage": {
          583355900000001: [
            {
              type: "ads_insights",
              call_count: 81,
              total_cputime: 10,
              total_time: 20,
              estimated_time_to_regain_access: 4,
            },
          ],
        },
      }),
    ),
    // The business's wait is said in minutes.
    { pct: 81, waitS: 240 },
  );
  const odd = new Headers({ "x-ad-account-usage": "not json" });
  assert.deepEqual(metaUsageOf(odd), { pct: 0, waitS: 0 });
});

/** One answer from a network that is handed in. */
const answering = (status, body, headers = {}) => ({
  fetch: async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }),
});
const ask = (deps) => callMetaAds({ url: "https://graph.facebook.com/v27.0/act_1", method: "GET" }, {}, deps);

test("what a refusal was is named at the wire, with Meta's own words beside it", async () => {
  resetBreakers();
  const ok = await ask(answering(200, { account_id: "1" }));
  assert.deepEqual([ok.fault, ok.said, ok.json], [null, null, { account_id: "1" }]);
  const cases = [
    [400, { error: { code: 190, message: "Error validating access token" } }, "revoked"],
    [400, { error: { code: 100, error_subcode: 458, message: "App not installed" } }, "revoked"],
    [400, { error: { code: 17, error_subcode: 2446079, message: "User request limit reached" } }, "slowed"],
    [400, { error: { code: 613, message: "Calls to this api have exceeded the rate limit." } }, "slowed"],
    [400, { error: { code: 80004, message: "There have been too many calls to this ad-account." } }, "slowed"],
    [429, { error: { message: "slow down" } }, "slowed"],
    [403, { error: { code: 200, message: "Permissions error" } }, "forbidden"],
    [400, { error: { code: 100, error_subcode: 33, message: "Object does not exist" } }, "gone"],
    [400, { error: { code: 100, message: "Invalid parameter" } }, "refused"],
  ];
  for (const [status, body, fault] of cases) {
    const answer = await ask(answering(status, body));
    assert.equal(answer.fault, fault, JSON.stringify(body));
    assert.equal(answer.said, body.error.message);
  }
  resetBreakers();
  const silent = await ask(answering(500, { error: { message: "An unknown error occurred" } }));
  assert.equal(silent.fault, "silent");
  resetBreakers();
});

test("a call is sent once, whatever Meta answers: a second try in the same breath is one more against the score", async () => {
  resetBreakers();
  let sent = 0;
  const deps = {
    fetch: async () => {
      sent += 1;
      return new Response(JSON.stringify({ error: { message: "busy" } }), { status: 503 });
    },
  };
  await ask(deps);
  assert.equal(sent, 1);
  resetBreakers();
});

const signedRequest = (payload, secret = SECRET) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${createHmac("sha256", secret).update(body).digest("base64url")}.${body}`;
};

test("Meta's signed request is trusted only where the app's secret signed it", () => {
  const signed = signedRequest({ user_id: "61550000000001", algorithm: "HMAC-SHA256", issued_at: 1795000000 });
  assert.deepEqual(readMetaSignedRequest(signed, [SECRET]), { userId: "61550000000001", issuedAt: 1795000000 });
  // The retiring secret beside the new one, while one is rotated.
  assert.deepEqual(readMetaSignedRequest(signed, ["a-new-secret", SECRET])?.userId, "61550000000001");
  assert.equal(readMetaSignedRequest(signed, ["another-secret"]), null, "signed by someone else");
  assert.equal(readMetaSignedRequest(signed, [undefined, null, ""]), null, "no secret is no request");
  const [signature, payload] = signed.split(".");
  const forged = Buffer.from(JSON.stringify({ user_id: "61550000000002", algorithm: "HMAC-SHA256" })).toString(
    "base64url",
  );
  assert.equal(
    readMetaSignedRequest(`${signature}.${forged}`, [SECRET]),
    null,
    "a payload swapped under an old signature",
  );
  assert.equal(readMetaSignedRequest(payload, [SECRET]), null, "one part");
  assert.equal(readMetaSignedRequest(signedRequest({ algorithm: "HMAC-SHA256" }), [SECRET]), null, "names nobody");
  assert.equal(readMetaSignedRequest(signedRequest({ user_id: "61550000000001", algorithm: "none" }), [SECRET]), null);
});

test("a Page's Instagram account is asked only where the sign-in may read it", async () => {
  const { metaPageRequest } = await import(at("packages/channels/src/ads/meta-account.ts"));
  const fields = (instagram) =>
    new URL(metaPageRequest("tok", "secret", { id: "100200300400500", instagram }).url).searchParams.get("fields");
  assert.equal(fields(false), "id,name,whatsapp_number");
  assert.equal(fields(true), "id,name,whatsapp_number,instagram_business_account{username}");
});
