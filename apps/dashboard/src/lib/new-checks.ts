/**
 * What New's draft says of who hears it and what Ask checked (decision 0065), worked out from Campaigns' own counts: who
 * it reaches on the channels it goes by, why nobody can where nobody can, a sequence already on the same moment or list,
 * and the checks before Start. The server's draft says it as Ask answers (server/campaigns/sequences/draft-judge.ts), and New's page
 * says it again whenever the owner changes who, how or the message (step 7), so a draft never speaks of a choice it no
 * longer holds, as the send screen recounted on every draw. Pure, and safe in the browser.
 */
import {
  CONSENT_CHANNELS,
  NEW_WORDS,
  REACH_OUT_GAP_FIRST,
  WHATSAPP_VERSION_ALONE,
  channelChoices,
  channelNeverCarries,
  messageAboutOfTrigger,
  noVersionWords,
  readyForMessage,
  type AskedPurpose,
  type ChannelsReady,
  type ConsentChannel,
  type DraftWho,
  type NewCheck,
  type NewDraftDto,
  type NewKind,
  type NewMessage,
  type NewNobody,
  type NewReach,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import { readingFor, type PoolRead } from "./campaign-channels";

/** A search's leads as New counts them: those ready to write to, and the addresses still being checked. */
export interface NewSearchCount {
  id: string;
  ready: number;
  checking: number;
}

/**
 * Campaigns' counts a draft is read against: each moment's, list's and everyone's pool by its key (the moment's trigger,
 * the list's token, `everyone_monthly`, as GET playbooks keys them), and the searches.
 */
export interface NewCounts {
  pools: Readonly<Record<string, PoolRead | null | undefined>> | null;
  searches: readonly NewSearchCount[];
}

/** A sequence that runs, as a twin is found among them: what it starts on. */
export interface NewRunning {
  id: string;
  name: string;
  starts: string;
  trigger: string | null;
  list: string | null;
  search: string | null;
}

/** The sequences that run (not ended), each by what it starts on: a moment, a list's token, a search. */
export function runningOf(rows: readonly SequenceRowDto[]): NewRunning[] {
  return rows
    .filter((r) => r.state !== "ended")
    .map((r) => ({
      id: r.id,
      name: r.name,
      starts: r.starts,
      trigger: r.first?.trigger ?? null,
      list: r.first?.list_key ? `seg:${r.first.list_key}` : r.first?.list_id ? `list:${r.first.list_id}` : null,
      search: r.first?.source_search_id ?? r.first?.search_id ?? null,
    }));
}

/** A sequence already on the same moment, list or search: a second would double it. */
export function twinOf(who: DraftWho | null, running: readonly NewRunning[]): { id: string; name: string } | null {
  if (!who) return null;
  const r = running.find((x) =>
    who.kind === "moment"
      ? x.starts === "moment" && x.trigger === who.trigger
      : who.kind === "list"
        ? x.starts === "list" && x.list === who.token
        : who.kind === "search" && x.starts === "leads" && x.search === who.id,
  );
  return r ? { id: r.id, name: r.name } : null;
}

type Reading = NonNullable<ReturnType<typeof readingFor>>;

/** Who of those a pool names it leaves out, the most said once: a stop, no yes, no number. */
function leftOf(r: Reading): string | null {
  const R = NEW_WORDS.reach;
  const why = [
    { n: r.stopped, say: R.saidStop },
    { n: r.noYes, say: R.neverYes },
    { n: r.noNumber, say: R.noNumber },
  ].sort((x, y) => y.n - x.n)[0];
  return why && why.n > 0 ? why.say(why.n) : null;
}

/**
 * Why nobody can hear it, where nobody can, by its cure: everyone it reaches heard from you this week; no channel it goes
 * by can carry it; those who said yes can't be reached; nobody said yes.
 */
function nobodyOf(r: Reading): { nobody: NewNobody; said_yes?: number } {
  if (r.held > 0) return { nobody: "breath" };
  const said = r.saidYes > 0 ? { said_yes: r.saidYes } : {};
  if ((r.no_channel ?? 0) > 0) return { nobody: "no_channel", ...said };
  return r.saidYes > 0 ? { nobody: "no_reach", ...said } : { nobody: "no_yes" };
}

/** How a draft goes, as its reach is counted for: what it is, its channels, and its first message's yes. */
interface ReachHow {
  kind: NewKind;
  channels: readonly ConsentChannel[];
  offer: boolean;
}

/**
 * Who it reaches now, where the workspace counted it, on the channels it goes by (Campaigns' pools, as a run counts them):
 * how many can hear it of how many it names, who it leaves out, who the week's breath holds back, each channel's share,
 * and, where nobody can, why. Everyone is counted for what a yes to offers hears (the month's offer's pool), and a list by
 * its yes to offers too (GET playbooks counts a list as a campaign's), so a message about their visit sent to everyone, or
 * news sent once to a list, is not counted here: no number is said rather than the wrong yes's. Where its WhatsApp words
 * are new, everyone is still counted: the send waits for WhatsApp's yes (core whatsapp-wait.ts), and nobody is left out
 * for it. A search counts its ready leads, and the addresses still being checked.
 */
export function newReachOf(who: DraftWho | null, counts: NewCounts, how: ReachHow): NewReach | null {
  if (!who) return null;
  if (who.kind === "search") {
    const s = counts.searches.find((x) => x.id === who.id);
    return s ? { can: s.ready, of: null, left: s.checking > 0 ? NEW_WORDS.reach.checking(s.checking) : null } : null;
  }
  if (who.kind === "leads") return { can: who.ids.length, of: null, left: null };
  if (who.kind === "list" && how.kind === "once" && !how.offer) return null;
  const key =
    who.kind === "moment" ? who.trigger : who.kind === "list" ? who.token : how.offer ? "everyone_monthly" : null;
  const pool = key ? counts.pools?.[key] : null;
  // The channels it goes by: none is none (no channel can carry it here), never a playbook's WhatsApp alone.
  const r = readingFor(pool, how.channels);
  if (!r) return null;
  return {
    can: r.candidates,
    of: r.pool > r.candidates ? r.pool : null,
    left: leftOf(r),
    ...(r.held > 0 ? { held: r.held } : {}),
    ...(r.by_channel ? { by: r.by_channel } : {}),
    ...(r.candidates === 0 ? nobodyOf(r) : {}),
  };
}

/** How a draft goes, read off the draft: what it is, its channels, and its first message's yes. */
export const reachHowOf = (d: Pick<NewDraftDto, "kind" | "channels" | "steps">): ReachHow => ({
  kind: d.kind,
  channels: d.channels,
  offer: !!d.steps[0]?.message?.offer,
});

/** A message's purpose, as consent reads it: an offer is marketing, anything else a conversation. */
export const messagePurposeOf = (m: Pick<NewMessage, "offer"> | null | undefined): AskedPurpose =>
  m?.offer ? "marketing" : "conversational";

/**
 * The channels a message can go by for what it is: those it holds a version for, never a text for an offer (contracts
 * channelNeverCarries). What a draft ticks, what the checks name and what a cure door offers are of these alone.
 */
export const carriersOf = (m: Pick<NewMessage, "channels" | "offer">): ConsentChannel[] =>
  m.channels.filter((c) => channelNeverCarries(c, messagePurposeOf(m)) === null);

/** A draft's message as far as its channels read it: what it is written for, and whether it is an offer. */
type DraftMessage = Pick<NewMessage, "channels" | "offer">;

/** A draft's message as the send door reads a message's versions: one on each channel it is written for, ready to go. */
const versionsOf = (message: DraftMessage) => ({
  versions: {
    whatsapp: message.channels.includes("whatsapp") ? WHATSAPP_VERSION_ALONE.versions.whatsapp : null,
    email: message.channels.includes("email") ? { id: "" } : null,
    sms: message.channels.includes("sms") ? { id: "" } : null,
  },
});

/**
 * How each channel stands for a draft's first message, here and now: the send door's own question, asked the door's own
 * way (contracts channelChoices over readyForMessage, the one rule). A one-off is the business's own news whatever it
 * says (core create-broadcast.ts readCampaignHowOf), and a sequence's message is about what its moment is
 * (messageAboutOfTrigger); a list's is the business's own. What New ticks, what its picker offers, what its foot asks for
 * and what the AI's draft goes by are all read from this, so nothing is ticked here that the send then refuses (the
 * review of 15 Nov 2026: New asked only whether the channel was connected, and an offer's WhatsApp from a US number, or
 * news by email while offers by email are off, was ticked and refused at Send). One thing is New's own: a channel the
 * message is not written for says that (contracts noVersionWords), whatever the workspace could connect there, since
 * connecting it would open nothing, and a business that sends by email alone is never sent to connect a number. With
 * no message yet (`null`), each answer is what the workspace can do for a message that is no offer.
 */
export function draftChoicesOf(
  draft: Pick<NewDraftDto, "kind" | "who">,
  message: DraftMessage | null,
  workspace: ChannelsReady,
) {
  const held = message ?? { channels: [...CONSENT_CHANNELS], offer: false };
  const about =
    draft.kind === "sequence" && draft.who?.kind === "moment" ? messageAboutOfTrigger(draft.who.trigger) : "ours";
  return channelChoices(readyForMessage(workspace, versionsOf(held)), messagePurposeOf(held), about).map((choice) =>
    choice.rule || held.channels.includes(choice.channel)
      ? choice
      : { ...choice, ok: false, why: noVersionWords(choice.channel), mend: null },
  );
}

/** The channels a draft's first message can go by now (draftChoicesOf): what it is ticked to. */
export function draftOpenOf(
  draft: Pick<NewDraftDto, "kind" | "who">,
  message: DraftMessage,
  workspace: ChannelsReady,
): ConsentChannel[] {
  return draftChoicesOf(draft, message, workspace)
    .filter((choice) => choice.ok)
    .map((choice) => choice.channel);
}

/**
 * The channels the AI's draft goes by (server/campaigns/sequences/draft-judge.ts): draftOpenOf where the workspace's
 * channels were read, so it ticks no offer's email where offers by email are off and no offer's WhatsApp from a US
 * number; where they were not, what the message is written for that the workspace sends on (`ready`), as before.
 */
export function draftGoesBy(
  draft: Pick<NewDraftDto, "kind" | "who">,
  message: DraftMessage,
  read: { channels?: ChannelsReady | null | undefined; ready: readonly ConsentChannel[] },
): ConsentChannel[] {
  return read.channels
    ? draftOpenOf(draft, message, read.channels)
    : carriersOf(message).filter((channel) => read.ready.includes(channel));
}

/** How each channel a draft's first message is written for stands here now (draftChoicesOf). */
export function heldChoicesOf(draft: Pick<NewDraftDto, "kind" | "who" | "steps">, workspace: ChannelsReady) {
  const first = draft.steps[0]?.message;
  return first
    ? draftChoicesOf(draft, first, workspace).filter((choice) => first.channels.includes(choice.channel))
    : [];
}

/**
 * Where a person's draft goes by nothing because none of the ways its first message is written for is open here (so How
 * has nothing to tick): the channel to connect, where connecting one opens a way; else why, in the reason the rule gives
 * (one the business can mend first, then one that waits, then a rule's), which asks nothing where nothing can be done.
 * Null where one is open, or nothing is picked yet.
 */
export function noWayOf(
  draft: Pick<NewDraftDto, "audience" | "channels" | "kind" | "who" | "steps">,
  workspace: ChannelsReady,
): { connect: ConsentChannel } | { why: string } | null {
  if (draft.audience !== "people" || draft.channels.length > 0) return null;
  const choices = heldChoicesOf(draft, workspace);
  if (choices.length === 0 || choices.some((choice) => choice.ok)) return null;
  const connect = choices.find((choice) => choice.mend === "connect");
  if (connect) return { connect: connect.channel };
  const closed = choices.find((choice) => choice.mend !== null) ?? choices.find((choice) => !choice.rule) ?? choices[0];
  return closed?.why ? { why: closed.why } : null;
}

const CHANNEL_SAID: Record<ConsentChannel, string> = { whatsapp: "WhatsApp", email: "email", sms: "text" };

/** What Ask checked of a step's message: one Ask wrote waits on Meta's review; one the workspace holds goes today. */
function stepChecks(
  d: Pick<NewDraftDto, "audience" | "steps" | "channels">,
  ready: readonly ConsentChannel[],
): NewCheck[] {
  const C = NEW_WORDS.checks;
  // The steps whose message Ask wrote, said once together: they wait on WhatsApp's read only where one has a WhatsApp version.
  const written = d.steps.flatMap((s, i) => (s.does === "message" && s.message?.written ? [i + 1] : []));
  const byWhatsApp = d.steps.some((s) => s.does === "message" && !!s.message?.written?.versions.whatsapp);
  const writtenRow: NewCheck = {
    tone: byWhatsApp ? "warn" : "ok",
    words: written.length === 1 ? C.newMessage(written[0] ?? 1) : C.newMessages(written),
    detail: byWhatsApp ? C.newMessageDetail : null,
  };
  return d.steps.flatMap((s, i): NewCheck[] => {
    const n = i + 1;
    if (s.does !== "message") return [{ tone: "ok", words: C.hand(n), detail: null }];
    const m = s.message;
    if (m?.written) return n === written[0] ? [writtenRow] : [];
    // A person's first step goes by the channels the draft ticks (what can carry it), those the workspace sends on now.
    const goes = d.channels.filter((c) => ready.includes(c));
    return d.audience === "people" && i === 0 && goes.length
      ? [{ tone: "ok", words: C.canGo(n, goes.map((c) => CHANNEL_SAID[c]).join(" or ")), detail: null }]
      : [];
  });
}

/** What Ask checked, said as the draft shows it: before Start, what would double, wait, or go another way. */
export function newChecksOf(
  d: Pick<NewDraftDto, "audience" | "kind" | "steps" | "who" | "twin" | "reach" | "channels">,
  ready: readonly ConsentChannel[],
): NewCheck[] {
  const C = NEW_WORDS.checks;
  const out: NewCheck[] = [];
  const ok = (words: string, detail: string | null = null) => out.push({ tone: "ok", words, detail });
  const warn = (words: string, detail: string | null = null) => out.push({ tone: "warn", words, detail });
  if (d.who && d.kind === "sequence") {
    if (d.twin) warn(C.twin(d.twin.name), C.twinDetail);
    else ok(C.noTwin(`starts on “${d.who.label}”`));
  }
  out.push(...stepChecks(d, ready));
  const offer = !!d.steps[0]?.message?.offer;
  if (d.audience === "leads") {
    ok(C.notCustomers);
    ok(C.noFirstLink);
    // The pace the sequence is made at (00492 sequence_create_leads, decision 0077 D7), never one of its own.
    ok(C.pace(REACH_OUT_GAP_FIRST));
    if (d.kind === "once") ok(C.oneEmail, C.oneEmailDetail);
    return out;
  }
  if (d.kind === "once") {
    if (offer) ok(C.offersOnly);
    if (d.reach?.held) ok(C.breath(d.reach.held), C.breathDetail);
    const byEmail = d.reach?.by?.email ?? 0;
    if (offer && byEmail > 0) ok(C.byEmail(byEmail), C.byEmailDetail);
  } else ok(C.stops, C.stopsDetail);
  return out;
}
