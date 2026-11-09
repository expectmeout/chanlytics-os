/**
 * A plan's steps as a commit and the Line read them (the marketing manager's spec §5.4, §5.8): the token a step names
 * what an earlier step makes by (`@step:n`), filled from what the plan made, and that made read back from its cards'
 * outcomes; which steps a card waits for; the plan's group as the Line draws it; and the answer's sentence for a plan's
 * cards. Apart from the plan itself (plan.ts, which reads the starters, the lists and the journey to make the steps), so
 * the browser's commit runner (bridge/ask/commit.ts) and the Line read these and nothing of how a plan is made.
 */
import type { AskPlanStamp, AskProposal } from "./thread-words";
import type { AskLanguage } from "./language";
import { ASK_SENDS, PROPOSAL_WORDS, rec, type ProposalRefusal } from "./proposals/spec";

/**
 * Every step of a plan committed so far, by step, as a card's commit fills its tokens from it and a press of the plan
 * skips it: its card's kind and the id its spec says it made (ProposalSpec.made), null where it made nothing a token
 * names (a note, a change); or that the step was undone, so what it made is gone, a card naming it is refused
 * (PROPOSAL_WORDS.planUndone) and the plan's press never runs it again. A step absent is not committed yet.
 */
export type PlanMade = Record<number, { kind: string; id: string | null } | { undone: true }>;

/** The token a step's input names what an earlier step makes by: `@step:1` is step 1's message. */
export const STEP_TOKEN = /^@step:(\d+)$/;

export function stepToken(count: number): string {
  return `@step:${count}`;
}

/**
 * Every `@step:n` in a step's input, at any depth, filled with the id step n made; or the first step it names that
 * names nothing: not committed yet, committed with nothing a token names (its id null), or undone. The input it is
 * given is left as it was.
 */
export function resolveSteps(
  payload: Record<string, unknown>,
  created: PlanMade,
): Record<string, unknown> | { unresolved: number } {
  let unresolved: number | null = null;
  const fill = (value: unknown): unknown => {
    if (typeof value === "string") {
      const m = STEP_TOKEN.exec(value);
      if (!m) return value;
      const n = Number(m[1]);
      const step = created[n];
      if (step && !("undone" in step) && step.id !== null) return step.id;
      unresolved ??= n;
      return value;
    }
    if (Array.isArray(value)) return value.map(fill);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, fill(x)]));
    return value;
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
  const created: PlanMade = {};
  for (const p of cards) {
    if (p.plan?.id !== planId || !p.outcome) continue;
    if (p.outcome.state === "done") created[p.plan.step] = { kind: p.kind, id: p.outcome.made?.id ?? null };
    else if (p.outcome.state === "undone") created[p.plan.step] = { undone: true };
  }
  return created;
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
  created: PlanMade,
): { undone: number } | { waits: number } | null {
  if (!plan) return null;
  const undone = plan.after.find((n) => {
    const step = created[n];
    return !!step && "undone" in step;
  });
  if (undone !== undefined) return { undone };
  const waits = plan.after.find((n) => !created[n]);
  return waits === undefined ? null : { waits };
}

/**
 * Why a step a card waits for or names by its token gives it nothing, in the person's words: the step undone, done with
 * nothing to name, or not done yet. The one spelling of a step's state as a refusal.
 */
function unnamedStep(made: PlanMade, n: number): string {
  const step = made[n];
  void n;
  if (!step) return PROPOSAL_WORDS.waitsForStep();
  return "undone" in step ? PROPOSAL_WORDS.planUndone : PROPOSAL_WORDS.stepMadeNothing();
}

/**
 * A plan's card with what its earlier steps made in place of their tokens (`@step:n`); or the refusal, and nothing is sent:
 * where a step it waits for (its stamp's `after`) was undone or is not committed yet, and where a step it names was undone
 * (what it made is gone), made nothing a token names (waiting would never help), or is not committed yet (it is approved
 * first). A card of no plan is as it was. The one reading, the browser's press and the act door's.
 */
export function cardWithSteps<P extends Pick<AskProposal, "plan" | "payload">>(
  p: P,
  made: PlanMade,
): P | ProposalRefusal {
  if (!p.plan) return p;
  const wait = planWaits(p.plan, made);
  if (wait) return { refused: unnamedStep(made, "undone" in wait ? wait.undone : wait.waits) };
  const filled = resolveSteps(p.payload, made);
  return "unresolved" in filled ? { refused: unnamedStep(made, Number(filled.unresolved)) } : { ...p, payload: filled };
}

/**
 * A turn's cards as the Line draws them: each plan's cards together, where its first card stands, and every other card on
 * its own and in its place. The order within a plan is planGroupOf's.
 */
