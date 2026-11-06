/**
 * A post made from a photo, by code (decision 0099, step 3): the seam over the two libraries, so nothing else in the tree imports
 * either. sharp does the pixels; satori lays the words out as paths, which sharp then draws, so no font is needed where the code
 * runs. No model touches a pixel, and it costs nothing, so a card can show the real picture and a change of mind is free.
 */
import { readFile } from "node:fs/promises";
import satori from "satori";
import sharp from "sharp";
import { postCrop, postLayout, SCRIM_UNDER_WORDS, SHADE_AT_MOST, type PostLayoutInput, type PostNode } from "./layout";

/** How a post leaves here: small enough to send, with no sign of the phone that took the photo. */
const POST_JPEG_QUALITY = 86;
/** How soft the photo goes under the words, and how softly that begins. */
const SOFT_BLUR_PX = 16;
const SOFT_EDGE_PX = 12;

const FONT_FILES = [
  ["Mona Sans", 400, "normal", "mona-sans-400.woff"],
  ["Mona Sans", 600, "normal", "mona-sans-600.woff"],
  ["Mona Sans", 800, "normal", "mona-sans-800.woff"],
  ["Source Serif 4", 400, "normal", "source-serif-4-400.woff"],
  ["Source Serif 4", 600, "italic", "source-serif-4-600-italic.woff"],
] as const;

let fonts: Promise<Parameters<typeof satori>[1]["fonts"]> | null = null;

/** The fonts, read once a process. */
const fontsHeld = () =>
  (fonts ??= Promise.all(
    FONT_FILES.map(async ([name, weight, style, file]) => ({
      name,
      weight,
      style,
      data: await readFile(new URL(`./fonts/${file}`, import.meta.url)),
    })),
  ));

/** Some bytes as a PNG the layout can draw, or null where they are no picture. */
export const asPng = (bytes: Buffer): Promise<Buffer | null> =>
  sharp(bytes)
    .png()
    .toBuffer()
    .catch(() => null);

/** What a post is made from: the photo's bytes, what the look found, and the page's layout. */
interface PostAsked extends PostLayoutInput {
  photo: Buffer;
  subject: readonly [number, number, number, number] | null;
}

/** The post, as a JPEG. */
export async function composePost(asked: PostAsked): Promise<Buffer> {
  const { photo, subject, ...layout } = asked;
  const { shape, wordsAt } = layout;
  const upright = await sharp(photo).rotate().toBuffer({ resolveWithObject: true });
  const crop = postCrop(upright.info, shape, subject, wordsAt);
  const page = await satori(postLayout(layout) as PostNode & Parameters<typeof satori>[0], {
    width: shape.width,
    height: shape.height,
    fonts: await fontsHeld(),
  });
  const fitted = await sharp(upright.data)
    .extract(crop)
    .resize(shape.width, shape.height, { fit: "fill" })
    .removeAlpha()
    .png()
    .toBuffer();
  const layer = await sharp(Buffer.from(page)).png().toBuffer();
  return sharp(fitted)
    .composite([{ input: await softenedUnderWords(fitted, layer) }, { input: layer }])
    .jpeg({ quality: POST_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/**
 * The photo softened where the words stand, as frosted glass, so a sign or a poster behind them does not read through: a blurred
 * copy, seen only through what the layer darkens most. The layer's own alpha says where: the scrim under the words and the words
 * themselves, past the light shade the mark stands in, which it leaves sharp.
 */
async function softenedUnderWords(fitted: Buffer, layer: Buffer): Promise<Buffer> {
  const seenFrom = Math.round(SHADE_AT_MOST * 255);
  const gain = 255 / (Math.round(SCRIM_UNDER_WORDS * 255) - seenFrom);
  const mask = await sharp(layer)
    .extractChannel("alpha")
    .linear(gain, -seenFrom * gain)
    .blur(SOFT_EDGE_PX)
    .toBuffer();
  return sharp(fitted).blur(SOFT_BLUR_PX).joinChannel(mask).png().toBuffer();
}
