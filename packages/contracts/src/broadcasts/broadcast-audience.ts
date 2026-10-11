/**
 * Who a broadcast is for: the audience kinds, who on it may receive, and the preview before sending. Moved whole from
 * broadcasts.ts (Reach out Part 2.5), which re-exports it.
 */
import { type AskedPurpose, type MessageAbout, PURPOSE_REFUSALS } from "../consent/consent";
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import { PEOPLE_LISTS } from "../people/lists/lists";
import { saidYesTo } from "../people/person-consent";
import type { PersonRowVM } from "../people/person-row";
import type { RunReach } from "../playbooks/playbooks";
import { firstNameOf } from "../templates/templates";
import { type ChannelsReady, channelRefuses, type HeldOn, reachFor, type ReachSplit, reachSplit } from "./reach-for";
import { breathSplit } from "./run-words";

export type AudienceKind = "everyone" | "list" | "saved" | "playbook";

/** The kinds a person may pick; "playbook" is the sweep's own. */
export const AUDIENCE_KINDS: readonly AudienceKind[] = ["everyone", "list", "saved"];

export interface Audience {
  kind: AudienceKind;
  /** A People list id (kind "list") or a saved list id (kind "saved"). */
  id: string | null;
  label: string;
  /**
   * A playbook's run: who its moment named and why each of the rest was left
   * out (contracts playbookRunReach), kept by the run as it was drawn. Absent
   * on a broadcast a person sent, and on a run made before runs kept it.
   */
  reach?: RunReach;
  /**
   * The list it went to, as it was counted (decision 0009, "sends remember"): its token, and its rule then -- null for
   * a list kept by hand, whose people are the recipients -- so a rule edited later never changes what a send meant.
   * Absent on everyone, and on a send made before sends kept it.
   */
  list?: { token: string; rule: unknown; counted_at: string };
  /**
   * A playbook's run: the moment it was made for (contracts PLAYBOOK_TRIGGERS), which the month's allowance asks
   * (`heldByAllowance`: a visit's message is never held by it). Absent on a broadcast, and on a run made before runs
   * kept it, which the allowance then holds as it held every run.
   */
  trigger?: string;
}

/** The moment a run's audience names, or null for a broadcast and a run that kept none (`Audience.trigger`). */
export function audienceTrigger(audience: unknown): string | null {
  const t = audience && typeof audience === "object" ? (audience as { trigger?: unknown }).trigger : null;
  return typeof t === "string" ? t : null;
}

/**
 * The audience of everyone in People, named for its pool as every other audience is ("Regulars", "Lapsed"); its
 * count is who the message reaches, and the lines under it say who said yes. It was "Everyone who said yes", which
 * beside a reach of 0 claimed nobody had, over "1 person on it said yes to offers, with no number to send to". A run
 * keeps the label it was sent under.
 */
export const EVERYONE_LABEL = "Everyone";

/**
 * What the Everyone choice says under its name in the picker. Said before any channel is ticked, so it names no number and
 * no address: who can be reached depends on the channels the send goes by, and the held lines say which of them is missing.
 */
export const EVERYONE_HINT =
  "Everyone we can reach whose yes covers the message you pick, and by email whoever has dealt with you";

/**
 * The People lists that are no audience of their own because each restates the consent filter an audience is already
 * crossed with: who said yes to messages, who said yes to offers, and who asked to stop. THE one list of them: the
 * composer leaves them out of its audiences (the dashboard's broadcasts surface), and a door reads it below.
 */
export const CONSENT_LIST_IDS: readonly string[] = ["opted_in", "offers_ok", "opted_out"];

/** Of those, the two that are a yes: a door that names one ("Broadcast to everyone who said yes") means Everyone. */
const LISTS_THAT_MEAN_EVERYONE: readonly string[] = CONSENT_LIST_IDS.filter((id) => id !== "opted_out");

/**
 * Whether a door to the composer (`campaigns/new:to:<list>`) names a list the composer does not offer now: one archived
 * or deleted since the link was made, one whose data the workspace has not switched on or could not read just now (a
 * calendar's lists, the saved lists), or a word that was never a list.
 * The composer is then on another audience (Everyone on a first draw, wherever it was on a page already open), and
 * must say so (UNKNOWN_AUDIENCE_WORDS): it was there in silence, and a message meant for a few was one press from others. False while the audiences are not read yet (null).
 */
export function doorNamesNoAudience(
  to: string | null,
  audiences: ReadonlyArray<{ kind: string; id?: string | null }> | null,
): boolean {
  if (!to || !audiences || LISTS_THAT_MEAN_EVERYONE.includes(to)) return false;
  return !audiences.some((a) => (a.kind === "saved" || a.kind === "list") && a.id === to);
}

