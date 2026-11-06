/**
 * A business's page is read through Firecrawl (31 Oct 2026, Ruben: "we are not a website reading software"): channels'
 * one reader (site-reads.ts firecrawlReader) asks the provider's scrape for the page as a browser draws it and its main
 * content as Markdown, its key in a header, through the platform's one provider transport; and the edge's sitePage
 * (lib/shared/public-page.ts) judges the address before asking and the address the page landed at after, and holds what it
 * hands on to its caller's measure. Run with the provider answered by the test; nothing here reaches the network. The
 * suites' own stand-in for the reader (calendar/_stand-in-network.mjs) is set aside for each test and put back.
 */
import { test, after, mock } from "node:test";
import assert from "node:assert/strict";
import {
  FIRECRAWL_CREDITS,
  FIRECRAWL_MAP,
  FIRECRAWL_SCRAPE,
  firecrawlCredits,
  firecrawlMapper,
  firecrawlReader,
  resetBreakers,
  setSiteMapper,
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
const { homePage, siteLinks, sitePage, sitePagesReadable } = await importSrc("apps/edge/lib/shared/public-page.ts");

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
    calls.push({
      url: String(url),
      headers: new Headers(init.headers),
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
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
      title: "Harbor Moving",
      description: null,
      brand: null,
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

test("a read at an owner's press asks for the page as it stands now, and for its look where it is asked; the look is read for what it is", async () => {
  await withoutStandIn(async () => {
    const read = (answer, o = {}) => {
      const p = provider(answer);
      return firecrawlReader(KEY, { fetch: p.fetch })("https://harbormoving.example/", { timeoutMs: 2_000, ...o }).then(
        (page) => ({ page, body: p.calls[0].body }),
      );
    };
    const fresh = await read(() => drawn(), { fresh: true });
    assert.equal(fresh.body.maxAge, 0, "never the provider's copy: what they just changed is what is read");
    const usual = await read(() => drawn());
    assert.equal("maxAge" in usual.body, false, "elsewhere the provider's two days will do");

    const branded = (branding) => () => {
      const a = drawn();
      a.data.branding = branding;
      return a;
    };
    const look = await read(
      branded({
        logo: "https://cdn.example/other.png",
        images: { logo: "https://cdn.example/logo.png", favicon: "https://cdn.example/f.ico" },
        colors: { primary: "#2A6F97", accent: "#000000" },
      }),
      { brand: true },
    );
    assert.deepEqual(look.body.formats, ["rawHtml", "markdown", "branding"]);
    assert.deepEqual(look.page.brand, { logo: "https://cdn.example/logo.png", colour: "#2A6F97" });
    assert.deepEqual((await read(branded({ logo: "https://cdn.example/l.png" }))).page.brand, {
      logo: "https://cdn.example/l.png",
      colour: null,
    });
    assert.deepEqual(
      (await read(branded({ images: { logo: "data:image/png;base64,AAAA" }, colors: { primary: "#111111" } }))).page
        .brand,
      {
        logo: null,
        colour: "#111111",
      },
      "bytes are no address",
    );
    for (const nothing of [null, "x", {}, { images: null, colors: null }, { logo: 7 }])
      assert.equal((await read(branded(nothing))).page.brand, null, JSON.stringify(nothing));

    // What its head says: a tag repeated comes back as a list; a link's preview stands in for a description.
    const head = await read(() =>
      drawn({ title: ["Harbor Moving", "Another"], description: undefined, ogDescription: "Family movers" }),
    );
    assert.deepEqual([head.page.title, head.page.description], ["Harbor Moving", "Family movers"]);
  });
});

test("the map: a site's pages for a few words, with what each head calls it; none on anything it could not say", async () => {
  await withoutStandIn(async () => {
    const p = provider(() => ({
      success: true,
      links: [
        { url: "https://harbormoving.example/services", title: "Our services", description: "x" },
        { url: "https://harbormoving.example/faq" },
        { title: "no address" },
        "not a link",
      ],
    }));
    const map = firecrawlMapper(KEY, { fetch: p.fetch });
    assert.deepEqual(
      await map("https://harbormoving.example/", { search: "services prices", limit: 20, timeoutMs: 3_000 }),
      [
        { url: "https://harbormoving.example/services", title: "Our services" },
        { url: "https://harbormoving.example/faq", title: null },
      ],
    );
    assert.equal(p.calls[0].url, FIRECRAWL_MAP);
    assert.equal(p.calls[0].headers.get("authorization"), `Bearer ${KEY}`);
    assert.deepEqual(p.calls[0].body, {
      url: "https://harbormoving.example/",
      search: "services prices",
      limit: 20,
      timeout: 3_000,
    });
    for (const answer of [
      () => ({ success: true }),
      () => new Response("{}", { status: 402 }),
      () => {
        throw new Error("offline");
      },
    ])
      assert.deepEqual(
        await firecrawlMapper(KEY, { fetch: provider(answer).fetch })("https://harbormoving.example/", {
          search: "x",
          limit: 1,
          timeoutMs: 1_000,
        }),
        [],
      );
  });
});

test("the credits: what the plan has left, the provider's no to the key told apart from an answer that could not be read", async () => {
  await withoutStandIn(async () => {
    const p = provider(() => ({
      success: true,
      data: { remainingCredits: 1000, planCredits: 3000, billingPeriodEnd: "2026-12-01T00:00:00Z" },
    }));
    assert.deepEqual(await firecrawlCredits(KEY, { fetch: p.fetch }), {
      kind: "read",
      remaining: 1000,
      plan: 3000,
      periodEnd: "2026-12-01T00:00:00Z",
    });
    assert.equal(p.calls[0].url, FIRECRAWL_CREDITS);
    assert.equal(p.calls[0].headers.get("authorization"), `Bearer ${KEY}`);
    const said = (answer) => firecrawlCredits(KEY, { fetch: provider(answer).fetch });
    assert.deepEqual(await said(() => new Response("{}", { status: 401 })), { kind: "refused", status: 401 });
    assert.deepEqual(await said(() => new Response("{}", { status: 500 })), { kind: "unread" });
    assert.deepEqual(await said(() => ({ success: true, data: { planCredits: 3 } })), { kind: "unread" });
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
      return {
        url: landed,
        html: HTML,
        markdown: "# Harbor Moving\n\nFrom $300.",
        title: "Harbor Moving",
        description: null,
        brand: null,
      };
    });
    for (const inside of ["http://10.0.0.5/", "http://169.254.169.254/latest/meta-data", "http://[fd00::1]/", null])
      assert.equal(await sitePage(inside, { timeoutMs: 2_000, maxChars: 100 }), null, String(inside));
    assert.deepEqual(asked, [], "nothing asked for a private address");

    const page = await sitePage("https://harbormoving.example", { timeoutMs: 2_000, maxChars: 20 });
    assert.deepEqual(page, {
      url: "https://www.harbormoving.example/",
      html: HTML.slice(0, 20),
      markdown: "# Harbor Moving\n\nFro",
      title: "Harbor Moving",
      description: null,
      brand: null,
    });
    assert.deepEqual(asked, ["https://harbormoving.example/"]);

    landed = "http://169.254.169.254/latest/meta-data";
    assert.equal(await sitePage("https://harbormoving.example/", { timeoutMs: 2_000, maxChars: 100 }), null);
  });
});

test("whether a page can be read here at all: a key or a stand-in, and neither is no reader", async () => {
  await withoutStandIn(async () => {
    delete process.env.FIRECRAWL_API_KEY;
    assert.equal(sitePagesReadable(), false);
    setSitePageReader(async () => null);
    assert.equal(sitePagesReadable(), true);
    setSitePageReader(null);
    process.env.FIRECRAWL_API_KEY = KEY;
    assert.equal(sitePagesReadable(), true);
    delete process.env.FIRECRAWL_API_KEY;
  });
});

test("a home page is asked for as spelled, then its other spelling, in what is left of the read's own time and never past it", async () => {
  await withoutStandIn(async () => {
    const page = (url) => ({ url, html: HTML, markdown: "", title: null, description: null, brand: null });
    const asked = [];
    const answers = (only) =>
      setSitePageReader(async (url, o) => {
        asked.push([url, o.timeoutMs]);
        return url === only ? page(url) : null;
      });
    const READ = { timeoutMs: 4_000, maxChars: 100 };
    answers("https://harbormoving.example/");
    assert.equal((await homePage("https://harbormoving.example/", READ)).url, "https://harbormoving.example/");
    assert.equal(asked.length, 1, "one that answers is asked once");

    asked.length = 0;
    answers("https://www.harbormoving.example/");
    assert.equal((await homePage("https://harbormoving.example/", READ)).url, "https://www.harbormoving.example/");
    assert.deepEqual(
      asked.map((a) => a[0]),
      ["https://harbormoving.example/", "https://www.harbormoving.example/"],
    );
    assert.ok(asked[1][1] <= READ.timeoutMs && asked[1][1] > 0, "what is left, not a second whole read");

    asked.length = 0;
    answers("https://harbormoving.example/");
    assert.equal(
      (await homePage("https://www.harbormoving.example/", READ)).url,
      "https://harbormoving.example/",
      "and the other way",
    );

    asked.length = 0;
    let now = Date.now();
    const clock = mock.method(Date, "now", () => now);
    setSitePageReader(async (url, o) => {
      asked.push([url, o.timeoutMs]);
      now += 60;
      return null;
    });
    try {
      assert.equal(await homePage("https://harbormoving.example/", { timeoutMs: 1_020, maxChars: 100 }), null);
      assert.equal(asked.length, 1, "with under a second left, the other spelling is not asked");
    } finally {
      clock.mock.restore();
    }
  });
});

test("the map as the edge asks it: only public addresses come back, and with no key or a map that fails, none", async () => {
  await withoutStandIn(async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const o = { search: "services", limit: 5, timeoutMs: 1_000 };
    assert.deepEqual(await siteLinks("https://harbormoving.example/", o), [], "no key");
    const before = setSiteMapper(async () => [
      { url: "https://harbormoving.example/services", title: null },
      { url: "http://10.0.0.5/admin", title: "inside" },
    ]);
    try {
      assert.deepEqual(await siteLinks("https://harbormoving.example/", o), [
        { url: "https://harbormoving.example/services", title: null },
      ]);
      assert.deepEqual(await siteLinks("http://10.0.0.5/", o), [], "a private address is never asked about");
      setSiteMapper(async () => {
        throw new Error("offline");
      });
      assert.deepEqual(await siteLinks("https://harbormoving.example/", o), []);
    } finally {
      setSiteMapper(before);
    }
  });
});
