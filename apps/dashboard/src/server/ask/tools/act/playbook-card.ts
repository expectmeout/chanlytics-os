/**
 * What a new campaign's card says beside its moment (propose_sequence's action moment, act/playbook.ts): who a run of
 * it reaches now and on which channels, the month's allowance, its class's mode and its trial, and its moment in the
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
  PLAYBOOK_VETO_DELAY_WORDS,
  channelRefuses,
  dealPaceOf,
  heldBackOfOneRun,
  playbookRunReach,
  proposalChannelsWords,
  runReadingOf,
  saidYesWords,
  triggerWords,
  type triggerOf,
  type AskCardSheet,
  type AskedPurpose,
  type CampaignHow,
  type CampaignMessage,
  type ConsentChannel,
  type ListRef,
  type MessageAbout,
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
import { AUDIENCES_CALL, touchesThisWeek, whatsappHow, type ToolContext } from "../context";

/** What a run does under each mode, in the card's words (also the change card's, act/playbook-change.ts). */
export const MODE_WORDS: Record<string, string> = {
  auto: "each run sends on its own",
  veto: `each run sends ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it`,
  ask: "each run waits for you on Today",
  never: "nothing runs until the class is changed",
};

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
export function yesSaid(purpose: AskedPurpose, drawn: { reach: RunReach; saidYes: number }, how: CampaignHow): string {
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
 * Whether a new campaign starts on trial (D5): only where its class sends on its own (auto). Under ask, veto or never a
 * trial changes nothing: a run there waits for a person, waits for a Stop already, or runs nothing. The payload carries
 * the flag and no instant: the week starts at its Approve, counted by POST playbooks at its own clock (contracts
 * newCampaignTrialUntil), never when the card was made. And what the card says of it, before its class's mode and in the
 * order they happen: "…waits 30 minutes with a Stop; after that, under “Offers” (auto): each run sends on its own."
 */
export function trialOf(mode: string): { payload: { trial?: true }; said: string } {
  return mode === "auto"
    ? { payload: { trial: true }, said: `${PLAYBOOK_CARD_WORDS.trial}; after that, ` }
    : { payload: {}, said: "" };
}

/**
 * Who a new playbook's run reaches now, and who its moment names said the yes it needs, as the page's pools count them
 * (audience.ts poolList over the pool; the week's touches and a proposal's follow-ups by poolTouches, as triggerPools
 * reads them; a proposal's pace), with the workspace's autonomy rows; or why not, in the model's words. `message` is the
 * yes its words need; `how` the channels it goes by, the workspace ready on them or not: a run holds the people it cannot
 * reach there. `cap` is the campaign's own cap_per_run: `reading` carries who one run of it reaches on each channel, read
 * off the same draw (contracts runReadingOf), what the month's allowance is held against.
 */
export async function reachNow(
  t: ToolContext,
  trig: Trigger,
  listRef: ListRef | null,
  message: { category: string | null },
  how: CampaignHow,
  cap: number,
) {
  const deal = trig.kind === "deal";
  const [pool, policies, paceRead, followUps, touched] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    // The autonomy modes, the turn's one read of them (readers/facts.ts policies, as GET playbooks reads them). Unread is
    // null, never a guess: a card that guessed "ask" under an auto class said its runs wait for a person, and its Approve
    // started it with no trial week, sending on its own from its first run.
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
  // Everyone the moment reaches now, uncapped (the page's count), with the yes its message needs and its moment's: the
  // check held the two to agree, so the stricter is either.
  const drawn = playbookRunReach(
    pool.rows,
    { trigger: trig.id, cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0, message, ...how },
    poolTouches(touched, followUps, t.now),
    t.now.getTime(),
    dealPaceOf(paceRead),
    listed.ids,
  );
  return { drawn, reading: runReadingOf(drawn, trig.id, [cap]), policies, listLabel: listed.label };
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

/** The class a playbook's runs go under, its mode and what a run does under it, as a card ends. */
export function underMode(cls: PlaybookInput["policy_class"], policies: readonly { class: string; mode: string }[]) {
  const mode = policies.find((r) => r.class === cls)?.mode ?? "ask";
  return { mode, said: `under “${PLAYBOOK_CLASS_LABEL[cls]}” (${mode}): ${MODE_WORDS[mode] ?? mode}.` };
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
    { label: "Runs", value: p.runs },
    { label: "One a week", value: p.breath },
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
