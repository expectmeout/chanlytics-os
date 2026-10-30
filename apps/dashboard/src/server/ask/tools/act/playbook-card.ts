/**
 * What a new campaign's card says beside its moment (propose_sequence's action moment, act/playbook.ts): who a run of
 * it reaches now and on which channels, the month's allowance, the mode it starts with (decision 0064), and its moment in the
 * workspace's word. One module for the three ways a card is made: on a message the workspace holds, on a starter its
 * Approve adds, and on the message an earlier step of Ask's plan writes. Moved whole from act/playbook.ts (11 Oct 2026,
 * which the plan's third way would have taken past 800 lines); who a run reaches is still contracts' one rule
 * (playbooks/playbook-reach.ts playbookRunReach), which this only counts with.
 */
import "server-only";
import {
  CONSENT_CHANNELS,
  NO_CHANNEL_REACH,
  PLAYBOOK_CARD_REFUSALS,
  PLAYBOOK_CARD_WORDS,
  PLAYBOOK_CLASS_LABEL,
  SEQUENCE_MODE_WORDS,
  campaignBlockWords,
  campaignFixCard,
  campaignLine,
  campaignReachable,
  channelRefuses,
  dealPaceOf,
  heldBackOfOneRun,
  newSequenceMode,
  nobodyNamedWords,
  playbookRunReach,
  proposalChannelsWords,
  runReadingOf,
  saidYesWords,
  triggerWords,
  type triggerOf,
  type AppointmentWord,
  type CampaignBlock,
  type AskCardSheet,
  type AskedPurpose,
  type CampaignHow,
  type CampaignMessage,
  type ConsentChannel,
  type ListRef,
  type MessageAbout,
  type PlaybookMessage,
  type RunReach,
  type RunReading,
} from "@chanlytics/contracts";
import { campaignHow } from "@chanlytics/core";
import { archivedListWords, poolList, type AudiencePool } from "../../../people/audience";
import { dealPaceRead } from "../../../people/deals";
import { monthSentOrNull } from "../../../campaigns/month-sent";
import { PLAYBOOK_POOL } from "../../../campaigns/playbook-pools";
import { noFollowUps, poolTouches, proposalFollowUps, type PlaybookInput } from "../../../campaigns/playbooks";
import { createBroadcastPorts } from "../../../ports/campaign-ports";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { businessShape, policies as policiesReader } from "../../../readers/facts";
import { lists as listsReader } from "../../../readers/lists";
import {
  AUDIENCES_CALL,
  propose,
  refuse,
  touchesThisWeek,
  whatsappHow,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

export type Trigger = NonNullable<ReturnType<typeof triggerOf>>;

/**
 * The people a playbook on a list runs on, as a run counts them with no one looking (audience.ts poolList over the pool
 * read for no one is what the runner does; here the pool is the member's, so a list about "me" was refused by the check).
 * One of the workspace's own lists is counted from the lists the turn holds (readers/lists.ts), never read again. Or why
 * not, in the model's words.
 */
async function listedPeople(
  t: ToolContext,
  pool: AudiencePool,
  ref: ListRef,
): Promise<{ ids: Set<string>; label: string } | { refusal: string }> {
  const kept = ref.kind === "saved" ? (await load(t.rc, listsReader, undefined)).data.lists : undefined;
  const found = await poolList(t.ctx, t.tenantId, pool, ref, kept);
  if (!found) return { refusal: PLAYBOOK_CARD_REFUSALS.noList(AUDIENCES_CALL) };
  if (found.archived) return { refusal: archivedListWords(found.label, "run") };
  if ("unknown" in found) return { refusal: PLAYBOOK_CARD_REFUSALS.uncounted(found.label, found.unknown) };
  return { ids: new Set(found.memberIds), label: found.label };
}

/**
 * How the workspace can carry a playbook proposal by the channels it names, as the card counts who a run reaches: the
 * workspace's channels now with the message's own versions laid over them (core campaignHow, which the broadcast's route
 * reads too); WhatsApp alone when it names none. A tick that cannot send yet stays on the playbook (the check refuses only
 * what its purpose never carries), so nothing is refused here.
 */
export async function playbookHow(
  t: ToolContext,
  message: Pick<CampaignMessage, "versions">,
  by: { channels: ConsentChannel[]; named: boolean },
  /** The moment's (contracts messageAboutOfTrigger): a visit's or a follow-up's message is theirs. */
  about: MessageAbout,
): Promise<CampaignHow> {
  if (!by.named) return whatsappHow(t, about);
  return (await campaignHow(createBroadcastPorts(t.ctx, t.tenantId, { fresh: false }), message, by.channels, about))
    .how;
}

/**
 * What a playbook card says of its channels, when the proposal named some: where it goes, and how many each carries
 * ("on WhatsApp and by email (52 on WhatsApp, 32 by email)"), and for each channel not ready yet that its runs hold those
 * people until it can, as it says of WhatsApp. WhatsApp's own sentence stands for a proposal that named none. `held` is
 * what the month's allowance holds back, where it goes by email or text (allowanceHeld), said after them.
 */
export function playbookChannelsSaid(
  how: CampaignHow,
  by: { channels: ConsentChannel[]; named: boolean },
  byChannel: Record<ConsentChannel, number> | undefined,
  held: string,
): { goes: string; waiting: string } {
  if (!by.named) {
    const wa = how.ready.whatsapp;
    return {
      goes: "",
      waiting: `${wa.ready ? "" : `${wa.why ?? "WhatsApp is not ready"} Its runs hold everyone until it is. · `}${held}`,
    };
  }
  const waiting = by.channels
    .filter((c) => !how.ready[c].ready)
    .map((c) => `${how.ready[c].why ?? `${c} is not ready`} Its runs hold those people until it can. · `);
  return {
    goes: ` · ${proposalChannelsWords(by.channels, reachByChannel(byChannel))}`,
    waiting: `${waiting.join("")}${held}`,
  };
}

/**
 * Who on the list said yes, as a new campaign's card says it (contracts saidYesWords): who a run reaches; and where it
 * reaches nobody, how many said the yes it needs (`saidYes`, saidYesOnAny) and what they lack: a number, or, where no
 * channel it goes by can carry it, each one's own reason (Meta's pause on offers to US numbers), else the pages' sentence
 * for no channel. It said "0 people on the list said yes to offers" over 26 who had, on a US number (the operator stress
 * run, 15 Oct 2026), and nothing of the pause.
 */
function yesSaid(purpose: AskedPurpose, drawn: { reach: RunReach; saidYes: number }, how: CampaignHow): string {
  const refused = [
    ...new Set(
      CONSENT_CHANNELS.filter((c) => how.channels.includes(c)).flatMap(
        (c) => channelRefuses(c, purpose, how.about, how.ready) ?? [],
      ),
    ),
  ];
  const noChannel = (drawn.reach.no_channel ?? 0) > 0 ? refused.join(" ") || NO_CHANNEL_REACH : null;
  return saidYesWords("the list", purpose, drawn.reach.will, drawn.saidYes, noChannel);
}

/** Who a run reaches on each channel, none where the reach said nothing of them. */
export const reachByChannel = (byChannel: Record<ConsentChannel, number> | undefined): Record<ConsentChannel, number> =>
  byChannel ?? { whatsapp: 0, sms: 0, email: 0 };

/**
 * A moment and its schedule in the workspace's word (readers/facts.ts businessShape), as the page says them: read once
 * the check has passed, so a proposal it refuses makes no read more.
 */
export async function wordedMoment(t: ToolContext, trig: Trigger) {
  const word = (await load(t.rc, businessShape, undefined)).data.word;
  return { word, moment: triggerWords(trig, word) };
}

/** What a new campaign's card says of the week's breath: an appointment moment's message is not held to it (D2). */
export const breathSaid = (trig: Trigger): string =>
  trig.kind === "visit" ? ` · ${PLAYBOOK_CARD_WORDS.appointmentBreath}` : "";

/**
 * Who a new playbook's run reaches now, and who its moment names said the yes it needs, as the page's pools count them
 * (audience.ts poolList over the pool; the week's touches and a proposal's follow-ups by poolTouches, as triggerPools
 * reads them; a proposal's pace), with the workspace's autonomy rows; or why not, in the model's words. `message` is the
 * message it sends, whose category is the yes its words need and whose WhatsApp version may be in review; `how` the
 * channels it goes by, the workspace ready on them or not: a run holds the people it cannot
 * reach there. `cap` is the campaign's own cap_per_run: `reading` carries who one run of it reaches on each channel, read
 * off the same draw (contracts runReadingOf), what the month's allowance is held against.
 */
export async function reachNow(
  t: ToolContext,
  trig: Trigger,
  listRef: ListRef | null,
  message: PlaybookMessage,
  how: CampaignHow,
  cap: number,
) {
  const deal = trig.kind === "deal";
  const [pool, policies, paceRead, followUps, touched] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    // The autonomy rows, the turn's one read of them (readers/facts.ts policies): what a new sequence of its class starts
    // as (decision 0064). Unread is null, never a guess: the card would say what its batches do on one.
    load(t.rc, policiesReader, undefined).then(
      (r) => r.data,
      () => null,
    ),
    // A proposal's moment is counted as the page counts it (0006): by the pace, less whoever had their follow-up.
    deal ? dealPaceRead(t.ctx, t.tenantId, t.now) : Promise.resolve(null),
    deal ? proposalFollowUps(t.ctx, t.tenantId, t.now).catch(() => null) : Promise.resolve(noFollowUps()),
    // Who hears from you within a week either side, sent or due, by a campaign or a member (the week's breath), the
    // page's own read of it; one that fails is said in the log (context.ts touchesThisWeek) before the card is refused below.
    touchesThisWeek(t, "propose_sequence.moment"),
  ]);
  if (!followUps) return { refusal: PLAYBOOK_CARD_REFUSALS.followUpsUnread };
  if (!touched) return { refusal: PLAYBOOK_CARD_REFUSALS.weekUnread };
  if (!policies) return { refusal: PLAYBOOK_CARD_REFUSALS.modeUnread };
  // A list's people, as a run counts them (listedPeople).
  const listed = listRef ? await listedPeople(t, pool, listRef) : { ids: null, label: null };
  if ("refusal" in listed) return listed;
  // Whether it could reach anyone at all, whenever its moment names them: a campaign nobody could be sent is no campaign
  // card (the 30 Oct 2026 review, item 6), but what stops it (blockedOutcome).
  const { block, usable } = campaignReachable(pool.rows, { trigger: trig.id, message, ...how }, listed.ids);
  if (block) return { blocked: { block, ready: how.ready, about: how.about } };
  // Everyone the moment reaches now, uncapped (the page's count), with the yes its message needs and its moment's: the
  // check held the two to agree, so the stricter is either.
  const drawn = playbookRunReach(
    pool.rows,
    {
      trigger: trig.id,
      cap_per_run: PLAYBOOK_POOL,
      gap_days: 0,
      cadence_days: 0,
      message: { category: message.category },
      ...how,
    },
    poolTouches(touched, followUps, t.now),
    t.now.getTime(),
    dealPaceOf(paceRead),
    listed.ids,
  );
  return { drawn, reading: runReadingOf(drawn, trig.id, [cap]), policies, listLabel: listed.label, usable };
}

