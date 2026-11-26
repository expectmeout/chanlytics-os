/**
 * What each place takes, and a rendition checked against it (the content loop PRD's 11: "each checked: size, length, codec,
 * orientation, safe areas, loudness"). A made file's bytes are measured where they are already in hand (the job that keeps
 * a video, the approval that sums each shape: channels files/media-measure.ts), and each placement asks its own place's
 * rule. A refusal says, in the owner's words, what the place takes and what this one is.
 *
 * The numbers are the places' own pages (read 23 Nov 2026): Meta's IG User Media reference (image, story and reel
 * specifications), Meta's Pages guide for a Page's photos and reels (as pass 5 read it: v27.0), and Google's Business
 * Profile photo guidelines. A limit a page does not state is not held. A rule a place states and a real account has shown it
 * does not hold to is left out (the first sitting, 21 Nov: Meta took a reel with an edit list and no sound track).
 * Loudness is the house's own (a video with sound is levelled to about -14 LUFS, where the phone apps play it), read only
 * where the machine measured it: a missing number is never a refusal.
 */
import { POST_KIND_SAID, POST_PLACE_SAID, type PostKind, type PostPlace } from "../posts";

/** A file's bytes as measured: what it is, how large, how long, and its sound. Null where the file does not say. */
export interface MediaMeasured {
  media: "video" | "picture";
  format: "mp4" | "mov" | "jpeg" | "png" | "webp" | "other";
  bytes: number;
  width: number | null;
  height: number | null;
  seconds: number | null;
  fps: number | null;
  codec: "h264" | "hevc" | "other" | null;
  sound: { codec: "aac" | "other"; rate: number | null; channels: number | null } | null;
  /** Integrated loudness, where the machine measured it (a video with sound); null otherwise. */
  lufs: number | null;
}

/** What one place takes for one kind of post, in one medium. */
export interface RenditionRule {
  formats: readonly MediaMeasured["format"][];
  codecs?: readonly NonNullable<MediaMeasured["codec"]>[];
  seconds?: readonly [number, number];
  bytesLeast?: number;
  bytesMost?: number;
  /** The shorter side's least, in pixels. */
  sideLeast?: number;
  /** Width over height, least and most. */
  ratio?: readonly [number, number];
  fps?: readonly [number, number];
  /** A sound track, where there is one: its codec, the highest rate and the most channels. */
  sound?: { codecs: readonly "aac"[]; rateMost: number; channelsMost: number };
}

const MB = 1024 * 1024;
const META_SOUND = { codecs: ["aac"], rateMost: 48_000, channelsMost: 2 } as const;
const META_VIDEO = { formats: ["mp4", "mov"], codecs: ["h264", "hevc"], fps: [23, 60], sound: META_SOUND } as const;
const META_JPEG = { formats: ["jpeg"], bytesMost: 8 * MB } as const;

/** Each place's rule by kind and medium. A kind a place does not take in a medium has none (the publishing check says so). */
const RENDITION_RULES: Readonly<
  Record<PostPlace, Partial<Record<PostKind, Partial<Record<MediaMeasured["media"], RenditionRule>>>>>
> = {
  instagram: {
    picture: { picture: { ...META_JPEG, sideLeast: 320, ratio: [0.8, 1.91] } },
    story: {
      picture: META_JPEG,
      video: { ...META_VIDEO, seconds: [3, 60], bytesMost: 100 * MB },
    },
    reel: { video: { ...META_VIDEO, seconds: [3, 900], bytesMost: 300 * MB } },
  },
  google: {
    picture: { picture: { formats: ["jpeg", "png"], bytesLeast: 10 * 1024, bytesMost: 5 * MB, sideLeast: 250 } },
  },
  // A Page's photo (a post, or a story made of one) and its reel: 9:16, 540x960 at least, 3 to 90 seconds, 24 to 60 frames
  // a second. Its page states no size for a reel, and no story of a video is posted to a Page here.
  facebook: {
    picture: { picture: { formats: ["jpeg", "png"], bytesMost: 10 * MB } },
    story: { picture: { formats: ["jpeg", "png"], bytesMost: 10 * MB } },
    reel: {
      video: {
        formats: ["mp4", "mov"],
        codecs: ["h264", "hevc"],
        seconds: [3, 90],
        fps: [24, 60],
        sideLeast: 540,
        ratio: [0.56, 0.57],
        sound: META_SOUND,
      },
    },
  },
};

/** The loudness a video with sound is levelled to, and what is near enough. */
export const HOUSE_LOUDNESS = { target: -14, least: -16, most: -12 } as const;

