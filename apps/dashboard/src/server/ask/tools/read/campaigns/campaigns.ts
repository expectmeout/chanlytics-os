/** Campaigns: campaigns. */

import "server-only";
import { z } from "zod";
import {
  NO_NUMBER_REACH,
  OFFERS_OPT_IN_PHRASES,
  REPLY_WINDOW_MS,
  clockStamp,
  lifecyclePlaybooksOf,
  noteRows,
  optInLink,
  takesSignUps,
  type ChannelDto,
  toBroadcastVM,
  sentByWords,
  toRunReportVM,
  triggerOf,
  whatsappLineOf,
  type BroadcastDto,
  type LifecycleAnswerRead,
  type LifecycleBroadcasts,
  type LifecycleGroup,
  type LifecyclePlaybooks,
  type LifecycleStage,
  runDaysAt,
  runWaitsOnYou,
  SEQUENCES_ROUTE,
  runRoute,
  MESSAGES_ROUTE,
  UUID,
} from "@chanlytics/contracts";
import { campaignsHomeOf } from "@/server/campaigns/lifecycle/stages";
import { isLedgerCampaign } from "@/server/campaigns/lifecycle/ledger/ledger";
import { journeyGuide } from "../../../journey/guide";
import { load } from "../../../../shared/reader";
import { EDITED_DAYS, readColdEmails, readEdited, readSequence, readSequences } from "../sequences";
import { broadcast as broadcastReader, broadcasts as broadcastsReader } from "../../../../readers/broadcasts";
import { channels as channelsReader } from "../../../../readers/channels";
import { playbooks } from "../../../../readers/playbooks";
import { messageReadsOf, templates as templatesReader } from "../../../../readers/templates";
import { noteRow, str, readUnlessNotFound, unread } from "../../context/tool-reads";
import { defineActions, readAction, type ToolContext } from "../../context/tool-defs";
import { listAudiences, listPlaybooksTool } from "./offered";

/** How many of a run's people and replies one read says: the figures count them all. */
const RUN_CAP = { people: 20, replies: 10 };

/**
 * A broadcast as the Broadcasts page's row says it (contracts toBroadcastVM): its name, whether a campaign or a person
 * sent it, its audience and template, its state in the page's words -- a run waiting for a person to approve it said
 * as such -- when, and what its messages earned.
 */
function broadcastLine(broadcast: BroadcastDto, tz: string, now: Date) {
  const vm = toBroadcastVM(broadcast, tz, now);
  return {
    broadcast_id: broadcast.id,
    route: runRoute(broadcast.id, broadcast.sequence_id),
    name: broadcast.name,
    // A person reads "campaign", never "playbook" (decision 19), and the model repeats what the row says.
    by: broadcast.playbook_id ? "a campaign" : "a person",
    audience: broadcast.audience.label,
    template: broadcast.template_name,
    state: vm.stateLabel,
    // Waiting on you only while an approval can still send it (contracts runWaitsOnYou, the verb's own day rule): a run
    // whose day has passed can only be skipped, and the hourly sweep skips it itself (the wiring's second audit, S7-3).
    ...(runWaitsOnYou(broadcast, runDaysAt(tz, now))
      ? { waiting_on_you: true }
      : broadcast.state === "pending_approval"
        ? { too_late_to_approve: true }
        : {}),
    when: vm.when || null,
    people: broadcast.recipient_count,
    sent: broadcast.counts.sent,
    delivered: vm.deliveredPct === null ? null : `${vm.deliveredPct}%`,
    // A read is WhatsApp's own receipt (0030): a share of what went by WhatsApp; a run on more than one channel says each.
    read: vm.readPct === null ? null : `${vm.readPct}%`,
    ...(sentByWords(broadcast.counts.sent_by) ? { sent_by_channel: sentByWords(broadcast.counts.sent_by) } : {}),
    replied: broadcast.counts.replied,
    held_back: broadcast.counts.skipped,
    failed: broadcast.counts.failed,
    ...(vm.failureLabel ? { why_it_failed: vm.failureLabel } : {}),
  };
}

/**
 * The broadcasts as the Broadcasts page lists them (readers/broadcasts.ts, the page's own read: the recent fifty, and
 * whether older ones exist), each as its row says it, a playbook's runs among them.
 */
