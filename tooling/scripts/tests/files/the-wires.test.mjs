/**
 * The wires Files rides (decision 0099): a copy to Anthropic and back, a profile's photos and a listing's, each read as the
 * provider's documented shape over a fetch that answers from memory, and the fingerprint that makes two files one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { deleteClaudeFile, uploadClaudeFile } = await importSrc("packages/channels/src/models/anthropic-files.ts");
const { FINGERPRINT_BYTES, fileFingerprintOf } = await importSrc("packages/channels/src/file-fingerprint.ts");
const { listMedia } = await importSrc("packages/channels/src/google/google-profile.ts");
const { PLACES_DETAILS_MASK, parsePlaceDetails, placePhotoUri } = await importSrc(
  "packages/channels/src/google/google-places.ts",
);

/** A fetch that answers one thing and keeps what it was asked. */
function answering(status, body) {
  const asked = [];
  const fetch = async (url, init) => {
    asked.push({ url: String(url), init });
    return new Response(body === null ? null : JSON.stringify(body), { status });
  };
  return { fetch, asked };
}

const FILE = { bytes: new Uint8Array([1, 2, 3]), mime: "image/webp", name: "f.webp", expiresInSeconds: 7_776_000 };

test("a copy goes up as a form on the Messages API's version, with its expiry, and no beta", async () => {
  const net = answering(200, { id: "file_abc", expires_at: "2027-02-01T00:00:00Z" });
  const up = await uploadClaudeFile("key", FILE, { fetch: net.fetch });
  assert.deepEqual(up, { ok: true, id: "file_abc", expiresAt: "2027-02-01T00:00:00Z" });
  const { url, init } = net.asked[0];
  assert.equal(url, "https://api.anthropic.com/v1/files");
  assert.equal(new Headers(init.headers).get("anthropic-version"), "2023-06-01");
  assert.equal(new Headers(init.headers).get("anthropic-beta"), null);
  assert.equal(init.body.get("expires_in_seconds"), "7776000");
  assert.equal(init.body.get("file").type, "image/webp");
  assert.equal(init.body.get("file").name, "f.webp");
});

test("an answer that names no file is no copy, and a refusal says why without being thrown", async () => {
  assert.equal((await uploadClaudeFile("key", FILE, { fetch: answering(200, { nope: 1 }).fetch })).ok, false);
  assert.equal((await uploadClaudeFile("key", FILE, { fetch: answering(200, { id: "msg_1" }).fetch })).ok, false);
  assert.equal((await uploadClaudeFile("key", FILE, { fetch: answering(400, { error: "x" }).fetch })).ok, false);
});

test("a copy already gone counts as gone, and one that stayed does not", async () => {
  assert.equal(await deleteClaudeFile("key", "file_abc", { fetch: answering(200, { id: "file_abc" }).fetch }), true);
  assert.equal(await deleteClaudeFile("key", "file_abc", { fetch: answering(404, { error: "gone" }).fetch }), true);
  assert.equal(await deleteClaudeFile("key", "file_abc", { fetch: answering(403, { error: "no" }).fetch }), false);
});

test("two files are one by their first MiB and their size, and a change past the MiB shows in the size", () => {
  const a = new Uint8Array(FINGERPRINT_BYTES + 10).fill(7);
  const b = new Uint8Array(FINGERPRINT_BYTES + 10).fill(7);
  b[FINGERPRINT_BYTES + 5] = 9;
  assert.equal(fileFingerprintOf(a, a.length), fileFingerprintOf(b, b.length));
  assert.notEqual(fileFingerprintOf(a, a.length), fileFingerprintOf(a, a.length + 1));
  assert.notEqual(fileFingerprintOf(new Uint8Array([1]), 1), fileFingerprintOf(new Uint8Array([2]), 1));
  assert.match(fileFingerprintOf(a, a.length), /^[0-9a-f]{64}$/);
});

test("a profile's photos are asked of the location's own list, a page at a time", async () => {
  const asked = [];
  const http = async (req) => {
    asked.push(req);
    return { status: 200, body: "{}" };
  };
  await listMedia(http, "tok", "accounts/1/locations/2", "next");
  const [req] = asked;
  assert.ok(req.url.startsWith("https://mybusiness.googleapis.com/v4/accounts/1/locations/2/media?"));
  assert.match(req.url, /pageToken=next/);
  assert.equal(req.headers.Authorization, "Bearer tok");
});

test("only photos are taken from a profile, each at the size asked for", async () => {
  const answering = (body) => async () => ({ status: 200, body: JSON.stringify(body) });
  const page = await listMedia(
    answering({
      mediaItems: [
        {
          name: "m/1",
          mediaFormat: "PHOTO",
          googleUrl: "https://lh3.example/p/abc=s512",
          locationAssociation: { category: "EXTERIOR" },
        },
        { name: "m/2", mediaFormat: "PHOTO", googleUrl: "https://lh3.example/p/def" },
        { name: "m/3", mediaFormat: "VIDEO", googleUrl: "https://lh3.example/v/ghi" },
        { name: "m/4", mediaFormat: "PHOTO" },
      ],
      nextPageToken: "more",
    }),
    "tok",
    "accounts/1/locations/2",
  );
  assert.deepEqual(page.photos, [
    { name: "m/1", url: "https://lh3.example/p/abc=s2400", category: "EXTERIOR" },
    { name: "m/2", url: "https://lh3.example/p/def=s2400", category: null },
  ]);
  assert.equal(page.next_page_token, "more");
  assert.deepEqual(await listMedia(answering({}), "tok", "accounts/1/locations/2"), {
    photos: [],
    next_page_token: null,
  });
});

test("a listing's read asks for its photos, and says who each is by", () => {
  assert.match(PLACES_DETAILS_MASK, /(^|,)photos(,|$)/);
  const place = parsePlaceDetails({
    id: "p1",
    displayName: { text: "Harbor" },
    photos: [
      { name: "places/p1/photos/a", authorAttributions: [{ displayName: "Harbor" }] },
      { name: "places/p1/photos/b", authorAttributions: [{ displayName: "A Customer" }] },
      { name: "places/p1/photos/c" },
      { authorAttributions: [{ displayName: "No name" }] },
    ],
  });
  assert.deepEqual(place.photos, [
    { name: "places/p1/photos/a", author: "Harbor" },
    { name: "places/p1/photos/b", author: "A Customer" },
    { name: "places/p1/photos/c", author: null },
  ]);
  assert.deepEqual(parsePlaceDetails({ id: "p1", displayName: { text: "Harbor" } }).photos, []);
});

test("a listing's photo is asked for its address now, with the key in a header and never in the address", async () => {
  const asked = [];
  const http = async (req) => {
    asked.push(req);
    return { status: 200, body: JSON.stringify({ photoUri: "https://lh3.example/x" }) };
  };
  assert.equal(await placePhotoUri(http, "secret", "places/p1/photos/a"), "https://lh3.example/x");
  assert.equal(
    asked[0].url,
    "https://places.googleapis.com/v1/places/p1/photos/a/media?maxWidthPx=2400&skipHttpRedirect=true",
  );
  assert.equal(asked[0].headers["X-Goog-Api-Key"], "secret");
  const none = async () => ({ status: 200, body: "{}" });
  assert.equal(await placePhotoUri(none, "secret", "places/p1/photos/a"), null);
});
