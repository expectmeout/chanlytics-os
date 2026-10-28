/**
 * What is left to set up, as one card above the queue in its column (the first run's Today card, canvas R10 and P9), as
 * Today draws it. The card's words and rules are the first run's (contracts first-run.ts setupCardOf, with its steps,
 * phone and Try) and its rows Setup's, which were most of what Today's own first load carried, for a card most workspaces
 * never show (the loadability review, 19 Oct 2026). So the card is a chunk of its own (setup-card-body.tsx), asked for as
 * this module loads with Today's page, beside Setup's read, and drawn once both are in: the card or nothing. The page's
 * first draw waits for both, Setup's read as ROUTE_WAITS says and the code as setup-card-code.ts says, so the card never
 * lands over a queue already drawn.
 */
import { useCode } from "@/lib/use-code";
import { usePartShown, useSurface } from "../../use-surface";
import { setupCardCode as bodyCode } from "../setup-card-code";

/** The card's code is in, asked for as Today's page loads where the frame did not already (a test draws the card once it is). */
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