function cardsInPlans<P extends Pick<AskProposal, "plan">>(cards: readonly P[]): ({ card: P } | { plan: P[] })[] {
  const out: ({ card: P } | { plan: P[] })[] = [];
  const plans = new Map<string, P[]>();
  for (const card of cards) {
    const id = card.plan?.id;
    const held = id === undefined ? undefined : plans.get(id);
    if (id === undefined) out.push({ card: card });
    else if (held) held.push(card);
    else {
      const group = [card];
      plans.set(id, group);
      out.push({ plan: group });
    }
  }
  return out;
}

/**
 * A turn's cards as groups: a plan, or the cards of no plan that stand side by side. Each group opens one card at a time
 * (openCardOf) and says once what holds them all (holdsAlike).
 */
export function cardsTogether<P extends Pick<AskProposal, "plan">>(
  cards: readonly P[],
): ({ cards: P[] } | { plan: P[] })[] {
  const out: ({ cards: P[] } | { plan: P[] })[] = [];
  for (const it of cardsInPlans(cards)) {
    const last = out.at(-1);
    if ("plan" in it) out.push(it);
    else if (last && "cards" in last) last.cards.push(it.card);
    else out.push({ cards: [it.card] });
  }
  return out;
}

/** Whether a card asks nothing more of the person: it was decided, or a press found its subject gone (`moved`). A press refused otherwise waits to be tried again. */
const cardSettled = (p: Pick<AskProposal, "outcome">): boolean =>
  !!p.outcome && (p.outcome.state !== "failed" || !!p.outcome.moved);

/**
 * The card of a group that stands open: the first with nothing pressed yet, a plan's by its step. A refused press keeps
 * its refusal and its Try again where it stands, and the next card opens, so one step refused stops no other. Null once
 * every card has its outcome.
 */
export function openCardOf<P extends Pick<AskProposal, "id" | "plan" | "outcome">>(cards: readonly P[]): string | null {
  const ordered = [...cards].sort((a, b) => (a.plan?.step ?? 0) - (b.plan?.step ?? 0));
  return ordered.find((p) => !p.outcome)?.id ?? null;
}

const cardHolds = (p: Pick<AskProposal, "sheet">): readonly string[] => p.sheet?.holds ?? [];

/**
 * What holds every card of a group alike, said once over them, while one still waits: three campaigns on one WhatsApp
 * review said it three times. A hold only some of them have stays on those cards.
 */
export function holdsAlike<P extends Pick<AskProposal, "sheet" | "outcome">>(cards: readonly P[]): string[] {
  const first = cards.at(0);
  if (!first || cards.length < 2 || cards.every(cardSettled)) return [];
  return cardHolds(first).filter((h) => cards.every((p) => cardHolds(p).includes(h)));
}

