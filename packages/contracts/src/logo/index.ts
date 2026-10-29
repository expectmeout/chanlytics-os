/** A workspace's own logo (00407): where it is kept, what is kept, the words, and how a picture becomes it. */
export { LOGO_PAD, LOGO_PLATE_DARK, LOGO_PLATE_LIGHT, logoDrawRect, logoLayout } from "./layout";
export type { LogoLayout, LogoMode, LogoNote, LogoPixels } from "./layout";
export {
  isLogoPathOf,
  LOGO_BASE64_MAX,
  LOGO_BYTES_MAX,
  LOGO_CHOSEN_MAX_BYTES,
  LOGO_CHOSEN_TYPES,
  LOGO_FOUND_MAX_BYTES,
  LOGO_FOUND_SIDE_MAX,
  LOGO_FOUND_SIDE_MIN,
  LOGO_LOOKUP_OUTCOMES,
  LOGO_SIDE,
  LOGO_SIDE_MIN,
  LOGO_WORDS,
  logoFoundOn,
  logoLookupWords,
  WORKSPACE_LOGOS_BUCKET,
  workspaceInitials,
  workspaceLogoPath,
  workspaceLogoSrc,
} from "./logo";
export type { LogoLookupAnswer, LogoLookupOutcome } from "./logo";
