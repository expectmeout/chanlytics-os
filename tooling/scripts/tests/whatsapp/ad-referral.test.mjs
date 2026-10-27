/**
 * The ad a person clicked to write (the Reports lenses spec, K3): Meta names it in messages[].referral, and the edge
 * keeps its id and kind, nothing else, and writes them with the line the message came in on into the inbound row's
 * meta, where the database's first-touch trigger (00306) reads them. A message with neither writes neither key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeInbound, inboundFromWhatsapp } from "@chanlytics/channels";
import { REFERRAL_ID_MAX } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { pgIngest, IngestFailed } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href
);

const FROM = "15550139401";
const message = (over = {}) => ({
  from: FROM,
  id: "wamid.ad.1",
  type: "text",
  timestamp: "1790000000",
  text: { body: "Hi, I saw your ad" },
  ...over,
});
const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Dana" } }] };
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("the ad is kept by its id and kind, and nothing else of Meta's referral", () => {
  const n = normalizeInbound(
    message({
      referral: {
        source_id: "120200000000001",
        source_type: "ad",
        headline: "Spring gel refills",
        source_url: "https://fb.example/ad/1",
        ctwa_clid: "click-id",
      },
    }),
    value,
  );
  assert.deepEqual(n.referral, { sourceId: "120200000000001", sourceType: "ad" });
});

test("a message with no referral, a blank id or an id no column could keep has none", () => {
  assert.equal(normalizeInbound(message(), value).referral, null);
  assert.equal(normalizeInbound(message({ referral: { source_id: "  ", source_type: "ad" } }), value).referral, null);
  assert.equal(normalizeInbound(message({ referral: { source_type: "ad" } }), value).referral, null);
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "9".repeat(REFERRAL_ID_MAX), source_type: "ad" } }), value)
      .referral,
    { sourceId: "9".repeat(REFERRAL_ID_MAX), sourceType: "ad" },
    "the longest id the column keeps is kept",
  );
  assert.equal(
    normalizeInbound(message({ referral: { source_id: "9".repeat(REFERRAL_ID_MAX + 1), source_type: "ad" } }), value)
      .referral,
    null,
    "an id that long is not one: the stamp would be refused, so the wire stamps the person instead",
  );
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "77" } }), value).referral,
    { sourceId: "77", sourceType: null },
    "a kind Meta did not say is none",
  );
});

// What Postgres refuses inside the p_meta an id or a kind travels in: jsonb has no \u0000, and a lone surrogate is not
// valid JSON. Either would fail ingest_inbound, and a failed ingest is a 503 that Meta redelivers for ever.
const LONE_HIGH = "ad\ud800x";
const LONE_LOW = "ad\udc00x";
const HOSTILE = { nul: "ad\u0000x", "a lone high surrogate": LONE_HIGH, "a lone low surrogate": LONE_LOW };

/** The message the hostile referral came on still reads as itself. */
function assertReadAsAlways(n) {
  assert.equal(n.body, "Hi, I saw your ad");
  assert.equal(n.messageId, "wamid.ad.1");
  assert.equal(n.kind, "text");
  assert.equal(n.type, "text");
  assert.equal(n.rawType, "text");
}

test("an id that holds a NUL, a lone surrogate or any control character is no referral, and the message is read as it always was", () => {
  for (const [what, id] of [
    ...Object.entries(HOSTILE),
    ["a tab inside it", "1202\t00001"],
    ["a newline inside it", "1202\n00001"],
    ["a NUL at its end, past the padding", "120200000000001\u0000"],
    ["a control character the padding hides behind", "\u0001120200000000001"],
  ]) {
    const n = normalizeInbound(message({ referral: { source_id: id, source_type: "ad" } }), value);
    assert.equal(n.referral, null, `an id with ${what} is none`);
    assertReadAsAlways(n);
  }
  const pair = normalizeInbound(message({ referral: { source_id: "ad-\u{1f600}-1", source_type: "ad" } }), value);
  assert.deepEqual(
    pair.referral,
    { sourceId: "ad-\u{1f600}-1", sourceType: "ad" },
    "a whole surrogate pair is a character",
  );
});

test("a padded id is trimmed, not refused: padding is not part of an id, and the database trims the same", () => {
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "  120200000000001  ", source_type: "ad" } }), value).referral,
    { sourceId: "120200000000001", sourceType: "ad" },
  );
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "\t120200000000001\r\n", source_type: "ad" } }), value).referral,
    { sourceId: "120200000000001", sourceType: "ad" },
    "tabs and newlines at the ends are padding too",
  );
  assert.equal(
    normalizeInbound(message({ referral: { source_id: ` ${"9".repeat(REFERRAL_ID_MAX)} `, source_type: "ad" } }), value)
      .referral?.sourceId.length,
    REFERRAL_ID_MAX,
    "the bound is read on the trimmed id: 200 and its padding is the longest id kept",
  );
});

