/**
 * Who a playbook reaches: eligibility against the touches, a run's reach, and the words for a playbook that reaches
 * nobody. Moved whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { audienceMembers, type CampaignHow, saidYesOnAny } from "../broadcasts/broadcast-audience";
import { reachFor } from "../broadcasts/reach-for";
import { POLICY_CLASS_WORDS } from "../config/workspace-config/policy-classes";
import type { MatchVia } from "../calendar/calendar-people";
import { fullNameKey } from "../calendar/visit-service";
import { purposeOfPlaybook } from "../consent/consent";
import type { DealPaceVM } from "../deals/deal-waits";
import { GET_YES_ROUTE, saidYesWords } from "../people/people-lists";
import type { PersonRowVM } from "../people/person-row";

import { breathHolds, followUpIsFor, followUpNames } from "./playbook-follow-ups";
import { enrolPurpose, messageAboutOfTrigger, type RunMessage } from "./playbook-purpose";
import { localDate } from "./playbook-schedule";
import { DAY_MS } from "./playbook-time";
import { type PlaybookPolicyClass, triggerOf } from "./playbook-triggers";
import type { PlaybookDto } from "./playbooks";
import type { ConsentChannel } from "../consent/consent-channels";

/**
 * Where the Playbooks route counts one playbook on its own, in its `pools`: when its message is stricter than its
 * moment's class (enrolPurpose), its run enrols by the message's yes, so the moment's count would overstate it.
 */
export const playbookPoolKey = (id: string): string => `playbook:${id}`;

/**
 * When a person last heard from this playbook and from any playbook, and when they last had a proposal follow-up
 * from any playbook, one since deleted too (packages/db touchIndex): a follow-up is owed once per proposal (0006).
 * contact id → ms.
 */
export interface Touches {
  byThis: Map<string, number>;
  byAny: Map<string, number>;
  followUps: Map<string, number>;
}

/** A workspace's touches as a run reads them: by each playbook (its gap), by any (the week's breath), and the proposal follow-ups. */
interface WorkspaceTouches {
  byThis: Map<string, Map<string, number>>;
  byAny: Map<string, number>;
  followUps: Map<string, number>;
}

/**
 * The touches once a run has been assembled: its people were touched from the moment it goes (`at`, epoch ms), by the
 * playbook, by any, and, for a proposal's follow-up, as one had. The database's own reading of a run (packages/db
 * touchesSince) says the same; this is the same fold for the run just made, so the next playbook run against the same
 * read of the workspace -- the hourly sweep runs every due playbook of a workspace against one -- sees them, and the
 * week's breath ("one a week per person, across every moment") holds between two moments in the same hour. New maps; the
 * touches given are left as they were.
 */
export function touchesAfterRun(
  touches: WorkspaceTouches,
  run: { playbookId: string; at: number; followUp: boolean },
  people: Iterable<string>,
): WorkspaceTouches {
  const byThis = new Map(touches.byThis);
  const mine = new Map(byThis.get(run.playbookId));
  const byAny = new Map(touches.byAny);
  const followUps = new Map(touches.followUps);
  for (const id of people) {
    mine.set(id, Math.max(mine.get(id) ?? 0, run.at));
    byAny.set(id, Math.max(byAny.get(id) ?? 0, run.at));
    if (run.followUp) followUps.set(id, Math.max(followUps.get(id) ?? 0, run.at));
  }
  byThis.set(run.playbookId, mine);
  return { byThis, byAny, followUps };
}

/**
 * The people a run may reach: the trigger's list crossed with who said yes to
 * THIS KIND of message, minus anyone who heard from this playbook within its
 * gap (its cadence, for the month's offer), minus anyone who heard from any
 * playbook this week; the longest-unheard first; at most the cap.
 *
 * The purpose is the trigger's own `cls`, which every trigger has always
 * declared and which nothing has ever read. `booking` is a reminder about an
 * appointment the customer made; everything else is promotional. When the
 * playbook's message is in view (`message`), the stricter of the two holds
 * (enrolPurpose): a person its message cannot reach is not enrolled.
 *
 * That distinction fixes a real loss. `visit_tomorrow` sends the one utility
 * template in the starter library to somebody with a visit on the calendar
 * tomorrow -- and it was skipped with `not_opted_in` unless that person had
 * given marketing-grade consent. A customer who booked an appointment was not
 * reminded of it because they had never asked for offers.
 */
