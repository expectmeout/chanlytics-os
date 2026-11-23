/**
 * Whether a view of Campaigns is the one shown, for the parts that say their draw (client/page-speed.ts, contracts
 * PRIMARY_PART). Its views are kept beside each other (home/route.tsx), and each showing of one is a page of its own begun
 * (contracts vitalsPageOf: Content, its Library and its Week, Ads and Forms), which a part in a view drawn ahead, hidden,
 * would have begun before it and said nothing of. The split each view stands in says it (split.tsx).
 */
import { createContext, use, type Context, type ReactNode } from "react";
import { usePartShown } from "../../use-surface";

/** A part's draw: the page the field data names it by, the part's own word, and whether what it draws has arrived. */
interface PartProps {
  page: string;
  part: string;
  ready: boolean;
}

let shownContextMade: Context<boolean> | null | undefined;

/**
 * Made the first time it is asked for, never as the module loads: the node suite's React (its react-server build) has no
 * createContext (message-pane.ts), and there every view is shown.
 */
function shownContext(): Context<boolean> | null {
  if (shownContextMade === undefined)
    shownContextMade = typeof createContext === "function" ? createContext(true) : null;
  return shownContextMade;
}

/** A view's parts told whether it is the one shown. */
export function ViewShownAs({ shown, children }: { shown: boolean; children: ReactNode }) {
  const Shown = shownContext();
  return Shown ? <Shown value={shown}>{children}</Shown> : <>{children}</>;
}

/** The draw said (use-surface.ts usePartShown): mounted once each time its view is shown, so each showing is a run of its own. */
function PartSaid({ page, part, ready }: PartProps): null {
  usePartShown(page, part, ready);
  return null;
}

/** A part's draw, said while its view is the one shown. Draws nothing. */
export function PartShown(props: PartProps) {
  const Shown = shownContext();
  const onScreen = Shown ? use(Shown) : true;
  return onScreen ? <PartSaid {...props} /> : null;
}
