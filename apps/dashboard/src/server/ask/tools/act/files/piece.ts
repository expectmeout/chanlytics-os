import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  DbFailure,
  PIECE_LIMITS,
  PIECE_WORDS_HOLDS,
  PIECE_WORDS_PLACES,
  pieceCountOf,
  pieceOpeningOf,
  pieceWordsIn,
  secondsOf,
  videoPreviewOf,
  whoStandsOf,
  type PiecePlan,
  type PieceWont,
} from "@chanlytics/contracts";
import { listReviewWords } from "@chanlytics/db/google";
import { checkPieceClips, pieceSecondsOf } from "@/server/content/piece";
import { PIECE_RECIPES } from "@/server/content/piece-recipes";
import { drawPieceBoard } from "@/server/content/storyboard";
import type { FileForAsk } from "@/server/files/line";
import { postDrawProblem, postWordsProblem } from "@/server/files/post-check";
import { load } from "../../../../shared/reader";
import * as readers from "../../../../readers/facts";
import { filesNamedForAsk } from "../../../../readers/files";
import { findPictureCopy } from "../../../../files/copies";
import {
  timeLeftOf,
  defineAct,
  type ProposalOutcome,
  type ToolContext,
  type ToolPicture,
} from "../../context/tool-defs";
import { approvalWords, propose, refuse } from "../../context/context";
import { filesNamed } from "../../read/files";
import { ownersWords } from "./post";

/**
 * A short video from the business's own clips and photos (decisions 0122 and 0126): blocks Ask arranges for the request (a
 * clip's moment, a photo, a before-and-after pair, a words card, a quote card), then a card with the business's name. Ask
 * chooses the blocks after opening the files and the words from what the owner said, and the owner presses Make it; a machine
 * then draws it, and it lands in Files. The act never acts.
 *
 * Ask looks at its own work before anyone else does (Ask's eyes, as a post's act): the first call draws the plan's storyboard,
 * each block as the video will show it, and answers the picture; the card is made only by a second call that carries the key
 * that drawing answered, which is the plan whole. Words over a face are seen there, and moved, before anything is spent: the
 * first video made without that look put its words on the client's face (the quality test, 10 Nov 2026), and the look every
 * finished file gets did not notice.
 *
 * How to arrange the blocks is advice, said in this tool's own words where the model reads them as it fills the plan
 * (content/piece-recipes.ts). Code holds what code can: every file is the business's own and kept, each stretch is inside its clip, whoever
 * is in them agreed, the words can be drawn and promise nothing the owner has not, and a quote is a client's own words, found
 * in a review the workspace holds or in what the owner wrote (contracts compilePiece, post-check).
 */

type Block = PiecePlan["blocks"][number];
type Shot = Extract<Block, { is: "pair" }>["before"];

/** What a drawn storyboard is known by once the model has looked at it: the plan, whole, in one short key. */
const pieceLookKeyOf = (plan: PiecePlan): string =>
  createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 10);

const LOOK_NOTE =
  "Look at the storyboard with the owner's eyes. Each tile is one block, in the order they play, drawn as the video will show it: a clip's first frame, a photo, a pair's two pictures (the before above the after), a card's words, with the opening words on every picture they are on. Do any words cover a face, or the very thing the video is showing? Then move the opening words (words_at), let them leave with the first block (words_hold first), shorten a label, or choose another moment. Does the first tile show what the words say? Does a pair show the same person from the same side, its before truly before the work began? Does any block repeat the one beside it: the same moment twice, the same words twice, a quote the opening words already gave away? Then cut one, or change it. Does each card read at a glance? Once it is right, call again with the same plan and looked set to look_key, and say beside that call the rest of what was asked. If something is off, call again with what you changed and no looked.";

/** Said at the look of a video that shows no file of theirs: what to ask the owner for, beside its card. */
const NOTHING_FILMED_NOTE =
  "This video shows none of their work, only words. Beside the call that makes the card, tell the owner which two or three short clips to film, so the next one can show it.";

