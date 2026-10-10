import {
  AppError,
  BUILTIN_LISTS,
  LIST_PLAYBOOK_CLASSES,
  FOLLOW_UP_NEEDS_DEALS,
  REACH_OUT_IS_NOT_A_MOMENT,
  FOLLOW_UP_NEEDS_LINK,
  MOMENTS_RETIRED,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  PLAYBOOK_NAME_MAX,
  appointmentWords,
  channelNeverCarries,
  enrolPurpose,
  isWinBack,
  messageFitsMoment,
  messageHolds,
  messageWhyNot,
  momentOffered,
  momentReadsCalendar,
  playbookName,
  ruleNeeds,
  triggerOf,
  triggerOffered,
  triggerWords,
  UUID,
  winBackWords,
  type AppointmentWord,
  type CampaignMessage,
  type ConsentChannel,
  type ParamSpec,
  type PlaybookPolicyClass,
  type PlaybookTrigger,
} from "@chanlytics/contracts";
import { parseChannels } from "./message-channels";
import { readCampaignMessage, templateValues } from "./template-values";
import type { TemplateValuesPorts } from "./ports";

/** Everything a playbook names, checked. */
export interface PlaybookInput {
  name: string;
  trigger: PlaybookTrigger;
  /** The list of the workspace's own a saved_list playbook runs on; null for every other trigger. */
  list_id: string | null;
  /** The People list a saved_list playbook runs on, by its id (00168); null otherwise. Never both. */
  list_key: string | null;
  template_id: string;
  template_name: string;
  template_language: string;
  params: ParamSpec[];
  policy_class: PlaybookPolicyClass;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
  /** The channels it may go by: WhatsApp alone when none is named (an edit that names none keeps the ones it has). */
  channels: ConsentChannel[];
}

/** One whole-number field of the body: what it is when none is sent, the range it must fall in, and its name. */
interface IntRule {
  fallback: number;
  min: number;
  max: number;
  what: string;
}

function int(v: unknown, { fallback, min, max, what }: IntRule): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new AppError("validation", `${what} must be a whole number from ${min} to ${max}.`);
  return n;
}

/** What a playbook's check reads beyond its message: the name of a list it runs on, or null when there is none. */
export interface CheckPlaybookPorts extends TemplateValuesPorts {
  listName(id: string): Promise<string | null>;
  /** Whether deals are on here (dealsAreOn, 0008): a proposal follow-up is made only then (0006). */
  dealsOn(): Promise<boolean>;
  /**
   * Whether a calendar is connected here, its feed readable just now or not (the Playbooks page's calendar state is not
   * "none"): which of the two win-backs a new playbook may be (contracts momentOffered).
   */
  calendarOn(): Promise<boolean>;
  /**
   * What the workspace calls an appointment (contracts appointmentWordOf): the words a refusal says, and the name a new
   * campaign on an appointment moment takes when it is given none. Asked only where one of those is said.
   */
  appointmentWord(): Promise<AppointmentWord>;
}

/**
 * The moment a playbook names: where it may run at all, and where it may be made new. A proposal follow-up where deals
 * are off has no proposal to follow (0006), whether it is made or changed; a playbook kept on its moment is not new,
 * so a retired moment's, the other win-back's and an appointment moment's made before a calendar was required keep
 * running and may be changed. A new one is held to what is offered now (contracts momentOffered), in the words for each
 * and in the workspace's word. Each fact is asked only of the moment it decides.
 */
async function refuseMoment(
  ports: CheckPlaybookPorts,
  trig: NonNullable<ReturnType<typeof triggerOf>>,
  existing: { trigger: string } | null,
): Promise<void> {
  const dealsOn = trig.kind === "deal" ? await ports.dealsOn() : false;
  if (trig.kind === "deal" && !triggerOffered(trig, dealsOn)) throw new AppError("validation", FOLLOW_UP_NEEDS_DEALS);
  if (existing?.trigger === trig.id) return;
  const retired = MOMENTS_RETIRED[trig.id];
  if (retired) throw new AppError("validation", retired);
  const calendarOn = momentReadsCalendar(trig) ? await ports.calendarOn() : false;
  if (momentOffered(trig, { dealsOn, calendarOn })) return;
  const word = await ports.appointmentWord();
  if (!isWinBack(trig.id)) throw new AppError("validation", appointmentWords(word).needsCalendar);
  const w = winBackWords(word);
  throw new AppError("validation", trig.id === "lapsed" ? w.lapsed : w.quiet_30);
}