/** Why a rendition does not fit its place. */
export type RenditionWhy =
  "medium" | "format" | "codec" | "length" | "size" | "small" | "shape" | "frame_rate" | "sound" | "loudness";

export interface RenditionRefusal {
  why: RenditionWhy;
  /** What the place takes and what this one is, in the owner's words. */
  words: string;
}

/** "2 seconds", "1 minute 30 seconds", "15 minutes". */
function lengthSaid(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const part = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (minutes === 0) return part(rest, "second");
  return rest === 0 ? part(minutes, "minute") : `${part(minutes, "minute")} ${part(rest, "second")}`;
}

const sizeSaid = (bytes: number): string =>
  bytes >= MB ? `${Math.round((bytes / MB) * 10) / 10} MB` : `${Math.round(bytes / 1024)} KB`;

const outside = (value: number | null, range: readonly [number, number] | undefined): boolean =>
  value !== null && range !== undefined && (value < range[0] || value > range[1]);

/** The video's own checks: its codec, its length, its frame rate, its sound. */
function videoRefusalOf(measured: MediaMeasured, rule: RenditionRule, placeKind: string): RenditionRefusal | null {
  if (rule.codecs && measured.codec !== null && !rule.codecs.some((c) => c === measured.codec))
    return { why: "codec", words: `${placeKind} takes video made as H.264 or HEVC.` };
  if (outside(measured.seconds, rule.seconds) && rule.seconds && measured.seconds !== null)
    return {
      why: "length",
      words: `${placeKind} takes ${lengthSaid(rule.seconds[0])} to ${lengthSaid(rule.seconds[1])}. This one is ${lengthSaid(measured.seconds)}.`,
    };
  if (outside(measured.fps, rule.fps) && rule.fps)
    return { why: "frame_rate", words: `${placeKind} takes ${rule.fps[0]} to ${rule.fps[1]} frames a second.` };
  const sound = measured.sound;
  if (sound && rule.sound) {
    const fits =
      rule.sound.codecs.some((c) => c === sound.codec) &&
      (sound.rate === null || sound.rate <= rule.sound.rateMost) &&
      (sound.channels === null || sound.channels <= rule.sound.channelsMost);
    if (!fits) return { why: "sound", words: `${placeKind} can't take this video's sound.` };
  }
  if (sound && measured.lufs !== null && (measured.lufs < HOUSE_LOUDNESS.least || measured.lufs > HOUSE_LOUDNESS.most))
    return { why: "loudness", words: "This video's sound is too quiet or too loud. Make it again." };
  return null;
}

/**
 * Whether a placement's rendition fits its place: null where it does, else the first thing that does not, in the owner's
 * words. The bytes' own size and shape first, then what a video holds.
 */
export function renditionRefusalOf(place: PostPlace, kind: PostKind, measured: MediaMeasured): RenditionRefusal | null {
  const placeKind = `${POST_PLACE_SAID[place]}'s ${POST_KIND_SAID[kind]}`;
  const rule = RENDITION_RULES[place][kind]?.[measured.media];
  if (!rule)
    return {
      why: "medium",
      words: `${POST_PLACE_SAID[place]} can't take a ${measured.media} as a ${POST_KIND_SAID[kind]}.`,
    };
  if (!rule.formats.includes(measured.format))
    return { why: "format", words: `${placeKind} takes ${rule.formats.map((f) => f.toUpperCase()).join(" or ")}.` };
  if (rule.bytesMost !== undefined && measured.bytes > rule.bytesMost)
    return {
      why: "size",
      words: `${placeKind} takes up to ${sizeSaid(rule.bytesMost)}. This one is ${sizeSaid(measured.bytes)}.`,
    };
  if (rule.bytesLeast !== undefined && measured.bytes < rule.bytesLeast)
    return {
      why: "size",
      words: `${placeKind} takes ${sizeSaid(rule.bytesLeast)} or more. This one is ${sizeSaid(measured.bytes)}.`,
    };
  const shortSide =
    measured.width !== null && measured.height !== null ? Math.min(measured.width, measured.height) : null;
  if (rule.sideLeast !== undefined && shortSide !== null && shortSide < rule.sideLeast)
    return { why: "small", words: `${placeKind} takes a picture at least ${rule.sideLeast} pixels on each side.` };
  const ratio = measured.width !== null && measured.height ? measured.width / measured.height : null;
  if (outside(ratio, rule.ratio))
    return {
      why: "shape",
      words:
        measured.media === "video"
          ? `${placeKind} takes a standing video (9:16).`
          : `${placeKind} takes a picture from portrait (4:5) to wide (1.91:1).`,
    };
  return measured.media === "video" ? videoRefusalOf(measured, rule, placeKind) : null;
}