/** What the composer says when the door it was opened by names no list it offers (doorNamesNoAudience). */
export const UNKNOWN_AUDIENCE_WORDS =
  "That list can't be messaged right now, so check who this is addressed to before you send.";

/**
 * The people a broadcast may reach: the audience crossed with mayReceive.
 * The route enrols exactly these; the page shows exactly these counts.
 *
 * The purpose is required here for the same reason it is required above -- and
 * because this is the function every caller actually reaches for.
 */
export function eligibleFor(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
  /** What kind of message this audience is for. From the template's category, never assumed. */
  purpose: AskedPurpose,
  /** The channels the send ticks and the workspace's channels now: each person is reached on one (reach-for.ts). */
  how: CampaignHow,
): PersonRowVM[] {
  return enrolFor(rows, kind, id, savedIds, purpose, how).map((e) => e.row);
}

/** The channels a campaign ticks, whether the workspace can send on each now, and what its message is about. */
export interface CampaignHow {
  channels: readonly string[];
  ready: ChannelsReady;
  /** A visit or proposal moment's message is theirs, a broadcast ours (consent.ts MessageAbout, decision D1). */
  about: MessageAbout;
}

/**
 * Who a send enrols, each with the channel it reaches them on (reachFor): the route writes exactly these, the channel
 * on each recipient's row, and the page counts exactly these.
 */
export function enrolFor(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
  purpose: AskedPurpose,
  how: CampaignHow,
): Array<{ row: PersonRowVM; channel: ConsentChannel }> {
  const out: Array<{ row: PersonRowVM; channel: ConsentChannel }> = [];
  for (const row of audienceMembers(rows, kind, id, savedIds)) {
    const p = reachFor(row, purpose, how);
    if (p.channel) out.push({ row, channel: p.channel });
  }
  return out;
}

/**
 * Whether a person said the yes this message needs on any channel the send could reach them on, a way to reach them
 * on it or not: the half of reaching them that is an answer they gave (#663's rule, per channel).
 */
export function saidYesOnAny(r: PersonRowVM, purpose: AskedPurpose, how: CampaignHow): boolean {
  return CONSENT_CHANNELS.some(
    (c) =>
      how.channels.includes(c) &&
      how.ready[c].ready &&
      channelRefuses(c, purpose, how.about, how.ready) === null &&
      saidYesTo(r, purpose, c, how.about),
  );
}

/** Why a person in an audience is not in the send, in the operator's words. */
export function heldWords(held: HeldOn, purpose: AskedPurpose): string {
  switch (held) {
    case "no_number":
      return "No phone number on file, so nothing can be sent.";
    case "no_address":
      return "No email address on file, so nothing can be sent.";
    // The address is on file and mail to it has stopped: the door's own sentence (deliver.ts email_suppressed), which
    // says to correct it.
    case "address_stopped":
      return PURPOSE_REFUSALS.email_suppressed;
    case "no_channel":
      return "No channel this message can go by here.";
    case "stopped":
      return PURPOSE_REFUSALS.opted_out;
    case "unsubscribed":
      return "They unsubscribed from offers by email. Messages about their visits and replies still reach them.";
    case "no_yes":
      return PURPOSE_REFUSALS[purpose === "marketing" ? "no_marketing_consent" : "not_opted_in"];
    default: {
      const unreachable: never = held;
      return unreachable;
    }
  }
}

/** What a person lacks for a channel to reach them at all, as the line under a send names it. */
const LACKS: Record<ConsentChannel, string> = {
  whatsapp: "no phone number",
  sms: "no phone number",
  email: "no email address that works",
};

/**
 * Who the wire holds back from a send by these channels, whatever they said, as one clause for the line under the list:
 * a stop, no way to reach them on a channel it goes by (a number, an address that works) and a person's own hand on the
 * conversation. They are heldWords' reasons said short, and the way to reach is named only for the channels ticked: a send
 * by email alone does not say "no number".
 */
export function heldBackWords(channels: readonly ConsentChannel[]): string {
  const lacks = [...new Set(CONSENT_CHANNELS.filter((c) => channels.includes(c)).map((c) => LACKS[c]))];
  const reach = lacks.length > 0 ? [`have ${lacks.join(" or ")}`] : [];
  return `people who ${["asked to stop", ...reach].join(", ")}, or are mid-thread with a person are held back at the wire`;
}

/**
 * Everyone an audience names, before anyone is left out: a list's members, a
 * saved list's people, or everyone. `eligibleFor` is these, crossed with who
 * may receive -- and a run that says who it left out counts from here.
 */
export function audienceMembers(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
): PersonRowVM[] {
  if (kind === "list") {
    const l = PEOPLE_LISTS.find((x) => x.id === id);
    return l ? rows.filter(l.test) : [];
  }
  if (kind === "saved") return savedIds ? rows.filter((r) => savedIds.has(r.id)) : [];
  return rows;
}

