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

/** A still as a storyboard is handed it: its bytes, and how far down it is held where it is cropped to fill (0.5 is its middle). */
interface BoardShot {
  bytes: Buffer;
  heldAt: number;
}

/**
 * One tile of a video's storyboard, by what its block shows: a picture (a clip's first frame, or a photo), with whether the
 * opening words are on it and the block's own caption; a before-and-after pair, one picture over the other under their names;
 * a words card; or a quote card, over its picture where it has one. `label` is what Ask's look reads under it.
 */
type BoardTile =
  | { kind: "picture"; shot: BoardShot; label: string; words: boolean; caption: string | null }
  | {
      kind: "pair";
      before: BoardShot;
      after: BoardShot;
      names: readonly [string, string];
      label: string;
      words: boolean;
    }
  | { kind: "card"; lines: readonly string[]; size: number; label: string }
  | {
      kind: "quote";
      lines: readonly string[];
      size: number;
      from: string | null;
      over: BoardShot | null;
      label: string;
    };

/**
 * The video's own drawing numbers a storyboard is scaled from (contracts PIECE_FRAME, PIECE_CARD, PIECE_SIDE), in the frame's
 * pixels: the opening words' backing, where a caption stands and how it is set, the rule between a pair's pictures, a card's
 * numbers, and the colours a card wears.
 */
interface BoardFrame {
  width: number;
  height: number;
  pad: number;
  padSide: number;
  gap: number;
  leading: number;
  side: number;
  clearBottom: number;
  caption: { size: number; pad: number; padSide: number; lift: number };
  rule: number;
  card: { lift: number; dim: number; fromSize: number };
  ink: string;
  paper: string;
  accent: string;
}

/** A storyboard's tiles, each a third of the video's frame, the space between them, and the strip their captions stand on. */
const BOARD_TILE_WIDTH = 360;
const BOARD_GAP = 12;
const BOARD_LABEL_HEIGHT = 44;
const BOARD_PAGE = "#111111";
/** A card's own ornaments, as the template draws them (tooling/video/src/look.tsx), in the frame's pixels. */
const BOARD_CARD_RULE = { width: 96, height: 8, under: 40 };
const BOARD_QUOTE_MARK = { size: 220, height: 120 };
const BOARD_QUOTE_FROM = { set: { ink: "rgba(255,255,255,0.72)", weight: 600 }, over: 30 };

/** One line of words, never wrapped: white at the face's heaviest unless `set` says who said a quote. */
const boardLine = (
  words: string,
  size: number,
  leading: number,
  set: { ink: string; weight: number } = { ink: "#ffffff", weight: 800 },
): PostNode => ({
  type: "div",
  props: {
    style: {
      fontFamily: "Mona Sans",
      fontWeight: set.weight,
      fontSize: size,
      lineHeight: leading,
      color: set.ink,
      whiteSpace: "nowrap",
    },
    children: words,
  },
});

/** Words on the dark backing the video draws them on, at a tile's scale: the opening words' own, or a caption's smaller one. */
function boardBacked(
  lines: readonly string[],
  size: number,
  { frame, scale }: Pick<BoardDrawn, "frame" | "scale">,
  caption = false,
): PostNode {
  const [pad, padSide, radius] = caption
    ? [frame.caption.pad, frame.caption.padSide, 18]
    : [frame.pad, frame.padSide, 28];
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: frame.gap * scale,
        padding: `${pad * scale}px ${padSide * scale}px`,
        borderRadius: radius * scale,
        backgroundColor: "rgba(0,0,0,0.52)",
      },
      children: lines.map((line) => boardLine(line, size * scale, frame.leading)),
    },
  };
}

/** Something placed inside a tile: across its width at `top`, or at the captions' left edge with its foot `bottom` from the tile's. */
const boardPlaced = (child: PostNode, at: { top: number } | { bottom: number; left: number }): PostNode => ({
  type: "div",
  props: {
    style: {
      display: "flex",
      position: "absolute",
      ...("top" in at
        ? { top: at.top, left: 0, width: BOARD_TILE_WIDTH, justifyContent: "center" }
        : { bottom: at.bottom, left: at.left }),
    },
    children: [child],
  },
});

