/**
 * What Settings > Connections asks while it is open, beyond what the surfaces it reads tell it: the one-time codes texted to the
 * workspace's own line (Meta sends one when an owner connects that number to WhatsApp, and nobody else could see it: the
 * receptionist never answers it), and what Meta holds about the WhatsApp number when the kept answer is missing or has gone
 * stale. Both are the owner's (the routes refuse anyone else, and the page does not ask).
 *
 * The asks are `lineCodes` and `waStanding` (whatsapp.ts), module objects a test stubs by assignment as `waConnect`'s are.
 */
import { useEffect, useRef, useState } from "react";
import {
  channelFor,
  LINE_CODES_EVERY_MS,
  standingNeedsRead,
  type ChannelVM,
  type LineCodeDto,
} from "@chanlytics/contracts";
import { canDo } from "../../legacy-verbs";
import { lineCodes, waConnect, waStanding, type SignupDoor } from "./whatsapp";

/** One read of the codes, painted if the page that asked still wants it; a read that fails changes nothing: the page keeps what it has. */
function askCodes(paint: (codes: LineCodeDto[]) => void): void {
  lineCodes.read().then(paint, () => {});
}

/**
 * The codes sent to the workspace's own line lately: asked for once as the page opens (an owner, on a workspace with a line of its
 * own: nothing else can receive one) and every LINE_CODES_EVERY_MS while Meta's sign-up window is open. Nothing is kept.
 */
export function useLineCodes(hasOwnLine: boolean, windowOpen: boolean): LineCodeDto[] {
  const [codes, setCodes] = useState<LineCodeDto[]>([]);
  const asking = hasOwnLine && canDo("team");
  useEffect(() => {
    let on = true;
    if (asking) askCodes((c) => on && setCodes(c));
    return () => {
      on = false;
    };
  }, [asking]);
  useEffect(() => {
    let on = true;
    const timer =
      asking && windowOpen ? window.setInterval(() => askCodes((c) => on && setCodes(c)), LINE_CODES_EVERY_MS) : null;
    return () => {
      on = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [asking, windowOpen]);
  return codes;
}

/**
 * Asks Meta once per opening when the standing the WhatsApp row would say is missing, or is not AVAILABLE and was read more than
 * ten minutes ago (standingNeedsRead), so a payment method added a minute ago shows as fixed without waiting for the six-hourly
 * read. An owner's, on a number that is switched on; the answer reaches the row through Settings' re-read.
 */
export function useStandingCheck(channels: ChannelVM[] | null | undefined): void {
  const asked = useRef(false);
  const wa = channels ? channelFor(channels, "whatsapp") : null;
  const due = canDo("team") && !!wa && wa.on && standingNeedsRead(wa, Date.now());
  useEffect(() => {
    if (!due || asked.current) return;
    asked.current = true;
    waStanding.check().catch(() => {});
  }, [due]);
}

/**
 * Meta's SDK, fetched once the WhatsApp row offers Connect to a member who may press it (the server's `canConnect`), so the
 * press itself asks for Meta's window: a phone's browser gives a page one only inside a press. A number already connected, a door
 * that is not ready and a member who may not connect fetch nothing of Meta's.
 */
export function useSignupAhead(
  door: Partial<SignupDoor> | null | undefined,
  channels: ChannelVM[] | null | undefined,
): void {
  const offered = !!door && !!door.ready && door.canConnect === true && !!channels && !channelFor(channels, "whatsapp");
  useEffect(() => {
    if (offered) waConnect.prepare(door);
  }, [offered, door]);
}
