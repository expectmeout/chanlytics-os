/**
 * A fetch of an address a person typed connects only to the public internet (packages/channels public-fetch.ts).
 *
 * `feedUrlOk` judges an address as a string, so a public NAME that resolves to a private address passed, and every
 * server-side read of a calendar feed, a listing's website or a lead's page (the preview, the receptionist's
 * availability tool, Ask's openings, the finder) was made from inside the platform's own network for whoever
 * pointed a record at 169.254.169.254 or 10.0.0.5. The socket's lookup is replaced by one that resolves the name,
 * refuses every address that is not a public one (a name that answers both is the attack), and gives the socket the
 * one it judged, so the check is the connect and a name that answers once public and once private (DNS rebinding) is
 * refused at the second connect. Run with a fake resolver and a fake transport; nothing here reaches the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import {
  publicFetch,
  publicLookup,
  isPublicAddress,
  NotPublicError,
  setPublicFetch,
  publicFetcher,
} from "@chanlytics/channels";

test("an address is public only when it is the internet's: private, loopback, link-local, shared, test, multicast and reserved are not", () => {
  for (const ok of [
    "8.8.8.8",
    "93.184.216.34",
    "172.32.0.1",
    "172.15.255.255",
    "100.128.0.1",
    "100.63.255.255",
    "2606:4700::1111",
    "::ffff:8.8.8.8",
  ])
    assert.equal(isPublicAddress(ok), true, ok);
  for (const no of [
    "0.0.0.0",
    "10.0.0.5",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254", // a cloud's metadata service
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1",
    "100.127.255.255", // carrier-grade NAT
    "198.18.0.1",
    "192.0.2.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:10.0.0.5", // an IPv4 address carried in IPv6 reaches what the IPv4 one does
    "::ffff:169.254.169.254",
    "64:ff9b::a00:1", // NAT64 carrying 10.0.0.1
    "not an address",
    "",
    "999.1.1.1",
  ])
    assert.equal(isPublicAddress(no), false, no || "(empty)");
});

const lookedUp = (resolve, host, options = {}) =>
  new Promise((done) => publicLookup(resolve)(host, options, (err, address, family) => done({ err, address, family })));

test("the lookup answers a socket the address it judged, and refuses a name with any address that is not public", async () => {
  const one = await lookedUp(async () => [{ address: "93.184.216.34", family: 4 }], "site.example");
  assert.deepEqual([one.err, one.address, one.family], [null, "93.184.216.34", 4]);
  const all = await lookedUp(async () => [{ address: "93.184.216.34", family: 4 }], "site.example", { all: true });
  assert.deepEqual(all.address, [{ address: "93.184.216.34", family: 4 }]);

  for (const answers of [
    [{ address: "10.0.0.5", family: 4 }],
    [{ address: "169.254.169.254", family: 4 }],
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "::1", family: 6 }],
    // Both: a name that answers a public address and a private one is the attack, not a lucky draw.
    [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ],
    [],
  ]) {
    const r = await lookedUp(async () => answers, "site.example");
    assert.ok(r.err instanceof NotPublicError, JSON.stringify(answers));
  }
  const failed = await lookedUp(async () => Promise.reject(new Error("ENOTFOUND")), "nowhere.example");
  assert.match(failed.err.message, /ENOTFOUND/);
});

test("the check is at the connect: a name that answers public once and private the next time is refused the second time", async () => {
  let asks = 0;
  const rebinding = async () =>
    ++asks === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "10.0.0.5", family: 4 }];
  const first = await lookedUp(rebinding, "rebind.example");
  const second = await lookedUp(rebinding, "rebind.example");
  assert.equal(first.err, null);
  assert.ok(second.err instanceof NotPublicError, "the second connect asks again and is refused");
});

/**
 * A transport standing in for node's https.request: it does what a socket does first (calls the lookup it was given)
 * and answers `pages[host]` when the lookup lets it, or emits the lookup's error, as a refused connect does.
 */
function transport(pages, seen = []) {
  return (url, options, onResponse) => {
    const req = new EventEmitter();
    req.write = () => {};
    req.destroy = (e) => req.emit("error", e);
    req.end = () => {
      const host = url.hostname;
      options.lookup(host, {}, (err, address) => {
        seen.push({ host, address: err ? null : address, method: options.method, headers: options.headers });
        if (err) return queueMicrotask(() => req.emit("error", err));
        const page = pages[url.toString()] ?? { status: 404, body: "" };
        const body = typeof page.body === "string" ? Buffer.from(page.body) : page.body;
        const res = Readable.from([body]);
        res.statusCode = page.status;
        res.statusMessage = "";
        res.headers = Object.fromEntries((page.headers ?? []).map(([k, v]) => [k.toLowerCase(), v]));
        res.rawHeaders = (page.headers ?? []).flat();
        queueMicrotask(() => onResponse(res));
      });
    };
    return req;
  };
}
const PUBLIC = async () => [{ address: "93.184.216.34", family: 4 }];
const PRIVATE = async () => [{ address: "10.0.0.5", family: 4 }];

