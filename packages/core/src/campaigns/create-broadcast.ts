import {
  AppError,
  AUDIENCE_KINDS,
  nextOpenMoment,
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_NAME_MAX,
  BROADCAST_SCHEDULE_MAX_DAYS,
  BUILTIN_LISTS,
  CAMPAIGNS_PAUSED_WORDS,
  EVERYONE_LABEL,
  broadcastName,
  emptyAudienceRefusal,
  enrolFor,
  overLimitRefusal,
  paramLabel,
  readyForMessage,
  UUID,
  type Audience,
  type AudienceKind,
  type AskedPurpose,
  type MessageAbout,
  type CampaignHow,
  type CampaignMessage,
  type ConsentChannel,
  type NumberHealth,
  type PersonRowVM,
  listToken,
  type ListRef,
  DAY_MS,
} from "@chanlytics/contracts";
import { errField, logger } from "@chanlytics/channels";
import { assembleRun } from "./assemble";
import { allowanceRecord, pastTheMonth } from "./allowance";
import { parseChannels, refuseTicks } from "./message-channels";
import { templateValues } from "./template-values";
import type { CreateBroadcastCommand, CreateBroadcastPorts } from "./ports";

/** An instant names its offset: "Z" or "±hh:mm". A date alone, or a wall-clock time without one, is read on the server's clock. */
const OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * A broadcast's own lines, by name: the step that failed, with the cause. The cause is the log's and never the answer's: a
 * database's own text is not a person's to read, and the route sends an error's details to the browser as they stand.
 */
const createLog = logger();

export interface BroadcastReceipt {
  id: string;
  name: string;
  state: "scheduled";
  recipient_count: number;
  scheduled_for: string;
  /** The time asked for (or "now") when it fell outside the hours a send may go out in, and was moved. */
  moved_from: string | null;
  /**
   * How many of the people enrolled the month's allowance already holds, as written on the run (allowance.ts): held and
   * said so. A hold that could not be written is not counted: that person is queued and held at the wire, and the log
   * says so (`campaign_hold_unwritten`); the ledger's line says how many the month holds.
   */
  held_for_allowance: number;
  decision_id: string;
}

/** What the body asks for that needs no workspace read to judge: the message, who, which list, how, and the rest as given. */
interface Asked {
  templateId: string;
  kind: AudienceKind;
  audienceId: string | null;
  ref: ListRef | null;
  channels: ConsentChannel[];
  params: unknown;
  scheduledFor: unknown;
  name: unknown;
}

/** The body, judged in the order a person fills it in: the template, who it goes to, the list, the channels. */
function asked(raw: unknown): Asked {
  const body = raw as {
    template_id?: unknown;
    params?: unknown;
    audience?: { kind?: unknown; id?: unknown } | null;
    scheduled_for?: unknown;
    name?: unknown;
    channels?: unknown;
  } | null;
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  if (!UUID.test(templateId)) throw new AppError("validation", "Pick a template.");
  const kind = body?.audience?.kind;
  if (typeof kind !== "string" || !(AUDIENCE_KINDS as readonly string[]).includes(kind)) {
    throw new AppError("validation", "Pick who this goes to.");
  }
  const audienceId = typeof body?.audience?.id === "string" ? body.audience.id : null;
  // A list is a reference (contracts lists.ts): a built-in by its id, a saved list by its. The wire keeps its
  // kind and id, which is the same reference by another spelling.
  if (kind === "saved" && (!audienceId || !UUID.test(audienceId))) throw new AppError("validation", "Pick a list.");
  if (kind === "list" && (!audienceId || !BUILTIN_LISTS.some((l) => l.id === audienceId)))
    throw new AppError("validation", "Pick a list.");
  const ref: ListRef | null =
    audienceId && kind === "list"
      ? { kind: "builtin", id: audienceId }
      : audienceId && kind === "saved"
        ? { kind: "saved", id: audienceId }
        : null;
  return {
    templateId,
    kind: kind as AudienceKind,
    audienceId,
    ref,
    // Which of WhatsApp, text and email it may go by: WhatsApp alone when it names none, as every broadcast went before.
    channels: parseChannels(body?.channels),
    params: body?.params,
    scheduledFor: body?.scheduled_for,
    name: body?.name,
  };
}

