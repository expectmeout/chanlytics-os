import "server-only";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  FOLLOW_UP_CONDITIONS,
  SEQUENCE_DRAFT_THEN_MAX,
  SEQUENCE_DRAFT_WORDS_MAX,
  UUID,
} from "@chanlytics/contracts";

/**
 * What the routes under sequences take (decision 0060), declared on each route so docs/api.md says it: the shape
 * alone. What a value means (a message's slots, a step of this sequence) is the doors' to judge (doors.ts).
 */

/** The wait before a customer's step after the first, in days: the steps' own bounds (00440 sequence_steps_shape). */
const AFTER_DAYS = z.number().int().min(1, "Wait at least a day.").max(90, "Wait at most 90 days.");
const ONLY_IF = z.array(z.enum(FOLLOW_UP_CONDITIONS)).max(FOLLOW_UP_CONDITIONS.length);
const CHANNELS = z.array(z.enum(CONSENT_CHANNELS)).min(1, "Name a channel.").max(CONSENT_CHANNELS.length);
const STEP_NAME = z.string().trim().min(1).max(120);
/** A message's values: typed words, or a value a run fills ("@first_name", or a spec); judged against the message. */
const PARAMS = z.array(z.unknown()).max(20);
/** An id, as every route reads one (contracts UUID). */
const anId = (words: string) => z.string().regex(UUID, words);

/** POST sequences/:id/steps: a step after the last, its wait and its message; what must still hold, its channels. */
export const NEW_STEP_BODY = z.strictObject({
  after_days: AFTER_DAYS,
  template_id: anId("Which message?"),
  params: PARAMS.optional(),
  only_if: ONLY_IF.optional(),
  channels: CHANNELS.optional(),
  name: STEP_NAME.optional(),
});
export type NewStepBody = z.infer<typeof NEW_STEP_BODY>;

/** PUT sequences/:id/steps/:step: any of its wait, what must still hold, its channels, name and values. */
export const STEP_CHANGE_BODY = z
  .strictObject({
    after_days: AFTER_DAYS.optional(),
    only_if: ONLY_IF.optional(),
    channels: CHANNELS.optional(),
    name: STEP_NAME.optional(),
    params: PARAMS.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Say what changes.");
export type StepChangeBody = z.infer<typeof STEP_CHANGE_BODY>;

/** POST sequences/:id/steps/:step/words: the message the step sends from now, with the values it takes. */
export const STEP_WORDS_BODY = z.strictObject({ template_id: anId("Which message?"), params: PARAMS.optional() });
export type StepWordsBody = z.infer<typeof STEP_WORDS_BODY>;

/** POST sequences/:id/leave: the people (their places in it) taken out. */
export const LEAVE_BODY = z.strictObject({
  enrollment_ids: z.array(anId("Who leaves?")).min(1, "Who leaves?").max(500, "At most 500 at once."),
});
export type LeaveBody = z.infer<typeof LEAVE_BODY>;

/** A step after the first, as a new sequence names it: its wait, what must still hold, its message and values. */
const THEN_STEP = z.strictObject({
  after_days: AFTER_DAYS,
  template_id: anId("Which message?"),
  params: PARAMS.optional(),
  only_if: ONLY_IF.optional(),
  name: STEP_NAME.optional(),
});

/**
 * POST sequences: a new sequence made whole (S4, New), kept as a draft or started (`start`). Its first step is a
 * campaign's own body (`first`, as POST playbooks takes one, judged by the same check); the steps after it follow.
 */
export const NEW_SEQUENCE_BODY = z.strictObject({
  first: z.record(z.string(), z.unknown()),
  then: z.array(THEN_STEP).max(SEQUENCE_DRAFT_THEN_MAX, `At most ${SEQUENCE_DRAFT_THEN_MAX} steps after the first.`),
  start: z.boolean(),
});
export type NewSequenceBody = z.infer<typeof NEW_SEQUENCE_BODY>;

/**
 * POST sequences/draft: the owner's line, and the draft it rewrites when they say it again (`previous`, its name and
 * how many steps it had: what the model is told of it).
 */
export const DRAFT_BODY = z.strictObject({
  words: z
    .string()
    .trim()
    .min(8, "Say what it should do — one line is enough.")
    .max(SEQUENCE_DRAFT_WORDS_MAX, `At most ${SEQUENCE_DRAFT_WORDS_MAX} characters.`),
  previous: z
    .strictObject({
      name: z.string().max(80),
      steps: z
        .number()
        .int()
        .min(1)
        .max(SEQUENCE_DRAFT_THEN_MAX + 1),
    })
    .optional(),
});
