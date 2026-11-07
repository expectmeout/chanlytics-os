/**
 * A post made from a photo, by code (decision 0099, step 3): the seam over the two libraries, so nothing else in the tree imports
 * either. sharp does the pixels; satori lays the words out as paths, which sharp then draws, so no font is needed where the code
 * runs. No model touches a pixel, and it costs nothing, so a card can show the real picture and a change of mind is free.
 *
 * Raw pixels go between the steps: an encode between them cost more than any step did (250 ms a picture against 140, measured).
 */
import { readFile } from "node:fs/promises";
import satori from "satori";
import sharp, { type OutputInfo, type Raw } from "sharp";
import {
  postCrop,
  postLayout,
  postPhotoBox,
  SCRIM_UNDER_WORDS,
  SHADE_AT_MOST,
  wordsOverPhoto,
  type PostLayoutInput,
  type PostNode,
} from "./layout";

/** How a post leaves here: small enough to send, with no sign of the phone that took the photo. */
const POST_JPEG_QUALITY = 86;
/** A picture only looked at while its words change: a third of the time to encode, and the same to the eye on a card. */
const DRAFT_JPEG_QUALITY = 82;
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
  /** Only looked at, while its words change: encoded quickly. What is kept never is. */
  draft: boolean;
}

/** Pixels between two steps. */
type Pixels = { data: Buffer; info: OutputInfo };

const rawOf = ({ info }: Pixels) => ({ raw: { width: info.width, height: info.height, channels: info.channels } });

/** A photo's size as it stands upright: a phone keeps some on their side, with a word saying so. */
async function uprightSizeOf(photo: Buffer): Promise<{ width: number; height: number }> {
  const { width, height, orientation } = await sharp(photo).metadata();
  return (orientation ?? 1) >= 5 ? { width: height, height: width } : { width, height };
}

/** The post, as a JPEG. */
export async function composePost(postAsked: PostAsked): Promise<Buffer> {
  const { photo, subject, draft, ...layout } = postAsked;
  const { shape, wordsAt } = layout;
  const over = wordsOverPhoto(layout.layout);
  const place = postPhotoBox(layout);
  const crop = postCrop(await uprightSizeOf(photo), place, subject, over ? wordsAt : null);
  const [fitted, page] = await Promise.all([
    sharp(photo)
      .rotate()
      .extract(crop)
      .resize(place.width, place.height, { fit: "fill" })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    satori(postLayout(layout) as PostNode & Parameters<typeof satori>[0], {
      width: shape.width,
      height: shape.height,
      fonts: await fontsHeld(),
    }),
  ]);
  const layer = await sharp(Buffer.from(page)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const words = { input: layer.data, ...rawOf(layer) };
  // Words over the photo stand on it softened; words beside it leave it sharp, placed on a page they cover the rest of.
  const drawn = over
    ? sharp(fitted.data, rawOf(fitted)).composite([{ ...(await softenedLayer(fitted, layer)) }, words])
    : sharp({ create: { width: shape.width, height: shape.height, channels: 3, background: "#000" } }).composite([
        { input: fitted.data, ...rawOf(fitted), left: place.left, top: place.top },
        words,
      ]);
  return drawn.jpeg(draft ? { quality: DRAFT_JPEG_QUALITY } : { quality: POST_JPEG_QUALITY, mozjpeg: true }).toBuffer();
}

/**
 * The photo softened where the words stand, as frosted glass, so a sign or a poster behind them does not read through: a blurred
 * copy, seen only through what the layer darkens most. The layer's own alpha says where: the scrim under the words and the words
 * themselves, past the light shade the mark stands in, which it leaves sharp.
 */
async function softenedLayer(fitted: Pixels, layer: Pixels): Promise<{ input: Buffer; raw: Raw }> {
  const seenFrom = Math.round(SHADE_AT_MOST * 255);
  const gain = 255 / (Math.round(SCRIM_UNDER_WORDS * 255) - seenFrom);
  const mask = await sharp(layer.data, rawOf(layer))
    .extractChannel("alpha")
    .linear(gain, -seenFrom * gain)
    .blur(SOFT_EDGE_PX)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const soft = await sharp(fitted.data, rawOf(fitted))
    .blur(SOFT_BLUR_PX)
    .joinChannel(mask.data, rawOf(mask))
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { input: soft.data, ...rawOf(soft) };
}
