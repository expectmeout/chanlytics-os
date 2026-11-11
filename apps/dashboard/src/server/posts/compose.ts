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

/** A layout as satori reads one: our nodes are its elements, typed apart only because it names React's. */
const laidOut = (node: PostNode) => node as PostNode & Parameters<typeof satori>[0];

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
    satori(laidOut(postLayout(layout)), {
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

/** One tile of a video's storyboard: a cut's first frame, what is written under it, and whether the opening words are on it. */
interface BoardTile {
  frame: Buffer;
  label: string;
  words: boolean;
}

/** A storyboard's tiles, each a third of the video's frame, the space between them, and the strip their captions stand on. */
const BOARD_TILE_WIDTH = 360;
const BOARD_GAP = 12;
const BOARD_LABEL_HEIGHT = 44;
const BOARD_PAGE = "#111111";

/**
 * A video's storyboard, as a JPEG (decision 0122): each cut's first frame side by side in play order, with the opening words'
 * backing drawn where the video will draw it, at the size it will have. `words` and `frame` are the video's own numbers
 * (contracts pieceWordsBoxOf, PIECE_FRAME), scaled here to the tile, so what is looked at before a video is made is where its
 * words will sit. Kept nowhere: it is looked at, by Ask and then by the person, and drawn again when asked.
 *
 * `plain` is the card's own: the stills alone, edge to edge, with no caption under them and no space between, since the page
 * stands each on its own and a cut's seconds are nothing an owner needs. Ask's look keeps both: it names a cut by its number.
 */
export async function composeBoard(board: {
  tiles: readonly BoardTile[];
  words: { lines: readonly string[]; top: number; size: number };
  frame: { width: number; height: number; pad: number; padSide: number; gap: number; leading: number };
  plain?: boolean;
}): Promise<Buffer> {
  const { tiles, words, frame } = board;
  const gap = board.plain ? 0 : BOARD_GAP;
  const labelHeight = board.plain ? 0 : BOARD_LABEL_HEIGHT;
  const scale = BOARD_TILE_WIDTH / frame.width;
  const tileHeight = Math.round(frame.height * scale);
  const width = tiles.length * BOARD_TILE_WIDTH + Math.max(0, tiles.length - 1) * gap;
  const height = tileHeight + labelHeight;
  const backing: PostNode = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: frame.gap * scale,
        padding: `${frame.pad * scale}px ${frame.padSide * scale}px`,
        borderRadius: 28 * scale,
        backgroundColor: "rgba(0,0,0,0.52)",
      },
      children: words.lines.map((line) => ({
        type: "div",
        props: {
          style: {
            fontFamily: "Mona Sans",
            fontWeight: 800,
            fontSize: words.size * scale,
            lineHeight: frame.leading,
            color: "#ffffff",
            whiteSpace: "nowrap",
          },
          children: line,
        },
      })),
    },
  };
  const column = (tile: BoardTile): PostNode => ({
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: BOARD_TILE_WIDTH, height },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", position: "relative", width: BOARD_TILE_WIDTH, height: tileHeight },
            children: tile.words
              ? [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        justifyContent: "center",
                        position: "absolute",
                        top: words.top * scale,
                        left: 0,
                        width: BOARD_TILE_WIDTH,
                      },
                      children: [backing],
                    },
                  },
                ]
              : [],
          },
        },
        ...(labelHeight
          ? [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: BOARD_TILE_WIDTH,
                    height: labelHeight,
                    fontFamily: "Mona Sans",
                    fontWeight: 600,
                    fontSize: 20,
                    color: "#ffffff",
                  },
                  children: tile.label,
                },
              },
            ]
          : []),
      ],
    },
  });
  const page: PostNode = {
    type: "div",
    props: { style: { display: "flex", width, height, gap }, children: tiles.map(column) },
  };
  const [frames, layer] = await Promise.all([
    Promise.all(
      tiles.map((tile) => sharp(tile.frame).rotate().resize(BOARD_TILE_WIDTH, tileHeight, { fit: "cover" }).toBuffer()),
    ),
    satori(laidOut(page), { width, height, fonts: await fontsHeld() }),
  ]);
  return sharp({ create: { width, height, channels: 3, background: BOARD_PAGE } })
    .composite([
      ...frames.map((input, i) => ({ input, left: i * (BOARD_TILE_WIDTH + gap), top: 0 })),
      { input: Buffer.from(layer) },
    ])
    .jpeg({ quality: DRAFT_JPEG_QUALITY })
    .toBuffer();
}
