/**
 * A workspace's own logo (00407; Claude Video docs/2026-10-11-workspace-logo-plan.md): the picture the sidebar's
 * workspace circle, the collapsed rail and the switcher menu draw over the workspace's initials.
 *
 * One shape is ever kept: a square PNG the browser made (layout.ts says how) and the server remade from its pixels
 * (dashboard server/workspace/logo/png.ts), between LOGO_SIDE_MIN and LOGO_SIDE on a side and LOGO_BYTES_MAX at most, in
 * the public workspace-logos bucket at `<tenant id>/<uuid>.png`. Never an SVG, in or out: a picture traced into vectors
 * loses what a photograph and small type are made of, and an SVG served from our own origin can carry script. Every
 * number here is said once, for the page that makes the picture and the server that judges it.
 */
import { publicObjectSrc } from "../shared/link";

/** 00407's public bucket. */
export const WORKSPACE_LOGOS_BUCKET = "workspace-logos";

/** The side of the square the browser makes: a 32px circle at three times the screen's density is 96, so this is room. */
export const LOGO_SIDE = 256;
/** The smallest square the server keeps: the browser makes a smaller one only to come in under LOGO_BYTES_MAX. */
export const LOGO_SIDE_MIN = 128;
/** The most a kept picture weighs, and the bucket's own limit (00407). */
export const LOGO_BYTES_MAX = 262_144;
/** LOGO_BYTES_MAX as base64, which is how the picture travels in the save's JSON body. */
export const LOGO_BASE64_MAX = Math.ceil(LOGO_BYTES_MAX / 3) * 4;

/** What a member may choose from their device, read before a byte of it is decoded. */
export const LOGO_CHOSEN_MAX_BYTES = 10 * 1024 * 1024;
/** The kinds of file the picker offers. A browser decodes all four; an SVG is not offered. */
export const LOGO_CHOSEN_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** A logo found on the business's website: what the server will fetch and hand the page to make the picture from. */
export const LOGO_FOUND_MAX_BYTES = 524_288;
/** Its shorter side at least this: a favicon blown up to the circle is mush, and the owner can choose a picture instead. */
export const LOGO_FOUND_SIDE_MIN = 96;
/** Its longer side at most this: a page that declares a poster as its logo has not given us a logo. */
export const LOGO_FOUND_SIDE_MAX = 2048;

const RANDOM_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** The only addresses 00407's CHECK lets the column hold: the workspace's own folder, one random name, a PNG. */
const WORKSPACE_LOGO_PATH = new RegExp(`^${RANDOM_ID}/${RANDOM_ID}\\.png$`);

/** Where a new picture of this workspace is stored: its own folder, under a name no earlier picture had. */
export const workspaceLogoPath = (tenantId: string, fileId: string): string => `${tenantId}/${fileId}.png`;

/** Whether an address is one of this workspace's pictures: the shape, and the workspace's own folder. */
export function isLogoPathOf(tenantId: string, path: string | null | undefined): path is string {
  return !!path && WORKSPACE_LOGO_PATH.test(path) && path.startsWith(`${tenantId}/`);
}

/** Where the workspace's logo is served, or null for none, for anything that is not an address we wrote. */
export function workspaceLogoSrc(
  supabaseUrl: string | null | undefined,
  path: string | null | undefined,
): string | null {
  if (!path || !WORKSPACE_LOGO_PATH.test(path)) return null;
  return publicObjectSrc(supabaseUrl, WORKSPACE_LOGOS_BUCKET, path);
}

/**
 * A workspace's initials, for its circle where it has no logo: the first letters of its first two words. A word is a
 * run of letters and digits, an apostrophe inside it kept ("Rosa's" is one word), so "Nails & Co" is NC and not N&;
 * a leading "The" names no one ("The Hair Studio" is HS). A dash where there is nothing to draw.
 */
export function workspaceInitials(name: string | null | undefined): string {
  const words = String(name ?? "")
    .split(/[^\p{L}\p{N}'’]+/u)
    .map((w) => w.replace(/^['’]+|['’]+$/g, ""))
    .filter(Boolean);
  const named = words.length > 1 && /^the$/i.test(words[0] ?? "") ? words.slice(1) : words;
  return ((named[0]?.[0] ?? "") + (named[1]?.[0] ?? "")).toUpperCase() || "—";
}

/** How a look on the business's website ended: the outcome the lookup answers and logs, never the file. */
export const LOGO_LOOKUP_OUTCOMES = ["found", "none", "unreachable", "not_its_own", "no_website"] as const;
export type LogoLookupOutcome = (typeof LOGO_LOOKUP_OUTCOMES)[number];

/** What the lookup answers: the picture's bytes and where it was found, or why there is none. */
export type LogoLookupAnswer =
  | { outcome: "found"; host: string; image: { base64: string; content_type: string } }
  | { outcome: Exclude<LogoLookupOutcome, "found">; host: string | null };

/**
 * The edge's answer to a look (its door POST /api/admin/imports/logo-lookup) as the dashboard hands it on, or null for
 * any answer that is not one: an outcome of the closed set, its host, and the picture where one was found.
 */
export function logoLookupAnswerOf(body: unknown): LogoLookupAnswer | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { outcome?: unknown; host?: unknown; image?: { base64?: unknown; content_type?: unknown } };
  const outcome = LOGO_LOOKUP_OUTCOMES.find((o) => o === b.outcome);
  const host = typeof b.host === "string" && b.host ? b.host : null;
  if (!outcome) return null;
  if (outcome !== "found") return { outcome, host };
  const base64 = b.image?.base64;
  const contentType = b.image?.content_type;
  if (!host || typeof base64 !== "string" || !base64 || typeof contentType !== "string" || !contentType) return null;
  return { outcome, host, image: { base64, content_type: contentType } };
}

/** Every word the Logo row says. No file kind and no pixel count reaches an owner. */
export const LOGO_WORDS = {
  label: "Logo",
  add: "Add",
  change: "Change",
  menuLabel: "Your logo",
  choose: "Choose a picture",
  fromWebsite: "Use the one on your website",
  remove: "Remove",
  save: "Save",
  cancel: "Cancel",
  useIt: "Use it",
  notThis: "Not this one",
  looking: "Looking on your website…",
  saving: "Saving…",
  saved: "Saved",
  removed: "Removed",
  notSaved: "Not saved — it didn't go through. Try again.",
  lookFailed: "We couldn't look on your website just now. Try again, or choose a picture.",
  unusable: "We couldn't use that picture. Try another.",
  wide: "This one is wide, so it will look small in the circle. A square version fits best.",
  small: "This picture is small, so it may look soft.",
} as const;

/** What the row says when a look on the website found nothing to offer, by why; null when it found one. */
export function logoLookupWords(outcome: LogoLookupOutcome): string | null {
  switch (outcome) {
    case "found":
      return null;
    case "none":
      return "We couldn't find a logo on your website. Choose a picture instead.";
    case "unreachable":
      return "We couldn't reach your website just now. Try again, or choose a picture.";
    case "not_its_own":
      return "Your website is a page on another service, so its logo would be theirs. Choose a picture instead.";
    case "no_website":
      return "Add your website first, or choose a picture.";
  }
}

/** What the row says under a found picture: the website's host, which the owner gave us, never the image's. */
export const logoFoundOn = (host: string): string => `Found on ${host}`;
