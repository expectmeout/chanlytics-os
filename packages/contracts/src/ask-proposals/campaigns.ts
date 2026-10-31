/**
 * Campaigns' cards: a broadcast, a playbook that sends on its own, the channels a playbook goes by, a playbook that
 * exists changed in place (paused, resumed, renamed or retimed), a playbook's run that waits for a person, and a message
 * written for the Library, a version per channel.
 */
import { CHANNEL_WORDS } from "../broadcasts/reach-for";
import { BREATH_WHY, goesToOf, heardWords } from "../broadcasts/run-words";
import {
  CONSENT_CHANNELS,
  CONSENT_CHANNEL_WORDS,
  channelsWords,
  type ConsentChannel,
} from "../consent/consent-channels";
import { LIFECYCLE_TOAST, LIFECYCLE_WORDS, channelsGoesByWords } from "../playbooks/lifecycle/lifecycle-words";
import { PLAYBOOK_PATCH_CLEARS, PLAYBOOK_PATCH_KEYS } from "../playbooks/playbook-patch";
import { SEND_ONCE_STOP_WORDS, SENDING_NOW_WORDS, whenItGoes } from "../playbooks/playbook-triggers";
import { SEQUENCES_ROUTE, newSequenceRoute, runRoute, sequenceRoute } from "../sequences/sequence-address";
import { MESSAGES_ROUTE } from "../shell/address";
import { clockWhen } from "../shared/clock";
import { joinWords } from "../shared/words";
import { CAMPAIGN_ROOMS, LIBRARY_STARTER_WORDS, LIBRARY_WORDS, runApprovedTail } from "../shell/campaign-rooms";
import { MESSAGE_BEGIN_WORDS, metaStatusOf } from "../templates/campaign-message";
import { OWN_VERSION_CHANNELS, versionWord, type OwnVersionChannel } from "../templates/message-versions";
import { languageName } from "../templates/template-languages";
import { TEMPLATE_BODY_WORDS, TEMPLATE_SAME_NAME_WORDS } from "../templates/templates";
import {
  PROPOSAL_WORDS,
  asText,
  decisionOf,
  idIn,
  rec,
  refuseWith,
  wasIn,
  type ProposalCall,
  type ProposalSpec,
} from "./spec";

/** What a member does with a playbook's run that waits for them (the Phase 4 plan, D11): send it, or end it unsent. */
export const RUN_VERBS = ["approve", "skip"] as const;

/**
 * Where a campaign card says it goes (a proposal that names channels): "on WhatsApp and by email", and, where more than one
 * carries people, how many on each: "on WhatsApp and by email (52 on WhatsApp, 32 by email)". `byChannel` is who each
 * channel reaches (reachSplit's, a run's reach): a tick nobody is on is still said, in the first half.
 */
export function proposalChannelsWords(
  channels: readonly ConsentChannel[],
  byChannel: Readonly<Record<ConsentChannel, number>>,
): string {
  const goes = channelsWords(channels);
  const carrying = channels.filter((c) => byChannel[c] > 0);
  if (carrying.length < 2) return goes;
  return `${goes} (${carrying.map((c) => `${byChannel[c].toLocaleString("en-US")} ${CONSENT_CHANNEL_WORDS[c]}`).join(", ")})`;
}

/**
 * Why a new campaign's card is not made (propose_sequence's action moment), said to the model with what to do about
 * it. `from` is the call that names what the workspace holds, its messages and its lists, as the tool calls it.
 */
