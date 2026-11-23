/**
 * How often a business posts, as its owner set it (the content loop PRD's 5.3, `content_cadence` on the workspace's
 * config, and 21.1's Settings › Content): per place, a range per kind of post a week; the days nothing goes up; the
 * languages its posts are written in. A limit and a preference, never a quota: the plan makes fewer where the week's
 * candidates are weak, and says so.
 *
 * A section of its own on the config (`content`), read leniently: a stored value that is not the shape reads as the
 * default, never as a config that cannot be parsed, which would leave the receptionist silent (config-schema.ts).
 */
import { z } from "zod";

/** The most of one kind a week the cadence may ask for: a week is one list, and the owner approves it in one press. */
const CADENCE_MOST = 7;

/** A range a week, low to high, each from 0 to CADENCE_MOST. */
const RangeSchema = z
  .tuple([z.number().int().min(0).max(CADENCE_MOST), z.number().int().min(0).max(CADENCE_MOST)])
  .refine(([low, high]) => low <= high);

/** Each place's ranges, by the kind of post (contracts POST_KINDS). Google takes a picture alone. */
const CadenceSchema = z
  .object({
    instagram: z
      .object({ reel: RangeSchema.optional(), picture: RangeSchema.optional(), story: RangeSchema.optional() })
      .strip()
      .optional(),
    google: z.object({ picture: RangeSchema.optional() }).strip().optional(),
  })
  .strip();
export type ContentCadence = z.infer<typeof CadenceSchema>;

/** An owner's sentence for a line, as they said it. */
const LineWords = z.string().trim().min(1).max(280).optional();

/** The weekdays as the config keeps them (contracts WEEKDAY_KEYS). */
const QuietDaySchema = z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);

export const ContentConfigSchema = z
  .object({
    cadence: CadenceSchema.optional().catch(undefined),
    quiet_days: z.array(QuietDaySchema).max(6).optional().catch(undefined),
    /** BCP 47 tags, the first the main one ("en", "es"). */
    languages: z.array(z.string().min(2).max(12)).min(1).max(3).optional().catch(undefined),
    /**
     * The owner's own sentence for a line of Settings › Content, kept as they said it, and shown in its place from then
     * on: what posts are for, how often, quiet days, languages (the PRD's 21.1: a line edited directly, never a list).
     */
    lines: z
      .object({
        goals: LineWords,
        cadence: LineWords,
        quiet_days: LineWords,
        languages: LineWords,
      })
      .strip()
      .optional()
      .catch(undefined),
  })
  .strip();
export type ContentConfig = z.infer<typeof ContentConfigSchema>;
