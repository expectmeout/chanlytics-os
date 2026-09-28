/**
 * Consultations, the step before a deal (0008): which consult-first service a calendar title names, whether a
 * consultation has had no proposal since, and where a person stands on the way to a deal (dealStageOf), the one
 * rule the Pipeline's groups and People's deal lists both read.
 */
import { foldName, needsConsultation, type ConsultRules } from "../calendar/service-offer";
import { DAY_MS } from "../shared/time";
import type { DealStage } from "./deal-words";
import { dealIsOpen, type DealVM } from "./deal-vm";

/** A consultation this recent with no proposal after it is the next step to take. */
export const CONSULT_FOLLOW_DAYS = 7;

/**
 * The consult-first service a calendar title names, as Settings spells it: what a proposal started from that
 * consultation is for (0008). The longest name the title holds, so "Kitchen remodel" wins over "Remodel"; null where
 * it names none. The fold is availability's.
 */
export function consultServiceOf(
  title: string | null | undefined,
  services: readonly { name: string }[] | undefined,
  rules: ConsultRules | null | undefined,
): string | null {
  const t = foldName(String(title ?? "").trim());
  if (!t) return null;
  let best: { name: string; folded: string } | null = null;
  for (const s of services ?? []) {
    const name = String(s.name ?? "").trim();
    const folded = foldName(name);
    if (!folded || !t.includes(folded) || !needsConsultation(name, rules)) continue;
    if (!best || folded.length > best.folded.length) best = { name, folded };
  }
  return best ? best.name : null;
}

/** A calendar title that is a consultation: it says so, or it names a consult-first service (consultServiceOf). */
export function isConsultationTitle(
  title: string | null | undefined,
  services: readonly { name: string }[] | undefined,
  rules: ConsultRules | null | undefined,
): boolean {
  const t = foldName(String(title ?? "").trim());
  if (!t) return false;
  if (t.includes("consult")) return true;
  return consultServiceOf(title, services, rules) !== null;
}

/**
 * Whether a consultation that ended at `endedMs` has had no proposal since (0008), given the person's deal: none on
 * file, or one that passed or ended before it, which the consultation then began again. An open deal has had its
 * proposal; a pass or an end at or after the consultation answered one. The one rule for the step not taken, which
 * the week's count (consultationsWithoutProposal) and the Calendar's peek (calendarPeekDeal) both ask.
 */
export function noProposalSince(deal: Pick<DealVM, "stage" | "sinceMs"> | null | undefined, endedMs: number): boolean {
  if (!deal) return true;
  if (dealIsOpen(deal)) return false;
  return deal.sinceMs !== null && deal.sinceMs < endedMs;
}

/**
 * One person's consultation waits on the business (0008): it ended in the last CONSULT_FOLLOW_DAYS days and no proposal
 * came after it (noProposalSince). The one row-level rule the week's count (consultationsWithoutProposal) and the deal
 * stage a list reads (dealStageOf) both ask.
 */
export function consultationHeld(
  r: { consultedMs: number | null; deal: Pick<DealVM, "stage" | "sinceMs"> | null },
  nowMs: number,
): boolean {
  const at = r.consultedMs;
  if (typeof at !== "number" || !Number.isFinite(at)) return false;
  if (at > nowMs || nowMs - at > CONSULT_FOLLOW_DAYS * DAY_MS) return false;
  return noProposalSince(r.deal, at);
}

/** Where a person stands on the way to a deal, as the Pipeline groups them: a consultation, or their deal's stage. */
export type DealStandingStage = "consultation" | DealStage;

/**
 * Which of the Pipeline's groups a person is in (pipeline.ts pipelineOf), and so what a list's deal stage fact reads
 * (decision 0009): a consultation held with no proposal since, then a proposal out or a client, then a consultation
 * ahead of someone with nothing open (something new begins, whatever they passed on or ended before), then the stage of
 * a deal that passed or ended. Null for someone with none of these. One rule, so the Pipeline's Consultations and
 * People's Consultations list are one set of people.
 */
export function dealStageOf(
  r: {
    consultedMs: number | null;
    deal: Pick<DealVM, "stage" | "sinceMs"> | null;
    consultAhead: { startMs: number; allDay: boolean } | null;
  },
  nowMs: number,
): DealStandingStage | null {
  if (consultationHeld(r, nowMs)) return "consultation";
  const d = r.deal;
  if (d && (d.stage === "proposed" || d.stage === "won")) return d.stage;
  if (r.consultAhead) return "consultation";
  return d ? d.stage : null;
}

/**
 * The next step nobody has taken (0008): a consultation that ended in the last CONSULT_FOLLOW_DAYS days with no
 * proposal since (noProposalSince), the oldest first, a tie by name and then id, which is the order the Pipeline lists
 * them in and Today names its first two. `consultedMs` is when their last visit, a consultation, ended; a row without
 * a number there has no consultation to follow.
 */
export function consultationsWithoutProposal<
  T extends {
    id?: string;
    name?: string;
    consultedMs: number | null;
    deal: Pick<DealVM, "stage" | "sinceMs"> | null;
  },
>(rows: readonly T[], nowMs: number): T[] {
  const endOf = (r: T): number => r.consultedMs as number;
  return rows
    .filter((r) => consultationHeld(r, nowMs))
    .sort(
      (a, b) =>
        endOf(a) - endOf(b) ||
        String(a.name ?? "").localeCompare(String(b.name ?? "")) ||
        String(a.id ?? "").localeCompare(String(b.id ?? "")),
    );
}

/**
 * Their count, in the one sentence the Pipeline's Consultations say it in and Today's row re-prints word for word:
 * "2 held in the last week, no proposal yet". The week is the rule's own (CONSULT_FOLLOW_DAYS).
 */
export function consultsHeldWords(n: number): string {
  return `${n} held in the last week, no proposal yet`;
}
