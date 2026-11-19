/**
 * The ad a person clicked to write (the Reports lenses spec, K3): Meta names it in messages[].referral, and the edge
 * writes its id and kind, nothing else, with the line the message came in on into the inbound row's meta, where the
 * database's first-touch trigger (00306) reads them. A message with neither writes neither key.
 *
 * What the ad said (decision 0049, step P0a) is read from the same referral, each part alone, and kept beside the
 * message once it has landed (ad_entry_keep), never in its meta: nothing an advertiser typed can cost a customer's
 * message its place. The click id is never read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeInbound, inboundFromWhatsapp } from "@chanlytics/channels/whatsapp";
import { AD_SAID_MAX, REFERRAL_ID_MAX } from "../../packages/channels/src/whatsapp/first-touch.ts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { runPgIngest, IngestFailed } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/inbound/persist.ts")).href
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

/** A referral that says nothing sound beyond its id and kind. */
const bare = (sourceId, sourceType) => ({ sourceId, sourceType, said: null });

test("the ad is read by its id, its kind and what it said, and never its click id", () => {
  const n = normalizeInbound(
    message({
      referral: {
        source_id: "120200000000001",
        source_type: "ad",
        headline: "Spring gel refills",
        body: "Book a refill this week.",
        media_type: "image",
        source_url: "https://fb.example/ad/1",
        image_url: "https://cdn.example/ad-1.jpg",
        ctwa_clid: "click-id",
        welcome_message: { text: "Hi! How can we help?" },
      },
    }),
    value,
  );
  assert.deepEqual(n.referral, {
    sourceId: "120200000000001",
    sourceType: "ad",
    said: {
      headline: "Spring gel refills",
      body: "Book a refill this week.",
      media_type: "image",
      link: "https://fb.example/ad/1",
    },
  });
  assert.equal(JSON.stringify(n).includes("click-id"), false, "the click id is nowhere in what was read");
});

test("a message with no referral, a blank id or an id no column could keep has none", () => {
  assert.equal(normalizeInbound(message(), value).referral, null);
  assert.equal(normalizeInbound(message({ referral: { source_id: "  ", source_type: "ad" } }), value).referral, null);
  assert.equal(normalizeInbound(message({ referral: { source_type: "ad" } }), value).referral, null);
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "9".repeat(REFERRAL_ID_MAX), source_type: "ad" } }), value)
      .referral,
    bare("9".repeat(REFERRAL_ID_MAX), "ad"),
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
    bare("77", null),
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
  assert.deepEqual(pair.referral, bare("ad-\u{1f600}-1", "ad"), "a whole surrogate pair is a character");
});

test("a padded id is trimmed, not refused: padding is not part of an id, and the database trims the same", () => {
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "  120200000000001  ", source_type: "ad" } }), value).referral,
    bare("120200000000001", "ad"),
  );
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "\t120200000000001\r\n", source_type: "ad" } }), value).referral,
    bare("120200000000001", "ad"),
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
    assert.deepEqual(n.referral, bare("77", null), `a kind of ${what} is none`);
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
    bare("77", null),
    "a kind that is not a string is none, and the id still stands",
  );
});

/** A database that lands every message as `m1` and answers the keep as `keepAnswer` says (a throw is its refusal). */
function world(keepAnswer = () => "kept") {
  const metas = [];
  const keeps = [];
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
      ad_entry_keep: (a) => {
        keeps.push(a);
        return keepAnswer(a);
      },
    },
  );
  return { db, metas, keeps };
}

test("pgIngest writes the line and the ad into the row's meta, beside the ingest's own key, and nothing for what a message does not have", async () => {
  const w = world();
  await runPgIngest(
    w.db,
    T,
    inboundFromWhatsapp(message({ referral: { source_id: "120200000000001", source_type: "ad" } }), value),
    LINE,
  );
  await runPgIngest(w.db, T, inboundFromWhatsapp(message({ id: "wamid.ad.2" }), value), LINE);
  await runPgIngest(w.db, T, inboundFromWhatsapp(message({ id: "wamid.ad.3" }), value));
  assert.deepEqual(w.metas, [
    { raw_type: "text", line: LINE, referral: { source_id: "120200000000001", source_type: "ad" } },
    { raw_type: "text", line: LINE },
    { raw_type: "text" },
  ]);
});

const AD = {
  source_id: "120200000000001",
  source_type: "ad",
  headline: "Spring gel refills",
  body: "Book a refill this week.",
  media_type: "video",
  source_url: "https://fb.example/ad/1",
  ctwa_clid: "click-id",
};
const saidBy = (referral) => normalizeInbound(message({ referral: { ...AD, ...referral } }), value).referral?.said;

