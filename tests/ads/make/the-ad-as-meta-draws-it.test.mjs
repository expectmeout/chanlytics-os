/**
 * The ad as Meta draws it (apps/edge/lib/ads/preview.ts answerAdPreview; the Ads plan's 4.6, "The ad as Meta draws
 * it"): one version of New ad's draft asked of Meta's own preview in each place the ad shows, run over a database in
 * memory and a Meta that answers as its pages document (read 21 November 2026).
 *
 * What must hold. Only where this deployment offers Ads in the workspace, and with no switch that lets presses reach
 * Meta, since a preview makes nothing. Meta is asked nothing where the account is not connected, its pace holds it back,
 * its sign-in is gone, or the picture is a video; otherwise once for each place, at once, every one a read, the picture
 * given by a signed address of the file as Files keeps it. What comes back is Meta's frame for each place it drew, and
 * for the others what stood in the way, said as one outcome. Meta's own words reach the log, never the answer, and the
 * picture's address reaches neither.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { filePathOf } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const ENV = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_ADS_CONFIG_ID",
  "META_ADS_REDIRECT_URI",
  "ADS_WORKSPACES",
  "ADS_WRITES",
];
for (const name of [...ENV, "SUPABASE_URL"]) delete process.env[name];
const T = "abababab-8888-4000-8000-000000000001";
const U = "cdcdcdcd-8888-4000-8000-000000000001";
const ACCOUNT = "acacacac-8888-4000-8000-000000000001";
const FILE = "f1f1f1f1-8888-4000-8000-000000000001";
const META_ACCOUNT = "1200000000000081";
const PAGE = "100000000000081";
const APP = {
  META_APP_ID: "990000000000087",
  META_APP_SECRET: "meta-secret-for-this-file",
  META_ADS_CONFIG_ID: "880000000000003",
  META_ADS_REDIRECT_URI: "https://app.example.com/api/v1/ads/connect/callback",
  ADS_WORKSPACES: T,
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { answerAdPreview } = await import(at("apps/edge/lib/ads/preview.ts"));

const auth = { ok: true, via: "token", workspace: T, user: U };
const VERSION = {
  picture: FILE,
  text: "A first appointment at Harbor Studio takes 45 minutes. Message us on WhatsApp to pick a time.",
  headline: "First appointment",
};
const SIGNED = `https://project.example.com/storage/v1/object/sign/files/${T}/${FILE}.png?token=a-day`;
const frameOf = (place) => `https://www.facebook.com/ads/api/preview_iframe.php?d=${place}-drawn&t=AQJ`;
const FORMATS = { MOBILE_FEED_STANDARD: "feed", FACEBOOK_STORY_MOBILE: "story", FACEBOOK_REELS_MOBILE: "reel" };

/** Meta, as the preview meets it: each call kept as asked, each place answered by its frame or as a test sets it. */
const asked = [];
let answerFor = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const address = new URL(String(url));
  const place = FORMATS[address.searchParams.get("ad_format")] ?? "unknown";
  asked.push({ place, method: init?.method ?? "GET", url: address, body: init?.body ?? null });
  const reply = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const set = answerFor[place];
  if (set === "silent") return reply(503, { error: { message: "Service temporarily unavailable", code: 2 } });
  if (set === "slowed") return reply(400, { error: { message: "Too many calls to this ad-account", code: 80004 } });
  if (set === "revoked") return reply(400, { error: { message: "Error validating access token", code: 190 } });
  if (set === "refused") return reply(400, { error: { message: "Invalid parameter: the picture", code: 100 } });
  if (set === "elsewhere") return reply(200, { data: [{ body: '<iframe src="https://example.com/x?d=1"></iframe>' }] });
  const html = `<iframe src="${frameOf(place).replace("&", "&amp;")}" width="335" height="580" scrolling="yes"></iframe>`;
  return reply(200, { data: [{ body: html }] });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

