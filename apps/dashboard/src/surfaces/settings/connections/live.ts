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
import { googleVerbs } from "@/bridge/google";
import { canDo } from "../../frame-verbs";
import { workspacesNow } from "../business/shell";
import { connectedMailboxes } from "./connected-mailboxes";
import { igConnect } from "./instagram";
import { metaConnect } from "./meta";
import { keepsUntilSeen, type CameBack, type Keeper } from "./model/came-back";
import { loginSentence, type SignInNames } from "./model/login-words";
import { lineCodes, waConnect, waStanding, type SignupDoor } from "./whatsapp";

/**
 * What a keeper holds (model/came-back.ts), as a pane says it: the same on every drawing of the pane, and the Ok that
 * ends it. The frame draws a pane more than once as its page loads, and the address says a return only the first time.
 */
function useKept<T>(kept: Keeper<T>): [T | null, () => void] {
  const [held, setHeld] = useState<T | null>(kept.read);
  const drop = () => {
    kept.seen();
    setHeld(null);
  };
  return [held, drop];
}

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

/** What the browser came back from Google with, in the row's words. */
function googleNote(): string | null {
  const o = googleVerbs.outcome();
  if (!o) return null;
  const W = googleVerbs.outcomeWords;
  return (
    W[o.why || ""] || W[o.outcome] || (o.outcome === "error" ? `Google did not connect (${o.why || "unknown"}).` : null)
  );
}

/**
 * What Google's sign-in and a mailbox's came back with, each kept until its Ok, as the pane says them: the frame draws
 * the pane more than once as the page loads, and the address says a return only the first time (model/came-back.ts).
 */
const googleCame = keepsUntilSeen(googleNote);
const mailboxCame = keepsUntilSeen(() => connectedMailboxes.outcome());
export const useGoogleNote = () => useKept(googleCame);
export const useMailboxNote = () => useKept(mailboxCame);

/** A login's door as the pane asks it: Instagram's own (instagram.ts) or Meta's (meta.ts). */
interface LoginDoor<D> {
  config: () => Promise<D>;
  held: () => D | null;
  returned: Keeper<CameBack>;
}

/**
 * A login's door, asked once (`undefined` while asking, null where it could not be read: the row says Later or leaves the
 * offer out), and what the browser came back from that login with, said under its row until Ok.
 */
function useLoginDoor<D>(login: LoginDoor<D>, label: "Instagram" | "Meta") {
  // What the tab last held, drawn at once (pane-reads.ts): the row said it was asking, and changed as the answer came.
  const [door, setDoor] = useState<D | null | undefined>(() => login.held() ?? undefined);
  const [returned, clearNote] = useKept(login.returned);
  useEffect(() => {
    let on = true;
    login
      .config()
      .then((c) => on && setDoor(c))
      .catch(() => on && setDoor(null));
    return () => {
      on = false;
    };
  }, [login]);
  // The row's sentence for what came back, naming what this page may name; null where nothing came back.
  const note = (names: SignInNames) => (returned ? loginSentence(label, returned, names) : null);
  return { door, note, clearNote };
}

/** Both logins' doors, asked as Connections opens: Instagram's own, and Meta's (the Meta link). */
export function useLogins() {
  return { ig: useLoginDoor(igConnect, "Instagram"), meta: useLoginDoor(metaConnect, "Meta") };
}
export type Logins = ReturnType<typeof useLogins>;

/**
 * What a sign-in's sentence may name on this page: one of this person's own workspaces by its address's word (the
 * callback writes that word only for a workspace the person owns or manages), and the account connected here.
 */
export const signInNames = (channels: readonly ChannelVM[] | null | undefined): SignInNames => ({
  workspace: (slug) => workspacesNow()?.find((mine) => mine.slug === slug)?.name ?? null,
  handle: channelFor(channels ?? [], "instagram")?.handle ?? null,
});
