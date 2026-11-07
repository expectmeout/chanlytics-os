/** Lead build: mailboxes. */

import {
  LEAD_CARD_WORDS,
  leadCardStepsOf,
  type LeadOwnWords,
  type LeadCardChain,
  type LeadCardEmailVM,
  type LeadCardLead,
} from "../../../leads/card";
import type { ReachOutChainDto, ReachOutMailboxChoice, ReachOutMailboxFacts } from "../../reach-out/dtos";
import { CUSTOMER_DOMAIN_DAILY_MAX, MAILBOX_DAILY_CAP_MAX, mailboxDailyCap } from "../../../email/mailbox-standing";
import { reachOutWritesFrom } from "../../../email/mailbox-connections/states";
import { chainFirstSender, type ReachOutDraft } from "../../reach-out/draft";
import { type SlotWorkspace } from "../../reach-out/rules";
import { chainPaceOf } from "../../reach-out/sheet/chain";
import { REACH_OUT_GAP_MINUTES } from "../../reach-out/words/limits";
import { LEAD_BUILD_WORDS, YOU, leadSlotLabel } from "./steps";

/** One pace the day's row offers: the most a day it comes to across its mailboxes, and how often each writes. */
export interface LeadPaceChoice {
  gap: number;
  share: number;
  hint: string;
}

/**
 * How it runs' "A day, at most": each gap the database allows, as the day it comes to across the chain's mailboxes
 * (chainPaceOf, the timetable's own count), one entry per day, each the slowest gap that reaches it, so the day's emails
 * are spread as far as that day allows (0077: the fastest was kept, and a new mailbox offered one every 5 minutes). The
 * saved gap is a choice of its own where it is none of these, so the picker always says what is saved. Largest day first,
 * then the slower gap. An owner's own inbox has none: they send each, so the day is theirs.
 */
export function leadPaceChoicesOf(mailboxes: readonly ReachOutMailboxFacts[], saved?: number): LeadPaceChoice[] {
  const shareAt = (gap: number) =>
    chainPaceOf({ mailboxes: [...mailboxes], owner_sends: false, gap_minutes: gap }).share;
  const slowest = new Map<number, number>();
  for (const gap of REACH_OUT_GAP_MINUTES) {
    const share = shareAt(gap);
    if (share > 0) slowest.set(share, gap);
  }
  const gaps = new Set(slowest.values());
  if (saved !== undefined && (REACH_OUT_GAP_MINUTES as readonly number[]).includes(saved) && shareAt(saved) > 0)
    gaps.add(saved);
  return [...gaps]
    .map((gap) => ({ gap, share: shareAt(gap), hint: LEAD_BUILD_WORDS.runs.every(gap) }))
    .sort((a, b) => b.share - a.share || b.gap - a.gap);
}

/**
 * The chain as its record holds it while it is written (the draft beside the chain it was read from): its steps as the
 * draft has them, numbered in order, and the name it signs with, so a preview reads the words being typed.
 */
export function leadDraftChainOf<C extends Pick<ReachOutChainDto, "steps" | "signed_by">>(
  chain: C,
  reachOutDraft: ReachOutDraft,
): C {
  return {
    ...chain,
    signed_by: reachOutDraft.signed_by.trim() || null,
    steps: reachOutDraft.steps.map((s, n) => ({
      id: s.id ?? `new-${n}`,
      n,
      after_days: n === 0 ? null : s.after_days,
      subject: n === 0 ? s.subject : null,
      body: s.hand ? "" : s.body,
      template_id: null,
      hand: s.hand,
      state: "running" as const,
    })),
  };
}

/**
 * One step's email as one lead gets it (the canvas's Preview as a real lead): its words filled by the send's own fill
 * (leadCardStepsOf), under the first email's subject where it answers in that thread, and what holds it where a value
 * they lack stands in its words. Null for a call or a note, and a place the chain does not have.
 */
export function leadPreviewEmailOf(params: {
  chain: LeadCardChain;
  lead: LeadCardLead;
  workspace: SlotWorkspace;
  place: number;
  /** The lead's own words at each step (decision 0096): the email as this lead gets it. */
  own?: LeadOwnWords;
}): LeadCardEmailVM | null {
  const steps = leadCardStepsOf(params);
  const step = steps[params.place - 1];
  const at = [...params.chain.steps].sort((a, b) => a.n - b.n)[params.place - 1];
  if (!step || !at || at.hand) return null;
  const first = steps[0]?.subject ?? null;
  const subject = step.subject ?? (first ? [{ kind: "text" as const, text: "Re: " }, ...first] : null);
  const gaps = [
    ...new Set([...(step.subject ?? []), ...step.body].flatMap((x) => (x.kind === "gap" ? [x.label] : []))),
  ];
  // A value of yours (lower-cased by the card) not set holds every email; one of theirs, this lead's alone.
  const yours = new Set(YOU.map((k) => leadSlotLabel(k).toLowerCase()));
  const mine = gaps.filter((g) => yours.has(g));
  const theirs = gaps.filter((g) => !yours.has(g));
  const words = LEAD_BUILD_WORDS;
  const blocked = [
    mine.length ? words.youUnset(mine.map((g) => g.charAt(0).toUpperCase() + g.slice(1))) : null,
    theirs.length ? words.theyLack(theirs) : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    head: LEAD_CARD_WORDS.emailOf(params.place, steps.length),
    to: params.lead.to,
    subject,
    body: step.body,
    when: null,
    note: null,
    blocked: blocked || null,
    instead: null,
  };
}

