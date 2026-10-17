import { fencedInline, promptSafeName } from "../ai/fence.js";
import { clipAtWord } from "../conversations/message-words.js";
export const DRAFT_WHYS = ["no_receptionist", "off", "budget", "may_not_spend", "not_drafted"];
export const isDraftWhy = (v) => DRAFT_WHYS.includes(v);
export const DRAFT_NEEDS_MS = 25e3;
export const DRAFT_NOTICE_MAX = 240;
const SILENT_MODE = "never";
export function draftRefusal(f) {
  if (!f.receptionist) return "no_receptionist";
  if (f.mode === SILENT_MODE) return "off";
  if (f.budgetSpent) return "budget";
  if (!f.maySpend) return "may_not_spend";
  return null;
}
const flatClip = (v, max) => clipAtWord((v ?? "").replace(/\s+/g, " "), max);
export function leadReplyNote(p) {
  const name = promptSafeName(p.business);
  const business = name ? fencedInline("profile_name", name) : "a business";
  const answered = flatClip(p.answered, 600);
  const signedBy = flatClip(p.signedBy, 60);
  return [
    `${business}, a business that wrote back by email to a reach-out this business sent them. You are drafting the email`,
    `answer for the owner to read, change and send: it is not sent until they do.`,
    answered ? `The reach-out they answered said: "${answered}"` : null,
    `Write an email: plain paragraphs, no emoji, no subject line, no markdown.`,
    signedBy ? `End it signed "${signedBy}".` : `End it signed with the business's name.`,
    p.kind === "thanks" ? `They said not now. Write one short line thanking them, and nothing else: no offer, no question, no follow-up.` : `Answer what they asked or said from the business's own facts. When a fact is not there, say the owner will follow up.`
  ].filter((l) => l !== null).join("\n");
}
export function draftExcerpt(draft) {
  return flatClip(draft, DRAFT_NOTICE_MAX);
}