export const PLAYBOOK_CARD_REFUSALS = {
  /** A typed slot the proposal gave no words for: a question for the person. */
  typedSlot: (label: string): string =>
    `this template takes typed words for “${label}”; ask the person what to say there, then propose again with params`,
  value:
    "each value is text, or @first_name, @business_name, @booking_link or @review_link, or @visit_when or @visit_service on a reminder or a check after an appointment, @proposal_link on the proposal follow-up, or @freed_when when a cancellation frees a time",
  plainText: "every typed value must be plain text under 1024 characters, without line breaks",
  /** The moment's starter, hidden in this workspace's Library: no card adds it back. */
  starterHidden: (title: string, from: string): string =>
    `${LIBRARY_STARTER_WORDS.hiddenInLibrary(title)} Say so; ${from} names the messages that may send.`,
  starterUnsent: (title: string, from: string): string =>
    `the “${title}” starter has no version this workspace can send yet; say so and suggest adding the starter set under ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library}, or name a message from ${from}`,
  hiddenTemplate: (from: string): string =>
    `that template is one the workspace keeps out of the composers; ${from} names the ones that may send`,
  noList: (from: string): string => `no such list; ${from} names them`,
  uncounted: (list: string, why: string): string => `${list} can't be counted right now: ${why}`,
  /**
   * A second running campaign on the same moment, list and message, where they named none of its own (D9). The model's
   * words, when the card is made; a card's start that meets one is answered in twinRunsWords, the owner's.
   */
  twin: (name: string): string =>
    `“${name}” already runs on this moment with this message: say so, and propose a second only when they ask for another by a name of its own`,
  followUpsUnread: "who already had a proposal follow-up could not be read just now; say so, and try again in a moment",
  /**
   * The week's breath: every message sent or due within a week of a run, a member's own too, holds its person, so the
   * count waits on it. The stem a broadcast's door says it in (core createBroadcast).
   */
  weekUnread:
    "who has had a message from you lately, or has one due, could not be read just now; say so, and try again in a moment",
  /**
   * The autonomy modes, unread: what a card says of its runs after the first is what its class's row says a new sequence
   * starts as (decision 0064), so no card is made on a guess.
   */
  modeUnread:
    "the sending mode of this campaign's class could not be read just now, so the card cannot say what its runs would do; say so, and try again in a moment",
  /** The action named a message and a starter both: a campaign sends one. */
  starterOrMessage:
    "name template_id for a message the workspace holds, or starter for the moment's starter to file at Approve, never both",
  trigger: (triggers: readonly string[]): string => `trigger must be one of ${triggers.join(", ")}`,
  listToken: (from: string): string =>
    `a playbook on a list needs list: the list's token from ${from} (seg:<id> or list:<id>)`,
  templateId: (from: string): string =>
    `template_id must be an id ${from} returned, or omitted for the trigger's starter`,
  /**
   * A campaign nobody could be sent, whenever its moment named them (contracts campaignReachable): what stops it, in the
   * owner's words (campaignBlockWords), and where that is fixed. No card: its Approve would start a campaign that sends
   * nothing (the 30 Oct 2026 review, item 6: three on Today, "0 people on the list said yes to messages" in each).
   */
  reachesNobody: (says: string, fix: string | null): string =>
    `${says} So this campaign would reach no one: make no card for it, and say that in one sentence${fix ? `, pointing to ${fix}` : ""}.`,
} as const;

/**
 * A card of the one thing to fix before a campaign can reach anyone (contracts campaignFixCard): what it answers an
 * Approve, which it never offers, and what the model is told of it once made, in place of a campaign card's note.
 */
export const FIX_CARD_WORDS = {
  nothingToApprove: "This card has nothing to approve: its door opens where this is fixed.",
  note: "Nothing to approve: this card is the one thing to fix before the campaign can reach anyone, with its door to where it is fixed. Say that one thing in a sentence, never that a campaign was proposed or is running, and propose the campaign again once it is fixed.",
} as const;

/**
 * The fix card (the 30 Oct 2026 review, item 6): it commits nothing, so an Approve, which no card of it offers, is refused
 * in its words; its Open is its door, where the thing is fixed (Get their yes, Connections, Messages).
 */
export const fixSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: () => refuseWith(FIX_CARD_WORDS.nothingToApprove),
  receipt: () => "",
  open: ({ payload }) => asText(payload.to) || null,
};

/**
 * What POST playbooks answers, 409, a card's start (x-via ask) that a running twin refuses (the dashboard's
 * campaigns/playbook-row.ts twinRefusal): the card shows a route's refusal to the owner who pressed it, so it says what
 * happened, never what to do next (PLAYBOOK_CARD_REFUSALS.twin is the model's, when the card is made).
 */
export const twinRunsWords = (name: string): string =>
  `“${name}” already runs on this moment with this message, so nothing was started.`;

/** What a new campaign's card says beside its moment, its reach and its class's mode (propose_sequence.moment). */
export const PLAYBOOK_CARD_WORDS = {
  /**
   * Every new sequence's first batch, and its first after new words, waits for the owner's OK whatever its mode (decision
   * 0064): the card says so beside what its batches do after that.
   */
  asksFirst: "its first batch waits for your OK",
  /**
   * A reminder the day before or a check after an appointment (D2): one message per appointment, sent whatever else
   * the person hears from you within a week of it, sent or due (BREATH_WHY), since the run is daily and the appointment
   * is on one day (contracts playbookRunReach), so the week's breath, which holds every other moment, does not hold it.
   * In the owner's words: it said "exempt from one a week per person" (the 30 Oct 2026 review, item 6).
   */
  appointmentBreath: `sent whatever else they hear ${BREATH_WHY}`,
} as const;

