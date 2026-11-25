/**
 * What approving a week takes (00706, the content loop PRD's 6.2 and 8.4; 00714, 12.4): every slot that is ready, each
 * held to the checks a press is held to before the week is approved. A slot whose time has passed is never put up (the
 * Week review of 25 Nov 2026, C1: one rule, contracts slotTimePassed), whoever approves; then the reason it was made
 * for, asked of what the business says now (its services, its notes, the offers and facts its owner keeps). A slot one
 * refuses is left out of the approval and said in words; the rest go under one snapshot of what the door holds of each
 * slot: by id, where, as what, when, from which footage, and why. The owner's press (the dashboard) and a rung's job at a
 * held week's time (the edge) ask it here, so a week AI approves is the week the owner's press would have approved.
 */
import {
  WEEK_WORDS,
  dayInZone,
  goodUntilOf,
  notesInForce,
  offersOf,
  parseTenantConfig,
  slotTimePassed,
  statedFactsOf,
  type OwnerClaim,
  type OwnersFact,
  type PlanSlotDto,
  type PostHeldWhy,
} from "@chanlytics/contracts";
import { evaluate, verdictWords } from "../policy/evaluate";

/** What the business says of itself now, as a slot's reason is asked of it: a line each, its services, the owner's facts. */
export interface WeekBusiness {
  says: readonly string[];
  services: readonly string[];
  facts: readonly OwnersFact[];
}

/** A business nothing was read of: enough for a week none of whose slots leans on an offer or a service. */
export const NO_BUSINESS: WeekBusiness = { says: [], services: [], facts: [] };

/** Whether any ready slot leans on what the business says: an offer or a service its reason names. Read it only then. */
export const weekLeansOnBusiness = (slots: readonly PlanSlotDto[]): boolean =>
  slots.some((slot) => slot.state === "proposed" && (!!slot.intent?.offer || !!slot.intent?.service));

/**
 * What the business says now, from its configuration as stored and the claims its owner keeps: its notes in force and
 * its services with what they cost, the offers that run today, and the facts the owner stated that still stand.
 */
export function weekBusinessOf(
  config: unknown,
  claims: readonly OwnerClaim[],
  at: { zone: string; nowMs: number },
): WeekBusiness {
  const profile = parseTenantConfig(config)?.brain?.profile;
  const services = profile?.services ?? [];
  const today = dayInZone(at.zone, at.nowMs).key;
  return {
    says: [
      ...notesInForce(profile?.notes, at.zone, new Date(at.nowMs)).map((note) => `${note.title} ${note.text}`),
      ...services.map((service) => `${service.name} ${service.price_note ?? ""}`),
      ...offersOf(claims, today).map((offer) => offer.says),
    ],
    services: services.map((service) => service.name),
    facts: statedFactsOf(claims, today),
  };
}

/** A slot's reason, asked before the week is approved (PRD 6.2): what refuses it, as a hold and in words, or null. */
function slotRefusal(
  slot: PlanSlotDto,
  at: { zone: string; nowMs: number },
  business: WeekBusiness,
): { held: PostHeldWhy; why: string } | null {
  const verdict = evaluate({
    reason: {
      intent: slot.intent,
      goodUntil: goodUntilOf(slot.intent, at.zone),
      atMs: Date.parse(slot.at),
      nowMs: at.nowMs,
      zone: at.zone,
      says: business.says,
      services: business.services,
      facts: business.facts,
      opportunities: null,
      moment: "before",
    },
  });
  if (verdict.ok) return null;
  return { held: verdict.refusals[0]?.code ?? "reason_passed", why: verdictWords(verdict) };
}

/** What the approval holds of each slot, as the door holds it: by id, where, as what, when, from which footage, and why. */
type SlotApproved = Pick<PlanSlotDto, "id" | "place" | "kind" | "at" | "file_id" | "title" | "intent">;

/**
 * A slot an approval leaves out, with why in the owner's words. `held` is what holds it where its reason no longer
 * stands, to be kept on its row; null where only its time has passed, which its row says by itself until another is
 * picked.
 */
export interface SlotLeftOut {
  id: string;
  why: string;
  held: PostHeldWhy | null;
}

/** A week's approval as it would be taken now: the slots that go, those left out with why, and the snapshot. */
export interface WeekApproval {
  going: PlanSlotDto[];
  leftOut: SlotLeftOut[];
  snapshot: { slots: SlotApproved[] };
}

/** The week's approval from its slots, in the business's zone, at a moment, by what the business says then. */
export function weekApprovalOf(
  slots: readonly PlanSlotDto[],
  at: { zone: string; nowMs: number },
  business: WeekBusiness,
): WeekApproval {
  const ready = slots.filter((slot) => slot.state === "proposed");
  const leftOut = ready.flatMap((slot): SlotLeftOut[] => {
    if (slotTimePassed(slot.at, at.nowMs)) return [{ id: slot.id, why: WEEK_WORDS.timePassed, held: null }];
    const refusal = slotRefusal(slot, at, business);
    return refusal ? [{ id: slot.id, ...refusal }] : [];
  });
  const going = ready.filter((slot) => !leftOut.some((left) => left.id === slot.id));
  const snapshot = {
    slots: going.map(({ id, place, kind, at: when, file_id, title, intent }) => ({
      id,
      place,
      kind,
      at: when,
      file_id,
      title,
      intent,
    })),
  };
  return { going, leftOut, snapshot };
}