async function readBroadcasts(t: ToolContext): Promise<unknown> {
  const read = await load(t.rc, broadcastsReader, undefined);
  // Every broadcast it lists is a row an answer may cite, opened where the page opens a run: the reader's RowRefs.
  noteRows(t.read, read.rows);
  return {
    route: SEQUENCES_ROUTE,
    broadcasts: read.data.broadcasts.map((b) => broadcastLine(b, t.timezone, t.now)),
    older: read.data.more,
  };
}

/**
 * One broadcast as its opened run says it (readers/broadcasts.ts broadcast, GET broadcasts/[id]'s own read, then
 * contracts toRunReportVM by the business's clock, as the page draws it): its row, the five figures, the people it
 * touched in the page's words, and what came back. The recipients' number field stays out: each is their name, as the
 * page names them, and their id.
 */
async function readBroadcast(toolContext: ToolContext, input: { broadcast_id: string }): Promise<unknown> {
  const id = str(input.broadcast_id, 40);
  if (!UUID.test(id)) return { error: "broadcast_id must be an id sequences with action sent returned" };
  const read = await readUnlessNotFound(load(toolContext.rc, broadcastReader, { id }));
  if (!read) return { error: "no such broadcast in this workspace" };
  const data = read.data;
  const nowMs = toolContext.now.getTime();
  const report = toRunReportVM(data, {
    windowMs: REPLY_WINDOW_MS,
    nowMs,
    clock: (iso) => {
      const ms = iso ? Date.parse(iso) : NaN;
      return Number.isNaN(ms) ? null : clockStamp(ms, toolContext.timezone, nowMs);
    },
  });
  const people = report.people.slice(0, RUN_CAP.people);
  // The run, and the people it says, are rows an answer may cite: the run where the page opens it, each person on
  // their page.
  noteRows(toolContext.read, read.rows);
  for (const p of people) noteRow(toolContext, "person", p.contact_id, p.name, `clients/${p.contact_id}`);
  return {
    ...broadcastLine(data.broadcast, toolContext.timezone, toolContext.now),
    figures: report.figures.map((f) => ({ label: f.label, n: f.n, pct: f.pct, note: f.sub })),
    people_total: report.people.length,
    people: people.map((p) => ({ contact_id: p.contact_id, name: p.name, said: p.pill.label, what: p.words })),
    replies: report.replies
      .slice(0, RUN_CAP.replies)
      .map((r) => ({ contact_id: r.contact_id, name: r.name, quote: r.quote, since: r.outcome.words })),
    ...(report.stop ? { stopped: report.stop.words, fix: report.stop.fix } : {}),
  };
}

/**
 * The message library whole (readers/templates.ts messageReadsOf), over Settings' read (`all`), the one the Library's
 * page and Ask's context of it read: every message, a version still in Meta's review among its versions with its state,
 * the values it fills and the campaigns that send it, so a message Ask writes is never a twin of one the workspace holds.
 * Every version is a row an answer may cite, as the read gave it: a template, opened on the Library. Ask's plan reads the
 * Library through it too (act/plan.ts).
 */
export async function readMessages(toolContext: ToolContext) {
  const read = await load(toolContext.rc, templatesReader, { all: true });
  const library = read.data;
  if (library.usedBy === undefined) throw new Error("templates: Settings' read came back without what sends each");
  const messages = messageReadsOf(library);
  const versions = new Set(messages.flatMap((m) => m.versions.map((v) => v.id)));
  noteRows(
    toolContext.read,
    read.rows.filter((r) => versions.has(r.id)),
  );
  return { route: MESSAGES_ROUTE, messages };
}

/** GET playbooks' answer and GET broadcasts', as their readers give them. */
type PlaybooksRead = Awaited<ReturnType<(typeof playbooks)["read"]>>["data"];

type BroadcastsRead = Awaited<ReturnType<(typeof broadcastsReader)["read"]>>["data"];

/**
 * The playbooks surface as the home reads it, through the one reading of GET playbooks' answer the surface makes
 * (contracts lifecyclePlaybooksOf, cmp/playbooks/surface.ts): each card beside what the answer says of it, each moment's
 * pool, the moments that may run here with which a new campaign may start from, whether every moment was counted, and
 * whether each channel can send now. A card's own reach (its candidates, held and named) is counted by the surface for the
 * channels it ticks; the journey says none of it, so here it is not counted (null, as the home reads a count not made).
 */
