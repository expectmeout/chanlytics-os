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
  PLAYBOOK_CARD_WORDS,
  PLAYBOOK_CLASS_LABEL,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_VETO_DELAY_WORDS,
  REACH_OUT_IS_NOT_A_MOMENT,
  cleanParam,
  dealPaceOf,
  dealsAreOn,
  defaultParamSpecs,
  heldBackOfOneRun,
  parseListToken,
  parseParamSpec,
  playbookChannelsRead,
  playbookRunReach,
  proposalChannelsWords,
  purposeOfPlaybook,
  readyOrWhatsApp,
  runReadingOf,
  saidYesWords,
  scheduleLine,
  slotLabels,
  startersForTrigger,
  messageAboutOfTrigger,
  triggerOf,
  triggerOffered,
  triggerWords,
  type AskedPurpose,
  type CampaignHow,
  type CampaignMessage,
  type ConsentChannel,
  type ListRef,
  type MessageAbout,
  type ParamSpec,
  type RunReading,
  type StarterTemplate,
} from "@chanlytics/contracts";
import { campaignHow } from "@chanlytics/core";
import { followUpOnFile, listPolicies, runningTwins } from "@chanlytics/db";
import { archivedListWords, poolList, type AudiencePool } from "../../../people/audience";
import { dealPaceRead, sellsByOf } from "../../../people/deals";
import { monthSentOrNull } from "../../../campaigns/month-sent";
import { PLAYBOOK_POOL } from "../../../campaigns/playbook-pools";
import {
  checkPlaybookInput,
  checkPlaybookMomentInput,
  noFollowUps,
  poolTouches,
  proposalFollowUps,
  type PlaybookInput,
} from "../../../campaigns/playbooks";
import { checkStarterPlaybook } from "../../../campaigns/starter-templates";
import { createBroadcastPorts } from "../../../ports/campaign-ports";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { businessShape, channelsReady, zoneAndSettings } from "../../../readers/facts";
import { lists as listsReader } from "../../../readers/lists";
import { templates as templatesReader } from "../../../readers/templates";
import {
  AUDIENCES_CALL,
  UUID,
  actAction,
  askedMessage,
  namedChannels,
  propose,
  refuse,
  str,
  touchesThisWeek,
  whatsappAloneRefusal,
  whatsappHow,
  type AskedMessage,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { channelsWaitWords } from "./playbook-channels";
import { cardSays } from "./says";

/**
 * What a playbook proposed with no channel named goes by, as the tool's words tell the model: every channel the reading
 * finds open for it, or the first alone, by the one switch the composer reads (contracts NEW_PLAYBOOK_TICKS_EVERY_CHANNEL,
 * decision 5 of the spec of 8 October 2026). The words said "every one" whichever way the switch stood.
 */
const UNNAMED_GOES_BY = NEW_PLAYBOOK_TICKS_EVERY_CHANNEL ? "every one" : "the first one";

/** What a run does under each mode, in the card's words (also the change card's, act/playbook-change.ts). */
export const MODE_WORDS: Record<string, string> = {
  auto: "each run sends on its own",
  veto: `each run sends ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it`,
  ask: "each run waits for you on Today",
  never: "nothing runs until the class is changed",
};

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
 * own, still offered, unless the workspace hid a message of it, which no card adds back.
 */
async function heldStarter(
  t: ToolContext,
  trig: { id: string; label: string },
): Promise<{ id: string } | { refusal: string; starter: StarterTemplate | null }> {
  const written = startersForTrigger(trig.id);
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
    return { refusal: PLAYBOOK_CARD_REFUSALS.starterHidden(title, AUDIENCES_CALL), starter: null };
  return {
    refusal: PLAYBOOK_CARD_REFUSALS.starterUnsent(title, AUDIENCES_CALL),
    // The one a card may add at its Approve (A0): the moment's starter still offered.
    starter: written.find((s) => !s.retired) ?? null,
  };
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
  message: CampaignMessage,
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

/**
 * The people a playbook on a list runs on, as a run counts them with no one looking (audience.ts poolList over the pool
 * read for no one is what the runner does; here the pool is the member's, so a list about "me" was refused by the check).
 * One of the workspace's own lists is counted from the lists the turn holds (readers/lists.ts), never read again. Or why
 * not, in the model's words.
 */
async function listedPeople(
  t: ToolContext,
  pool: AudiencePool,
  ref: ListRef,
): Promise<{ ids: Set<string>; label: string } | { refusal: string }> {
  const kept = ref.kind === "saved" ? (await load(t.rc, listsReader, undefined)).data.lists : undefined;
  const found = await poolList(t.ctx, t.tenantId, pool, ref, kept);
  if (!found) return { refusal: PLAYBOOK_CARD_REFUSALS.noList(AUDIENCES_CALL) };
  if (found.archived) return { refusal: archivedListWords(found.label, "run") };
  if ("unknown" in found) return { refusal: PLAYBOOK_CARD_REFUSALS.uncounted(found.label, found.unknown) };
  return { ids: new Set(found.memberIds), label: found.label };
}

/**
 * How the workspace can carry a playbook proposal by the channels it names, as the card counts who a run reaches: the
 * workspace's channels now with the message's own versions laid over them (core campaignHow, which the broadcast's route
 * reads too); WhatsApp alone when it names none. A tick that cannot send yet stays on the playbook (the check refuses only
 * what its purpose never carries), so nothing is refused here.
 */
async function playbookHow(
  t: ToolContext,
  message: CampaignMessage,
  by: { channels: ConsentChannel[]; named: boolean },
  /** The moment's (contracts messageAboutOfTrigger): a visit's or a follow-up's message is theirs. */
  about: MessageAbout,
): Promise<CampaignHow> {
  if (!by.named) return whatsappHow(t, about);
  return (await campaignHow(createBroadcastPorts(t.ctx, t.tenantId, { fresh: false }), message, by.channels, about))
    .how;
}

/**
 * What a playbook card says of its channels, when the proposal named some: where it goes, and how many each carries
 * ("on WhatsApp and by email (52 on WhatsApp, 32 by email)"), and for each channel not ready yet that its runs hold those
 * people until it can, as it says of WhatsApp. WhatsApp's own sentence stands for a proposal that named none. `held` is
 * what the month's allowance holds back, where it goes by email or text (allowanceHeld), said after them.
 */
function playbookChannelsSaid(
  how: CampaignHow,
  by: { channels: ConsentChannel[]; named: boolean },
  byChannel: Record<ConsentChannel, number> | undefined,
  held: string,
): { goes: string; waiting: string } {
  if (!by.named) {
    const wa = how.ready.whatsapp;
    return {
      goes: "",
      waiting: `${wa.ready ? "" : `${wa.why ?? "WhatsApp is not ready"} Its runs hold everyone until it is. · `}${held}`,
    };
  }
  const waiting = by.channels
    .filter((c) => !how.ready[c].ready)
    .map((c) => `${how.ready[c].why ?? `${c} is not ready`} Its runs hold those people until it can. · `);
  return {
    goes: ` · ${proposalChannelsWords(by.channels, reachByChannel(byChannel))}`,
    waiting: `${waiting.join("")}${held}`,
  };
}

/** Who a run reaches on each channel, none where the reach said nothing of them. */
const reachByChannel = (byChannel: Record<ConsentChannel, number> | undefined): Record<ConsentChannel, number> =>
  byChannel ?? { whatsapp: 0, sms: 0, email: 0 };

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
}

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

/**
 * A moment and its schedule in the workspace's word (readers/facts.ts businessShape), as the page says them: read once
 * the check has passed, so a proposal it refuses makes no read more.
 */
async function wordedMoment(t: ToolContext, trig: NonNullable<ReturnType<typeof triggerOf>>) {
  const word = (await load(t.rc, businessShape, undefined)).data.word;
  return { word, moment: triggerWords(trig, word) };
}

type Trigger = NonNullable<ReturnType<typeof triggerOf>>;

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

/** What a new campaign's card says of the week's breath: an appointment moment's message is not held to it (D2). */
const breathSaid = (trig: Trigger): string =>
  trig.kind === "visit" ? ` · ${PLAYBOOK_CARD_WORDS.appointmentBreath}` : "";

/**
 * Whether a new campaign starts on trial (D5): only where its class sends on its own (auto). Under ask, veto or never a
 * trial changes nothing: a run there waits for a person, waits for a Stop already, or runs nothing. The payload carries
 * the flag and no instant: the week starts at its Approve, counted by POST playbooks at its own clock (contracts
 * newCampaignTrialUntil), never when the card was made. And what the card says of it, before its class's mode.
 */
function trialOf(mode: string): { payload: { trial?: true }; said: string } {
  return mode === "auto"
    ? { payload: { trial: true }, said: `${PLAYBOOK_CARD_WORDS.trial} · ` }
    : { payload: {}, said: "" };
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
        name: str(input.name, 80) || undefined,
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
 * A second running playbook on the same moment, list and message (the moment spec, D9): a second "set up my campaigns"
 * proposed a twin win-back, which the week's breath then left reaching nobody. Refused in words, unless they named this
 * one apart from every one that runs: a name of its own is a second they asked for. Null where there is no twin.
 */
async function twinRefusal(t: ToolContext, checked: PlaybookInput, named: string | undefined): Promise<string | null> {
  const twins = await runningTwins(t.ctx.supabase, t.tenantId, {
    trigger: checked.trigger,
    listId: checked.list_id,
    listKey: checked.list_key,
    templateId: checked.template_id,
  });
  // Bound and checked, never `twins[0].name`: an index read the compiler lets pass is a new offender in a file at 0
  // (unchecked-index.json).
  const [first] = twins;
  if (!first) return null;
  const own = str(named, PLAYBOOK_NAME_MAX);
  if (own && !twins.some((x) => x.name === own)) return null;
  return PLAYBOOK_CARD_REFUSALS.twin(first.name);
}

/**
 * Who a new playbook's run reaches now, and who its moment names said the yes it needs, as the page's pools count them
 * (audience.ts poolList over the pool; the week's touches and a proposal's follow-ups by poolTouches, as triggerPools
 * reads them; a proposal's pace), with the workspace's autonomy rows; or why not, in the model's words. `message` is the
 * yes its words need; `how` the channels it goes by, the workspace ready on them or not: a run holds the people it cannot
 * reach there. `cap` is the campaign's own cap_per_run: `reading` carries who one run of it reaches on each channel, read
 * off the same draw (contracts runReadingOf), what the month's allowance is held against.
 */
async function reachNow(
  t: ToolContext,
  trig: Trigger,
  listRef: ListRef | null,
  message: { category: string | null },
  how: CampaignHow,
  cap: number,
) {
  const deal = trig.kind === "deal";
  const [pool, policies, paceRead, followUps, touched] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    listPolicies(t.ctx.supabase, t.tenantId).catch(() => []),
    // A proposal's moment is counted as the page counts it (0006): by the pace, less whoever had their follow-up.
    deal ? dealPaceRead(t.ctx, t.tenantId, t.now) : Promise.resolve(null),
    deal ? proposalFollowUps(t.ctx, t.tenantId, t.now).catch(() => null) : Promise.resolve(noFollowUps()),
    // Who was messaged this week, by a campaign or a member (the week's breath), the page's own read of it; one that
    // fails is said in the log (context.ts touchesThisWeek) before the card is refused below.
    touchesThisWeek(t, "propose_campaign.playbook"),
  ]);
  if (!followUps) return { refusal: PLAYBOOK_CARD_REFUSALS.followUpsUnread };
  if (!touched) return { refusal: PLAYBOOK_CARD_REFUSALS.weekUnread };
  // A list's people, as a run counts them (listedPeople).
  const listed = listRef ? await listedPeople(t, pool, listRef) : { ids: null, label: null };
  if ("refusal" in listed) return listed;
  // Everyone the moment reaches now, uncapped (the page's count), with the yes its message needs and its moment's: the
  // check held the two to agree, so the stricter is either.
  const drawn = playbookRunReach(
    pool.rows,
    { trigger: trig.id, cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0, message, ...how },
    poolTouches(touched, followUps),
    t.now.getTime(),
    dealPaceOf(paceRead),
    listed.ids,
  );
  return { drawn, reading: runReadingOf(drawn, trig.id, [cap]), policies, listLabel: listed.label };
}

