import {
  clockWhen,
  localDate,
  nextOpenMoment,
  parseParamSpecs,
  listToken,
  planRun,
  PLAYBOOK_CALENDAR_UNREAD,
  playbookListRef,
  playbookRunReach,
  playbookStopBy,
  enrolPurpose,
  messageAboutOfTrigger,
  proposalFactsFor,
  touchesAfterRun,
  triggerOf,
  triggerOffered,
  vetoRunNotice,
  visitFactsFor,
  type CampaignHow,
  type ConsentChannel,
  type PersonRowVM,
  type PlaybookTrigger,
  type RunPlan,
  type RunReach,
} from "@chanlytics/contracts";
import { assembleRun } from "./assemble";
import { allowanceRecord, pastTheMonth } from "./allowance";
import { parseChannels, readyForMessage, versionsHeld } from "./message-channels";
import type { PlaybookRow, RunBy, RunContext, RunOutcome, RunPlaybookCommand, RunPlaybookPorts } from "./ports";

type Skipped = Extract<RunOutcome, { outcome: "off" }>["skipped"];

/** A list as it was counted for a run, kept on it (decision 0009, "sends remember"). */
type KeptList = { token: string; rule: unknown; counted_at: string };

/** One run as its steps share it: the world, the playbook, the day, the mode, and the two things any step may end it with. */
interface Run {
  ports: RunPlaybookPorts;
  p: PlaybookRow;
  ctx: RunContext;
  by: RunBy;
  runFor: string;
  mode: string;
  /** The channels the playbook ticks (contracts reachFor reads them at enrolment). */
  channels: ConsentChannel[];
  record(data: Record<string, unknown>): Promise<void>;
  off(skipped: Skipped, opts?: { record?: boolean }): Promise<RunOutcome>;
}
/** The message as the run reads it: Meta's row, and which of email and text hold a version of it. */
type Message = {
  row: Awaited<ReturnType<RunPlaybookPorts["template"]>>;
  own: readonly string[];
  /** Whether Meta approves the WhatsApp template: its version of the message, which WhatsApp's people alone need. */
  approved: boolean;
};

/**
 * The template as Meta has it now, and the versions of it the playbook's other ticks need. A read that could not be made
 * is this run failing, not the template withdrawn: nothing is recorded, so the next sweep asks again rather than
 * skipping the day.
 */
