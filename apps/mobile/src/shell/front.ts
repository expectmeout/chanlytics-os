/**
 * Which tab's page is in front, and its handle: the one place a tab press reaches the page it means. Kept outside
 * React on purpose; a native tab press arrives through a listener, not a render. Each Surface sets itself here
 * whenever its tab is in front and its page is ready, and forgets itself as it unmounts.
 */
import type { ShellMessage } from "@chanlytics/contracts";
import type { SurfaceHandle } from "./Surface";
import type { Tab } from "./state";

const handles = new Map<Tab, SurfaceHandle>();

export const front = {
  tab: "today" as Tab,
  set(tab: Tab, h: SurfaceHandle) {
    handles.set(tab, h);
    front.tab = tab;
  },
  forget(tab: Tab) {
    handles.delete(tab);
  },
  ask(m: ShellMessage) {
    handles.get(front.tab)?.ask(m);
  },
};