/**
 * What the month's email and text allowance will hold back of one run of it at its cap, where it goes by them (A7;
 * contracts heldBackOfOneRun, the composer's own rule and sentence), with its separator; nothing while there is room,
 * where it goes by WhatsApp alone (no count is read), or where the month could not be counted.
 */
async function allowanceHeld(
  t: ToolContext,
  channels: readonly ConsentChannel[],
  reading: RunReading,
  run: { trigger: string; cap_per_run: number },
  purpose: AskedPurpose,
): Promise<string> {
  if (!channels.some((c) => c !== "whatsapp")) return "";
  const words = heldBackOfOneRun(reading, run, await monthSentOrNull(t.tenantId, t.now), purpose);
  return words ? `${words} · ` : "";
}

/** The class a playbook's runs go under, its mode and what a run does under it, as a card ends. */
function underMode(cls: PlaybookInput["policy_class"], policies: readonly { class: string; mode: string }[]) {
  const mode = policies.find((r) => r.class === cls)?.mode ?? "ask";
  return { mode, said: `under “${PLAYBOOK_CLASS_LABEL[cls]}” (${mode}): ${MODE_WORDS[mode] ?? mode}.` };
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
  const reach = await reachNow(
    t,
    trig,
    listRef,
    { category: starter.category },
    { channels, ready: read.ready, about: read.about },
    clock.cap_per_run,
  );
  if ("refusal" in reach) return refuse(reach.refusal);
  const { drawn, reading, policies, listLabel } = reach;
  const held = await allowanceHeld(t, channels, reading, clock, purposeOfPlaybook(cls));
  const under = underMode(cls, policies);
  const trial = trialOf(under.mode);
  const name = str(input.name, PLAYBOOK_NAME_MAX);
  // Its WhatsApp version goes for review at Approve only where none is on file; one on file is said as it stands, by the
  // drawer's reading (in review, refused), and the filing leaves it so.
  const forReview = judged.whatsappOnFile === null && judged.message.versions.whatsapp !== null;
  const waits = starterWaitWords(read, forReview, workspace.whatsapp.ready);
  // The moment and its schedule in the workspace's word, as the message card says them.
  const { word, moment } = await wordedMoment(t, trig);
  return propose({
    kind: "playbook",
    title: `Campaign: ${name || moment.label}`,
    summary: `${listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`} · ${scheduleLine(clock, word)}${breathSaid(trig)} · ${LIBRARY_STARTER_WORDS.addsFirst(starter.title)} · ${proposalChannelsWords(channels, reachByChannel(drawn.reach.by_channel))}${waits} · ${held}${saidYesWords("the list", purposeOfPlaybook(cls), drawn.reach.will, drawn.saidYes)} · ${trial.said}${under.said}`,
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
    },
  });
}

async function proposePlaybook(t: ToolContext, input: PlaybookProposed): Promise<ProposalOutcome> {
  const trig = triggerOf(str(input.trigger, 30));
  if (!trig) return refuse(PLAYBOOK_CARD_REFUSALS.trigger(PROPOSABLE_TRIGGERS));
  if (trig.kind === "reach_out") return refuse(REACH_OUT_IS_NOT_A_MOMENT);
  // A playbook on a list names it by its token (decision 0009): one of People's, or one of the workspace's own.
  const listRef = trig.kind === "saved" ? parseListToken(str(input.list, 60)) : null;
  if (trig.kind === "saved" && !listRef) return refuse(PLAYBOOK_CARD_REFUSALS.listToken(AUDIENCES_CALL));
  const followUp = await followUpRefusal(t, trig);
  if (followUp) return refuse(followUp);
  let templateId = str(input.template_id, 40);
  if (templateId && !UUID.test(templateId)) return refuse(PLAYBOOK_CARD_REFUSALS.templateId(AUDIENCES_CALL));
  // An appointment's moment where no calendar is connected, refused before its message or its channels are read (D2).
  const notOffered = await calendarRefusal(t, trig);
  if (notOffered) return refuse(notOffered);
  if (!templateId) {
    const own = await heldStarter(t, trig);
    // A starter not on file is added at the card's Approve (A0), never refused while one is offered.
    if ("refusal" in own)
      return own.starter ? proposeOnStarter(t, input, trig, listRef, own.starter) : refuse(own.refusal);
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
  const twin = await twinRefusal(t, checked, input.name);
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
  return propose({
    kind: "playbook",
    title: `Campaign: ${checked.name}`,
    summary: `${listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`} · ${scheduleLine(checked, word)}${breathSaid(trig)}${goes} · ${waiting}${saidYesWords("the list", purposeOfPlaybook(cls), drawn.reach.will, drawn.saidYes)} · ${trial.said}${under.said} Says: ${said.says}`,
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
    },
  });
}

