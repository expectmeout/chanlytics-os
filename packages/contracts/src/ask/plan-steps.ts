/**
 * A plan's steps as a commit and the Line read them (the marketing manager's spec §5.4, §5.8): the token a step names
 * what an earlier step makes by (`@step:n`), filled from what the plan made, and that made read back from its cards'
 * outcomes; which steps a card waits for; the plan's group as the Line draws it; and the answer's sentence for a plan's
 * cards. Apart from the plan itself (plan.ts, which reads the starters, the lists and the journey to make the steps), so
 * the browser's commit runner (legacy-bridge/ask/commit.ts) and the Line read these and nothing of how a plan is made.
 */
import type { AskPlanStamp, AskProposal } from "./ask";
import type { AskLanguage } from "./ask-language";
import { ASK_SENDS, PROPOSAL_WORDS, rec } from "../ask-proposals/spec";

/**
 * Every step of a plan committed so far, by step, as a card's commit fills its tokens from it and a press of the plan
 * skips it: its card's kind and the id its spec says it made (ProposalSpec.made), null where it made nothing a token
 * names (a note, a change); or that the step was undone, so what it made is gone, a card naming it is refused
 * (PROPOSAL_WORDS.planUndone) and the plan's press never runs it again. A step absent is not committed yet.
 */
export type PlanMade = Record<number, { kind: string; id: string | null } | { undone: true }>;

/** The token a step's input names what an earlier step makes by: `@step:1` is step 1's message. */
export const STEP_TOKEN = /^@step:(\d+)$/;

export function stepToken(n: number): string {
  return `@step:${n}`;
}

/**
 * Every `@step:n` in a step's input, at any depth, filled with the id step n made; or the first step it names that
 * names nothing: not committed yet, committed with nothing a token names (its id null), or undone. The input it is
 * given is left as it was.
 */