function homePlaybooksOf(
  read: LifecycleAnswerRead<PlaybooksRead["playbooks"][number]>,
  pb: PlaybooksRead,
): LifecyclePlaybooks {
  return {
    rows: read.cards.map(({ playbook, read: card }) => ({
      ...playbook,
      ...card,
      candidates: null,
      held: null,
      named: null,
    })),
    pools: pb.pools,
    triggers: read.moments.map(({ trigger, offered }) => ({ id: trigger.id, offered })),
    timezone: read.timezone,
    countsRead: read.countsRead,
    ready: pb.ready,
  };
}

/**
 * The broadcasts surface as the home reads it (cmp/broadcasts/surface.ts): the runs by the business's clock, whether each
 * channel can send now, the workspace's WhatsApp line (contracts whatsappLineOf, none where the channels could not be
 * read, as that surface takes it) and the yes to offers asked on it. Null where the broadcasts could not be read, which
 * the home takes as a line to answer on. Who can hear the workspace is not counted: the journey says none of it.
 */
function homeBroadcastsOf(
  bc: BroadcastsRead | null,
  chans: ChannelDto[] | null,
  at: { tz: string; now: Date },
): LifecycleBroadcasts | null {
  if (!bc) return null;
  const wa = whatsappLineOf(chans);
  return {
    rows: bc.broadcasts.map((b) => toBroadcastVM(b, at.tz, at.now)),
    number: { present: !!wa },
    ready: bc.ready,
    // No link while the workspace is paused or ended, by the rule the card follows (contracts takesSignUps).
    optIn: {
      phrase: OFFERS_OPT_IN_PHRASES.en,
      link: takesSignUps(bc.open_to_customers ?? null) ? optInLink(wa?.number_e164) : null,
    },
    reach: null,
  };
}

/**
 * A stage of the rail as data: its caption, whether it is covered, its state in the page's words, the moment a campaign
 * on it starts from, and the campaigns that stand on it, each with its state as its row in the ledger says it (the
 * receptionist and the call's text are First contact's rows and no campaign, contracts isLedgerCampaign).
 */
function journeyStageLine(stage: LifecycleStage, group: LifecycleGroup | undefined) {
  return {
    id: stage.id,
    label: stage.caps,
    covered: stage.covered,
    state: stage.stateWords,
    moment: stage.moment === null ? null : (triggerOf(stage.moment)?.id ?? null),
    campaigns: (group?.rows ?? [])
      .filter(isLedgerCampaign)
      .map((r) => ({ id: r.id, name: r.name, state: r.stateWords })),
  };
}

/**
 * The customer journey, as the home Campaigns drew until decision 0060's S6 composed it (contracts campaignsHomeOf), its
 * rail as data: the playbooks and the broadcasts
 * read as the page's surfaces answer from them, through the surface's own reading of GET playbooks' answer (contracts
 * lifecyclePlaybooksOf, cmp/home/use-home.ts), and the channels for the WhatsApp line First contact is answered on, so
 * the number Ask says is the page's (the rail's own `covered` of `of`); and the guide (contracts journeyGuide), what each
 * touch point sends and when, for the workspace's shape and in its word. Only what the rail reads is read: the
 * reach-outs, the library and the campaigns' last 30 days are the ledger's, the head's and the tiles', and the home takes
 * each as not read yet. The campaigns it names are rows a citation names, opened on their drawer. A read the rail can do
 * without that fails is the page's failed read: the rail stands, and the log says it. Ask's plan reads the journey through
 * it too (act/plan.ts).
 */
export async function readJourney(toolContext: ToolContext) {
  const failed = (read: string) => unread(toolContext, "sequences.journey", read);
  const [read, bc, chans] = await Promise.all([
    load(toolContext.rc, playbooks, undefined),
    load(toolContext.rc, broadcastsReader, undefined).then((r) => r.data, failed("broadcasts")),
    load(toolContext.rc, channelsReader, undefined).then((r) => r.data.channels, failed("channels")),
  ]);
  const pb = read.data;
  const answer = lifecyclePlaybooksOf(pb, toolContext.now);
  const { shape } = answer;
  const home = campaignsHomeOf({
    nowMs: toolContext.now.getTime(),
    tz: answer.timezone,
    playbooks: homePlaybooksOf(answer, pb),
    broadcasts: homeBroadcastsOf(bc, chans, { tz: answer.timezone, now: toolContext.now }),
    library: undefined,
    messages: undefined,
    reachOuts: undefined,
    report: undefined,
    shape,
    chains: undefined,
  });
  const stages = home.rail.stages.map((s) =>
    journeyStageLine(
      s,
      home.ledger.groups.find((g) => g.id === s.id),
    ),
  );
  const named = new Set(stages.flatMap((s) => s.campaigns.map((c) => c.id)));
  noteRows(
    toolContext.read,
    read.rows.filter((r) => named.has(r.id)),
  );
  return {
    route: SEQUENCES_ROUTE,
    covered: home.rail.covered,
    of: home.rail.of,
    stages,
    guide: journeyGuide({ calendarOn: shape.calendar === "feed", hasDeals: shape.hasDeals, word: shape.word }),
  };
}

