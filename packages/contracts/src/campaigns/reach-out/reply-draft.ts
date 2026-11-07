/**
 * The receptionist's draft of an answer to a reach-out's reply (Reach out Part 5, PR 5; decision 0017, the plan's G13
 * and G14): which gates stop it, what it is told about whom it is answering, and how long a job must have left to try.
 * The draft is text kept on the reading (reach_out_replies.draft), never a message row: nothing sends it but a person.
 */
import { fencedInline, promptSafeName } from "../../ai/fence";
import { clipAtWord } from "../../conversations/message-words";
import { isOneOf } from "../../shared/unknown";

/**
 * Why a reading has no draft (reach_out_replies.draft_why, at most 60 characters):
 *  - no_receptionist: no brain configured, a config that does not parse, or a control plane that could not be read;
 *  - off: the workspace's reply policy is never, so its receptionist says nothing, drafts included;
 *  - budget: the day's model tokens are spent (tokenBudgetSpent, the receptionist's own rule);
 *  - may_not_spend: the workspace may not spend (billing, Part 4's one reading);
 *  - not_drafted: the receptionist handed it to a person, refused, or failed. Never the holding words in its place.
 */
export const DRAFT_WHYS = ["no_receptionist", "off", "budget", "may_not_spend", "not_drafted"] as const;
export type DraftWhy = (typeof DRAFT_WHYS)[number];
export const isDraftWhy = (value: unknown): value is DraftWhy => isOneOf(DRAFT_WHYS, value);

/**
 * The time a reading's job must have left before its deadline to draft now: the brain's one attempt (20 s,
 * receptionist brain.ts) and the writes after it. With less, the draft waits for a job of its own, and the owner is
 * told without it.
 */
export const DRAFT_NEEDS_MS = 25_000;

/** How much of a draft the notice quotes. */
export const DRAFT_NOTICE_MAX = 240;

/** The policy mode under which the receptionist says nothing (contracts POLICY_MODES). */
const SILENT_MODE = "never";

/**
 * Whether the receptionist may draft, asked in G14's order: a receptionist that can speak, a workspace that lets it,
 * the day's tokens, then the spend. Null when it may. The gates about a message leaving (the pilot allowlist, a short
 * code, the reply window, consent, a thread held for a person, the reply cap) are not asked: a draft does not leave,
 * and the owner's Send asks the door, which asks them.
 */
export function draftRefusal(fields: {
  receptionist: boolean;
  mode: string;
  budgetSpent: boolean;
  maySpend: boolean;
}): DraftWhy | null {
  if (!fields.receptionist) return "no_receptionist";
  if (fields.mode === SILENT_MODE) return "off";
  if (fields.budgetSpent) return "budget";
  if (!fields.maySpend) return "may_not_spend";
  return null;
}

/** The reach-out's words or its signature on one line, clipped: an email is never a paragraph of the note. */
const flatClip = (v: string | null | undefined, max: number): string => clipAtWord((v ?? "").replace(/\s+/g, " "), max);

/**
 * Who the receptionist is answering, as the brain's separate lead block (generateReply's leadNote): an email to a
 * business that wrote back to the owner's reach-out, what the reach-out said, the shape an email takes, and whom it is
 * signed by. For not now, one line of thanks and nothing else. Their own reply is the message it answers, not this.
 *
 * The business's name is theirs, not the owner's: the lead's listing, as the finder read it from Places. The note is a
 * system block (the brain's whoNote), so the name is one as a prompt may show one and fenced as the name they call
 * themselves (contracts ai/fence.ts), and a listing that names itself an instruction says nothing to the model.
 */
export function leadReplyNote(params: {
  business: string;
  /** The reach-out email they answered, its first words. */
  answered: string | null;
  kind: "answer" | "thanks";
}): string {
  const name = promptSafeName(params.business);
  const business = name ? fencedInline("profile_name", name) : "a business";
  const answered = flatClip(params.answered, 600);
  return [
    `${business}, a business that wrote back by email to a reach-out this business sent them. You are drafting the email`,
    `answer for the owner to read, change and send: it is not sent until they do.`,
    answered ? `The reach-out they answered said: "${answered}"` : null,
    params.kind === "thanks"
      ? `They said not now. Write one short line thanking them, and nothing else: no offer, no question, no follow-up.`
      : `Answer what they asked or said from the business's own facts.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** A draft's first lines, as the notice quotes them. */
export function draftExcerpt(draft: string): string {
  return flatClip(draft, DRAFT_NOTICE_MAX);
}

/**
 * What the answer to a lead who wrote back is steered to offer (decision 0113, How it reaches out's When a lead writes
 * back): nothing for the booking link, which is what an answer offered before the page and what the receptionist offers
 * where it has one; a short call, signed as the sequence signs; or the answer alone. Told to the receptionist as a
 * member's change is (drafts/writer.ts), never in the receptionist's own prompt.
 */
export function replyOfferSteer(offer: string | null | undefined): string | null {
  if (offer === "call") return "Offer a short call in the next few days, at a time that suits them, and no link.";
  if (offer === "answer") return "Answer what they asked and offer nothing more: no link and no call.";
  return null;
}
