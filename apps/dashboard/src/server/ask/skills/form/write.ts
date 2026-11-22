import "server-only";
import { randomBytes } from "node:crypto";
import {
  FORM_CRAFT_JSON_SCHEMA,
  formBriefText,
  FormCraftAnswerSchema,
  formFromAnswer,
  type FormBrief,
  type FormDescription,
  type FormFromAnswer,
  type TenantId,
} from "@chanlytics/contracts";
import { log } from "@/server/shared/log";
import { CRAFT_MIN_MS, craftWith, type CraftKept } from "../craft";
import { FORM_SKILL } from "./skill";

/**
 * The form drafter's call (contracts ask/skills/form; the Forms plan, 3.7 and 3.8): one craft call under the drafter's
 * own purpose at the gateway, and its answer held to the form's shape and the house's rules in code before anyone sees
 * it. Where what it wrote does not hold (a form nobody could answer, a promised reply time, a question with one
 * choice), it is asked once more with what is wrong said back, while there is time; a second answer that does not hold
 * is no form. What comes back is a form, one question back to the owner, or why there is neither (said once in the
 * log, `ask_skill_crafted`, with how long it took). Never thrown: the page says "AI couldn't draft this one" for every
 * reason alike.
 */

/** Whose form it is, who asked, and when the answer must be in. */
interface FormWriterCaller {
  tenantId: TenantId;
  userId: string;
  /** The moment the call must have answered by. */
  deadline: number;
}

/** What the drafter came to. `said` is its own sentence to the owner: what it changed, or why a question helps. */
type FormWritten =
  | { wrote: "form"; form: FormDescription; said: string | null }
  | { wrote: "ask"; ask: string }
  | { wrote: "nothing"; kept: CraftKept; problems: string[] };

/** A field's id: short, plain, and its own for as long as the form lives. */
const newFieldId = (): string => `q${randomBytes(4).toString("hex")}`;

/** The brief again, with what was wrong with the first answer said back. */
const mendText = (brief: FormBrief, problems: readonly string[]): string =>
  `${formBriefText(brief)}\n\nYour last answer could not be used. Write it again with each of these put right:\n${problems
    .map((problem) => `- ${problem}`)
    .join("\n")}`;

/** One craft call, read as a form, a question back, or what is wrong with it; a call that did not answer says why. */
async function askModelOnce(
  caller: FormWriterCaller,
  brief: FormBrief,
  question: string,
): Promise<{ read: FormFromAnswer; ms: number } | { kept: CraftKept; ms: number; detail?: string | undefined }> {
  const crafted = await craftWith(FORM_SKILL, {
    tenantId: caller.tenantId,
    userId: caller.userId,
    question,
    schema: FORM_CRAFT_JSON_SCHEMA,
    answer: FormCraftAnswerSchema,
    deadline: caller.deadline,
    what: "form",
  });
  if (!crafted.ok) return { kept: crafted.why, ms: crafted.ms, detail: crafted.detail };
  return { read: formFromAnswer(crafted.answer, brief, newFieldId), ms: crafted.ms };
}

/** The form drafter, asked: a form that holds, one question back to the owner, or why there is neither. */
export async function writeForm(caller: FormWriterCaller, brief: FormBrief): Promise<FormWritten> {
  const said = (outcome: string, ms: number, more: Record<string, unknown> = {}) =>
    log.info("ask_skill_crafted", {
      tenant_id: caller.tenantId,
      skill: FORM_SKILL.id,
      job: brief.job,
      outcome,
      ms,
      ...more,
    });
  let answer = await askModelOnce(caller, brief, formBriefText(brief));
  let spent = answer.ms;
  // What it wrote does not hold: asked once more with what is wrong, while a second call still has time to answer.
  if ("read" in answer && answer.read.problems.length > 0 && caller.deadline - Date.now() >= CRAFT_MIN_MS) {
    const problems = answer.read.problems;
    said("mending", answer.ms, { problems: problems.length });
    answer = await askModelOnce(caller, brief, mendText(brief, problems));
    spent += answer.ms;
  }
  if (!("read" in answer)) {
    said("kept", spent, { why: answer.kept, ...(answer.detail ? { detail: answer.detail.slice(0, 200) } : {}) });
    return { wrote: "nothing", kept: answer.kept, problems: [] };
  }
  const { read } = answer;
  if (read.form) {
    said("wrote", spent);
    return { wrote: "form", form: read.form, said: read.said };
  }
  if (read.ask) {
    said("asked", spent);
    return { wrote: "ask", ask: read.ask };
  }
  said("kept", spent, { why: "checks", problems: read.problems.slice(0, 6) });
  return { wrote: "nothing", kept: "checks", problems: read.problems };
}