/**
 * What a send on the message an earlier step of Ask's plan writes says of it after "the message made by step 1" (PLAN_WORDS
 * .stepMessage): the offer its typed values carry, each quoted as a card quotes a value (contracts paramSaid), so the
 * card the owner approves shows the words that go to everyone it reaches. Nothing where no value is typed.
 */
export const stepOfferWords = (quotes: readonly string[]): string =>
  quotes.length === 0 ? "" : `, with the offer ${joinWords(quotes)}`;

/**
 * The channels a card's payload names, as the commit hands them to its route: only when the proposal named some, so a
 * card that named none commits the body it always did and the route reads WhatsApp alone.
 */
const channelsNamed = (pl: Record<string, unknown>): { channels?: unknown } =>
  Array.isArray(pl.channels) ? { channels: pl.channels } : {};

/** A broadcast's cancel: the undo of a broadcast sent from a card, and of a run approved from one. */
const cancelCall = (u: Record<string, unknown>): ProposalCall => ({
  route: "POST broadcasts/[id]/cancel",
  params: { id: asText(u.broadcast_id) },
});
/** What the cancel did, as the undo's receipt says it: stopped mid-send, or nothing will send. */
const canceled = (data: unknown): string =>
  rec(data).was === "sending" ? "Stopped — it ends after this batch" : "Canceled — nothing will send";

export const broadcastSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST broadcasts",
    body: {
      template_id: pl.template_id,
      params: Array.isArray(pl.params) ? pl.params : [],
      audience: { kind: pl.audience_kind, id: pl.audience_id ?? null },
      scheduled_for: pl.scheduled_for ?? null,
      name: pl.name ?? null,
      ...channelsNamed(pl),
    },
  }),
  // The count and the name are the route's answer where it gave them, the card's where it did not: who it goes to, the
  // people it enrolled less those it left out for the breath (goesToOf), and how many were left out.
  receipt: ({ payload: pl }, data) => {
    const d = rec(data);
    const leftOut = typeof d.left_out === "number" ? d.left_out : 0;
    const n =
      typeof d.recipient_count === "number"
        ? goesToOf({ recipient_count: d.recipient_count, left_out: leftOut })
        : Number(pl.count ?? 0);
    // Whether it was scheduled is the route's answer (`scheduled_ahead`), never the card's time: one set for a time that
    // passed before it was approved went now. Who it left out hear from you within a week of the time it goes (leftOutBy).
    const ahead = d.scheduled_ahead === true;
    // Pressed for now, it goes ten minutes on unless stopped (decision 0064, step 3): its Undo is that Stop.
    const goes = ahead
      ? "scheduled"
      : d.pressed_now === true
        ? `goes in ${SEND_ONCE_STOP_WORDS} unless you stop it`
        : SENDING_NOW_WORDS;
    const said = heardWords(leftOut, true);
    return `Send “${d.name ?? asText(pl.name)}” — ${n} ${n === 1 ? "person" : "people"}, ${goes}${said ? ` · ${said}` : ""}`;
  },
  undo: {
    label: () => "Cancel it, if it has not finished",
    window: "ten_minutes",
    record: (_p, data) => ({ broadcast_id: rec(data).id, decision_id: decisionOf(data) }),
    call: cancelCall,
    receipt: canceled,
  },
  open: () => SEQUENCES_ROUTE,
};

export const playbookSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST playbooks",
    body: {
      name: pl.name ?? null,
      trigger: pl.trigger,
      // On a list (decision 0009): the list it names, and whether it sends an offer or a win-back.
      ...(pl.list_key ? { list_key: pl.list_key } : pl.list_id ? { list_id: pl.list_id } : {}),
      ...(pl.list_key || pl.list_id ? { policy_class: pl.policy_class } : {}),
      // A starter named and no message (A0): the route files the starter, then starts the playbook on it.
      ...(pl.starter_key && !pl.template_id ? { starter_key: pl.starter_key } : { template_id: pl.template_id }),
      params: Array.isArray(pl.params) ? pl.params : [],
      run_hour: pl.run_hour,
      cap_per_run: pl.cap_per_run,
      gap_days: pl.gap_days,
      cadence_days: pl.cadence_days,
      ...channelsNamed(pl),
      // Its last day (00416), where the card named one: the route judges it again at its own clock.
      ...(typeof pl.until === "string" ? { until: pl.until } : {}),
    },
  }),
  // "Campaign", the word a person reads; and, where the route says it sent the starter's WhatsApp version for review, so.
  receipt: ({ payload: pl }, data) =>
    `Campaign “${rec(data).name ?? asText(pl.name)}” is running — its next run is under Coming up in Campaigns${
      rec(rec(data).starter).status === "submitted"
        ? " · its starter's WhatsApp version is with WhatsApp for review"
        : ""
    }`,
  undo: {
    label: () => "Delete it — nothing will run",
    window: "ten_minutes",
    record: (_p, data) => ({ playbook_id: rec(data).id, decision_id: decisionOf(data) }),
    call: (u) => ({ route: "DELETE playbooks/[id]", params: { id: asText(u.playbook_id) } }),
    receipt: () => "Deleted — nothing will run",
  },
  // The new campaign's sequence once it is made (spec 2026-10-09 §4.6, one landing rule: `campaigns/moment:<id>` lands on
  // it), by the id its commit kept for the undo, as the list card opens the list it made; before then New sequence on its
  // moment, its line written in, and Sequences where the card names no moment (the composer's moment mode went: the
  // closed-loop audit of 17 Oct 2026, G).
  open: ({ payload }, outcome) => {
    const id = idIn(rec(outcome?.undo), "playbook_id");
    if (id) return sequenceRoute(id);
    const trigger = idIn(payload, "trigger");
    return trigger ? newSequenceRoute(trigger) : SEQUENCES_ROUTE;
  },
};

