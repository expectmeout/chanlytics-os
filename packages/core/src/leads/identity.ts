/**
 * A lead is a place (decision 25). Two records are one only when the place id
 * is the same, or when the name, the address and the phone all agree (a
 * duplicate listing, folded into lead_places). A shared phone, email or
 * website host is looked up and marked, never merged on: salon suites and
 * medical buildings share a front desk. A free-mail address is never an
 * identity at all, so a stylist's Gmail cannot mark a business as somebody
 * else's. "Already yours" is the place id alone; "hidden" is a suppression by
 * what happened (already a customer, erased).
 */
import { LEAD_FREE_MAIL } from "@chanlytics/contracts";
import type { CleanPlace } from "./clean";
import type { LeadShare } from "./ports";

/** A personal inbox at a free-mail domain (contracts' one list): never an identity. */
export function isFreeMail(email: string): boolean {
  const host = (email.split("@")[1] ?? "").toLowerCase();
  return (LEAD_FREE_MAIL as readonly string[]).includes(host);
}

const norm = (s: string | null): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Same name, same street and same phone: one place listed twice. The later listing folds into the first. */
export function foldDuplicates(places: CleanPlace[]): { kept: CleanPlace[]; folded: Map<string, string> } {
  const kept: CleanPlace[] = [];
  const folded = new Map<string, string>();
  const byKey = new Map<string, string>();
  for (const p of places) {
    if (!p.phone || !p.raw.street) {
      kept.push(p);
      continue;
    }
    const key = `${norm(p.raw.title)}|${norm(p.raw.street)}|${p.phone}`;
    const first = byKey.get(key);
    if (first) {
      folded.set(p.raw.placeId, first);
      continue;
    }
    byKey.set(key, p.raw.placeId);
    kept.push(p);
  }
  return { kept, folded };
}

/** The details a place could share with a lead or a person: its phone, its own-domain emails, its host. */
export function shareKeysOf(p: CleanPlace): { phones: string[]; emails: string[]; hosts: string[] } {
  return {
    phones: p.phone ? [p.phone] : [],
    emails: p.emails.filter((e) => !isFreeMail(e)),
    hosts: p.host ? [p.host] : [],
  };
}

/**
 * The details places in ONE batch share with each other: the second place with
 * a number is marked as sharing it with the first, by place id, since neither
 * is a lead yet when the workspace is asked (sharesOf finds the ones that are).
 */
export function sharesWithin(places: CleanPlace[]): Map<string, LeadShare[]> {
  const firstBy = new Map<string, string>();
  const out = new Map<string, LeadShare[]>();
  for (const p of places) {
    const keys = shareKeysOf(p);
    for (const [kind, values] of [["phone", keys.phones], ["email", keys.emails], ["host", keys.hosts]] as const) {
      for (const v of values) {
        const key = `${kind}:${v}`;
        const first = firstBy.get(key);
        if (!first) firstBy.set(key, p.raw.placeId);
        else if (first !== p.raw.placeId) out.set(p.raw.placeId, [...(out.get(p.raw.placeId) ?? []), { kind, place_id: first }]);
      }
    }
  }
  return out;
}

export type Identity = { kind: "already_yours"; leadId: string } | { kind: "hidden" } | { kind: "new"; shares: LeadShare[] };

/**
 * What the workspace already knows of this place. Held by its place id: already
 * yours, skipped. Suppressed by its place id: hidden. Otherwise new, with the
 * shared details marked from what was looked up.
 */
export function identityOf(p: CleanPlace, held: Map<string, string>, suppressedPlaceIds: Set<string>, shares: { key: string; share: LeadShare }[]): Identity {
  const leadId = held.get(p.raw.placeId);
  if (leadId) return { kind: "already_yours", leadId };
  if (suppressedPlaceIds.has(p.raw.placeId)) return { kind: "hidden" };
  const keys = shareKeysOf(p);
  const mine = new Set([...keys.phones, ...keys.emails, ...keys.hosts]);
  const seen = new Set<string>();
  const out: LeadShare[] = [];
  for (const s of shares) {
    if (!mine.has(s.key)) continue;
    const id = `${s.share.kind}:${s.share.lead_id ?? ""}:${s.share.contact_id ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(s.share);
  }
  return { kind: "new", shares: out };
}