/** What Ask is told as it looks at a plan's storyboard: what to look for, and what a plan of words alone still owes its owner. */
function lookNoteOf(plan: PiecePlan): string {
  const count = pieceCountOf(plan);
  return count.clips + count.photos === 0 ? `${LOOK_NOTE} ${NOTHING_FILMED_NOTE}` : LOOK_NOTE;
}

/** How many reviews a quote is looked for in: the newest, which are the ones Ask can have read. */
const REVIEWS_READ = 300;

const time = z.union([z.number(), z.string()]);
const BLOCK_KINDS = ["clip", "photo", "pair", "words", "quote"] as const;
type BlockKind = (typeof BLOCK_KINDS)[number];

/**
 * One block as the model names it: what it is, and the fields its kind takes. One flat shape with each field said once, for
 * the kinds that take it, so the tool stays small in the tools block (tests/ask/tools/ask-tools-size.test.mjs) and its schema
 * holds no union of objects. What a kind lacks is refused in words, naming the block (NEEDS).
 */
const blockInput = z.object({
  is: z
    .enum(BLOCK_KINDS)
    .describe(
      "clip plays a clip's moment; photo shows a photo, moving slowly; pair holds a before over an after, still; words is a card of words; quote is a client's words.",
    ),
  file: z.string().optional().describe("clip, photo: its file's name, as files says it."),
  from: time.optional().describe("clip: where the moment starts, as M:SS.s or seconds."),
  to: time.optional().describe(`clip: where it ends, ${PIECE_LIMITS.cutMinS} to ${PIECE_LIMITS.cutMaxS} seconds on.`),
  seconds: z
    .number()
    .optional()
    .describe(
      `Every kind but clip, how long it stands: photo ${PIECE_LIMITS.photoMinS} to ${PIECE_LIMITS.photoMaxS}, pair ${PIECE_LIMITS.pairMinS} to ${PIECE_LIMITS.pairMaxS}, words ${PIECE_LIMITS.cardMinS} to ${PIECE_LIMITS.cardMaxS}, quote ${PIECE_LIMITS.quoteMinS} to ${PIECE_LIMITS.quoteMaxS}.`,
    ),
  label: z
    .string()
    .optional()
    .describe(
      `clip, photo: one short line low on this block alone, at most ${PIECE_LIMITS.label} characters, in the owner's words. Left out on most.`,
    ),
  before: z
    .string()
    .optional()
    .describe("pair: the picture above, under Before (code writes the word): a photo's name, or a clip's."),
  before_at: time.optional().describe("Where before is a clip: the moment to hold still, as M:SS.s or seconds."),
  after: z.string().optional().describe("pair: the picture below, under After."),
  after_at: time.optional().describe("As before_at."),
  lines: z
    .array(z.string())
    .max(PIECE_LIMITS.cardLines)
    .optional()
    .describe(
      `words: the card's lines, large on the dark ground, at most ${PIECE_LIMITS.cardLine} characters each, in the owner's language and words.`,
    ),
  text: z
    .string()
    .optional()
    .describe(
      `quote: a client's words exactly as written, at most ${PIECE_LIMITS.quote} characters, from a review this workspace holds (report, lens reviews) or from what the owner wrote here. Never reworded, never yours, never their name: code says where it was said.`,
    ),
  over: z.string().optional().describe("quote: the picture it stands over, dimmed. Left out, the dark ground."),
  over_at: time.optional().describe("As before_at."),
});

const pieceInput = z.object({
  blocks: z
    .array(blockInput)
    .min(PIECE_LIMITS.blocksMin)
    .max(PIECE_LIMITS.blocksMax)
    .describe(
      `The blocks in play order. Together ${PIECE_LIMITS.reelMinS} to ${PIECE_LIMITS.reelMaxS} seconds; the end card follows by itself. Each says what it is and gives the fields of its kind.`,
    ),
  lines: z
    .array(z.string())
    .max(PIECE_LIMITS.lines)
    .describe(
      `The opening words over the first block's picture: one or two lines of at most ${PIECE_LIMITS.line} characters, in the owner's language and words. In the client's own voice or with a small tension, never a slogan; the first block must show what they say. Empty only when the video opens on a words card or a quote.`,
    ),
  words_at: z
    .enum(PIECE_WORDS_PLACES)
    .describe(
      "Where the opening words sit, chosen from the frames: wherever they cover no face and not the thing being shown. High is over a head; low is under a face, over the lap.",
    ),
  words_hold: z
    .enum(PIECE_WORDS_HOLDS)
    .describe(
      "all keeps the opening words over every picture, only where none puts a face under them; first lets them leave with the first block.",
    ),
  end_line: z
    .string()
    .optional()
    .describe(
      `One short line for the end card, at most ${PIECE_LIMITS.endLine} characters, or left out. Never a booking line: code adds the business's name, its number and its address.`,
    ),
  people_agreed: z
    .boolean()
    .optional()
    .describe("Only when the owner said in this thread that the people shown agreed to be."),
  looked: z
    .string()
    .optional()
    .describe(
      "The storyboard's look_key, once you have looked at it and it is right. Left out, the storyboard is drawn and shown to you, and no card is made.",
    ),
});

