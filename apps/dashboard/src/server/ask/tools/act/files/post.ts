import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  POST_LAYOUTS,
  POST_LIMITS,
  POST_NO_PHONE,
  POST_VOICES,
  fileSaidOf,
  isAskMorningQuestion,
  postWordsIn,
  secondsOf,
  whoStandsOf,
  type PostPlan,
} from "@chanlytics/contracts";
import { postMomentProblem, postPhotoProblem, postPlanProblem } from "@/server/files/post-check";
import { load } from "../../../../shared/reader";
import * as readers from "../../../../readers/facts";
import { filesNamedForAsk } from "../../../../readers/files";
import { findPictureCopy } from "../../../../files/copies";
import { POST_SIZES } from "../../../../posts/layout";
import { getPhoto, postDrawn } from "../../../../posts/make";
import { postMaterialFrom } from "../../../../posts/material";
import { postPhoneOf } from "../../../../posts/phone";
import { defineAct, type ProposalOutcome, type ToolContext, type ToolPicture } from "../../context/tool-defs";
import { propose, refuse } from "../../context/context";
import { filesNamed } from "../../read/files";

/**
 * A post from one of the business's photos, or from one moment of one of its videos (decision 0099, step 3). Code draws it, so it
 * is free, and the card shows the real picture: Ask chooses the photo, or the moment, after opening it, chooses the words from what
 * the owner said, and the owner presses Save. A video's moment is kept as a still in its folder, so the post is a picture as any
 * other. The act never acts. The words are held here, where it is known who said what: their questions in this thread and what
 * they wrote in Settings, never what a customer wrote, a page shows or a read returned. A price, a number or a promise that came
 * from anywhere else is refused back to the model, which uses their words or asks them.
 *
 * Ask looks at its own work before anyone else does (Ask's eyes): the first call draws the post and answers the picture, and the
 * card is made only by a second call that carries the key the drawing answered, which is the plan whole, so a plan changed since
 * the look is drawn and looked at again. Code holds it, not the model's good will. The call that makes the card ends the turn
 * (loop.ts, cards alone), so what the model has to say, the rest of what was asked, is written beside that call; beside the look
 * it is set aside (turn-end.ts besideActs). The first real turn (7 Nov 2026) answered nothing: the note then said to say nothing
 * until the card was made, and the model took it as nothing at all.
 */

/** What the owner has said, as a post's words are held to it: this thread's questions and their Settings. A morning's turn asks itself. */
function ownersWords(t: ToolContext, config: unknown): string {
  const questions = isAskMorningQuestion(t.question) ? [] : [t.question ?? ""];
  return [...questions, ...(t.askedEarlier ?? []), config ? JSON.stringify(config) : ""].join("\n");
}

/** What a drawn post is known by once the model has looked at it: the plan, whole, in one short key. */
export const postLookKeyOf = (plan: PostPlan): string =>
  createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 10);

const LOOK_NOTE =
  "Look at the post as drawn, with the owner's eyes: do the words sit on the calmer end, clear of the sign, of any face and of what the photo is of; do they read; are the voice and layout right for this business, and for how their last post looked? If something is wrong, change the plan and call again. If it is right, call again with looked set to look_key: only then is the card made. That call ends the turn, so your answer to the person goes beside it, in the same message: the rest of what they asked, their question or what they had you read, answered in full, and a line on the post. Anything written beside this look is set aside.";

const postInput = z.object({
  file: z
    .string()
    .min(1)
    .max(120)
    .describe(
      "The photo's name, or the video's, as files says it; open it with view first unless it came with the question.",
    ),
  at: z
    .union([z.number().min(0), z.string().max(12)])
    .optional()
    .describe("For a video only: the moment the post is drawn from, as M:SS or seconds, chosen after opening it."),
  line: z
    .string()
    .describe(
      `The post's headline, at most ${POST_LIMITS.line} characters, in the owner's language and from their words.`,
    ),
  over: z
    .string()
    .optional()
    .describe(`A few words over the headline: what this is, or the business's name. At most ${POST_LIMITS.over}.`),
  under: z
    .string()
    .optional()
    .describe(`A short line under it, such as when an offer ends. At most ${POST_LIMITS.under}.`),
  book: z.boolean().describe("Whether to add the band with the business's phone number."),
  words_at: z
    .enum(["top", "bottom"])
    .describe("Where the words stand, chosen after seeing the photo: the calmer end, off what it is a photo of."),
  voice: z
    .enum(POST_VOICES)
    .describe("classic is a serif, for beauty, food and hospitality; modern is a plain sans, for trades and services."),
  layout: z
    .enum(POST_LAYOUTS)
    .optional()
    .describe(
      "How the words stand with the photo: over it (the usual), left over it, on a band of their colour, or under it in a frame; band or frame where the photo is busy at both ends.",
    ),
  people_agreed: z
    .boolean()
    .optional()
    .describe("Only when the owner said in this thread that the people in the photo agreed to be shown."),
  looked: z
    .string()
    .optional()
    .describe(
      "The look_key the drawing answered, once you have looked at the post as drawn and it is right; left out, the post is drawn and shown to you first, and no card is made.",
    ),
});

/** How long the edge has for the drawn post's copy, from what is left of the turn. */
const leftOf = (t: ToolContext): number | undefined => (t.endsAt === undefined ? undefined : t.endsAt - Date.now());

