/**
 * A made video is cut from the video platform's playback copy of each clip, and only the parts a cut needs are fetched: the
 * copy's first part, then the segments the cut's seconds touch. A playback copy is a list of such parts, so which ones is read
 * off the lists, here, and the machine that draws is handed addresses and decides nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { readStreamCopy, streamCopyOf, streamCutPartsOf, streamFullSizeOf, streamRenditionsOf } = await import(
  at("packages/channels/src/files/stream-cut.ts")
);

const HOST = "https://customer-abc123.cloudflarestream.com";
const MASTER_URL = `${HOST}/TOKEN/manifest/video.m3u8`;
const MASTER = [
  "#EXTM3U",
  "#EXT-X-VERSION:6",
  "#EXT-X-INDEPENDENT-SEGMENTS",
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_audio",NAME="original",DEFAULT=YES,URI="stream_audio.m3u8?p=1"',
  '#EXT-X-STREAM-INF:RESOLUTION=480x852,CODECS="avc1.64001f,mp4a.40.2",BANDWIDTH=1100000,FRAME-RATE=30.000,AUDIO="group_audio"',
  "stream_480.m3u8?p=1",
  '#EXT-X-STREAM-INF:RESOLUTION=720x1280,CODECS="avc1.64001f,mp4a.40.2",BANDWIDTH=2574000,FRAME-RATE=30.000,AUDIO="group_audio"',
  "stream_720.m3u8?p=1",
  '#EXT-X-STREAM-INF:RESOLUTION=240x426,CODECS="avc1.42c015,mp4a.40.2",BANDWIDTH=350000,FRAME-RATE=30.000,AUDIO="group_audio"',
  "stream_240.m3u8?p=1",
  "",
].join("\n");
const MEDIA_URL = `${HOST}/TOKEN/manifest/stream_720.m3u8?p=1`;
const MEDIA = [
  "#EXTM3U",
  "#EXT-X-VERSION:6",
  "#EXT-X-TARGETDURATION:4",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  '#EXT-X-MAP:URI="../../abc/video/720/init.mp4?p=1"',
  "#EXTINF:4.000,",
  "../../abc/video/720/seg_1.mp4?p=1",
  "#EXTINF:4.000,",
  "../../abc/video/720/seg_2.mp4?p=1",
  "#EXTINF:3.690,",
  "../../abc/video/720/seg_3.mp4?p=1",
  "#EXT-X-ENDLIST",
  "",
].join("\r\n");

test("a playback list's copies are read with their sizes and their own lists' addresses", () => {
  assert.deepEqual(streamRenditionsOf(MASTER, MASTER_URL), [
    { width: 480, height: 852, url: `${HOST}/TOKEN/manifest/stream_480.m3u8?p=1` },
    { width: 720, height: 1280, url: `${HOST}/TOKEN/manifest/stream_720.m3u8?p=1` },
    { width: 240, height: 426, url: `${HOST}/TOKEN/manifest/stream_240.m3u8?p=1` },
  ]);
  assert.deepEqual(streamRenditionsOf("not a list", MASTER_URL), []);
});

test("a copy's list gives its first part, each segment's place in the clip, and the clip's real length", () => {
  const copy = streamCopyOf(MEDIA, MEDIA_URL);
  assert.equal(copy.init, `${HOST}/abc/video/720/init.mp4?p=1`);
  assert.deepEqual(
    copy.segments.map((s) => [s.url.split("/").pop(), s.from, s.to]),
    [
      ["seg_1.mp4?p=1", 0, 4],
      ["seg_2.mp4?p=1", 4, 8],
      ["seg_3.mp4?p=1", 8, 11.69],
    ],
  );
  assert.equal(copy.seconds, 11.69);
  assert.equal(
    streamCopyOf("#EXTM3U\n#EXTINF:4.0,\nseg.ts\n", MEDIA_URL),
    null,
    "a copy with no first part is not one to join",
  );
});

test("a cut is its copy's first part and every segment its seconds touch, in order", () => {
  const copy = streamCopyOf(MEDIA, MEDIA_URL);
  const names = (from, to) => streamCutPartsOf(copy, from, to).map((u) => u.split("/").pop().split("?")[0]);
  assert.deepEqual(names(2.3, 3.9), ["init.mp4", "seg_1.mp4"]);
  assert.deepEqual(names(2.3, 4.8), ["init.mp4", "seg_1.mp4", "seg_2.mp4"]);
  assert.deepEqual(names(9.8, 11.6), ["init.mp4", "seg_3.mp4"]);
  // A cut that ends where a segment begins does not need that segment.
  assert.deepEqual(names(0, 4), ["init.mp4", "seg_1.mp4"]);
  assert.deepEqual(names(0, 11.69), ["init.mp4", "seg_1.mp4", "seg_2.mp4", "seg_3.mp4"]);
});

test("the full-size copy is the tallest, and it is there only once it is as large as the clip itself", () => {
  const all = streamRenditionsOf(MASTER, MASTER_URL);
  assert.equal(streamFullSizeOf(all, { width: 720, height: 1280 })?.height, 1280);
  // A phone's clip is larger than what is there so far: the platform has not made its sharpest copy yet.
  assert.equal(streamFullSizeOf(all, { width: 1080, height: 1920 }), null);
  // The platform makes nothing larger than 1080 across: a larger clip's full-size copy is that one.
  const top = [...all, { width: 1080, height: 1920, url: "x" }];
  assert.equal(streamFullSizeOf(top, { width: 2160, height: 3840 })?.height, 1920);
  // A clip turned on its side is measured by its short side too.
  assert.equal(streamFullSizeOf([{ width: 1280, height: 720, url: "x" }], { width: 1280, height: 720 })?.width, 1280);
  // A clip whose size the platform never said is taken at what is there.
  assert.equal(streamFullSizeOf(all, { width: null, height: null })?.height, 1280);
  assert.equal(streamFullSizeOf([], { width: 720, height: 1280 }), null);
});

test("a clip's full-size copy is read through the two lists, or says why it could not be", async () => {
  const asked = [];
  const answer = (lists) => ({
    fetch: async (url) => {
      asked.push(String(url));
      const body = lists[String(url)];
      return body === undefined ? new Response("no", { status: 404 }) : new Response(body, { status: 200 });
    },
  });
  const clip = { width: 720, height: 1280 };
  const read = await readStreamCopy("abc123", "TOKEN", clip, answer({ [MASTER_URL]: MASTER, [MEDIA_URL]: MEDIA }));
  assert.equal(read.ok, true);
  assert.equal(read.copy.seconds, 11.69);
  assert.equal(read.height, 1280);
  assert.deepEqual(asked, [MASTER_URL, MEDIA_URL]);
  const early = await readStreamCopy(
    "abc123",
    "TOKEN",
    { width: 1080, height: 1920 },
    answer({ [MASTER_URL]: MASTER }),
  );
  assert.deepEqual(early, { ok: false, why: "not_full_size" });
  const unread = await readStreamCopy("abc123", "TOKEN", clip, answer({}));
  assert.deepEqual(unread, { ok: false, why: "unread" });
});
