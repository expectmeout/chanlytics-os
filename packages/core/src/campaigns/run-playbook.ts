import {
  batchModeOf,
  campaignEnded,
  campaignMessageOf,
  clockWhen,
  localDate,
  messageHolds,
  nextOpenMoment,
  parseParamSpecs,
  listToken,
  planRun,
  PLAYBOOK_CALENDAR_UNREAD,
  playbookListRef,
  playbookRunReach,
  playbookStopBy,
  enrolPurpose,
  followUpLeaves,
  followUpReach,
  followUpStop,
  handOf,
  personHandWords,
  messageAboutOfTrigger,
  proposalFactsFor,
  readyForMessage,
  touchesAfterRun,
  triggerOf,
  readyRunNotice,
  vetoRunNotice,
  visitFactsFor,
  theirVisitTest,
  visitMomentDay,
  visitOnDay,
  type CampaignHow,
  type CampaignMessage,
  type ConsentChannel,
  type PersonRowVM,
  type PlaybookTrigger,
  type RunPlan,
  type RunReach,
  type SequenceMode,
  type StepHand,
} from "@chanlytics/contracts";
import { assembleRun } from "./assemble";
import { handStepIdFor, reachOutRunIdFor, sendIdFor } from "./reach-out-ids";
import { allowanceRecord, pastTheMonth } from "./allowance";
import { parseChannels } from "./message-channels";
import type {
  AssembleDecision,
  PlaybookRow,
  RunBy,
  RunContext,
  RunOutcome,
  RunPlaybookCommand,
  RunPlaybookPorts,
} from "./ports";

type Skipped = Extract<RunOutcome, { outcome: "off" }>["skipped"];

/** A customer's step after the first (decision 0060, D6): it reaches the people due it, not a moment's people. */
const isFollowUp = (p: PlaybookRow): boolean => (p.kind ?? "moment") === "moment" && p.trigger === "after_step";

/** A list as it was counted for a run, kept on it (decision 0009, "sends remember"). */
type KeptList = { token: string; rule: unknown; counted_at: string };

/** One run as its steps share it: the world, the playbook, the day, the mode, and the two things any step may end it with. */
interface Run {
  ports: RunPlaybookPorts;
  p: PlaybookRow;
  ctx: RunContext;
  by: RunBy;
  runFor: string;
  /** How this batch is decided (contracts batchModeOf): what it records, and what its bell says. */
  mode: SequenceMode;
  /** The channels the playbook ticks (contracts reachFor reads them at enrolment). */
  channels: ConsentChannel[];
  record(data: Record<string, unknown>): Promise<void>;
  off(skipped: Skipped, opts?: { record?: boolean }): Promise<RunOutcome>;
}
/** The message as the run reads it: contracts' reading of its rows, and the channels it can be said on now. */
type Message = {
  /** Null where the workspace holds no row of it now (a message that is gone): it holds nothing and names no category. */
  m: CampaignMessage | null;
  /** What it holds (contracts messageHolds): WhatsApp's version approved and whole, which WhatsApp's people alone need, and a row of its own on email and on text. */
  held: Record<ConsentChannel, boolean>;
};

/**
 * The message as the workspace holds it now, read once from its rows: the versions the playbook's ticks need, and the
 * category it is enrolled by. A read that could not be made is this run failing, not the message withdrawn: nothing is
 * recorded, so the next sweep asks again rather than skipping the day.
 */
