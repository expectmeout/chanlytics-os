/**
 * What is left to set up, as one card above the queue in its column (the first run's Today card, canvas R10 and P9), as
 * Today draws it. The card's words and rules are the first run's (contracts first-run.ts setupCardOf, with its steps,
 * phone and Try) and its rows Setup's, which were most of what Today's own first load carried, for a card most workspaces
 * never show (the loadability review, 19 Oct 2026). So the card is a chunk of its own (setup-card-body.tsx), asked for as
 * this module loads with Today's page, beside Setup's read, and drawn once both are in: the card or nothing.
 */
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { usePartShown, useSurface } from "../../use-surface";

/** The card's code: asked for once, as Today's page loads; a fetch that failed is asked for again as the card draws. */
const bodyCode = codeOnce(() => import("./setup-card-body"));

/** The card's code is in (a test draws the card once it is). */
export const setupCardReady: Promise<void> = bodyCode().then(
  () => undefined,
  () => undefined,
);

export const TodaySetup = () => {
  const S = useSurface("setup");
  const body = useCode(bodyCode, true).loaded;
  // Drawn once Setup's read and the card's code are in, the card or nothing (client/page-speed.ts).
  usePartShown("today", "setup", !!S && !!body);
  return S && body ? <body.TodaySetupCard S={S} /> : null;
};
