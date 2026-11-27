/**
 * The parts the bridge installs (bridge/provided.ts) as the frame reads them, each read here alone.
 */
import { provided } from "@/bridge/provided";

/** The shell's words (bridge/shell.ts, provided as `chrome`), read where a part draws: the frame reads them here alone. */
export const frameChrome = () => provided("chrome");
/** The shell's verbs (bridge/shell.ts, provided as `shell`: sign-out, the workspace, the address), read here alone. */
export const frameShell = () => provided("shell");
/** The bell (bridge/notifications.ts, provided as `bell`), where the workspace has one: the frame reads it here alone. */
export const frameBell = () => provided("bell");
