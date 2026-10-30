import "server-only";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  FOLLOW_UP_CONDITIONS,
  REACH_OUT_NAME_MAX,
  ReachOutChainSchema,
  ReachOutStepSchema,
  SEQUENCE_DRAFT_THEN_MAX,
  UUID,
  VOICE_PASTE_MAX,
  VOICE_PASTE_MIN,
  VOICE_WORDS,
  NEW_AUDIENCES,
  NEW_KINDS,
  NEW_WORDS_MAX,
  REACH_OUT_BODY_MAX,
  REACH_OUT_STEPS_MAX,
  REACH_OUT_SUBJECT_MAX,
  isListToken,
  HAND_KINDS,
  HAND_WORDS_MAX,
  NEW_STEP_DOES,
  PARAM_SOURCES,
  SEQUENCE_FLOW_WORDS,
  SEQUENCE_MODES,
} from "@chanlytics/contracts";

/**
 * What the routes under sequences take (decision 0060), declared on each route so docs/api.md says it: the shape
 * alone. What a value means (a message's slots, a step of this sequence) is the doors' to judge (doors.ts).
 */

/** The wait before a customer's step after the first, in days: the steps' own bounds (00441 sequence_steps_shape). */
const AFTER_DAYS = z.number().int().min(1, "Wait at least a day.").max(90, "Wait at most 90 days.");
const ONLY_IF = z.array(z.enum(FOLLOW_UP_CONDITIONS)).max(FOLLOW_UP_CONDITIONS.length);
const CHANNELS = z.array(z.enum(CONSENT_CHANNELS)).min(1, "Name a channel.").max(CONSENT_CHANNELS.length);
const STEP_NAME = z.string().trim().min(1).max(120);
/** A message's values: typed words, or a value a run fills ("@first_name", or a spec); judged against the message. */
const PARAMS = z.array(z.unknown()).max(20);
/** An id, as every route reads one (contracts UUID). */
const anId = (words: string) => z.string().regex(UUID, words);
/**
 * What Ask drafted for a sequence to leads (contracts AsDrafted, decision 0078 step 2): the owner's line and each step's
 * email as Ask wrote it, null for a call or a note, each within what a step takes. Kept with the make's decision.
 */
const AS_DRAFTED = z.strictObject({
  asked: z.string().max(NEW_WORDS_MAX),
  steps: z
    .array(
      z
        .strictObject({
          subject: z
            .string()
            .max(REACH_OUT_SUBJECT_MAX * 2)
            .nullable(),
          body: z.string().max(REACH_OUT_BODY_MAX * 2),
        })
        .nullable(),
    )
    .max(REACH_OUT_STEPS_MAX),
});

/** A call or a note for the team in place of a message (decision 0065): what to do when the person comes up. */
const HAND = z
  .strictObject({
    kind: z.enum(HAND_KINDS),
    words: z.string().trim().min(1, "Say what to do when they come up.").max(HAND_WORDS_MAX),
  })
  .describe(`A call or a note for the team: { kind: call | note, words } (1 to ${HAND_WORDS_MAX} characters)`);

/**
 * POST sequences/:id/steps: a step after the last, its wait and its message with its values and channels, or a call or a
 * note for the team (`hand`, decision 0065 step 6: the last step, judged by the door), which takes neither; what must
 * still hold.
 */
export const NEW_STEP_BODY = z
  .strictObject({
    after_days: AFTER_DAYS,
    template_id: anId("Which message?").optional(),
    hand: HAND.optional(),
    params: PARAMS.optional(),
    only_if: ONLY_IF.optional(),
    channels: CHANNELS.optional(),
    name: STEP_NAME.optional(),
  })
  .refine((b) => !b.template_id !== !b.hand, SEQUENCE_FLOW_WORDS.sayWhatStepDoes)
  .refine((b) => !b.hand || (b.params === undefined && b.channels === undefined), SEQUENCE_FLOW_WORDS.valuesOnHand);
export type NewStepBody = z.infer<typeof NEW_STEP_BODY>;