/** A line of the answer's words reduced to what it says: no mark of a quote, a callout, a list or bold. */
const lineSays = (line: string): string =>
  line
    .replace(/^\s*(?:>\s*)*(?:\[!(?:WARNING|NOTE)\]\s*)?(?:[-*]\s+|\d+\.\s+)?/i, "")
    .replaceAll("**", "")
    .replace(/[.\s]+$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
/** A callout's own line, its words on the lines after. */
const CALLOUT_ALONE = /^\s*>\s*\[!(?:WARNING|NOTE)\]\s*$/i;

/**
 * The answer's words less any line that only says again what holds a card still waiting: the card says it, where it is
 * read before the press. Words of the answer's own are kept, however close, and the whole answer stays what Copy and Read
 * aloud take.
 */
export function wordsLessHolds<P extends Pick<AskProposal, "sheet" | "outcome">>(
  words: string,
  cards: readonly P[],
): string {
  const held = new Set(cards.filter((p) => !cardSettled(p)).flatMap((p) => cardHolds(p).map(lineSays)));
  if (!held.size) return words;
  const kept = words.split("\n").filter((l) => !held.has(lineSays(l)));
  return kept
    .filter((l, k) => !CALLOUT_ALONE.test(l) || /^\s*>\s*\S/.test(kept[k + 1] ?? ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A plan's card as the Line holds it, its outcome as it stands: what its group is drawn from. */
type HeldCard = Pick<AskProposal, "id" | "kind" | "payload" | "plan" | "outcome">;

/**
 * One step of a plan's group on the Line (planGroupOf): where it stands and what it waits for, as numbers the Line says
 * in its own language (surfaces/ask/words.ts, as it says Approve), and the refusal's own sentence where it never goes.
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
 * own language as it words its other buttons (surfaces/ask/words.ts); the plan is the first stamped card's, and a card of any other
 * plan, or of none, is not read.
 */
export function planGroupOf<P extends HeldCard>(
  cards: readonly P[],
): { id: string; steps: GroupStep<P>[]; left: number } {
  const id = cards.find((p) => p.plan)?.plan?.id ?? "";
  const mine = cards
    .flatMap((card) => (card.plan && card.plan.id === id ? [{ card, plan: card.plan }] : []))
    .sort((a, b) => a.plan.step - b.plan.step);
  const created = planMadeOf(
    id,
    mine.map((s) => s.card),
  );
  const byStep = new Map<number, HeldCard>(mine.map((s) => [s.plan.step, s.card]));
  const steps = mine.map(({ card, plan }): GroupStep<P> => {
    const wait = planWaits(plan, created);
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
  const left = mine.filter((s) => s.plan.silent && !created[s.plan.step]).length;
  return { id, steps, left };
}

/**
 * What a plan's one press does now (D2 of the answers canvas, which reverses the old rule on purpose: the card says the
 * send, and the press names it). Walking its steps in order, it takes every step not made yet up to and including the
 * first send; a send after that is the next press, since it may build on what that first one comes back with. Where the
 * first send's message is written by this plan and WhatsApp must read it first (`review`, the step that writes it), the
 * press stops short of the send: there is nothing it could do yet. A step the person undid stops any send that names it
 * (`undone`). `steps` empty is a plan with nothing left to press.
 */
export function planPressOf<P extends HeldCard>(
  cards: readonly P[],
): { steps: number[]; send: number | null; review: number | null; undone: number | null } {
  const group = planGroupOf(cards);
  const made = planMadeOf(
    group.id,
    group.steps.map((s) => s.card),
  );
  const out = { steps: [] as number[], send: null as number | null, review: null as number | null };
  for (const s of group.steps) {
    if (made[s.step] || s.card.outcome?.state === "dismissed") continue;
    if (s.card.plan?.silent) {
      out.steps.push(s.step);
      continue;
    }
    if (s.note) return { ...out, undone: s.wait && "undone" in s.wait ? s.wait.undone : null };
    if (s.review !== null && !made[s.review]) {
      // WhatsApp reads the words first: the press files them, and the send waits.
      out.review = s.review;
      return { ...out, undone: null };
    }
    out.steps.push(s.step);
    out.send = s.step;
    return { ...out, undone: null };
  }
  return { ...out, undone: null };
}

/**
 * Whether WhatsApp is still reading the words a plan's send goes on: the step that wrote them is made, and the send is not.
 * The card says so in its press's place of mind ("WhatsApp reads new words first"); its press tries, and the door says.
 */
export function planInReview<P extends HeldCard>(cards: readonly P[]): boolean {
  return planGroupOf(cards).steps.some((s) => s.review !== null && !s.card.outcome && !s.wait);
}

/** How many waiting cards the model is named: past it, the person says which. */
const WAITING_NAMED = 6;

/**
 * The cards waiting in a thread for their press, as the turn's words name them to the model (D18 of the answers canvas), so a
 * yes can be matched to one by its id. A plan is one card, named by its first step. Null where none waits.
 */
export function waitingCardsWords(cards: readonly Pick<AskProposal, "id" | "title" | "plan">[]): string | null {
  const seen = new Set<string>();
  const named = cards.flatMap((p) => {
    if (p.plan) {
      if (seen.has(p.plan.id)) return [];
      seen.add(p.plan.id);
    }
    return [`“${p.plan?.head?.title ?? p.title}” (${p.id})`];
  });
  if (named.length === 0) return null;
  return `Cards waiting in this thread for their press: ${named.slice(-WAITING_NAMED).join(", ")}.`;
}

/**
 * The answer's sentences for a round's cards (ask/answer/normalize.ts answerForCards: the round that proposed and said nothing
 * else, and the headline an answer that claimed a write is said as). A plan's is its own first sentence, where it gave one:
 * it is one card, whose fold says its parts, so nothing here counts them (D1 of the answers canvas). Null where the cards
 * are not every one a step of one plan, whose detail is the round's own words where it has any (a setup's).
 */
export function planCountWords(
  cards: readonly Pick<AskProposal, "kind" | "plan">[],
  language: AskLanguage,
  words: string | null,
): { headline: string | null; detail: string | null } {
  // No words (null, or a caller in the browser's JavaScript that passed none) is a round that made no plan.
  const sentence = words || null;
  const id = cards[0]?.plan?.id;
  if (id === undefined || cards.some((p) => p.plan?.id !== id)) return { headline: null, detail: sentence };
  // A plan is one card, which says what it does: the sentence over it never counts its parts.
  const first = sentence?.split(/(?<=[.!?…])\s/)[0] ?? null;
  return { headline: first ?? (language === "es" ? "Aquí está el plan." : "Here is the plan."), detail: null };
}