/**
 * When, as asked: an instant with its offset. A date alone would be read as midnight UTC -- the evening before, in this
 * hemisphere -- and a wall-clock time without an offset on the server's clock, not the business's; either lands the
 * send at the wrong moment with no note.
 */
function askedTime(scheduledFor: unknown, now: Date): Date {
  if (typeof scheduledFor !== "string" || !scheduledFor) return now;
  const t = new Date(scheduledFor);
  if (Number.isNaN(t.getTime())) throw new AppError("validation", "That is not a time.");
  if (!OFFSET.test(scheduledFor))
    throw new AppError("validation", "Give the time with its offset, like 2026-09-20T15:00:00-04:00.");
  return t.getTime() > now.getTime() ? t : now;
}

/**
 * The channels a send goes by as its message can carry them, and the WhatsApp number's health the day's limit is judged
 * by: the workspace's channels now (its number, its texting line, its mailbox) with the versions the message holds laid
 * over them (contracts readyForMessage), WhatsApp's among them: a version WhatsApp has not approved is no
 * version to send. Refuses nothing: a playbook keeps a tick that cannot send yet, and Ask counts a proposal by it.
 */
export async function campaignHow(
  ports: Pick<CreateBroadcastPorts, "channels">,
  message: Pick<CampaignMessage, "versions">,
  channels: ConsentChannel[],
  /** What the message is about: a broadcast's is ours, a visit or proposal moment's theirs (contracts MessageAbout). */
  about: MessageAbout,
): Promise<{ how: CampaignHow; health: NumberHealth | null }> {
  const { ready, health } = await ports.channels();
  return { how: { channels, ready: readyForMessage(ready, message), about }, health };
}

/**
 * The channels this send may go by, and the WhatsApp number's health the day's limit is judged by. A tick the workspace
 * cannot send on, or whose message has no version, or that the purpose never carries, is refused here and now (spec
 * 4.10), in the words of contracts channelChoices -- before the people are read, which is the costly read. The number's
 * health is held to only when WhatsApp is ticked: a send that does not tick it never asks.
 *
 * The one rule for a broadcast's ticks: the route asks it, and so does Ask before it proposes one, so a card the route
 * would refuse is never shown.
 */
export async function campaignHowOf(
  ports: Pick<CreateBroadcastPorts, "channels">,
  message: Pick<CampaignMessage, "versions">,
  channels: ConsentChannel[],
  purpose: AskedPurpose,
): Promise<{ how: CampaignHow; health: NumberHealth | null }> {
  // A broadcast is news the business chose to send, whatever its message's category (decision D1).
  const made = await campaignHow(ports, message, channels, "ours");
  // A paused workspace sends nothing: the door refuses every message of the run (deliver.ts `paused`), so a broadcast made
  // under one would be enrolled, scheduled, and stopped by the first batch. It is refused here, in the words the composers
  // say it in (their Send is not offered), before the people are read.
  if (made.how.ready.paused) throw new AppError("payment_required", CAMPAIGNS_PAUSED_WORDS);
  refuseTicks(made.how, purpose);
  return made;
}

/**
 * The audience before anyone is left out: everyone, or one list's people, counted the one way. A list that can't be
 * counted here is refused in its own words, never sent to nobody. With their appointments, so a calendar list (Lapsed,
 * Asked never booked) enrols exactly the people the page counted; and what the list meant is kept on the send (decision
 * 0009): a rule edited later never changes who this was for.
 */
