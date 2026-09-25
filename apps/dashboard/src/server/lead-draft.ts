/**
 * The first email to a lead: the facts it is drafted from, and the draft. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  AppError,
  LEAD_DRAFT_JSON_SCHEMA,
  LEAD_NO_ADDRESS,
  LeadDraftAnswerSchema,
  leadDraftFooter,
  siteHost,
} from "@chanlytics/contracts";
import { workspaceOffer } from "./lead-helpers";
import type { LeadRow } from "./lead-searches";
import { askForJson } from "./model-json";
import type { RouteContext } from "./with-route";

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
export const DRAFT_SYSTEM = [
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

/** A mailto: for the owner's own mail app: the address, the subject and the body, each encoded once; CRLF line breaks, as mail apps read them. */
export function leadMailto(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  return `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(body)}`;
}

/** What this lead is, in the words the card saw: never a guess, and never the name of whoever fetched it. */
async function draftFacts(ctx: Pick<RouteContext, "supabase">, lead: LeadRow): Promise<string[]> {
  const { data, error } = await ctx.supabase
    .from("leads")
    .select("business_name, category, city, region, website_host, rating, reviews")
    .eq("id", lead.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const r = (data ?? null) as {
    business_name?: string;
    category?: string | null;
    city?: string | null;
    region?: string | null;
    website_host?: string | null;
    rating?: number | null;
    reviews?: number | null;
  } | null;
  const out = [r?.business_name ?? lead.business_name];
  if (r?.category) out.push(r.category);
  const where = [r?.city, r?.region].filter(Boolean).join(", ");
  if (where) out.push(where);
  const host = siteHost(r?.website_host ?? null);
  if (host) out.push(host);
  if (typeof r?.rating === "number") out.push(`${r.rating.toFixed(1)} from ${r.reviews ?? 0} reviews`);
  return out;
}

export interface DraftAnswer {
  to: string;
  subject: string;
  body: string;
  mailto: string;
}

/**
 * One draft for one lead (§9.3). Refused before any model call when the
 * workspace has no address of its own (US law asks for one at the foot of a
 * business email) and when this lead has no address that reaches them. The
 * foot is code's, and the owner's own mail app sends it.
 */
export async function draftFor(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  lead: LeadRow,
  input: { tone: "first" | "shorter" | "warmer"; previous?: { subject: string; body: string } },
): Promise<DraftAnswer> {
  const offer = await workspaceOffer(ctx, lead.tenant_id);
  if (!offer.address) throw new AppError("validation", LEAD_NO_ADDRESS, 422);
  if (!lead.email || lead.email_state === "none" || lead.email_state === "invalid") {
    throw new AppError("conflict", "This lead has no address that reaches them. Call instead.", 409);
  }
  const facts = await draftFacts(ctx, lead);
  const said =
    input.tone === "shorter"
      ? "Make it shorter. The same ask, fewer words."
      : input.tone === "warmer"
        ? "Make it warmer. The same length, the same ask."
        : "Write the first one.";
  const answer = await askForJson(
    {
      tenantId: lead.tenant_id,
      userId: ctx.userId,
      purpose: "lead_draft",
      request: {
        max_tokens: 600,
        system: DRAFT_SYSTEM,
        schema: LEAD_DRAFT_JSON_SCHEMA as unknown as Record<string, unknown>,
        messages: [
          {
            role: "user",
            content: [
              `Who is writing: ${offer.name}${offer.services.length ? `, which offers ${offer.services.join(", ")}` : ""}.`,
              `Who it goes to: ${facts.join("; ")}.`,
              ...(input.previous
                ? [`The last draft was:\nSubject: ${input.previous.subject}\n${input.previous.body}`]
                : []),
              said,
            ].join("\n\n"),
          },
        ],
      },
    },
    LeadDraftAnswerSchema,
    "draft",
  );
  const body = `${answer.body}${leadDraftFooter(offer.name, offer.address)}`;
  return { to: lead.email, subject: answer.subject, body, mailto: leadMailto(lead.email, answer.subject, body) };
}
