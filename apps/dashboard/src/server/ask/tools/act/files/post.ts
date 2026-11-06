import "server-only";
import { z } from "zod";
import {
  POST_LAYOUTS,
  POST_LIMITS,
  POST_NO_PHONE,
  POST_VOICES,
  fileSaidOf,
  isAskMorningQuestion,
  postPhotoProblem,
  postPlanProblem,
  postWordsIn,
  whoStandsOf,
} from "@chanlytics/contracts";
import { load } from "../../../../readers";
import * as readers from "../../../../readers/facts";
import { filesForAsk } from "../../../../readers/files";
import { postPhoneOf } from "../../../../files/post/phone";
import { defineAct, propose, refuse, type ProposalOutcome, type ToolContext } from "../../context";
import { filesNamed } from "../../read/files";

/**
 * A post from one of the business's photos (decision 0099, step 3). Code draws it, so it is free, and the card shows the real
 * picture: Ask chooses the photo after opening it, chooses the words from what the owner said, and the owner presses Save. The act
 * never acts. The words are held here, where it is known who said what: their questions in this thread and what they wrote in
 * Settings, never what a customer wrote, a page shows or a read returned. A price, a number or a promise that came from anywhere
 * else is refused back to the model, which uses their words or asks them.
 */

/** What the owner has said, as a post's words are held to it: this thread's questions and their Settings. A morning's turn asks itself. */
function ownersWords(t: ToolContext, config: unknown): string {
  const asked = isAskMorningQuestion(t.question) ? [] : [t.question ?? ""];
  return [...asked, ...(t.askedEarlier ?? []), config ? JSON.stringify(config) : ""].join("\n");
}

const postInput = z.object({
  file: z
    .string()
    .min(1)
    .max(120)
    .describe(
      "The photo's name, as files says it. Open it with view first, unless it came with the question, open already.",
    ),
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
  book: z.boolean().describe("Whether to add the band with the business's phone number, which code writes."),
  words_at: z
    .enum(["top", "bottom"])
    .describe("Where the words stand: chosen after seeing the photo, on the calmer end, off what it is a photo of."),
  voice: z
    .enum(POST_VOICES)
    .describe("classic is a serif, for beauty, food and hospitality; modern is a plain sans, for trades and services."),
  layout: z
    .enum(POST_LAYOUTS)
    .optional()
    .describe(
      "How the words stand with the photo: over it (the usual), left over it, on a band of their colour, or under it in a frame. Band or frame where the photo is busy and must stay clear.",
    ),
  people_agreed: z
    .boolean()
    .optional()
    .describe("Only when the owner said in this thread that the people in the photo agreed to be shown."),
});

async function postOutcome(t: ToolContext, input: z.infer<typeof postInput>): Promise<ProposalOutcome> {
  const [{ files }, config] = await Promise.all([
    load(t.rc, filesForAsk, undefined).then((r) => r.data),
    load(t.rc, readers.config, undefined).then((r) => r.data?.config ?? null),
  ]);
  const { found } = filesNamed(files, [input.file]);
  const file = found.at(0);
  if (!file) return refuse(`no file named ${input.file}; names come from files with action list`);
  const photoProblem = postPhotoProblem(file);
  if (photoProblem) return refuse(`${input.file}: ${photoProblem}`);
  if (whoStandsOf(file).is === "ask" && !input.people_agreed)
    return refuse(
      `${input.file} shows someone recognizable, and no one has said they agreed to be shown. Ask the owner in a sentence; if they say yes, call again with people_agreed true, or use another photo.`,
    );
  const words = { line: input.line.trim(), over: input.over?.trim() || null, under: input.under?.trim() || null };
  const wordsProblem = postPlanProblem(words, ownersWords(t, config));
  if (wordsProblem) return refuse(wordsProblem);
  if (input.book && !(await postPhoneOf(t.ctx, t.tenantId, config))) return refuse(POST_NO_PHONE);
  const says = postWordsIn(t.language === "es" ? "es" : "en");
  return propose({
    kind: "post",
    title: says.cardTitle(words.line),
    summary: says.summary(fileSaidOf(file.name)),
    payload: {
      file_id: file.id,
      ...words,
      book: input.book,
      words_at: input.words_at,
      voice: input.voice,
      layout: input.layout ?? "over",
      language: t.language === "es" ? "es" : "en",
      people_agreed: input.people_agreed === true,
    },
  });
}

export const postAct = defineAct({
  name: "propose_post",
  description:
    "Make a post from one of the business's photos: a picture with their words on it, for Instagram, Facebook or anywhere, in portrait, square and story. Code draws it, so it is free and the card shows the real picture; the owner presses Save, and it lands in Files. Open the photo with files action view first, unless it came with the question, and choose where the words go after seeing it. Asked only for a post, propose one at once: a short plain headline from the photo and what you know of the business, rather than asking what it should say, since the owner can change the words, the type and the layout on the card itself, for nothing. So propose once and don't offer alternatives. A price, a number or a promise they have not said is refused, so leave those out, or use theirs. One photo a post. Only an owner or a partner can approve it: for anyone else, say so and that one of them can ask.",
  kind: "post",
  input: postInput,
  label: "Making a post",
  build: postOutcome,
});