async function audienceOf(
  ports: CreateBroadcastPorts,
  ref: ListRef | null,
  now: Date,
): Promise<{ pool: PersonRowVM[]; label: string; kept: Audience["list"] | undefined }> {
  const rows = await ports.people(now);
  if (!ref) return { pool: rows, label: EVERYONE_LABEL, kept: undefined };
  const found = await ports.list(ref, now);
  if (!found) throw new AppError("not_found", "List not found.", 404);
  if ("unknown" in found) throw new AppError("conflict", `${found.label} can't be counted here. ${found.unknown}`, 409);
  const members = new Set(found.memberIds);
  // One path for a built-in and a saved list alike.
  return {
    pool: rows.filter((r) => members.has(r.id)),
    label: found.label,
    kept: { token: listToken(ref), rule: found.rule ?? null, counted_at: now.toISOString() },
  };
}

/**
 * A person's broadcast: one message to the people who said yes.
 *
 * { template_id, params, audience: { kind, id }, channels?, scheduled_for?, name? }.
 * `template_id` is any version of the message, and the message needs no WhatsApp
 * version: each channel ticked needs only its own (WhatsApp's approved by Meta, an
 * email's and a text's written here), and a tick whose version the message does not
 * hold is refused with that version's standing; the values must fill the message's
 * slots; the audience is one of People's lists, a list kept by hand, or everyone —
 * crossed with who said yes and a way to reach them, for the yes this message's
 * category needs. It goes by WhatsApp, text or email (`channels`, WhatsApp alone
 * when none is named), each person once, on the first channel the send can reach
 * them on (contracts reachFor), written on their row. The recipients are enrolled
 * now, so the owner sees who and how many; the job re-checks each person at the
 * wire. The ledger records the decision to send, in the run's own write. The body is judged here, in
 * sentences for the person composing: the values are judged against the message
 * the workspace holds, which no schema knows.
 */
