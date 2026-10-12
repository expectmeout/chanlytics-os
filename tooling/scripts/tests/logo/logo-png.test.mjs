/**
 * The workspace's logo as the server keeps it (dashboard server/workspace/logo/png.ts): every file is read to its end
 * against the format's own rules and remade from its pixels, so nothing the sender put in it but the picture is kept.
 * The files here are written byte by byte, the way an attacker would write them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { LOGO_BYTES_MAX } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { remadeLogo } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/workspace/logo/png.ts")).href
);

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data = Buffer.alloc(0), { badCrc = false } = {}) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((crc32(Buffer.concat([head.subarray(4), data])) ^ (badCrc ? 1 : 0)) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

function ihdr({ w = 256, h = w, depth = 8, colour = 6, interlace = 0 } = {}) {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(w, 0);
  d.writeUInt32BE(h, 4);
  d.set([depth, colour, 0, 0, interlace], 8);
  return chunk("IHDR", d);
}

/** Rows of a `side` square, `bpp` bytes a pixel, each row's filter byte `filter`, the pixels a pattern. */
function rows(side, bpp = 4, filter = 0, extraRows = 0) {
  const stride = 1 + side * bpp;
  const raw = Buffer.alloc(stride * (side + extraRows));
  for (let r = 0; r < side + extraRows; r++) {
    raw[r * stride] = filter;
    for (let i = 1; i < stride; i++) raw[r * stride + i] = (r * 7 + i * 3) & 0xff;
  }
  return raw;
}

const png = (...chunks) => Buffer.concat([SIG, ...chunks]);
const good = (side = 256) => png(ihdr({ w: side }), chunk("IDAT", deflateSync(rows(side))), chunk("IEND"));

/** The chunk types of a file, in order. */
function typesOf(bytes) {
  const out = [];
  for (let at = 8; at < bytes.length;) {
    const len = bytes.readUInt32BE(at);
    out.push(bytes.toString("latin1", at + 4, at + 8));
    at += 12 + len;
  }
  return out;
}

test("a square PNG of the kept shape is kept, remade from its pixels: the same picture, only its three chunks", () => {
  const sent = png(
    ihdr(),
    chunk("iCCP", Buffer.from("a profile\0\0anything")),
    chunk("tEXt", Buffer.from("Comment\0<script>alert(1)</script>")),
    chunk("IDAT", deflateSync(rows(256)).subarray(0, 500)),
    chunk("IDAT", deflateSync(rows(256)).subarray(500)),
    chunk("tIME", Buffer.alloc(7)),
    chunk("IEND"),
  );
  const out = remadeLogo(new Uint8Array(sent));
  assert.equal(out.ok, true);
  assert.equal(out.side, 256);
  const kept = Buffer.from(out.png);
  assert.deepEqual(typesOf(kept), ["IHDR", "IDAT", "IEND"], "the profile, the text and the stamp are dropped");
  assert.ok(!kept.includes(Buffer.from("<script>")), "nothing the sender wrote beside the picture survives");
  const idatLen = kept.readUInt32BE(33);
  assert.deepEqual(inflateSync(kept.subarray(41, 41 + idatLen)), rows(256), "the picture itself is unchanged");
});

test("every colour type a canvas writes is kept: grey, truecolour, either with alpha; the smallest kept side too", () => {
  for (const [colour, bpp] of [
    [0, 1],
    [2, 3],
    [4, 2],
    [6, 4],
  ]) {
    const out = remadeLogo(
      new Uint8Array(png(ihdr({ w: 128, colour }), chunk("IDAT", deflateSync(rows(128, bpp))), chunk("IEND"))),
    );
    assert.equal(out.ok, true, `colour type ${colour}`);
  }
});

test("not a PNG, or a PNG past the weight kept, is refused before its chunks are read", () => {
  assert.deepEqual(remadeLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(40)])), {
    ok: false,
    why: "not_png",
  });
  assert.deepEqual(remadeLogo(new Uint8Array(LOGO_BYTES_MAX + 1)), { ok: false, why: "too_heavy" });
});

