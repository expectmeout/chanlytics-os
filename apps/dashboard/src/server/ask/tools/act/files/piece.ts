import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  PIECE_LIMITS,
  PIECE_WORDS_HOLDS,
  PIECE_WORDS_PLACES,
  pieceWordsIn,
  secondsOf,
  videoPreviewOf,
  whoStandsOf,
  type PiecePlan,
  type PieceWont,
} from "@chanlytics/contracts";
import { checkPieceClips, pieceSecondsOf } from "@/server/content/piece";
import { drawPieceBoard } from "@/server/content/storyboard";
import { postWordsProblem } from "@/server/files/post-check";
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
 * A short video from the business's own clips (decision 0122): the result on the first frame under a line or two of words, then
 * how it got there, then a card with the business's name. Ask chooses the moments after opening the clips and the words from
 * what the owner said, and the owner presses Make it; a machine then draws it, and it lands in Files. The act never acts.
 *
 * Ask looks at its own work before anyone else does (Ask's eyes, as a post's act): the first call draws the plan's storyboard,
 * each cut's first frame with the opening words where the video will show them, and answers the picture; the card is made only
 * by a second call that carries the key that drawing answered, which is the plan whole. Words over a face are seen there, and
 * moved, before anything is spent: the first video made without that look put its words on the client's face (the quality test,
 * 10 Nov 2026), and the look every finished file gets did not notice.
 *
 * The choosing is said in this tool's own words, where the model reads them as it fills the plan: one client a video, the first
 * picture showing what the words say, moments that move, lines in the client's voice. Code holds what code can: the clips are
 * the business's own ready, kept videos, each stretch is inside its clip, whoever is in them agreed, the words can be drawn and
 * promise nothing the owner has not (contracts compilePiece, post-check).
 */

/** What a drawn storyboard is known by once the model has looked at it: the plan, whole, in one short key. */
const pieceLookKeyOf = (plan: PiecePlan): string =>
  createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 10);

const LOOK_NOTE =
  "Look at the storyboard with the owner's eyes. Each tile is the first frame of a cut, in the order they play, with the opening words drawn where the video will show them. Do the words cover a face, or the very thing the video is showing, on any tile they are on? Then move them (words_at), let them leave with the first cut (words_hold first), or choose another moment. Does the first tile show what the words say? Is it one person's story? Once it is right, call again with the same plan and looked set to look_key, and say beside that call the rest of what was asked. If something is off, call again with what you changed and no looked.";

const time = z.union([z.number().min(0), z.string().max(12)]);

const pieceInput = z.object({
  cuts: z
    .array(
      z.object({
        file: z.string().min(1).max(120).describe("The clip's name, as files says it."),
        from: time.describe("Where the cut starts in its clip, as M:SS.s or seconds."),
        to: time.describe("Where it ends."),
      }),
    )
    .min(PIECE_LIMITS.cutsMin)
    .max(PIECE_LIMITS.cutsMax)
    .describe(
      `The cuts in the order they play, chosen after opening each clip with files (view, then zoom on a stretch). The first is the result. Three or four cuts of 1.5 to 3 seconds, 8 to 10 seconds in all, serve best; each must run ${PIECE_LIMITS.cutMinS} to ${PIECE_LIMITS.cutMaxS} seconds and together ${PIECE_LIMITS.reelMinS} to ${PIECE_LIMITS.reelMaxS}. One client a video: take every cut from one clip unless two clips show the same client that day. Choose moments where the person or what is shown moves, and no stretch where nothing changes for more than two seconds.`,
    ),
  lines: z
    .array(z.string())
    .min(1)
    .max(PIECE_LIMITS.lines)
    .describe(
      `The words on the first frame: one or two lines, each at most ${PIECE_LIMITS.line} characters, in the owner's language, from their words. In the client's own voice or with a small tension, never a slogan. The first frame must show what they say.`,
    ),
  words_at: z
    .enum(PIECE_WORDS_PLACES)
    .describe(
      "Where the words sit, chosen from the frames: wherever they cover no face and not the thing being shown. High is over a head; low is under a face, over the lap.",
    ),
  words_hold: z
    .enum(PIECE_WORDS_HOLDS)
    .describe(
      "all keeps the words for the whole video, only where no cut puts a face under them; first lets them leave with the first cut.",
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
    .describe("Only when the owner said in this thread that the people in the clips agreed to be shown."),
  looked: z
    .string()
    .optional()
    .describe(
      "The look_key the storyboard answered, once you have looked at it and it is right; left out, the storyboard is drawn and shown to you first, and no card is made.",
    ),
});

/** Why a plan can't be made, said to the model, which can do something about it. */
const WONT_TO_MODEL: Readonly<Record<PieceWont, string>> = {
  cuts: `a video takes ${PIECE_LIMITS.cutsMin} to ${PIECE_LIMITS.cutsMax} cuts`,
  file: "its clip is not in Files: names come from files with action list",
  not_video: "its file is a picture: a video is cut from video clips",
  made: "its clip is a video already made here, with its words on it. Cut from the clips it came from",
  unkept: "its clip waits in the Inbox or was set aside: it is the owner's to keep first",
  not_ready: "its clip is still being made ready. Say so, and that you will once it is",
  stretch: "it has no length: from comes before to, both inside the clip",
  past_end: "it runs past the end of its clip: open the clip again and choose seconds inside it",
  cut_length: `each cut runs ${PIECE_LIMITS.cutMinS} to ${PIECE_LIMITS.cutMaxS} seconds`,
  length: `the cuts together run ${PIECE_LIMITS.reelMinS} to ${PIECE_LIMITS.reelMaxS} seconds`,
  people:
    "its clip shows someone recognizable, and no one has said they agreed to be shown. Ask the owner in a sentence; if they say yes, call again with people_agreed true",
  lines: `the opening words are one or two lines of at most ${PIECE_LIMITS.line} characters each`,
};

/** How long the edge has for the storyboard's copy, from what is left of the turn. */

/** The first problem with the words a video would say, naming the part it is in, or null. */
function wordsProblem(plan: PiecePlan, owner: string): string | null {
  for (const [i, line] of plan.lines.entries()) {
    const problem = postWordsProblem(line, owner, PIECE_LIMITS.line);
    if (problem) return `line ${i + 1}: ${problem}`;
  }
  const end = plan.end_line ? postWordsProblem(plan.end_line, owner, PIECE_LIMITS.endLine) : null;
  return end ? `end_line: ${end}` : null;
}

type Checked = Extract<Awaited<ReturnType<typeof checkPieceClips>>, { ok: true }>;

/** The storyboard, shown to the model to look at: no card yet, and the key a second call carries. */
async function boardShownFirst(toolContext: ToolContext, checked: Checked, key: string): Promise<ProposalOutcome> {
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
  const drawn = { drawn: true, look_key: key };
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
    what: "The storyboard of the video: each cut's first frame, in play order, with the opening words where it shows them",
    fileId: held.fileId,
    size: [held.width ?? 0, held.height ?? 0],
  };
  return { proposal: null, isError: false, result: JSON.stringify({ ...drawn, note: LOOK_NOTE }), pictures: [picture] };
}