/** The name a campaign given none takes: its list's, an appointment moment's in the workspace's word, else its moment's. */
async function defaultLabel(
  ports: CheckPlaybookPorts,
  trig: NonNullable<ReturnType<typeof triggerOf>>,
  listName: string | null,
): Promise<string> {
  if (listName) return listName;
  return trig.kind === "visit" ? triggerWords(trig, await ports.appointmentWord()).label : trig.label;
}

/**
 * A playbook on a list names it (decision 0009): one of People's by its id (list_key), or one of the workspace's own
 * (list_id), which must be this workspace's. A run has no one looking, so a list about "me" is never one it runs on.
 * Every other moment names none: all three are null.
 */
async function listOf(
  ports: CheckPlaybookPorts,
  trig: NonNullable<ReturnType<typeof triggerOf>>,
  body: Record<string, unknown> | null,
): Promise<{ listName: string | null; listKey: string | null; listId: string | null }> {
  if (trig.kind !== "saved") return { listName: null, listKey: null, listId: null };
  const listKey = typeof body?.list_key === "string" && body.list_key ? body.list_key : null;
  if (listKey) {
    const b = BUILTIN_LISTS.find((l) => l.id === listKey);
    if (!b) throw new AppError("validation", "Pick the list it runs on.");
    if (ruleNeeds(b.rule).includes("viewer"))
      throw new AppError(
        "validation",
        `${b.label} is about whoever is looking, and a campaign runs with no one looking. Pick another list.`,
      );
    return { listName: b.label, listKey, listId: null };
  }
  const listId = typeof body?.list_id === "string" ? body.list_id : null;
  if (!listId || !UUID.test(listId)) throw new AppError("validation", "Pick the list it runs on.");
  const listName = await ports.listName(listId);
  if (!listName) throw new AppError("not_found", "List not found.", 404);
  return { listName, listKey: null, listId };
}

/** A moment and its message agree on the yes they need (contracts messageFitsMoment, decision 7), made or changed. */
function refuseMessageThatDisagrees(cls: string, category: string | null): void {
  const fit = messageFitsMoment(cls, category);
  if (!fit.ok) throw new AppError("validation", fit.words);
}

/**
 * A playbook keeps a tick that cannot send yet (its runs hold those people), but never goes by a message none of whose
 * ticks it holds: a broadcast of it could not be sent, and a playbook can never name a message a broadcast could not
 * send. Refused in each ticked channel's sentence for the version the message lacks (contracts messageWhyNot, one after
 * another), so a message with an email and no WhatsApp version is kept on WhatsApp and email, and is refused on WhatsApp
 * alone with WhatsApp's standing.
 */
function refuseMessageNoTickHolds(message: CampaignMessage, channels: readonly ConsentChannel[]): void {
  const held = messageHolds(message);
  if (channels.some((c) => held[c])) return;
  const words = channels.flatMap((c) => messageWhyNot(message, c) ?? []);
  throw new AppError("conflict", words.join(" "), 409);
}

/**
 * Which of WhatsApp, text and email a playbook may go by, judged the one way a save and a change of its channels alone
 * both ask it. A tick its purpose never carries (texts carry no offers) is refused here, not at send. One the workspace
 * is not ready on now is not (offers by email before the campaigns domain is set up, among them): a run holds the people
 * it cannot reach there until it can, and never fails the playbook for it. `kept` is what it already ticks, which a
 * save that names none keeps.
 */
function channelsItMayGoBy(
  asked: unknown,
  kept: readonly string[] | null,
  cls: string | null,
  message: CampaignMessage,
): ConsentChannel[] {
  const channels = parseChannels(asked, kept);
  const purpose = enrolPurpose(cls, message);
  const never = channels.map((c) => channelNeverCarries(c, purpose)).find((words) => words !== null);
  if (never) throw new AppError("validation", never);
  refuseMessageNoTickHolds(message, channels);
  return channels;
}

/**
 * A playbook's channels alone, changed (the review of 8 October 2026): what the Goes by row of its drawer and Ask's card
 * ask for. They are judged against the playbook as it stands, its own class and its own message read from its row, the
 * way a save judges them (channelsItMayGoBy), and nothing else of it is taken from the caller, so nothing else can be
 * written back. A whole playbook re-sent to change one tick wrote a caller's copy of every other field over whatever
 * had been edited since, and re-derived its class. `asked` must be a list: this door exists to name them.
 */
