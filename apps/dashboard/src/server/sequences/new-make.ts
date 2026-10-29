/**
 * New's draft, kept or started (POST sequences/new; decision 0065): what the owner shaped in New, made through the doors
 * every sequence and message is made by. A message Ask wrote is filed first, through the door Ask's message card files one
 * by (write-message.ts writeMessage: its email and text at once, its WhatsApp version sent to Meta), under its first free
 * name; then a sequence to people (doors.ts makeSequenceNow, its first step judged as every campaign's is), a sequence to
 * leads (the same door, `starts` leads: its emails its own words, a call or a note last), or a message sent once (core
 * createBroadcast, the send screen's own verb; kept, a one-off waits under Drafts). Once to leads is a sequence to leads of
 * one email, started: its first email waits for an OK as every one does. Everything is judged again here, whatever New
 * showed: the body is a draft the browser held.
 */
import "server-only";
import {
  AppError,
  NEW_WORDS,
  fromZonedInput,
  leadChainStepOf,
  type ConsentChannel,
  type DraftWho,
  type NewWrittenMessage,
} from "@chanlytics/contracts";
import { createBroadcast } from "@chanlytics/core";
import type { Json } from "@chanlytics/db";
import { keepOnceDraft } from "@chanlytics/db";
import { messageOnFile, writeMessage } from "@/server/campaigns/write-message";
import { load, readerContext } from "@/server/readers";
import * as facts from "@/server/readers/facts";
import { createBroadcastPorts } from "@/server/ports/campaign-ports";
import { log } from "@/server/log";
import { dbRefusal, type RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";
import type { NewMakeBody } from "./bodies";
import { discardBySequenceDoor, makeSequenceNow } from "./doors";

type Step = NewMakeBody["steps"][number];

/** What a make answers: the sequence (or one-off) made, and what it is now. */
interface NewMade {
  made: string;
  kind: NewMakeBody["kind"];
  state: string;
  /** A one-off sent: when it goes, as the send door answered. */
  scheduled_for?: string | null;
}

/** What the one creator answered, as New says it: the sequence it made and its state ('draft' or 'on'). */
function madeOf(r: { id?: string; state?: string }, kind: NewMakeBody["kind"], start: boolean): NewMade {
  if (!r.id) throw new AppError("internal", NEW_WORDS.cannot.noMessage, 500);
  return { made: r.id, kind, state: r.state ?? (start ? "on" : "draft") };
}

/** How many names a written message tries before its title is said to be taken. */
const NAME_TRIES = 9;
/** A message's name's room before its suffix: a template name's sixty characters (contracts slugTemplateName) less "_9". */
const NAME_ROOM = 57;

/** A message Ask wrote, filed under its first free name; the version a step sends (WhatsApp's where filed, else the first). */
async function fileWritten(ctx: RouteContext, member: Member, w: NewWrittenMessage): Promise<string> {
  let name = w.name;
  for (let n = 2; await messageOnFile(ctx, member.tenantId, { name, language: "en" }); n++) {
    if (n > NAME_TRIES) throw new AppError("conflict", NEW_WORDS.cannot.noMessage, 409);
    name = `${w.name.slice(0, NAME_ROOM)}_${n}`;
  }
  const filed = await writeMessage(ctx, member, {
    name,
    language: "en",
    category: w.category,
    versions: w.versions,
    slots: w.slots,
  });
  const v = filed.versions.find((x) => x.channel === "whatsapp" && x.state !== "rejected") ?? filed.versions[0];
  if (!v) throw new AppError("validation", filed.refused?.words ?? NEW_WORDS.cannot.noMessage, 422);
  return v.id;
}

/** The message a person's step sends: one the workspace holds, or the one Ask wrote, filed now. */
async function templateOf(ctx: RouteContext, member: Member, s: Step): Promise<string> {
  if (s.message?.template_id) return s.message.template_id;
  if (s.message?.written) return fileWritten(ctx, member, s.message.written);
  throw new AppError("validation", NEW_WORDS.cannot.noMessage, 422);
}

/**
 * The channels a one-off goes by when it is sent: the draft's, but WhatsApp's where its message is one Ask wrote, whose
 * WhatsApp version goes to Meta as it is filed and is no version to send until Meta approves it (the send door refuses a
 * tick it cannot carry, core message-channels.ts refuseTicks). Its email and text go; nothing waits for Meta (decision
 * 0065, call 8).
 */
export function onceChannelsOf(step: Step, channels: readonly ConsentChannel[]): ConsentChannel[] {
  return step.message?.written ? channels.filter((c) => c !== "whatsapp") : [...channels];
}

/**
 * A kept draft let go once what it became is made: a one-off sent, or a sequence it was drafted again as. The make stands
 * whatever this answers, so a draft that could not go is logged, never said as the make's failure (it would be made twice).
 */
async function letKeptGo(ctx: RouteContext, member: Member, id: string | undefined): Promise<void> {
  if (!id) return;
  try {
    await discardBySequenceDoor(ctx, { id, tenant_id: member.tenantId });
  } catch (e) {
    log.error("sequence_kept_draft_left", { tenant_id: member.tenantId, sequence_id: id, error: e });
  }
}

/** Where a sequence to people starts: its moment, or the list it starts on. */
function peopleStartOf(who: DraftWho): Record<string, string> {
  if (who.kind === "moment") return { trigger: who.trigger };
  if (who.kind === "list" && who.token.startsWith("seg:"))
    return { trigger: "saved_list", list_key: who.token.slice(4) };
  if (who.kind === "list" && who.token.startsWith("list:"))
    return { trigger: "saved_list", list_id: who.token.slice(5) };
  throw new AppError("validation", NEW_WORDS.cannot.nothingFits, 422);
}

/** A sequence to people: each message filed or named, then the one door, its first step judged as every campaign's. */
async function makePeopleSequence(ctx: RouteContext, member: Member, b: NewMakeBody): Promise<NewMade> {
  const [first, ...rest] = b.steps;
  if (!first || first.does !== "message") throw new AppError("validation", NEW_WORDS.cannot.noMessage, 422);
  const firstTemplate = await templateOf(ctx, member, first);
  const then = [];
  for (const s of rest) {
    then.push(
      s.does === "message"
        ? {
            after_days: s.after_days ?? 1,
            template_id: await templateOf(ctx, member, s),
            params: s.message?.params ?? [],
            only_if: s.only_if,
            ...(s.name ? { name: s.name } : {}),
          }
        : {
            after_days: s.after_days ?? 1,
            hand: { kind: s.does, words: s.hand },
            only_if: s.only_if,
            ...(s.name ? { name: s.name } : {}),
          },
    );
  }
  const r = await makeSequenceNow(ctx, member.tenantId, {
    first: {
      name: b.name,
      ...peopleStartOf(b.who),
      template_id: firstTemplate,
      params: first.message?.params ?? [],
      run_hour: b.run_hour,
      channels: b.channels,
      ...(b.mode ? { mode: b.mode } : {}),
    },
    then,
    start: b.start,
  });
  const made = madeOf(r, "sequence", b.start);
  await letKeptGo(ctx, member, b.draft_id);
  return made;
}

/**
 * A sequence to leads as the leads door takes its first step (bodies.ts LEAD_FIRST_BODY): its name and emails, the search
 * its ready leads come from (its pick, and where it adds new ones when New said so) or the leads chosen, how its batches
 * are decided, and whether the owner sends each email. A one-off to leads is its first email alone.
 */
export function leadFirstOf(b: NewMakeBody): Record<string, unknown> {
  const steps = (b.kind === "once" ? b.steps.slice(0, 1) : b.steps).map(leadChainStepOf);
  const from =
    b.who.kind === "search"
      ? { search_id: b.who.id, aim_search_id: b.who.id, ...(b.adds_new ? { source_search_id: b.who.id } : {}) }
      : b.who.kind === "leads"
        ? { lead_ids: b.who.ids }
        : null;
  if (!from) throw new AppError("validation", NEW_WORDS.cannot.nothingFits, 422);
  return {
    starts: "leads",
    name: b.name,
    steps,
    ...from,
    ...(b.mode ? { mode: b.mode } : {}),
    ...(b.owner_sends !== undefined ? { owner_sends: b.owner_sends } : {}),
  };
}

/** A sequence to leads, or a one-off to leads (one email, started): the one door, `starts` leads. */
async function makeLeadSequence(ctx: RouteContext, member: Member, b: NewMakeBody): Promise<NewMade> {
  const start = b.kind === "once" ? true : b.start;
  const r = await makeSequenceNow(ctx, member.tenantId, { first: leadFirstOf(b), then: [], start });
  const made = madeOf(r, b.kind, start);
  await letKeptGo(ctx, member, b.draft_id);
  return made;
}

/** A one-off's audience, as the send door names one: everyone, one of People's lists, or one the workspace keeps. */
function onceAudienceOf(who: DraftWho): { kind: "everyone" | "list" | "saved"; id: string | null } {
  if (who.kind === "everyone") return { kind: "everyone", id: null };
  if (who.kind === "list" && who.token.startsWith("seg:")) return { kind: "list", id: who.token.slice(4) };
  if (who.kind === "list" && who.token.startsWith("list:")) return { kind: "saved", id: who.token.slice(5) };
  throw new AppError("validation", NEW_WORDS.cannot.nothingFits, 422);
}

/**
 * A message sent once to people: its message filed or named, then the send screen's own verb, now (ten minutes on, with
 * a Stop) or at its time by the business's clock, by the channels that carry it then (onceChannelsOf). Kept, it waits
 * under Drafts (00465 sequence_once_keep) and sends nothing; a message Ask wrote is filed as it is kept, so Meta reviews
 * its WhatsApp version while it waits and the draft holds it by its id. A kept one sent lets its draft go.
 */
async function makePeopleOnce(ctx: RouteContext, member: Member, b: NewMakeBody): Promise<NewMade> {
  const step = b.steps[0];
  if (!step || step.does !== "message") throw new AppError("validation", NEW_WORDS.cannot.noMessage, 422);
  const audience = onceAudienceOf(b.who);
  if (!b.start) {
    const filed = step.message?.written
      ? {
          ...step,
          message: { template_id: await templateOf(ctx, member, step), params: step.message.params, written: null },
        }
      : step;
    const kept = await keepOnceDraft(ctx.supabase, {
      tenantId: member.tenantId,
      id: b.draft_id ?? null,
      name: b.name,
      // New's {who, at, channels, step} (contracts NewOnceKept), as the column holds it.
      once: JSON.parse(JSON.stringify({ who: b.who, at: b.at, channels: b.channels, step: filed })) as Json,
    });
    if (kept.error) throw dbRefusal(kept.error);
    return madeOf(kept.data, "once", false);
  }
  const channels = onceChannelsOf(step, b.channels);
  if (channels.length === 0) throw new AppError("conflict", NEW_WORDS.review.noneYet, 409);
  const templateId = await templateOf(ctx, member, step);
  const tz = (await load(readerContext(ctx, member), facts.facts, undefined)).data.timezone;
  const at = b.at ? fromZonedInput(b.at, tz) : null;
  const sent = await createBroadcast(createBroadcastPorts(ctx, member.tenantId, { fresh: true }), {
    userId: ctx.userId,
    body: {
      template_id: templateId,
      params: step.message?.params ?? [],
      audience,
      channels,
      name: b.name,
      ...(at !== null ? { scheduled_for: new Date(at).toISOString() } : {}),
    },
    now: new Date(),
  });
  // A kept one-off, sent, is the one-off now: its draft goes.
  await letKeptGo(ctx, member, b.draft_id);
  return { made: sent.id, kind: "once", state: "on", scheduled_for: sent.scheduled_for };
}

export async function makeFromNew(ctx: RouteContext, member: Member, b: NewMakeBody): Promise<NewMade> {
  if (b.audience === "leads") return makeLeadSequence(ctx, member, b);
  if (b.kind === "once") return makePeopleOnce(ctx, member, b);
  return makePeopleSequence(ctx, member, b);
}