/** A workspace with one connected ad account and its Page, its sign-in kept, and the picture in Files. */
function world({ account = {}, file = {}, signedIn = true } = {}) {
  resetBreakers();
  for (const name of ENV) delete process.env[name];
  Object.assign(process.env, APP);
  asked.length = 0;
  answerFor = {};
  const signed = [];
  const db = fakeDb(
    {
      ad_accounts: [
        {
          id: ACCOUNT,
          tenant_id: T,
          platform: "meta",
          external_id: META_ACCOUNT,
          status: "connected",
          currency: "USD",
          timezone: "America/New_York",
          config: { page_id: PAGE },
          read_after: null,
          ...account,
        },
      ],
      files: [{ id: FILE, tenant_id: T, mime: "image/png", removed_at: null, ...file }],
    },
    {},
    { ad_credentials_get: () => (signedIn ? { access_token: "the-business-token" } : null) },
  );
  db.storage = {
    from: (bucket) => ({
      createSignedUrl: async (where, seconds) => {
        signed.push({ bucket, where, seconds });
        return { data: { signedUrl: SIGNED }, error: null };
      },
    }),
  };
  setPg(db);
  const ask = (body = { tenant_id: T, user_id: U, preview: VERSION }) => answerAdPreview(auth, body);
  return { ask, signed };
}
const heard = async (res) => [res.status, await res.json()];

/** Each line the logger writes while `run` runs. */
async function logsOf(run) {
  const lines = [];
  const kept = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
  process.stdout.write = (chunk, ...rest) => (lines.push(String(chunk)), kept.out(chunk, ...rest));
  process.stderr.write = (chunk, ...rest) => (lines.push(String(chunk)), kept.err(chunk, ...rest));
  try {
    return { value: await run(), lines };
  } finally {
    process.stdout.write = kept.out;
    process.stderr.write = kept.err;
  }
}

test("asked only where this deployment offers Ads in the workspace, and with no switch for presses, since it makes nothing", async () => {
  const w = world();
  process.env.ADS_WORKSPACES = "another-workspace";
  const [status, body] = await heard(await w.ask());
  assert.deepEqual([status, body.error], [409, "meta_off"]);
  assert.deepEqual(asked, [], "Meta is asked nothing");
  process.env.ADS_WORKSPACES = T;
  assert.equal(process.env.ADS_WRITES, undefined);
  const [drawnStatus, drawn] = await heard(await w.ask());
  assert.deepEqual([drawnStatus, drawn.outcome], [200, "drawn"], "no switch for presses is needed");
});

test("a version it can't read, or a workspace the token doesn't name, is refused before anything is asked", async () => {
  const w = world();
  for (const preview of [
    undefined,
    { ...VERSION, picture: "a file" },
    { ...VERSION, text: " " },
    { ...VERSION, headline: "" },
  ]) {
    const [status, body] = await heard(await w.ask({ tenant_id: T, user_id: U, preview }));
    assert.deepEqual([status, body.error], [400, "bad_request"]);
  }
  const other = "abababab-8888-4000-8000-000000000002";
  const [status, body] = await heard(await w.ask({ tenant_id: other, user_id: U, preview: VERSION }));
  assert.deepEqual([status, body.error], [403, "workspace_mismatch"]);
  assert.deepEqual(asked, []);
});

test("each place is asked once, all at once, every one a read, with the picture's signed address of the file as Files keeps it", async () => {
  const w = world();
  const [status, body] = await heard(await w.ask());
  assert.equal(status, 200);
  assert.deepEqual(asked.map((one) => one.place).sort(), ["feed", "reel", "story"]);
  assert.ok(
    asked.every((one) => one.method === "GET" && one.body === null),
    "a read, nothing posted",
  );
  assert.ok(asked.every((one) => one.url.pathname.endsWith(`/act_${META_ACCOUNT}/generatepreviews`)));
  assert.ok(asked.every((one) => one.url.searchParams.get("access_token") === "the-business-token"));
  // The picture as Files keeps it (what Turn on sends), signed for a day: as long as Meta's frame lasts.
  assert.deepEqual(w.signed, [{ bucket: "files", where: filePathOf(T, FILE, "image/png"), seconds: 86_400 }]);
  for (const one of asked) {
    const creative = JSON.parse(one.url.searchParams.get("creative"));
    assert.equal(creative.object_story_spec.page_id, PAGE);
    assert.equal(creative.object_story_spec.link_data.picture, SIGNED);
    assert.equal(creative.object_story_spec.link_data.message, VERSION.text);
    assert.equal(creative.object_story_spec.link_data.name, VERSION.headline);
  }
  assert.equal(body.outcome, "drawn");
  assert.deepEqual(body.places, [
    { place: "feed", src: frameOf("feed"), width: 335, height: 580, fault: null },
    { place: "story", src: frameOf("story"), width: 335, height: 580, fault: null },
    { place: "reel", src: frameOf("reel"), width: 335, height: 580, fault: null },
  ]);
});