type BlockInput = z.infer<typeof blockInput>;

/** What each kind of block must give, said when one does not. */
const NEEDS: Readonly<Record<BlockKind, string>> = {
  clip: "a clip block gives file, from and to",
  photo: "a photo block gives file and seconds",
  pair: "a pair gives before and after, each a file's name, and seconds",
  words: "a words block gives lines and seconds",
  quote: "a quote block gives text and seconds",
};

/** Why a plan can't be made, said to the model, which can do something about it. */
const WONT_TO_MODEL: Readonly<Record<PieceWont, string>> = {
  blocks: `a video takes ${PIECE_LIMITS.blocksMin} to ${PIECE_LIMITS.blocksMax} blocks`,
  file: "its file is not in Files: names come from files with action list",
  not_video:
    "its file is a picture: a clip block plays a moment of a video. Show a picture with a photo block, or in a pair",
  not_photo:
    "its file is a video: a photo block shows a picture. Play a moment of it with a clip block, or hold one still in a pair (before_at, after_at)",
  made: "its file was made here already, with its words on it. Use the clip or the photo it came from",
  unkept: "its file waits in the Inbox or was set aside: it is the owner's to keep first",
  not_ready: "its clip is still being made ready. Say so, and that you will once it is",
  stretch: "it has no length: from comes before to, both inside the clip",
  past_end: "it runs past the end of its clip: open the clip again and choose seconds inside it",
  block_length: `it runs shorter or longer than its kind may: a clip's moment ${PIECE_LIMITS.cutMinS} to ${PIECE_LIMITS.cutMaxS} seconds, a photo ${PIECE_LIMITS.photoMinS} to ${PIECE_LIMITS.photoMaxS}, a pair ${PIECE_LIMITS.pairMinS} to ${PIECE_LIMITS.pairMaxS}, a words card ${PIECE_LIMITS.cardMinS} to ${PIECE_LIMITS.cardMaxS}, a quote ${PIECE_LIMITS.quoteMinS} to ${PIECE_LIMITS.quoteMaxS}`,
  length: `the blocks together run ${PIECE_LIMITS.reelMinS} to ${PIECE_LIMITS.reelMaxS} seconds`,
  people:
    "its file shows someone recognizable, and no one has said they agreed to be shown. Ask the owner in a sentence; if they say yes, call again with people_agreed true",
  lines: `a video that opens on a picture has opening words: one or two lines of at most ${PIECE_LIMITS.line} characters each`,
  opens_on_card:
    "the opening words sit over a picture, and this video opens on a card: leave lines empty, or open on a clip, a photo or a pair",
  card: `a words card takes one to ${PIECE_LIMITS.cardLines} lines of at most ${PIECE_LIMITS.cardLine} characters each`,
  quote: `a quote runs at most ${PIECE_LIMITS.quote} characters: choose its best sentence, as it was written`,
  label: `a label is one line of at most ${PIECE_LIMITS.label} characters`,
};

/** A moment as the model says it, in seconds to the hundredth, or null where it is none. */
function blockMomentOf(moment: z.infer<typeof time>): number | null {
  const second = secondsOf(moment);
  return second === null || second < 0 ? null : Math.round(second * 100) / 100;
}