/**
 * The email with its opening said, the one it goes with (contracts leadOpeningOf: the one its check wrote, else the
 * sentence the listing says, decision 0078), so the preview reads as the send will. The email as it was where it has no
 * opening, or there is none to say yet.
 */
export function withOpeningSaid(email: LeadCardEmailVM, opening: string | null): LeadCardEmailVM {
  if (!opening) return email;
  return { ...email, body: email.body.map((p) => (p.kind === "opening" ? { kind: "opening", text: opening } : p)) };
}

/* ---------------------------------------------------------------------------------- Sending, its mailboxes (0077) */

/** One mailbox's row in How it runs: its tick, whether it may be taken off, and the line under its address. */
export interface LeadMailboxRowVM {
  id: string;
  address: string;
  on: boolean;
  /** The last one ticked: it stays, since a sequence that names none writes from every mailbox (00424). */
  locked: boolean;
  sub: string;
  /** Its SPF or DKIM is missing: the row offers Set up DNS. */
  dnsMissing: boolean;
}

const pickedIn = (c: Pick<ReachOutMailboxChoice, "id" | "state">, picked: readonly string[]) =>
  reachOutWritesFrom({ id: c.id, state: c.state }, picked);

/** Why a mailbox sends nothing now, in a word: its state, or its day done; null while it sends. */
function notSendingOf(c: Pick<ReachOutMailboxChoice, "state" | "sends_now">): string | null {
  const notSending = LEAD_BUILD_WORDS.runs.notSending;
  if (c.sends_now) return null;
  if (c.state === "paused" || c.state === "held" || c.state === "reconnect") return notSending[c.state];
  return c.state === "connected" ? notSending.resting : null;
}

/**
 * How it runs' mailbox rows (0077, D4), for the ids the draft names: each with its tick, "New" first for one connected
 * after the sequence was made, its day (a ramping mailbox's rising to its top: 40, or 20 on the domain its customers
 * write to), why it does not send now where it does not, the DNS records it is missing, and the last tick kept.
 */
export function leadMailboxRowsOf(
  chain: Pick<ReachOutChainDto, "mailbox_choices" | "created_at">,
  picked: readonly string[],
): LeadMailboxRowVM[] {
  const runs = LEAD_BUILD_WORDS.runs;
  const choices = chain.mailbox_choices ?? [];
  const count = choices.filter((c) => pickedIn(c, picked)).length;
  return choices.map((choice) => {
    const on = pickedIn(choice, picked);
    const top = Math.min(
      choice.facts.daily_cap,
      choice.facts.customer_domain ? CUSTOMER_DOMAIN_DAILY_MAX : MAILBOX_DAILY_CAP_MAX,
    );
    const missing = (["spf", "dkim"] as const).filter((k) => choice.dns[k] === "missing");
    const resting = notSendingOf(choice);
    const sub = [
      choice.connected_at > chain.created_at ? runs.newMailbox : null,
      runs.day(mailboxDailyCap(choice.facts), top),
      resting,
      missing.length ? runs.dnsMissing(missing) : null,
      on && count === 1 ? runs.keepOne : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: choice.id,
      address: choice.address,
      on,
      locked: on && count === 1,
      sub,
      dnsMissing: missing.length > 0,
    };
  });
}

/**
 * The ids a draft names after one tick: a list of its own from then on (a sequence that named none wrote from every
 * mailbox, which a tick makes the ones ticked), and never none, which would mean every one again.
 */
export function leadMailboxesTicked(
  chain: Pick<ReachOutChainDto, "mailbox_choices">,
  picked: readonly string[],
  id: string,
  on: boolean,
): string[] {
  const now = (chain.mailbox_choices ?? []).filter((c) => pickedIn(c, picked)).map((c) => c.id);
  const next = on ? [...new Set([...now, id])] : now.filter((x) => x !== id);
  return next.length > 0 ? next : now;
}

/** The mailboxes the draft writes from that send now: what its day is made of while it is being changed. */
export function leadSendingFactsOf(
  chain: Pick<ReachOutChainDto, "mailbox_choices" | "mailboxes">,
  picked: readonly string[],
): ReachOutMailboxFacts[] {
  if (!chain.mailbox_choices) return chain.mailboxes;
  return chain.mailbox_choices.filter((c) => c.sends_now && pickedIn(c, picked)).map((c) => c.facts);
}

/** Ends with (0077, D10): the name, or the signature of the first mailbox the draft writes from, and what to say. */
export function leadEndingOf(
  chain: Pick<ReachOutChainDto, "mailbox_choices">,
  reachOutDraft: Pick<ReachOutDraft, "mailbox_ids" | "signs_with" | "signed_by" | "owner_sends">,
): { value: "name" | "mailbox"; options: Array<{ value: "name" | "mailbox"; label: string }>; note: string | null } {
  const runs = LEAD_BUILD_WORDS.runs;
  const first = reachOutDraft.owner_sends ? null : chainFirstSender(chain, reachOutDraft.mailbox_ids);
  const signature = first?.signature ?? null;
  const value = reachOutDraft.signs_with === "mailbox" && signature ? "mailbox" : "name";
  const options: Array<{ value: "name" | "mailbox"; label: string }> = [
    { value: "name", label: runs.endsName(reachOutDraft.signed_by) },
  ];
  if (first && signature) options.push({ value: "mailbox", label: runs.endsSignature(first.address) });
  const note =
    value === "mailbox" && signature?.has_link
      ? runs.signatureHasLink
      : value === "name" && !reachOutDraft.signed_by.trim()
        ? runs.noName
        : null;
  return { value, options, note };
}
