/**
 * The look for a workspace's logo on the business's own website (00407), on the edge (lib/imports/logo-lookup.ts and
 * its door, POST /api/admin/imports/logo-lookup), where the page reader's key is: which website is looked at, the home
 * page read by the platform's page reader (stood in for: channels setSitePageReader), the picture asked for over the
 * guarded fetch (stood in for: setPublicFetch), and what the look answers. Run over a database in memory; nothing here
 * reaches the network. The dashboard's route, which asks this door, is held by logo-routes.test.mjs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { parseTenantConfig } from "@chanlytics/contracts";
import { setPublicFetch, setSitePageReader, signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const SECRET = "edge-secret-for-this-file";
const was = process.env.EDGE_CALL_SECRET;
process.env.EDGE_CALL_SECRET = SECRET;
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const door = await importSrc("apps/edge/api/admin/imports/logo-lookup.ts");
// The suites' own stand-ins, put back once this file is done.
const pages = setSitePageReader(null);
const pictures = setPublicFetch(null);
after(() => {
  setPg(null);
  setSitePageReader(pages);
  setPublicFetch(pictures);
  if (was === undefined) delete process.env.EDGE_CALL_SECRET;
  else process.env.EDGE_CALL_SECRET = was;
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const AUD = "/api/admin/imports/logo-lookup";

const CONFIG = (website) => ({
  brain: {
    business_name: "Bella Studio",
    system_prompt: "x".repeat(50),
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: website ? { website } : {},
  },
});

/** The workspace's tables for a look: its config (the owner's website) and its linked listing (Google's). */
function world({ own = null, google = null } = {}) {
  const db = fakeDb({
    tenant_config: [{ tenant_id: A, config: CONFIG(own) }],
    google_listings: google ? [{ tenant_id: A, place_id: "p1", facts: { website: google } }] : [],
  });
  setPg(db);
  return db;
}

/** A PNG's first bytes, saying its size: all the look reads of a picture. */
function pngHead(w, h) {
  const b = Buffer.alloc(64);
  b.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/**
 * The web as the look meets it: each home page the reader draws (`sites`, its address as asked), and each picture the
 * guarded fetch answers (`images`). Anything else is not reached. Every address asked is kept, in the order asked.
 */
function web({ sites = {}, images = {} } = {}) {
  const asked = [];
  setSitePageReader(async (url) => {
    asked.push(url);
    const head = sites[url];
    return head === undefined ? null : { url, html: `<html><head>${head}</head><body></body></html>`, markdown: "" };
  });
  setPublicFetch(async (url) => {
    asked.push(String(url));
    const bytes = images[String(url)];
    if (!bytes) throw new TypeError("fetch failed");
    return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
  });
  return asked;
}

/** The door, knocked on as the dashboard knocks: a token minted for its path, the workspace and the body. */
async function knock(body, { workspace = A } = {}) {
  const raw = JSON.stringify({ tenant_id: A, ...body });
  const res = await door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-token": signEdgeToken(SECRET, AUD, { workspace, user: U, body: raw }),
      },
      body: raw,
    }),
  );
  return [res.status, await res.json()];
}

/** The look for a workspace with these websites (`world`), as the door answers it. */
async function lookFor(websites) {
  world(websites);
  const [status, { ok, ...answer }] = await knock({});
  assert.deepEqual([status, ok], [200, true]);
  return answer;
}

test("a config the test builds is one the edge reads, so the owner's website is what the look reads first", () => {
  assert.equal(
    parseTenantConfig(CONFIG("https://bellastudio.example.com"))?.brain?.profile?.website,
    "https://bellastudio.example.com",
  );
});

test("the look reads the owner's website, finds what it declares as its logo, and answers the picture with the site's host", async () => {
  const asked = web({
    sites: {
      "https://bellastudio.example.com/":
        '<script type="application/ld+json">{"@type":"Organization","logo":"https://cdn.example.net/bella-logo.png"}</script>',
    },
    images: { "https://cdn.example.net/bella-logo.png": pngHead(400, 300) },
  });
  const out = await lookFor({ own: "https://www.bellastudio.example.com/about", google: "https://other.example.org" });
  assert.equal(out.outcome, "found");
  assert.equal(out.host, "bellastudio.example.com", "the website's host the owner gave, never the image's");
  assert.equal(out.image.content_type, "image/png");
  assert.deepEqual(Buffer.from(out.image.base64, "base64"), pngHead(400, 300));
  assert.deepEqual(
    asked,
    [
      "https://www.bellastudio.example.com/",
      "https://bellastudio.example.com/",
      "https://cdn.example.net/bella-logo.png",
    ],
    "the website as the owner typed it first, then its other spelling, which answers here",
  );
});

test("a website that is a page on another service is not looked at: its logo would be the service's", async () => {
  const asked = web();
  assert.deepEqual(
    await lookFor({ own: "https://www.facebook.com/bellastudio", google: "https://booksy.com/en-us/123_bella" }),
    { outcome: "not_its_own", host: null },
  );
  assert.deepEqual(asked, [], "nothing asked of anyone");
});

test("the owner's website being another service's page, the listing's own website is looked at instead", async () => {
  web({
    sites: {
      "https://bella.example.org/": '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    },
    images: { "https://bella.example.org/apple-touch-icon.png": pngHead(180, 180) },
  });
  const out = await lookFor({ own: "https://instagram.com/bella", google: "https://bella.example.org" });
  assert.deepEqual([out.outcome, out.host], ["found", "bella.example.org"]);
});

test("no website at all says so; a site that cannot be read says so; one with nothing usable says so", async () => {
  web({
    sites: {
      "https://quiet.example.com/": [
        '<link rel="icon" type="image/svg+xml" href="/mark.svg">',
        '<link rel="icon" href="/favicon.ico">',
        '<link rel="apple-touch-icon" href="https://quiet.example.com:8443/touch.png">',
        '<link rel="icon" sizes="64x64" href="/small.png">',
      ].join(""),
    },
    images: { "https://quiet.example.com/small.png": pngHead(64, 64) },
  });
  assert.deepEqual(await lookFor(), { outcome: "no_website", host: null });
  assert.deepEqual(await lookFor({ own: "https://down.example.com" }), {
    outcome: "unreachable",
    host: "down.example.com",
  });
  assert.deepEqual(
    await lookFor({ own: "https://quiet.example.com" }),
    { outcome: "none", host: "quiet.example.com" },
    "an SVG, a favicon file, a candidate on another port and a picture too small are each passed over",
  );
});

test("our own website is no business's logo", async () => {
  const asked = web();
  assert.deepEqual(await lookFor({ own: "https://app.chanlytics.com/b/bella" }), {
    outcome: "not_its_own",
    host: null,
  });
  assert.deepEqual(asked, []);
});

test("the dashboard's door answers the look for the workspace its token names, and refuses another workspace's", async () => {
  web();
  world();
  assert.deepEqual(await knock({}), [200, { ok: true, outcome: "no_website", host: null }]);
  const [status] = await knock({}, { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  assert.equal(status, 403);
});
