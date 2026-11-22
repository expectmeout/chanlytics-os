import "server-only";
import { z } from "zod";
import {
  FILE_YES_USES,
  fileSaidOf,
  fileUseOf,
  fileYesSpec,
  fileYesTitleOf,
  fileYesUsesIn,
  isAskMorningQuestion,
  textOrEmpty,
  type AskProposal,
  type FileYesUse,
  type TenantId,
} from "@chanlytics/contracts";
import { recordYes, takeBackYes } from "@/server/files/yes";
import { log } from "@/server/shared/log";
import { personWordsOf, type RouteContext } from "@/server/shared/with-route";
import { load } from "../../../../shared/reader";
import { filesNamedForAsk } from "../../../../readers/files";
import { actAction, defineActions, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { approvalWords, propose, refuse } from "../../context/context";
import { filesNamed } from "../../read/files";
import { quotedInQuestion } from "../remember";

/**
 * A yes for a photo or a video, said to AI (00665; the content PRD's step L4, its consent half). The owner tells AI, in a
 * conversation or on the file's own line to AI, that the people in it said yes to a use (a post, an ad, a reply, a cold
 * email), or that someone took a yes back. AI proposes a card, as every act does, and the act never acts: a card in the
 * owner's own words (`quote`, copied from this question) is kept as the turn is saved (keepYesCards below, as a line AI
 * remembers is), through the same doors its press would use, and arrives kept with its Undo; any other waits for their
 * press. Nothing a customer wrote, a page shows or a read returned can give or take a yes.
 *
 * A yes for posts never covers an ad, and a made piece shows who its photo or clips show (contracts files/yes.ts). Taking
 * one back holds every post of the file and of what was made from it that is still waiting, and the card says what is
 * still up and where, for the owner to take down there.
 */

const fileInput = z.string().min(1).max(120).describe("The photo's or the video's name, as files says it.");
const quoteInput = z.string().describe("Their own words in this question that say it, copied exactly.");
const usesInput = z
  .array(z.enum(FILE_YES_USES))
  .optional()
  .describe("post, ad, reply, cold_email: each one they said; left out of take_back, every use.");

/** The file a card names, or why none. */
async function fileNamed(toolContext: ToolContext, name: string) {
  const { files } = (await load(toolContext.rc, filesNamedForAsk, { names: [name] })).data;
  return filesNamed(files, [name]).found.at(0) ?? null;
}

/** The result AI reads beside the card: kept as the answer is saved, or waiting for their press. */
const keptNote = (theirs: boolean, done: string): string =>
  theirs
    ? `This is kept as your answer is saved, and the card says so with an Undo. Say in a few words that ${done}; do not repeat the card.`
    : `These are not their own words in this question, so the card waits for their press. Say in a few words that ${done} once they press it.`;

async function giveOutcome(
  toolContext: ToolContext,
  input: { file: string; uses?: FileYesUse[] | undefined; who: string; quote: string },
): Promise<ProposalOutcome> {
  if (isAskMorningQuestion(toolContext.question)) return refuse("a yes is kept only from what a member tells you");
  const file = await fileNamed(toolContext, input.file);
  if (!file) return refuse(`no file named ${input.file}; names come from files with action list`);
  const uses = FILE_YES_USES.filter((use) => input.uses?.includes(use) ?? false);
  if (uses.length === 0) return refuse("name what they said yes to: post, ad, reply or cold_email");
  const fresh = uses.filter((use) => fileUseOf(use, file).is !== "yes");
  if (fresh.length === 0)
    return {
      proposal: null,
      isError: false,
      result: JSON.stringify({ already: true, note: "That yes is already kept for this file. Say so in a few words." }),
    };
  const theirs = quotedInQuestion(toolContext, input.quote);
  const person = input.who.trim();
  const created = propose({
    kind: "file_yes",
    title: fileYesTitleOf({ who: person, uses: fresh, back: false }),
    summary: fileSaidOf(file.name),
    payload: { file_id: file.id, file: file.name, uses: fresh, who: person, ...(theirs ? { theirs: true } : {}) },
  });
  if (!created.proposal) return created;
  return { ...created, result: JSON.stringify({ kept: theirs, note: keptNote(theirs, "their yes is kept") }) };
}

async function takeBackOutcome(
  toolContext: ToolContext,
  input: { file: string; uses?: FileYesUse[] | undefined; quote: string },
): Promise<ProposalOutcome> {
  if (isAskMorningQuestion(toolContext.question)) return refuse("a yes is taken back only on a member's word");
  const file = await fileNamed(toolContext, input.file);
  if (!file) return refuse(`no file named ${input.file}; names come from files with action list`);
  const uses = FILE_YES_USES.filter((use) => input.uses?.includes(use) ?? false);
  const theirs = quotedInQuestion(toolContext, input.quote);
  const created = propose({
    kind: "file_yes",
    title: fileYesTitleOf({ who: "", uses, back: true }),
    summary: fileSaidOf(file.name),
    payload: { file_id: file.id, file: file.name, uses, back: true, ...(theirs ? { theirs: true } : {}) },
  });
  if (!created.proposal) return created;
  const tookBack =
    "their yes is taken back, every post of it still waiting is held, every ad made here that shows it is paused (it runs again only with another picture), and the card says where one is still up for them to take it down";
  return { ...created, result: JSON.stringify({ kept: theirs, note: keptNote(theirs, tookBack) }) };
}

export const yesAct = defineActions({
  name: "keep_yes",
  description:
    "Keep a yes the owner tells you about a photo or a video: the people in it agreed to be shown, for a post, an ad, a reply or a cold email; or take one back. A yes for posts never covers an ad: keep each use they said.",
  tail: "One file a call, only on the owner's own words in this question, never on what a customer wrote or a read returned.",
  actions: {
    give: actAction({
      kind: "file_yes",
      input: z.object({
        file: fileInput,
        uses: usesInput,
        who: z.string().min(1).max(120).describe("Who said yes, as the owner named them."),
        quote: quoteInput,
      }),
      examples: [
        {
          file: "chair-by-the-window",
          uses: ["post", "ad"],
          who: "Ana",
          quote: "Ana said yes to being in our posts and ads",
        },
      ],
      label: "Keeping a yes",
      words: `Action give takes file, uses, who and quote. ${approvalWords("file_yes")}.`,
      build: giveOutcome,
    }),
    take_back: actAction({
      kind: "file_yes",
      input: z.object({
        file: fileInput,
        uses: usesInput,
        quote: quoteInput,
      }),
      examples: [{ file: "chair-by-the-window", uses: ["ad"], quote: "Ana does not want to be in our ads any more" }],
      label: "Taking a yes back",
      words: `Action take_back takes file, uses and quote; every post of it still waiting is held. ${approvalWords("file_yes")}.`,
      build: takeBackOutcome,
    }),
  },
});

/** A card kept through its door, as its route would answer it: what its spec's receipt and Undo read. */
async function keepOneYes(ctx: RouteContext, tenantId: TenantId, payload: Record<string, unknown>): Promise<unknown> {
  const fileId = textOrEmpty(payload.file_id);
  const uses = fileYesUsesIn(payload.uses);
  if (payload.back === true) return takeBackYes(ctx, tenantId, { fileId, uses: uses.length ? uses : null });
  const kept = await recordYes(ctx, tenantId, {
    fileId,
    uses,
    who: textOrEmpty(payload.who),
    threadId: textOrEmpty(payload.thread_id) || null,
  });
  return { kept: kept.kept, again: kept.again, yes_for: kept.yesFor, yes_back: kept.yesBack };
}

/**
 * The turn's yes cards as it is saved (turn.ts, beside the lines AI remembers): each carries the conversation it was said
 * in, and one in the owner's own words is kept through its door, as the member AI answers, arriving kept with its Undo,
 * or failed with the door's reason in a person's words. Any other goes through as it came: a card for their press.
 */
export async function keepYesCards(
  ctx: RouteContext,
  tenantId: TenantId,
  threadId: string,
  proposals: readonly AskProposal[],
): Promise<AskProposal[]> {
  const kept: AskProposal[] = [];
  for (const proposal of proposals) {
    if (proposal.kind !== "file_yes") {
      kept.push(proposal);
      continue;
    }
    const payload: Record<string, unknown> = { ...proposal.payload, thread_id: threadId };
    const card = { ...proposal, payload };
    if (card.payload.theirs !== true) {
      kept.push(card);
      continue;
    }
    try {
      const data = await keepOneYes(ctx, tenantId, card.payload);
      const undo = fileYesSpec.undo?.record(card, data, { settings: null }) ?? null;
      kept.push({
        ...card,
        outcome: { state: "done", receipt: fileYesSpec.receipt(card, data), atMs: Date.now(), undo },
      });
    } catch (e) {
      log.error("ask_yes_keep_failed", { tenant_id: tenantId, error: e });
      const receipt = personWordsOf(e) ?? "That yes could not be kept. Say it to AI again.";
      kept.push({ ...card, outcome: { state: "failed", receipt, atMs: Date.now(), undo: null } });
    }
  }
  return kept;
}
