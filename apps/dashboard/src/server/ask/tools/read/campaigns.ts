import "server-only";
import { z } from "zod";
import {
  BREATH_WHY,
  EVERYONE_LABEL,
  NO_NUMBER_REACH,
  OFFERS_OPT_IN_PHRASES,
  PLAYBOOK_CARD_WORDS,
  PLAYBOOK_VETO_DELAY_WORDS,
  REPLY_WINDOW_MS,
  appointmentWords,
  audiencePreview,
  campaignChannelsOf,
  campaignDayWords,
  campaignsHomeOf,
  clockStamp,
  compareTemplates,
  effectiveMode,
  heardFor,
  isLedgerCampaign,
  journeyGuide,
  lifecyclePlaybooksOf,
  listToken,
  listUnknownWords,
  listsFor,
  membersOf,
  messageHolds,
  noteRows,
  numberHealth,
  numberHealthWithStanding,
  optInLink,
  takesSignUps,
  type ChannelDto,
  playbookListRef,
  policyClassOffered,
  resolveList,
  scheduleLine,
  sendableTemplates,
  starterForTrigger,
  toBroadcastVM,
  sentByWords,
  toRunReportVM,
  triggerOf,
  triggerWords,
  unmetNeed,
  whatsappLineOf,
  type AudienceKind,
  type BroadcastDto,
  type ListRef,
  type CampaignMessage,
  type LifecycleAnswerRead,
  type LifecycleBroadcasts,
  type LifecycleGroup,
  type LifecyclePlaybooks,
  type LifecycleStage,
  runDaysAt,
  runWaitsOnYou,
  lifecycleStateOf,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { readSequence, readSequences } from "./sequences";
import { audiencePool } from "../../../readers/audience-pool";
import { broadcast as broadcastReader, broadcasts as broadcastsReader } from "../../../readers/broadcasts";
import { lastDaysBySource, lastDaysOf } from "../../../readers/campaign-report";
import { channels as channelsReader } from "../../../readers/channels";
import * as readers from "../../../readers/facts";
import { lists as listsReader } from "../../../readers/lists";
import { playbooks, reachOutChains } from "../../../readers/playbooks";
import { messageReadsOf, templates as templatesReader, type TemplatesRead } from "../../../readers/templates";
import {
  UUID,
  defineActions,
  noteRow,
  readAction,
  str,
  touchesThisWeek,
  unlessNotFound,
  unread,
  whatsappHowOf,
  type ToolContext,
} from "../context";

/**
 * The messages a broadcast may be made on, as the composers' read gave them (its `messages`: one a name and language, with
 * or without a WhatsApp row, a version in review among their versions, and the ones the composers offer), in the library's
 * order, each as the model reads it: the id a proposal takes (the id of the version whose words it lists, which names the
 * message as any version's does, and which the read's rows cite), the channels it can be sent by now (contracts
 * messageHolds), its values and its words, which are the WhatsApp version's where the composers' rows have it, else the
 * email's, else the text's.
 */
function offeredMessages(messages: readonly CampaignMessage[], tpls: TemplatesRead["templates"]) {
  const byId = new Map(tpls.map((r) => [r.id, r]));
  // The row a message is listed by: the first of its versions the composers' rows hold (not one still in review).
  const rowOf = (m: CampaignMessage) => {
    for (const v of [m.versions.whatsapp, m.versions.email, m.versions.sms]) {
      const row = v ? byId.get(v.id) : undefined;
      if (row) return row;
    }
    return null;
  };
  return messages
    .filter((m) => m.offered)
    .flatMap((m) => {
      const row = rowOf(m);
      return row ? [{ m, row }] : [];
    })
    .sort((a, b) => compareTemplates(a.row, b.row))
    .map(({ m, row }) => ({
      template_id: row.id,
      name: m.name,
      language: m.language,
      category: m.category,
      channels: messageHolds(m),
      values: Array.isArray(row.variables)
        ? (row.variables as { position?: number; label?: string; example?: string | null }[]).map((v) => ({
            position: v.position,
            label: v.label,
            example: v.example ?? null,
          }))
        : [],
      body: row.body_preview,
    }));
}

/**
 * The number a broadcast goes out on, as the Broadcasts page picks it (legacy-bridge/surface-data.ts): the active WhatsApp
 * row, its health from the quality Meta assigned it with what Meta holds against the number (campaigns/channels-ready.ts
 * reads the two as one judgement), and how a proposal that names no channel counts people (whatsappHowOf: by WhatsApp,
 * the workspace ready on it or not; no number is none, and channels that could not be read count as the pages count
 * them, WhatsApp able). `number` is what the listing says of it, null where the channels could not be read.
 */
function numberFactsOf(chans: ChannelDto[] | null) {
  const wa = whatsappLineOf(chans);
  const health = {
    ...numberHealthWithStanding(
      numberHealth({
        quality: wa?.quality ?? null,
        event: wa?.quality_event ?? null,
        limit: wa?.messaging_limit ?? null,
      }),
      wa?.standing ?? null,
    ),
    number: wa?.number_e164 ?? null,
  };
  const how = whatsappHowOf(chans === null ? undefined : wa ? health : null, "ours");
  const number = chans
    ? {
        present: !!wa,
        health: health.label,
        can_send: health.canSend,
        limit_per_day: health.limitPerDay === Number.POSITIVE_INFINITY ? null : health.limitPerDay,
      }
    : null;
  return { how, number };
}

/**
 * The audiences a broadcast may go to, counted by the same contracts
 * predicate the route enrols with and the page shows — so the number the
 * assistant says is the number the card will carry.
 */
async function listAudiences(t: ToolContext): Promise<unknown> {
  const [pool, lists, tplRead, chans, touched] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    // The workspace's own lists as People's rail reads them (readers/lists.ts), once a turn.
    load(t.rc, listsReader, undefined).then((r) => r.data.lists),
    // The composers' read of the templates (readers/templates.ts), once a turn: approved and not hidden by the
    // workspace (ledger #9), each with why this product cannot send it. A read that fails is its own state, as the
    // Broadcasts page keeps it, never "no template yet"; the audiences still answer.
    load(t.rc, templatesReader, { all: false }).catch(unread(t, "sequences.lists", "templates")),
    // The channels as the Broadcasts page reads them (readers/channels.ts), once a turn: workspace.settings reads the
    // same. A read that fails is no number known, as the page takes it -- said as such, never as no number.
    load(t.rc, channelsReader, undefined).then((r) => r.data.channels, unread(t, "sequences.lists", "channels")),
    // Who hears from a campaign or a broadcast within a week either side of now, a message sent or one due, the breath's
    // one read (context.ts touchesThisWeek, the cards' own): a broadcast leaves them out, so the count said here is the
    // card's. Null where it could not be read, which is said in the log there and to the model below.
    touchesThisWeek(t, "sequences.lists"),
  ]);
  const tpls = tplRead ? tplRead.data.templates : null;
  const messages = tplRead ? tplRead.data.messages : null;
  const rows = pool.rows;
  // FOUR sizes for every audience: this listing is read BEFORE a template is
  // chosen, the two answers differ, and who gave an answer is not who can be sent
  // the message, which also needs a number (#663). A single `said_yes` here was
  // the marketing count under a name that did not say so, so the assistant would
  // report "nobody said yes" about a utility template that could reach everybody
  // who had ever texted START; and `said_yes_to_offers` was the REACH, so a list
  // whose one yes to offers had no number read as nobody's yes. The send screen's
  // own counts (audiencePreview): `sending` is the number on its chip.
  // The number it goes out on and how a proposal that names no channel counts (numberFactsOf, above).
  const { how, number } = numberFactsOf(chans);
  // Who it can be sent is who a broadcast that goes now goes to: those it reaches, less whoever hears from you within a
  // week of now, either side, whom it leaves out (contracts heardFor, the card's and the route's rule), said beside it where any is. Where
  // who heard could not be read, no count is given that the card would not carry: the card itself is refused until it can be.
  const now = t.now.getTime();
  const sizes = (kind: AudienceKind, id: string | null, ids: Set<string> | null) => {
    const offers = audiencePreview(rows, kind, id, ids, "marketing", how, 5, touched ?? undefined);
    const messages = audiencePreview(rows, kind, id, ids, "conversational", how, 5, touched ?? undefined);
    const offersOut = heardFor(offers.heardTouches, now, now).heard;
    const messagesOut = heardFor(messages.heardTouches, now, now).heard;
    return {
      said_yes_to_offers: offers.saidYes,
      can_be_sent_offers: touched ? offers.sending - offersOut : null,
      ...(offersOut > 0 ? { left_out_offers: offersOut } : {}),
      said_yes_to_messages: messages.saidYes,
      can_be_sent_messages: touched ? messages.sending - messagesOut : null,
      ...(messagesOut > 0 ? { left_out_messages: messagesOut } : {}),
    };
  };
  // Every list the pool can offer (contracts listsFor): People's lists this workspace can count, then its own. Each
  // with its token (people.search's list) and its kind and id (propose_sequence.once's audience). The three
  // consent lists are never audiences: each restates the yes every audience is already crossed with. A list of the workspace's own
  // that can't be counted here is listed with why, and no counts.
  const offered = listsFor(pool.listCtx, lists).filter(
    (d) => !(d.ref.kind === "builtin" && ["opted_in", "offers_ok", "opted_out"].includes(d.ref.id)),
  );
  // Every list it offers is a row an answer may cite by its audience_id, opened on People at that list.
  for (const d of offered) noteRow(t, "list", d.ref.id, d.label, `clients/${d.token}`);
  const audiences = [
    { kind: "everyone", audience_id: null, list: null, label: EVERYONE_LABEL, ...sizes("everyone", null, null) },
    ...offered.map((d) => {
      const m = membersOf(d, rows, pool.listCtx, lists);
      const head = {
        kind: d.ref.kind === "builtin" ? "list" : "saved",
        audience_id: d.ref.id,
        list: d.token,
        label: d.label,
      };
      return m.state === "ok"
        ? { ...head, ...sizes("saved", null, m.ids) }
        : { ...head, cannot_count: listUnknownWords(m.reason, pool.listCtx.calendar) };
    }),
  ];
  // The messages the composer offers (ledger #14), whatever channels they have versions on: each says the channels it can
  // be sent by, and the ones with none this product can put on the wire are not listed. WhatsApp's approved versions are
  // split as the Broadcasts composer splits them (broadcasts-real.jsx): one sentence, the page's, for the ones it cannot
  // send whole. A card never checks this: a template offered here that the wire refuses became a card whose send failed
  // for everyone on it. The rows carry `blocked`, the answer the reader worked out from Meta's array, which the split
  // believes (contracts templateBlocked); its type names the array they no longer carry. The messages are the read's own,
  // made of every row, so a WhatsApp version still in review is among a message's versions with its standing.
  const offeredList = tpls && messages ? offeredMessages(messages, tpls) : null;
  const split = tpls
    ? sendableTemplates<TemplatesRead["templates"][number] & { components?: unknown }>(
        tpls.filter((x) => x.channel === "whatsapp" && x.meta_status === "approved").sort(compareTemplates),
      )
    : null;
  // Every message it offers is a row an answer may cite, as the composers' read gave it: by the id it lists.
  const offeredIds = new Set(offeredList?.map((x) => x.template_id));
  noteRows(
    t.read,
    (tplRead?.rows ?? []).filter((r) => offeredIds.has(r.id)),
  );
  // What could not be read, in words the model says: a null above is not none.
  const couldNotRead = [
    ...(tpls ? [] : ["The messages could not be read just now: say so, and propose no broadcast until they can."]),
    ...(chans ? [] : ["The WhatsApp number's state could not be read just now."]),
    ...(touched
      ? []
      : [
          "Who has had a message from you lately, or has one due, could not be read just now, so who a broadcast goes to is not counted (can_be_sent is null): say so, and propose no broadcast until it can be read.",
        ]),
  ];
  // Said only where somebody is left out, so a listing with nobody left out reads as it always did.
  const leftOutSaid = audiences.some((a) => "left_out_offers" in a || "left_out_messages" in a)
    ? " A broadcast leaves out whoever hears from you within a week of it, before or after: can_be_sent counts who a send that goes now goes to, and left_out_offers and left_out_messages how many are left out, which the card says too; a card set for later counts for its own time, so it may leave out more or fewer."
    : "";
  return {
    route: "broadcasts",
    audiences,
    templates: offeredList,
    cannot_send: split?.why ?? null,
    number,
    ...(couldNotRead.length ? { could_not_read: couldNotRead } : {}),
    note: `Two consents, two counts each, all by WhatsApp. can_be_sent_offers is who a promotional template reaches on WhatsApp and can_be_sent_messages who a utility or authentication one reaches, because ${NO_NUMBER_REACH}; said_yes_to_offers and said_yes_to_messages count everyone who gave that yes, a number or not. A message whose channels hold email or sms is proposed with channels naming them, and its card then counts the people those channels reach: a 0 in these counts does not mean nobody can be reached for it.${leftOutSaid}`,
  };
}

