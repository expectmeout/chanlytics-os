import {
  AppError,
  BUILTIN_LISTS,
  LIST_PLAYBOOK_CLASSES,
  FOLLOW_UP_NEEDS_DEALS,
  REACH_OUT_IS_NOT_A_MOMENT,
  FOLLOW_UP_NEEDS_LINK,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  PLAYBOOK_NAME_MAX,
  playbookName,
  ruleNeeds,
  triggerOf,
  triggerOffered,
  UUID,
  type ParamSpec,
  type PlaybookPolicyClass,
  type PlaybookTrigger,
} from "@chanlytics/contracts";
import { templateValues } from "./template-values";
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
}

function int(v: unknown, fallback: number, min: number, max: number, what: string): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new AppError("validation", `${what} must be a whole number from ${min} to ${max}.`);
  return n;
}

/** What a playbook's check reads beyond its template: the name of a list it runs on, or null when there is none. */
export interface CheckPlaybookPorts extends TemplateValuesPorts {
  listName(id: string): Promise<string | null>;
  /** Whether deals are on here (dealsAreOn, 0008): a proposal follow-up is made only then (0006). */
  dealsOn(): Promise<boolean>;
}

/**
 * Everything a playbook names, checked the way a broadcast is: the trigger,
 * then the template and its values through the one judgement, then the
 * whole numbers. A playbook can never name a template a broadcast could not
 * send or a slot the workspace cannot fill.
 */
export async function checkPlaybook(
  ports: CheckPlaybookPorts,
  body: Record<string, unknown> | null,
): Promise<PlaybookInput> {
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, PLAYBOOK_NAME_MAX) : "";
  const trig = typeof body?.trigger === "string" ? triggerOf(body.trigger) : null;
  if (!trig)
    throw new AppError(
      "validation",
      "Pick what starts it: win-back, welcome, save our number, the month's offer, a visit tomorrow, a visit yesterday, lapsed, one of your lists, or a proposal waiting.",
    );
  // A reach-out's steps are not moments (Reach out, Part 3): they are made on the reach-out sheet, over a lead search.
  if (trig.kind === "reach_out") throw new AppError("validation", REACH_OUT_IS_NOT_A_MOMENT);
  // A proposal follow-up where deals are off has no proposal to follow (0006): refused in the words a run says. Only
  // a moment that needs deals asks whether they are on.
  if (trig.kind === "deal" && !triggerOffered(trig, await ports.dealsOn()))
    throw new AppError("validation", FOLLOW_UP_NEEDS_DEALS);
  // A playbook on a list names it (decision 0009): one of People's by its id (list_key), or one of the workspace's own
  // (list_id), which must be this workspace's. A run has no one looking, so a list about "me" is never one it runs on.
  let listName: string | null = null;
  const listKey = trig.kind === "saved" && typeof body?.list_key === "string" && body.list_key ? body.list_key : null;
  const listId = trig.kind === "saved" && !listKey && typeof body?.list_id === "string" ? body.list_id : null;
  if (trig.kind === "saved") {
    if (listKey) {
      const b = BUILTIN_LISTS.find((l) => l.id === listKey);
      if (!b) throw new AppError("validation", "Pick the list it runs on.");
      if (ruleNeeds(b.rule).includes("viewer"))
        throw new AppError(
          "validation",
          `${b.label} is about whoever is looking, and a playbook runs with no one looking. Pick another list.`,
        );
      listName = b.label;
    } else {
      if (!listId || !UUID.test(listId)) throw new AppError("validation", "Pick the list it runs on.");
      listName = await ports.listName(listId);
      if (!listName) throw new AppError("not_found", "List not found.", 404);
    }
  }
  // A playbook on a list sends an offer or a win-back, under that class's autonomy row; every other moment its own.
  const cls =
    trig.kind === "saved" && (LIST_PLAYBOOK_CLASSES as readonly string[]).includes(String(body?.policy_class))
      ? (body!.policy_class as PlaybookPolicyClass)
      : trig.cls;
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  const { template: tpl, specs } = await templateValues(ports, {
    templateId,
    params: body?.params,
    visits: trig.kind === "visit",
    proposal: trig.kind === "deal",
  });
  // A follow-up carries the proposal it follows (0006): with no slot filled by its link it is a bare "just checking
  // in", which is a person's to write.
  if (trig.kind === "deal" && !specs.some((s) => s.kind === "proposal_link"))
    throw new AppError("validation", FOLLOW_UP_NEEDS_LINK);
  return {
    // A name when none was given: the trigger's alone when it sends its own starter, else with the template's title; a
    // list's own name for a playbook on a list.
    name: name || playbookName(listName ? { id: trig.id, label: listName } : trig, tpl).slice(0, PLAYBOOK_NAME_MAX),
    trigger: trig.id,
    list_id: listId,
    list_key: listKey,
    template_id: tpl.id,
    template_name: tpl.name,
    template_language: tpl.language,
    params: specs,
    policy_class: cls,
    run_hour: int(body?.run_hour, PLAYBOOK_DEFAULTS.runHour, PLAYBOOK_HOURS.min, PLAYBOOK_HOURS.max, "The hour"),
    cap_per_run: int(body?.cap_per_run, PLAYBOOK_DEFAULTS.capPerRun, 1, 500, "The cap"),
    gap_days: int(body?.gap_days, PLAYBOOK_DEFAULTS.gapDays, 7, 365, "The gap"),
    cadence_days: int(body?.cadence_days, PLAYBOOK_DEFAULTS.cadenceDays, 1, 90, "The cadence"),
  };
}
