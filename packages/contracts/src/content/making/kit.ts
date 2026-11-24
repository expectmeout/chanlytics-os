/**
 * The brand kit a made video wears (the content loop PRD's 5.3, 10.4 and 21.1's "The look"), worked out once: what the
 * owner said wins, part by part; what AI proposed from the website on day one stands in for what they did not say; the
 * house's own stands in for the rest. The colour and the mark are not here: the workspace keeps them (Details, the
 * website read), and a video reads them where it always has.
 *
 * The kit is kept on the workspace's config (`content.look`, as pass 3 keeps the cadence), and the website's proposal
 * with the website read (`business_reads.facts.kit`). Pure, so Settings › Content, the video's press and AI say one kit.
 */
import { z } from "zod";
import { BrandKitConfigSchema, KIT_LIMITS, type KitFace } from "../../config/content-config";
import { hexOfRgb, parseCssColour } from "../../look/colour";
import { nonBlankOrNull, recordOrNull } from "../../shared/unknown";

/** The kit, every part worked out. */
export interface BrandKit {
  /** The look in a sentence: the owner's own, else AI's from the website; null where neither said one. */
  words: string | null;
  second: string | null;
  face: KitFace;
  call: string | null;
  voice: string | null;
  music: string | null;
  never: string[];
}

/** What AI proposed from the website, as the read keeps it: the kit's parts and its sentence. */
const ProposedKitSchema = BrandKitConfigSchema.extend({
  words: z.string().trim().min(1).max(KIT_LIMITS.words).optional().catch(undefined),
});

/** What AI proposed for the look, each part where it said one. */
type ProposedKit = z.infer<typeof ProposedKitSchema>;

/** The house's own, where neither the owner nor the website said a part: the face every video was set in before the kit. */
const HOUSE_FACE: KitFace = "sans";

const readKit = (value: unknown) => {
  const read = ProposedKitSchema.safeParse(value ?? {});
  return read.success ? read.data : {};
};

/**
 * The kit: `own` is the config's `content.look`, `ownWords` the owner's sentence for the line (`content.lines.look`),
 * `proposed` the website read's `kit`. Each part is the owner's where they said it, else the proposal's.
 */
export function brandKitOf(own: unknown, ownWords: string | null | undefined, proposed: unknown): BrandKit {
  const mine = readKit(own);
  const theirs = readKit(proposed);
  return {
    words: ownWords?.trim() || theirs.words || null,
    second: mine.second ?? theirs.second ?? null,
    face: mine.face ?? theirs.face ?? HOUSE_FACE,
    call: mine.call ?? theirs.call ?? null,
    voice: mine.voice ?? theirs.voice ?? null,
    music: mine.music ?? theirs.music ?? null,
    never: mine.never ?? theirs.never ?? [],
  };
}

/** A type family's name that is a serif's: the families a business's site most often sets its headings in. */
const SERIF_FAMILY =
  /(^|[^a-z])(serif(?![- ]?sans)|georgia|times|garamond|playfair|lora|merriweather|baskerville|cormorant|crimson|didot|bodoni|caslon|spectral|fraunces|cardo|prata|abril)/i;

/** A css colour as the kit keeps it (#rrggbb), or null where it is not one. */
function kitColourOf(css: string | null | undefined): string | null {
  const rgb = css ? parseCssColour(css) : null;
  return rgb ? hexOfRgb(rgb) : null;
}

/**
 * What AI proposes for the look on day one (the content loop PRD's 10.4), from the website read that already runs: the
 * feel, the call and the music's mood the reading wrote from how the pages speak (`answer.look`), and the second colour
 * and the type the site's own branding uses (the reader's `brand`). Kept with the read as `kit`; null where it says nothing.
 */
export function siteKitOf(
  answer: unknown,
  brand: { second?: string | null; font?: string | null } | null,
): ProposedKit | null {
  const answered = recordOrNull(recordOrNull(answer)?.look);
  const kit = ProposedKitSchema.parse({
    words: nonBlankOrNull(answered?.words) ?? undefined,
    call: nonBlankOrNull(answered?.call) ?? undefined,
    music: nonBlankOrNull(answered?.music) ?? undefined,
    second: kitColourOf(brand?.second) ?? undefined,
    face: brand?.font ? (SERIF_FAMILY.test(brand.font) && !/sans/i.test(brand.font) ? "serif" : "sans") : undefined,
  });
  // A part it did not say is left out of the JSON: nothing said is no proposal.
  return JSON.stringify(kit) === "{}" ? null : kit;
}

/** The face a kit's sentence names, said: what Settings › Content says when no sentence was said or proposed. */
const FACE_SAID: Record<KitFace, string> = { sans: "set in a clean, bold type", serif: "set in a classic serif" };

/**
 * "The look" as its line says it: the owner's sentence or AI's, else one made of what is set. The colour and the mark are
 * named as the workspace keeps them.
 */
export function lookSaidOf(kit: BrandKit, has: { logo: boolean; accent: boolean }): string {
  if (kit.words) return kit.words;
  const parts = [
    has.logo ? "your logo on the last frame" : null,
    has.accent ? "your colour" : null,
    FACE_SAID[kit.face],
  ].filter((p): p is string => p !== null);
  const sentence = parts.join(", ");
  return `${sentence[0]?.toUpperCase() ?? ""}${sentence.slice(1)}.`;
}

/**
 * The first word AI wrote that the kit says it never writes, or null: matched whole, ignoring case, so "cheap" holds
 * "Cheap cuts" and not "cheaper". Only AI's words are held to it; an owner's own are theirs (the PRD's 6.1).
 */
export function neverSaidIn(text: string, kit: Pick<BrandKit, "never">): string | null {
  const plain = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}'’]+/gu, " ")} `;
  return (
    kit.never.find((word) => {
      const needle = word
        .toLowerCase()
        .replace(/[^\p{L}\p{N}'’]+/gu, " ")
        .trim();
      return needle !== "" && plain.includes(` ${needle} `);
    }) ?? null
  );
}
