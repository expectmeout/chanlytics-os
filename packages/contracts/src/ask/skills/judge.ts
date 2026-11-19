/**
 * How a craft skill's words are judged in its eval (skill.ts): code first, the skill's own checks, then a judge model
 * reads the brief and the words against the skill's rubric, one verdict a criterion with a line why. A hard criterion
 * is what must never fail a customer; a soft one is the craft. A case passes when every check and every hard criterion
 * passes; the soft ones are said as a share.
 *
 * What every skill's rubric shares is here, once: the judge's answer and its schema, the lines of a rubric as the
 * judge is told them, and the verdict. A skill's own rubric (its criteria, who its judge is, its question) is its
 * folder's rubric.ts.
 */
import { z } from "zod";

export interface RubricCriterion {
  id: string;
  hard: boolean;
  ask: string;
}

/** A rubric as the judge is told it: each criterion by its id, the ones that must pass marked. */
export const rubricLines = (rubric: readonly RubricCriterion[]): string =>
  rubric.map((criterion) => `- ${criterion.id}${criterion.hard ? " (must pass)" : ""}: ${criterion.ask}`).join("\n");

/** The judge's answer for a rubric, for the API's structured output: one verdict for each of its criteria, by id. */
export function judgeJsonSchema(rubric: readonly RubricCriterion[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["verdicts"],
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "pass", "why"],
          properties: {
            id: { type: "string", enum: rubric.map((criterion) => criterion.id) },
            pass: { type: "boolean" },
            why: { type: "string" },
          },
        },
      },
    },
  } as const;
}

export const JudgeAnswerSchema = z.object({
  verdicts: z.array(z.object({ id: z.string(), pass: z.boolean(), why: z.string() })),
});
export type JudgeAnswer = z.infer<typeof JudgeAnswerSchema>;

export interface RubricVerdict {
  pass: boolean;
  /** What failed that must not: each check's line, and each hard criterion with the judge's why. */
  failed: string[];
  /** The soft criteria that passed, of how many. */
  soft: { passed: number; of: number };
  /** Each soft criterion that did not pass, with the judge's why. */
  notes: string[];
}

/**
 * A case's verdict: every code check (each handed in as a line) and every hard criterion must pass. A criterion the
 * judge left out is a failure of the judge's answer, said as one, never a pass.
 */
export function rubricVerdict(
  rubric: readonly RubricCriterion[],
  checkLines: readonly string[],
  judged: JudgeAnswer,
): RubricVerdict {
  const failed = [...checkLines];
  const notes: string[] = [];
  let passed = 0;
  let of = 0;
  for (const criterion of rubric) {
    const found = judged.verdicts.find((verdict) => verdict.id === criterion.id);
    const ok = found?.pass === true;
    const reason = found ? found.why : "the judge gave no verdict";
    if (criterion.hard) {
      if (!ok) failed.push(`${criterion.id}: ${reason}`);
    } else {
      of += 1;
      if (ok) passed += 1;
      else notes.push(`${criterion.id}: ${reason}`);
    }
  }
  return { pass: failed.length === 0, failed, soft: { passed, of }, notes };
}
