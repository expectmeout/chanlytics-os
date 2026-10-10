/**
 * Reports › People — the book as it stands now, counted over the people pool by People's own rules.
 *
 * The window of the lens (who reached the business, how they came, what they answered) is the database's, counted over
 * days (people_series, 00395). The book is not: it is everyone People holds at this moment, and it is counted here, from
 * the same rows People draws (`people_list`'s, through the pool's builder, `poolRowsOf`) by the predicates People already
 * has, never restated. How long since a person was heard is `PersonRowVM.heardDays`; who is quiet, who said yes to
 * messages or to offers and who asked to stop are the built-in lists (`membersOf` over `BUILTIN_LISTS`, which People's rail
 * counts too); a next step's standing is `nextStep.due`; the ways a person reaches the business are `channels`; a stopped
 * address is `emailSuppressed`. A number here is a number the rail would show for the same people, which a test holds.
 *
 * Counts only: nothing of a person leaves. The book is read for no one looking (`viewer: null`), so a list that is about
 * whoever is looking could not be counted, and none of the five lists is. Pure.
 */
import type { ChannelsReady } from "../../broadcasts/reach-for";
import type { StepDue } from "../../notes/steps";
import { poolListContext, poolRowsOf } from "../../people/audience-pool";
import { membersOf, resolveList } from "../../people/lists/lists";
import type { PersonRowDto } from "../../people/person-dto";
import type { PersonRowVM } from "../../people/person-row";
import { QUIET_AFTER_DAYS } from "../../people/person-state";
import type { PersonChannel } from "../../people/person-words";

/** The book as it stands now: how many people, how fresh, on which lists, with which steps and by which wires. Counts only. */
export interface PeopleNowDto {
  /** The live people the pool holds. */
  people: number;
  /** By how long since they last wrote or rang, in the workspace's days; `never` for someone who has done neither. */
  fresh: { under_7: number; d7_30: number; d31_60: number; d61_90: number; d91_up: number; never: number };
  /** People's own lists, counted by `membersOf`. */
  lists: { opted_in: number; offers_ok: number; opted_out: number; quiet: number };
  /** People whose earliest open step's day is before today / is today. */
  steps: { overdue: number; due_today: number };
  /** People whose address has bounced or complained and is no longer sent to. */
  email_stopped: number;
  /** By the ways they reach the business: one wire alone, several, or none on record. */
  wires: {
    whatsapp_only: number;
    sms_only: number;
    phone_only: number;
    email_only: number;
    several: number;
    none: number;
  };
}

/**
 * Each bucket of freshness but the last, with the day it ends before: a week, the day the Quiet list begins
 * (`QUIET_AFTER_DAYS + 1`), two months and three. The last three therefore hold exactly the Quiet list's people.
 */
const FRESH_BUCKETS = [
  { key: "under_7", before: 7 },
  { key: "d7_30", before: QUIET_AFTER_DAYS + 1 },
  { key: "d31_60", before: 61 },
  { key: "d61_90", before: 91 },
] as const;

/** The bucket a person falls in by the days since they were heard (`heardDays`); null: they never were. */
function freshBucketOf(heardDays: number | null): keyof PeopleNowDto["fresh"] {
  if (heardDays === null) return "never";
  return FRESH_BUCKETS.find((b) => heardDays < b.before)?.key ?? "d91_up";
}

function freshCountsOf(vms: readonly PersonRowVM[]): PeopleNowDto["fresh"] {
  const fresh = { under_7: 0, d7_30: 0, d31_60: 0, d61_90: 0, d91_up: 0, never: 0 };
  for (const v of vms) fresh[freshBucketOf(v.heardDays)] += 1;
  return fresh;
}

/** What the five lists are read with: the pool for no one looking, no calendar, deals off, no consult-first service. */
const BOOK_CONTEXT = poolListContext({ calendar: "none", dealsOn: false, consultFirst: false, viewer: null });

/** How many are on one of People's built-in lists; a list that cannot be counted is an error, never a made-up number. */
function listCountOf(id: keyof PeopleNowDto["lists"], vms: readonly PersonRowVM[]): number {
  const def = resolveList({ kind: "builtin", id }, []);
  const members = def ? membersOf(def, vms, BOOK_CONTEXT) : null;
  if (members?.state !== "ok") throw new Error(`People's list ${id} cannot be counted without a viewer`);
  return members.ids.size;
}

function listCountsOf(vms: readonly PersonRowVM[]): PeopleNowDto["lists"] {
  return {
    opted_in: listCountOf("opted_in", vms),
    offers_ok: listCountOf("offers_ok", vms),
    opted_out: listCountOf("opted_out", vms),
    quiet: listCountOf("quiet", vms),
  };
}

/** People with an open step by how its day stands against today; a row carries its earliest open step, so each is counted once. */
function stepCountsOf(vms: readonly PersonRowVM[]): PeopleNowDto["steps"] {
  const standing = (due: StepDue) => vms.filter((v) => v.nextStep?.due === due).length;
  return { overdue: standing("past"), due_today: standing("today") };
}

const ONLY_WIRE: Record<PersonChannel, keyof PeopleNowDto["wires"]> = {
  whatsapp: "whatsapp_only",
  sms: "sms_only",
  voice: "phone_only",
  email: "email_only",
};

/** Where a person stands among the wires: the one they use alone, several, or none on record. */
function wireBucketOf(channels: readonly PersonChannel[]): keyof PeopleNowDto["wires"] {
  const first = channels.at(0);
  if (first === undefined) return "none";
  return channels.length > 1 ? "several" : ONLY_WIRE[first];
}

function wireCountsOf(vms: readonly PersonRowVM[]): PeopleNowDto["wires"] {
  const wires = { whatsapp_only: 0, sms_only: 0, phone_only: 0, email_only: 0, several: 0, none: 0 };
  for (const v of vms) wires[wireBucketOf(v.channels)] += 1;
  return wires;
}

/**
 * The book as it stands at `nowMs`, in the workspace's zone `tz`, from the people pool (`people_list`'s rows). `ready` is
 * what the workspace can send on now, which who can be sent offers is judged against (null: counted by WhatsApp alone, as
 * every People page counts when the channels could not be read). Throws when a list cannot be counted, so the reader
 * leaves the book out and says so.
 */
export function peopleNowOf(
  rows: readonly PersonRowDto[],
  o: { tz: string; nowMs: number; ready: ChannelsReady | null },
): PeopleNowDto {
  const vms = poolRowsOf(rows, { tz: o.tz, now: new Date(o.nowMs), viewer: null, dealsOn: false, ready: o.ready });
  return {
    people: vms.length,
    fresh: freshCountsOf(vms),
    lists: listCountsOf(vms),
    steps: stepCountsOf(vms),
    email_stopped: vms.filter((v) => v.emailSuppressed).length,
    wires: wireCountsOf(vms),
  };
}