/** The post drawn as its card would draw it, shown to the model to look at: no card yet, and the key a second call carries. */
async function postShownFirst(
  toolContext: ToolContext,
  plan: PostPlan,
  name: string,
  key: string,
  config: unknown,
): Promise<ProposalOutcome> {
  let bytes: Buffer;
  try {
    const row = await getPhoto(toolContext.ctx, plan);
    const material = await postMaterialFrom(toolContext.ctx, toolContext.tenantId, { file: row, at: plan.at }, () =>
      Promise.resolve(config),
    );
    bytes = await postDrawn(plan, material, "portrait", true);
  } catch (e) {
    if (e instanceof AppError) return refuse(`${name}: ${e.message}`);
    throw e;
  }
  const held = await findPictureCopy(
    { tenantId: toolContext.tenantId, userId: toolContext.ctx.userId },
    { bytes, mime: "image/jpeg", name: `${name}-post.jpg` },
    leftOf(toolContext),
  );
  const drawn = { drawn: true, file: name, look_key: key };
  if (!held) {
    return {
      proposal: null,
      isError: false,
      result: JSON.stringify({
        ...drawn,
        could_not_show: true,
        note: "The post was drawn but could not be shown to you just now. Call again with looked set to look_key to make the card, and say beside it that you could not check the picture.",
      }),
    };
  }
  const picture: ToolPicture = {
    name,
    what: `The post drawn from ${name}`,
    fileId: held.fileId,
    size: [held.width ?? POST_SIZES.portrait.width, held.height ?? POST_SIZES.portrait.height],
  };
  return { proposal: null, isError: false, result: JSON.stringify({ ...drawn, note: LOOK_NOTE }), pictures: [picture] };
}

async function postOutcome(toolContext: ToolContext, input: z.infer<typeof postInput>): Promise<ProposalOutcome> {
  const [{ files }, config] = await Promise.all([
    load(toolContext.rc, filesNamedForAsk, { names: [input.file] }).then((r) => r.data),
    load(toolContext.rc, readers.config, undefined).then((r) => r.data?.config ?? null),
  ]);
  const { found } = filesNamed(files, [input.file]);
  const file = found.at(0);
  if (!file) return refuse(`no file named ${input.file}; names come from files with action list`);
  // A photo has no moment: one named for it is not read, and never reaches its plan.
  const at = file.kind === "video" && input.at !== undefined ? secondsOf(input.at) : null;
  const photoProblem = postPhotoProblem(file) ?? postMomentProblem(file, at);
  if (photoProblem) return refuse(`${input.file}: ${photoProblem}`);
  if (whoStandsOf(file).is === "ask" && !input.people_agreed)
    return refuse(
      `${input.file} shows someone recognizable, and no one has said they agreed to be shown. Ask the owner in a sentence; if they say yes, call again with people_agreed true.`,
    );
  const words = { line: input.line.trim(), over: input.over?.trim() || null, under: input.under?.trim() || null };
  const wordsProblem = postPlanProblem(words, ownersWords(toolContext, config));
  if (wordsProblem) return refuse(wordsProblem);
  if (input.book && !(await postPhoneOf(toolContext.ctx, toolContext.tenantId, config))) return refuse(POST_NO_PHONE);
  const language = toolContext.language === "es" ? "es" : "en";
  // In one order always, so the key names the plan whole, whoever built it.
  const plan: PostPlan = {
    file_id: file.id,
    line: words.line,
    over: words.over,
    under: words.under,
    book: input.book,
    words_at: input.words_at,
    voice: input.voice,
    layout: input.layout ?? "over",
    language,
    people_agreed: input.people_agreed === true,
    at: at === null ? null : Math.round(at * 100) / 100,
  };
  const key = postLookKeyOf(plan);
  if (input.looked !== key) {
    if (input.looked)
      return refuse(
        `looked ${input.looked} is not this plan's key: the plan changed since you looked. Call again without looked, and look at the post as it is drawn now.`,
      );
    return postShownFirst(toolContext, plan, file.name, key, config);
  }
  const says = postWordsIn(language);
  return propose({
    kind: "post",
    title: says.cardTitle(words.line),
    summary: says.summary(fileSaidOf(file.name)),
    payload: plan,
  });
}

export const postAct = defineAct({
  name: "propose_post",
  description:
    "Make a post from one of the business's photos, or from one moment of one of its videos (at): a picture with their words on it, for Instagram, Facebook or anywhere, in portrait, square and story. Code draws it, so it is free and the card shows the real picture; the owner presses Save, and it lands in Files. Open the photo or the video with files action view first, unless it came with the question, and choose where the words go after seeing it; a video's view names its best moments, which are where to choose at from. The first call draws the post and shows it to you: look at it with the owner's eyes, change the plan if a word sits on a face or the sign, and call again with looked set to its look_key; only then is the card made, and that call ends the turn, so answer the rest of what they asked beside it, in the same message, since nothing written beside the look reaches them. Asked only for a post, propose one at once, with a short plain headline from the photo and what you know of the business, rather than asking what it should say: the owner changes the words, the type and the layout on the card itself, for nothing, so propose once and offer no alternatives. A price, a number or a promise they have not said is refused: leave those out, or use theirs. One photo, or one moment, a post. Only an owner or a partner can approve it: for anyone else, say so and that one of them can ask.",
  kind: "post",
  input: postInput,
  label: "Making a post",
  build: postOutcome,
});