/** What stops a campaign from reaching anyone (contracts campaignReachable), with the channels it was judged on. */
type Blocked = { block: CampaignBlock; ready: CampaignHow["ready"]; about: MessageAbout };

/**
 * A campaign that would reach no one (reachNow's `blocked`): where a page mends what stops it, one card of that one thing
 * with its door (contracts campaignFixCard), naming the campaign by the name asked or its moment's; where no page mends it
 * (a rule, a reason of each person's own), and in a plan's step, whose cards a plan presses together, the refusal, in the
 * owner's words, for the model to say.
 */
export async function blockedOutcome(
  t: ToolContext,
  trig: Trigger,
  b: Blocked,
  asked: string | null,
): Promise<ProposalOutcome> {
  const { says, fix } = campaignBlockWords(b.block, b);
  const refusal = refuse(PLAYBOOK_CARD_REFUSALS.reachesNobody(says, fix));
  if (t.step !== undefined) return refusal;
  const { moment } = await wordedMoment(t, trig);
  const card = campaignFixCard(b.block, { ready: b.ready, about: b.about, campaign: asked || moment.label });
  if (!card) return refusal;
  return propose({
    kind: "fix",
    title: card.title,
    summary: card.summary,
    line: card.line,
    payload: { trigger: trig.id, door: card.door.label, to: card.door.to },
  });
}