export function resolveSteps(
  payload: Record<string, unknown>,
  made: PlanMade,
): Record<string, unknown> | { unresolved: number } {
  let unresolved: number | null = null;
  const fill = (v: unknown): unknown => {
    if (typeof v === "string") {
      const m = STEP_TOKEN.exec(v);
      if (!m) return v;
      const n = Number(m[1]);
      const step = made[n];
      if (step && !("undone" in step) && step.id !== null) return step.id;
      unresolved ??= n;
      return v;
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  const out = Object.fromEntries(Object.entries(payload).map(([k, x]) => [k, fill(x)]));
  return unresolved === null ? out : { unresolved };
}

/**
 * A plan's made, read back from what became of its cards, in one pass (a reload, another tab): a step whose card was
 * approved is committed, with the id its outcome kept (null where it made nothing a token names, or an outcome saved
 * before outcomes kept it); one whose card was undone is undone. A card dismissed, failed or not acted on is not
 * committed. Only the cards of plan `planId` are read.
 */
export function planMadeOf(planId: string, cards: readonly Pick<AskProposal, "kind" | "plan" | "outcome">[]): PlanMade {
  const made: PlanMade = {};
  for (const p of cards) {
    if (p.plan?.id !== planId || !p.outcome) continue;
    if (p.outcome.state === "done") made[p.plan.step] = { kind: p.kind, id: p.outcome.made?.id ?? null };
    else if (p.outcome.state === "undone") made[p.plan.step] = { undone: true };
  }
  return made;
}

/**
 * The step a plan's card waits for before it may be approved (AskPlanStamp.after: a send's, every step of its plan that
 * sends nothing): the first of them undone, since what it made is gone and the card never goes (PROPOSAL_WORDS
 * .planUndone); else the first not committed yet, which is approved first (waitsForStep). Null where every step it waits
 * for is committed, and for a card of no plan. One rule: commit.ts refuses a card that waits before its spec is read, and
 * the Line draws what it waits for in place of its Approve (planGroupOf).
 */
export function planWaits(
  plan: AskPlanStamp | undefined,
  made: PlanMade,
): { undone: number } | { waits: number } | null {
  if (!plan) return null;
  const undone = plan.after.find((n) => {
    const step = made[n];
    return !!step && "undone" in step;
  });
  if (undone !== undefined) return { undone };
  const waits = plan.after.find((n) => !made[n]);
  return waits === undefined ? null : { waits };
}

/**
 * A turn's cards as the Line draws them: each plan's cards together, where its first card stands, and every other card on
 * its own and in its place. The order within a plan is planGroupOf's.
 */
export function cardsInPlans<P extends Pick<AskProposal, "plan">>(
  cards: readonly P[],
): ({ card: P } | { plan: P[] })[] {
  const out: ({ card: P } | { plan: P[] })[] = [];
  const plans = new Map<string, P[]>();
  for (const p of cards) {
    const id = p.plan?.id;
    const held = id === undefined ? undefined : plans.get(id);
    if (id === undefined) out.push({ card: p });
    else if (held) held.push(p);
    else {
      const group = [p];
      plans.set(id, group);
      out.push({ plan: group });
    }
  }
  return out;
}

/** A plan's card as the Line holds it, its outcome as it stands: what its group is drawn from. */
type HeldCard = Pick<AskProposal, "id" | "kind" | "payload" | "plan" | "outcome">;

/**
 * One step of a plan's group on the Line (planGroupOf): where it stands and what it waits for, as numbers the Line says
 * in its own language (ask-text.jsx, as it says Approve), and the refusal's own sentence where it never goes.
 */
interface GroupStep<P extends HeldCard> {
  card: P;
  /** Its step and how many its plan has: its head ("Step 1 of 6"). */
  step: number;
  of: number;
  /** What it waits for in place of its Approve (planWaits): a step not committed yet, or one undone; null where it may be pressed. */
  wait: { undone: number } | { waits: number } | null;
  /** The step whose message WhatsApp reviews before this send can go, said before its press; null for none, and where it never goes. */
  review: number | null;
  /** Why it never goes, in the refusal's own words (PROPOSAL_WORDS.planUndone), where a step it waits for was undone; else null. */
  note: string | null;
}

/**
 * Whether a send of this kind, by these channels, waits for WhatsApp's review of its message's WhatsApp version before it
 * can be approved, the way core holds it: a broadcast that ticks WhatsApp (core refuseTicks answers 409 while the version
 * is in review), or a campaign by WhatsApp alone (check-playbook's refuseMessageNoTickHolds). A campaign by email too
 * keeps its WhatsApp tick and holds those people until the version is approved, so it can be approved now. The one
 * reading of it: the Line's (reviewedStep) and the plan's words and its pick of a message (plan.ts).
 */
export function sendWaitsForReview(kind: string, channels: readonly unknown[]): boolean {
  if (kind === "broadcast") return channels.includes("whatsapp");
  return kind === "playbook" && channels.length > 0 && channels.every((c) => c === "whatsapp");
}

/**
 * The step whose message a send goes on (its template_id, `@step:n`), where that step writes the message with a WhatsApp
 * version and the send waits for WhatsApp's review of it (sendWaitsForReview). Null for every other card. Read from the
 * cards alone: no review state is held.
 */
function reviewedStep(p: HeldCard, steps: ReadonlyMap<number, HeldCard>): number | null {
  const token = typeof p.payload.template_id === "string" ? STEP_TOKEN.exec(p.payload.template_id) : null;
  if (!token) return null;
  const n = Number(token[1]);
  const message = steps.get(n);
  const writesWhatsApp = message?.kind === "message" && !!rec(message.payload.versions).whatsapp;
  const channels: unknown[] = Array.isArray(p.payload.channels) ? p.payload.channels : [];
  return writesWhatsApp && sendWaitsForReview(p.kind, channels) ? n : null;
}

/**
 * A plan's group as the Line draws it (the marketing manager's spec §5.8), from its cards as they stand now: each step in
 * step order, with where it stands, what it waits for in place of its Approve (planWaits, over what its plan's cards
 * became: planMadeOf) and what is said before its press; and how many steps that send nothing are not committed yet
 * (`left`), which the one press over them approves and counts, none where it is zero. Numbers, which the Line words in its
 * own language as it words its other buttons (ask-text.jsx); the plan is the first stamped card's, and a card of any other
 * plan, or of none, is not read.
 */
export function planGroupOf<P extends HeldCard>(
  cards: readonly P[],
): { id: string; steps: GroupStep<P>[]; left: number } {
  const id = cards.find((p) => p.plan)?.plan?.id ?? "";
  const mine = cards
    .flatMap((card) => (card.plan && card.plan.id === id ? [{ card, plan: card.plan }] : []))
    .sort((a, b) => a.plan.step - b.plan.step);
  const made = planMadeOf(
    id,
    mine.map((s) => s.card),
  );
  const byStep = new Map<number, HeldCard>(mine.map((s) => [s.plan.step, s.card]));
  const steps = mine.map(({ card, plan }): GroupStep<P> => {
    const wait = planWaits(plan, made);
    const undone = wait !== null && "undone" in wait;
    return {
      card,
      step: plan.step,
      of: plan.of,
      wait,
      review: undone ? null : reviewedStep(card, byStep),
      note: undone ? PROPOSAL_WORDS.planUndone : null,
    };
  });
  const left = mine.filter((s) => s.plan.silent && !made[s.plan.step]).length;
  return { id, steps, left };
}

/**
 * The answer's sentences for a round's cards (ask-answer.ts answerForCards: the round that proposed and said nothing else,
 * and the headline an answer that claimed a write is said as, the marketing manager's spec §5.8). The headline counts a
 * plan's cards as steps, as each card's head does ("Step 6 of 6"), and says how many send nothing, how many send (a kind
 * of ASK_SENDS) and how many wait for a send, pressed after it though they send nothing themselves, as a follow-up after
 * a lead search ("A plan of 6 steps to review: 4 send nothing, then 2 send."), a part that is none left out: a lead search
 * and its follow-up read "2 send" while it called every step pressed on its own a send (the operator stress run, 15 Oct
 * 2026). Null where the cards are not every one a step of one plan, which are counted as cards. The detail is the plan's
 * own words where the round made a plan (`words`, its steps unstamped too, D3: what it pauses, leaves out and asks to be
 * asked again, said nowhere else), in the question's language as the plan says them (PlanWorld.says); else, for a plan
 * with steps that send nothing, how its cards are approved, the sends' own press said only where there is a send; else
 * null, each card its own press as several cards are.
 */
export function planCountWords(
  cards: readonly Pick<AskProposal, "kind" | "plan">[],
  language: AskLanguage,
  words: string | null,
): { headline: string | null; detail: string | null } {
  // No words (null, or a caller in the browser's JavaScript that passed none) is a round that made no plan.
  const said = words || null;
  const id = cards[0]?.plan?.id;
  if (id === undefined || cards.some((p) => p.plan?.id !== id)) return { headline: null, detail: said };
  const silent = cards.filter((p) => p.plan?.silent).length;
  const sends = cards.filter((p) => !p.plan?.silent && ASK_SENDS.has(p.kind)).length;
  const waiting = cards.length - silent - sends;
  const es = language === "es";
  const one = (n: number, singular: string, plural: string): string => `${n} ${n === 1 ? singular : plural}`;
  const parts = [
    ...(silent > 0
      ? [es ? one(silent, "no envía nada", "no envían nada") : one(silent, "sends nothing", "send nothing")]
      : []),
    ...(sends > 0 ? [es ? one(sends, "envía", "envían") : one(sends, "sends", "send")] : []),
    ...(waiting > 0
      ? [es ? one(waiting, "espera un envío", "esperan un envío") : one(waiting, "waits for a send", "wait for a send")]
      : []),
  ];
  const headline = es
    ? `Un plan de ${one(cards.length, "paso", "pasos")} para revisar: ${parts.join(" y luego ")}.`
    : `A plan of ${one(cards.length, "step", "steps")} to review: ${parts.join(", then ")}.`;
  if (said !== null || silent === 0) return { headline, detail: said };
  // The sends' half only where the plan has a send to say it of.
  const together = es
    ? "Los pasos que no envían nada se aprueban con un toque"
    : "The steps that send nothing are approved with one press";
  const apart = es
    ? "; cada envío se aprueba aparte cuando estén hechos los pasos que espera"
    : "; each send is its own press once the steps it waits for are done";
  const after = es ? ". Nada pasa hasta que lo hagas." : ". Nothing happens until you do.";
  return { headline, detail: `${together}${sends > 0 ? apart : ""}${after}` };
}