export async function checkPlaybookChannels(
  ports: Pick<TemplateValuesPorts, "message">,
  row: { trigger: string; policy_class: string | null; template_id: string | null; channels: string[] | null },
  asked: unknown,
): Promise<ConsentChannel[]> {
  const message = await readCampaignMessage(ports, row.template_id ?? "");
  const cls = row.policy_class ?? triggerOf(row.trigger)?.cls ?? null;
  return channelsItMayGoBy(Array.isArray(asked) ? asked : [], row.channels, cls, message);
}

/**
 * Everything a playbook names, checked the way a broadcast is: the trigger,
 * then the message and its values through the one judgement, then the
 * whole numbers. A playbook can never name a message a broadcast could not
 * send or a slot the workspace cannot fill. `existing` is the playbook being changed, null for a new one.
 */
export async function checkPlaybook(
  ports: CheckPlaybookPorts,
  body: Record<string, unknown> | null,
  existing: { trigger: string; channels?: string[] | null } | null,
): Promise<PlaybookInput> {
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, PLAYBOOK_NAME_MAX) : "";
  const trig = typeof body?.trigger === "string" ? triggerOf(body.trigger) : null;
  if (!trig)
    throw new AppError(
      "validation",
      `Pick what starts it: win-back, the month's offer, ${appointmentWords(await ports.appointmentWord()).startsWith}, one of your lists, or a proposal waiting.`,
    );
  // A reach-out's steps are not moments (Reach out, Part 3): they are made on the reach-out sheet, over a lead search.
  if (trig.kind === "reach_out") throw new AppError("validation", REACH_OUT_IS_NOT_A_MOMENT);
  await refuseMoment(ports, trig, existing);
  const { listName, listKey, listId } = await listOf(ports, trig, body);
  // A playbook on a list sends an offer or a win-back, under that class's autonomy row; every other moment its own.
  const cls =
    trig.kind === "saved" && (LIST_PLAYBOOK_CLASSES as readonly string[]).includes(String(body?.policy_class))
      ? (body!.policy_class as PlaybookPolicyClass)
      : trig.cls;
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  const { message, specs } = await templateValues(ports, {
    templateId,
    params: body?.params,
    visits: trig.kind === "visit",
    proposal: trig.kind === "deal",
  });
  refuseMessageThatDisagrees(cls, message.category);
  const channels = channelsItMayGoBy(body?.channels, existing?.channels ?? null, cls, message);
  // A follow-up carries the proposal it follows (0006): with no slot filled by its link it is a bare "just checking
  // in", which is a person's to write.
  if (trig.kind === "deal" && !specs.some((s) => s.kind === "proposal_link"))
    throw new AppError("validation", FOLLOW_UP_NEEDS_LINK);
  return {
    // A name when none was given: the moment's alone when it sends its own starter, else with the message's title; a
    // list's own name for a playbook on a list; an appointment moment's in the workspace's word (D43).
    name: (name || playbookName({ id: trig.id, label: await defaultLabel(ports, trig, listName) }, message)).slice(
      0,
      PLAYBOOK_NAME_MAX,
    ),
    trigger: trig.id,
    list_id: listId,
    list_key: listKey,
    // The message's anchor, whichever version's id was picked: the one id every version of it resolves to.
    template_id: message.anchor.id,
    template_name: message.name,
    template_language: message.language,
    params: specs,
    policy_class: cls,
    run_hour: int(body?.run_hour, {
      fallback: PLAYBOOK_DEFAULTS.runHour,
      min: PLAYBOOK_HOURS.min,
      max: PLAYBOOK_HOURS.max,
      what: "The hour",
    }),
    cap_per_run: int(body?.cap_per_run, { fallback: PLAYBOOK_DEFAULTS.capPerRun, min: 1, max: 500, what: "The cap" }),
    gap_days: int(body?.gap_days, { fallback: PLAYBOOK_DEFAULTS.gapDays, min: 7, max: 365, what: "The gap" }),
    cadence_days: int(body?.cadence_days, {
      fallback: PLAYBOOK_DEFAULTS.cadenceDays,
      min: 1,
      max: 90,
      what: "The cadence",
    }),
    channels,
  };
}
