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

/**
 * The faces a made video may be set in: the two the house already ships and licenses (the posts' own files, OFL): Mona Sans
 * and Source Serif 4. A short list the database holds, never rows a screen offers: the owner says the look, AI reads it.
 */
export const KIT_FACES = ["sans", "serif"] as const;
export type KitFace = (typeof KIT_FACES)[number];

/** How much each part of the kit may say. */
export const KIT_LIMITS = { words: 280, call: 40, voice: 120, music: 120, never: 12, neverWord: 40 } as const;

/** A colour as the kit keeps it: six hex digits, lower case. */
const KitColour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((c) => c.toLowerCase());

/**
 * The brand kit (the content loop PRD's 5.3 and 10.4; 21.1's "The look"): what a made video wears beyond the colour and the
 * mark the workspace already keeps (`tenants.accent`, `tenants.logo_path`: Details and the website read set them). Each
 * part is read alone, so one that does not read is left out and the rest still stand.
 */
export const BrandKitConfigSchema = z
  .object({
    /** A second colour: a card's ground, a caption's backing. */
    second: KitColour.optional().catch(undefined),
    face: z.enum(KIT_FACES).optional().catch(undefined),
    /** The end card's own call, under the business's name ("Book on our website"). */
    call: z.string().trim().min(1).max(KIT_LIMITS.call).optional().catch(undefined),
    /** How a voice over should sound, and the music's mood: kept for the sound engine, read by nothing until it lands. */
    voice: z.string().trim().min(1).max(KIT_LIMITS.voice).optional().catch(undefined),
    music: z.string().trim().min(1).max(KIT_LIMITS.music).optional().catch(undefined),
    /** Words AI never writes for this business. The owner's own words are never held to them. */
    never: z
      .array(z.string().trim().min(1).max(KIT_LIMITS.neverWord))
      .max(KIT_LIMITS.never)
      .optional()
      .catch(undefined),
  })
  .strip();
export type BrandKitConfig = z.infer<typeof BrandKitConfigSchema>;

export const ContentConfigSchema = z
  .object({
    cadence: CadenceSchema.optional().catch(undefined),
    quiet_days: z.array(QuietDaySchema).max(6).optional().catch(undefined),
    /** BCP 47 tags, the first the main one ("en", "es"). */
    languages: z.array(z.string().min(2).max(12)).min(1).max(3).optional().catch(undefined),
    /** The brand kit as the owner's sentence was read (Settings › Content's "The look"). */
    look: BrandKitConfigSchema.optional().catch(undefined),
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
        look: LineWords,
      })
      .strip()
      .optional()
      .catch(undefined),
  })
  .strip();
export type ContentConfig = z.infer<typeof ContentConfigSchema>;
