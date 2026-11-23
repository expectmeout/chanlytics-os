/**
 * A public answer to a comment on a post, the pure half (the content loop PRD's 9.2 and 12.4): the prompt that drafts it
 * in the business's name, knowing the post the person commented on, with the comment fenced as a stranger's words; and
 * the rule a draft is held to before the owner sees it. A draft that names a price the owner never gave, or offers money
 * they never offered, is no draft: it is a comment AI can't answer safely, said in a sentence the owner reads. AI's own
 * "can't" is kept the same way. The owner sends: nothing here posts.
 */
import { DATA_NOT_INSTRUCTIONS, fenced, promptSafeName } from "../../ai/fence";
import { namesMoney, priceBreach, priceFigures } from "../../config/policy/prices";
import { cleanDraft } from "../../google/review-reply";

/** What AI answers, alone, for a comment it can't answer safely; what follows it is the reason. */
export const COMMENT_DRAFT_CANNOT = "CANNOT:";

/** At most this many words: an answer under a comment, read in a scroll. */
const COMMENT_ANSWER_MAX_WORDS = 50;

/** Instagram's own bound on a comment. */
const COMMENT_ANSWER_MAX_CHARS = 2200;

/** What AI knows of the business when it answers under its post. */
export interface CommentAnswerFacts {
  name: string;
  tone: string | null;
  languages: readonly string[];
  services: readonly string[];
  /** What the owner has said is theirs to say (contracts ownersSayings): the only prices and offers an answer names. */
  says: readonly string[];
}

/** The comment, and the post it is under. */
export interface CommentToAnswer {
  words: string | null;
  username: string | null;
  postKind: string;
  caption: string | null;
}

const POST_KIND_WORDS: Readonly<Record<string, string>> = { reel: "reel", story: "story", picture: "post" };

/** The prompt: the business and its rules as the system, the post and the comment as the message. */
export function commentAnswerPrompt(
  facts: CommentAnswerFacts,
  comment: CommentToAnswer,
): { system: string; user: string } {
  const lang = facts.languages[0] ?? "English";
  const system = [
    "You write the public answer a business posts under a comment on its own Instagram post, in the business's name.",
    `Business: ${facts.name}.`,
    facts.tone ? `Tone, in the owner's words: ${facts.tone}` : null,
    facts.services.length ? `Services: ${facts.services.slice(0, 12).join(", ")}.` : null,
    facts.says.length
      ? `What the owner has said, the only facts you may state:\n${facts.says.slice(0, 40).join("\n")}`
      : null,
    "",
    "Rules:",
    `- Answer in the language the comment is written in; when it has no words, in ${lang}.`,
    `- One or two sentences, at most ${COMMENT_ANSWER_MAX_WORDS} words, about what they wrote and the post they wrote it under.`,
    "- Name a price, an offer or an opening time only as the owner has said it above. Never work one out.",
    "- Where they want to book or ask something private, invite them to send a message.",
    "- Never promise what the owner has not said, never argue, never answer a complaint in public.",
    "- No hashtags, no sign-off, no quotation marks around the answer.",
    `- When you cannot answer safely (a complaint, a price the owner has not given, anything private), answer exactly ${COMMENT_DRAFT_CANNOT} and a few words why.`,
    `- ${DATA_NOT_INSTRUCTIONS}`,
    "",
    "Answer with the answer's words only.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const kind = POST_KIND_WORDS[comment.postKind] ?? "post";
  const user = [
    `The ${kind} it is under:`,
    comment.caption ? fenced("post", comment.caption) : "A post with no caption.",
    `From: ${promptSafeName(comment.username) ?? "someone on Instagram"}`,
    comment.words ? `Their comment:\n${fenced("comment", comment.words)}` : "Their comment has no words.",
  ].join("\n");
  return { system, user };
}

const sentenceOf = (words: string): string => {
  const trimmed = words.trim().replace(/[.!]*$/, "");
  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.` : "";
};

/** AI's answer held to the owner's word: a draft to send, or why AI can't answer this one safely. */
export function commentDraftOf(raw: string, says: readonly string[]): { words: string } | { cannotWhy: string } {
  const text = cleanDraft(raw);
  if (text.toUpperCase().startsWith(COMMENT_DRAFT_CANNOT))
    return { cannotWhy: sentenceOf(text.slice(COMMENT_DRAFT_CANNOT.length)).slice(0, 300) || CANNOT_PLAIN };
  if (!text) return { cannotWhy: CANNOT_PLAIN };
  const owner = says.join("\n");
  if (priceBreach(text, new Set(priceFigures(owner))))
    return { cannotWhy: "It asks about a price you haven't given AI." };
  if (namesMoney(text) && !namesMoney(owner)) return { cannotWhy: "An answer would offer money you haven't offered." };
  return { words: text.slice(0, COMMENT_ANSWER_MAX_CHARS) };
}

/** The reason said when AI gave none. */
const CANNOT_PLAIN = "AI can't answer this one safely.";
