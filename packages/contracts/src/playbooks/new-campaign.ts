/**
 * A new campaign as Ask proposes it (the 30 Oct 2026 review of the live app, item 6): whether it could reach anyone at all,
 * what stops it where it could not, in the owner's words, the card of that one thing with its door, and the campaign's own
 * card in one line. Read by the server's card builders alone (dashboard act/playbook-card.ts), apart from the playbook
 * modules the pages import, since a contracts module rides whole into every page that imports from it.
 */
import { addressOf } from "../activity/record-address";
import { audienceMembers, type CampaignHow } from "../broadcasts/broadcast-audience";
import { answeredYes } from "../broadcasts/reach-any";
import {
  channelRefuses,
  type ChannelsReady,
  HELD_ON,
  type HeldOn,
  reachFor,
  usableChannels,
} from "../broadcasts/reach-for";
import { type AskedPurpose, type MessageAbout } from "../consent/consent";
import { channelsWords, CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import { THREAD_CHANNEL_WORDS } from "../conversations/thread-channel";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { GET_YES_ROUTE } from "../people/lists/people-route";
import { saidYesTo } from "../people/person-consent";
import type { PersonRowVM } from "../people/person-row";
import { MESSAGES_ROUTE } from "../shell/address";
import { CAMPAIGN_ROOMS } from "../shell/campaign-rooms";
import { clockHour } from "../shared/clock";
import { joinWords } from "../shared/words";
import { type CampaignMessage, messageWhyNot } from "../templates/campaign-message";
import { enrolPurpose, messageAboutOfTrigger } from "./playbook-purpose";
import type { RunPlaybook } from "./playbook-reach";
import { triggerOf } from "./playbook-triggers";

/** Where the workspace's channels are connected and mended: Settings › Connections. */
const CONNECTIONS_ROUTE = addressOf({ kind: "channel" });

/**
 * What stops a new campaign from reaching anyone, an owner's to mend or a rule's: nobody has said the yes it needs; no
 * channel it goes by can carry it now (WhatsApp's payment method, no number, Meta's pause on offers to US numbers); or
 * those who said yes are all held for one reason of their own (no number, no address, a yes on another channel).
 */
export type CampaignBlock =
  | { kind: "yes"; purpose: AskedPurpose }
  | { kind: "channels"; channels: ConsentChannel[]; purpose: AskedPurpose; saidYes: number; mend: CampaignMend }
  | { kind: "held"; held: HeldOn; purpose: AskedPurpose; saidYes: number; ticks: ConsentChannel[] };

/**
 * Where what stops a campaign's channels is mended: the workspace's own setting of one (Connections: WhatsApp's payment
 * method, its number, a mailbox), its message's version of one (the Library: none written, one WhatsApp refused), or
 * nowhere, a rule (offers by text, Meta's pause on offers to US numbers).
 */
type CampaignMend = "connections" | "library" | null;

/** Where the channels that stop a campaign are mended, the workspace's setting before its message's. */
function mendOf(
  channels: readonly ConsentChannel[],
  ready: ChannelsReady,
  message: Pick<CampaignMessage, "versions"> | null,
): CampaignMend {
  const down = channels.filter((c) => !ready[c].ready);
  const messages = (c: ConsentChannel) => !!message && ready[c].why === messageWhyNot(message, c);
  if (down.some((c) => !messages(c))) return "connections";
  return down.length > 0 ? "library" : null;
}

/**
 * The channels as they will stand once what is already on its way lands: a WhatsApp version in WhatsApp's review (one on
 * file, or the one a starter's Approve files) through it, which is no no. A refused version, a missing one and the
 * workspace's own reasons stand.
 */
function readyOnceReviewed(ready: ChannelsReady, message: Pick<CampaignMessage, "versions"> | null): ChannelsReady {
  const out: ChannelsReady = { ...ready };
  const w = message?.versions.whatsapp ?? null;
  // The message's own reason laid over a number that can send (readyForMessage) is the review alone.
  const inReview = !!message && w?.status === "pending" && ready.whatsapp.why === messageWhyNot(message, "whatsapp");
  if (inReview && !ready.whatsapp.ready) out.whatsapp = { ...ready.whatsapp, ready: true, why: null };
  return out;
}

/**
 * Whether a new campaign could reach anyone, by the run's own pick (reachFor) with the yes its message needs and the
 * channels it goes by, its WhatsApp version's review aside (readyOnceReviewed). A channel it goes by that could not be
 * checked just now leaves it unjudged: a check not made is never a no. Not by who
 * its moment names today, which moves by the day: by everyone, or by its list's members for a campaign on a list. An
 * appointment's moment names the people its bookings bring, so only its channels can stop it; and an empty book stops
 * nothing, since nothing in it says who could not be reached. `block` is what stops it, null where somebody could be sent
 * it or nothing is known against it; `usable` the channels it ticks that can carry it now. Ask proposed three campaigns
 * that reached nobody, "0 people on the list said yes to messages" in each (the 30 Oct 2026 review, item 6).
 */
export function campaignReachable(
  rows: readonly PersonRowVM[],
  p: Pick<RunPlaybook, "trigger" | "channels" | "ready"> & {
    message: (Pick<CampaignMessage, "versions"> & { category: string | null }) | null;
  },
  listIds: ReadonlySet<string> | null,
): { block: CampaignBlock | null; usable: ConsentChannel[] } {
  const t = triggerOf(p.trigger);
  const purpose = enrolPurpose(t?.cls ?? "campaign", p.message);
  const about = messageAboutOfTrigger(p.trigger);
  const usable = usableChannels(purpose, { channels: p.channels, ready: p.ready, about });
  const how: CampaignHow = { channels: p.channels, ready: readyOnceReviewed(p.ready, p.message), about };
  const ticks = CONSENT_CHANNELS.filter((c) => how.channels.includes(c));
  const open = usableChannels(purpose, how);
  const closed = ticks.filter((c) => !open.includes(c));
  const named = t?.kind === "saved" ? audienceMembers([...rows], "saved", null, listIds ?? new Set<string>()) : rows;
  const yes = named.filter((r) => answeredYes(r, purpose));
  const stopped = (channels: ConsentChannel[]): { block: CampaignBlock; usable: ConsentChannel[] } => ({
    block: { kind: "channels", channels, purpose, saidYes: yes.length, mend: mendOf(channels, how.ready, p.message) },
    usable,
  });
  if (ticks.some((c) => p.ready[c].unchecked)) return { block: null, usable };
  if (open.length === 0) return stopped(closed);
  if (t?.kind === "visit" || named.length === 0) return { block: null, usable };
  if (named.some((r) => reachFor(r, purpose, how).channel !== null)) return { block: null, usable };
  if (yes.length === 0) return { block: { kind: "yes", purpose }, usable };
  // Somebody said yes, on a channel that cannot carry it now: the channel is what stops it.
  const where = closed.filter((c) => yes.some((r) => saidYesTo(r, purpose, c, about)));
  if (where.length > 0) return stopped(where);
  // Else what holds those who said yes, the most of them.
  const held = yes.map((r) => reachFor(r, purpose, how).held ?? "no_channel");
  const most = HELD_ON.map((h) => ({ h, n: held.filter((x) => x === h).length })).sort((a, b) => b.n - a.n)[0];
  return { block: { kind: "held", held: most?.h ?? "no_channel", purpose, saidYes: yes.length, ticks }, usable };
}

/** Where a message's versions are written and filed, as the Library's words name it: "Campaigns › Messages". */
const LIBRARY_PLACE = `${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library}`;

/** What holds everyone who said yes, after "2 people said yes to offers": ", and none has a number to send to". */
const YES_HELD_WORDS: Record<HeldOn, (one: boolean, ticks: readonly ConsentChannel[]) => string> = {
  no_number: (one) => (one ? ", and has no number to send to" : ", and none has a number to send to"),
  no_address: (one) => (one ? ", and has no email address on file" : ", and none has an email address on file"),
  address_stopped: (one) => `, and mail no longer reaches ${one ? "their address" : "their addresses"}`,
  stopped: (one) => `, and ${one ? "has" : "all have"} since asked not to hear from you`,
  unsubscribed: (one) => `, and ${one ? "has" : "all have"} since unsubscribed from offers by email`,
  no_yes: (_one, ticks) => `, but not ${channelsWords(ticks)}`,
  no_channel: (one) => `, but ${one ? "can't" : "none can"} be reached here`,
};

/**
 * Why a campaign's channels stop it, each channel's own reason once: one that cannot send says why (WhatsApp's payment
 * method in Meta's words, as Connections says it); one that can and never carries this kind of message says that.
 */
function channelsWhy(
  block: Extract<CampaignBlock, { kind: "channels" }>,
  o: { ready: ChannelsReady; about: MessageAbout },
): string {
  const why = block.channels.map(
    (c) =>
      (o.ready[c].ready ? channelRefuses(c, block.purpose, o.about, o.ready) : o.ready[c].why) ??
      `${THREAD_CHANNEL_WORDS[c]} can't send from here yet.`,
  );
  return [...new Set(why)].join(" ");
}

/**
 * What stops a campaign, in the owner's words, and where it is mended: Get their yes for a missing yes; each channel's
 * own reason (WhatsApp's payment method in Meta's words, as Connections says it), with Connections where the workspace's
 * own setting is the reason; "1 person said yes to offers, and has no number to send to" for a reason of theirs.
 */
export function campaignBlockWords(
  block: CampaignBlock,
  o: { ready: ChannelsReady; about: MessageAbout },
): { says: string; fix: string | null } {
  const what = block.purpose === "marketing" ? "offers" : "messages";
  if (block.kind === "yes") return { says: `Nobody has said yes to ${what} yet.`, fix: "People › Get their yes" };
  const one = block.saidYes === 1;
  const said = `${block.saidYes} ${one ? "person" : "people"} said yes to ${what}`;
  if (block.kind === "held") return { says: `${said}${YES_HELD_WORDS[block.held](one, block.ticks)}.`, fix: null };
  const why = channelsWhy(block, o);
  return {
    says: block.saidYes > 0 ? `${said}, but ${one ? "can't" : "none can"} be reached now. ${why}` : why,
    fix: block.mend === "connections" ? "Settings › Connections" : block.mend === "library" ? LIBRARY_PLACE : null,
  };
}

/** A channel as a fix card's title names it: "Fix WhatsApp first", "Fix texting first". */
const FIX_CHANNEL_WORDS: Record<ConsentChannel, string> = { whatsapp: "WhatsApp", sms: "texting", email: "email" };

/** The first sentence of a reason: what a fix card's line says of it, the rest being Connections' or the Library's. */
const firstSentence = (s: string): string => {
  const end = s.search(/[.!?](\s|$)/);
  return end < 0 ? s : s.slice(0, end + 1);
};

/**
 * A campaign that would reach no one, where what stops it is the owner's to mend on a page (a missing yes, a channel the
 * workspace cannot send on, a version of its message WhatsApp refused): one card of that one thing, its line in the
 * owner's words naming the campaign it stops, and the door to where it is mended (the 30 Oct 2026 review, item 6: "say
 * that one thing as the card, with the door that fixes it, not a campaign to approve"). Null where no page mends it (a
 * rule such as Meta's pause on offers to US numbers, or a reason of each person's own): the model is told it instead.
 */
export function campaignFixCard(
  block: CampaignBlock,
  o: { ready: ChannelsReady; about: MessageAbout; campaign: string },
): { title: string; line: string; summary: string; door: { label: string; to: string } } | null {
  const { fix } = campaignBlockWords(block, o);
  const stops = `the “${o.campaign}” campaign would reach no one`;
  const placed = (line: string): string => `${line} It is fixed under ${fix ?? ""}.`;
  if (block.kind === "yes") {
    const what = block.purpose === "marketing" ? "offers" : "messages";
    const line = `Nobody has said yes to ${what} yet, so ${stops}.`;
    return {
      title: `Get their yes to ${what}`,
      line,
      summary: placed(line),
      door: { label: "Get their yes", to: GET_YES_ROUTE },
    };
  }
  if (block.kind !== "channels" || block.mend === null) return null;
  const why = firstSentence(channelsWhy(block, o));
  const line = `${why} Until then ${stops}.`;
  const names = joinWords(block.channels.map((c) => FIX_CHANNEL_WORDS[c]));
  return block.mend === "connections"
    ? {
        title: `Fix ${names} first`,
        line,
        summary: placed(line),
        door: { label: "Open Connections", to: CONNECTIONS_ROUTE },
      }
    : {
        title: `Fix the message's ${names} version first`,
        line,
        summary: placed(line),
        door: { label: `Open ${CAMPAIGN_ROOMS.library}`, to: MESSAGES_ROUTE },
      };
}

/**
 * A new campaign in one line, as Today's row says Ask's card for it (the 30 Oct 2026 review, item 6: each card was one
 * run-on paragraph of its rules): what it does and to whom, when, and how it goes now. "Reminds tomorrow's 4 meetings,
 * 10:00 AM, by text and by email". Where its moment names nobody today it says what it does to each as they come: "Reminds
 * everyone the day before their meeting, 10:00 AM, by email". `pool` is who the moment names now and `will` who of them a run
 * reaches (playbookRunReach, uncapped); `goesBy` the channels it goes by now. Its cap, its week's limit, its message and
 * its mode are its sheet's, behind Details.
 */
export function campaignLine(c: {
  trigger: string;
  word: AppointmentWord;
  list: string | null;
  pool: number;
  will: number;
  run_hour: number;
  cadence_days: number;
  goesBy: readonly ConsentChannel[];
}): string {
  const W = appointmentWords(c.word);
  const n = c.will;
  // "4", or "2 of 4" where some the moment names cannot be reached.
  const of = n < c.pool ? `${n} of ${c.pool}` : `${n}`;
  const people = `${of} ${(n < c.pool ? c.pool : n) === 1 ? "person" : "people"}`;
  const appointments = `${(n < c.pool ? c.pool : n) === 1 ? W.one : W.many}`;
  const does = (() => {
    switch (c.trigger) {
      case "visit_tomorrow":
        return n > 0
          ? `Reminds ${n < c.pool ? `${n} of ` : ""}tomorrow's ${c.pool} ${appointments}`
          : `Reminds everyone the day before their ${W.one}`;
      case "visited":
        return n > 0
          ? `Follows up ${n < c.pool ? `${n} of ` : ""}yesterday's ${c.pool} ${appointments}`
          : `Follows up with everyone the day after their ${W.one}`;
      case "quiet_30":
        return n > 0 ? `Invites back ${people} quiet for 30 days` : "Invites back anyone quiet for 30 days";
      case "lapsed":
        return n > 0
          ? `Invites back ${people} with no ${W.one} in 45 days`
          : `Invites back anyone with no ${W.one} in 45 days`;
      case "everyone_monthly":
        return n > 0 ? `Sends the month's offer to ${people}` : "Sends the month's offer to everyone who said yes";
      case "saved_list":
        return n > 0 ? `Sends to ${people} on ${c.list ?? "the list"}` : `Sends to everyone on ${c.list ?? "the list"}`;
      case "proposal_waiting":
        return n > 0
          ? `Follows up ${of} ${(n < c.pool ? c.pool : n) === 1 ? "proposal" : "proposals"} waiting on an answer`
          : "Follows up each proposal left waiting on an answer";
      default:
        return `${triggerOf(c.trigger)?.label ?? "Sends"} to ${people}`;
    }
  })();
  const at = clockHour(c.run_hour);
  const kind = triggerOf(c.trigger)?.kind;
  const when =
    kind === "visit"
      ? at
      : c.trigger === "everyone_monthly"
        ? `every ${c.cadence_days} days at ${at}`
        : `daily at ${at}`;
  const by = channelsWords(c.goesBy);
  return `${does}, ${when}${by ? `, ${by}` : ""}`;
}

/**
 * Who a new campaign reaches, where its moment names nobody now, as its sheet's Reaches row says it: "Nobody has a meeting
 * tomorrow". It said "0 people on the list said yes to messages" there, of a day with no meeting on the calendar.
 */
export function nobodyNamedWords(trigger: string, word: AppointmentWord, list: string | null): string {
  const W = appointmentWords(word);
  switch (trigger) {
    case "visit_tomorrow":
      return W.noneTomorrow;
    case "visited":
      return W.noneYesterday;
    case "quiet_30":
      return "Nobody has gone quiet for 30 days";
    case "lapsed":
      return `Nobody has gone 45 days without ${W.a}`;
    case "saved_list":
      return `Nobody is on ${list ?? "the list"} yet`;
    case "proposal_waiting":
      return "No proposal is waiting on an answer";
    default:
      return "Nobody to send to yet";
  }
}