/** The channels a payload names, in the product's order: what a card's commit and its receipt read; none where it names none. */
const channelsIn = (v: unknown): ConsentChannel[] =>
  Array.isArray(v) ? CONSENT_CHANNELS.filter((c) => (v as unknown[]).includes(c)) : [];

/**
 * The channels an existing playbook goes by, changed from a card (8 Oct 2026): what a press on the Goes by row of its
 * drawer does, proposed by Ask. The commit is the playbook's own PUT with the channels ALONE, as the drawer sends it:
 * the server judges them against the playbook as it stands then and writes nothing else (core checkPlaybookChannels),
 * so a card approved after somebody edited the playbook puts nothing of an older copy back, and neither does its
 * undo, which is the same PUT with the channels it had. The card carried the whole playbook as it was when proposed,
 * and both wrote all of it. `run_waits`: a run of the playbook already waits for approval, and keeps the channels it
 * was made with, which the receipt says as the drawer's does.
 */
export const playbookChannelsSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "playbook_id");
    const channels = channelsIn(pl.channels);
    if (!id || channels.length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return { route: "PUT playbooks/[id]", params: { id }, body: { channels } };
  },
  // The drawer's own sentence, whole (LIFECYCLE_TOAST.channels): "Visit reminder goes by WhatsApp and Email now", and
  // after it that the run which waits keeps the channels it was made with, where one does.
  receipt: ({ payload: pl }) =>
    LIFECYCLE_TOAST.channels(asText(pl.name) || "The campaign", channelsIn(pl.channels), pl.run_waits === true)
      .map((part) => (typeof part === "string" ? part : part.b))
      .join(""),
  undo: {
    label: ({ payload }) => `Put it back to ${channelsGoesByWords(channelsIn(payload.was))}`,
    window: "ten_minutes",
    // The channels the route found when it wrote (its answer's `was`), the card's own reading where an older route
    // answers none.
    record: (p, data) => ({ playbook_id: p.payload.playbook_id, was: wasIn(data, "channels") ?? p.payload.was }),
    call: (u) => {
      const was = channelsIn(u.was);
      return was.length === 0 || !asText(u.playbook_id)
        ? refuseWith(PROPOSAL_WORDS.noUndo)
        : { route: "PUT playbooks/[id]", params: { id: asText(u.playbook_id) }, body: { channels: was } };
    },
    receipt: () => "Its channels are as they were",
  },
  // Its sequence, where its record shows what it goes by now.
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? sequenceRoute(id) : SEQUENCES_ROUTE;
  },
};

/**
 * What a change card's commit sends: the fields it changes, and nothing else of the playbook. A null names nothing, but
 * for the two dates a null clears (PLAYBOOK_PATCH_CLEARS), so an undo of a campaign's first end writes "no end" back.
 */
/**
 * The keys a change names, as the PUT takes them: from a card's payload, whose sequence's mode rides as `sequence_mode`
 * (decision 0064; its own `mode` is what a pause's undo resumes under, which no change names), or from what the route
 * answered the playbook held (`was`), whose `mode` is the sequence's.
 */
const patchIn = (pl: Record<string, unknown>, modeKey: "sequence_mode" | "mode"): Record<string, unknown> => {
  const body: Record<string, unknown> = Object.fromEntries(
    PLAYBOOK_PATCH_KEYS.filter(
      (k) => k !== "mode" && pl[k] !== undefined && (pl[k] !== null || PLAYBOOK_PATCH_CLEARS.includes(k)),
    ).map((k) => [k, pl[k]]),
  );
  if (typeof pl[modeKey] === "string") body.mode = pl[modeKey];
  return body;
};

