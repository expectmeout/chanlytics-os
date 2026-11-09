/**
 * How it reaches out (decision 0113): what a cold email to a business a search found is written from, the config's
 * `reach_out` section. What the business offers them, who it is for and what it fixes; the claims it may make about
 * itself, word for word; the tone of a cold email, apart from the receptionist's; how every email signs off; and what an
 * answer to a lead who wrote back offers. Never `outreach`: that is Autonomy's policy class. What each writer reads of it
 * is campaigns/reach-out/section.ts.
 *
 * The read takes any words of any length. A cold email's words are the last thing that should mute a receptionist on a
 * live line (config-schema.ts, on what a config that cannot be read costs), so what is wrong with them is judged on the
 * way in alone, by the save's own rules (WriteRules takes reachOutProblems), through every door that writes the config:
 * the page's folds, Ask's cards, a route.
 */
import { z } from "zod";
import { webAddressesIn } from "../../shared/link";
import { phoneAsWritten } from "../../shared/phone";
import { REACH_OUT_LIMITS as L, REPLY_OFFERS } from "./config-rules";

export const ReachOutConfigSchema = z
  .object({
    offer: z.string().optional(),
    who_for: z.string().optional(),
    fixes: z.string().optional(),
    proof: z.array(z.string()).optional(),
    tone: z.string().optional(),
    signed_by: z.string().optional(),
    signature: z.string().optional(),
    phone: z.string().optional(),
    // A word a newer build offers reads as none (the booking link, as before), never a config that cannot be parsed.
    reply_offer: z.enum(REPLY_OFFERS).optional().catch(undefined),
  })
  .strip();
export type ReachOutConfig = z.infer<typeof ReachOutConfigSchema>;

/** The refusal a row says under its box, by the limit it went past. */
export const REACH_OUT_REFUSAL_WORDS = {
  tooLong: (max: number) => `Keep it under ${max.toLocaleString("en-US")} characters.`,
  claims: `Up to ${L.claims} facts.`,
  signature: `${L.signatureLines} lines at most, with no link and no {{value}}.`,
  phone: "A phone number, as people write one: its digits, with spaces, dashes or brackets.",
} as const;

/**
 * What is wrong with a signature: past its lines, a link (the foot's link is code's), or a {{value}}, which nothing
 * fills in a signature, so a business would read the braces.
 */
export function reachOutSignatureProblem(text: string): "too_many_lines" | "value" | "link" | null {
  const t = text.trim();
  if (t.split(/\r\n|\r|\n/).length > L.signatureLines) return "too_many_lines";
  if (/\{\{|\}\}/.test(t)) return "value";
  return webAddressesIn(t).length > 0 ? "link" : null;
}

const TEXT_MAX = [
  ["offer", L.offer],
  ["who_for", L.whoFor],
  ["fixes", L.fixes],
  ["tone", L.tone],
  ["signed_by", L.signedBy],
  ["signature", L.signature],
  ["phone", L.phone],
] as const;

/** Everything a save refuses in the section, each with where it is in the section and the sentence said under its box. */
export function reachOutProblems(section: ReachOutConfig): { path: (string | number)[]; message: string }[] {
  const tooLong = TEXT_MAX.flatMap(([key, max]) =>
    (section[key]?.length ?? 0) > max ? [{ path: [key], message: REACH_OUT_REFUSAL_WORDS.tooLong(max) }] : [],
  );
  const claims = section.proof ?? [];
  const claimsOver = claims.length > L.claims ? [{ path: ["proof"], message: REACH_OUT_REFUSAL_WORDS.claims }] : [];
  const claimOver = claims.flatMap((claim, n) =>
    claim.length > L.claim ? [{ path: ["proof", n], message: REACH_OUT_REFUSAL_WORDS.tooLong(L.claim) }] : [],
  );
  // A box says one thing at a time: what is too long is said so first.
  const { signature = "", phone = "" } = section;
  const signatureBad = signature.length <= L.signature && reachOutSignatureProblem(signature) !== null;
  const phoneBad = phone.trim() !== "" && phone.length <= L.phone && !phoneAsWritten(phone);
  return [
    ...tooLong,
    ...claimsOver,
    ...claimOver,
    ...(signatureBad ? [{ path: ["signature"], message: REACH_OUT_REFUSAL_WORDS.signature }] : []),
    ...(phoneBad ? [{ path: ["phone"], message: REACH_OUT_REFUSAL_WORDS.phone }] : []),
  ];
}