/** What a run does under each mode, in the assistant's words. */
const MODE_WORDS: Record<string, string> = {
  auto: "a run sends on its own",
  veto: `a run sends ${PLAYBOOK_VETO_DELAY_WORDS} later unless someone stops it`,
  ask: "a run waits for a person on Today",
  never: "nothing runs",
};

/**
 * The playbooks as the page shows them — the same rows, the same last 30
 * days, the same next-run words, the same end and trial — and the triggers with
 * the counts the page's chips carry: the Playbooks page's own read
 * (readers/playbooks.ts), once a turn, read as Campaigns reads it (contracts
 * lifecyclePlaybooksOf: the zone, the word, the calendar and each card's next
 * run, why it runs nothing, the day it ended and the day its trial ends) and
 * projected (ledger #10). Every count is the page's: over everyone, with no one
 * looking, the week's touches applied and, where deals are on, whoever already
 * had their proposal's follow-up left out, as a run counts them.
 */
async function listPlaybooksTool(t: ToolContext): Promise<unknown> {
  const [read, policies, sources] = await Promise.all([
    load(t.rc, playbooks, undefined),
    // The autonomy rows: a read that failed is said, never read as every class asking first (the wiring's second audit,
    // R13 X5-8: every campaign was said to wait for a person, where some send on their own).
    load(t.rc, readers.policies, undefined).then((r) => r.data, unread(t, "sequences.moments", "autonomy")),
    // The last 30 days by playbook (campaign_series' sources, Reports' Campaigns lens): what the ledger's row says. Null
    // where it could not be read, never all-time totals in its place (D35).
    lastDaysBySource(t.rc),
  ]);
  const pb = read.data;
  const answer = lifecyclePlaybooksOf(pb, t.now);
  const { shape, timezone } = answer;
  // The workspace's word (GET playbooks' businessShape, as Campaigns reads it): Ask says each appointment moment as the
  // page does.
  const said = (id: string) => {
    const x = triggerOf(id);
    return x ? triggerWords(x, shape.word) : null;
  };
  // Every playbook it lists is a row an answer may cite, opened on Playbooks at its card: the reader's RowRefs.
  noteRows(t.read, read.rows);
  const modes = policies ? new Map(policies.map((r) => [r.class, r.mode])) : null;
  const modeOf = (cls: string) => modes?.get(cls) ?? "ask";
  // Who a moment or a list names that said the yes its template needs, a number or not, and who of them a run reaches
  // now: the page's chip (`candidates`). `said_yes_now` was the reach once, so a moment whose yes had no number to
  // send to read as nobody's yes. Null where the page counts nobody: a read it needs failed.
  const counted = (key: string) => {
    const x = pb.pools[key];
    return x
      ? { said_yes_now: x.saidYes, can_be_sent_now: x.candidates }
      : { said_yes_now: null, can_be_sent_now: null };
  };
  // Why the page counts nobody for a playbook on a list, as far as its read says, and never a reason it does not give.
  // One of the workspace's own: its list could not be read, or is gone; or it is about whoever is looking, and a run
  // has no one (the page's read carries that one, `viewer`); else the page cannot count it and People says why on the
  // list. One of People's: none offered at all is a People read that failed; one offered and uncounted, a read of its
  // own; one not offered needs what this workspace does not have (contracts unmetNeed, in listUnknownWords' words) -- a
  // consult-first service when neither the calendar nor deals is what it lacks, since the page's read does not carry
  // that one, and the built-ins that need nothing are offered whenever the read succeeds.
  const uncounted = (ref: ListRef): string => {
    if (ref.kind === "saved") {
      if (pb.lists === null) return "its list could not be read just now";
      const own = pb.lists.find((l) => l.id === ref.id);
      if (!own) return "its list was deleted";
      if (own.viewer) return listUnknownWords("viewer", pb.calendar);
      return "it could not be counted just now; People says why on the list";
    }
    const def = resolveList(ref, []);
    if (!def) return "its list is not one of People's";
    if (pb.people_lists.length === 0) return "it could not be counted just now";
    if (pb.people_lists.some((l) => l.key === ref.id)) return "it could not be counted just now";
    const need =
      unmetNeed(def.needs, { calendar: pb.calendar, dealsOn: pb.deals_on, consultFirst: true, viewer: false }) ??
      "consult";
    return listUnknownWords(need, pb.calendar);
  };
  // The run's breath and the appointment moments it does not hold, in the contracts' words and the workspace's word.
  const W = appointmentWords(shape.word);
  return {
    route: "campaigns",
    timezone,
    modes: modes
      ? {
          reengage: modeOf("reengage"),
          campaign: modeOf("campaign"),
          booking: modeOf("booking"),
          // The follow-ups' class only where deals are on (0006).
          ...(policyClassOffered("follow_up", pb.deals_on) ? { follow_up: modeOf("follow_up") } : {}),
        }
      : null,
    ...(modes
      ? {}
      : {
          could_not_read:
            "the autonomy modes: say they could not be read just now, never that a campaign's runs wait for a person or go on their own",
        }),
    mode_words: MODE_WORDS,
    playbooks: answer.cards.map(({ playbook: p, read: c }) => ({
      playbook_id: p.id,
      name: p.name,
      trigger: p.trigger,
      trigger_label: said(p.trigger)?.label ?? p.trigger,
      template: p.template_name,
      // The channels it goes by (WhatsApp alone for one made before channels): what propose_sequence with action
      // channels is asked to change, and must be told whole.
      channels: campaignChannelsOf(p.channels),
      // Its state as the home says it (lifecycleStateOf): "Ended Oct 1", "Paused", "On · Daily 10:00 AM", a run waiting
      // first. It said the stored "running" of a campaign past its last day (the wiring's second audit, R13 X5-7).
      state: lifecycleStateOf({ ...p, ended: c.ended, trial: c.trial, off: c.off }).words,
      policy_class: p.policy_class,
      // The mode its runs go under now: its class's, but auto reads veto while on trial (contracts effectiveMode, core
      // run-playbook's own), with the day the trial ends as its card says it.
      mode: modes ? effectiveMode(p, modeOf(p.policy_class), t.now) : null,
      ...(c.trial ? { on_trial_until: c.trial } : {}),
      schedule: scheduleLine(p, shape.word),
      // No next run where it runs nothing here (an ended campaign, a follow-up with deals off): the card's one predicate,
      // and why in its words.
      next_run: c.off ? null : c.next,
      ...(c.off ? { runs_nothing: c.off } : {}),
      ...(c.ended ? { ended: c.ended } : {}),
      // Its last day while it is still ahead (or today): an ended one says `ended` instead.
      ...(p.until && !c.ended ? { ends: campaignDayWords(p.until, timezone, t.now) } : {}),
      // On a list (decision 0009): its token, and who a run on it reaches now, as the page counts that list.
      ...(() => {
        const ref = playbookListRef(p);
        if (!ref) return {};
        const token = listToken(ref);
        return { list: token, ...(pb.pools[token] ? counted(token) : { cannot_count: uncounted(ref) }) };
      })(),
      last_30_days: lastDaysOf(sources, p.id),
      waiting: p.totals.waiting
        ? { broadcast_id: p.totals.waiting.id, people: p.totals.waiting.recipient_count }
        : null,
    })),
    // The moments offered for a new playbook here: a proposal's only where deals are on (0006), and of the two win-backs
    // the one this workspace can read (momentOffered; a connected calendar's feed need not be readable just now).
    triggers: answer.moments
      .filter((x) => x.offered)
      .map(({ trigger: x }) => ({
        trigger: x.id,
        label: triggerWords(x, shape.word).label,
        when: triggerWords(x, shape.word).hint,
        policy_class: x.cls,
        // On a list, the counts are the list's: sequences.lists has each list's.
        ...(x.kind === "saved" ? { counted_per_list: true } : counted(x.id)),
        starter_template: starterForTrigger(x.id)?.title ?? null,
      })),
    note: `A run is a broadcast, and ${NO_NUMBER_REACH}. It never reaches anyone twice within the playbook's gap, and holds whoever hears ${BREATH_WHY}, by a message already sent or one due, for a later run; a reminder the day before ${W.a} and a check the day after go one per ${W.one}, exempt from the gap and ${PLAYBOOK_CARD_WORDS.appointmentBreath}. said_yes_now counts who each trigger names that said the yes its template needs, a number or not; can_be_sent_now is who of them a run reaches now, the Playbooks page's own count: whoever hears from you within a week of today, by a message already sent or one due, waits. A null count means the page could not count it just now.${pb.deals_on ? " The proposal follow-up reaches each proposal once, with its link: its counts leave out whoever already had theirs." : ""}`,
  };
}

