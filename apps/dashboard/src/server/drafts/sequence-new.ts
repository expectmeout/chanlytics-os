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
import { randomUUID } from "node:crypto";
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
import { keepOnceDraft, type MessageVersionRow } from "@chanlytics/db/campaigns";
import { getMessageOnFile, writeMessage } from "@/server/campaigns/write-message";
import { fileStarterForUse, findStarterStandIn } from "@/server/campaigns/starter-templates";
import { load, readerContext } from "@/server/shared/reader";
import * as facts from "@/server/readers/facts";
import { createBroadcastPorts } from "@/server/campaigns/ports";
import { log } from "@/server/shared/log";
import { dbRefusal, type RouteContext } from "@/server/shared/with-route";
import type { Member } from "@/server/shared/route";
import type { NewMakeBody, NewSequenceBody } from "../campaigns/sequences/bodies";
import { discardBySequenceDoor, judgeSequenceNow, makeSequenceNow } from "../campaigns/sequences/doors";
import { jsonCopyOf } from "@chanlytics/db/shared";

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
function newMadeOf(r: { id?: string; state?: string }, kind: NewMakeBody["kind"], start: boolean): NewMade {
  if (!r.id) throw new AppError("internal", NEW_WORDS.cannot.noMessage, 500);
  return { made: r.id, kind, state: r.state ?? (start ? "on" : "draft") };
}

/** How many names a written message tries before its title is said to be taken. */
const NAME_TRIES = 9;
/** A message's name's room before its suffix: a template name's sixty characters (contracts slugTemplateName) less "_9". */
const NAME_ROOM = 57;

/** A message Ask wrote, filed under its first free name; the version a step sends (WhatsApp's where filed, else the first). */
async function fileWritten(ctx: RouteContext, member: Member, newWrittenMessage: NewWrittenMessage): Promise<string> {
  let name = newWrittenMessage.name;
  for (let n = 2; await getMessageOnFile(ctx, member.tenantId, { name, language: "en" }); n++) {
    if (n > NAME_TRIES) throw new AppError("conflict", NEW_WORDS.cannot.noMessage, 409);
    name = `${newWrittenMessage.name.slice(0, NAME_ROOM)}_${n}`;
  }
  const filed = await writeMessage(ctx, member, {
    name,
    language: "en",
    category: newWrittenMessage.category,
    versions: newWrittenMessage.versions,
    slots: newWrittenMessage.slots,
  });
  const found = filed.versions.find((x) => x.channel === "whatsapp" && x.state !== "rejected") ?? filed.versions[0];
  if (!found) throw new AppError("validation", filed.refused?.words ?? NEW_WORDS.cannot.noMessage);
  return found.id;
}

/**
 * The message a person's step sends: one the workspace holds, the one Ask wrote, filed now, or a ready-made starter, filed
 * now on the channels the draft goes by (starter-templates.ts fileStarterForUse: nothing is filed before a use).
 */
async function templateOf(
  ctx: RouteContext,
  member: Member,
  step: Step,
  channels: readonly ConsentChannel[],
): Promise<string> {
  if (step.message?.template_id) return step.message.template_id;
  if (step.message?.written) return fileWritten(ctx, member, step.message.written);
  if (step.message?.starter) return fileStarterForUse(ctx, member.tenantId, step.message.starter, channels);
  throw new AppError("validation", NEW_WORDS.cannot.noMessage);
}

/** A step's message that is filed as the draft is made: one Ask wrote, or a ready-made starter. */
const filedOnMake = (step: Step): boolean => !!(step.message?.written || step.message?.starter);

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
function peopleStartOf(draftWho: DraftWho): Record<string, string> {
  if (draftWho.kind === "moment") return { trigger: draftWho.trigger };
  if (draftWho.kind === "list" && draftWho.token.startsWith("seg:"))
    return { trigger: "saved_list", list_key: draftWho.token.slice(4) };
  if (draftWho.kind === "list" && draftWho.token.startsWith("list:"))
    return { trigger: "saved_list", list_id: draftWho.token.slice(5) };
  throw new AppError("validation", NEW_WORDS.cannot.nothingFits);
}

/**
 * A sequence to people as the one door takes it, each message step's version named by `versionOf`, in the steps' order
 * (a message filed as it is made is filed one step at a time).
 */
