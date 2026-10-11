/**
 * Campaigns' cards: a broadcast, a playbook that sends on its own, the channels a playbook goes by, a playbook that
 * exists changed in place (paused, resumed, renamed or retimed), a playbook's run that waits for a person, and a message
 * written for the Library, a version per channel.
 */
import { CHANNEL_WORDS } from "../broadcasts/reach-for";
import { goesToOf, heardWords } from "../broadcasts/run-words";
import {
  CONSENT_CHANNELS,
  CONSENT_CHANNEL_WORDS,
  channelsWords,
  type ConsentChannel,
} from "../consent/consent-channels";
import { LIFECYCLE_TOAST, LIFECYCLE_WORDS, channelsGoesByWords } from "../playbooks/lifecycle/lifecycle-words";
import { PLAYBOOK_PATCH_CLEARS, PLAYBOOK_PATCH_KEYS } from "../playbooks/playbook-patch";
import { SENDING_HOURS_WORDS } from "../playbooks/playbook-triggers";
import { clockWhen } from "../shared/clock";
import { plural } from "../shared/words";
import { CAMPAIGN_ROOMS, LIBRARY_STARTER_WORDS, LIBRARY_WORDS } from "../shell/campaign-rooms";
import { MESSAGE_BEGIN_WORDS } from "../templates/campaign-message";
import {
  OWN_VERSION_CHANNELS,
  VERSION_CHANNEL_WORDS,
  type OwnVersionChannel,
  type VersionChannel,
} from "../templates/message-versions";
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
 * Why a new campaign's card is not made (propose_campaign's action playbook), said to the model with what to do about
 * it. `from` is the call that names what the workspace holds, its messages and its lists, as the tool calls it.
 */
export const PLAYBOOK_CARD_REFUSALS = {
  /** A typed slot the proposal gave no words for: a question for the person. */
  typedSlot: (label: string): string =>
    `this template takes typed words for “${label}”; ask the person what to say there, then propose again with params`,
  value:
    "each value is text, or @first_name, @business_name, @booking_link or @review_link, or @visit_when or @visit_service on a reminder or a check after an appointment, or @proposal_link on the proposal follow-up",
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
  /** A second running campaign on the same moment, list and message, where they named none of its own (D9). */
  twin: (name: string): string =>
    `“${name}” already runs on this moment with this message: say so, and propose a second only when they ask for another by a name of its own`,
  followUpsUnread: "who already had a proposal follow-up could not be read just now; say so, and try again in a moment",
  /** The week's breath: every message sent this week, a member's own too, holds its person, so the count waits on it. */
  weekUnread: "who was messaged this week could not be read just now; say so, and try again in a moment",
  trigger: (triggers: readonly string[]): string => `trigger must be one of ${triggers.join(", ")}`,
  listToken: (from: string): string =>
    `a playbook on a list needs list: the list's token from ${from} (seg:<id> or list:<id>)`,
  templateId: (from: string): string =>
    `template_id must be an id ${from} returned, or omitted for the trigger's starter`,
} as const;

