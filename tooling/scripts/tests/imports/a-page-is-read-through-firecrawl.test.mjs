/**
 * A business's page is read through Firecrawl (31 Oct 2026, Ruben: "we are not a website reading software"): channels'
 * one reader (site-reads.ts firecrawlReader) asks the provider's scrape for the page as a browser draws it and its main
 * content as Markdown, its key in a header, through the platform's one provider transport; and the edge's sitePage
 * (lib/public-page.ts) judges the address before asking and the address the page landed at after, and holds what it
 * hands on to its caller's measure. Run with the provider answered by the test; nothing here reaches the network. The
 * suites' own stand-in for the reader (calendar/_stand-in-network.mjs) is set aside for each test and put back.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  FIRECRAWL_SCRAPE,
  firecrawlReader,
  resetBreakers,
  setSitePageReader,
  sitePageReader,
} from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";

const KEY = "fc-made-up-for-this-file";
const was = process.env.FIRECRAWL_API_KEY;
after(() => {
  if (was === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = was;
});
const { sitePage } = await importSrc("apps/edge/lib/public-page.ts");

const HTML = `<html><head><title>Harbor Moving</title></head><body><h1>Harbor Moving</h1><p>From $300.</p></body></html>`;
/** The scrape's answer for a page drawn, as the provider's API reference gives it. */
const drawn = (over = {}) => ({
  success: true,
  data: {
    markdown: "# Harbor Moving\n\nFrom $300.",
    rawHtml: HTML,
    metadata: { title: "Harbor Moving", statusCode: 200, url: "https://www.harbormoving.example/", ...over },
  },
});
/** The provider, answered by the test: each call kept with what it was sent, each answered by `answer`. */
function provider(answer) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    const a = await answer();
    return a instanceof Response
      ? a
      : new Response(JSON.stringify(a), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch };
}
/** The suites' stand-in set aside, `run` run, and the stand-in put back. */
async function withoutStandIn(run) {
  const before = setSitePageReader(null);
  resetBreakers();
  try {
    return await run();
  } finally {
    setSitePageReader(before);
    resetBreakers();
  }
}

test("one scrape for one page: the page as a browser drew it and its main content as Markdown, the key in a header, where the redirects landed", async () => {
  await withoutStandIn(async () => {
    const p = provider(() => drawn());
    const page = await firecrawlReader(KEY, { fetch: p.fetch })("https://harbormoving.example/", { timeoutMs: 6_000 });
    assert.deepEqual(page, {
      url: "https://www.harbormoving.example/",
      html: HTML,
      markdown: "# Harbor Moving\n\nFrom $300.",
    });
    assert.equal(p.calls.length, 1);
    const [call] = p.calls;
    assert.equal(call.url, FIRECRAWL_SCRAPE);
    assert.equal(call.headers.get("authorization"), `Bearer ${KEY}`);
    assert.deepEqual(call.body, {
      url: "https://harbormoving.example/",
      formats: ["rawHtml", "markdown"],
      onlyMainContent: true,
      timeout: 6_000,
    });
    // The provider takes no bound under a second.
    await firecrawlReader(KEY, { fetch: p.fetch })("https://harbormoving.example/", { timeoutMs: 400 });
    assert.equal(p.calls[1].body.timeout, 1_000);
  });
});

test("a page the provider could not draw, one that answered an error, a refusal, an outage and no answer are each no page, never a throw", async () => {
  await withoutStandIn(async () => {
    const read = (answer) =>
      firecrawlReader(KEY, { fetch: provider(answer).fetch })("https://harbormoving.example/", { timeoutMs: 2_000 });
    assert.equal(await read(() => ({ success: false, error: "could not scrape" })), null);
    assert.equal(await read(() => drawn({ statusCode: 404 })), null, "the site's own 404");
    assert.equal(await read(() => ({ success: true, data: { markdown: "", metadata: { statusCode: 200 } } })), null);
    assert.equal(await read(() => new Response('{"error":"Payment required"}', { status: 402 })), null, "no credits");
    assert.equal(await read(() => new Response("bad gateway", { status: 502 })), null);
    assert.equal(
      await read(() => {
        throw new Error("offline");
      }),
      null,
    );
    // No final address said: the one asked stands.
    const asked = await read(() => drawn({ url: undefined }));
    assert.equal(asked.url, "https://harbormoving.example/");
  });
});

test("the reader is a test's where one stands in, the provider's with a key, and none without one", async () => {
  await withoutStandIn(async () => {
    assert.equal(sitePageReader(undefined), null);
    assert.equal(sitePageReader(""), null);
    assert.equal(typeof sitePageReader(KEY), "function");
    const mine = async () => null;
    setSitePageReader(mine);
    assert.equal(sitePageReader(undefined), mine, "a stand-in needs no key");
  });
});

test("the edge's read: no key reads nothing; a private address is never asked for; a page that landed in one is not read; what is handed on is held to the caller's measure", async () => {
  await withoutStandIn(async () => {
    delete process.env.FIRECRAWL_API_KEY;
    assert.equal(await sitePage("https://harbormoving.example/", { timeoutMs: 2_000, maxChars: 100 }), null);

    const asked = [];
    let landed = "https://www.harbormoving.example/";
    setSitePageReader(async (url) => {
      asked.push(url);
      return { url: landed, html: HTML, markdown: "# Harbor Moving\n\nFrom $300." };
    });
    for (const inside of ["http://10.0.0.5/", "http://169.254.169.254/latest/meta-data", "http://[fd00::1]/", null])
      assert.equal(await sitePage(inside, { timeoutMs: 2_000, maxChars: 100 }), null, String(inside));
    assert.deepEqual(asked, [], "nothing asked for a private address");

    const page = await sitePage("https://harbormoving.example", { timeoutMs: 2_000, maxChars: 20 });
    assert.deepEqual(page, {
      url: "https://www.harbormoving.example/",
      html: HTML.slice(0, 20),
      markdown: "# Harbor Moving\n\nFro",
    });
    assert.deepEqual(asked, ["https://harbormoving.example/"]);

    landed = "http://169.254.169.254/latest/meta-data";
    assert.equal(await sitePage("https://harbormoving.example/", { timeoutMs: 2_000, maxChars: 100 }), null);
  });
});