test("a kind that is not a plain word is null and the id stands: a NUL, a lone surrogate, a sentence, megabytes", () => {
  const five = "x".repeat(5 * 1024 * 1024);
  for (const [what, kind] of [
    ...Object.entries(HOSTILE),
    ["a space in it", "ad post"],
    ["33 characters", "a".repeat(33)],
    ["five megabytes", five],
    ["a markup tag", "<script>"],
  ]) {
    const n = normalizeInbound(message({ referral: { source_id: "77", source_type: kind } }), value);
    assert.deepEqual(n.referral, { sourceId: "77", sourceType: null }, `a kind of ${what} is none`);
    assertReadAsAlways(n);
  }
  for (const kind of ["ad", "post", "AD_2", "story-ad", "anuncio", "anúncio", "a".repeat(32), " ad "])
    assert.equal(
      normalizeInbound(message({ referral: { source_id: "77", source_type: kind } }), value).referral?.sourceType,
      kind.trim(),
      `a kind of ${JSON.stringify(kind.slice(0, 12))} is kept`,
    );
});

test("a referral Meta sent in a shape nobody checked is absent, and the message is read as it always was", () => {
  // The click-to-WhatsApp referral's real shape is unverified: whatever arrives, the message is normalized and only the
  // referral is lost.
  for (const referral of [null, "ad", 7, [], [{ source_id: "1" }], { source_id: 120200000000001 }, { source_id: {} }]) {
    const n = normalizeInbound(message({ referral }), value);
    assert.equal(n.referral, null, `a referral of ${JSON.stringify(referral)} is none`);
    assert.equal(n.body, "Hi, I saw your ad", "the message itself is untouched");
    assert.equal(n.messageId, "wamid.ad.1");
  }
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "77", source_type: 5 } }), value).referral,
    { sourceId: "77", sourceType: null },
    "a kind that is not a string is none, and the id still stands",
  );
});

function world() {
  const metas = [];
  const db = fakeDb(
    {},
    {},
    {
      ingest_inbound: (a) => {
        metas.push(a.p_meta);
        return {
          message_id: "m1",
          conversation_id: "c1",
          contact_id: "k1",
          is_new: true,
          processed: false,
          state: "open",
          paused_until: null,
        };
      },
    },
  );
  return { db, metas };
}

test("pgIngest writes the line and the ad into the row's meta, beside the ingest's own key, and nothing for what a message does not have", async () => {
  const w = world();
  await pgIngest(
    w.db,
    T,
    inboundFromWhatsapp(message({ referral: { source_id: "120200000000001", source_type: "ad" } }), value),
    LINE,
  );
  await pgIngest(w.db, T, inboundFromWhatsapp(message({ id: "wamid.ad.2" }), value), LINE);
  await pgIngest(w.db, T, inboundFromWhatsapp(message({ id: "wamid.ad.3" }), value));
  assert.deepEqual(w.metas, [
    { raw_type: "text", line: LINE, referral: { source_id: "120200000000001", source_type: "ad" } },
    { raw_type: "text", line: LINE },
    { raw_type: "text" },
  ]);
});

/**
 * `ingest_inbound` as Postgres answers it for the p_meta it is handed: a string anywhere inside holding a NUL or a lone
 * surrogate is refused (checked against the local stack: 22P05 "unsupported Unicode escape sequence" and 22P02), and the
 * ingest throws. Otherwise it lands the message, as the double above does.
 */
function refusingWorld() {
  const landed = [];
  const strings = (v) =>
    typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
  const unstorable = (s) =>
    s.includes("\u0000") || /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);
  const db = fakeDb(
    {},
    {},
    {
      ingest_inbound: (a) => {
        if (strings(a.p_meta).some(unstorable)) throw new Error("unsupported Unicode escape sequence");
        landed.push(a.p_meta);
        return {
          message_id: "m1",
          conversation_id: "c1",
          contact_id: "k1",
          is_new: true,
          processed: false,
          state: "open",
          paused_until: null,
        };
      },
    },
  );
  return { db, landed };
}

test("the same hostile referral that the database would refuse never reaches it: the message lands, with no referral and the line it came on", async () => {
  const five = "x".repeat(5 * 1024 * 1024);
  const hostile = [
    { source_id: "ad\u0000x", source_type: "ad" },
    { source_id: LONE_HIGH, source_type: "ad" },
    { source_id: "77", source_type: LONE_LOW },
    { source_id: "77", source_type: "ad\u0000" },
    { source_id: "77", source_type: five },
  ];

  // The double is faithful: handed the raw hostile referral (what an edge that kept it whole would write), it refuses,
  // and that refusal is what the door answers with a 503 for ever.
  const raw = refusingWorld();
  const rawN = { ...inboundFromWhatsapp(message(), value), referral: { sourceId: "ad\u0000x", sourceType: "ad" } };
  await assert.rejects(
    () => pgIngest(raw.db, T, rawN, LINE),
    IngestFailed,
    "an edge that kept the referral whole is the one that fails",
  );
  assert.deepEqual(raw.landed, []);

  // As the edge reads it, every one of them lands.
  const w = refusingWorld();
  for (const [i, referral] of hostile.entries()) {
    const n = inboundFromWhatsapp(message({ id: `wamid.ad.h${i}`, referral }), value);
    const out = await pgIngest(w.db, T, n, LINE);
    assert.equal(out?.message_id, "m1", `hostile referral ${i}: the message landed`);
  }
  assert.deepEqual(
    w.landed.map((m) => [m.line, m.referral ?? null]),
    [
      [LINE, null],
      [LINE, null],
      [LINE, { source_id: "77", source_type: null }],
      [LINE, { source_id: "77", source_type: null }],
      [LINE, { source_id: "77", source_type: null }],
    ],
    "what is written is the line, and the referral only where its id could be kept, with no kind that was not a word",
  );
});
