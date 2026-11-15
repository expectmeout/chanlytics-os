/**
 * A square PNG written byte by byte, for the suites that hand the look a picture (the website read, the form door): a
 * real file the server's remake accepts, one flat colour, truecolour, every row unfiltered.
 */
import { crc32, deflateSync } from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data = Buffer.alloc(0)) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** A `side` square of one colour, as a PNG's bytes. */
export function squarePng(side = 180, rgb = [196, 69, 46]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const stride = 1 + side * 3;
  const raw = Buffer.alloc(stride * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) raw.set(rgb, y * stride + 1 + x * 3);
  return new Uint8Array(Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND")]));
}

/**
 * A `width`×`height` picture of whatever `colourAt(x, y)` paints there (each of x and y from 0 to 1, so one scene draws alike
 * at any size), as a PNG's bytes: two sizes of one scene are one picture to a print, two scenes are two.
 */
export function scenePng(width, height, colourAt) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) raw.set(colourAt(x / width, y / height), y * stride + 1 + x * 3);
  return new Uint8Array(Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND")]));
}
