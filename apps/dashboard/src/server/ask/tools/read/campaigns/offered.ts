/** Campaigns: offered. */

import "server-only";
import {
  BREATH_WHY,
  EVERYONE_LABEL,
  NO_NUMBER_REACH,
  PLAYBOOK_CARD_WORDS,
  SEQUENCE_MODE_WORDS,
  appointmentWords,
  audienceMembers,
  audiencePreview,
  campaignChannelsOf,
  campaignDayWords,
  cannotBeSentWords,
  compareTemplates,
  heardFor,
  lifecyclePlaybooksOf,
  listToken,
  listUnknownWords,
  listsFor,
  membersOf,
  messageHolds,
  noteRows,
  numberHealth,
  numberHealthWithStanding,
  offersNote,
  type ChannelDto,
  playbookListRef,
  resolveList,
  scheduleLine,
  sendableTemplates,
  starterForTrigger,
  triggerOf,
  triggerWords,
  unmetNeed,
  whatsappLineOf,
  type AskedPurpose,
  type AudienceKind,
  type ListRef,
  type CampaignMessage,
  lifecycleStateOf,
  SEQUENCES_ROUTE,
} from "@chanlytics/contracts";
import { load } from "../../../../shared/reader";
import { audiencePool } from "../../../../readers/audience-pool";
import { listLastDaysBySource, lastDaysOf } from "../../../../readers/campaign-report";
import { channels as channelsReader } from "../../../../readers/channels";
import * as readers from "../../../../readers/facts";
import { lists as listsReader } from "../../../../readers/lists";
import { playbooks } from "../../../../readers/playbooks";
import { templates as templatesReader, type TemplatesRead } from "../../../../readers/templates";
import { noteRow, findTouchesThisWeek, unread, whatsappHowOf } from "../../context/tool-reads";
import { type ToolContext } from "../../context/tool-defs";

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
 * The number a broadcast goes out on, as the Broadcasts page picks it (bridge/surface-data.ts): the active WhatsApp
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
export async function listAudiences(toolContext: ToolContext): Promise<unknown> {
  const [pool, lists, tplRead, chans, touched, ready] = await Promise.all([
    load(toolContext.rc, audiencePool, undefined).then((r) => r.data),
    // The workspace's own lists as People's rail reads them (readers/lists.ts), once a turn.
    load(toolContext.rc, listsReader, undefined).then((r) => r.data.lists),
    // The composers' read of the templates (readers/templates.ts), once a turn: approved and not hidden by the
    // workspace (ledger #9), each with why this product cannot send it. A read that fails is its own state, as the
    // Broadcasts page keeps it, never "no template yet"; the audiences still answer.
    load(toolContext.rc, templatesReader, { all: false }).catch(unread(toolContext, "sequences.lists", "templates")),
    // The channels as the Broadcasts page reads them (readers/channels.ts), once a turn: workspace.settings reads the
    // same. A read that fails is no number known, as the page takes it -- said as such, never as no number.
    load(toolContext.rc, channelsReader, undefined).then(
      (r) => r.data.channels,
      unread(toolContext, "sequences.lists", "channels"),
    ),
    // Who hears from a campaign or a broadcast within a week either side of now, a message sent or one due, the breath's
    // one read (context.ts findTouchesThisWeek, the cards' own): a broadcast leaves them out, so the count said here is the
    // card's. Null where it could not be read, which is said in the log there and to the model below.
    findTouchesThisWeek(toolContext, "sequences.lists"),
    // Every channel the workspace can send on now, as People's rows were judged (readers/facts.ts): offers_go_by below.
    load(toolContext.rc, readers.channelsReady, undefined).then((r) => r.data),
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
  // own counts (audiencePreview): `sending` is the number on its chip. Who said yes is People's column (the rows' saidYes,
  // answeredYes), as the winners read counts it: the send screen's asks the channel too, and under Meta's pause on offers
  // to US numbers read 0 over 26 who had (the stress run, 15 Oct 2026). What they lack, in People's words: why_none_*.
  // The number it goes out on and how a proposal that names no channel counts (numberFactsOf, above).
  const { how, number } = numberFactsOf(chans);
  // Who it can be sent is who a broadcast that goes now goes to: those it reaches, less whoever hears from you within a
  // week of now, either side, whom it leaves out (contracts heardFor, the card's and the route's rule), said beside it where any is. Where
  // who heard could not be read, no count is given that the card would not carry: the card itself is refused until it can be.
  const now = toolContext.now.getTime();
  const sizes = (label: string, kind: AudienceKind, ids: Set<string> | null = null) => {
    const offers = audiencePreview(rows, kind, null, ids, "marketing", how, 5, touched ?? undefined);
    const messages = audiencePreview(rows, kind, null, ids, "conversational", how, 5, touched ?? undefined);
    const offersOut = heardFor(offers.heardTouches, now, now).heard;
    const messagesOut = heardFor(messages.heardTouches, now, now).heard;
    const members = audienceMembers(rows, kind, null, ids);
    const saidOffers = members.filter((r) => r.saidYes.offers);
    const saidMessages = members.filter((r) => r.saidYes.messages);
    const whyNone = (purpose: AskedPurpose, sentence: typeof members, sending: number) =>
      sending > 0 ? null : cannotBeSentWords(`“${label}”`, purpose, sentence);
    const whyOffers = whyNone("marketing", saidOffers, offers.sending);
    const whyMessages = whyNone("conversational", saidMessages, messages.sending);
    return {
      said_yes_to_offers: saidOffers.length,
      can_be_sent_offers: touched ? offers.sending - offersOut : null,
      ...(offersOut > 0 ? { left_out_offers: offersOut } : {}),
      ...(whyOffers ? { why_none_offers: whyOffers } : {}),
      said_yes_to_messages: saidMessages.length,
      can_be_sent_messages: touched ? messages.sending - messagesOut : null,
      ...(messagesOut > 0 ? { left_out_messages: messagesOut } : {}),
      ...(whyMessages ? { why_none_messages: whyMessages } : {}),
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
  for (const d of offered) noteRow(toolContext, "list", d.ref.id, d.label, `clients/${d.token}`);
  const audiences = [
    { kind: "everyone", audience_id: null, list: null, label: EVERYONE_LABEL, ...sizes(EVERYONE_LABEL, "everyone") },
    ...offered.map((item) => {
      const members = membersOf(item, rows, pool.listCtx, lists);
      const head = {
        kind: item.ref.kind === "builtin" ? "list" : "saved",
        audience_id: item.ref.id,
        list: item.token,
        label: item.label,
      };
      return members.state === "ok"
        ? { ...head, ...sizes(item.label, "saved", members.ids) }
        : { ...head, cannot_count: listUnknownWords(members.reason, pool.listCtx.calendar) };
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
    toolContext.read,
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
    route: SEQUENCES_ROUTE,
    audiences,
    templates: offeredList,
    cannot_send: split?.why ?? null,
    number,
    // The Broadcasts page's sentence on which channels carry offers now (offersNote); none where they could not be read.
    ...(ready ? { offers_go_by: offersNote(ready) } : {}),
    ...(couldNotRead.length ? { could_not_read: couldNotRead } : {}),
    note: `Two consents, two counts each. can_be_sent_offers is who a promotional template reaches on WhatsApp and can_be_sent_messages who a utility or authentication one reaches, because ${NO_NUMBER_REACH}; said_yes_to_offers and said_yes_to_messages count everyone who gave that yes, as People counts it, whether or not a number or a channel can carry it now. Where some said yes and WhatsApp reaches none of them, why_none_offers or why_none_messages says what they lack, in People's words: a number to send to, or a channel that can carry it, and offers_go_by says which channels carry offers now (Meta's pause on offers to US numbers among them). Say how many said yes and what they lack, and never send the owner to get a yes they already have. A message whose channels hold email or sms is proposed with channels naming them, and its card then counts the people those channels reach: a 0 in these counts does not mean nobody can be reached for it.${leftOutSaid}`,
  };
}

/**
 * What a batch does under each mode (decision 0064), in How it runs' words (contracts SEQUENCE_MODE_WORDS), and that a
 * batch of a step whose words are new to the owner waits for their OK whatever the mode.
 */
const MODE_WORDS = {
  auto: SEQUENCE_MODE_WORDS.auto.does,
  veto: SEQUENCE_MODE_WORDS.veto.does,
  ask: SEQUENCE_MODE_WORDS.ask.does,
  new_words:
    "a batch of a step whose words are new to the owner (next_batch_asks_first) waits for their OK first, whatever the mode",
};

/**
 * The playbooks as the page shows them — the same rows, the same last 30
 * days, the same next-run words, the same end, each with its sequence's own
 * mode — and the triggers with the counts the page's chips carry: the Playbooks
 * page's own read (readers/playbooks.ts), once a turn, read as Campaigns reads
 * it (contracts lifecyclePlaybooksOf: the zone, the word, the calendar and each
 * card's next run, why it runs nothing and the day it ended) and projected
 * (ledger #10). Every count is the page's: over everyone, with no one
 * looking, the week's touches applied and whoever already
 * had their proposal's follow-up left out, as a run counts them.
 */
export async function listPlaybooksTool(toolContext: ToolContext): Promise<unknown> {
  const [read, policies, sources] = await Promise.all([
    load(toolContext.rc, playbooks, undefined),
    // The autonomy rows: what a new sequence of each class starts as (decision 0064). A read that failed is said, never
    // read as every class asking first (the wiring's second audit, R13 X5-8).
    load(toolContext.rc, readers.policies, undefined).then(
      (r) => r.data,
      unread(toolContext, "sequences.moments", "autonomy"),
    ),
    // The last 30 days by playbook (campaign_series' sources, Reports' Campaigns lens): what the ledger's row says. Null
    // where it could not be read, never all-time totals in its place (D35).
    listLastDaysBySource(toolContext.rc),
  ]);
  const pb = read.data;
  const answer = lifecyclePlaybooksOf(pb, toolContext.now);
  const { shape, timezone } = answer;
  // The workspace's word (GET playbooks' businessShape, as Campaigns reads it): Ask says each appointment moment as the
  // page does.
  const said = (id: string) => {
    const x = triggerOf(id);
    return x ? triggerWords(x, shape.word) : null;
  };
  // Every playbook it lists is a row an answer may cite, opened on Playbooks at its card: the reader's RowRefs.
  noteRows(toolContext.read, read.rows);
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
      unmetNeed(def.needs, { calendar: pb.calendar, hasDeals: pb.has_deals, consultFirst: true, viewer: false }) ??
      "consult";
    return listUnknownWords(need, pb.calendar);
  };
  // The run's breath and the appointment moments it does not hold, in the contracts' words and the workspace's word.
  const words = appointmentWords(shape.word);
  return {
    route: SEQUENCES_ROUTE,
    timezone,
    // What a new sequence of each class starts as (Settings › Autonomy's rows, decision 0064), the follow-ups' class every
    // workspace's (0006; 0008, amended 18 Oct 2026): each existing sequence's own is its `mode` below.
    new_sequences_start_as: modes
      ? Object.fromEntries(["reengage", "campaign", "booking", "follow_up"].map((c) => [c, modeOf(c)]))
      : null,
    ...(modes
      ? {}
      : {
          could_not_read:
            "what a new sequence starts as (the autonomy rows): say it could not be read just now, never what a new one's batches would do",
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
      state: lifecycleStateOf({ ...p, ended: c.ended, off: c.off }).words,
      policy_class: p.policy_class,
      // Its sequence's own mode (decision 0064), what propose_sequence's change sets as `mode`, and whether its next batch
      // waits for an OK first because its words are new to the owner (contracts batchModeOf, core run-playbook's own).
      mode: p.mode ?? "ask",
      next_batch_asks_first: !p.words_ok_at,
      schedule: scheduleLine(p, shape.word),
      // No next run where it runs nothing here (an ended campaign): the card's one predicate,
      // and why in its words.
      next_run: c.off ? null : c.next,
      ...(c.off ? { runs_nothing: c.off } : {}),
      ...(c.ended ? { ended: c.ended } : {}),
      // Its last day while it is still ahead (or today): an ended one says `ended` instead.
      ...(p.until && !c.ended ? { ends: campaignDayWords(p.until, timezone, toolContext.now) } : {}),
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
    // The moments offered for a new playbook here: every moment, a proposal's too (0006), and of the two win-backs
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
    note: `A run is a broadcast, and ${NO_NUMBER_REACH}. It never reaches anyone twice within the playbook's gap, and holds whoever hears ${BREATH_WHY}, by a message already sent or one due, for a later run; a reminder the day before ${words.a} and a check the day after go one per ${words.one}, exempt from the gap and ${PLAYBOOK_CARD_WORDS.appointmentBreath}. said_yes_now counts who each trigger names that said the yes its template needs, a number or not; can_be_sent_now is who of them a run reaches now, the Playbooks page's own count: whoever hears from you within a week of today, by a message already sent or one due, waits. A null count means the page could not count it just now. The proposal follow-up reaches each proposal once, with its link: its counts leave out whoever already had theirs.`,
  };
}