/** What a new campaign's card says beside its moment, its reach and its class's mode (propose_campaign.playbook). */
export const PLAYBOOK_CARD_WORDS = {
  /**
   * A campaign that starts on trial (D5: under an auto class only): for its first week, counted from its Approve
   * (contracts newCampaignTrialUntil, at the route's clock), each run waits half an hour for a Stop, as veto's do.
   */
  trial: "on trial for a week from when you approve it: for seven days each run waits half an hour with a Stop",
  /**
   * A reminder the day before or a check after an appointment (D2): one message per appointment, sent whatever else
   * the person heard this week, since the run is daily and the appointment is on one day (contracts playbookRunReach),
   * so the week's breath, which holds every other moment, does not hold it.
   */
  appointmentBreath: "exempt from one a week per person: each goes whatever else they heard this week",
} as const;

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
    const said = heardWords(leftOut, true);
    return `Broadcast “${d.name ?? asText(pl.name)}” — ${n} ${n === 1 ? "person" : "people"}, ${ahead ? "scheduled" : "sending now"}${said ? ` · ${said}` : ""}`;
  },
  undo: {
    label: () => "Cancel it, if it has not finished",
    window: "ten_minutes",
    record: (_p, data) => ({ broadcast_id: rec(data).id, decision_id: decisionOf(data) }),
    call: cancelCall,
    receipt: canceled,
  },
  open: () => "broadcasts",
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
      // It starts on trial (D5), where the card said so: the route counts the week from the Approve, at its own clock.
      ...(pl.trial === true ? { trial: true } : {}),
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
  // The new campaign's drawer on Campaigns' home once it is made (spec 2026-10-09 §4.6, one landing rule), by the id its
  // commit kept for the undo, as the list card opens the list it made; before then the composer on its moment, where the
  // whole of it can be set by hand ("Open in the composer"), and the home where the card names no moment.
  open: ({ payload }, outcome) => {
    const id = idIn(rec(outcome?.undo), "playbook_id");
    if (id) return `campaigns/moment:${id}`;
    const trigger = idIn(payload, "trigger");
    return trigger ? `campaigns/new:moment:${trigger}` : "outbound";
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
  // Its drawer on Campaigns' home, where the Goes by row shows what it goes by now.
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? `campaigns/moment:${id}` : "outbound";
  },
};

/**
 * What a change card's commit sends: the fields it changes, and nothing else of the playbook. A null names nothing, but
 * for the two dates a null clears (PLAYBOOK_PATCH_CLEARS), so an undo of a campaign's first end writes "no end" back.
 */
const patchIn = (pl: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    PLAYBOOK_PATCH_KEYS.filter((k) => pl[k] !== undefined && (pl[k] !== null || PLAYBOOK_PATCH_CLEARS.includes(k))).map(
      (k) => [k, pl[k]],
    ),
  );

/**
 * The undo of a pause: it resumes the campaign under the mode its runs go under, so where the card read that mode as
 * `auto` it says in full that the campaign sends on its own, in the Resume ask's own sentence
 * (LIFECYCLE_WORDS.ledger.resume.auto, decision 7). Any other mode adds nothing, and a card made where the mode could not
 * be read (`mode` null) claims none. The payload's `mode` is decided where the row and the clock are, by the card's
 * builder through contracts effectiveMode (00395): a campaign on trial under an auto class is `veto` there, so its undo
 * never promises it sends on its own. This label has neither: it is written once, from the payload, when the card is made.
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
    const body = patchIn(pl);
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
      const was = patchIn(rec(u.was));
      return !asText(u.playbook_id) || Object.keys(was).length === 0
        ? refuseWith(PROPOSAL_WORDS.noUndo)
        : { route: "PUT playbooks/[id]", params: { id: asText(u.playbook_id) }, body: was };
    },
    receipt: () => "It is as it was",
  },
  // Its drawer on Campaigns, where its state, clock and name are.
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? `campaigns/moment:${id}` : "outbound";
  },
};

/**
 * When an approved run goes, as the Broadcasts page says it (bcWhenWords): now, or -- approved outside the hours a
 * message may go out in -- when they open, by the business's clock, which the card carries. The route answers when it
 * was approved (moved_from) beside when it goes, so the day is said from the moment of the approval.
 */
function runGoes(pl: Record<string, unknown>, data: unknown): string {
  const d = rec(data);
  const at = Date.parse(asText(d.scheduled_for));
  const from = Date.parse(asText(d.moved_from));
  const tz = asText(pl.timezone);
  return tz && Number.isFinite(at) && Number.isFinite(from)
    ? `scheduled for ${clockWhen(at, tz, from)} — messages go out ${SENDING_HOURS_WORDS.between} by your clock`
    : "sending now";
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
    return `${name} approved — ${plural(n, "person", "people")}, ${runGoes(pl, data)}`;
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
    return id ? `broadcasts/run:${id}` : "broadcasts";
  },
};

