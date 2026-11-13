/**
 * A reader's look at a message's words before they are sent to WhatsApp (Ruben, 12 Nov 2026: only words WhatsApp takes
 * are submitted, so nothing comes back refused). What a rule of shape can see is refused before this (contracts
 * validateTemplateDraft: a value at the start or end, too many values, a shortened link; campaigns whatsapp-refusals.ts: a
 * duplicate, a second change in a day). This is what only a reader sees, by WhatsApp's own published reasons (Meta's
 * template review page, read 12 Nov 2026) and no others: a request for a card, bank or ID number, a threat, a scam's
 * shape, goods it does not allow, words in another language than they are filed under, an offer filed as a notice.
 *
 * One turn of the model the drafts are written with, counted against the workspace like any other (askOnce). WhatsApp's
 * review is the judge either way, so a look that could not be made, or came back unreadable, holds nothing up: it is
 * logged, and the words are sent.
 */
import "server-only";
import { z } from "zod";
import { AppError, languageLabel } from "@chanlytics/contracts";
import { askOnce, extractJson } from "@/server/drafts/template/draft";
import { log } from "@/server/shared/log";
import type { ReviewWords, WordsForReview } from "@/server/campaigns/whatsapp-refusals";

/** What the reader is told: WhatsApp's reasons, that nothing else is its to judge, and the one shape of its answer. Pure. */
function reviewSystemPrompt(words: Pick<WordsForReview, "category" | "language">): string {
  const utility = words.category === "utility";
  return [
    "You check one message a small business is about to send to WhatsApp for approval as a message template. WhatsApp reviews every template and refuses some. Say whether it would refuse this one, by its own published reasons and no others:",
    "- It asks the customer for a sensitive identifier: a full payment card number, a bank account number, a national ID or passport number, or a copy of a document that holds one. The last four digits of one are allowed.",
    "- It threatens or shames: legal action, exposing a debt, abuse or harassment.",
    "- It has the shape of a scam or of spam: a prize the person did not enter for, a request for money, a password or a code, a claim it plainly cannot keep, urgency made to deceive.",
    "- It sells or promotes what WhatsApp does not allow businesses to sell: illegal or prescription drugs, tobacco or vapes, weapons, adult services, real-money gambling, counterfeit goods.",
    `- Its words are not in the language it is filed under, ${languageLabel(words.language)}.`,
    utility
      ? "- It is filed as a utility message, which is only about the customer's own booking, order, account or request, yet it promotes, offers or upsells something."
      : "",
    "Judge only these. An ordinary reminder, thank-you, offer, discount, invitation, review request or piece of news from a business passes. Never judge its style, tone, length, spelling or how persuasive it is, and never refuse for a reason not listed. A value in double braces ({{1}}) is filled in for each person: judge the words around it. When in doubt, it passes.",
    "Answer with one JSON object and nothing else, no code fence. Where it passes:",
    '{"ok": true}',
    "Where WhatsApp would refuse it:",
    '{"ok": false, "reason": "one short plain sentence to the owner saying what WhatsApp would refuse, with no policy names", "fix": "one short sentence saying what to change"}',
  ]
    .filter(Boolean)
    .join("\n");
}

const Verdict = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string().trim().min(1).max(300), fix: z.string().trim().max(300) }),
]);

/** The reader's answer as it is taken: passes, would be refused (why, and what to change), or null where it is unreadable. */
function reviewVerdict(raw: unknown): z.infer<typeof Verdict> | null {
  const read = Verdict.safeParse(raw);
  return read.success ? read.data : null;
}

/** What a refusal is told: what WhatsApp would refuse, and what to change, before anything was sent. */
const reviewRefusal = (reason: string, fix: string): string =>
  `WhatsApp would refuse this: ${reason.replace(/[.\s]+$/, "")}.${fix ? ` ${fix}` : ""}`;

/** The look, as the routes hand it in (ReviewWords). `ask` is the model's one turn: a test hands in its own. */
export async function reviewWords(
  ctx: Parameters<ReviewWords>[0],
  tenantId: Parameters<ReviewWords>[1],
  words: WordsForReview,
  ask: typeof askOnce = askOnce,
): Promise<void> {
  const user = [`Words:\n${words.body}`, words.footer ? `Footer: ${words.footer}` : null].filter(Boolean).join("\n\n");
  let verdict: ReturnType<typeof reviewVerdict> = null;
  try {
    const turn = await ask(ctx, tenantId, reviewSystemPrompt(words), user, "draft");
    verdict = turn.ok ? reviewVerdict(extractJson(turn.text)) : null;
    if (!verdict) log.warn("whatsapp_look_unread", { tenant_id: tenantId, why: turn.ok ? "malformed" : turn.reason });
  } catch (e) {
    // The look is a help, never a gate of its own: WhatsApp reviews the words either way.
    log.warn("whatsapp_look_unread", { tenant_id: tenantId, why: e instanceof Error ? e.message : String(e) });
  }
  if (verdict && !verdict.ok) throw new AppError("validation", reviewRefusal(verdict.reason, verdict.fix));
}
