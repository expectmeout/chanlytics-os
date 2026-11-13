/**
 * What WhatsApp refuses, said at the doors: the words for a number with no account or token on file and for a message it
 * holds no copy of, and what is asked of a message's words before they are sent to it, beyond their shape (contracts
 * validateTemplateDraft): Ruben, 12 Nov 2026, only words WhatsApp takes are submitted, so nothing comes back refused.
 * Three things its review refuses that only the workspace's own record, or a reader, can see:
 *
 *  - the same words as a message WhatsApp already has from this business (Meta's template review page: a duplicate, the
 *    same wording in the body and footer, is refused);
 *  - a second change in a day to approved words (Meta's template management page: once in 24 hours, ten in 30 days);
 *  - what a reader judges, a request for a card number, a threat, a scam's shape (`ReviewWords`: the model's read, handed
 *    in by the route so this tree never imports the one that writes with a model, which already reads this one).
 *
 * Each is refused in the person's words, and nothing is sent.
 */
import { AppError, DAY_MS, DbFailure, HOUR_MS, footerOf, templateTitle } from "@chanlytics/contracts";
import { listWhatsAppTwins } from "@chanlytics/db/campaigns";
import { listWordsKept } from "@chanlytics/db/events";
import type { RouteContext } from "@/server/shared/with-route";
import type { TenantId } from "@chanlytics/contracts";

/** What a template's door says when the number it would use has no account or token on file. */
export const WHATSAPP_ACCOUNT_MISSING =
  "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.";
export const WHATSAPP_NO_TOKEN = "Chanlytics has no access token for this number yet.";
/** A change of words to a message WhatsApp holds no copy of (never sent there: no id of Meta's), which only New writes. */
export const WHATSAPP_NO_COPY = "WhatsApp has no copy of this message to change. Write it again from New.";

/** The words WhatsApp is asked to review, as its reader judges them: what they say, and what they are filed as. */
export interface WordsForReview {
  body: string;
  footer: string | null;
  category: string;
  language: string;
}

/**
 * A reader's look at words before they go to WhatsApp (drafts/template/review.ts reviewWords): it throws what WhatsApp
 * would refuse, in the person's words, and returns where they pass or where it could not look (WhatsApp's review is the
 * judge either way, so a look that failed holds nothing up).
 */
export type ReviewWords = (ctx: RouteContext, tenantId: TenantId, words: WordsForReview) => Promise<void>;

/**
 * Refused where WhatsApp already holds a message of this business with the same words, body and footer: its review
 * refuses the second as a duplicate. `id` is the row being changed, which is no twin of itself.
 */
export async function refuseTwinWords(
  ctx: RouteContext,
  tenantId: TenantId,
  words: { id: string | null; body: string; footer: string | null },
): Promise<void> {
  const { data, error } = await listWhatsAppTwins(ctx.supabase, tenantId, words.body);
  if (error) throw new DbFailure(error, "messages with the same words");
  const twin = data.find(
    (row) => row.id !== words.id && row.meta_id !== null && (footerOf(row.components) ?? "") === (words.footer ?? ""),
  );
  if (!twin) return;
  throw new AppError(
    "conflict",
    `WhatsApp refuses a message with the same words as one it already has from you (“${templateTitle(twin.name, twin.title)}”). Change the words, or use that one.`,
    409,
  );
}

/**
 * Refused where approved words were changed less than a day ago: WhatsApp takes one change a day to an approved message,
 * and says no to the second in words nobody can act on. The ledger knows when (the latest change that kept the approved
 * words it replaced, db listWordsKept). A refused or paused message is changed as often as asked.
 */
export async function refuseSecondChange(
  ctx: RouteContext,
  tenantId: TenantId,
  held: { id: string; meta_status: string },
  nowMs: number,
): Promise<void> {
  if (held.meta_status !== "approved") return;
  const changedAt = (await listWordsKept(ctx.supabase, tenantId, [held.id])).get(held.id)?.changedAt ?? null;
  const freeAt = changedAt ? Date.parse(changedAt) + DAY_MS : Number.NaN;
  if (!Number.isFinite(freeAt) || nowMs >= freeAt) return;
  const hours = Math.max(1, Math.ceil((freeAt - nowMs) / HOUR_MS));
  throw new AppError(
    "conflict",
    `WhatsApp takes one change a day to an approved message, and this one changed less than a day ago. Change it again in about ${hours} hour${hours === 1 ? "" : "s"}.`,
    409,
  );
}