export function eligibleForPlaybook(
  rows: PersonRowVM[],
  p: RunPlaybook,
  touches: Touches,
  nowMs: number,
  pace: Pick<DealPaceVM, "waitDays"> | null,
  listIds: ReadonlySet<string> | null = null,
): PersonRowVM[] {
  return playbookRunReach(rows, p, touches, nowMs, pace, listIds).eligible;
}

/**
 * Who a run reaches, out of everyone its moment names, and why each of the
 * rest was left out -- each counted once, under the first rule that left them
 * out, in the order the run applies the rules. So `will` and every count
 * below add up to `pool`, and a bar of them is the whole list.
 *
 * A run recorded how many it enrolled and nothing about the rest, so the sheet
 * an owner approves it from could only list the rules that made the list:
 * never "186 of 312", never "94 never said yes" -- and the one of those an
 * owner can do something about (getting their yes) was the one it could not say.
 */
export interface RunReach {
  /** Everyone the moment names: the trigger's list, everyone, or the day's visits. */
  pool: number;
  /** Who the run reaches. */
  will: number;
  /** No number on file: WhatsApp and text both need one. */
  noNumber: number;
  /** Asked to stop, or on the do-not-contact list. */
  stopped: number;
  /** Never said yes to what this playbook sends: offers, or hearing from you. */
  noYes: number;
  /** Heard from this playbook within its gap (its cadence, for the month's offer). */
  heardThis: number;
  /** Heard from any playbook this week. */
  heardAny: number;
  /** Past the cap per run: the longest unheard go first, these next time. */
  overCap: number;
  /** Past the number's daily limit (run-playbook): named, never dropped in silence. */
  overLimit: number;
  /** No email address, where email was the only channel left (step 3). Absent on a run counted before runs kept it. */
  no_address?: number;
  /**
   * An email address on file that mail no longer goes to (it bounced, or they marked a message as spam), where email was
   * the only channel left. Absent on a run counted before.
   */
  address_stopped?: number;
  /** No channel the playbook ticks can carry its message here (step 3). Absent on a run counted before. */
  no_channel?: number;
  /** Who it reaches on each channel (step 3), adding up to `will`. Absent on a run counted before: all WhatsApp. */
  by_channel?: Record<ConsentChannel, number>;
}

/**
 * A playbook as its run reads it: its moment and limits, its message (null for a moment counted with no message in
 * view), and how it may go: the channels it ticks and the workspace's channels now (reach-for.ts). Required, as the
 * message is: no caller may count a run without saying how it would go. What its message is about is the moment's own
 * (messageAboutOfTrigger), never a caller's to say.
 */
export type RunPlaybook = Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> & {
  message: RunMessage;
} & Omit<CampaignHow, "about">;

/** The name a person is saved under, as the calendar matches it (calendar-people.ts personLikeOf): the one a human gave, else their WhatsApp name. */
const savedNameOf = (r: Pick<PersonRowVM, "givenName" | "waName">): string | null => r.givenName ?? r.waName;

/** How many of the rows hold each full saved name, by its key (calendar-people.ts fullNameKey); a name that is not a full one is not counted. */
function fullNameHolders(rows: readonly Pick<PersonRowVM, "givenName" | "waName">[]): Map<string, number> {
  const holders = new Map<string, number>();
  for (const r of rows) {
    const key = fullNameKey(savedNameOf(r));
    if (key !== null) holders.set(key, (holders.get(key) ?? 0) + 1);
  }
  return holders;
}

