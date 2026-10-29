/**
 * What New's draft says of who hears it and what Ask checked (decision 0065), worked out from Campaigns' own counts: who
 * it reaches on the channels it goes by, why nobody can where nobody can, a sequence already on the same moment or list,
 * and the checks before Start. The server's draft says it as Ask answers (server/sequences/draft-judge.ts), and New's page
 * says it again whenever the owner changes who, how or the message (step 7), so a draft never speaks of a choice it no
 * longer holds, as the send screen recounted on every draw. Pure, and safe in the browser.
 */
import {
  NEW_WORDS,
  REACH_OUT_GAP_FIRST,
  channelNeverCarries,
  type AskedPurpose,
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

/** How a draft goes, as its reach is counted for: what it is, its channels, and its first message's yes and review. */
interface ReachHow {
  kind: NewKind;
  channels: readonly ConsentChannel[];
  offer: boolean;
  /** Its WhatsApp version is new (Ask wrote it): who hears only WhatsApp is left out until Meta approves it. */
  review: boolean;
}

/**
 * Who it reaches now, where the workspace counted it, on the channels it goes by (Campaigns' pools, as a run counts them):
 * how many can hear it of how many it names, who it leaves out, who the week's breath holds back, each channel's share,
 * and, where nobody can, why. Everyone is counted for what a yes to offers hears (the month's offer's pool), and a list by
 * its yes to offers too (GET playbooks counts a list as a campaign's), so a message about their visit sent to everyone, or
 * news sent once to a list, is not counted here: no number is said rather than the wrong yes's. Where its WhatsApp
 * version is new, who hears it only by WhatsApp, whom a send before Meta approves it leaves out. A search counts its
 * ready leads, and the addresses still being checked.
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
  const others = how.channels.filter((c) => c !== "whatsapp");
  const without = others.length ? (readingFor(pool, others)?.candidates ?? r.candidates) : 0;
  const only = how.review && how.channels.includes("whatsapp") ? Math.max(0, r.candidates - without) : 0;
  return {
    can: r.candidates,
    of: r.pool > r.candidates ? r.pool : null,
    left: leftOf(r),
    ...(r.held > 0 ? { held: r.held } : {}),
    ...(r.by_channel ? { by: r.by_channel } : {}),
    ...(only > 0 ? { only_whatsapp: only } : {}),
    ...(r.candidates === 0 ? nobodyOf(r) : {}),
  };
}

/** How a draft goes, read off the draft: what it is, its channels, and its first message's yes and review. */
export const reachHowOf = (d: Pick<NewDraftDto, "kind" | "channels" | "steps">): ReachHow => {
  const first = d.steps[0]?.message ?? null;
  return { kind: d.kind, channels: d.channels, offer: !!first?.offer, review: !!first?.written?.versions.whatsapp };
};

/** A message's purpose, as consent reads it: an offer is marketing, anything else a conversation. */
export const messagePurposeOf = (m: Pick<NewMessage, "offer"> | null | undefined): AskedPurpose =>
  m?.offer ? "marketing" : "conversational";

/**
 * The channels a message can go by for what it is: those it holds a version for, never a text for an offer (contracts
 * channelNeverCarries). What a draft ticks, what the checks name and what a cure door offers are of these alone.
 */
export const carriersOf = (m: Pick<NewMessage, "channels" | "offer">): ConsentChannel[] =>
  m.channels.filter((c) => channelNeverCarries(c, messagePurposeOf(m)) === null);

const CHANNEL_SAID: Record<ConsentChannel, string> = { whatsapp: "WhatsApp", email: "email", sms: "text" };

/** What Ask checked of a step's message: one Ask wrote waits on Meta's review; one the workspace holds goes today. */
function stepChecks(
  d: Pick<NewDraftDto, "audience" | "steps" | "channels">,
  ready: readonly ConsentChannel[],
): NewCheck[] {
  const C = NEW_WORDS.checks;
  return d.steps.flatMap((s, i): NewCheck[] => {
    const n = i + 1;
    if (s.does !== "message") return [{ tone: "ok", words: C.hand(n), detail: null }];
    const m = s.message;
    if (m?.written)
      return [
        { tone: "warn", words: C.newMessage(n), detail: m.written.versions.whatsapp ? C.newMessageDetail : null },
      ];
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