/**
 * Who a new campaign reaches, as its card says it: where its moment names nobody now, that day or list said as such
 * ("Nobody has a meeting tomorrow"), else who on it said the yes it needs (yesSaid). It said "0 people on the list said
 * yes to messages" of a day with no meeting on the calendar.
 */
export function reachesSaid(
  purpose: AskedPurpose,
  drawn: { reach: RunReach; saidYes: number },
  how: CampaignHow,
  at: { trigger: string; word: AppointmentWord; list: string | null },
): string {
  return drawn.reach.pool === 0 ? nobodyNamedWords(at.trigger, at.word, at.list) : yesSaid(purpose, drawn, how);
}

/**
 * A new campaign's card in one line (contracts campaignLine), as Today's row says it: what it does to whom its moment
 * names now, when, and the channels it goes by: those its people are reached on, or, where it reaches nobody today, those
 * that can carry it now (`usable`, campaignReachable's).
 */
export function cardLine(
  at: { trigger: string; word: AppointmentWord; list: string | null },
  reach: RunReach,
  clock: { run_hour: number; cadence_days: number },
  usable: readonly ConsentChannel[],
): string {
  const carrying = CONSENT_CHANNELS.filter((c) => (reach.by_channel?.[c] ?? 0) > 0);
  return campaignLine({
    ...at,
    pool: reach.pool,
    will: reach.will,
    run_hour: clock.run_hour,
    cadence_days: clock.cadence_days,
    goesBy: reach.will > 0 && carrying.length > 0 ? carrying : usable,
  });
}

