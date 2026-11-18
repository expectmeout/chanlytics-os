/**
 * What a watched folder's row says when it stopped being read, in the owner's words (media_sources.last_error): what is
 * happening, whether it mends itself, and the one thing to do. Never a provider's text or a code. The screens that
 * draw a folder's row (the plan's P5) read these as they stand, and the day they get their own words these move there.
 */
import { SOURCE_PACE } from "./pace.js";

export const SOURCE_WORDS = {
  /** Its account's grant was refused (revoked, or the password changed). */
  signedOut: "Google signed this account out, so the folder isn't being read. Connect the account again to carry on.",
  /** Whoever connected the account is no longer one of the workspace's members (the plan's D13). */
  connectorLeft:
    "The person who connected this folder has left the workspace, so it is paused. What came in stays. Connect your own Google account to watch it again.",
  /** The folder itself cannot be read: deleted, or no longer shared with the account. */
  unreadable:
    "This folder can't be opened with the connected account. Nothing was removed. Check the folder still exists and is shared with that account; it is tried again by itself.",
  /** The folder holds more than is listed. */
  full: `This folder holds more than ${SOURCE_PACE.itemsMax.toLocaleString("en-US")} files, so the rest isn't listed.`,
} as const;