/**
 * Whether the visit a row was matched to is surely theirs, for a message that goes to them about it. A number or an address
 * on the event is exact: they are the person, or nobody. A name is a guess: any name of four letters or more matched, so a
 * client saved as "Maria" was sent a reminder for another Maria's appointment, with the event's whole title in it. A run
 * enrols a visit found by name alone only when the event carries the person's FULL saved name (two words or more, first and
 * last) and no one else in the workspace is saved under it; a first name alone never enrols. The receptionist says "Matched
 * by name only -- make sure it is them" (calendar-people.ts) and a person reads it; a message sent on its own cannot.
 */
function visitIsTheirs(
  r: Pick<PersonRowVM, "givenName" | "waName">,
  via: MatchVia | null,
  holders: ReadonlyMap<string, number>,
): boolean {
  if (via !== "name") return true;
  const key = fullNameKey(savedNameOf(r));
  return key !== null && holders.get(key) === 1;
}

/**
 * The run as drawn: who it reaches, its reach, and `saidYes` -- how many the
 * moment names who said the yes its messages need, a number to send to or not.
 * `reach.noNumber` cannot say that, because no number is the first rule and it
 * counts everyone without one, yes or no. A moment whose yes has no number
 * reaches nobody while somebody on it said yes (#663's rule).
 */