/**
 * A few of the people an audience really means, for a preview to walk through.
 *
 * An audience chip showed a count and nothing else, so the last thing an owner
 * saw before an irreversible send was a number: no way to see who the twenty-
 * three are, and no way to find out that three of them have no first name on
 * file and will be greeted "Hi there" (resolveParams, templates.ts). The rows
 * are already in hand -- the count is a length of exactly this list -- so this
 * takes the same pool and names a handful of it.
 *
 * The order is not the list's: an ordinary person first, then the first person
 * with no name on file if there is one, because that is the case nobody has
 * ever been shown and the one worth seeing. Anyone held back comes last, with
 * the reason in the operator's own words.
 */
export interface PreviewPerson {
  id: string;
  /** What the operator calls them: their name, or the number on file. */
  label: string;
  /** The words the wire puts in a first-name slot, or null when nothing is on file. */
  firstName: string | null;
  /** Why nothing is sent to them, in the operator's words; null when it is. */
  refusal: string | null;
  /**
   * The channel the send reaches them on (reachFor: the one they last wrote on, else the first that carries it), so a
   * preview draws the message as that channel's version; null for a person held back, who is reached on none.
   */
  channel: ConsentChannel | null;
}

export interface AudiencePreview {
  people: PreviewPerson[];
  /** Who it reaches on which channel, and who it holds and why (reach-for.ts). */
  split: ReachSplit;
  /** How many the send really reaches, and how many in the list it does not. */
  sending: number;
  held: number;
  /**
   * How many in the list said yes to what this message needs, a number to send it to or not: `sending` is those
   * with one. When nobody can be sent it, this tells the two causes apart -- nobody said yes (get their yes), or the
   * ones who did have no number, whom a door to "get their yes" would ask for an answer they gave (#663's rule).
   */
  saidYes: number;
  /**
   * How many of those it reaches heard from a playbook or a broadcast within the week (the touches a playbook's run
   * waits a week after, PLAYBOOK_BREATH_MS, split by breathSplit): a send by hand leaves them out too, unless the
   * person sending it sends to them as well, and `sending` still counts them.
   */
  heard: number;
  /**
   * The same, by the channel each was to be reached on (`split.byChannel`'s people): what the composer takes off each
   * channel while the send leaves them out (contracts reachAfterBreath).
   */
  heardBy: Record<ConsentChannel, number>;
}

function previewPerson(r: PersonRowVM, refusal: string | null, channel: ConsentChannel | null): PreviewPerson {
  return { id: r.id, label: r.name, firstName: firstNameOf(r.givenName, r.waName), refusal, channel };
}

/** Nobody touched: an audience read with no touches in hand. */
const NO_ONE: ReadonlySet<string> = new Set();

export function audiencePreview(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
  purpose: AskedPurpose,
  /** The channels the send ticks and the workspace's channels now (reach-for.ts). */
  how: CampaignHow,
  limit = 5,
  /** Who a run of any kind reached within the week (packages/db touchesSince); none when not read. */
  touched: ReadonlySet<string> = NO_ONE,
): AudiencePreview {
  const pool = audienceMembers(rows, kind, id, savedIds);
  const picks = pool.map((r) => ({ r, p: reachFor(r, purpose, how) }));
  const sending = picks.filter((x) => x.p.channel !== null);
  const held = picks.filter((x) => x.p.channel === null);
  const named = sending.filter((x) => firstNameOf(x.r.givenName, x.r.waName) !== null);
  const unnamed = sending.filter((x) => firstNameOf(x.r.givenName, x.r.waName) === null);
  // One ordinary person, then the one nobody has seen, then the rest in order, each with the channel they are reached on.
  const order = [...named.slice(0, 1), ...unnamed.slice(0, 1), ...named.slice(1), ...unnamed.slice(1)];
  const people = order.slice(0, limit).map((x) => previewPerson(x.r, null, x.p.channel));
  // Why a person in the list is not in the send, from the one place that answers it (reachFor): the strictest reason
  // the channels it may go by gave.
  for (const { r, p } of held.slice(0, 2))
    people.push(previewPerson(r, p.held ? heldWords(p.held, purpose) : null, null));
  // Who of those it reaches heard this week, the one split, counted on the channel each was to be reached on.
  const { leftOut } = breathSplit(sending, (x) => x.r.id, touched);
  const heardBy: Record<ConsentChannel, number> = { whatsapp: 0, sms: 0, email: 0 };
  for (const x of leftOut) if (x.p.channel) heardBy[x.p.channel] += 1;
  return {
    people,
    split: reachSplit(pool, purpose, how),
    sending: sending.length,
    held: held.length,
    saidYes: pool.filter((r) => saidYesOnAny(r, purpose, how)).length,
    heard: leftOut.length,
    heardBy,
  };
}