/**
 * The undo of a pause: it resumes the campaign under the mode its runs go under, so where the card read that mode as
 * `auto` it says in full that the campaign sends on its own, in the Resume ask's own sentence
 * (LIFECYCLE_WORDS.ledger.resume.auto, decision 7). Any other mode adds nothing, and a card made where the mode could not
 * be read (`mode` null) claims none. The payload's `mode` is decided where the row is, by the card's builder through
 * contracts batchModeOf (decision 0064): a step whose words are new is `ask` there, so its undo never promises it sends on
 * its own. This label has neither: it is written once, from the payload, when the card is made.
 */
const resumeUndoLabel = (mode: unknown): string =>
  mode === "auto" ? `Resume it. ${LIFECYCLE_WORDS.ledger.resume.auto}` : "Resume it";

/** One of the drawer's sentences (LIFECYCLE_TOAST) as a receipt's words. */
const toastWords = (parts: ReturnType<typeof LIFECYCLE_TOAST.changed>): string =>
  parts.map((part) => (typeof part === "string" ? part : part.b)).join("");

/**
 * A playbook changed in place from a card (the moment spec §4.9 A5): paused, resumed, renamed, or a new hour, cap, gap or
 * cadence. The commit is the playbook's own PUT with what changes ALONE: the server judges it against the playbook as it
 * stands then (core checkPlaybookPatch) and writes it with its line in the ledger (change_playbook), so a card approved
 * after somebody edited the playbook puts nothing of an older copy back. Its undo is the same PUT with what the route
 * found (`was`), never the card's reading. A pause leaves a run that waits waiting (D8): the card said so, and a skip is
 * a second card. Its receipt is the drawer's sentence: paused, resumed or changed.
 */
export const playbookChangeSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "playbook_id");
    const body = patchIn(pl, "sequence_mode");
    if (!id || Object.keys(body).length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return { route: "PUT playbooks/[id]", params: { id }, body };
  },
  receipt: ({ payload: pl }, data) => {
    const name = asText(rec(data).name ?? pl.name ?? pl.playbook_name) || LIFECYCLE_TOAST.nameless;
    if (pl.state === "paused") return toastWords(LIFECYCLE_TOAST.paused(name));
    if (pl.state === "running") return toastWords(LIFECYCLE_TOAST.resumed(name));
    return toastWords(LIFECYCLE_TOAST.changed(name));
  },
  undo: {
    label: ({ payload }) =>
      payload.state === "paused"
        ? resumeUndoLabel(payload.mode)
        : payload.state === "running"
          ? "Pause it again"
          : "Put it back",
    window: "ten_minutes",
    // What the route found when it wrote (its answer's `was`), the card's own reading only where a route answers none, and
    // the ledger row the change wrote, which the undo names (commit.ts: undo_of). A route that wrote nothing (somebody
    // made the same change first) answers it empty: no undo, which would undo theirs.
    record: (p, data) => {
      const was = rec(data).was;
      if (was && typeof was === "object" && Object.keys(was).length === 0) return null;
      return {
        playbook_id: p.payload.playbook_id,
        was: was && typeof was === "object" ? was : p.payload.was,
        decision_id: decisionOf(data),
      };
    },
    call: (u) => {
      const was = patchIn(rec(u.was), "mode");
      return !asText(u.playbook_id) || Object.keys(was).length === 0
        ? refuseWith(PROPOSAL_WORDS.noUndo)
        : { route: "PUT playbooks/[id]", params: { id: asText(u.playbook_id) }, body: was };
    },
    receipt: () => "It is as it was",
  },
  // Its sequence's record, where its state, clock and name are.
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? sequenceRoute(id) : SEQUENCES_ROUTE;
  },
};

/**
 * When an approved run goes, in the one sentence every receipt says it (playbook-triggers.ts whenItGoes): now, or --
 * approved outside the hours a message may go out in -- when they open, by the business's clock, which the card carries.
 * The route answers when it was approved (moved_from) beside when it goes, so the day is said from the moment of the
 * approval; a card that names no zone is told in UTC rather than said to be sending now.
 */
function runGoes(pl: Record<string, unknown>, data: unknown): string {
  const d = rec(data);
  const at = Date.parse(asText(d.scheduled_for));
  const from = Date.parse(asText(d.moved_from));
  const tz = asText(pl.timezone) || "UTC";
  const asked = Number.isFinite(from) ? from : at;
  return whenItGoes(
    { scheduled_for: asText(d.scheduled_for) || null, moved_from: asText(d.moved_from) || null },
    (ms) => clockWhen(ms, tz, asked),
    asked,
  );
}