export function playbookRunReach(
  rows: PersonRowVM[],
  /**
   * `message`: the playbook's template, as Meta filed it, for a run or a playbook counted; null for a moment counted with
   * no message in view (the class's yes alone). A required property, as the pace is: no caller may leave it out.
   */
  p: RunPlaybook,
  touches: Touches,
  nowMs: number,
  /**
   * The workspace's pace (deals.ts dealPaceOf): when a proposal waits, for the follow-up (0006); null without one. A
   * required argument, as the one waiting rule's is: no caller may leave the pace out.
   */
  pace: Pick<DealPaceVM, "waitDays"> | null,
  /** Who is on the list a saved_list playbook runs on (list-rules.ts savedListIds); none when it names no list. */
  listIds: ReadonlySet<string> | null = null,
): { eligible: PersonRowVM[]; reach: RunReach; saidYes: number; channelOf: Record<string, ConsentChannel> } {
  const reach: RunReach = {
    pool: 0,
    will: 0,
    noNumber: 0,
    stopped: 0,
    noYes: 0,
    heardThis: 0,
    heardAny: 0,
    overCap: 0,
    overLimit: 0,
    no_address: 0,
    address_stopped: 0,
    no_channel: 0,
  };
  const byChannel: Record<ConsentChannel, number> = { whatsapp: 0, sms: 0, email: 0 };
  const channelOf: Record<string, ConsentChannel> = {};
  const none = { eligible: [], reach, saidYes: 0, channelOf };
  const t = triggerOf(p.trigger);
  if (!t) return none;
  // A reach-out writes to leads, never to People: its run is its own (core campaigns/run-reach-out.ts), and its
  // steps must not fall through to the moments' "everyone" below.
  if (t.kind === "reach_out") return none;
  const purpose = enrolPurpose(t.cls, p.message);
  // How it goes: the ticks and the channels now, and what the moment's message is about (a visit's or a follow-up's is
  // theirs, which by email asks no yes; any other moment's is the business's news: decision D1).
  const how: CampaignHow = { channels: p.channels, ready: p.ready, about: messageAboutOfTrigger(p.trigger) };
  // Who holds each full saved name in the workspace, for a visit found by name alone (visitIsTheirs).
  const holders = t.kind === "visit" ? fullNameHolders(rows) : new Map<string, number>();
  // Who the moment names, before anyone is left out.
  const named =
    t.kind === "visit"
      ? // The calendar's own day, never hours: eleven at night tomorrow is still tomorrow. And a visit that is surely
        // theirs (visitIsTheirs).
        rows.filter((r) => {
          if (!r.calendarTz) return false;
          if (p.trigger === "visit_tomorrow")
            return (
              r.nextVisitDate !== null &&
              r.nextVisitDate === localDate(r.calendarTz, new Date(nowMs + DAY_MS)) &&
              visitIsTheirs(r, r.nextVisitVia, holders)
            );
          return (
            r.lastVisitDate !== null &&
            r.lastVisitDate === localDate(r.calendarTz, new Date(nowMs - DAY_MS)) &&
            !r.booked &&
            visitIsTheirs(r, r.lastVisitVia, holders)
          );
        })
      : t.kind === "saved"
        ? audienceMembers(rows, "saved", null, listIds ?? new Set<string>())
        : t.kind === "deal"
          ? rows.filter((r) => followUpNames(r, nowMs, pace))
          : audienceMembers(rows, t.list ? "list" : "everyone", t.list ?? null, null);
  reach.pool = named.length;
  const saidYes = named.filter((r) => saidYesOnAny(r, purpose, how)).length;
  // Who the run reaches, each on their channel, and the reach counted by channel.
  const done = (eligible: PersonRowVM[]) => {
    const kept: Record<string, ConsentChannel> = {};
    for (const r of eligible) {
      const channel = channelOf[r.id];
      if (!channel) continue;
      kept[r.id] = channel;
      byChannel[channel] += 1;
    }
    reach.by_channel = byChannel;
    reach.will = eligible.length;
    return { eligible, reach, saidYes, channelOf: kept };
  };
  const allowed: PersonRowVM[] = [];
  // Each person on the one channel the run reaches them on (reachFor), or counted under why it reaches them on none.
  for (const r of named) {
    const pick = reachFor(r, purpose, how);
    if (pick.channel) {
      channelOf[r.id] = pick.channel;
      allowed.push(r);
    } else if (pick.held === "no_number") reach.noNumber += 1;
    // Their own no to email counts with the other noes: they asked us to stop, and the run leaves them out.
    else if (pick.held === "stopped" || pick.held === "unsubscribed") reach.stopped += 1;
    else if (pick.held === "no_yes") reach.noYes += 1;
    else if (pick.held === "no_address") reach.no_address = (reach.no_address ?? 0) + 1;
    else if (pick.held === "address_stopped") reach.address_stopped = (reach.address_stopped ?? 0) + 1;
    else reach.no_channel = (reach.no_channel ?? 0) + 1;
  }
  if (t.kind === "visit") {
    // The calendar decides, one message per visit: the run is daily and a
    // visit is on one day, so the gap and the week's breath do not apply —
    // a reminder must go whatever else the person heard this week, and the
    // thank-you two days after it must go too.
    allowed.sort((a, b) =>
      p.trigger === "visit_tomorrow"
        ? (a.nextVisitMs ?? 0) - (b.nextVisitMs ?? 0)
        : (a.lastVisitMs ?? 0) - (b.lastVisitMs ?? 0),
    );
    // The cap is a fatigue limit for offers; a reminder is owed to everyone
    // with a visit. Capped, the twenty-sixth appointment of a busy day got no
    // reminder at all -- not deferred, dropped, since the run is once a day.
    // The number's own daily limit still applies, in run-playbook, and says so.
    return done(allowed);
  }
  const gapMs = (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) * DAY_MS;
  // One follow-up per proposal (0006): a follow-up since the proposal went, from whichever playbook, one since deleted
  // too, is the one it owed. Every other moment keeps to its own gap.
  const heardThis = (r: PersonRowVM, mine: number): boolean =>
    t.kind === "deal" ? followUpIsFor(r, mine) : nowMs - mine < gapMs;
  const picked = allowed.filter((r) => {
    const mine = t.kind === "deal" ? touches.followUps.get(r.id) : touches.byThis.get(r.id);
    if (mine !== undefined && heardThis(r, mine)) {
      reach.heardThis += 1;
      return false;
    }
    const any = touches.byAny.get(r.id);
    if (any !== undefined && breathHolds(any, nowMs)) {
      reach.heardAny += 1;
      return false;
    }
    return true;
  });
  picked.sort((a, b) => (a.lastContact.ts ?? 0) - (b.lastContact.ts ?? 0));
  const eligible = picked.slice(0, Math.max(1, p.cap_per_run));
  reach.overCap = picked.length - eligible.length;
  return done(eligible);
}