/** What a board is drawn with: the opening words, the video's numbers, and the tile's share of the frame. */
interface BoardDrawn {
  words: { lines: readonly string[]; top: number; size: number };
  frame: BoardFrame;
  scale: number;
}

const boardCaption = (words: string, bottom: number, { frame, scale }: BoardDrawn): PostNode =>
  boardPlaced(boardBacked([words], frame.caption.size, { frame, scale }, true), {
    bottom: bottom * scale,
    left: frame.side * scale,
  });

/** A card's words over its ground, filling the tile: centred a little above the middle, as the video centres them. */
function boardCard(
  { frame, scale }: BoardDrawn,
  ground: string,
  set: { align: "center" | "flex-start"; edge: number },
  children: PostNode[],
): PostNode {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: set.align,
        justifyContent: "center",
        gap: frame.gap * scale,
        position: "absolute",
        top: 0,
        left: 0,
        width: BOARD_TILE_WIDTH,
        height: frame.height * scale,
        // Its padding is inside its size: it fills the tile and no more.
        boxSizing: "border-box",
        padding: `0 ${set.edge * scale}px ${2 * frame.card.lift * scale}px`,
        backgroundColor: ground,
      },
      children,
    },
  };
}

/** What is drawn over a tile's pictures, by its kind. */
function boardOver(tile: BoardTile, drawn: BoardDrawn): PostNode[] {
  const { words, frame, scale } = drawn;
  const opening = (on: boolean): PostNode[] =>
    on ? [boardPlaced(boardBacked(words.lines, words.size, drawn), { top: words.top * scale })] : [];
  if (tile.kind === "picture")
    return [...opening(tile.words), ...(tile.caption ? [boardCaption(tile.caption, frame.clearBottom, drawn)] : [])];
  if (tile.kind === "pair") {
    const half = (frame.height - frame.rule) / 2;
    return [
      {
        type: "div",
        props: {
          style: {
            position: "absolute",
            top: half * scale,
            left: 0,
            width: BOARD_TILE_WIDTH,
            height: frame.rule * scale,
            backgroundColor: frame.paper,
          },
        },
      },
      boardCaption(tile.names[0], half + frame.rule + frame.caption.lift, drawn),
      boardCaption(tile.names[1], frame.clearBottom, drawn),
      ...opening(tile.words),
    ];
  }
  if (tile.kind === "card") {
    const rule: PostNode = {
      type: "div",
      props: {
        style: {
          width: BOARD_CARD_RULE.width * scale,
          height: BOARD_CARD_RULE.height * scale,
          borderRadius: (BOARD_CARD_RULE.height / 2) * scale,
          marginBottom: BOARD_CARD_RULE.under * scale,
          backgroundColor: frame.accent,
        },
      },
    };
    const lines = tile.lines.map((line) => boardLine(line, tile.size * scale, frame.leading));
    return [boardCard(drawn, frame.ink, { align: "center", edge: 0 }, [rule, ...lines])];
  }
  const mark: PostNode = {
    type: "div",
    props: {
      style: {
        display: "flex",
        height: BOARD_QUOTE_MARK.height * scale,
        fontFamily: "Mona Sans",
        fontWeight: 800,
        fontSize: BOARD_QUOTE_MARK.size * scale,
        lineHeight: 1,
        color: frame.accent,
      },
      children: "“",
    },
  };
  const from: PostNode[] = tile.from
    ? [
        {
          type: "div",
          props: {
            style: { display: "flex", marginTop: BOARD_QUOTE_FROM.over * scale },
            children: [boardLine(tile.from, frame.card.fromSize * scale, frame.leading, BOARD_QUOTE_FROM.set)],
          },
        },
      ]
    : [];
  return [
    boardCard(
      drawn,
      tile.over ? `rgba(0,0,0,${frame.card.dim})` : frame.ink,
      { align: "flex-start", edge: frame.side + frame.padSide },
      [mark, ...tile.lines.map((line) => boardLine(line, tile.size * scale, frame.leading)), ...from],
    ),
  ];
}