/** What a skip did to the run, as the Broadcasts page says a cancel: skipped, or, had it moved on since, what it became. */
const skipped = (data: unknown): string => {
  const was = rec(data).was;
  return was === "sending"
    ? "stops after this batch"
    : was === "pending_approval"
      ? "skipped — nothing will send"
      : "canceled — nothing will send";
};

export const runSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  // The run's own doors, as the Playbooks card and the Broadcasts sheet press them: approve sends it, skip is its
  // cancel. The verb is the card's to say (no default, the Phase 4 plan, D11): a card that says neither is never sent.
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "broadcast_id");
    if (!id || !(RUN_VERBS as readonly unknown[]).includes(pl.verb)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: pl.verb === "approve" ? "POST broadcasts/[id]/approve" : "POST broadcasts/[id]/cancel",
      params: { id },
    };
  },
  // The Broadcasts page's words: approved, with how many and when it goes; or what the skip did.
  receipt: ({ payload: pl }, data) => {
    const name = asText(pl.name) || "The run";
    if (pl.verb !== "approve") return `${name} ${skipped(data)}`;
    const n = Number(rec(data).recipient_count ?? pl.people ?? 0);
    return `${name} ${runApprovedTail(n, runGoes(pl, data))}`;
  },
  // An approved run is canceled as a broadcast is; a skip has nothing to undo.
  undo: {
    label: ({ payload }) => (payload.verb === "approve" ? "Cancel it, if it has not finished" : null),
    window: "ten_minutes",
    record: (p, data) =>
      p.payload.verb === "approve" ? { broadcast_id: rec(data).id, decision_id: decisionOf(data) } : null,
    call: cancelCall,
    receipt: canceled,
  },
  // The run's sheet, where Today and the Playbooks card open it.
  open: ({ payload }) => {
    const id = idIn(payload, "broadcast_id");
    return id ? runRoute(id) : SEQUENCES_ROUTE;
  },
};

/**
 * A campaign run now, at the member's request (POST playbooks/:id/run, the hourly sweep's own run): it sends, waits for
 * their OK where its class asks, or finds nobody new, which the receipt says by the route's `outcome`. A sequence's More
 * presses it on its first step. A run that sends is canceled as an approved one is, while it has not finished; one that
 * waits is the notice's to approve or skip.
 */
export const playbookRunSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "playbook_id");
    return id ? { route: "POST playbooks/[id]/run", params: { id } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const d = rec(data);
    const name = asText(d.name ?? pl.name) || LIFECYCLE_TOAST.nameless;
    const n = Number(d.eligible) || 0;
    const people = `${n} ${n === 1 ? "person" : "people"}`;
    if (d.outcome === "sent") return `${name} — ${people}, ${runGoes(pl, data)}`;
    if (d.outcome === "held") return `${name} — ${people} waiting for your approval`;
    return `${name} — nobody new to send to right now`;
  },
  undo: {
    label: () => "Cancel it, if it has not finished",
    window: "ten_minutes",
    record: (_p, data) => {
      const d = rec(data);
      const id = asText(d.broadcast_id);
      return d.outcome === "sent" && id ? { broadcast_id: id, decision_id: decisionOf(data) } : null;
    },
    call: cancelCall,
    receipt: canceled,
  },
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? sequenceRoute(id) : SEQUENCES_ROUTE;
  },
};

/* ------------------------------------------------ a message written for the Library (the marketing manager, §5.2) */

/**
 * Where a WhatsApp version the door filed stands, after "its WhatsApp version": approved, in review, or as WhatsApp
 * answered the filing at once (refused, say), with where it is seen. A state the set does not know is in review, as a
 * row's is (contracts metaStatusOf).
 */
const whatsappFiledWords = (state: string): string => {
  const at = metaStatusOf(state);
  const where = `(see ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library})`;
  if (at === "approved") return "is approved";
  if (at === "pending") return "is with WhatsApp for review";
  return at === "rejected" ? `was refused by WhatsApp ${where}` : `is ${at} by WhatsApp ${where}`;
};
/** "email version", "email and text versions" (each channel's word, contracts versionWord). */
const versionsWords = (own: readonly OwnVersionChannel[]): string =>
  `${own.map(versionWord).join(" and ")} version${own.length === 1 ? "" : "s"}`;

/**
 * What Ask's message card says (propose_sequence's action message). Why one is not made, to the model: each opens with the
 * sentence POST templates/message says where the door has one (its checks are the card's), then says what to do. And the
 * card's own words, to the person: its title, when each version can go, what the door filed, and what its undo does.
 */