async function pieceOutcome(toolContext: ToolContext, input: z.infer<typeof pieceInput>): Promise<ProposalOutcome> {
  const config = await load(toolContext.rc, readers.config, undefined).then((r) => r.data?.config ?? null);
  if (!videoPreviewOf(config)) return refuse("this workspace does not keep videos yet, so none can be made from clips");
  const names = [...new Set(input.cuts.map((cut) => cut.file))];
  const { files } = await load(toolContext.rc, filesNamedForAsk, { names }).then((r) => r.data);
  const cuts: PiecePlan["cuts"] = [];
  for (const [i, cut] of input.cuts.entries()) {
    const file = filesNamed(files, [cut.file]).found.at(0);
    if (!file) return refuse(`cut ${i + 1}: no file named ${cut.file}; names come from files with action list`);
    const from = secondsOf(cut.from);
    const to = secondsOf(cut.to);
    if (from === null || to === null) return refuse(`cut ${i + 1}: from and to are moments, as M:SS.s or seconds`);
    if (whoStandsOf(file).is === "ask" && !input.people_agreed) return refuse(`cut ${i + 1}: ${WONT_TO_MODEL.people}`);
    cuts.push({ file_id: file.id, from: Math.round(from * 100) / 100, to: Math.round(to * 100) / 100 });
  }
  const language = toolContext.language === "es" ? "es" : "en";
  // In one order always, so the key names the plan whole, whoever built it.
  const plan: PiecePlan = {
    shape: "hook_cut",
    cuts,
    lines: input.lines.map((line) => line.trim()),
    words_at: input.words_at,
    words_hold: input.words_hold,
    end_line: input.end_line?.trim() || null,
    language,
    people_agreed: input.people_agreed === true,
  };
  const wordsWrong = wordsProblem(plan, ownersWords(toolContext, config));
  if (wordsWrong) return refuse(wordsWrong);
  const checked = await checkPieceClips(toolContext.ctx, toolContext.tenantId, plan, config);
  if (!checked.ok)
    return refuse(checked.cut ? `cut ${checked.cut}: ${WONT_TO_MODEL[checked.wont]}` : WONT_TO_MODEL[checked.wont]);
  const key = pieceLookKeyOf(plan);
  if (input.looked !== key) {
    if (input.looked)
      return refuse(
        `looked ${input.looked} is not this plan's key: the plan changed since you looked. Call again without looked, and look at the storyboard as it is drawn now.`,
      );
    return boardShownFirst(toolContext, checked, key);
  }
  const says = pieceWordsIn(language);
  return propose({
    kind: "piece",
    title: says.cardTitle(plan.lines[0] ?? ""),
    summary: says.summary(plan.cuts.length, pieceSecondsOf(checked.timeline), checked.files.length),
    payload: plan,
  });
}

export const pieceAct = defineAct({
  name: "propose_piece",
  description: `Make a short video from the business's own video clips, for Instagram, TikTok or anywhere: upright, 8 to 15 seconds, the result on the first frame under a line or two of their words, then how it got there, then a card with the business's name. A machine draws it once the owner presses Make it, in about a minute, and it lands in Files. Open the clips with files first (view, then zoom on the stretches you mean to use) and choose real moments; then call this. The first call draws a storyboard and shows it to you: look at it with the owner's eyes, change the plan if the words sit on a face, and call again with looked set to its look_key; only then is the card made, and that call ends the turn, so answer the rest of what they asked beside it, in the same message. Use it when they ask for a video, a reel or a clip made from what they filmed; for one picture with words, propose_post. ${approvalWords("piece")}.`,
  kind: "piece",
  input: pieceInput,
  label: "Planning a video",
  build: pieceOutcome,
});
