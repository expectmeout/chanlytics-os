/** A workspace's own logo (00407): where it is kept, what is kept, the words, and how a picture becomes it. */
export {
  WORKSPACE_LOGOS_BUCKET,
  LOGO_SIDE,
  LOGO_SIDE_MIN,
  LOGO_BYTES_MAX,
  LOGO_BASE64_MAX,
  LOGO_CHOSEN_MAX_BYTES,
  LOGO_CHOSEN_TYPES,
  LOGO_FOUND_MAX_BYTES,
  LOGO_FOUND_SIDE_MIN,
  LOGO_FOUND_SIDE_MAX,
  workspaceLogoPath,
  isLogoPathOf,
  workspaceLogoSrc,
  LOGO_LOOKUP_OUTCOMES,
  LOGO_WORDS,
  logoLookupWords,
  logoFoundOn,
  workspaceInitials,
} from "./logo";
export type { LogoLookupOutcome, LogoLookupAnswer } from "./logo";
export { LOGO_PAD, LOGO_PLATE_LIGHT, LOGO_PLATE_DARK, logoLayout, logoDrawRect } from "./layout";
export type { LogoPixels, LogoMode, LogoNote, LogoLayout } from "./layout";