async function readMessage(r: Run): Promise<Message | { error: string }> {
  const { ports, p } = r;
  try {
    const row = await ports.template(p.template_name, p.template_language);
    const own = r.channels.some((c) => c !== "whatsapp")
      ? await ports.versions(p.template_name, p.template_language)
      : [];
    return { row, own, approved: row?.meta_status === "approved" };
  } catch (e) {
    return { error: `template: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Whether WhatsApp's template alone ends a run that drew `drawn` people: the run ticks WhatsApp, Meta does not approve
 * its template, and nobody was drawn on email or text (a template Meta does not approve draws nobody on WhatsApp).
 */
const templateHolds = (r: Run, m: Message, drawn: number): boolean =>
  drawn === 0 && !m.approved && r.channels.includes("whatsapp");

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
 * template stops it only when WhatsApp is all the run goes by: one that also ticks email or text goes on for them, and
 * is stopped by it later (`templateHolds`) only if nobody drawn is on either.
 */
async function allowed(
  r: Run,
  tpl: Message["row"],
): Promise<{ ended: RunOutcome } | { ended: null; listIds: ReadonlySet<string> | null; kept: KeptList | undefined }> {
  const { p, ctx } = r;
  const stop = playbookStopBy({
    channels: r.channels,
    templateStatus: tpl?.meta_status ?? null,
    numberCanSend: ctx.health.canSend,
  });
  if (stop) return { ended: await r.off(stop) };
  // One run per local day: a second ask says so and records nothing twice.
  if (await r.ports.alreadyRan(p.id, r.runFor)) return { ended: await r.off("already_ran_today", { record: false }) };
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
  // A proposal follow-up where deals are off has no proposals to follow: off, and the run says so (0006).
  if (trig && !triggerOffered(trig, ctx.dealsOn)) return { ended: await r.off("deals_off") };
  return { ended: null, listIds, kept };
}

/**
 * Who the run reaches, each on one channel, with the number's daily limit as a ceiling on WhatsApp's people, and who it
 * leaves out, and why, counted as it goes (playbookRunReach): the run keeps the counts, so the sheet it is approved from
 * can say "186 of 312, 94 never said yes" instead of only the rules that made its list. Enrolled by the stricter of the
 * moment's class and the message's category (`message`, enrolPurpose), on the channels the playbook ticks that the
 * workspace can send on now and the message has a version on (`how`).
 *
 * The limit is Meta's: it holds WhatsApp's people alone, and an email or a text is never held for it. The people past it
 * are named in the run's record, never dropped in silence.
 */
function draw(
  r: Run,
  message: Message["row"],
  how: CampaignHow,
  listIds: ReadonlySet<string> | null,
): { eligible: PersonRowVM[]; reach: RunReach; channelOf: Record<string, ConsentChannel>; dropped: number } {
  const { p, ctx } = r;
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
      byThis: ctx.touches.byThis.get(p.id) ?? new Map(),
      byAny: ctx.touches.byAny,
      followUps: ctx.touches.followUps,
    },
    ctx.now.getTime(),
    ctx.pace,
    listIds,
  );
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
 * Who of the people drawn the month's allowance already holds (allowance.ts): read before anyone is enrolled, so the run's
 * report says so up front. A booking moment's message about a visit is never held by it (contracts heldByAllowance), by the
 * purpose the run enrolled by (enrolPurpose), so a booking moment that sends an offer is metered. A count that could not be
 * read is this run failing, as a template that could not be read is: nothing is recorded and the next sweep asks again,
 * rather than a run enrolling past a room nobody counted.
 */
async function pastTheRoom(
  r: Run,
  message: Message["row"],
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
  const trig = triggerOf(p.trigger);
  return (person) => {
    if (trig?.kind === "deal") return proposalFactsFor(p.trigger, person);
    const v = ctx.visits.get(person.id);
    // The service alone: the person's own name comes out of the event's title (visitFactsFor).
    return visitFactsFor(
      p.trigger,
      p.trigger === "visit_tomorrow" ? (v?.next ?? null) : (v?.last ?? null),
      ctx.tz,
      [person.givenName, person.waName],
      goesAt,
    );
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
    eligible.filter((person) => !skipped.has(person.id)).map((person) => person.id),
  );
}

/**
 * A run is made: the ledger, and the bell. A run that sends is on the ledger as whose decision it was (the system's
 * under the mode the owner chose; a person's when they asked for it). One that waits for a person tells them. And one
 * the sweep made under veto, which goes by itself, tells them when: "unless you stop it" is kept only for someone who
 * is told, and until this nobody was unless Campaigns happened to be open.
 */
async function sayTheRun(
  run: Run,
  made: { madeId: string; n: number; at: Date | null; movedFrom: string | null },
): Promise<void> {
  const { ports, p, ctx, by, mode, channels } = run;
  const { n, at } = made;
  if (!at) {
    await ports.notify(
      `Playbook “${p.name}” is ready: ${n} ${n === 1 ? "person" : "people"}`,
      `${n} ${n === 1 ? "person has" : "people have"} become eligible for “${p.name}”. Approve or skip the run on Today or in Campaigns. Nothing is sent until you do.`,
      made.madeId,
    );
    return;
  }
  await ports.decide({
    broadcastId: made.madeId,
    by,
    payload: {
      playbook_id: p.id,
      playbook: p.name,
      mode,
      recipients: n,
      channels: [...channels],
      scheduled_for: at.toISOString(),
      run_now: by.kind === "user",
      ...(made.movedFrom ? { moved_from: made.movedFrom } : {}),
    },
  });
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
 * counted by why, never moved to another channel. What the run then does is the
 * class's autonomy mode: auto schedules the send now, veto schedules it half
 * an hour ahead with a Stop, ask leaves it waiting for a person, never does
 * nothing. A person who asks for a run now has decided: it sends now, unless
 * the class is set to never. Never at 3 AM, whoever asks: a send that would
 * go out past the hours a run keeps on its own (a "Run now" at eleven at
 * night, a veto window ending past twenty) goes at nine, and the ledger says
 * what was asked for. Every run is recorded as an event, a run that found
 * nobody included. A run never throws: the sweep behind it must go on.
 */
export async function runPlaybook(ports: RunPlaybookPorts, cmd: RunPlaybookCommand): Promise<RunOutcome> {
  const { playbook: p, ctx, by } = cmd;
  const now = ctx.now;
  const runFor = cmd.runFor ?? localDate(ctx.tz, now);
  // No row for the class means ask — the safest.
  const mode = ctx.modes.get(p.policy_class) ?? "ask";
  const record = (data: Record<string, unknown>) =>
    ports.record(p.id, runFor, now, { run_for: runFor, by: by.kind, ...data });
  // Off, and the run says why -- recorded, unless the day's run already stands.
  const off = async (skipped: Skipped, opts: { record?: boolean } = {}): Promise<RunOutcome> => {
    if (opts.record !== false) await record({ mode, skipped });
    return { outcome: "off", mode, skipped };
  };
  // A person who asks has decided: it sends now, unless the class is never.
  const plan: RunPlan =
    by.kind === "user"
      ? mode === "never"
        ? { kind: "off" }
        : { kind: "send", state: "scheduled", at: now }
      : planRun(mode, now);
  if (plan.kind === "off") return off("never");
  // Never at 3 AM, whoever asks: the same hours a run keeps on its own, by
  // the business's clock. A send that would go out past them moves to nine.
  const send = plan.kind === "send" ? plan : null;
  const open = send ? nextOpenMoment(ctx.tz, send.at) : null;
  const movedFrom = send && open?.moved ? send.at.toISOString() : null;
  const goesAt = open ? open.at : now;

  // Which of WhatsApp, text and email the playbook ticks: a playbook made before ticks WhatsApp alone.
  const channels = parseChannels(undefined, p.channels ?? null);
  const run: Run = { ports, p, ctx, by, runFor, mode, channels, record, off };

  // The template must still be what Meta approved; the number must be one Meta lets send (when WhatsApp is ticked).
  const message = await readMessage(run);
  if ("error" in message) return { outcome: "failed", error: message.error };
  const gate = await allowed(run, message.row);
  if (gate.ended) return gate.ended;

  // The channels as this message can go by them: the workspace's, with the message's own versions in them (WhatsApp's
  // only while Meta approves its template). The run never fails over one: the people a channel cannot carry are held
  // (`no_channel`), and the rest go on their own versions.
  const how: CampaignHow = {
    channels,
    ready: readyForMessage(ctx.ready, versionsHeld(message.own, message.approved)),
    // A visit's or a follow-up's message is theirs; any other moment's, the business's news (decision D1).
    about: messageAboutOfTrigger(p.trigger),
  };
  const { eligible, reach, channelOf, dropped } = draw(run, message.row, how, gate.listIds);
  // A template Meta does not approve holds WhatsApp's people alone: none is drawn on it, and the purpose stays the
  // message's own category. A run that ticks WhatsApp and has nobody on email or text stops on it, as it always did.
  if (templateHolds(run, message, eligible.length)) return off("template_not_approved");
  if (eligible.length === 0) {
    await record({ mode, eligible: 0, reach, ...(dropped ? { dropped } : {}) });
    return { outcome: "empty", eligible: 0, mode };
  }

  const past = await pastTheRoom(run, message.row, { eligible, channelOf }, goesAt);
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
  });
  if (!made.ok) return { outcome: "failed", error: made.error };
  touchEnrolled(run, goesAt, eligible, past.held);

  await sayTheRun(run, { madeId: made.id, n, at: open ? open.at : null, movedFrom });
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
