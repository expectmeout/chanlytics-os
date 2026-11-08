/**
 * The first email to a lead: the facts it is drafted from, and the draft. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it. The lead is a row the member's RLS showed them, its facts are read again on the member's own session,
 * and the model call is billed to the lead's own workspace.
 */
import {
  AppError,
  LEAD_ASKED_NOT_WRITTEN,
  LEAD_DRAFT_JSON_SCHEMA,
  LEAD_NO_ADDRESS,
  LEAD_OWN_EMAIL_WORDS,
  LeadDraftAnswerSchema,
  leadDraftFooter,
  mailtoOf,
  siteHost,
} from "@chanlytics/contracts";
import { getAddressesSuppressed } from "@chanlytics/db/campaigns";
import { getWorkspaceOffer } from "./allowance";
import { getLeadEmailOffer, type LeadEmailOffer } from "./send";
import type { LeadRow } from "./searches";
import { askForJson } from "../shared/model-json";
import { serviceDb } from "../shared/service-db";
import type { RouteContext } from "../shared/with-route";
import { SHORTER_ASK, WARMER_ASK } from "@/server/shared/model/tones";
import { findLeadDraftFacts } from "@chanlytics/db/leads";

/* -------------------------------------------------------------- the draft */

/**
 * What Claude is told before it writes one cold email to one business.
 *
 * The rules are the law's and the product's, in that order: a truthful subject
 * from a real sender, one clear ask, and nothing claimed about the business
 * that the facts below do not say. The postal address and the way to say no
 * are NOT Claude's to write -- code adds them (`leadDraftFooter`), so a model
 * that forgets them cannot produce an email without them.
 */
const DRAFT_SYSTEM = [
  "You write one short email from a small business to another small business it would like to work with.",
  "The rules, all of them:",
  "- Say who is writing and why in the first two lines. Never pretend to be a customer.",
  "- Use only the facts you are given. Never invent a person's name, a price, a number, or anything about their business.",
  "- One ask, and a small one: a reply, a short call, or a visit. Never a contract.",
  "- Plain words. No slogans, no flattery, no bold claims, no emoji.",
  "- Under 120 words, in short paragraphs, with no bullet list.",
  "- The subject says what the email is about in under nine words. Never a question about their money, never capitals.",
  "- Write no sign-off address and no unsubscribe line: those are added after you, by code.",
].join("\n");

/** What this lead is, in the words the card saw: never a guess, and never the name of whoever fetched it. */
async function draftFacts(ctx: Pick<RouteContext, "supabase">, lead: LeadRow): Promise<string[]> {
  const { data, error } = await findLeadDraftFacts(ctx.supabase, lead.id);
  if (error) throw new Error(error.message);
  const item = (data ?? null) as {
    business_name?: string;
    category?: string | null;
    city?: string | null;
    region?: string | null;
    website_host?: string | null;
    rating?: number | null;
    reviews?: number | null;
  } | null;
  const out = [item?.business_name ?? lead.business_name];
  if (item?.category) out.push(item.category);
  const where = [item?.city, item?.region].filter(Boolean).join(", ");
  if (where) out.push(where);
  const host = siteHost(item?.website_host ?? null);
  if (host) out.push(host);
  if (typeof item?.rating === "number") out.push(`${item.rating.toFixed(1)} from ${item.reviews ?? 0} reviews`);
  return out;
}

interface DraftAnswer extends LeadEmailOffer {
  to: string;
  subject: string;
  /** The email as the mail app sends it: the words and the foot. */
  body: string;
  mailto: string;
  /** The words alone: what is edited, and what Send takes. */
  words: string;
  /** The foot the mail app's road puts under the words. */
  mail_foot: string;
}

/**
 * One draft for one lead (§9.3). Refused before any model call when the
 * workspace has no address of its own (US law asks for one at the foot of a
 * business email), when this lead has no address that reaches them, and when
 * that address is on the never-again list: an opt-out is honoured here as the
 * send door and the finder honour it, by the same predicate, and a list that
 * cannot be read is no yes. The foot is code's, and the owner's own mail app
 * sends it.
 */
export async function draftFor(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  lead: LeadRow,
  input: { tone: "first" | "shorter" | "warmer"; previous?: { subject: string; body: string } },
): Promise<DraftAnswer> {
  const offer = await getWorkspaceOffer(ctx, lead.tenant_id);
  if (!offer.address) throw new AppError("validation", LEAD_NO_ADDRESS, 422);
  if (!lead.email || lead.email_state === "none" || lead.email_state === "invalid") {
    throw new AppError("conflict", LEAD_OWN_EMAIL_WORDS.noAddress, 409);
  }
  const held = await getAddressesSuppressed(serviceDb(), lead.tenant_id, [lead.email]);
  if (held.size > 0) throw new AppError("conflict", LEAD_ASKED_NOT_WRITTEN, 409);
  const facts = await draftFacts(ctx, lead);
  const sentence =
    input.tone === "shorter" ? SHORTER_ASK : input.tone === "warmer" ? WARMER_ASK : "Write the first one.";
  const answer = await askForJson(
    {
      tenantId: lead.tenant_id,
      userId: ctx.userId,
      purpose: "lead_draft",
      request: {
        max_tokens: 600,
        system: DRAFT_SYSTEM,
        schema: LEAD_DRAFT_JSON_SCHEMA,
        messages: [
          {
            role: "user",
            content: [
              `Who is writing: ${offer.name}${offer.services.length ? `, which offers ${offer.services.join(", ")}` : ""}.`,
              `Who it goes to: ${facts.join("; ")}.`,
              ...(input.previous
                ? [`The last draft was:\nSubject: ${input.previous.subject}\n${input.previous.body}`]
                : []),
              sentence,
            ].join("\n\n"),
          },
        ],
      },
    },
    LeadDraftAnswerSchema,
    "draft",
  );
  const mailFoot = leadDraftFooter(offer.name, offer.address);
  const body = `${answer.body}${mailFoot}`;
  return {
    to: lead.email,
    subject: answer.subject,
    body,
    mailto: mailtoOf(lead.email, answer.subject, body),
    words: answer.body,
    mail_foot: mailFoot,
    ...(await getLeadEmailOffer(ctx, lead, offer)),
  };
}