/** PUT sequences/:id/steps/:step: any of its wait, what must still hold, its channels, name and values; a call's words. */
export const STEP_CHANGE_BODY = z
  .strictObject({
    after_days: AFTER_DAYS.optional(),
    only_if: ONLY_IF.optional(),
    channels: CHANNELS.optional(),
    name: STEP_NAME.optional(),
    params: PARAMS.optional(),
    hand: HAND.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Say what changes.");
export type StepChangeBody = z.infer<typeof STEP_CHANGE_BODY>;

/** POST sequences/:id/steps/:step/test: a lead's step is filled for one lead in it (none: an example business). */
export const STEP_TEST_BODY = z.strictObject({ lead_id: anId("Which lead?").optional() });

/** POST sequences/:id/steps/:step/words: the message the step sends from now, with the values it takes. */
export const STEP_WORDS_BODY = z.strictObject({ template_id: anId("Which message?"), params: PARAMS.optional() });
export type StepWordsBody = z.infer<typeof STEP_WORDS_BODY>;

/**
 * POST sequences/:id/leave: the people taken out, by their places in it, and leads on its list that nothing has been
 * planned for yet, by their ids (00455): at least one of the two.
 */
export const LEAVE_BODY = z
  .strictObject({
    enrollment_ids: z.array(anId("Who leaves?")).max(500, "At most 500 at once.").default([]),
    lead_ids: z.array(anId("Which lead?")).max(500, "At most 500 at once.").default([]),
  })
  .refine((b) => b.enrollment_ids.length + b.lead_ids.length > 0, { message: "Who leaves?" });
export type LeaveBody = z.infer<typeof LEAVE_BODY>;

/**
 * A step after the first, as a new sequence names it: its wait, what must still hold, and its message with its values,
 * or a call or a note for the team (`hand`, the last step only, judged by the door).
 */
const THEN_STEP = z
  .strictObject({
    after_days: AFTER_DAYS,
    template_id: anId("Which message?").optional(),
    hand: HAND.optional(),
    params: PARAMS.optional(),
    only_if: ONLY_IF.optional(),
    name: STEP_NAME.optional(),
  })
  .refine((t) => !t.template_id !== !t.hand, "A step sends a message, or hands them over.");

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
 * A sequence to leads, as POST sequences takes one (00459, `first.starts` 'leads'): its name, and how it starts: a copy of
 * another (`from`), the words Ask drafted (`steps`), or one email still to write; on a list there is (`list_id`), else on
 * one named for it holding the leads chosen (`lead_ids`); drawing from a search where one is named (`source_search_id`,
 * auto-add); and the search a pile works through, whose pick it becomes (`aim_search_id`). As New makes one (00465): the
 * search whose ready leads go on its list (`search_id`), how its batches are decided (`mode`; the door holds a sequence
 * to leads off auto), and whether the owner sends each email from their own inbox (`owner_sends`). Where its words are
 * Ask's draft, what Ask drafted (`as_drafted`, decision 0078 step 2), kept with the make's decision and never in a step.
 */
export const LEAD_FIRST_BODY = z.strictObject({
  starts: z.literal("leads"),
  name: z.string().trim().min(1, "Name it.").max(REACH_OUT_NAME_MAX, `At most ${REACH_OUT_NAME_MAX} characters.`),
  from: anId("Which sequence?").optional(),
  list_id: anId("Which list?").optional(),
  search_id: anId("Which search?").optional(),
  source_search_id: anId("Which search?").optional(),
  aim_search_id: anId("Which search?").optional(),
  lead_ids: z.array(anId("Which lead?")).max(500, "At most 500 at once.").optional(),
  steps: z.array(ReachOutStepSchema).max(5, "At most five steps.").optional(),
  mode: z.enum(SEQUENCE_MODES).optional(),
  owner_sends: z.boolean().optional(),
  as_drafted: AS_DRAFTED.optional(),
});

/**
 * PUT sequences/:id/chain: a sequence to leads as its record writes it, the chain's own body less the list (the
 * sequence's own), with the search it adds new ready leads from, or none.
 */
export const LEAD_CHAIN_BODY = ReachOutChainSchema.omit({ search_id: true }).extend({
  source_search_id: anId("Which search?").nullable().optional(),
});

/** POST sequences/:id/move: the lead that moves here, out of the sequence it stands in. */
export const MOVE_BODY = z.strictObject({ lead_id: anId("Which lead?") });
export type MoveBody = z.infer<typeof MOVE_BODY>;

/** Who a draft is for, as a door or the owner chose it (contracts DraftWho); whether the workspace holds it is judged where it is made. */
const NEW_WHO = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("moment"),
    trigger: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    kind: z.literal("list"),
    token: z.string().refine(isListToken, "Which list?"),
    label: z.string().trim().min(1).max(120),
  }),
  z.strictObject({ kind: z.literal("everyone"), label: z.string().trim().min(1).max(120) }),
  z.strictObject({ kind: z.literal("search"), id: anId("Which search?"), label: z.string().trim().min(1).max(120) }),
  z.strictObject({
    kind: z.literal("leads"),
    ids: z.array(anId("Which lead?")).min(1).max(500, "At most 500 at once."),
    label: z.string().trim().min(1).max(120),
  }),
]);