/** What a block is built from: the files its plan names, and whether the owner said those in them agreed. */
interface Building {
  files: readonly FileForAsk[];
  agreed: boolean;
}

/** A file by the name a block gives it, or why it can't be shown. */
function fileFor(building: Building, name: string): FileForAsk | string {
  const file = filesNamed(building.files, [name]).found.at(0);
  if (!file) return `no file named ${name}; names come from files with action list`;
  return whoStandsOf(file).is === "ask" && !building.agreed ? WONT_TO_MODEL.people : file;
}

/** A picture held still: a photo, or one moment of a clip, which `at` says. `field` is the input that names its file. */
function shotFor(building: Building, field: string, name: string, at: z.infer<typeof time> | undefined): Shot | string {
  const file = fileFor(building, name);
  if (typeof file === "string") return file;
  if (file.kind !== "video") return { file_id: file.id, at: null };
  const moment = at === undefined ? null : blockMomentOf(at);
  return moment === null
    ? `${name} is a clip: say ${field}_at, the moment of it to hold still, as M:SS.s or seconds`
    : { file_id: file.id, at: moment };
}

const blockLabelOf = (label: string | undefined): string | null => label?.trim() || null;

function clipFor(building: Building, block: BlockInput): Block | string {
  if (block.file === undefined || block.from === undefined || block.to === undefined) return NEEDS.clip;
  const file = fileFor(building, block.file);
  if (typeof file === "string") return file;
  const from = blockMomentOf(block.from);
  const to = blockMomentOf(block.to);
  if (from === null || to === null) return "from and to are moments, as M:SS.s or seconds";
  return { is: "clip", file_id: file.id, from, to, label: blockLabelOf(block.label) };
}

function photoFor(building: Building, block: BlockInput): Block | string {
  if (block.file === undefined || block.seconds === undefined) return NEEDS.photo;
  const file = fileFor(building, block.file);
  return typeof file === "string"
    ? file
    : { is: "photo", file_id: file.id, seconds: block.seconds, label: blockLabelOf(block.label) };
}

function pairFor(building: Building, block: BlockInput): Block | string {
  if (block.before === undefined || block.after === undefined || block.seconds === undefined) return NEEDS.pair;
  const before = shotFor(building, "before", block.before, block.before_at);
  if (typeof before === "string") return before;
  const after = shotFor(building, "after", block.after, block.after_at);
  return typeof after === "string" ? after : { is: "pair", before, after, seconds: block.seconds };
}

function cardFor(block: BlockInput): Block | string {
  if (block.lines === undefined || block.seconds === undefined) return NEEDS.words;
  return { is: "words", lines: block.lines.map((line) => line.trim()), seconds: block.seconds };
}

function quoteFor(building: Building, block: BlockInput): Block | string {
  if (block.text === undefined || block.seconds === undefined) return NEEDS.quote;
  const over = block.over === undefined ? null : shotFor(building, "over", block.over, block.over_at);
  if (typeof over === "string") return over;
  return {
    is: "quote",
    text: block.text.trim(),
    // Where it was said is known once it is found (quotesSourced).
    from: null,
    over,
    seconds: block.seconds,
  };
}

/** One block as the plan keeps it, its files by their ids, in one key order always; or why it can't be. */
function blockFor(building: Building, block: BlockInput): Block | string {
  switch (block.is) {
    case "clip":
      return clipFor(building, block);
    case "photo":
      return photoFor(building, block);
    case "pair":
      return pairFor(building, block);
    case "words":
      return cardFor(block);
    case "quote":
      return quoteFor(building, block);
  }
}

/** The names of the files a block shows, whichever of its fields name one. */
const fileNamesOf = (block: BlockInput): string[] =>
  [block.file, block.before, block.after, block.over].filter((name) => name !== undefined);

/**
 * What is wrong with a block's own words, or null. A label and a card's lines are the owner's, held to what they said as the
 * opening words are; a quote is a client's, held here only to what can be drawn (whose words it is, quotesSourced says).
 */