test("Meta is asked nothing where the account is not connected, its pace holds it back, its sign-in is gone, or the picture can't be one", async () => {
  const cases = [
    [{ account: { status: "revoked" } }, "not_connected"],
    [{ account: { config: {} } }, "not_connected"],
    [{ account: { read_after: new Date(Date.now() + 60_000).toISOString() } }, "slowed"],
    [{ signedIn: false }, "signed_out"],
    [{ file: { mime: "video/mp4" } }, "video"],
    [{ file: { removed_at: new Date().toISOString() } }, "no_picture"],
    [{ file: { tenant_id: "abababab-8888-4000-8000-000000000009" } }, "no_picture"],
  ];
  for (const [over, outcome] of cases) {
    const [status, body] = await heard(await world(over).ask());
    assert.deepEqual([status, body.outcome, body.places], [200, outcome, []], outcome);
    assert.deepEqual(asked, [], `${outcome}: Meta is asked nothing`);
  }
  // A pace that has passed holds nothing back.
  const [, passed] = await heard(
    await world({ account: { read_after: new Date(Date.now() - 1000).toISOString() } }).ask(),
  );
  assert.equal(passed.outcome, "drawn");
});

test("a place Meta did not draw says what stood in its way, and the outcome says what they came to", async () => {
  const w = world();
  answerFor = { story: "refused" };
  const [, partly] = await heard(await w.ask());
  assert.equal(partly.outcome, "partly");
  assert.deepEqual(
    partly.places.map((one) => [one.place, one.src !== null, one.fault]),
    [
      ["feed", true, null],
      ["story", false, "refused"],
      ["reel", true, null],
    ],
  );
  const outcomes = [
    [{ feed: "silent", story: "silent", reel: "silent" }, "silent"],
    [{ feed: "slowed", story: "silent", reel: "silent" }, "slowed"],
    [{ feed: "revoked", story: "revoked", reel: "revoked" }, "signed_out"],
    [{ feed: "refused", story: "silent", reel: "refused" }, "refused"],
    [{ feed: "elsewhere", story: "elsewhere", reel: "elsewhere" }, "refused"],
  ];
  for (const [set, outcome] of outcomes) {
    answerFor = set;
    const [, body] = await heard(await w.ask());
    assert.equal(body.outcome, outcome, JSON.stringify(set));
    assert.ok(body.places.every((one) => one.src === null));
  }
  // A frame of anywhere but Meta's own preview page is never handed on.
  answerFor = { feed: "elsewhere" };
  const [, one] = await heard(await w.ask());
  assert.deepEqual(one.places[0], { place: "feed", src: null, width: null, height: null, fault: "unread" });
});

test("Meta's own words reach the log and never the answer; the picture's address reaches neither", async () => {
  const w = world();
  answerFor = { feed: "refused" };
  const { value, lines } = await logsOf(async () => heard(await w.ask()));
  const [, body] = value;
  assert.ok(!JSON.stringify(body).includes("Invalid parameter"), "Meta's words are not in the answer");
  assert.ok(!JSON.stringify(body).includes(SIGNED), "nor the picture's address");
  const line = lines.find((one) => one.includes('"ads_previewed"'));
  assert.ok(line, "one line for the preview");
  assert.match(line, /Invalid parameter: the picture/);
  assert.ok(!lines.some((one) => one.includes("a-day")), "the picture's address is in no line");
});