/** A playbook, a standing rule: propose_campaign's action playbook (campaign.ts), once propose_playbook. */
export const playbookAction = actAction({
  kind: "playbook",
  input: z.object({
    trigger: z.enum(PROPOSABLE_TRIGGERS),
    // On a list (saved_list): the list's token from campaigns.audiences, and what it sends.
    list: z.string().optional(),
    policy_class: z.enum(LIST_PLAYBOOK_CLASSES).optional(),
    template_id: z.string().optional(),
    params: z.array(z.string()).optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    name: z.string().optional(),
    channels: z.array(z.enum(CONSENT_CHANNELS)).optional(),
  }),
  examples: [
    { trigger: "quiet_30" },
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
    "Action playbook takes trigger and proposes a standing rule that sends one message to newly eligible people who said yes: trigger is quiet_30 (win-back by silence, nothing heard in 30 days, where no calendar is connected), lapsed (win-back by appointments, none in 45 days, where a calendar is connected), visit_tomorrow (a reminder the day before an appointment) or visited (a check the day after one), both only where a calendar is connected and each sent whatever else the person heard that week, everyone_monthly (the month's offer), saved_list (on any list: its token from campaigns with action audiences in list, one of People's or one of the workspace's own, with policy_class campaign for an offer or reengage for a win-back), or, where deals are on, proposal_waiting (the proposal follow-up: one nudge per proposal waiting past the workspace's pace, one such playbook per workspace, its message carrying the proposal's link as @proposal_link), a moment this workspace is not offered being refused in words to say; template_id is a message from action audiences (the id of any of its versions), or omitted for the trigger's starter, which the card adds at its Approve where the workspace does not hold it yet (its WhatsApp version then goes to WhatsApp for review where none is on file, which the card says), but for a starter that takes words of its own such as the month's offer; params are the message's values in order (typed text, or @first_name, @business_name, @booking_link, @review_link, the link its Google listing keeps for a review, @visit_when and @visit_service on an appointment's moment, or @proposal_link), filled in for a starter except a typed one such as the month's offer; run_hour is 9 to 20 by the business's clock (default 10), cap_per_run defaults to 25, and channels (whatsapp, sms, email; when none is named it goes by " +
    UNNAMED_GOES_BY +
    ` the workspace can send on now that the message holds, as a new playbook opens in Campaigns, and the card says which, so name them only to go by fewer, or by one that is not ready yet) are the ones it may go by, each person once on the first it can: a channel its purpose never carries is refused, and one the workspace cannot send on yet is kept, its runs holding those people until it can. Under a class that sends on its own (auto) a new playbook starts on trial for a week from when it is approved, each run waiting ${PLAYBOOK_VETO_DELAY_WORDS} for a Stop, and the card says so.`,
  build: proposePlaybook,
});