test("a page on the public internet is read, decompressed as fetch does, and the socket was given the address that passed", async () => {
  const seen = [];
  const f = publicFetch({
    resolve: PUBLIC,
    request: transport(
      {
        "https://site.example/feed.ics": {
          status: 200,
          headers: [
            ["content-type", "text/calendar"],
            ["content-encoding", "gzip"],
          ],
          body: zlib.gzipSync("BEGIN:VCALENDAR"),
        },
      },
      seen,
    ),
  });
  const res = await f("https://site.example/feed.ics", { headers: { accept: "text/calendar" } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "BEGIN:VCALENDAR");
  assert.equal(res.headers.get("content-encoding"), null, "the coding is taken off with the bytes");
  assert.deepEqual(
    seen.map((s) => [s.host, s.address, s.headers.accept]),
    [["site.example", "93.184.216.34", "text/calendar"]],
  );
});

test("a name that resolves to a private address is refused, whatever the address it was typed as", async () => {
  const f = publicFetch({
    resolve: PRIVATE,
    request: transport({ "https://feed.example/x.ics": { status: 200, body: "secret" } }),
  });
  await assert.rejects(() => f("https://feed.example/x.ics"), NotPublicError);
  // A literal address skips the lookup, so it is judged before any socket is made; the URL parser writes 0x7f.1 as 127.0.0.1.
  const seen = [];
  const g = publicFetch({ resolve: PUBLIC, request: transport({}, seen) });
  for (const url of [
    "http://127.0.0.1/",
    "http://10.0.0.5/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:10.0.0.5]/",
    "http://2130706433/",
    "http://0x7f.1/",
  ])
    await assert.rejects(() => g(url), NotPublicError, url);
  await assert.rejects(() => g("file:///etc/passwd"), NotPublicError);
  await assert.rejects(() => g("ftp://site.example/"), NotPublicError);
  assert.deepEqual(seen, [], "no socket was made for any of them");
});

test("a redirect is followed hop by hop and each hop is connected to through the lookup: one that lands on a private name is refused", async () => {
  const seen = [];
  const resolve = async (host) => (host === "inner.example" ? PRIVATE() : PUBLIC());
  const f = publicFetch({
    resolve,
    request: transport(
      {
        "https://start.example/": { status: 302, headers: [["location", "https://hop.example/next"]], body: "" },
        "https://hop.example/next": { status: 200, headers: [["content-type", "text/html"]], body: "<html>ok</html>" },
        "https://redirects-inward.example/": {
          status: 301,
          headers: [["location", "https://inner.example/admin"]],
          body: "",
        },
        "https://loop.example/": { status: 302, headers: [["location", "https://loop.example/"]], body: "" },
      },
      seen,
    ),
  });
  const ok = await f("https://start.example/");
  assert.equal(await ok.text(), "<html>ok</html>");
  assert.deepEqual(
    seen.map((s) => s.host),
    ["start.example", "hop.example"],
  );
  await assert.rejects(() => f("https://redirects-inward.example/"), NotPublicError, "the hop to a private name");
  await assert.rejects(() => f("https://loop.example/"), /too many redirects/);
  // A caller that judges each hop itself asks for the 3xx as it is.
  const manual = await f("https://start.example/", { redirect: "manual" });
  assert.equal(manual.status, 302);
  assert.equal(manual.headers.get("location"), "https://hop.example/next");
});

test("nothing reaches a server on this machine: a real socket to localhost is refused at the lookup and the server sees no request", async () => {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits += 1;
    res.end("internal");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  try {
    const guarded = publicFetch();
    await assert.rejects(() => guarded(`http://127.0.0.1:${port}/`), NotPublicError);
    await assert.rejects(() => guarded(`http://localhost:${port}/`), NotPublicError);
    assert.equal(hits, 0, "the platform's own network was not reached");
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("the seam: a suite stands in for the network with setPublicFetch, and the guarded one comes back with null", async () => {
  const fake = async () => new Response("stand-in");
  const before = setPublicFetch(fake);
  try {
    assert.equal(publicFetcher(), fake);
    assert.equal(await (await publicFetcher()("https://feed.example/x")).text(), "stand-in");
  } finally {
    setPublicFetch(before);
  }
});