/**
 * Everything that sends on its own (decision 0060; the operator, 15 Oct 2026, once the campaigns tool): every sequence as
 * the Sequences page lists them (list) and one as its record shows it (sequence); the moments a sequence can start at,
 * with who each names and the autonomy modes (moments, once playbooks); who a send can go to and the messages it may use
 * (lists, once audiences); the Library whole (messages); what went out and one batch of it (sent and batch, once
 * broadcasts and broadcast); the customer journey (journey); the cold email sequences (cold_emails), and the ones the
 * member edited from Ask's drafts (edited, decision 0078 step 2).
 */
export const sequencesTool = defineActions({
  name: "sequences",
  description:
    "Everything that sends on its own, as Campaigns reads it (every such thing is a sequence), by action: the sequences, one sequence's steps and people, the moments of the customer journey a sequence can start at, who a send can go to and the messages it may use, the Library, what went out and how it did, the journey, and cold email to leads, with the cold emails the person edited from Ask's drafts.",
  tail: "Read action lists before a send, and to say who a message would reach; action moments to say what is running, and before a new sequence at a moment. Pick the message first, then quote its can_be_sent count as who it reaches, never a larger one, for a message that goes by WhatsApp; for a message whose channels hold email or sms, propose it with channels naming them and quote the card's count, since the can_be_sent counts are by WhatsApp alone and a 0 there does not mean nobody can be reached; when a WhatsApp message's count is 0 and its said_yes is not, and its channels hold no other, the ones who said yes cannot be sent it: say how many said yes and what they lack, as the audience's why_none words say it (a number to send to, or a channel that can carry it, which offers_go_by names), and never send the owner to get a yes they already have. When a moment's can_be_sent_now is 0 and said_yes_now is not, the ones who said yes have no number to send to, no channel that can carry it now (action lists' offers_go_by names which), or hear from you within a week of today: say so the same way. A list that cannot be counted here carries cannot_count and no counts; a null count means the page could not count it just now, and nothing has run because it was read. A person reads campaign or sequence, never playbook or broadcast; the fields keep those names.",
  actions: {
    list: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the sequences",
      words:
        "Action list reads every sequence as the Sequences page lists them: each with its sequence_id, name, group, what starts it, state, line, steps and who is in it, and what waits on the owner (needs_you); needs_you on top is the page's count.",
      run: readSequences,
    }),
    sequence: readAction({
      input: z.object({ sequence_id: z.string().describe("A sequence's id, from action list.") }),
      examples: [{ sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c" }],
      label: "Reading the sequence",
      words:
        "Action sequence reads one as its record shows it: when it starts and stops, the mode its batches go under (and batches_did: what its batches did over the last 90 days, how many went after an OK or on their own, stopped or skipped unanswered: the evidence a mode is set on), its one notice, its steps with their ids (wait, message, channels, last 30 days), who is in it by where they stand (in_it: the first 25, each with its contact_id or lead_id), what waits on the owner (waiting_on_you: each held or handed-over email by its send_id, for propose_sequence with action decide or sent_by_hand), and its last five batches.",
      run: readSequence,
    }),
    moments: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the moments",
      words:
        "Action moments reads the sequences that start at a moment as the page shows them, standing rules that each send one message to newly eligible people who said yes: each with its playbook_id, what starts it, its message (template), its channels, its clock and next run (next_run, null where it runs nothing: runs_nothing says why, and ended the day one ended), its last day ahead (ends), its state in the page's words, its own mode (mode: how its batches are decided, mode_words says each, and next_batch_asks_first where its next batch waits for an OK because its words are new), its list when it runs on one, what it sent and how many replied over the last 30 days (null where that could not be read), and a batch waiting for a person; then every moment this workspace can use, with who it names now: said_yes_now (who said the yes its message needs, a number or not) and can_be_sent_now (who of them a run reaches), and each one's starter message.",
      run: listPlaybooksTool,
    }),
    lists: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the lists and messages",
      words: `Action lists, read before any send, lists who a send may go to: everyone who said yes, every People list this workspace can count, and every list of the workspace's own, each with its kind and audience_id (what propose_sequence with action once takes), its list token (what people with action search takes), and four counts, because there are two consents and a yes needs a number to send to and a channel to carry it: can_be_sent_offers and can_be_sent_messages (who a promotional, or a utility or authentication, message reaches on WhatsApp) and said_yes_to_offers and said_yes_to_messages (everyone who gave that yes, as People counts it, whether or not a number or a channel can carry it now), with why_none_offers or why_none_messages where some said yes and WhatsApp reaches none of them, saying what they lack in People's words. It says which channels carry offers now (offers_go_by), and also lists, under templates, the messages a send may use, each with its template_id (any of its versions' ids names the message), category, channels (true for each of whatsapp, email and sms it can be sent on now; a message that holds email or sms is proposed with channels naming them, and its card then counts the people those channels reach, so a 0 in the four counts above does not mean nobody can be reached), values and body, why a WhatsApp version this product cannot send whole is left out (cannot_send), and whether the number may send and its daily limit, since ${NO_NUMBER_REACH}.`,
      run: listAudiences,
    }),
    messages: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the messages",
      words:
        "Action messages reads the Library whole: every message, a name in a language, with its category, each version on its channel with its state (approved, pending while WhatsApp reviews it, rejected, paused or disabled), the values it fills and the sequences that send it (used_by). Call it before a new message is written, so the Library never holds a twin; to pick a message a send can use now and say who it reaches, call action lists instead.",
      run: readMessages,
    }),
    sent: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading what went out",
      words:
        "Action sent reads what went out as the page lists it, the recent fifty, with older saying whether there are more: each batch with its name, whether a campaign or a person sent it, who it went to and its message, its state in the page's words (one waiting for a person to approve it has waiting_on_you; one whose day has passed is too_late_to_approve), when, how many it was for, how many were sent (sent_by_channel, where it went by more than one), the share of those delivered, the share of those sent by WhatsApp that were read (a text or an email keeps no read receipt), and how many replied, were held back and failed, with why one failed.",
      run: readBroadcasts,
    }),
    batch: readAction({
      input: z.object({
        broadcast_id: z.string().describe("A batch's id, from action sent or a moment's waiting batch."),
      }),
      examples: [{ broadcast_id: "e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b" }],
      label: "Reading the batch",
      words: `Action batch reads one batch as its opened run shows it: its row, the five figures (sent, delivered, replied, said yes, asked to stop), the people it touched in the page's words, and what came back, quoted. It returns at most ${RUN_CAP.people} people and ${RUN_CAP.replies} replies, the figures counting everyone.`,
      run: readBroadcast,
    }),
    journey: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the journey",
      words:
        "Action journey reads the customer journey: how many of its moments are covered (covered, of), then each stage in the order a customer passes it (first contact, the day before and the day after an appointment, which need a calendar, a proposal waiting where a deal was ever recorded or a sequence stands on it, quiet or lapsed) with whether it is covered, its state, the moment a sequence on it starts from and the sequences that stand on it; and guide, what each touch point sends and when. An offer or a whole setup is one call of propose_plan with action offer, which reads the journey itself and makes the steps, never a sequence proposed stage by stage from this read.",
      run: readJourney,
    }),
    cold_emails: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the cold emails",
      words:
        "Action cold_emails reads the cold email sequences to leads: each with its root_id, name, the search or list of leads it writes to, whether it runs, its emails, its pace, whether the owner sends each from their own inbox, and who is in it (waiting, writing, done).",
      run: readColdEmails,
    }),
    edited: readAction({
      input: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(EDITED_DAYS.max)
          .optional()
          .describe(
            `How many days back, ${EDITED_DAYS.default} (since yesterday) when left out, ${EDITED_DAYS.max} at most.`,
          ),
      }),
      examples: [{}, { days: 7 }],
      label: "Reading the cold emails you edited",
      words:
        "Action edited reads the cold emails to leads the person made in the last days whose first email is theirs: one they changed from what Ask drafted (drafted beside sent), or wrote themself (drafted null). A sequence sent as Ask drafted it, or a teammate's, is not one. Their sent words are their own, so a line about how they write may quote them (remember).",
      run: readEdited,
    }),
  },
});