/**
 * What a playbook will actually DO on its next run.
 *
 * "Running · next run tomorrow 10:00" is a promise, and on a workspace whose
 * list is empty it is one the run cannot keep. The salon had three playbooks,
 * two of them running every day, and every one of them watched a pool of
 * nought -- so two runs a day reached nobody and had been doing so since the
 * list emptied. The card said it: "0 people on the list said yes", in the
 * middle of a sentence, as a link, while the hour it would run at was in bold.
 *
 * An empty pool has two different causes and they are not the same news:
 * nobody on the list has said yes to offers (a thing to go and fix), or
 * everybody has and they all heard from you this week (a thing to wait out).
 * "nobody" also holds a list whose yes has no number to send to, and an empty
 * list: nobody to send to is true of both, and only a missing yes is fixed by
 * getting one (playbookReachDoor).
 */
export type PlaybookReach = "waiting" | "paused" | "sends" | "nobody" | "all-heard" | "uncounted";

/**
 * `candidates` and `held` are null when the moment could not be counted (the
 * server's read failed): "uncounted", which claims no reach at all. It read
 * "nobody", said "nobody to send to" and offered the QR over a failed read.
 */
export function playbookReach(p: {
  state: string;
  candidates: number | null;
  held: number | null;
  waiting?: unknown;
}): PlaybookReach {
  if (p.waiting) return "waiting";
  if (p.state !== "running") return "paused";
  if (p.candidates === null || p.held === null) return "uncounted";
  if (p.candidates > 0) return "sends";
  return p.held > 0 ? "all-heard" : "nobody";
}

/**
 * Where a reach that can be fixed is fixed, or null. "nobody" is fixed by a yes
 * only when the moment names somebody and not one of them said the yes the
 * playbook needs (`named.saidYes`, playbookRunReach's): then getting it is the
 * move. Not when the ones who said it have no number to send to -- the QR would
 * ask them for an answer they gave (#663's rule) -- nor when the moment names
 * nobody, nor when who it names could not be read. "all-heard" is waited out,
 * not fixed, and gets no door.
 */
export function playbookReachDoor(
  reach: PlaybookReach,
  named: { pool: number; saidYes: number } | null,
): { label: string; to: string } | null {
  return reach === "nobody" && named !== null && named.pool > 0 && named.saidYes === 0
    ? { label: "Get their yes", to: GET_YES_ROUTE }
    : null;
}

/**
 * How many on a playbook's list said yes, as its card says it when nobody can be
 * sent a run and somebody said the yes it needs: how many did, and what they are
 * missing, in the send screen's words (saidYesWords). Null otherwise, and the
 * card's own count stands -- who a run reaches now, the shorthand People uses.
 * It read "0 people on the list said yes" about a list whose yes had no number.
 */
export function playbookNoNumberWords(
  p: Pick<PlaybookDto, "policy_class"> & { candidates: number | null; held: number | null },
  named: { saidYes: number } | null,
): string | null {
  if (!named || named.saidYes === 0 || p.candidates === null || p.held === null || p.candidates + p.held > 0)
    return null;
  return saidYesWords("the list", purposeOfPlaybook(p.policy_class), 0, named.saidYes);
}

/** The few words beside the state, when the schedule is not the whole truth; null when it is. */
export const PLAYBOOK_REACH_WORDS: Record<PlaybookReach, string | null> = {
  waiting: null,
  paused: null,
  sends: null,
  nobody: "nobody to send to",
  "all-heard": "waiting out the week's gap",
  // The page says once, over the cards, that who each moment reaches could not be read.
  uncounted: null,
};

export const PLAYBOOK_CLASS_LABEL: Record<PlaybookPolicyClass, string> = {
  reengage: POLICY_CLASS_WORDS.reengage.short,
  campaign: POLICY_CLASS_WORDS.campaign.short,
  booking: POLICY_CLASS_WORDS.booking.short,
  follow_up: POLICY_CLASS_WORDS.follow_up.short,
  outreach: POLICY_CLASS_WORDS.outreach.short,
};
