/**
 * Who a playbook reaches: eligibility against the touches, a run's reach, and the words for a playbook that reaches
 * nobody. Moved whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { audienceMembers } from "../broadcasts/broadcasts";
import { POLICY_CLASS_WORDS } from "../config/config";
import { purposeOfPlaybook } from "../consent/consent";
import type { DealPaceVM } from "../deals/deals";
import { GET_YES_ROUTE, type PersonRowVM, saidYesTo, saidYesWords, whyNotReceive } from "../people/people";
import { breathHolds, followUpIsFor, followUpNames } from "./playbook-follow-ups";
import { localDate } from "./playbook-schedule";
import { DAY_MS } from "./playbook-time";
import { type PlaybookPolicyClass, triggerOf } from "./playbook-triggers";
import type { PlaybookDto } from "./playbooks";

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

/**
 * The people a run may reach: the trigger's list crossed with who said yes to
 * THIS KIND of message, minus anyone who heard from this playbook within its
 * gap (its cadence, for the month's offer), minus anyone who heard from any
 * playbook this week; the longest-unheard first; at most the cap.
 *
 * The purpose is the trigger's own `cls`, which every trigger has always
 * declared and which nothing has ever read. `booking` is a reminder about an
 * appointment the customer made; everything else is promotional.
 *
 * That distinction fixes a real loss. `visit_tomorrow` sends the one utility
 * template in the starter library to somebody with a visit on the calendar
 * tomorrow -- and it was skipped with `not_opted_in` unless that person had
 * given marketing-grade consent. A customer who booked an appointment was not
 * reminded of it because they had never asked for offers.
 */
export function eligibleForPlaybook(
  rows: PersonRowVM[],
  p: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days">,
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
 * out, in the order the run applies the rules. So `will` and the eight counts
 * add up to `pool`, and a bar of them is the whole list.
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
  p: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days">,
  touches: Touches,
  nowMs: number,
  /**
   * The workspace's pace (deals.ts dealPaceOf): when a proposal waits, for the follow-up (0006); null without one. A
   * required argument, as the one waiting rule's is: no caller may leave the pace out.
   */
  pace: Pick<DealPaceVM, "waitDays"> | null,
  /** Who is on the list a saved_list playbook runs on (list-rules.ts savedListIds); none when it names no list. */
  listIds: ReadonlySet<string> | null = null,
): { eligible: PersonRowVM[]; reach: RunReach; saidYes: number } {
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
  };
  const t = triggerOf(p.trigger);
  if (!t) return { eligible: [], reach, saidYes: 0 };
  // A reach-out writes to leads, never to People: its run is its own (core campaigns/run-reach-out.ts), and its
  // steps must not fall through to the moments' "everyone" below.
  if (t.kind === "reach_out") return { eligible: [], reach, saidYes: 0 };
  const purpose = purposeOfPlaybook(t.cls);
  // Who the moment names, before anyone is left out.
  const named =
    t.kind === "visit"
      ? // The calendar's own day, never hours: eleven at night tomorrow is still tomorrow.
        rows.filter((r) => {
          if (!r.calendarTz) return false;
          if (p.trigger === "visit_tomorrow")
            return r.nextVisitDate !== null && r.nextVisitDate === localDate(r.calendarTz, new Date(nowMs + DAY_MS));
          return (
            r.lastVisitDate !== null &&
            r.lastVisitDate === localDate(r.calendarTz, new Date(nowMs - DAY_MS)) &&
            !r.booked
          );
        })
      : t.kind === "saved"
        ? audienceMembers(rows, "saved", null, listIds ?? new Set<string>())
        : t.kind === "deal"
          ? rows.filter((r) => followUpNames(r, nowMs, pace))
          : audienceMembers(rows, t.list ? "list" : "everyone", t.list ?? null, null);
  reach.pool = named.length;
  const saidYes = named.filter((r) => saidYesTo(r, purpose)).length;
  const allowed: PersonRowVM[] = [];
  for (const r of named) {
    const why = whyNotReceive(r, purpose);
    if (why === "no_number") reach.noNumber += 1;
    else if (why === "stopped") reach.stopped += 1;
    else if (why === "no_yes") reach.noYes += 1;
    else allowed.push(r);
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
    reach.will = allowed.length;
    return { eligible: allowed, reach, saidYes };
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
  reach.will = eligible.length;
  return { eligible, reach, saidYes };
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