test("each part of what the ad said is kept or dropped alone: an odd one costs the others nothing", () => {
  const sound = { headline: AD.headline, body: AD.body, media_type: "video", link: AD.source_url };
  const without = (part) => Object.fromEntries(Object.entries(sound).filter(([key]) => key !== part));
  assert.deepEqual(saidBy({}), sound);
  for (const [what, referral, want] of [
    ["a headline that is a number", { headline: 7 }, without("headline")],
    ["a headline that is an object", { headline: { text: "x" } }, without("headline")],
    ["a blank headline", { headline: "  \n " }, without("headline")],
    ["no body", { body: undefined }, without("body")],
    ["a kind of media that is a sentence", { media_type: "a video" }, without("media_type")],
    ["a kind of media of megabytes", { media_type: "x".repeat(5 * 1024 * 1024) }, without("media_type")],
    ["a link that is no web address", { source_url: "javascript:alert(1)" }, without("link")],
    ["a link with a space in it", { source_url: "https://fb.example/ad 1" }, without("link")],
    ["a link that is not a string", { source_url: ["https://fb.example/ad/1"] }, without("link")],
    [
      "a link past its bound, which is never cut",
      { source_url: `https://fb.example/${"x".repeat(AD_SAID_MAX.link)}` },
      without("link"),
    ],
  ])
    assert.deepEqual(saidBy(referral), want, what);
  assert.equal(
    saidBy({ headline: null, body: 1, media_type: [], source_url: {} }),
    null,
    "an ad that said nothing sound said nothing, and its id and kind still stand",
  );
  assert.deepEqual(
    normalizeInbound(
      message({
        referral: { source_id: "77", source_type: "ad", headline: [], body: 1, media_type: {}, source_url: 2 },
      }),
      value,
    ).referral,
    bare("77", "ad"),
  );
});

test("the words of an ad are cleaned and cut to their bound, never refused: what Postgres could not store is not in them", () => {
  assert.equal(saidBy({ headline: "  Spring\u0000 gel\ud800 refills\t " }).headline, "Spring  gel  refills");
  assert.equal(saidBy({ body: "Line one\r\nLine two\rLine three" }).body, "Line one\nLine two\nLine three");
  const long = saidBy({ headline: "h".repeat(AD_SAID_MAX.headline + 50), body: "b".repeat(5 * 1024 * 1024) });
  assert.equal(long.headline, "h".repeat(AD_SAID_MAX.headline), "cut to its bound");
  assert.equal(long.body, "b".repeat(AD_SAID_MAX.body), "megabytes cost their first characters");
  const pairs = saidBy({ headline: "\u{1f600}".repeat(AD_SAID_MAX.headline + 1) }).headline;
  assert.equal(Array.from(pairs).length, AD_SAID_MAX.headline, "counted in characters");
  assert.equal(/[\ud800-\udbff](?![\udc00-\udfff])/.test(pairs), false, "and never cut through a pair");
  const strings = Object.values(saidBy({ headline: "a\u0000b", body: "c\udc00d" }));
  assert.equal(
    strings.some((v) => typeof v === "string" && (v.includes("\u0000") || /[\ud800-\udfff]/.test(v))),
    false,
    "no NUL and no lone surrogate reaches the door",
  );
});

test("after the message lands, what the ad said is kept by the id of the message; a post, a link and no referral keep nothing", async () => {
  const w = world();
  const out = await runPgIngest(w.db, T, inboundFromWhatsapp(message({ referral: AD }), value), LINE);
  assert.equal(out.message_id, "m1");
  assert.deepEqual(w.keeps, [
    {
      p_tenant_id: T,
      p_message_id: "m1",
      p_said: {
        headline: "Spring gel refills",
        body: "Book a refill this week.",
        media_type: "video",
        link: "https://fb.example/ad/1",
      },
    },
  ]);
  assert.deepEqual(
    w.metas,
    [{ raw_type: "text", line: LINE, referral: { source_id: "120200000000001", source_type: "ad" } }],
    "and the meta of the message holds the id and the kind, as it always did",
  );

  await runPgIngest(w.db, T, inboundFromWhatsapp(message({ referral: { source_id: "77", source_type: "ad" } }), value));
  assert.deepEqual(w.keeps[1].p_said, {}, "an ad that said nothing is kept as having said nothing");

  await runPgIngest(w.db, T, inboundFromWhatsapp(message({ referral: { ...AD, source_type: "post" } }), value));
  await runPgIngest(w.db, T, inboundFromWhatsapp(message({ referral: { ...AD, source_type: undefined } }), value));
  await runPgIngest(w.db, T, inboundFromWhatsapp(message(), value));
  assert.equal(w.keeps.length, 2, "only an ad is an ad");
});

test("a keep that fails, is refused or finds no door costs the message nothing: it has landed, and the ingest answers as ever", async () => {
  const refusals = [
    () => {
      throw Object.assign(new Error("Could not find the function public.ad_entry_keep"), { code: "PGRST202" });
    },
    () => {
      throw Object.assign(new Error("unsupported Unicode escape sequence"), { code: "22P05" });
    },
    () => {
      throw new Error("the connection dropped");
    },
    () => "none",
    () => "already",
  ];
  for (const [i, answer] of refusals.entries()) {
    const w = world(answer);
    const out = await runPgIngest(w.db, T, inboundFromWhatsapp(message({ referral: AD }), value), LINE);
    assert.equal(out?.message_id, "m1", `refusal ${i}: the message landed`);
    assert.equal(w.keeps.length, 1, `refusal ${i}: asked once, never again`);
  }
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
  const rawN = { ...inboundFromWhatsapp(message(), value), referral: bare("ad\u0000x", "ad") };
  await assert.rejects(
    () => runPgIngest(raw.db, T, rawN, LINE),
    IngestFailed,
    "an edge that kept the referral whole is the one that fails",
  );
  assert.deepEqual(raw.landed, []);

  // As the edge reads it, every one of them lands.
  const w = refusingWorld();
  for (const [i, referral] of hostile.entries()) {
    const n = inboundFromWhatsapp(message({ id: `wamid.ad.h${i}`, referral }), value);
    const out = await runPgIngest(w.db, T, n, LINE);
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