/* ------------------------------------------------ a message written for the Library (the marketing manager, §5.2) */

/** A channel as a sentence about a message's version names it: "WhatsApp", "email", "text". */
const versionWord = (c: VersionChannel): string =>
  c === "whatsapp" ? VERSION_CHANNEL_WORDS.whatsapp : VERSION_CHANNEL_WORDS[c].toLowerCase();
/** "email version", "email and text versions". */
const versionsWords = (own: readonly OwnVersionChannel[]): string =>
  `${own.map(versionWord).join(" and ")} version${own.length === 1 ? "" : "s"}`;

/**
 * What Ask's message card says (propose_campaign's action message). Why one is not made, to the model: each opens with the
 * sentence POST templates/message says where the door has one (its checks are the card's), then says what to do. And the
 * card's own words, to the person: its title, when each version can go, what the door filed, and what its undo does.
 */
export const MESSAGE_WORDS = {
  /** A text version of an offer: the door's sentence (contracts channelNeverCarries). */
  smsOffer: `${CHANNEL_WORDS.noOffersByText} Say so, and write the offer for WhatsApp and email alone.`,
  /** A message about their own appointment with no WhatsApp version for WhatsApp to review: the door's sentence. */
  utilityNeedsWhatsapp: `${MESSAGE_BEGIN_WORDS.customIsAnOffer} One about their own appointment or proposal is written with a WhatsApp version, which WhatsApp reviews: add one, or write it as an offer or news (marketing).`,
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
   * When its versions can go: an email's and a text's once Approve files them, WhatsApp's once WhatsApp has reviewed it,
   * in the product's voice (a person reads WhatsApp, never Meta, as STARTER_LINE_WORDS say the review).
   */
  goes: (now: readonly OwnVersionChannel[], review: boolean): string => {
    const reviewed = "WhatsApp version waits on WhatsApp's review (usually minutes, sometimes a day)";
    if (now.length === 0) return review ? `Its ${reviewed}` : "";
    return `Goes ${channelsWords(now)} now${review ? `; its ${reviewed}` : ""}`;
  },
  /** What the door filed (its answer): each version, ready or in review, and the one it could not file, in its words. */
  filed: (
    name: string,
    filed: readonly { channel: ConsentChannel; state: string }[],
    refused: { channel: ConsentChannel; words: string } | null,
  ): string => {
    const said = filed.map((v) =>
      v.channel === "whatsapp"
        ? `its WhatsApp version is ${v.state === "approved" ? "approved" : "with WhatsApp for review"}`
        : `its ${versionWord(v.channel)} version is ready`,
    );
    if (said.length === 0) return `“${name}” was not filed${refused ? `: ${refused.words}` : ""}`;
    const not = refused ? ` · its ${versionWord(refused.channel)} version was not filed: ${refused.words}` : "";
    return `“${name}” is in the ${CAMPAIGN_ROOMS.library} — ${said.join("; ")}${not}`;
  },
  /** The undo's button: the email and text versions it deletes; none where the card writes none. */
  undo: (own: readonly OwnVersionChannel[]): string | null =>
    own.length > 0 ? `Delete its ${versionsWords(own)}` : null,
  /** What the undo did: those versions deleted, and the WhatsApp version, where the door filed one, left and said. */
  undone: (own: readonly OwnVersionChannel[], whatsapp: boolean): string => {
    const gone = `Its ${versionsWords(own)} ${own.length === 1 ? "is" : "are"} deleted`;
    return whatsapp
      ? `${gone}. Its WhatsApp version stays: WhatsApp holds it, and it is deleted from ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library}`
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
 * own), so it is left, and the undo says so and where it is deleted by hand. Open is the Library, which gives one message
 * no address of its own.
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
  open: () => "messages",
};