function blockWordsProblem(block: Block, owner: string): string | null {
  if (block.is === "clip" || block.is === "photo")
    return block.label === null ? null : postWordsProblem(block.label, owner, PIECE_LIMITS.label);
  if (block.is === "quote") return postDrawProblem(block.text, PIECE_LIMITS.quote);
  if (block.is !== "words") return null;
  for (const line of block.lines) {
    const problem = postWordsProblem(line, owner, PIECE_LIMITS.cardLine);
    if (problem) return problem;
  }
  return null;
}

/** The first problem with the words a video would say, naming the part it is in, or null. */
function wordsProblem(plan: PiecePlan, owner: string): string | null {
  for (const [i, line] of plan.lines.entries()) {
    const problem = postWordsProblem(line, owner, PIECE_LIMITS.line);
    if (problem) return `line ${i + 1}: ${problem}`;
  }
  for (const [i, block] of plan.blocks.entries()) {
    const problem = blockWordsProblem(block, owner);
    if (problem) return `block ${i + 1}: ${problem}`;
  }
  const end = plan.end_line ? postWordsProblem(plan.end_line, owner, PIECE_LIMITS.endLine) : null;
  return end ? `end_line: ${end}` : null;
}

/**
 * Words as two tellings of them are compared: in lower case, typographic marks as their plain ones, one space between words,
 * and no quote marks or trailing dots around them.
 */