/** Where one of a tile's pictures sits in it and how large, in the tile's pixels. */
interface BoardSpot {
  shot: BoardShot;
  top: number;
  height: number;
}

/** A tile's pictures, each with where it sits down the tile: a pair's two are one over the other, the rule between. */
function boardSpots(tile: BoardTile, frame: BoardFrame, scale: number): BoardSpot[] {
  const whole = Math.round(frame.height * scale);
  if (tile.kind === "picture") return [{ shot: tile.shot, top: 0, height: whole }];
  if (tile.kind === "quote") return tile.over ? [{ shot: tile.over, top: 0, height: whole }] : [];
  if (tile.kind === "card") return [];
  const half = Math.round(((frame.height - frame.rule) / 2) * scale);
  const lower = Math.round(((frame.height + frame.rule) / 2) * scale);
  return [
    { shot: tile.before, top: 0, height: half },
    { shot: tile.after, top: lower, height: whole - lower },
  ];
}

/** A still filling its spot, upright, cropped as the video crops it: across its middle, and down it at where it is held. */
async function boardFitted(spot: BoardSpot): Promise<Buffer> {
  const covering = await sharp(spot.shot.bytes)
    .rotate()
    .resize(BOARD_TILE_WIDTH, spot.height, { fit: "outside" })
    .toBuffer({ resolveWithObject: true });
  return sharp(covering.data)
    .extract({
      left: Math.round((covering.info.width - BOARD_TILE_WIDTH) / 2),
      top: Math.round((covering.info.height - spot.height) * spot.shot.heldAt),
      width: BOARD_TILE_WIDTH,
      height: spot.height,
    })
    .toBuffer();
}

/**
 * A video's storyboard, as a JPEG (decision 0122): each block side by side in play order, as the video will show it. A picture
 * is its first frame, with the opening words' backing drawn where the video will draw it, at the size it will have; a pair is
 * its two pictures, one over the other; a card is its words. `words` and `frame` are the video's own numbers (contracts
 * pieceWordsBoxOf, PIECE_FRAME), scaled here to the tile, so what is looked at before a video is made is where its words will
 * sit. Kept nowhere: it is looked at, by Ask and then by the person, and drawn again when asked.
 *
 * `plain` is the card's own: the stills alone, edge to edge, with no caption under them and no space between, since the page
 * stands each on its own and a block's seconds are nothing an owner needs. Ask's look keeps both: it names a block by its number.
 */
export async function composeBoard(board: {
  tiles: readonly BoardTile[];
  words: { lines: readonly string[]; top: number; size: number };
  frame: BoardFrame;
  plain?: boolean;
}): Promise<Buffer> {
  const { tiles, words, frame } = board;
  const gap = board.plain ? 0 : BOARD_GAP;
  const labelHeight = board.plain ? 0 : BOARD_LABEL_HEIGHT;
  const scale = BOARD_TILE_WIDTH / frame.width;
  const tileHeight = Math.round(frame.height * scale);
  const width = tiles.length * BOARD_TILE_WIDTH + Math.max(0, tiles.length - 1) * gap;
  const height = tileHeight + labelHeight;
  const column = (tile: BoardTile): PostNode => ({
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: BOARD_TILE_WIDTH, height },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", position: "relative", width: BOARD_TILE_WIDTH, height: tileHeight },
            children: boardOver(tile, { words, frame, scale }),
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
  const spots = tiles.flatMap((tile, i) =>
    boardSpots(tile, frame, scale).map((spot) => ({ spot, left: i * (BOARD_TILE_WIDTH + gap) })),
  );
  const [stills, layer] = await Promise.all([
    Promise.all(spots.map(async ({ spot, left }) => ({ input: await boardFitted(spot), left, top: spot.top }))),
    satori(laidOut(page), { width, height, fonts: await fontsHeld() }),
  ]);
  return sharp({ create: { width, height, channels: 3, background: BOARD_PAGE } })
    .composite([...stills, { input: Buffer.from(layer) }])
    .jpeg({ quality: DRAFT_JPEG_QUALITY })
    .toBuffer();
}
