import { publicObjectSrc } from "../shared/link.js";
export const WORKSPACE_LOGOS_BUCKET = "workspace-logos";
export const LOGO_SIDE = 256;
export const LOGO_SIDE_MIN = 128;
export const LOGO_BYTES_MAX = 262144;
export const LOGO_BASE64_MAX = Math.ceil(LOGO_BYTES_MAX / 3) * 4;
export const LOGO_CHOSEN_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_CHOSEN_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const LOGO_FOUND_MAX_BYTES = 524288;
export const LOGO_FOUND_SIDE_MIN = 96;
export const LOGO_FOUND_SIDE_MAX = 2048;
const RANDOM_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const WORKSPACE_LOGO_PATH = new RegExp(`^${RANDOM_ID}/${RANDOM_ID}\\.png$`);
export const workspaceLogoPath = (tenantId, fileId) => `${tenantId}/${fileId}.png`;
export function isLogoPathOf(tenantId, path) {
  return !!path && WORKSPACE_LOGO_PATH.test(path) && path.startsWith(`${tenantId}/`);
}
export function workspaceLogoSrc(supabaseUrl, path) {
  if (!path || !WORKSPACE_LOGO_PATH.test(path)) return null;
  return publicObjectSrc(supabaseUrl, WORKSPACE_LOGOS_BUCKET, path);
}
export function workspaceInitials(name) {
  const words = String(name ?? "").split(/[^\p{L}\p{N}'’]+/u).map((w) => w.replace(/^['’]+|['’]+$/g, "")).filter(Boolean);
  const named = words.length > 1 && /^the$/i.test(words[0] ?? "") ? words.slice(1) : words;
  return ((named[0]?.[0] ?? "") + (named[1]?.[0] ?? "")).toUpperCase() || "\u2014";
}
export const LOGO_LOOKUP_OUTCOMES = ["found", "none", "unreachable", "not_its_own", "no_website"];
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
  looking: "Looking on your website\u2026",
  saving: "Saving\u2026",
  saved: "Saved",
  removed: "Removed",
  notSaved: "Not saved \u2014 it didn't go through. Try again.",
  unusable: "We couldn't use that picture. Try another.",
  wide: "This one is wide, so it will look small in the circle. A square version fits best.",
  small: "This picture is small, so it may look soft."
};
export function logoLookupWords(outcome) {
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
export const logoFoundOn = (host) => `Found on ${host}`;