const quotePlain = (words: string): string =>
  words
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.]+|[\s"'.]+$/g, "");

/**
 * A plan with each of its quotes saying where it was said, or the block (counted from one) of the first quote that is no one's
 * own words. A quote is a client's: found, as it was written, in a review the workspace holds ("Google review") or else in
 * what the owner wrote in this thread ("A client"). One Ask composed, or reworded, is neither, and a review nobody wrote
 * never reaches a video. Where it was said is read here and never taken from the model, and nobody is named.
 */
async function quotesSourced(toolContext: ToolContext, plan: PiecePlan, owner: string): Promise<PiecePlan | number> {
  if (!plan.blocks.some((block) => block.is === "quote")) return plan;
  const read = await listReviewWords(toolContext.ctx.supabase, toolContext.tenantId, REVIEWS_READ);
  if (read.error) throw new DbFailure(read.error, "reading the reviews a quote is held to");
  const reviews = read.data.map((review) => quotePlain(review.body));
  const owned = quotePlain(owner);
  const says = pieceWordsIn(plan.language).quoteFrom;
  const blocks: Block[] = [];
  for (const [i, block] of plan.blocks.entries()) {
    if (block.is !== "quote") {
      blocks.push(block);
      continue;
    }
    const text = quotePlain(block.text);
    // Marks alone are no one's words.
    const reviewed = text !== "" && reviews.some((review) => review.includes(text));
    if (!reviewed && (text === "" || !owned.includes(text))) return i + 1;
    blocks.push({ ...block, from: reviewed ? says.google_review : says.client });
  }
  return { ...plan, blocks };
}

type Checked = Extract<Awaited<ReturnType<typeof checkPieceClips>>, { ok: true }>;

/** The storyboard, shown to the model to look at: no card yet, and the key a second call carries. */
async function boardShownFirst(
  toolContext: ToolContext,
  checked: Checked,
  look: { key: string; note: string },
): Promise<ProposalOutcome> {
  let bytes: Buffer;
  try {
    bytes = await drawPieceBoard(toolContext.ctx, toolContext.tenantId, checked);
  } catch (error) {
    if (error instanceof AppError) return refuse(error.message);
    throw error;
  }
  const held = await findPictureCopy(
    { tenantId: toolContext.tenantId, userId: toolContext.ctx.userId },
    { bytes, mime: "image/jpeg", name: "video-storyboard.jpg" },
    timeLeftOf(toolContext),
  );
  const drawn = { drawn: true, look_key: look.key };
  if (!held)
    return {
      proposal: null,
      isError: false,
      result: JSON.stringify({
        ...drawn,
        could_not_show: true,
        note: "The storyboard was drawn but could not be shown to you just now. Call again with looked set to look_key to make the card, and say beside it that you could not check where the words sit.",
      }),
    };
  const picture: ToolPicture = {
    name: "video-storyboard",
    what: "The storyboard of the video: each block in play order, drawn as the video will show it, with the opening words where it shows them",
    fileId: held.fileId,
    size: [held.width ?? 0, held.height ?? 0],
  };
  return { proposal: null, isError: false, result: JSON.stringify({ ...drawn, note: look.note }), pictures: [picture] };
}

/** The plan a call asks for, its files by their ids, or the refusal that names the block it could not build. */
async function planAsked(
  toolContext: ToolContext,
  input: z.infer<typeof pieceInput>,
): Promise<PiecePlan | ProposalOutcome> {
  const names = [...new Set(input.blocks.flatMap(fileNamesOf))];
  const { files } = await load(toolContext.rc, filesNamedForAsk, { names }).then((r) => r.data);
  const language = toolContext.language === "es" ? "es" : "en";
  const building: Building = { files, agreed: input.people_agreed === true };
  const blocks: Block[] = [];
  for (const [i, given] of input.blocks.entries()) {
    const block = blockFor(building, given);
    if (typeof block === "string") return refuse(`block ${i + 1}: ${block}`);
    blocks.push(block);
  }
  // In one order always, so the key names the plan whole, whoever built it.
  return {
    shape: "blocks",
    blocks,
    lines: input.lines.map((line) => line.trim()),
    words_at: input.words_at,
    words_hold: input.words_hold,
    end_line: input.end_line?.trim() || null,
    language,
    people_agreed: building.agreed,
  };
}

async function pieceOutcome(toolContext: ToolContext, input: z.infer<typeof pieceInput>): Promise<ProposalOutcome> {
  const config = await load(toolContext.rc, readers.config, undefined).then((r) => r.data?.config ?? null);
  if (!videoPreviewOf(config)) return refuse("this workspace does not keep videos yet, so none can be made");
  const given = await planAsked(toolContext, input);
  if (!("shape" in given)) return given;
  const owner = ownersWords(toolContext, config);
  const wordsWrong = wordsProblem(given, owner);
  if (wordsWrong) return refuse(wordsWrong);
  const plan = await quotesSourced(toolContext, given, owner);
  if (typeof plan === "number")
    return refuse(
      `block ${plan}: the quote is not in a review this workspace holds, nor in what the owner wrote. A quote is a client's own words, exactly as written: read them with report (lens reviews) and copy the sentence, or ask the owner to paste the review`,
    );
  const checked = await checkPieceClips(toolContext.ctx, toolContext.tenantId, plan, config);
  if (!checked.ok)
    return refuse(checked.cut ? `block ${checked.cut}: ${WONT_TO_MODEL[checked.wont]}` : WONT_TO_MODEL[checked.wont]);
  const key = pieceLookKeyOf(plan);
  if (input.looked !== key) {
    if (input.looked)
      return refuse(
        `looked ${input.looked} is not this plan's key: the plan changed since you looked. Call again without looked, and look at the storyboard as it is drawn now.`,
      );
    return boardShownFirst(toolContext, checked, { key, note: lookNoteOf(plan) });
  }
  const says = pieceWordsIn(plan.language);
  return propose({
    kind: "piece",
    // Both opening lines: a phrase a line could not hold is broken across two, and its row on Content joins them too.
    title: says.cardTitle(pieceOpeningOf(plan).join(" ")),
    summary: says.summary(pieceCountOf(plan), pieceSecondsOf(checked.timeline)),
    payload: plan,
  });
}

export const pieceAct = defineAct({
  name: "propose_piece",
  description: `Make a short video from the business's own clips and photos: upright, 8 to 15 seconds, built from blocks you arrange for this request, then a card with the business's name. A machine draws it once the owner presses Make it, in about a minute, and it lands in Files. Open the files with files first (view; zoom on a clip's stretch) and choose real moments; then call this. The first call draws a storyboard and shows it to you: look at it with the owner's eyes, change the plan if words sit on a face or a block reads badly, and call again with looked set to its look_key; only then is the card made, and that call ends the turn, so answer the rest of what they asked beside it, in the same message. Use it for a video or a reel from their clips, their photos or words alone; for one picture with words, propose_post. ${PIECE_RECIPES} ${approvalWords("piece")}.`,
  kind: "piece",
  input: pieceInput,
  label: "Planning a video",
  build: pieceOutcome,
});
