/**
 * What the footage proof's runner says of a run (footage sources, plan v4, P1; tooling/scripts/ops/files/footage-proof-report.mjs):
 * its settings read from a file, a clip's address at the relay, Google's units for what the relay served, and what became
 * of a forced break, read off the requests the proof's key door wrote down.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askedLines,
  breakLines,
  breakOf,
  clipAddressOf,
  durationWords,
  settingsOf,
  sizeWords,
  unitsOf,
  verdictLines,
} from "../../../tooling/scripts/ops/files/footage-proof-report.mjs";

const T0 = Date.parse("2026-11-17T12:00:00Z");
const asked = (...rows) =>
  rows.map(([seconds, method, range, breakAfterMs = null]) => ({
    at: T0 + seconds * 1000,
    method,
    range,
    break_after_ms: breakAfterMs,
  }));

test("a settings file is its pairs: notes and blank values passed over, quotes dropped, a later file winning", () => {
  const first =
    '# the proof\nFOOTAGE_RELAY_URL=https://relay.example.com\nFOOTAGE_APP_KEY="app-key"\nEMPTY=\n  not a pair\n';
  const second = "FOOTAGE_APP_KEY=another\r\nCLOUDFLARE_ACCOUNT_ID = acct-1 \r\n";
  assert.deepEqual(settingsOf(first, second), {
    FOOTAGE_RELAY_URL: "https://relay.example.com",
    FOOTAGE_APP_KEY: "another",
    CLOUDFLARE_ACCOUNT_ID: "acct-1",
  });
  assert.deepEqual(settingsOf(), {});
});

test("a clip's address names the item, its type and the ticket, and nothing of the file's name", () => {
  assert.equal(
    clipAddressOf("https://relay.example.com", { item: "item-1", mime: "video/quicktime" }, "v1.claim.signature"),
    "https://relay.example.com/clip/item-1/clip.mov?ticket=v1.claim.signature",
  );
  assert.ok(
    clipAddressOf("https://relay.example.com/", { item: "i", mime: "video/webm" }, "t").includes("/clip/i/clip.webm?"),
  );
  assert.ok(
    clipAddressOf("https://relay.example.com", { item: "i", mime: "video/mp4" }, "t").includes("/clip/i/clip.mp4?"),
  );
  assert.ok(clipAddressOf("https://relay.example.com", { item: "i", mime: "" }, "t").includes("/clip/i/clip.mp4?"));
});

test("Google's units for a clip: 5 for each HEAD the relay served, 200 for each GET", () => {
  assert.deepEqual(unitsOf([]), { requests: 0, heads: 0, gets: 0, units: 0 });
  assert.deepEqual(unitsOf(asked([0, "HEAD", null], [1, "GET", "bytes=0-"], [9, "GET", "bytes=1048576-"])), {
    requests: 3,
    heads: 1,
    gets: 2,
    units: 405,
  });
});

test("the forced break is read off what the relay was asked: handed out or not, and where the fetcher came back from", () => {
  assert.deepEqual(breakOf(asked([0, "HEAD", null], [1, "GET", null])), {
    handed: false,
    request: null,
    afterMs: null,
    cameBack: false,
    from: null,
  });
  // Broken, and the fetcher went on from where it stood.
  const resumed = asked([0, "HEAD", null], [1, "GET", null, 4000], [5.2, "GET", "bytes=9437184-"]);
  assert.deepEqual(breakOf(resumed), { handed: true, request: 2, afterMs: 4000, cameBack: true, from: 9437184 });
  assert.match(
    breakLines(resumed, 4000).join("\n"),
    /request 2 was broken off after 4\.0 s; Stream asked again from byte 9,437,184/,
  );
  // Broken, and the fetcher began again.
  const restarted = asked([1, "GET", "bytes=0-", 4000], [5, "HEAD", null], [6, "GET", null]);
  assert.equal(breakOf(restarted).from, 0);
  assert.match(breakLines(restarted, 4000).join("\n"), /from the first byte \(it began again\)/);
  // Told to break, and nothing came after: said as it is, with the two things it can mean.
  const silent = asked([0, "HEAD", null], [1, "GET", null, 4000]);
  assert.equal(breakOf(silent).cameBack, false);
  assert.match(breakLines(silent, 4000).join("\n"), /no download followed it/);
  assert.match(breakLines(asked([0, "HEAD", null]), 4000).join("\n"), /never handed out/);
});

test("times, sizes and the list of requests read as a person says them", () => {
  assert.equal(durationWords(9100), "9.1 s");
  assert.equal(durationWords(119_900), "119.9 s");
  assert.equal(durationWords(25 * 60_000 + 4_000), "25 min 4 s");
  assert.equal(durationWords(null), "not reached");
  assert.equal(sizeWords(255_000_000), "255.0 MB");
  assert.equal(sizeWords(18_400), "18 KB");
  assert.deepEqual(
    askedLines(asked([0.04, "HEAD", null], [2.2, "GET", "bytes=9437184-"], [3, "GET", null, 1500]), T0),
    [
      "    1     +0.0 s  HEAD (whole clip)",
      "    2     +2.2 s  GET bytes=9437184-",
      "    3     +3.0 s  GET (whole clip)   <- told to break after 1.5 s",
    ],
  );
});

test("the verdict says ready, failed or not ready, whether the clip is whole, and the sharpest copy", () => {
  const ready = { state: "ready", readyMs: 42_000, endedMs: 42_000, streamBytes: 1000, driveBytes: 1000 };
  assert.deepEqual(verdictLines(ready), [
    "Result: READY at Stream in 42.0 s.",
    "Whole clip: yes. Stream holds 1 KB, the size Drive gives.",
  ]);
  assert.match(
    verdictLines({ ...ready, streamBytes: 600 })[1],
    /Whole clip: NO\. Stream holds 600 bytes and Drive gives 1000\./,
  );
  // Stream gave no size: nothing is claimed about the clip being whole.
  assert.equal(verdictLines({ ...ready, streamBytes: null }).length, 1);
  assert.match(
    verdictLines({ ...ready, sharpest: { ms: 26 * 60_000, width: 1920, height: 1080 } })[2],
    /Sharpest copy: there 26 min 0 s after Stream was asked \(1920x1080\)\./,
  );
  assert.match(
    verdictLines({ ...ready, sharpest: { ms: null, why: "not there 40 min 0 s after Stream was asked" } })[2],
    /not there 40 min/,
  );
  assert.deepEqual(verdictLines({ state: "error", readyMs: null, endedMs: 12_000, errorCode: "ERR_NON_VIDEO" }), [
    "Result: FAILED at Stream after 12.0 s: ERR_NON_VIDEO.",
  ]);
  assert.deepEqual(verdictLines({ state: "downloading", readyMs: null, endedMs: 30 * 60_000 }), [
    'Result: NOT READY after 30 min 0 s (Stream still says "downloading").',
  ]);
});
