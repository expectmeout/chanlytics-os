import {
  AppError,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  PLAYBOOK_NAME_MAX,
  playbookName,
  triggerOf,
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

/**
 * Everything a playbook names, checked the way a broadcast is: the trigger,
 * then the template and its values through the one judgement, then the
 * whole numbers. A playbook can never name a template a broadcast could not
 * send or a slot the workspace cannot fill.
 */
export async function checkPlaybook(
  ports: TemplateValuesPorts,
  body: Record<string, unknown> | null,
): Promise<PlaybookInput> {
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, PLAYBOOK_NAME_MAX) : "";
  const trig = typeof body?.trigger === "string" ? triggerOf(body.trigger) : null;
  if (!trig)
    throw new AppError(
      "validation",
      "Pick what starts it: win-back, welcome, save our number, the month's offer, a visit tomorrow, or a visit yesterday.",
    );
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  const { template: tpl, specs } = await templateValues(ports, {
    templateId,
    params: body?.params,
    visits: trig.kind === "visit",
  });
  return {
    // A name when none was given: the trigger's alone when it sends its own starter, else with the template's title.
    name: name || playbookName(trig, tpl).slice(0, PLAYBOOK_NAME_MAX),
    trigger: trig.id,
    template_id: tpl.id,
    template_name: tpl.name,
    template_language: tpl.language,
    params: specs,
    policy_class: trig.cls,
    run_hour: int(body?.run_hour, PLAYBOOK_DEFAULTS.runHour, PLAYBOOK_HOURS.min, PLAYBOOK_HOURS.max, "The hour"),
    cap_per_run: int(body?.cap_per_run, PLAYBOOK_DEFAULTS.capPerRun, 1, 500, "The cap"),
    gap_days: int(body?.gap_days, PLAYBOOK_DEFAULTS.gapDays, 7, 365, "The gap"),
    cadence_days: int(body?.cadence_days, PLAYBOOK_DEFAULTS.cadenceDays, 1, 90, "The cadence"),
  };
}