/**
 * POST sequences/draft (decision 0065): the owner's line, and any choice already made (`kind`, `audience`, `who`: a door's,
 * or the owner's in the draft, which Ask keeps), and the draft it rewrites when they say it again (`previous`, its name and
 * how many steps it had: what the model is told of it).
 */
/** POST sequences/voice (decision 0078): one email the owner wrote, whole, for Ask to read how they write. */
export const VOICE_BODY = z.strictObject({
  text: z.string().trim().min(VOICE_PASTE_MIN, VOICE_WORDS.tooShort).max(VOICE_PASTE_MAX, VOICE_WORDS.tooLong),
});

export const DRAFT_BODY = z.strictObject({
  words: z
    .string()
    .trim()
    .min(8, "Say what it should do — one line is enough.")
    .max(NEW_WORDS_MAX, `At most ${NEW_WORDS_MAX} characters.`),
  kind: z.enum(NEW_KINDS).optional(),
  audience: z.enum(NEW_AUDIENCES).optional(),
  who: NEW_WHO.optional(),
  previous: z
    .strictObject({
      name: z.string().max(80),
      steps: z.number().int().min(1).max(8),
    })
    .optional(),
});

/** A message Ask wrote, as New holds it until it is filed (contracts NewWrittenMessage; write-message.ts judges it). */
const WRITTEN = z.strictObject({
  name: z.string().trim().min(1).max(60),
  category: z.enum(["marketing", "utility"]),
  versions: z.strictObject({
    whatsapp: z.strictObject({ body: z.string().max(1024) }).optional(),
    email: z.strictObject({ subject: z.string().max(200), body: z.string().max(4000) }).optional(),
    sms: z.strictObject({ body: z.string().max(600) }).optional(),
  }),
  slots: z
    .array(
      z.strictObject({
        position: z.number().int().min(1).max(10),
        label: z.string().trim().min(1).max(60),
        example: z.string().max(200),
        kind: z.enum(PARAM_SOURCES),
      }),
    )
    .max(10),
});

/** One step of New's draft as it is kept or started (contracts NewStep): a person's message, a lead's email, or a call or a note. */
const NEW_STEP = z.strictObject({
  name: z.string().trim().max(120),
  after_days: z.number().int().min(1).max(90).nullable(),
  only_if: ONLY_IF,
  does: z.enum(NEW_STEP_DOES),
  message: z
    .strictObject({
      template_id: anId("Which message?").nullable(),
      params: PARAMS,
      written: WRITTEN.nullable(),
    })
    .nullable(),
  email: z.strictObject({ subject: z.string().max(200).nullable(), body: z.string().max(4000) }).nullable(),
  hand: z.string().max(HAND_WORDS_MAX),
});

/**
 * POST sequences/new (decision 0065): New's draft, kept (`start` false) or started. A sequence or a one-off, to people or to
 * leads; who and when, the hour, the channels, the mode, and each step. A kept one-off names its draft when it is kept
 * again or sent (`draft_id`). Every part is judged again by the doors it is made through.
 */
export const NEW_MAKE_BODY = z.strictObject({
  kind: z.enum(NEW_KINDS),
  audience: z.enum(NEW_AUDIENCES),
  name: z.string().trim().min(1, "Name it.").max(80),
  who: NEW_WHO,
  run_hour: z.number().int().min(9).max(20),
  at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
  channels: z.array(z.enum(CONSENT_CHANNELS)).max(3),
  mode: z.enum(SEQUENCE_MODES).nullable(),
  adds_new: z.boolean(),
  owner_sends: z.boolean().optional(),
  draft_id: anId("Which draft?").optional(),
  /** A draft to leads from Ask: what Ask drafted, beside the steps as the owner left them (decision 0078 step 2). */
  as_drafted: AS_DRAFTED.optional(),
  steps: z.array(NEW_STEP).min(1, "Add a step.").max(6),
  start: z.boolean(),
});
export type NewMakeBody = z.infer<typeof NEW_MAKE_BODY>;
