import "server-only";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  DEFAULT_CAMPAIGN_CHANNELS,
  FOLLOW_UP_NEEDS_DEALS,
  FOLLOW_UP_ONE,
  LIBRARY_STARTER_WORDS,
  LIST_PLAYBOOK_CLASSES,
  MOMENTS_RETIRED,
  MOMENT_TRIGGERS,
  NEW_PLAYBOOK_TICKS_EVERY_CHANNEL,
  PLAYBOOK_CARD_REFUSALS,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_PATCH_WORDS,
  PLAYBOOK_VETO_DELAY_WORDS,
  REACH_OUT_IS_NOT_A_MOMENT,
  campaignDayWords,
  channelNeverCarries,
  cleanParam,
  enrolPurpose,
  dealsAreOn,
  defaultParamSpecs,
  parseListToken,
  parseParamSpec,
  playbookChannelsRead,
  proposalChannelsWords,
  purposeOfPlaybook,
  readyOrWhatsApp,
  scheduleLine,
  slotLabels,
  starterByKey,
  startersForTrigger,
  messageAboutOfTrigger,
  triggerOf,
  triggerOffered,
  type CampaignMessage,
  type ConsentChannel,
  type ListRef,
  type MessageAbout,
  type ParamSpec,
  type PlaybookTrigger,
  type StarterTemplate,
} from "@chanlytics/contracts";
import {
  playbookNameAsked,
  playbookNumber,
  refuseWithoutBookingLink,
  refuseWithoutReviewLink,
  untilOf,
} from "@chanlytics/core";
import { followUpOnFile } from "@chanlytics/db";
import { sellsByOf } from "../../../people/deals";
import { twinRefusal } from "../../../campaigns/playbook-row";
import { checkPlaybookInput, checkPlaybookMomentInput, type PlaybookInput } from "../../../campaigns/playbooks";
import { checkStarterPlaybook } from "../../../campaigns/starter-templates";
import { templateValuePorts } from "../../../ports/campaign-ports";
import { load } from "../../../readers";
import { channelsReady, zoneAndSettings } from "../../../readers/facts";
import { templates as templatesReader } from "../../../readers/templates";
import {
  AUDIENCES_CALL,
  UUID,
  actAction,
  askedMessage,
  namedChannels,
  propose,
  proposedChannels,
  refuse,
  stepMessage,
  stepNamed,
  str,
  whatsappAloneRefusal,
  type AskedMessage,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { channelsWaitWords } from "./playbook-channels";
import {
  allowanceHeld,
  breathSaid,
  campaignSheet,
  playbookChannelsSaid,
  playbookHow,
  reachByChannel,
  reachNow,
  trialOf,
  underMode,
  wordedMoment,
  yesSaid,
  type Trigger,
} from "./playbook-card";
import { cardSays, stepSays } from "./says";

/**
 * What a playbook proposed with no channel named goes by, as the tool's words tell the model: every channel the reading
 * finds open for it, or the first alone, by the one switch the composer reads (contracts NEW_PLAYBOOK_TICKS_EVERY_CHANNEL,
 * decision 5 of the spec of 8 October 2026). The words said "every one" whichever way the switch stood.
 */
const UNNAMED_GOES_BY = NEW_PLAYBOOK_TICKS_EVERY_CHANNEL ? "every one" : "the first one";

/**
 * The moments a playbook may be proposed on: every moment but the two no longer offered (MOMENTS_RETIRED), and a
 * reach-out's steps are not moments (MOMENT_TRIGGERS). The zod's enum and the refusal's list, one derivation. The tools
 * are a role's, never a workspace's, so which of them THIS workspace is offered (contracts momentOffered, decision 0041:
 * the reminder the day before and the check after an appointment, and the win-back by appointments, only where a
 * calendar is connected, the win-back by silence only where none is, the proposal follow-up only where deals are on) is
 * judged per proposal, by the route's own check (calendarRefusal, followUpRefusal, checkedPlaybook).
 */
const PROPOSABLE_TRIGGERS = MOMENT_TRIGGERS.filter((t) => !(t.id in MOMENTS_RETIRED)).map((t) => t.id) as [
  string,
  ...string[],
];

/**
 * The starters a proposal may name by its key (`starter`): each such moment's own (contracts startersForTrigger), not one
 * the set replaced. Whether this moment goes by the one named, and its link on file (the review ask's), is the route's own
 * judgement, per proposal (checkStarterPlaybook, through proposeOnStarter).
 */
const PROPOSABLE_STARTERS = [
  ...new Set(PROPOSABLE_TRIGGERS.flatMap((t) => startersForTrigger(t).flatMap((s) => (s.retired ? [] : [s.key])))),
] as [string, ...string[]];

/**
 * The appointment moments' ids, as the action's words name them for the model to call with: ids, held to the set's own,
 * never words a person reads (a sentence says the workspace's appointment word, contracts appointmentWords).
 */
const APPOINTMENT_TRIGGERS = { before: "visit_tomorrow", after: "visited" } as const satisfies Record<
  string,
  PlaybookTrigger
>;

/**
 * The values a model wrote for a message's slots, as the specs the route stores (contracts parseParamSpec: typed text,
 * or a value the run fills, "@first_name"), each typed one plain text (cleanParam); or a refusal in the model's words.
 * A new playbook's values and a change of a playbook's words (act/playbook-change.ts) are turned so, one way.
 */
export function paramSpecsOf(given: readonly unknown[]): { specs: ParamSpec[] } | { refusal: string } {
  const specs: ParamSpec[] = [];
  for (const p of given) {
    const spec = parseParamSpec(p);
    if (!spec) return { refusal: PLAYBOOK_CARD_REFUSALS.value };
    if (spec.kind !== "text") {
      specs.push(spec);
      continue;
    }
    const v = cleanParam(spec.value);
    if (v === null) return { refusal: PLAYBOOK_CARD_REFUSALS.plainText };
    specs.push({ kind: "text", value: v });
  }
  return { specs };
}

/**
 * The values a proposal fills the template's slots with: the model's (paramSpecsOf), or the template's own defaults -- a
 * starter's slots are known; a typed slot with no words is a question for the person. A refusal, in the model's words,
 * otherwise.
 */
function proposedSpecs(
  params: unknown,
  tpl: { name: string; language: string; variables: unknown },
): { specs: ParamSpec[] } | { refusal: string } {
  const given = Array.isArray(params) ? (params as unknown[]) : [];
  if (given.length) return paramSpecsOf(given);
  const specs = defaultParamSpecs({ name: tpl.name, variables: tpl.variables });
  const labels = slotLabels({ name: tpl.name, language: tpl.language, variables: tpl.variables });
  const blank = specs.findIndex((s) => s.kind === "text" && !s.value);
  return blank >= 0 ? { refusal: PLAYBOOK_CARD_REFUSALS.typedSlot(labels[blank] ?? `value ${blank + 1}`) } : { specs };
}

/**
 * The message a moment's starter is on file as: the set's starter for the moment, else one it replaced that this workspace
 * still has (2 Oct 2026), among the messages the composers offer (the composers' read's `messages`, made of every row: not
 * hidden, and a version in hand that can be sent, whichever channel it is on, a WhatsApp version still in review among
 * them), its id the message's anchor; or the refusal that says neither is. Of a starter's languages the first by code is
 * the one held, as the read once ordered them. Where none is, the starter a card may add at Approve (A0): the moment's
 * own, still offered, unless the workspace hid a message of it, which no card adds back. `key` is the one the proposal
 * named (the action's `starter`): this moment's, it is looked for on file the same way, and added at Approve where it is
 * not (the day after's review ask, which the moment's own does not ask); another moment's is never taken from the
 * Library, and goes to the card's judgement, which refuses it in the route's words (checkStarterPlaybook).
 */
async function heldStarter(
  t: ToolContext,
  trig: { id: string; label: string },
  key: string,
): Promise<{ id: string } | { starter: StarterTemplate } | { refusal: string }> {
  const own = startersForTrigger(trig.id);
  const named = key ? starterByKey(key) : null;
  if (named && !own.some((s) => s.key === named.key && !s.retired)) return { starter: named };
  const written = named ? [named] : own;
  const { messages } = (await load(t.rc, templatesReader, { all: false })).data;
  const offered = messages
    .filter((m) => m.offered)
    .sort((a, b) => (a.language < b.language ? -1 : a.language > b.language ? 1 : 0));
  const starter = written.map((x) => offered.find((m) => m.name === x.name)).find(Boolean);
  if (starter) return { id: starter.anchor.id };
  const title = written[0]?.title ?? trig.label;
  // One the workspace hid has a version, and no card adds it back (nor would the starter set): said as hidden, the way
  // out being to show it again or to go by another message.
  if (messages.some((m) => m.hidden && written.some((x) => x.name === m.name)))
    return { refusal: PLAYBOOK_CARD_REFUSALS.starterHidden(title, AUDIENCES_CALL) };
  // The one a card may add at its Approve (A0): the one named, else the moment's starter still offered.
  const adds = named ?? written.find((s) => !s.retired);
  return adds ? { starter: adds } : { refusal: PLAYBOOK_CARD_REFUSALS.starterUnsent(title, AUDIENCES_CALL) };
}

/**
 * The message a playbook proposal goes by, from the id a starter or the model gave: read as the route reads it (tools/context.ts
 * askedMessage), refused where the workspace keeps it out of the composers, or the refusal.
 */
async function proposedMessage(t: ToolContext, id: string): Promise<AskedMessage | { refusal: string }> {
  const asked = await askedMessage(t, id);
  if ("refusal" in asked) return asked;
  if (asked.message.hidden) return { refusal: PLAYBOOK_CARD_REFUSALS.hiddenTemplate(AUDIENCES_CALL) };
  return asked;
}

/**
 * The channels a playbook proposal goes by where it names none: what a new playbook opens on in the composer, by the
 * one reading both make (contracts playbookChannelsRead with "new": every channel a playbook of its kind may go by now
 * for this message, or the first alone while NEW_PLAYBOOK_TICKS_EVERY_CHANNEL is off), so a playbook Ask proposes goes by
 * what the page would have ticked (the spec of 8 October 2026, decision 5). `moment` is the playbook as far as that
 * reading asks: its trigger, and the class it sends under where it is on a list.
 * Undefined where that is WhatsApp alone: the proposal then says and commits what one that named no channel always did,
 * and a message with no WhatsApp version to go by is refused with what it can go by (whatsappAloneRefusal).
 */
async function unnamedChannels(
  t: ToolContext,
  message: Pick<CampaignMessage, "versions" | "category" | "purpose">,
  moment: { trigger: string; policy_class: string },
  about: MessageAbout,
): Promise<{ channels: ConsentChannel[] | undefined } | { refusal: string }> {
  // What the workspace can send on, as the turn already holds it (readers/facts.ts: the people's pool, read below for
  // the card's count, asks the same once a turn), so the default costs no read of its own. Unread, it is WhatsApp alone.
  const ready = readyOrWhatsApp((await load(t.rc, channelsReady, undefined)).data);
  const ticks = playbookChannelsRead(moment, "new", message, ready).kept;
  if (ticks.join() !== DEFAULT_CAMPAIGN_CHANNELS.join()) return { channels: ticks };
  const no = await whatsappAloneRefusal(t, message, about);
  return no ? { refusal: no } : { channels: undefined };
}

/** What a playbook proposal takes (playbookAction's input): the moment, what it sends and when, and the channels it may go by. */
interface PlaybookProposed {
  trigger: string;
  list?: string;
  policy_class?: string;
  template_id?: string;
  params?: string[];
  run_hour?: number;
  cap_per_run?: number;
  name?: string;
  channels?: ConsentChannel[];
  /** Its last day, YYYY-MM-DD by the business's clock (00416): once judged (endOf), the day itself. */
  until?: string;
  /** The moment's starter to file at Approve, by its key, in place of a message (heldStarter). */
  starter?: string;
}

/**
 * A new campaign's last day (00416 `until`), judged as POST playbooks judges it at the card's Approve and as a change's is
 * (core untilOf: a day by the business's clock, today or later), in the judge's own words where it is not one; undefined
 * where none is named.
 */
async function endOf(t: ToolContext, asked: unknown): Promise<{ until: string | undefined } | { refusal: string }> {
  try {
    const until = await untilOf({ timezone: () => Promise.resolve(t.timezone) }, asked, { now: t.now, undo: false });
    return { until: until ?? undefined };
  } catch (e) {
    return { refusal: e instanceof Error ? e.message : String(e) };
  }
}

/** What a new campaign's card says of its last day, after its schedule ("Ends Nov 30"), and its payload's: none, nothing. */
const endSaid = (t: ToolContext, until: string | undefined): string =>
  until ? ` · ${PLAYBOOK_PATCH_WORDS.until(campaignDayWords(until, t.timezone, t.now))}` : "";
const endKept = (until: string | undefined): { until?: string } => (until ? { until } : {});

/**
 * What a playbook proposal says, and by which channels: its message, read as the route reads it; the values of its
 * slots; and the channels it goes by, the ones it names or else what the composer would tick for it (unnamedChannels),
 * asked last, once everything said in words alone has been refused. The class its default is judged by is its moment's,
 * or, on a list, the one it names (an offer where it names none), as the check reads it. Or the first refusal.
 */
async function proposedSaying(
  t: ToolContext,
  input: PlaybookProposed,
  templateId: string,
  moment: { cls: string; onList: boolean },
  about: MessageAbout,
): Promise<
  { asked: AskedMessage; specs: ParamSpec[]; picked: { channels: ConsentChannel[] | undefined } } | { refusal: string }
> {
  const asked = await proposedMessage(t, templateId);
  if ("refusal" in asked) return asked;
  const { message } = asked;
  const values = proposedSpecs(input.params, {
    name: message.name,
    language: message.language,
    variables: asked.variables,
  });
  if ("refusal" in values) return values;
  const cls = moment.onList ? str(input.policy_class, 20) || "campaign" : moment.cls;
  const picked =
    input.channels !== undefined
      ? { channels: input.channels }
      : await unnamedChannels(t, message, { trigger: input.trigger, policy_class: cls }, about);
  if ("refusal" in picked) return picked;
  return { asked, specs: values.specs, picked };
}

/** The proposal follow-up (0006): only where deals are on, and one per workspace (00167); its refusal, or null. */
async function followUpRefusal(t: ToolContext, trig: Trigger): Promise<string | null> {
  if (trig.kind !== "deal") return null;
  // The one-follow-up index's reading (db followUpOnFile), the one a starter's route asks too.
  const [sellsBy, one] = await Promise.all([
    sellsByOf(t.ctx, t.tenantId),
    followUpOnFile(t.ctx.supabase, t.tenantId, trig.id),
  ]);
  if (!triggerOffered(trig, dealsAreOn(sellsBy))) return FOLLOW_UP_NEEDS_DEALS;
  return one ? FOLLOW_UP_ONE : null;
}

/**
 * An appointment's moment (D2: the reminder the day before, the check after), offered only where a calendar is
 * connected, judged before its message or its channels are read, by the route's own check (core checkPlaybookMoment:
 * momentOffered, with the calendar connected as the Playbooks page's calendar state says it, read from the zone and
 * settings the turn holds, readers/facts.ts), so where none is it is refused in the check's own words ("…read from your
 * calendar, and none is connected"), whatever message or channel it names. Null where it is offered, and for every other
 * moment: the two win-backs, which the calendar decides too, are judged by that check where they always were
 * (checkedPlaybook, proposeOnStarter).
 */
async function calendarRefusal(t: ToolContext, trig: Trigger): Promise<string | null> {
  if (trig.kind !== "visit") return null;
  try {
    await checkPlaybookMomentInput(t.ctx, t.tenantId, { trigger: trig.id }, zoneAndSettings(t.rc));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** The list a new playbook runs on, where it runs on one, and the class it sends under there, as its body names them. */
const listBody = (input: PlaybookProposed, listRef: ListRef | null) =>
  listRef
    ? {
        ...(listRef.kind === "builtin" ? { list_key: listRef.id } : { list_id: listRef.id }),
        policy_class: str(input.policy_class, 20) || undefined,
      }
    : {};

/**
 * A new playbook's body, checked by the route's own check (existing null: the check holds it to the moments offered now,
 * with this workspace's calendar, read from the zone and settings the turn holds, readers/facts.ts, never again); or its
 * refusal. The channels are the ones it names, or the composer's own default (WhatsApp alone where that is all there
 * is): the check holds them to the route's own rule, a tick its purpose never carries refused in the composers' words.
 */
async function checkedPlaybook(
  t: ToolContext,
  input: PlaybookProposed,
  trig: Trigger,
  listRef: ListRef | null,
  said: { templateId: string; specs: ParamSpec[]; channels: ConsentChannel[] | undefined },
): Promise<PlaybookInput | { refusal: string }> {
  try {
    return await checkPlaybookInput(
      t.ctx,
      t.tenantId,
      {
        name: playbookNameAsked(input.name) || undefined,
        trigger: trig.id,
        ...listBody(input, listRef),
        template_id: said.templateId,
        params: said.specs,
        run_hour: typeof input.run_hour === "number" ? input.run_hour : undefined,
        cap_per_run: typeof input.cap_per_run === "number" ? input.cap_per_run : undefined,
        channels: said.channels,
      },
      null,
      zoneAndSettings(t.rc),
    );
  } catch (e) {
    return { refusal: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What a starter card says of the channels that wait (channelsWaitWords) where its Approve sends a WhatsApp version for
 * review (`forReview`). Where the workspace is ready on WhatsApp, the review is why WhatsApp waits, said in its place;
 * where a reason of the workspace's own holds WhatsApp (a number WhatsApp flagged), that reason stands, since approving
 * the version releases nobody, and the review is said beside it.
 */
function starterWaitWords(
  read: Parameters<typeof channelsWaitWords>[0],
  forReview: boolean,
  whatsappReady: boolean,
): string {
  if (!forReview || !read.kept.includes("whatsapp")) return channelsWaitWords(read);
  if (whatsappReady) return channelsWaitWords(read, { whatsapp: LIBRARY_STARTER_WORDS.whatsappForReview });
  return `${channelsWaitWords(read)} · ${LIBRARY_STARTER_WORDS.whatsappSentForReview}`;
}

/**
 * A playbook on a moment whose starter this workspace does not hold yet (the moment spec's A0, D23): the card names the
 * starter by its key, and its Approve files the starter as the composer's one press does (POST playbooks with
 * starter_key), then starts the playbook on it. Nothing is filed at the card: an act only checks and proposes. It is held
 * here to everything its Approve will be held to, by the route's own function (srv/campaigns/starter-templates.ts
 * checkStarterPlaybook: the moment offered here, with the workspace's calendar; its list and class; the starter the
 * moment's own, with no words of its own to write; its numbers; its channels, and one its message holds at once), in the
 * same words, so a card the route would refuse is never made. It goes by the channels that judgement gives (those named,
 * else those held at once and WhatsApp where there is a number) and says each, and which of them hold their people until
 * they can send, by the drawer's own reading (WhatsApp until WhatsApp approves the version, email until offers by email
 * are open). Its slots are the starter's own sources, which the payload carries and the commit sends. It says what the
 * message card says (the moment and its schedule, the month's allowance, who said yes, the class's mode).
 */
async function proposeOnStarter(
  t: ToolContext,
  input: PlaybookProposed,
  trig: Trigger,
  listRef: ListRef | null,
  starter: StarterTemplate,
): Promise<ProposalOutcome> {
  let judged: Awaited<ReturnType<typeof checkStarterPlaybook>>;
  try {
    judged = await checkStarterPlaybook(
      t.ctx,
      t.tenantId,
      {
        trigger: trig.id,
        starter_key: starter.key,
        ...listBody(input, listRef),
        run_hour: input.run_hour,
        cap_per_run: input.cap_per_run,
        ...(input.channels !== undefined ? { channels: input.channels } : {}),
      },
      zoneAndSettings(t.rc),
    );
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  const { params, cls, channels } = judged;
  // What the workspace can send on, as the turn already holds it (readers/facts.ts); unread, it is WhatsApp alone. Read
  // against the starter's message as its filing leaves it (checkStarterPlaybook's own reading of that).
  const workspace = readyOrWhatsApp((await load(t.rc, channelsReady, undefined)).data);
  const read = playbookChannelsRead({ trigger: trig.id, policy_class: cls }, channels, judged.message, workspace);
  const clock = {
    trigger: trig.id,
    run_hour: input.run_hour ?? PLAYBOOK_DEFAULTS.runHour,
    cap_per_run: input.cap_per_run ?? PLAYBOOK_DEFAULTS.capPerRun,
    gap_days: PLAYBOOK_DEFAULTS.gapDays,
    cadence_days: PLAYBOOK_DEFAULTS.cadenceDays,
  };
  const how = { channels, ready: read.ready, about: read.about };
  const reach = await reachNow(t, trig, listRef, { category: starter.category }, how, clock.cap_per_run);
  if ("refusal" in reach) return refuse(reach.refusal);
  const { drawn, reading, policies, listLabel } = reach;
  const held = await allowanceHeld(t, channels, reading, clock, purposeOfPlaybook(cls));
  const under = underMode(cls, policies);
  const trial = trialOf(under.mode);
  const name = playbookNameAsked(input.name);
  // Its WhatsApp version goes for review at Approve only where none is on file; one on file is said as it stands, by the
  // drawer's reading (in review, refused), and the filing leaves it so.
  const forReview = judged.whatsappOnFile === null && judged.message.versions.whatsapp !== null;
  const waits = starterWaitWords(read, forReview, workspace.whatsapp.ready);
  // The moment and its schedule in the workspace's word, as the message card says them.
  const { word, moment } = await wordedMoment(t, trig);
  const said = {
    where: listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`,
    runs: scheduleLine(clock, word),
    breath: breathSaid(trig),
    end: endSaid(t, input.until),
    goes: proposalChannelsWords(channels, reachByChannel(drawn.reach.by_channel)),
    reaches: yesSaid(purposeOfPlaybook(cls), drawn, how),
    sends: `${trial.said}${under.said}`,
    message: LIBRARY_STARTER_WORDS.addsFirst(starter.title),
  };
  return propose({
    kind: "playbook",
    title: `Campaign: ${name || moment.label}`,
    summary: `${said.where} · ${said.runs}${said.breath}${said.end} · ${said.message} · ${said.goes}${waits} · ${held}${said.reaches} · ${said.sends}`,
    sheet: campaignSheet({ ...said, waiting: [waits, held] }),
    payload: {
      ...clock,
      trigger_label: moment.label,
      starter_key: starter.key,
      starter_title: starter.title,
      params,
      name: name || null,
      candidates: drawn.reach.will,
      policy_class: cls,
      list_id: listRef?.kind === "saved" ? listRef.id : null,
      list_key: listRef?.kind === "builtin" ? listRef.id : null,
      mode: under.mode,
      // The channels the card says, which the route judges again at Approve.
      channels,
      ...trial.payload,
      ...endKept(input.until),
    },
  });
}

/**
 * A new campaign on the message an earlier step of Ask's plan writes (`@step:n`, context.ts stepNamed), judged before
 * that message is filed, as a starter card is (proposeOnStarter) and by the same judges: its moment, its list and its
 * class by the route's own judgement before a message (checkPlaybookMomentInput, core checkPlaybookMoment); its numbers
 * by their bounds (core playbookNumber); its values as the route stores them (paramSpecsOf), a link they name on file
 * (core refuseWithoutBookingLink, refuseWithoutReviewLink); and its channels, the ones named or else what the composer
 * would tick for it (unnamedChannels, as for any message), none its purpose never carries (contracts enrolPurpose,
 * channelNeverCarries, as the check reads them). The message is the offer the step writes (context.ts stepMessage). How
 * it fits its moment and its values is the route's to judge at the press, by then filed and named by the token's fill
 * (Task 16's commit). Or the first refusal, in its words.
 */
async function stepJudged(t: ToolContext, input: PlaybookProposed, trig: Trigger, listRef: ListRef | null) {
  try {
    const { cls } = await checkPlaybookMomentInput(
      t.ctx,
      t.tenantId,
      { trigger: trig.id, ...listBody(input, listRef) },
      zoneAndSettings(t.rc),
    );
    const values = paramSpecsOf(input.params ?? []);
    if ("refusal" in values) return values;
    const ports = templateValuePorts(t.ctx, t.tenantId);
    await refuseWithoutBookingLink(ports, values.specs);
    await refuseWithoutReviewLink(ports, values.specs);
    const about = messageAboutOfTrigger(trig.id);
    const picked =
      input.channels !== undefined
        ? { channels: input.channels }
        : await unnamedChannels(t, stepMessage(CONSENT_CHANNELS), { trigger: trig.id, policy_class: cls }, about);
    if ("refusal" in picked) return picked;
    const by = proposedChannels(picked.channels);
    if ("refusal" in by) return by;
    const message = stepMessage(by.channels);
    const purpose = enrolPurpose(cls, message);
    const never = by.channels.map((c) => channelNeverCarries(c, purpose)).find((w) => w !== null);
    if (never) return { refusal: never };
    const clock = {
      trigger: trig.id,
      run_hour: playbookNumber("run_hour", input.run_hour, PLAYBOOK_DEFAULTS.runHour),
      cap_per_run: playbookNumber("cap_per_run", input.cap_per_run, PLAYBOOK_DEFAULTS.capPerRun),
      gap_days: PLAYBOOK_DEFAULTS.gapDays,
      cadence_days: PLAYBOOK_DEFAULTS.cadenceDays,
    };
    return { cls, specs: values.specs, by, clock, message, about };
  } catch (e) {
    return { refusal: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A new campaign on the message step `step` of the plan writes (stepJudged): who a run reaches, counted by the
 * workspace's channels alone with the step's message, an offer, laid over them (context.ts stepMessage) and the yes it
 * needs; the month's allowance, its class's mode, its trial and its last day, as every new campaign's card says them. It
 * says which step makes its message and quotes the offer its values type (says.ts stepSays); a name not given is the
 * route's to give once the message is filed.
 */
async function proposeOnStep(
  t: ToolContext,
  input: PlaybookProposed,
  at: { trig: Trigger; listRef: ListRef | null },
  step: number,
): Promise<ProposalOutcome> {
  const { trig, listRef } = at;
  const judged = await stepJudged(t, input, trig, listRef);
  if ("refusal" in judged) return refuse(judged.refusal);
  const { cls, specs, by, clock, message, about } = judged;
  const how = await playbookHow(t, message, by, about);
  const reach = await reachNow(t, trig, listRef, { category: message.category }, how, clock.cap_per_run);
  if ("refusal" in reach) return refuse(reach.refusal);
  const { drawn, reading, policies, listLabel } = reach;
  const held = await allowanceHeld(t, by.channels, reading, clock, purposeOfPlaybook(cls));
  const { goes, waiting } = playbookChannelsSaid(how, by, drawn.reach.by_channel, held);
  const under = underMode(cls, policies);
  const trial = trialOf(under.mode);
  const name = playbookNameAsked(input.name) || null;
  const { word, moment } = await wordedMoment(t, trig);
  const said = {
    where: listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`,
    runs: scheduleLine(clock, word),
    breath: breathSaid(trig),
    end: endSaid(t, input.until),
    goes,
    reaches: yesSaid(purposeOfPlaybook(cls), drawn, how),
    sends: `${trial.said}${under.said}`,
    message: stepSays(step, specs),
  };
  return propose({
    kind: "playbook",
    title: `Campaign: ${name ?? moment.label}`,
    summary: `${said.where} · ${said.runs}${said.breath}${said.end}${goes} · ${waiting}${said.reaches} · ${said.sends} Says: ${said.message}`,
    sheet: campaignSheet({ ...said, waiting: [waiting] }),
    payload: {
      ...clock,
      trigger_label: moment.label,
      // Filled by the commit with the message step `step` made, before the route reads it.
      template_id: str(input.template_id, 40),
      template_name: null,
      params: specs,
      name,
      candidates: drawn.reach.will,
      policy_class: cls,
      list_id: listRef?.kind === "saved" ? listRef.id : null,
      list_key: listRef?.kind === "builtin" ? listRef.id : null,
      mode: under.mode,
      ...namedChannels(by),
      ...trial.payload,
      ...endKept(input.until),
    },
  });
}

async function proposePlaybook(t: ToolContext, proposed: PlaybookProposed): Promise<ProposalOutcome> {
  const trig = triggerOf(str(proposed.trigger, 30));
  if (!trig) return refuse(PLAYBOOK_CARD_REFUSALS.trigger(PROPOSABLE_TRIGGERS));
  if (trig.kind === "reach_out") return refuse(REACH_OUT_IS_NOT_A_MOMENT);
  // A playbook on a list names it by its token (decision 0009): one of People's, or one of the workspace's own.
  const listRef = trig.kind === "saved" ? parseListToken(str(proposed.list, 60)) : null;
  if (trig.kind === "saved" && !listRef) return refuse(PLAYBOOK_CARD_REFUSALS.listToken(AUDIENCES_CALL));
  // Its last day, judged once and carried as the day it is from here on.
  const end = await endOf(t, proposed.until);
  if ("refusal" in end) return refuse(end.refusal);
  const input = { ...proposed, until: end.until };
  const followUp = await followUpRefusal(t, trig);
  if (followUp) return refuse(followUp);
  let templateId = str(input.template_id, 40);
  // The moment's starter named by its key, to file at Approve: in place of a message, never beside one.
  const starterKey = str(input.starter, 60);
  if (starterKey && templateId) return refuse(PLAYBOOK_CARD_REFUSALS.starterOrMessage);
  // The message an earlier step of Ask's plan writes, named by its token: judged before it is filed (proposeOnStep).
  const step = stepNamed(t, templateId);
  // A step's message: its moment, the calendar's among it, is judged once there (stepJudged).
  if (step !== null) return proposeOnStep(t, input, { trig, listRef }, step);
  if (templateId && !UUID.test(templateId)) return refuse(PLAYBOOK_CARD_REFUSALS.templateId(AUDIENCES_CALL));
  // An appointment's moment where no calendar is connected, refused before its message or its channels are read (D2).
  const notOffered = await calendarRefusal(t, trig);
  if (notOffered) return refuse(notOffered);
  if (!templateId) {
    const own = await heldStarter(t, trig, starterKey);
    // A starter not on file is added at the card's Approve (A0), never refused while one is offered.
    if ("starter" in own) return proposeOnStarter(t, input, trig, listRef, own.starter);
    if ("refusal" in own) return refuse(own.refusal);
    templateId = own.id;
  }
  const about = messageAboutOfTrigger(trig.id);
  const saying = await proposedSaying(t, input, templateId, { cls: trig.cls, onList: listRef !== null }, about);
  if ("refusal" in saying) return refuse(saying.refusal);
  const { asked, specs, picked } = saying;
  const { message } = asked;
  const checked = await checkedPlaybook(t, input, trig, listRef, {
    templateId: message.anchor.id,
    specs,
    channels: picked.channels,
  });
  if ("refusal" in checked) return refuse(checked.refusal);
  // A running twin (D9), in the model's words (campaigns/playbook-row.ts twinRefusal). Its Approve meets the rule again
  // (startNewPlaybook), refusing a twin running since the card was made under the name it carries (under any name, for
  // a starter's or a plan step's card that names nothing), and so a press after its key's day, by the campaign its
  // first press started.
  const twin = await twinRefusal(t.ctx, t.tenantId, checked, input.name, PLAYBOOK_CARD_REFUSALS.twin);
  if (twin) return refuse(twin);
  // By the channels it goes by: said and committed whenever they are more than WhatsApp alone by default.
  const by = { channels: checked.channels, named: picked.channels !== undefined };
  const how = await playbookHow(t, message, by, about);
  const reach = await reachNow(t, trig, listRef, { category: message.category }, how, checked.cap_per_run);
  if ("refusal" in reach) return refuse(reach.refusal);
  const { drawn, reading, policies, listLabel } = reach;
  const cls = checked.policy_class;
  const held = await allowanceHeld(t, by.channels, reading, checked, purposeOfPlaybook(cls));
  // A tick that cannot send yet stays on the playbook, and its run holds those people until it can: the card says so.
  const { goes, waiting } = playbookChannelsSaid(how, by, drawn.reach.by_channel, held);
  const under = underMode(cls, policies);
  const trial = trialOf(under.mode);
  const said = cardSays(asked, specs, by, 140);
  if ("refusal" in said) return refuse(said.refusal);
  // The moment and its schedule in the workspace's word: read once the check has passed.
  const { word, moment } = await wordedMoment(t, trig);
  const pieces = {
    where: listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`,
    runs: scheduleLine(checked, word),
    breath: breathSaid(trig),
    end: endSaid(t, input.until),
    goes,
    reaches: yesSaid(purposeOfPlaybook(cls), drawn, how),
    sends: `${trial.said}${under.said}`,
    message: said.says,
  };
  return propose({
    kind: "playbook",
    title: `Campaign: ${checked.name}`,
    summary: `${pieces.where} · ${pieces.runs}${pieces.breath}${pieces.end}${goes} · ${waiting}${pieces.reaches} · ${pieces.sends} Says: ${said.says}`,
    sheet: campaignSheet({ ...pieces, waiting: [waiting] }),
    payload: {
      trigger: trig.id,
      trigger_label: moment.label,
      template_id: message.anchor.id,
      template_name: message.name,
      params: specs,
      run_hour: checked.run_hour,
      cap_per_run: checked.cap_per_run,
      gap_days: checked.gap_days,
      cadence_days: checked.cadence_days,
      name: checked.name,
      candidates: drawn.reach.will,
      policy_class: cls,
      // The list it runs on, when it runs on one: the commit names it as the composer does.
      list_id: checked.list_id,
      list_key: checked.list_key,
      mode: under.mode,
      // Named only when the proposal named some: a card that named none commits as it always did.
      ...namedChannels(by),
      ...trial.payload,
      ...endKept(input.until),
    },
  });
}

/** A playbook, a standing rule: propose_sequence's action moment (sequence.ts), once propose_playbook. */
export const playbookAction = actAction({
  kind: "playbook",
  input: z.object({
    trigger: z.enum(PROPOSABLE_TRIGGERS),
    // On a list (saved_list): the list's token from sequences.lists, and what it sends.
    list: z.string().optional(),
    policy_class: z.enum(LIST_PLAYBOOK_CLASSES).optional(),
    template_id: z.string().optional(),
    params: z.array(z.string()).optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    name: z.string().optional(),
    channels: z.array(z.enum(CONSENT_CHANNELS)).optional(),
    until: z.string().optional(),
    starter: z.enum(PROPOSABLE_STARTERS).optional(),
  }),
  examples: [
    { trigger: "quiet_30" },
    { trigger: APPOINTMENT_TRIGGERS.after, starter: "after_visit_review" },
    {
      trigger: "saved_list",
      list: "seg:booked_week",
      policy_class: "campaign",
      template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      params: ["@first_name", "@booking_link"],
      run_hour: 10,
    },
  ],
  label: "Preparing a campaign",
  words:
    `Action moment takes trigger and proposes a standing rule that sends one message to newly eligible people who said yes: trigger is quiet_30 (win-back by silence, nothing heard in 30 days, where no calendar is connected), lapsed (win-back by appointments, none in 45 days, where a calendar is connected), ${APPOINTMENT_TRIGGERS.before} (a reminder the day before an appointment) or ${APPOINTMENT_TRIGGERS.after} (a check the day after one), both only where a calendar is connected and each sent whatever else the person hears from you within a week of it, everyone_monthly (the month's offer), saved_list (on any list: its token from sequences with action lists in list, one of People's or one of the workspace's own, with policy_class campaign for an offer or reengage for a win-back), or, where deals are on, proposal_waiting (the proposal follow-up: one nudge per proposal waiting past the workspace's pace, one such playbook per workspace, its message carrying the proposal's link as @proposal_link), a moment this workspace is not offered being refused in words to say; template_id is a message from sequences with action lists (the id of any of its versions), or omitted for the trigger's starter, which the card adds at its Approve where the workspace does not hold it yet (its WhatsApp version then goes to WhatsApp for review where none is on file, which the card says), but for a starter that takes words of its own such as the month's offer; starter, in place of template_id, is the moment's starter to file at Approve where the workspace does not hold it yet, by its key: on ${APPOINTMENT_TRIGGERS.after}, after_visit_review is the thank-you with a review ask, only where the Google listing keeps a review link, and after_visit_check, the thank-you that asks how it went, is the one taken when none is named; params are the message's values in order (typed text, or @first_name, @business_name, @booking_link, @review_link, the link its Google listing keeps for a review, @visit_when and @visit_service on an appointment's moment, or @proposal_link), filled in for a starter except a typed one such as the month's offer; run_hour is 9 to 20 by the business's clock (default 10), cap_per_run defaults to 25, and channels (whatsapp, sms, email; when none is named it goes by ` +
    UNNAMED_GOES_BY +
    ` the workspace can send on now that the message holds, as a new playbook opens in Campaigns, and the card says which, so name them only to go by fewer, or by one that is not ready yet) are the ones it may go by, each person once on the first it can: a channel its purpose never carries is refused, and one the workspace cannot send on yet is kept, its runs holding those people until it can; until is its last day, YYYY-MM-DD by the business's clock, today or later, after which it runs nothing. Under a class that sends on its own (auto) a new playbook starts on trial for a week from when it is approved, each run waiting ${PLAYBOOK_VETO_DELAY_WORDS} for a Stop, and the card says so.`,
  build: proposePlaybook,
});