export async function createBroadcast(
  ports: CreateBroadcastPorts,
  cmd: CreateBroadcastCommand,
): Promise<BroadcastReceipt> {
  const { now } = cmd;
  const want = asked(cmd.body);

  // 1–2. The message, as the workspace holds it; the values, as its slots take them.
  const { message, specs } = await templateValues(ports, {
    templateId: want.templateId,
    params: want.params,
    visits: false,
    proposal: false,
  });

  // 3. When, as asked; and the channels it may go by, which a flagged number or a message with no version on one
  // refuses (a flagged number does not broadcast).
  let when = askedTime(want.scheduledFor, now);
  // WHICH yes this send needs, from the message's category: the send job derives the same purpose from the same
  // rows, so the audience enrolled here is the audience the wire will accept.
  const purpose = message.purpose;
  const { how, health } = await campaignHowOf(ports, message, want.channels, purpose);

  // 4. The audience, crossed with who said yes and a channel to reach them on.
  const { pool, label, kept } = await audienceOf(ports, want.ref, now);
  const enrolled = enrolFor(pool, "everyone", null, null, purpose, how);
  // Nobody to send to says which of its two causes it is: nobody on it said this yes, or the ones who did have no
  // number. So the refusal is handed everyone on the audience, before anyone is left out.
  if (enrolled.length === 0) throw new AppError("conflict", emptyAudienceRefusal(purpose, label, pool, how), 409);
  if (enrolled.length > BROADCAST_MAX_RECIPIENTS)
    throw new AppError("validation", `At most ${BROADCAST_MAX_RECIPIENTS} people in one broadcast.`);
  // An audience past the day's limit is split, not silently cut: WhatsApp's limit is Meta's, so it counts the people
  // who go by WhatsApp alone.
  const over = health ? overLimitRefusal(health, enrolled.filter((e) => e.channel === "whatsapp").length) : null;
  if (over) throw new AppError("validation", over);

  // 4b. Never at 3 AM. The same window the playbooks keep, by the business's
  // own clock: a time outside it -- asked for, or "now" at eleven at night --
  // moves to nine the next morning, and the receipt says so. The ceiling is
  // judged on the moment it really goes, not the one asked for. Before the month is counted, which is counted at that
  // moment.
  const tz = await ports.timezone();
  const open = nextOpenMoment(tz, when);
  const movedFrom = open.moved ? when.toISOString() : null;
  when = open.at;
  if (when.getTime() > now.getTime() + BROADCAST_SCHEDULE_MAX_DAYS * DAY_MS)
    throw new AppError("validation", `Schedule within ${BROADCAST_SCHEDULE_MAX_DAYS} days.`);

  // The month's allowance, read before anyone is enrolled: emails and texts are metered, and the people past the room are
  // enrolled held, so the run's report says so up front. A count that could not be made is not room, and the broadcast
  // waits for one rather than enrol past a month nobody counted. A broadcast has no moment, so every email and text is held.
  // Counted in the month the run OPENS in, not the one it was made in: made on the 28th for the 1st, it sends in the new month.
  const past = await pastTheMonth(
    { monthSent: (channel) => ports.monthSent(channel, when) },
    enrolled.map((e) => ({ id: e.row.id, channel: e.channel })),
    null,
    purpose,
  ).catch((e: unknown) => {
    createLog.error("campaign_step_failed", { step: "month_count", error: errField(e) });
    throw new AppError(
      "internal",
      "This month's emails and texts could not be counted just now. Nothing was sent; try again.",
      500,
    );
  });

  // Named for the business's day, not the server's (UTC on Vercel).
  const name =
    typeof want.name === "string" && want.name.trim()
      ? want.name.trim().slice(0, BROADCAST_NAME_MAX)
      : broadcastName(message.name, tz, now, message.title);
  const audience: Audience = {
    kind: want.kind,
    id: want.audienceId,
    label,
    ...(kept ? { list: kept } : {}),
  };

  // 5. The rows, the job and the ledger's line, whole (00282, with its decision since 00381): a decision that could not
  // be written is a run that was not made, never a 500 for one that was, which a person answers by pressing again.
  const decision = {
    by: { kind: "user" as const, userId: cmd.userId },
    payload: {
      name,
      template: `${message.name}/${message.language}`,
      category: message.category,
      // The ledger names the list by its token; the send's own row keeps the rule it was counted by.
      audience: { kind: audience.kind, id: audience.id, label: audience.label, ...(kept ? { list: kept.token } : {}) },
      channels: [...how.channels],
      values: specs.map(paramLabel),
      recipients: enrolled.length,
      scheduled_for: when.toISOString(),
      ...(movedFrom ? { moved_from: movedFrom } : {}),
      // As a playbook's run records it: how many the month holds. The hold is its own write after the run, and one that
      // could not be made is logged there (assemble.ts) and counted on the receipt; the ledger's line says what was asked.
      ...allowanceRecord(past.length, 0),
    },
  };
  const made = await assembleRun(ports, {
    broadcast: {
      name,
      // The message's anchor, whichever version's id was picked: the one id every version of it resolves to.
      template_id: message.anchor.id,
      template_name: message.name,
      template_language: message.language,
      params: specs,
      audience,
      state: "scheduled",
      scheduled_for: when.toISOString(),
      recipient_count: enrolled.length,
      created_by: cmd.userId,
      channels: [...how.channels],
    },
    recipients: enrolled.map((e) => ({ contact_id: e.row.id, facts: null, channel: e.channel })),
    sendAt: when,
    held: past.map((p) => p.id),
    decision,
  });
  if (!made.ok) {
    // A sentence for the person: nothing was written, and a bare error reached them as "Something went wrong". What the
    // database said is the log's.
    createLog.error("campaign_step_failed", { step: "assemble", error: made.error });
    throw new AppError("internal", "The broadcast could not be created. Nothing was sent; try again.", 500);
  }
  // The door answers the decision's id with the run's; one was asked for, so an answer without it is refused where
  // the door is called (db assembleBroadcast), never read as a run made with none.
  if (made.decisionId === null) throw new Error("createBroadcast: the run's door answered without its decision");
  return {
    id: made.id,
    name,
    state: "scheduled",
    recipient_count: enrolled.length,
    scheduled_for: when.toISOString(),
    moved_from: movedFrom,
    // What was actually held at enrolment: a hold that could not be written is queued and held at the wire (the backstop),
    // so it is not claimed here.
    held_for_allowance: past.length - made.unheld,
    decision_id: made.decisionId,
  };
}
