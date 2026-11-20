/**
 * A watched folder's four writes (the footage sources plan, P5), pressed from the row in Settings, the Library's line,
 * AI's card and their sheets: read it now, watch a folder, stop watching, let the account go. Each answers as the typed
 * client answers, or null where no answer came at all: a press that may have gone through is checked, never pressed
 * again (watch-confirm.tsx).
 */
import { api } from "@/bridge/api";

/** What a watch is asked with: the folder, whether the folders inside it count, and whether it takes another's place. */
interface WatchFolderBody {
  folder_id: string;
  include_subfolders: boolean;
  instead: boolean;
}

/** The folder read now, ahead of its own clock. */
export const checkFolderNow = () => api()("POST sources/check", { body: {} }).catch(() => null);

/** A folder watched from now on. */
export const watchFolder = (body: WatchFolderBody) => api()("POST sources/watch", { body }).catch(() => null);

/** The folder no longer watched; its account stays connected. */
export const stopFolderWatch = () => api()("POST sources/stop", { body: {} }).catch(() => null);

/** The account let go, and its folder with it. */
export const disconnectDrive = () => api()("POST sources/disconnect", { body: {} }).catch(() => null);

/** "Remove what came from it too": what the folder brought and nothing used leaves the Library; null when it failed. */
export const removeFolderFiles = () => api()("POST sources/remove", { body: {} }).catch(() => null);