/** How many of a run's people and replies one read says: the figures count them all. */
const RUN_CAP = { people: 20, replies: 10 };

/**
 * A broadcast as the Broadcasts page's row says it (contracts toBroadcastVM): its name, whether a campaign or a person
 * sent it, its audience and template, its state in the page's words -- a run waiting for a person to approve it said
 * as such -- when, and what its messages earned.
 */
function broadcastLine(b: BroadcastDto, tz: string, now: Date) {
  const vm = toBroadcastVM(b, tz, now);
  return {
    broadcast_id: b.id,
    route: `broadcasts/run:${b.id}`,
    name: b.name,
    // A person reads "campaign", never "playbook" (decision 19), and the model repeats what the row says.
    by: b.playbook_id ? "a campaign" : "a person",
    audience: b.audience.label,
    template: b.template_name,
    state: vm.stateLabel,
    // Waiting on you only while an approval can still send it (contracts runWaitsOnYou, the verb's own day rule): a run
    // whose day has passed can only be skipped, and the hourly sweep skips it itself (the wiring's second audit, S7-3).
    ...(runWaitsOnYou(b, runDaysAt(tz, now))
      ? { waiting_on_you: true }
      : b.state === "pending_approval"
        ? { too_late_to_approve: true }
        : {}),
    when: vm.when || null,
    people: b.recipient_count,
    sent: b.counts.sent,
    delivered: vm.deliveredPct === null ? null : `${vm.deliveredPct}%`,
    // A read is WhatsApp's own receipt (0030): a share of what went by WhatsApp; a run on more than one channel says each.
    read: vm.readPct === null ? null : `${vm.readPct}%`,
    ...(sentByWords(b.counts.sent_by) ? { sent_by_channel: sentByWords(b.counts.sent_by) } : {}),
    replied: b.counts.replied,
    held_back: b.counts.skipped,
    failed: b.counts.failed,
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
    route: "broadcasts",
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
async function readBroadcast(t: ToolContext, input: { broadcast_id: string }): Promise<unknown> {
  const id = str(input.broadcast_id, 40);
  if (!UUID.test(id)) return { error: "broadcast_id must be an id sequences with action sent returned" };
  const read = await unlessNotFound(load(t.rc, broadcastReader, { id }));
  if (!read) return { error: "no such broadcast in this workspace" };
  const d = read.data;
  const nowMs = t.now.getTime();
  const report = toRunReportVM(d, {
    windowMs: REPLY_WINDOW_MS,
    nowMs,
    clock: (iso) => {
      const ms = iso ? Date.parse(iso) : NaN;
      return Number.isNaN(ms) ? null : clockStamp(ms, t.timezone, nowMs);
    },
  });
  const people = report.people.slice(0, RUN_CAP.people);
  // The run, and the people it says, are rows an answer may cite: the run where the page opens it, each person on
  // their page.
  noteRows(t.read, read.rows);
  for (const p of people) noteRow(t, "person", p.contact_id, p.name, `clients/${p.contact_id}`);
  return {
    ...broadcastLine(d.broadcast, t.timezone, t.now),
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
export async function readMessages(t: ToolContext) {
  const read = await load(t.rc, templatesReader, { all: true });
  const library = read.data;
  if (library.usedBy === undefined) throw new Error("templates: Settings' read came back without what sends each");
  const messages = messageReadsOf(library);
  const versions = new Set(messages.flatMap((m) => m.versions.map((v) => v.id)));
  noteRows(
    t.read,
    read.rows.filter((r) => versions.has(r.id)),
  );
  return { route: "messages", messages };
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
    modes: pb.modes,
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
 * The journey as Campaigns' home draws it (contracts campaignsHomeOf), its rail as data: the playbooks and the broadcasts
 * read as the page's surfaces answer from them, through the surface's own reading of GET playbooks' answer (contracts
 * lifecyclePlaybooksOf, cmp/home/use-home.ts), and the channels for the WhatsApp line First contact is answered on, so
 * the number Ask says is the page's (the rail's own `covered` of `of`); and the guide (contracts journeyGuide), what each
 * touch point sends and when, for the workspace's shape and in its word. Only what the rail reads is read: the
 * reach-outs, the library and the campaigns' last 30 days are the ledger's, the head's and the tiles', and the home takes
 * each as not read yet. The campaigns it names are rows a citation names, opened on their drawer. A read the rail can do
 * without that fails is the page's failed read: the rail stands, and the log says it. Ask's plan reads the journey through
 * it too (act/plan.ts).
 */
export async function readJourney(t: ToolContext) {
  const failed = (read: string) => unread(t, "sequences.journey", read);
  const [read, bc, chans] = await Promise.all([
    load(t.rc, playbooks, undefined),
    load(t.rc, broadcastsReader, undefined).then((r) => r.data, failed("broadcasts")),
    load(t.rc, channelsReader, undefined).then((r) => r.data.channels, failed("channels")),
  ]);
  const pb = read.data;
  const answer = lifecyclePlaybooksOf(pb, t.now);
  const { shape } = answer;
  const home = campaignsHomeOf({
    nowMs: t.now.getTime(),
    tz: answer.timezone,
    playbooks: homePlaybooksOf(answer, pb),
    broadcasts: homeBroadcastsOf(bc, chans, { tz: answer.timezone, now: t.now }),
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
    t.read,
    read.rows.filter((r) => named.has(r.id)),
  );
  return {
    route: "campaigns",
    covered: home.rail.covered,
    of: home.rail.of,
    stages,
    guide: journeyGuide({ calendarOn: shape.calendar === "feed", dealsOn: shape.dealsOn, word: shape.word }),
  };
}

/**
 * The cold email sequences (Reach out, decision 0056) as Campaigns lists them (readers/playbooks.ts reachOutChains, GET
 * reach-outs' own read): each with its id, name, the search or list of leads it writes to, whether it runs, its emails and
 * their waits, its pace and who it is in it. Every one is a row an answer may cite, opened on its drawer.
 */
async function readColdEmails(t: ToolContext): Promise<unknown> {
  const read = await load(t.rc, reachOutChains, undefined);
  noteRows(t.read, read.rows);
  return {
    route: "campaigns",
    cold_emails: read.data.chains.map((c) => ({
      root_id: c.root_id,
      name: c.name,
      writes_to: c.search ? { search_id: c.search.id, name: c.search.name } : null,
      state: c.state,
      emails: c.steps.length,
      gap_minutes: c.gap_minutes,
      owner_sends: c.owner_sends === true,
      ...(c.people ? { people: { waiting: c.people.waiting, writing: c.people.writing, done: c.people.done } } : {}),
    })),
  };
}

/**
 * Everything that sends on its own (decision 0060; the operator, 15 Oct 2026, once the campaigns tool): every sequence as
 * the Sequences page lists them (list) and one as its record shows it (sequence); the moments a sequence can start at,
 * with who each names and the autonomy modes (moments, once playbooks); who a send can go to and the messages it may use
 * (lists, once audiences); the Library whole (messages); what went out and one batch of it (sent and batch, once
 * broadcasts and broadcast); the journey as Campaigns' home draws it (journey); and the cold email sequences (cold_emails).
 */
export const sequencesTool = defineActions({
  name: "sequences",
  description:
    "Everything that sends on its own, as Campaigns reads it (every such thing is a sequence), by action: the sequences, one sequence's steps and people, the moments of the customer journey a sequence can start at, who a send can go to and the messages it may use, the Library, what went out and how it did, the journey, and cold email to leads.",
  tail: "Read action lists before a send, and to say who a message would reach; action moments to say what is running, and before a new sequence at a moment. Pick the message first, then quote its can_be_sent count as who it reaches, never a larger one, for a message that goes by WhatsApp; for a message whose channels hold email or sms, propose it with channels naming them and quote the card's count, since the can_be_sent counts are by WhatsApp alone and a 0 there does not mean nobody can be reached; when a WhatsApp message's count is 0 and its said_yes is not, and its channels hold no other, the ones who said yes have no number to send to: say so, and never send the owner to get a yes they already have. When a moment's can_be_sent_now is 0 and said_yes_now is not, the ones who said yes have no number to send to, or hear from you within a week of today: say so the same way. A list that cannot be counted here carries cannot_count and no counts; a null count means the page could not count it just now, and nothing has run because it was read. A person reads campaign or sequence, never playbook or broadcast; the fields keep those names.",
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
        "Action sequence reads one as its record shows it: when it starts and stops, the mode its batches go under, its one notice, its steps with their ids (wait, message, channels, last 30 days), who is in it by where they stand (in_it: the first 25, each with its contact_id or lead_id), what waits on the owner (waiting_on_you: each held or handed-over email by its send_id, for propose_sequence with action decide or sent_by_hand), and its last five batches.",
      run: readSequence,
    }),
    moments: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the moments",
      words:
        "Action moments reads the sequences that start at a moment as the page shows them, standing rules that each send one message to newly eligible people who said yes: each with its playbook_id, what starts it, its message (template), its channels, its clock and next run (next_run, null where it runs nothing: runs_nothing says why, and ended the day one ended), its last day ahead (ends), its state in the page's words, the mode its runs go under now (mode: its class's, but auto reads veto while on trial until on_trial_until), its list when it runs on one, what it sent and how many replied over the last 30 days (null where that could not be read), and a batch waiting for a person; then every moment this workspace can use, with who it names now: said_yes_now (who said the yes its message needs, a number or not) and can_be_sent_now (who of them a run reaches), and each one's starter message.",
      run: listPlaybooksTool,
    }),
    lists: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the lists and messages",
      words: `Action lists, read before any send, lists who a send may go to: everyone who said yes, every People list this workspace can count, and every list of the workspace's own, each with its kind and audience_id (what propose_sequence with action once takes), its list token (what people with action search takes), and four counts, all by WhatsApp, because there are two consents and a yes needs a number to send to: can_be_sent_offers and can_be_sent_messages (who a promotional, or a utility or authentication, message reaches on WhatsApp) and said_yes_to_offers and said_yes_to_messages (everyone who gave that yes, a number or not). It also lists, under templates, the messages a send may use, each with its template_id (any of its versions' ids names the message), category, channels (true for each of whatsapp, email and sms it can be sent on now; a message that holds email or sms is proposed with channels naming them, and its card then counts the people those channels reach, so a 0 in the four counts above does not mean nobody can be reached), values and body, why a WhatsApp version this product cannot send whole is left out (cannot_send), and whether the number may send and its daily limit, since ${NO_NUMBER_REACH}.`,
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
        "Action journey reads the customer journey as Campaigns' home draws it: how many of its moments are covered (covered, of), then each stage in the order a customer passes it (first contact, the day before and the day after an appointment, which need a calendar, a proposal waiting where deals are on, quiet or lapsed) with whether it is covered, its state, the moment a sequence on it starts from and the sequences that stand on it; and guide, what each touch point sends and when. An offer or a whole setup is one call of propose_plan with action offer, which reads the journey itself and makes the steps, never a sequence proposed stage by stage from this read.",
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
  },
});
