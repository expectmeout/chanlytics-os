import { AppError, cleanParam, parseParamSpec, type ParamSpec } from "@chanlytics/contracts";
import type { TemplateRow, TemplateValuesPorts } from "./ports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The template as Meta holds it and the values as Meta will accept them:
 * what a broadcast and a playbook both name, judged once. Approved; as many
 * values as the template takes; each typed text once or a value the job
 * fills per person; a booking-link slot needs a link on file. Every refusal
 * is a sentence for the person composing.
 */
export async function templateValues(ports: TemplateValuesPorts, cmd: { templateId: string; params: unknown }): Promise<{ template: TemplateRow; specs: ParamSpec[] }> {
  if (!UUID.test(cmd.templateId)) throw new AppError("validation", "Pick a template.");
  const tpl = await ports.template(cmd.templateId);
  if (!tpl) throw new AppError("not_found", "Template not found.", 404);
  if (tpl.meta_status !== "approved") throw new AppError("conflict", "That template is not approved by WhatsApp, so it cannot be sent.", 409);
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  const rawParams = Array.isArray(cmd.params) ? cmd.params : [];
  if (rawParams.length !== expected) {
    throw new AppError("validation", expected === 0 ? "This template takes no values." : `This template takes ${expected} value${expected === 1 ? "" : "s"}.`);
  }
  // Each slot: typed text once, or a value the job fills per person.
  const specs: ParamSpec[] = [];
  for (const p of rawParams) {
    const spec = parseParamSpec(p);
    if (!spec) throw new AppError("validation", "Each value is typed text, their first name, the business name, or the booking link.");
    if (spec.kind === "text") {
      const v = cleanParam(spec.value);
      if (v === null) throw new AppError("validation", "Every value is needed, without line breaks or tabs, and under 1024 characters.");
      specs.push({ kind: "text", value: v });
    } else {
      specs.push(spec);
    }
  }
  if (specs.some((s) => s.kind === "booking_link") && !(await ports.bookingLink())) {
    throw new AppError("conflict", "This message takes the booking link, and none is on file. Add it in Settings › Workspace first.", 409);
  }
  return { template: tpl, specs };
}
