/**
 * The reach-out's door and sheet as the pages that have not moved draw them (../globals.ts: Leads draws the door and,
 * through its list, the sheet), fetched the first time one is drawn. The shell publishes these names before any page
 * loads, so a door or sheet imported here outright would put the sheet's editor, its pickers and the kit's Base UI parts
 * on every page of the workspace (the route's bundle budget, `check:bundle`); a page that draws one waits for it once.
 * Until it has come, nothing is drawn, as before the bridge published it.
 */
import { useEffect, useState, type ComponentProps, type ComponentType } from "react";
import type { ReachOutDoor as Door } from "./door";
import type { ReachOutSheet as Sheet } from "./sheet";

/** A component fetched on its first draw: nothing until it has come, then the component itself with the same props. */
function later<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  return function Later(props: P) {
    const [Drawn, setDrawn] = useState<ComponentType<P> | null>(null);
    useEffect(() => {
      let live = true;
      void load().then((c) => {
        if (live) setDrawn(() => c);
      });
      return () => {
        live = false;
      };
    }, []);
    return Drawn ? <Drawn {...props} /> : null;
  };
}

/** The door to a search's reach-out, as Leads draws it. */
export const ReachOutDoorLater = later<ComponentProps<typeof Door>>(() => import("./door").then((m) => m.ReachOutDoor));

/** The reach-out's sheet, as Leads' list draws it. */
export const ReachOutSheetLater = later<ComponentProps<typeof Sheet>>(() =>
  import("./sheet").then((m) => m.ReachOutSheet),
);