async function peopleSequenceOf(
  newMake: NewMakeBody,
  versionOf: (step: Step) => Promise<string>,
): Promise<NewSequenceBody> {
  const [first, ...rest] = newMake.steps;
  if (!first || first.does !== "message") throw new AppError("validation", NEW_WORDS.cannot.noMessage);
  const firstTemplate = await versionOf(first);
  const then = [];
  for (const step of rest) {
    then.push(
      step.does === "message"
        ? {
            after_days: step.after_days ?? 1,
            template_id: await versionOf(step),
            params: step.message?.params ?? [],
            only_if: step.only_if,
            ...(step.name ? { name: step.name } : {}),
          }
        : {
            after_days: step.after_days ?? 1,
            hand: { kind: step.does, words: step.hand },
            only_if: step.only_if,
            ...(step.name ? { name: step.name } : {}),
          },
    );
  }
  return {
    first: {
      name: newMake.name,
      ...peopleStartOf(newMake.who),
      template_id: firstTemplate,
      params: first.message?.params ?? [],
      run_hour: newMake.run_hour,
      channels: newMake.channels,
      ...(newMake.mode ? { mode: newMake.mode } : {}),
    },
    then,
    start: newMake.start,
  };
}

/**
 * A message the AI wrote as its filing will leave it (fileWritten, write-message.ts writeMessage): a row for each version
 * written, its WhatsApp one with WhatsApp to check, under a stand-in id each.
 */
function writtenStandIn(written: NewWrittenMessage): MessageVersionRow[] {
  const variables = written.slots.map((slot) => ({ position: slot.position, label: slot.label }));
  const row = (channel: ConsentChannel, body: string): MessageVersionRow => ({
    id: randomUUID(),
    channel,
    name: written.name,
    language: "en",
    meta_status: channel === "whatsapp" ? "pending" : "approved",
    category: written.category,
    variables,
    hidden_at: null,
    title: null,
    source: "chanlytics",
    components: null,
    body_preview: body,
    rejected_reason: null,
  });
  const { whatsapp, email, sms } = written.versions;
  return [
    ...(whatsapp ? [row("whatsapp", whatsapp.body)] : []),
    ...(email ? [row("email", email.body)] : []),
    ...(sms ? [row("sms", sms.body)] : []),
  ];
}

/**
 * The messages a draft files as it is made (one the AI wrote, a ready-made starter), each read as its filing will leave
 * it, under a stand-in id: what a sequence is judged against before anything of it is filed. A starter the set does not
 * hold stands in for nothing; its filing refuses it in its own words.
 */
async function standInsOf(ctx: RouteContext, member: Member, newMake: NewMakeBody) {
  const ids = new Map<Step, string>();
  const rows = new Map<string, MessageVersionRow[]>();
  for (const step of newMake.steps) {
    const message = step.does === "message" ? step.message : null;
    if (!message || message.template_id) continue;
    const stood = message.written
      ? writtenStandIn(message.written)
      : message.starter
        ? await findStarterStandIn(ctx, member.tenantId, message.starter, newMake.channels)
        : null;
    const id = stood?.[0]?.id;
    if (!stood || !id) continue;
    ids.set(step, id);
    rows.set(id, stood);
  }
  return { ids, rows };
}

/**
 * A sequence to people: judged whole first, each message filed as it is made (a starter, the AI's words) read as its
 * filing will leave it, so a sequence that would be refused files nothing (the review of 15 Nov 2026, C6: a WhatsApp
 * version sent for review cannot be taken back, and a refused Start left a starter filed); then each message filed or
 * named, then the one door, which judges it again over what was filed.
 */
async function makePeopleSequence(ctx: RouteContext, member: Member, newMake: NewMakeBody): Promise<NewMade> {
  const stood = await standInsOf(ctx, member, newMake);
  if (stood.rows.size > 0) {
    const named = (step: Step) => Promise.resolve(stood.ids.get(step) ?? step.message?.template_id ?? "");
    await judgeSequenceNow(ctx, member.tenantId, await peopleSequenceOf(newMake, named), stood.rows);
  }
  const input = await peopleSequenceOf(newMake, (step) => templateOf(ctx, member, step, newMake.channels));
  const item = await makeSequenceNow(ctx, member.tenantId, input);
  const created = newMadeOf(item, "sequence", newMake.start);
  await letKeptGo(ctx, member, newMake.draft_id);
  return created;
}

/**
 * A sequence to leads as the leads door takes its first step (bodies.ts LEAD_FIRST_BODY): its name and emails, the search
 * its ready leads come from (its pick, and where it adds new ones when New said so) or the leads chosen, how its batches
 * are decided, and whether the owner sends each email. A one-off to leads is its first email alone.
 */
export function leadFirstOf(newMake: NewMakeBody): Record<string, unknown> {
  const steps = (newMake.kind === "once" ? newMake.steps.slice(0, 1) : newMake.steps).map(leadChainStepOf);
  const from =
    newMake.who.kind === "search"
      ? {
          search_id: newMake.who.id,
          aim_search_id: newMake.who.id,
          ...(newMake.adds_new ? { source_search_id: newMake.who.id } : {}),
        }
      : newMake.who.kind === "leads"
        ? { lead_ids: newMake.who.ids }
        : null;
  if (!from) throw new AppError("validation", NEW_WORDS.cannot.nothingFits);
  return {
    starts: "leads",
    name: newMake.name,
    steps,
    ...from,
    ...(newMake.mode ? { mode: newMake.mode } : {}),
    ...(newMake.owner_sends !== undefined ? { owner_sends: newMake.owner_sends } : {}),
    ...(newMake.as_drafted ? { as_drafted: newMake.as_drafted } : {}),
  };
}