test("a picture of another shape is refused: not square, too small, too large, sixteen bits, a palette, interlaced", () => {
  const shapes = [
    ihdr({ w: 256, h: 200 }),
    ihdr({ w: 64 }),
    ihdr({ w: 512 }),
    ihdr({ depth: 16 }),
    ihdr({ colour: 3 }),
    ihdr({ interlace: 1 }),
  ];
  for (const h of shapes)
    assert.deepEqual(remadeLogo(new Uint8Array(png(h, chunk("IDAT", deflateSync(rows(256))), chunk("IEND")))), {
      ok: false,
      why: "shape",
    });
  const palette = png(ihdr(), chunk("PLTE", Buffer.alloc(9)), chunk("IDAT", deflateSync(rows(256))), chunk("IEND"));
  assert.deepEqual(
    remadeLogo(new Uint8Array(palette)),
    { ok: false, why: "shape" },
    "a critical chunk it does not keep",
  );
});

test("a file that is not whole, or says more than it is, is refused", () => {
  const idat = chunk("IDAT", deflateSync(rows(256)));
  const broken = {
    "bytes after the end": Buffer.concat([good(), Buffer.from("<html><script>1</script></html>")]),
    "a chunk whose CRC is wrong": png(ihdr(), chunk("IDAT", deflateSync(rows(256)), { badCrc: true }), chunk("IEND")),
    "no end": png(ihdr(), idat),
    "the header not first": png(chunk("tEXt", Buffer.from("a\0b")), ihdr(), idat, chunk("IEND")),
    "picture data split by another chunk": png(
      ihdr(),
      chunk("IDAT", deflateSync(rows(256)).subarray(0, 300)),
      chunk("tEXt", Buffer.from("a\0b")),
      chunk("IDAT", deflateSync(rows(256)).subarray(300)),
      chunk("IEND"),
    ),
    "rows past the picture": png(ihdr(), chunk("IDAT", deflateSync(rows(256, 4, 0, 1))), chunk("IEND")),
    "rows short of the picture": png(ihdr(), chunk("IDAT", deflateSync(rows(255))), chunk("IEND")),
    "a filter PNG does not know": png(ihdr(), chunk("IDAT", deflateSync(rows(256, 4, 7))), chunk("IEND")),
    "picture data that is not a stream": png(ihdr(), chunk("IDAT", Buffer.from("not deflate")), chunk("IEND")),
    "a chunk longer than the file": Buffer.concat([good().subarray(0, 40), Buffer.from([0xff, 0xff, 0xff, 0xff])]),
  };
  for (const [what, bytes] of Object.entries(broken))
    assert.deepEqual(remadeLogo(new Uint8Array(bytes)), { ok: false, why: "broken" }, what);
});

test("a stream that inflates without end stops one byte past the picture: a bomb costs us nothing", () => {
  // Fifty megabytes of zeros deflate to about fifty kilobytes, inside the weight kept.
  const bomb = deflateSync(Buffer.alloc(50 * 1024 * 1024), { level: 9 });
  assert.ok(bomb.length < LOGO_BYTES_MAX);
  const started = Date.now();
  assert.deepEqual(remadeLogo(new Uint8Array(png(ihdr(), chunk("IDAT", bomb), chunk("IEND")))), {
    ok: false,
    why: "broken",
  });
  assert.ok(Date.now() - started < 2_000, "refused without inflating it all");
});

test("every chunk of a remade file carries the CRC the format's own reckoning gives (node:zlib's, not ours)", () => {
  const out = remadeLogo(new Uint8Array(good()));
  assert.equal(out.ok, true);
  const kept = Buffer.from(out.png);
  for (let at = 8; at < kept.length;) {
    const len = kept.readUInt32BE(at);
    const said = kept.readUInt32BE(at + 8 + len);
    assert.equal(said, crc32(kept.subarray(at + 4, at + 8 + len)), kept.toString("latin1", at + 4, at + 8));
    at += 12 + len;
  }
  assert.equal(kept.readUInt32BE(kept.length - 4), 0xae426082, "and the end is the end every PNG has");
});