async function readMessage(r: Run): Promise<Message | { error: string }> {
  const { ports, p } = r;
  try {
    const m = campaignMessageOf(
      await ports.message(p.template_name, p.template_language),
      p.template_name,
      p.template_language,
    );
    return { m, held: m ? messageHolds(m) : { whatsapp: false, email: false, sms: false } };
  } catch (e) {
    return { error: `template: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Whether WhatsApp's version alone ends a run that drew `drawn` people: the run ticks WhatsApp, the message does not
 * hold a WhatsApp version to send, and nobody was drawn on email or text (a version the message does not hold draws
 * nobody on WhatsApp).
 */
const templateHolds = (r: Run, m: Message, drawn: number): boolean =>
  drawn === 0 && !m.held.whatsapp && r.channels.includes("whatsapp");

/**
 * A moment that reads the calendar, run with none it can read. No calendar connected is a final answer: the run says so
 * and the day is recorded. A calendar that could not be READ is a failure, like a template that could not be: nothing is
 * recorded, so the hourly sweep asks again. Recorded as "off", the day was done as far as the sweep knew (runDueNow
 * asks the row's last run), and one failed read of a feed lost the whole day's reminders for good.
 */
async function withoutCalendar(r: Run): Promise<RunOutcome> {
  return r.ctx.calendar === "unavailable"
    ? { outcome: "failed", error: PLAYBOOK_CALENDAR_UNREAD }
    : r.off("no_calendar");
}

/**
 * Whether the run may go on, and over whom: the run's own stops (contracts playbookStopBy, which the follow-up's words
 * on People and Today ask too), the day's run already made, a calendar a visit moment reads, the list a playbook on a
 * list runs on, and a moment this workspace has no use for. Each ends the run with its reason (`off`).
 *
 * The number's health stops a run only when it ticks WhatsApp: a run that does not tick it never asks. WhatsApp's
 * version stops it only when WhatsApp is all the run goes by: one that also ticks email or text goes on for them, and
 * is stopped by it later (`templateHolds`) only if nobody drawn is on either. A message with no WhatsApp version at all
 * stops nothing that does not tick WhatsApp.
 */
async function allowed(
  r: Run,
  message: Message,
): Promise<{ ended: RunOutcome } | { ended: null; listIds: ReadonlySet<string> | null; kept: KeptList | undefined }> {
  const { p, ctx } = r;
  const stop = playbookStopBy({
    channels: r.channels,
    templateStatus: message.m?.versions.whatsapp?.status ?? null,
    numberCanSend: ctx.health.canSend,
  });
  if (stop) return { ended: await r.off(stop) };
  // One run per local day: a second ask says so and records nothing twice.
  if (await r.ports.alreadyRan(p.id, r.runFor)) return { ended: await r.off("already_ran_today", { record: false }) };
  // A step after the first reaches whoever its sequence brought to it: no moment or list of its own. One that goes only to
  // those who haven't booked judges a booking by the calendar, so a calendar that could not be READ fails the run, as a
  // visit moment's does, and the next sweep asks again: never a day on which nobody looks booked.
  if (isFollowUp(p)) {
    if ((p.only_if ?? []).includes("no_booking") && ctx.calendar === "unavailable")
      return { ended: { outcome: "failed", error: PLAYBOOK_CALENDAR_UNREAD } };
    return { ended: null, listIds: null, kept: undefined };
  }
  // A visit playbook, or Lapsed's, without a calendar has nothing to read: off, and the run says so.
  const trig = triggerOf(p.trigger);
  if ((trig?.kind === "visit" || trig?.id === "lapsed") && ctx.calendar !== "ok")
    return { ended: await withoutCalendar(r) };
  // A playbook on a list (decision 0009): who is on it now, one of People's or one of the workspace's own. A list
  // deleted under it runs nobody, and one that can't be counted here -- a calendar not read, a rule this build can't
  // read -- runs nobody either; each says so.
  let listIds: ReadonlySet<string> | null = null;
  let kept: KeptList | undefined;
  if (trig?.kind === "saved") {
    const ref = playbookListRef(p);
    const m = ref ? ctx.listMembers(ref) : null;
    if (!m || !ref) return { ended: await r.off("no_list") };
    if (m.state === "unknown")
      return { ended: m.reason === "calendar" ? await withoutCalendar(r) : await r.off("list_uncounted") };
    listIds = m.ids;
    kept = { token: listToken(ref), rule: m.rule ?? null, counted_at: ctx.now.toISOString() };
  }
  return { ended: null, listIds, kept };
}

/**
 * Who the run reaches, each on one channel, with the number's daily limit as a ceiling on WhatsApp's people, and who it
 * leaves out, and why, counted as it goes (playbookRunReach): the run keeps the counts, so the sheet it is approved from
 * can say "186 of 312, 94 never said yes" instead of only the rules that made its list. Enrolled by the stricter of the
 * moment's class and the message's category (`message`, enrolPurpose: Meta's where it has a WhatsApp version, else its
 * own rows'), on the channels the playbook ticks that the workspace can send on now and the message holds (`how`).
 *
 * The limit is Meta's: it holds WhatsApp's people alone, and an email or a text is never held for it. The people past it
 * are named in the run's record, never dropped in silence.
 */
function draw(
  r: Run,
  message: Message["m"],
  how: CampaignHow,
  among: { listIds: ReadonlySet<string> | null; reached: ReadonlySet<string> },
): { eligible: PersonRowVM[]; reach: RunReach; channelOf: Record<string, ConsentChannel>; dropped: number } {
  const { listIds, reached } = among;
  const { p, ctx } = r;
  const byTwin = twinTouches(r);
  // Whoever the sequence already reached heard from it, for good (a list's: once each), counted as heard from it.
  const byThis = new Map(ctx.touches.byThis.get(p.id) ?? []);
  for (const id of reached) byThis.set(id, ctx.now.getTime());
  const drawn = playbookRunReach(
    ctx.people,
    {
      trigger: p.trigger as PlaybookTrigger,
      cap_per_run: p.cap_per_run,
      gap_days: p.gap_days,
      cadence_days: p.cadence_days,
      message,
      ...how,
    },
    {
      byThis,
      byAny: ctx.touches.byAny,
      followUps: ctx.touches.followUps,
      followUpKeys: ctx.touches.followUpKeys,
      ...(byTwin.size > 0 ? { byTwin } : {}),
    },
    ctx.now.getTime(),
    ctx.pace,
    listIds,
  );
  return withinTheNumbersDay(r, drawn);
}

/**
 * When each person last heard from another step running on this one's visit moment (the context's `twinsOf`): its touches
 * folded latest-first, so a reminder a twin already sent for this visit is not sent again (playbookRunReach `byTwin`).
 * Empty for any other moment, and where the runtime names no twins.
 */
function twinTouches(r: Run): Map<string, number> {
  const { p, ctx } = r;
  const out = new Map<string, number>();
  if (triggerOf(p.trigger)?.kind !== "visit" || !ctx.twinsOf) return out;
  for (const id of ctx.twinsOf(p.id, p.trigger)) {
    for (const [person, at] of ctx.touches.byThis.get(id) ?? []) out.set(person, Math.max(out.get(person) ?? 0, at));
  }
  return out;
}

/**
 * The number's daily limit as a ceiling on WhatsApp's people (Meta's: an email or a text is never held for it), the
 * people past it named in the run's record, never dropped in silence. A moment's run and a step after the first both.
 */
function withinTheNumbersDay(
  r: Run,
  drawn: { eligible: PersonRowVM[]; reach: RunReach; channelOf: Record<string, ConsentChannel> },
): { eligible: PersonRowVM[]; reach: RunReach; channelOf: Record<string, ConsentChannel>; dropped: number } {
  const { ctx } = r;
  const reach: RunReach = { ...drawn.reach };
  const room =
    ctx.health.limitPerDay === null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(ctx.health.limitPerDay));
  let onWhatsApp = 0;
  const eligible = drawn.eligible.filter((person) => {
    if (drawn.channelOf[person.id] !== "whatsapp") return true;
    onWhatsApp += 1;
    return onWhatsApp <= room;
  });
  const dropped = drawn.eligible.length - eligible.length;
  if (dropped > 0) {
    reach.overLimit = dropped;
    reach.will = eligible.length;
    if (reach.by_channel) reach.by_channel = { ...reach.by_channel, whatsapp: reach.by_channel.whatsapp - dropped };
  }
  return { eligible, reach, channelOf: drawn.channelOf, dropped };
}

/**
 * Who a customer's step after the first reaches (D6): the people the database says are due it (in its sequence, one step
 * before it, their wait over), less those for whom what it was for no longer holds (they booked or came in, or wrote back,
 * since: contracts followUpStop), each on one channel (contracts followUpReach), at most its cap, the longest waiting
 * first, and within the number's day. Whoever it will not reach for a reason of their own leaves the sequence, with why
 * (booked, replied, never said yes, gone), so a day's run never asks of them again; those no channel can carry the step
 * to today (the workspace's to mend: contracts followUpLeaves) and those past the cap stay due for the next day. A read or
 * a leave that fails is this run failing: nothing is recorded, and the next sweep asks again.
 */
async function drawFollowUp(
  r: Run,
  message: Message["m"],
  how: CampaignHow,
): Promise<ReturnType<typeof withinTheNumbersDay> | { error: string }> {
  try {
    const due = await r.ports.followUpsDue(r.p.id, r.runFor);
    const people = new Map(r.ctx.people.map((person) => [person.id, person]));
    const leaving = new Map<string, string[]>();
    const leave = (why: string, id: string) => leaving.set(why, [...(leaving.get(why) ?? []), id]);
    const goes: PersonRowVM[] = [];
    const enrolmentOf = new Map<string, string>();
    for (const d of due) {
      const person = people.get(d.contact_id);
      const stop = person ? followUpStop(person, r.p.only_if ?? [], d.sent_at ? Date.parse(d.sent_at) : null) : "gone";
      if (!person || stop) {
        leave(stop ?? "gone", d.enrollment_id);
        continue;
      }
      goes.push(person);
      enrolmentOf.set(person.id, d.enrollment_id);
    }
    const drawn = followUpReach(goes, {
      policy_class: r.p.policy_class,
      message,
      channels: how.channels,
      ready: how.ready,
    });
    for (const h of drawn.held) {
      const id = enrolmentOf.get(h.id);
      if (id && followUpLeaves(h.why)) leave(h.why, id);
    }
    // The cap holds the rest to tomorrow: they stay in their sequence, due, the longest waiting first (the due order).
    const capped = drawn.eligible.slice(0, Math.max(1, r.p.cap_per_run));
    for (const [why, ids] of leaving) await r.ports.leave(ids, why);
    return withinTheNumbersDay(r, {
      eligible: capped,
      reach: { ...drawn.reach, overCap: drawn.eligible.length - capped.length, will: capped.length },
      channelOf: drawn.channelOf,
    });
  } catch (e) {
    return { error: `follow_up: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * A customer's call or note step (00465, decision 0065): the people its sequence brought to it, their wait over, each
 * handed to the team as a call to make or a note, a dated step on their person due that day, at most its cap, the longest
 * waiting first. Whoever what it was for no longer holds of (they booked, wrote back, or are gone) leaves, as a message
 * step's would, so the team is never asked to call someone who booked. Nothing is sent, so nothing waits for an OK, spends,
 * or asks for a channel. The run, its handed sends and the steps are written whole by the door. A read or a write that
 * fails is this run failing: nothing is recorded, and the next sweep asks again.
 */
async function runPeopleHand(r: Run, hand: StepHand): Promise<RunOutcome> {
  const { p, ctx, ports, runFor, mode } = r;
  if (await ports.alreadyRan(p.id, runFor)) return r.off("already_ran_today", { record: false });
  if ((p.only_if ?? []).includes("no_booking") && ctx.calendar === "unavailable")
    return { outcome: "failed", error: PLAYBOOK_CALENDAR_UNREAD };
  try {
    const due = await ports.followUpsDue(p.id, runFor);
    const people = new Map(ctx.people.map((person) => [person.id, person]));
    const leaving = new Map<string, string[]>();
    const goes: PersonRowVM[] = [];
    for (const d of due) {
      const person = people.get(d.contact_id);
      const stop = person ? followUpStop(person, p.only_if ?? [], d.sent_at ? Date.parse(d.sent_at) : null) : "gone";
      if (person && !stop) goes.push(person);
      else leaving.set(stop ?? "gone", [...(leaving.get(stop ?? "gone") ?? []), d.enrollment_id]);
    }
    for (const [why, ids] of leaving) await ports.leave(ids, why);
    const handed = goes.slice(0, Math.max(1, p.cap_per_run));
    if (handed.length === 0) {
      await r.record({ mode, eligible: 0, hand: hand.kind });
      return { outcome: "empty", eligible: 0, mode };
    }
    const runId = await reachOutRunIdFor(p.id, runFor);
    const items = await Promise.all(
      handed.map(async (person) => ({
        send_id: await sendIdFor(runId, person.id),
        contact_id: person.id,
        // Their own name, or their WhatsApp one: never the row's fallback (a number, an address, "Unknown"), which a
        // call to "ana@example.com" would read; with neither, "them" (personHandWords).
        words: personHandWords(hand.kind, person.givenName || person.waName || "", hand.words),
        source_id: await handStepIdFor(p.id, person.id),
      })),
    );
    const made = await ports.handRun({ stepId: p.id, runId, day: runFor, items });
    await r.record({ mode, eligible: made.made, hand: hand.kind, broadcast_id: runId, state: "sent" });
    return {
      outcome: "sent",
      broadcast_id: runId,
      eligible: made.made,
      mode,
      state: "sent",
      scheduled_for: ctx.now.toISOString(),
      moved_from: null,
    };
  } catch (e) {
    return { outcome: "failed", error: `hand: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Who the run reaches: a moment's people, or the people a step after the first is due to (D6). A sequence on a list goes
 * once to each person (the loop review's item 6): the list's people when it starts, then each who joins, never again to
 * anyone it already reached or holds. A read of who it reached that fails is this run failing: nothing is recorded.
 */
async function drawOf(
  r: Run,
  message: Message["m"],
  how: CampaignHow,
  listIds: ReadonlySet<string> | null,
): Promise<ReturnType<typeof withinTheNumbersDay> | { error: string }> {
  if (isFollowUp(r.p)) return drawFollowUp(r, message, how);
  if (listIds === null) return draw(r, message, how, { listIds: null, reached: new Set() });
  try {
    return draw(r, message, how, { listIds, reached: await r.ports.reached(r.p.id) });
  } catch (e) {
    return { error: `reached: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Who of the people drawn the month's allowance already holds (allowance.ts): read before anyone is enrolled, so the run's
 * report says so up front. A booking moment's message about a visit is never held by it (contracts heldByAllowance), by the
 * purpose the run enrolled by (enrolPurpose), so a booking moment that sends an offer is metered. A count that could not be
 * read is this run failing, as a template that could not be read is: nothing is recorded and the next sweep asks again,
 * rather than a run enrolling past a room nobody counted.
 */
async function pastTheRoom(
  r: Run,
  message: Message["m"],
  drawn: { eligible: readonly PersonRowVM[]; channelOf: Record<string, ConsentChannel> },
  goesAt: Date,
): Promise<{ held: string[] } | { error: string }> {
  try {
    const people = drawn.eligible.map((person) => ({
      id: person.id,
      channel: drawn.channelOf[person.id] ?? "whatsapp",
    }));
    const purpose = enrolPurpose(triggerOf(r.p.trigger)?.cls, message);
    // Counted against the month the run goes in: a run approved past midnight on the 1st is the new month's.
    const month = { monthSent: (channel: "email" | "sms") => r.ports.monthSent(channel, goesAt) };
    return { held: (await pastTheMonth(month, people, r.p.trigger, purpose)).map((person) => person.id) };
  } catch (e) {
    return { error: `month: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Each person's words for the slots, kept on their row: a visit run keeps the visit's time and service as the calendar
 * said them now, so the send fills the slots without reading the calendar again. Relative to the moment the send goes:
 * a run asked for at night goes at nine, and "tomorrow" said at eleven is "today" by then. A follow-up keeps the link of
 * the proposal the person's deal waits on (0006).
 */
function recipientFacts(r: Run, goesAt: Date): (person: PersonRowVM) => Record<string, string> | null {
  const { p, ctx } = r;
  // A step after the first keeps no visit's or proposal's words: what it says is its own.
  if (isFollowUp(p)) return () => null;
  const trig = triggerOf(p.trigger);
  // Whose a visit is, as the run judged it when it named them (contracts theirVisitTest): the same rows, the same test.
  const theirs = theirVisitTest(ctx.people);
  return (person) => {
    if (trig?.kind === "deal") return proposalFactsFor(p.trigger, person);
    const v = ctx.visits.get(person.id);
    // The visit ON the moment's day (contracts visitOnDay), as the run named them for it (visitMomentDay): the next visit
    // of a person with one later today is today's, and the reminder said today's time for tomorrow's visit.
    const day = v ? visitMomentDay(p.trigger, v.timezone, ctx.now.getTime()) : null;
    const tomorrow = p.trigger === "visit_tomorrow";
    const onDay = v && day ? visitOnDay(v, day, tomorrow ? "next" : "last", (via) => theirs(person, via)) : null;
    const visit = onDay ?? (tomorrow ? (v?.next ?? null) : (v?.last ?? null));
    // The service alone: the person's own name comes out of the event's title (visitFactsFor).
    const words = visitFactsFor(p.trigger, visit, ctx.tz, [person.givenName, person.waName], goesAt);
    // Which appointment the words are about, when it starts, and when the run read it from the calendar (the context's
    // now), so the send asks its row again (decision 0002, contracts appointmentHolds): a reminder never goes for one
    // that moved or was cancelled since the run, and the record's older word never holds one the run saw newer.
    return words && visit?.key
      ? { ...words, appointment: visit.key, visit_start: visit.start, appointment_read_at: ctx.now.toISOString() }
      : words;
  };
}

/**
 * The people a run has just enrolled are touched from the moment it goes: the context's touches are one read of the
 * workspace, and the sweep runs every due playbook of a workspace against it, so without this a second moment in the same
 * hour judged the week's breath ("one a week per person, across every moment") from a snapshot that never changed, and
 * one person could be sent two moments the same morning. Those the month's allowance held are skipped, and touched by
 * nothing (touchesAfterRun, which the database's own reading of a run agrees with).
 */
function touchEnrolled(r: Run, goesAt: Date, eligible: readonly PersonRowVM[], held: readonly string[]): void {
  const skipped = new Set(held);
  r.ctx.touches = touchesAfterRun(
    r.ctx.touches,
    { playbookId: r.p.id, at: goesAt.getTime(), followUp: triggerOf(r.p.trigger)?.kind === "deal" },
    // With the proposal's link a follow-up carries to each (their deal is the proposal it is about, 0029).
    eligible
      .filter((person) => !skipped.has(person.id))
      .map((person) => ({ id: person.id, deal: person.deal?.id ?? null, link: person.deal?.proposal?.url ?? null })),
  );
}

/**
 * Whose decision a run that sends is, written with the run (00381): the system's under the mode the owner chose; a
 * person's when they asked for it. None for a run that waits for a person: their approval is its decision.
 */
function decisionOf(run: Run, send: { n: number; at: Date; movedFrom: string | null }): AssembleDecision {
  const { p, by, mode, channels } = run;
  return {
    by,
    payload: {
      playbook_id: p.id,
      playbook: p.name,
      mode,
      recipients: send.n,
      channels: [...channels],
      scheduled_for: send.at.toISOString(),
      run_now: by.kind === "user",
      ...(send.movedFrom ? { moved_from: send.movedFrom } : {}),
    },
  };
}

/**
 * A run is made: the bell. One that waits for a person tells them. And one the sweep made under veto, which goes by
 * itself, tells them when: "unless you stop it" is kept only for someone who is told, and until this nobody was unless
 * Campaigns happened to be open. A run that sends is on the ledger already, written with the run (decisionOf).
 */
async function sayTheRun(run: Run, made: { madeId: string; n: number; at: Date | null }): Promise<void> {
  const { ports, p, ctx, by, mode } = run;
  const { n, at } = made;
  if (!at) {
    // A person reads "campaign", never "playbook" (decision 19): Today's away card finds the queue's run in this title,
    // and reads the old word too (contracts today-away.ts), since the bell keeps rows written before. How its wait ends is
    // the wait rule's (contracts waitEndsWords: until the end of its day, then skipped and told).
    const told = readyRunNotice(p.name, n);
    await ports.notify(told.subject, told.body, made.madeId);
    return;
  }
  if (mode === "veto" && by.kind !== "user") {
    // With its day: a run made past the day's hours goes at nine tomorrow, and "9:00 AM" alone reads as already gone.
    const told = vetoRunNotice(p.name, n, clockWhen(at.getTime(), ctx.tz, ctx.now.getTime()));
    // The run is made and on the ledger: telling of it must not cost the run its record, so a bell that fails is let
    // go (the adapter says so in its own log), where the ask notice, the only way a waiting run is found, is not.
    await ports.notify(told.subject, told.body, made.madeId).catch(() => undefined);
  }
}

/**
 * One playbook's run, the one implementation.
 *
 * The hourly sweep runs every playbook whose hour it is; "Run now" on the
 * page runs one at a person's request. Both come here. A run is a broadcast
 * for the people who became eligible since the last run — the trigger's
 * list crossed with who said yes, minus anyone who heard from this playbook
 * within its gap, minus anyone who heard from any playbook this week, the
 * longest-unheard first, at most the cap. Each is reached once, on the first
 * of the playbook's channels the workspace can send on and the message has a
 * version on (contracts reachFor); a person none of them reaches is held, and
 * counted by why, never moved to another channel. What the run then does is its
 * batch's mode (contracts batchModeOf, decision 0064): its sequence's own, or
 * ask while the step's words are new to the owner. Auto schedules the send now,
 * veto schedules it half an hour ahead with a Stop, ask leaves it waiting for a
 * person. A person who asks for a run now has decided: it sends now, and its
 * words are theirs from then on. Never at 3 AM, whoever asks: a send that would
 * go out past the hours a run keeps on its own (a "Run now" at eleven at
 * night, a veto window ending past twenty) goes at nine, and the ledger says
 * what was asked for. Every run is recorded as an event, a run that found
 * nobody included. A run never throws: the sweep behind it must go on.
 */
export async function runPlaybook(ports: RunPlaybookPorts, cmd: RunPlaybookCommand): Promise<RunOutcome> {
  const { playbook: p, ctx, by } = cmd;
  const now = ctx.now;
  const runFor = cmd.runFor ?? localDate(ctx.tz, now);
  // Its sequence's mode, or ask while the step's words are new to the owner or the mode is none this build knows.
  const mode = batchModeOf({ mode: p.mode, words_ok_at: p.words_ok_at });
  const record = (data: Record<string, unknown>) =>
    ports.record(p.id, runFor, now, { run_for: runFor, by: by.kind, ...data });
  // Off, and the run says why -- recorded, unless the day's run already stands.
  const off = async (skipped: Skipped, opts: { record?: boolean } = {}): Promise<RunOutcome> => {
    if (opts.record !== false) await record({ mode, skipped });
    return { outcome: "off", mode, skipped };
  };
  // A campaign past its last day (00416 `until`, the business's day) runs nothing more, whoever asks: said, and recorded
  // for the day, before anything is read.
  if (campaignEnded(p, runFor)) return off("ended");
  // A person who asks has decided: it sends now.
  const plan: RunPlan = by.kind === "user" ? { kind: "send", state: "scheduled", at: now } : planRun(mode, now);
  // Never at 3 AM, whoever asks: the same hours a run keeps on its own, by
  // the business's clock. A send that would go out past them moves to nine.
  const send = plan.kind === "send" ? plan : null;
  const open = send ? nextOpenMoment(ctx.tz, send.at) : null;
  const movedFrom = send && open?.moved ? send.at.toISOString() : null;
  const goesAt = open ? open.at : now;

  // Which of WhatsApp, text and email the playbook ticks: a playbook made before ticks WhatsApp alone.
  const channels = parseChannels(undefined, p.channels ?? null);
  const run: Run = { ports, p, ctx, by, runFor, mode, channels, record, off };
  // A call or a note for the team (decision 0065): nothing is sent, so no message is read and no channel asked of.
  const hand = isFollowUp(p) ? handOf(p.hand) : null;
  if (hand) return runPeopleHand(run, hand);

  // WhatsApp's version, where it is all the run goes by, must still be what Meta approved; the number must be one Meta
  // lets send (when WhatsApp is ticked).
  const message = await readMessage(run);
  if ("error" in message) return { outcome: "failed", error: message.error };
  const gate = await allowed(run, message);
  if (gate.ended) return gate.ended;

  // The channels as this message can go by them: the workspace's, with what the message holds in them (contracts
  // messageHolds: WhatsApp's only while Meta approves its version, an email's and a text's by having one). The run never
  // fails over one: the people a channel cannot carry are held (`no_channel`), and the rest go on their own versions.
  const how: CampaignHow = {
    channels,
    ready: readyForMessage(ctx.ready, message.m),
    // A visit's or a follow-up's message is theirs; any other moment's, the business's news (decision D1).
    about: messageAboutOfTrigger(p.trigger),
  };
  const drawn = await drawOf(run, message.m, how, gate.listIds);
  if ("error" in drawn) return { outcome: "failed", error: drawn.error };
  const { eligible, reach, channelOf, dropped } = drawn;
  // A WhatsApp version Meta does not approve holds WhatsApp's people alone: none is drawn on it, and the purpose stays
  // the message's own category. A run that ticks WhatsApp and has nobody on email or text stops on it, as it always did.
  if (templateHolds(run, message, eligible.length)) return off("template_not_approved");
  if (eligible.length === 0) {
    await record({ mode, eligible: 0, reach, ...(dropped ? { dropped } : {}) });
    return { outcome: "empty", eligible: 0, mode };
  }

  const past = await pastTheRoom(run, message.m, { eligible, channelOf }, goesAt);
  if ("error" in past) return { outcome: "failed", error: past.error };
  const specs = parseParamSpecs(p.params);
  const facts = recipientFacts(run, goesAt);
  const n = eligible.length;
  const made = await assembleRun(ports, {
    broadcast: {
      name: `${p.name} · ${runFor}`,
      template_id: p.template_id,
      template_name: p.template_name,
      template_language: p.template_language,
      params: specs,
      // The run's own audience: the playbook, its moment (which the month's allowance asks at the wire), and who it
      // named and left out.
      audience: {
        kind: "playbook",
        id: p.id,
        label: p.name,
        trigger: p.trigger,
        reach,
        ...(gate.kept ? { list: gate.kept } : {}),
      },
      state: plan.state,
      scheduled_for: goesAt.toISOString(),
      recipient_count: n,
      created_by: by.kind === "user" ? by.userId : p.created_by,
      playbook_id: p.id,
      run_for: runFor,
      channels: [...channels],
    },
    // Each person on the channel the pick gave them (reachFor): written on their row, which the sender goes by.
    recipients: eligible.map((person) => ({
      contact_id: person.id,
      facts: facts(person),
      channel: channelOf[person.id] ?? "whatsapp",
    })),
    sendAt: open ? open.at : null,
    held: past.held,
    // Nobody is enrolled to be left out here: the run drew by its moment's own reading of the week's breath
    // (eligibleForPlaybook over its touches), which leaves out who heard, or, for an appointment's message, sends anyway.
    leftOut: [],
    // The ledger's line, in the run's own write: a run that sends says whose decision it was; one that waits says nothing
    // until a person approves it.
    decision: open ? decisionOf(run, { n, at: open.at, movedFrom }) : null,
  });
  if (!made.ok) return { outcome: "failed", error: made.error };
  touchEnrolled(run, goesAt, eligible, past.held);

  await sayTheRun(run, { madeId: made.id, n, at: open ? open.at : null });
  await record({
    mode,
    eligible: n,
    reach,
    broadcast_id: made.id,
    state: plan.state,
    ...(movedFrom ? { moved_from: movedFrom } : {}),
    // Held at enrolment for the month's allowance (allowance.ts).
    ...allowanceRecord(past.held.length, made.unheld),
  });
  // A sent run says when it really goes, so the person who asked is not told "now" over a run moved to nine.
  return open
    ? {
        outcome: "sent",
        broadcast_id: made.id,
        eligible: n,
        mode,
        state: plan.state,
        scheduled_for: open.at.toISOString(),
        moved_from: movedFrom,
      }
    : { outcome: "held", broadcast_id: made.id, eligible: n, mode, state: plan.state };
}