/** A sequence to leads, or a one-off to leads (one email, started): the one door, `starts` leads. */
async function makeLeadSequence(ctx: RouteContext, member: Member, b: NewMakeBody): Promise<NewMade> {
  const start = b.kind === "once" ? true : b.start;
  const r = await makeSequenceNow(ctx, member.tenantId, { first: leadFirstOf(b), then: [], start });
  const created = newMadeOf(r, b.kind, start);
  await letKeptGo(ctx, member, b.draft_id);
  return created;
}

/** A one-off's audience, as the send door names one: everyone, one of People's lists, or one the workspace keeps. */
function onceAudienceOf(draftWho: DraftWho): { kind: "everyone" | "list" | "saved"; id: string | null } {
  if (draftWho.kind === "everyone") return { kind: "everyone", id: null };
  if (draftWho.kind === "list" && draftWho.token.startsWith("seg:"))
    return { kind: "list", id: draftWho.token.slice(4) };
  if (draftWho.kind === "list" && draftWho.token.startsWith("list:"))
    return { kind: "saved", id: draftWho.token.slice(5) };
  throw new AppError("validation", NEW_WORDS.cannot.nothingFits);
}

/**
 * A message sent once to people: its message filed or named, then the send screen's own verb, now (ten minutes on, with
 * a Stop) or at its time by the business's clock, by the channels the draft ticks. A message filed as it is made (one AI
 * wrote, or a ready-made starter) has a WhatsApp version WhatsApp is still checking: the send keeps its tick and waits
 * for it (core create-broadcast.ts readCampaignHowOf), so whoever an email or a text reaches goes on time and whoever
 * only WhatsApp reaches goes once it approves the words. It dropped WhatsApp and left them out (the review of 15 Nov
 * 2026). Kept, it waits under Drafts (00465 sequence_once_keep) and sends nothing; a message AI wrote is filed as it is
 * kept, so WhatsApp checks its words while it waits and the draft holds it by its id. A kept one sent lets its draft go.
 */
async function makePeopleOnce(ctx: RouteContext, member: Member, newMake: NewMakeBody): Promise<NewMade> {
  const step = newMake.steps[0];
  if (!step || step.does !== "message") throw new AppError("validation", NEW_WORDS.cannot.noMessage);
  const audience = onceAudienceOf(newMake.who);
  if (!newMake.start) {
    const filed =
      step.message && filedOnMake(step)
        ? {
            ...step,
            message: {
              template_id: await templateOf(ctx, member, step, newMake.channels),
              params: step.message.params,
              written: null,
              starter: null,
            },
          }
        : step;
    const kept = await keepOnceDraft(ctx.supabase, {
      tenantId: member.tenantId,
      id: newMake.draft_id ?? null,
      name: newMake.name,
      // New's {who, at, channels, step} (contracts NewOnceKept), as the column holds it.
      once: jsonCopyOf({ who: newMake.who, at: newMake.at, channels: newMake.channels, step: filed }),
    });
    if (kept.error) throw dbRefusal(kept.error);
    return newMadeOf(kept.data, "once", false);
  }
  const templateId = await templateOf(ctx, member, step, newMake.channels);
  const tz = (await load(readerContext(ctx, member), facts.facts, undefined)).data.timezone;
  const at = newMake.at ? fromZonedInput(newMake.at, tz) : null;
  const sent = await createBroadcast(createBroadcastPorts(ctx, member.tenantId, { fresh: true }), {
    userId: ctx.userId,
    body: {
      template_id: templateId,
      params: step.message?.params ?? [],
      audience,
      channels: newMake.channels,
      name: newMake.name,
      ...(at !== null ? { scheduled_for: new Date(at).toISOString() } : {}),
    },
    now: new Date(),
  });
  // A kept one-off, sent, is the one-off now: its draft goes.
  await letKeptGo(ctx, member, newMake.draft_id);
  return { made: sent.id, kind: "once", state: "on", scheduled_for: sent.scheduled_for };
}

export async function makeFromNew(ctx: RouteContext, member: Member, newMake: NewMakeBody): Promise<NewMade> {
  if (newMake.audience === "leads") return makeLeadSequence(ctx, member, newMake);
  if (newMake.kind === "once") return makePeopleOnce(ctx, member, newMake);
  return makePeopleSequence(ctx, member, newMake);
}