export const MESSAGE_WORDS = {
  /** A text version of an offer: the door's sentence (contracts channelNeverCarries). */
  smsOffer: `${CHANNEL_WORDS.noOffersByText} Say so, and write the offer for WhatsApp and email alone.`,
  /** A message about their own booking or proposal with no WhatsApp version for WhatsApp to review: the door's sentence. */
  utilityNeedsWhatsapp: `${MESSAGE_BEGIN_WORDS.utilityNeedsWhatsapp} Add one, or write it as an offer or news (marketing).`,
  /** A WhatsApp version past what WhatsApp takes: the door's sentence (templateBodyTooLong). */
  tooLong: `${TEMPLATE_BODY_WORDS} Shorten its WhatsApp version, and propose it again.`,
  /** A WhatsApp version where no number is connected: what the door answers when the edge finds none. */
  noNumber: `${LIBRARY_WORDS.writeNeedsNumber} Say so, and write it for email or text alone, or once a number is connected.`,
  /**
   * An email version where email cannot send, which is known (channelsReady: no mailbox, or no email for the deployment):
   * why, in its sentence, else the mailbox's.
   */
  noMailbox: (why: string | null): string =>
    `${why ?? CHANNEL_WORDS.noMailbox} Say so, and write it without an email version.`,
  /**
   * An email version where whether email can send could not be asked just now (channelsReady's `unchecked`): not a no, so
   * the email stays in the message, and the card is asked for again in a moment.
   */
  emailUnchecked: `Whether email can send here could not be checked just now. Say so, and propose it again in a moment, with its email version.`,
  /** A name and language the Library holds: the door's sentence for a twin, and where that message's versions change. */
  twin: (name: string): string =>
    `${TEMPLATE_SAME_NAME_WORDS} Say so: “${name}” in this language is in ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library}, where its versions are changed.`,
  /** The card's title: the name the door files the message under, and its language in words ("in English"). */
  title: (name: string, language: string): string =>
    `${CAMPAIGN_ROOMS.newMessage}: ${name}, in ${languageName(language)}`,
  /**
   * When its versions are ready to send: an email's and a text's once Approve files them (the card itself sends nothing,
   * and in a plan it sits among the silent steps), WhatsApp's once WhatsApp has reviewed it, in the product's voice (a
   * person reads WhatsApp, never Meta, as STARTER_LINE_WORDS say the review).
   */
  goes: (now: readonly OwnVersionChannel[], review: boolean): string => {
    const reviewed = "once WhatsApp has reviewed it (usually minutes, sometimes a day)";
    if (now.length === 0) return review ? `Its WhatsApp version is ready ${reviewed}` : "";
    return `Ready ${channelsWords(now)} once approved${review ? `; its WhatsApp version ${reviewed}` : ""}`;
  },
  /**
   * What the door filed (its answer): each version, ready, in review or as WhatsApp answered its filing (refused at once,
   * say, which is said with where it is seen), and the one it could not file, in its words.
   */
  filed: (
    name: string,
    filed: readonly { channel: ConsentChannel; state: string }[],
    refused: { channel: ConsentChannel; words: string } | null,
  ): string => {
    const said = filed.map((v) =>
      v.channel === "whatsapp"
        ? `its WhatsApp version ${whatsappFiledWords(v.state)}`
        : `its ${versionWord(v.channel)} version is ready`,
    );
    if (said.length === 0) return `“${name}” was not filed${refused ? `: ${refused.words}` : ""}`;
    const not = refused ? ` · its ${versionWord(refused.channel)} version was not filed: ${refused.words}` : "";
    return `“${name}” is in ${CAMPAIGN_ROOMS.library} — ${said.join("; ")}${not}`;
  },
  /** The undo's button: the email and text versions it deletes; none where the card writes none. */
  undo: (own: readonly OwnVersionChannel[]): string | null =>
    own.length > 0 ? `Delete its ${versionsWords(own)}` : null,
  /**
   * What the undo did: those versions deleted, and the WhatsApp version, where the door filed one, left, said so, and
   * where a person deletes it if it should go.
   */
  undone: (own: readonly OwnVersionChannel[], whatsapp: boolean): string => {
    const gone = `Its ${versionsWords(own)} ${own.length === 1 ? "is" : "are"} deleted`;
    return whatsapp
      ? `${gone}. Its WhatsApp version stays, held by WhatsApp: delete it in ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library} if it should go.`
      : gone;
  },
  /**
   * An undo refused part-way: the versions already deleted, the ones that are not, and the door's refusal; nothing deleted
   * yet, the refusal alone. Pressed again, the deleted ones are answered as they were and the rest is tried.
   */
  partlyUndone: (gone: readonly OwnVersionChannel[], left: readonly OwnVersionChannel[], refused: string): string =>
    gone.length === 0
      ? refused
      : `Its ${versionsWords(gone)} ${gone.length === 1 ? "is" : "are"} deleted; its ${versionsWords(left)} ${left.length === 1 ? "is" : "are"} not: ${refused}`,
} as const;