/**
 * What the month's email and text allowance will hold back of one run of it at its cap, where it goes by them (A7;
 * contracts heldBackOfOneRun, the composer's own rule and sentence), with its separator; nothing while there is room,
 * where it goes by WhatsApp alone (no count is read), or where the month could not be counted.
 */
export async function allowanceHeld(
  t: ToolContext,
  channels: readonly ConsentChannel[],
  reading: RunReading,
  run: { trigger: string; cap_per_run: number },
  purpose: AskedPurpose,
): Promise<string> {
  if (!channels.some((c) => c !== "whatsapp")) return "";
  const words = heldBackOfOneRun(reading, run, await monthSentOrNull(t.tenantId, t.now), purpose);
  return words ? `${words} · ` : "";
}

/**
 * The mode a new sequence starts with (decision 0064: what its class's Autonomy row says, contracts newSequenceMode, as the
 * database's sequence_mode_for makes it) and what its batches then do, as a card ends: its first waits for the owner's OK
 * whatever the mode, and after that each goes by it. "Its first batch waits for your OK; after that, each batch waits
 * 30 minutes for you to stop it, then goes (Standing offers)." Under ask every batch waits, the first among them, so it
 * says that once: "Each batch waits for your OK (Re-engage)."
 */
export function underMode(cls: PlaybookInput["policy_class"], policies: readonly { class: string; mode: string }[]) {
  const mode = newSequenceMode(policies.find((r) => r.class === cls)?.mode, "moment");
  const does = SEQUENCE_MODE_WORDS[mode].does;
  const batches =
    mode === "ask" ? sheetWords(does) : `${sheetWords(PLAYBOOK_CARD_WORDS.asksFirst)}; after that, ${does}`;
  return { mode, said: `${batches} (${PLAYBOOK_CLASS_LABEL[cls]}).` };
}

/** A summary's piece as a sheet's row says it: no separator either side, its first letter a capital. */
export const sheetWords = (s: string): string => {
  const t = s
    .replace(/^\s*·\s*/, "")
    .replace(/\s*·\s*$/, "")
    .trim();
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
};

/** The waits a summary says, " · " between them (channelsWaitWords, allowanceHeld, a left-out line), one a sentence. */
export const holdsOf = (...said: string[]): string[] =>
  said
    .join(" · ")
    .split(" · ")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sheetWords);

/**
 * A new campaign's card as a sheet (contracts AskCardSheet), from the pieces its summary is made of, by each of its
 * makers: where it runs, when, its week's breath and its last day, how it goes, who it reaches, how it sends, and its
 * message; what holds it from sending apart, read first. A piece that is empty is no row.
 */
export function campaignSheet(p: {
  where: string;
  runs: string;
  breath: string;
  end: string;
  goes: string;
  reaches: string;
  sends: string;
  message: string;
  waiting: string[];
}): AskCardSheet {
  const rows = [
    { label: "Where", value: p.where },
    // One fact, its parts by commas: "Daily 10:00 AM, up to 25, once per person".
    { label: "Runs", value: p.runs.replaceAll(" · ", ", ") },
    // An appointment's message is not held back by the others they hear around it, in the owner's words.
    { label: "Other messages", value: p.breath },
    { label: "Last day", value: p.end },
    { label: "Goes", value: p.goes },
    { label: "Reaches", value: p.reaches },
    { label: "Sends", value: p.sends },
    { label: "Message", value: p.message },
  ]
    .map((r) => ({ label: r.label, value: sheetWords(r.value) }))
    .filter((r) => r.value);
  return { holds: holdsOf(...p.waiting), rows };
}