/** A version the door filed, as its answer and the undo's record say it: its channel, its id and its state. */
interface VersionAnswered {
  channel: ConsentChannel;
  id: string;
  state: string;
}

/** The versions an answer or a record names, each on a channel the product knows and with an id; none else. */
const versionsIn = (v: unknown): VersionAnswered[] =>
  Array.isArray(v)
    ? v
        .map(rec)
        .flatMap((x) =>
          (CONSENT_CHANNELS as readonly unknown[]).includes(x.channel) && typeof x.id === "string" && x.id
            ? [{ channel: x.channel as ConsentChannel, id: x.id, state: asText(x.state) }]
            : [],
        )
    : [];
/** An email's or a text's version: one written here, which its own door deletes. WhatsApp's is WhatsApp's. */
const writtenHere = (c: ConsentChannel): c is OwnVersionChannel => c !== "whatsapp";
/** The email and text versions an undo's record keeps, in the order its calls delete them. */
const ownKept = (u: Record<string, unknown>): OwnVersionChannel[] =>
  versionsIn(u.versions)
    .map((v) => v.channel)
    .filter(writtenHere);

/**
 * A message written for the Library from a card (the marketing manager's spec §5.2): the commit is POST templates/message
 * with the card's body, which files the email and text versions at once and sends WhatsApp's for review, every refusal
 * said before anything is filed (the card was made by the same checks). Its receipt says what the door filed and the
 * version it could not. Its undo deletes the email and text versions the door filed, one DELETE templates/versions/[id]
 * each, within ten minutes; a WhatsApp version is WhatsApp's to hold (deleting a template at Meta is a decision of its
 * own), so it is left, and the undo says so and where it is deleted by hand. Open is the Library's list, the card's door
 * before it is approved, when there is no message yet to open; Ask's rows of a message made open the message itself, at its
 * own address by name (addressOf, the templates reader).
 */
export const messageSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const name = asText(pl.name);
    const versions = rec(pl.versions);
    if (!name || Object.keys(versions).length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: "POST templates/message",
      body: {
        name,
        language: pl.language,
        category: pl.category,
        versions,
        slots: Array.isArray(pl.slots) ? pl.slots : [],
      },
    };
  },
  receipt: ({ payload: pl }, data) => {
    const d = rec(data);
    const refused = rec(d.refused);
    const not = (CONSENT_CHANNELS as readonly unknown[]).includes(refused.channel)
      ? { channel: refused.channel as ConsentChannel, words: asText(refused.words) }
      : null;
    return MESSAGE_WORDS.filed(asText(d.name ?? pl.name), versionsIn(d.versions), not);
  },
  // The first version the door filed: a broadcast and a playbook take any version's id for the message (core
  // templateValues), so a plan's send names this one. None where nothing was filed.
  made: (_p, data) => versionsIn(rec(data).versions).at(0)?.id ?? null,
  undo: {
    // The versions the card writes that an undo can delete, in the order the door files them.
    label: ({ payload }) => MESSAGE_WORDS.undo(OWN_VERSION_CHANNELS.filter((c) => rec(payload.versions)[c] != null)),
    window: "ten_minutes",
    // The email and text versions the door answered it filed, and the state of a WhatsApp version it filed beside them.
    record: (_p, data) => {
      const filed = versionsIn(rec(data).versions);
      const own = filed.filter((v) => writtenHere(v.channel)).map(({ channel, id }) => ({ channel, id }));
      if (own.length === 0) return null;
      return { versions: own, whatsapp: filed.find((v) => v.channel === "whatsapp")?.state ?? null };
    },
    call: (u) => {
      const own = versionsIn(u.versions).filter((v) => writtenHere(v.channel));
      return own.length === 0
        ? refuseWith(PROPOSAL_WORDS.noUndo)
        : own.map(
            // A version gone already (an earlier press deleted it, or a member did) is what the undo wants.
            (v): ProposalCall => ({ route: "DELETE templates/versions/[id]", params: { id: v.id }, goneIsDone: true }),
          );
    },
    receipt: (_data, u) => MESSAGE_WORDS.undone(ownKept(u), u.whatsapp != null),
    // The calls go in the order the kept versions are named, so the first `landed` of them are the ones deleted.
    partial: (u, landed, refused) => {
      const own = ownKept(u);
      return MESSAGE_WORDS.partlyUndone(own.slice(0, landed), own.slice(landed), refused);
    },
  },
  open: () => MESSAGES_ROUTE,
};
