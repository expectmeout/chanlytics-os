/**
 * Campaigns › Broadcasts, real: one message, on the channels it holds, to the people who said yes (moved from
 * legacy/pages/broadcasts.jsx, decision 0015). Every number is a row's. Nothing here scores, estimates or invents: no
 * credits, no revenue, no "booked from broadcasts" — the schema has no column for it.
 *
 * Sent's list went to each sequence's History (decision 0060, D3), and its mount went with the Campaigns wiring review
 * (19 Oct 2026): each of its addresses lands on the page that took it over (contracts retiredRouteOf). What stays here is
 * the two screens the page's one state holds: the send screen, which New's Send once draws (BroadcastSend: lane 6), and a
 * run's own screen, which Sequences draws at the run's home under its sequence and any page opens over itself
 * (BroadcastRun: lanes 2 and 3). To send is a part of the Inbox's Needs you (lane 4: surfaces/waits/to-send-part.tsx), and
 * Get their yes a sheet over People's list (lane 7: people/sheets/get-yes-sheet.tsx).
 *
 * The audience chips carry the count of people who may receive an offer (what
 * the channels it goes by ask of them), computed by the same contracts predicate the
 * route enrols with. The message is one with a version on a channel it goes by; its values are
 * typed here and the words a person will read are shown before anything is
 * sent. Sends and cancels go through the broadcasts verbs and the surface is
 * re-fetched, so the Scheduled and History rows are the server's.
 *
 * A real workspace draws the bridge's own rows (`useSurface("broadcasts")`), with who each audience reaches
 * (`useSurface("audiences")`) once that is read; a demo session draws the same page from the sample (sample.ts); without
 * either, nothing is drawn.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SEQUENCES_ROUTE, type ConsentChannel } from "@chanlytics/contracts";
import { backFrom, canDo, demoSession, useLegacyToast } from "../../legacy-verbs";
import { useUnsavedWork } from "../../kit/record/work";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import { cmDefaultChannels, cmReadyOf } from "../parts/channels";
import { bcAgainOf, bcRunSolo, bcRunsOf, bcSheetOf } from "./page/runs";
import { bcRunActs, bcSendActs } from "./page/acts";
import { bcPeopleOf, bcPreviewOf, bcReachOf, bcSlotChoicesOf, bcSlotWordsOf } from "./page/reach";
import { bcComposerGlass } from "./page/send-screen";
import {
  useBcArmed,
  useBcList,
  useBcNow,
  useBcOffered,
  useBcOpen,
  useBcWords,
  useBcYes,
  useUnknownAudienceNotice,
  type RunOver,
} from "./page/state";
import type { BcApproving, BcBase, BcData, BcV, BcWhole, Flash } from "./page/types";
import { bcDefault, bcIsStarter } from "./page/words";
import { BC_NONE, BroadcastDetail } from "./run";
import { broadcastsSample } from "./sample";

/** What the page's state opens on: the audience a send is for, or the run open (a run's own screen, BroadcastRun). */
interface BroadcastsPageProps {
  data: BcData;
  initialSegment?: string | null;
  /** The run open: a run's own screen (BroadcastRun), drawn at its home under its sequence. */
  initialRun?: string | null;
}

// Starters in review at WhatsApp: the honest line while nothing is approved yet. Settings' templates are read as they
// stand as the page draws (as the JSX read the window's).
function starterPendingOf(): number {
  return (surfaceValue("settings")?.templatesAll || BC_NONE).filter(
    (t) => bcIsStarter(t.name) && t.meta_status === "pending",
  ).length;
}

// What the screens say, worked out on every draw as it always was; then the acts, the runs and a run's sheet.
function bcWorked(base: BcBase, approving: BcApproving): BcV {
  const v1 = { ...base, ...bcReachOf(base) };
  const v2 = { ...v1, ...bcSlotChoicesOf(v1) };
  const v3 = { ...v2, ...bcSlotWordsOf(v2) };
  const v4 = { ...v3, ...bcPeopleOf(v3) };
  const v5 = { ...v4, ...bcPreviewOf(v4) };
  const v6 = { ...v5, ...approving };
  const v7 = { ...v6, ...bcRunActs(v6) };
  const v8 = { ...v7, ...bcSendActs(v7) };
  const v9 = { ...v8, ...bcRunsOf(v8) };
  const v10 = { ...v9, ...bcSheetOf(v9) };
  return { ...v10, ...bcAgainOf(v10) };
}

/** What the page's state is opened with: what a link names, and (New's Send once) the send already open. */
interface BroadcastsPageState extends BroadcastsPageProps {
  /** The send screen is open from the first draw: New's Send once, which opens it by its address. */
  opened?: boolean;
  /**
   * The host's own toast, where the screen is hosted in a sheet that closes over what a send says (Campaigns' home): the page
   * raises its toasts there and draws no host of its own, which would go with the sheet.
   */
  flash?: Flash;
  /**
   * Where the screen's door to the yes goes where its host moves the page itself, and so, left that way, has nothing more to be
   * told about the screen having been left (Campaigns' home replaces the composer's address with the section's).
   */
  onYes?: (route: string) => void;
  /** A run's screen open over another page (`?see=`): the sheet it stands in is told what it opens next. */
  over?: RunOver;
}

// The page calls its hooks in the order it always has, each holding one concern (page/state.tsx); plain functions
// (page/) work out what its screens say, on every draw as before, and return the elements they draw. It is one hook, so
// Sent's sheets and Campaigns' composer, which hosts the send screen, hold the one state.
function useBroadcastsPage({
  data,
  initialSegment = null,
  initialRun = null,
  opened = false,
  flash: hosted,
  onYes,
  over,
}: BroadcastsPageState) {
  const [ownToast, ownFlash]: [ReactNode, Flash] = useLegacyToast();
  const flash = hosted ?? ownFlash;
  const toastNode = hosted ? null : ownToast;
  // Who may send, approve or stop: the role store's answer, View-as included.
  const canSend = !!canDo("approve");
  const audiences = data.audiences || BC_NONE;
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  const { offered, link, review, templates } = useBcOffered(data);
  const { kept, aud, setAud, writing, setWriting } = useBcList(initialSegment, audiences, opened);
  useUnknownAudienceNotice(initialSegment, data.audiences, flash);
  const [tplId, setTplId] = useState(() => {
    if (kept && kept.tplId && templates.some((t) => t.id === kept.tplId)) return kept.tplId;
    const d = bcDefault(templates);
    return d ? d.id : "";
  });
  // The channels it goes by, ticked in the Send by row: the first the workspace is ready on and the message it opens on
  // holds, WhatsApp alone where there is none, as every send went. A choice like the list and the message, so a tick alone
  // keeps nothing; what the tab kept comes back with the send.
  const [channels, setChannels] = useState<ConsentChannel[]>(() =>
    kept && kept.channels && kept.channels.length > 0
      ? kept.channels
      : cmDefaultChannels(cmReadyOf(data.ready), templates.find((t) => t.id === tplId)?.message ?? null),
  );
  const words = useBcWords(kept);
  const { params, sources, name, whenAt, heardTooFor, wrote, clearWords } = words;
  const work = useUnsavedWork("broadcast", null, {
    value: { aud, tplId, channels, params, sources, name, whenAt },
    dirty: wrote,
    onLeave: () => {
      clearWords();
      setWriting(false);
      setArmed(false);
    },
  });
  // Which of the audience's people the preview is showing.
  const [who, setWho] = useState(0);
  const now = useBcNow(data);
  // Whether Send now has been pressed once and is asking: put away once it is not the question asked (useBcArmed).
  const { armed, setArmed } = useBcArmed({ tplId, aud, channels, whenAt, heardTooFor });
  // The run open beside Sequences' list, by the address (useBcOpen).
  const { openId, openRun } = useBcOpen(initialRun, data.rows ?? null, over);
  // Left by the door to the yes, a hosted screen has been moved on by its host: it is not "done" as a send or a Cancel is.
  const leftByDoor = useRef(false);
  const { yesDoor, yesLink } = useBcYes(
    data,
    setWriting,
    onYes
      ? (route) => {
          leftByDoor.current = true;
          onYes(route);
        }
      : undefined,
  );
  // The row whose stop is armed, and the one whose stop is on its way.
  const [armId, setArmId] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [addingStarters, setAddingStarters] = useState(false);
  // Starters in review at WhatsApp: the honest line while nothing is approved yet.
  const starterPending = starterPendingOf();
  useEffect(() => {
    const d = bcDefault(templates);
    if (!templates.some((t) => t.id === tplId) && d) setTplId(d.id);
  }, [templates, tplId]);
  // A new message, list or channels starts the preview on its first person; a time picked, or the switch, does not move it.
  useEffect(() => {
    setWho(0);
  }, [tplId, aud, channels]);

  const base: BcBase = {
    data,
    flash,
    canSend,
    audiences,
    templatesRead,
    offered,
    link,
    review,
    templates,
    aud,
    setAud,
    setWriting,
    tplId,
    setTplId,
    channels,
    setChannels,
    ...words,
    work,
    who,
    setWho,
    now,
    armed,
    setArmed,
    openId,
    openRun,
    yesDoor,
    yesLink,
    armId,
    setArmId,
    stopping,
    setStopping,
    addingStarters,
    setAddingStarters,
    starterPending,
  };
  // One approve at a time: a second press while the first is out would be refused by the server, so the button says
  // it is approving instead, and the guard holds before the button has drawn that.
  const approvingRef = useRef<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const v = bcWorked(base, { approvingRef, approving, setApproving });
  return { v, toastNode, writing, openId, leftByDoor };
}

/**
 * The send screen on its own, for Campaigns' composer (Send once, and Send it again): held by the same hook as Sent's sheets,
 * so what is kept in the tab, the channels, the preview and the one Send are the page's. `initialSegment` is the
 * audience it opens on ("message these people", from People or a list: `campaigns/new:to:<audience>`). `flash` is the home's
 * toast, not a host of the screen's own: a send closes the sheet at once, and the toast that says it is sending, with its Stop
 * and its "See who", must outlive it. `onDone` is told when the screen has been left, sent or scheduled or cancelled, which is
 * when the page's own `writing` ends. `onYes` is the door to where their yes is got: the host moves the page there itself (the
 * sheet's address is replaced by the section's), and is not told `onDone` besides, which would close what it has left.
 */
export function BroadcastSend({
  data,
  initialSegment = null,
  flash,
  onDone,
  onYes,
  above = null,
}: {
  data: BcWhole;
  initialSegment?: string | null;
  flash: Flash;
  onDone: () => void;
  onYes: (route: string) => void;
  /** What its host draws over the sentence: New's who and when, where the screen is New's pane. */
  above?: ReactNode;
}) {
  const { v, writing, leftByDoor } = useBroadcastsPage({ data, initialSegment, opened: true, flash, onYes });
  const seen = useRef(false);
  useEffect(() => {
    if (writing) {
      seen.current = true;
      leftByDoor.current = false;
    } else if (seen.current && !leftByDoor.current) onDone();
  }, [writing]); // eslint-disable-line react-hooks/exhaustive-deps -- told when the send screen is left, not when its host re-draws
  return bcComposerGlass(v, above);
}

/**
 * What the page is drawn from: Sent's runs, with who each audience reaches once that is read (Send it again offers a run's
 * list then; a run's screen, To send and Get their yes never wait for it, since it is every page of People:
 * audiences-surface.ts); a demo session's sample; else nothing yet.
 */
function useBroadcastsData(): BcData | null {
  const live = useSurface("broadcasts");
  const audiences = useSurface("audiences");
  const real = useMemo(() => (live ? { ...audiences, ...live } : null), [live, audiences]);
  return real || (demoSession() ? broadcastsSample() : null);
}

/** What a run's screen is told of where it stands: its id, and, over another page, the host's toast and the sheet. */
interface RunPlace {
  id: string;
  /** The toast host of the page it stands over (surfaces/see/see-mount.tsx), whose toast outlives the sheet. */
  flash?: Flash;
  over?: RunOver;
}

/** A run's screen held by the page's own hook: its acts, the next run waiting it opens, Send it again, and its toasts. */
function BroadcastRunOf({ data, id, flash, over }: RunPlace & { data: BcData }) {
  const { v, toastNode } = useBroadcastsPage({ data, initialRun: id, flash, over });
  return (
    <>
      {bcRunSolo({ ...v, openId: v.openId ?? id })}
      {toastNode}
    </>
  );
}

/**
 * A run's own screen, at its home under its sequence (the Campaigns wiring review's lane 2, 19 Oct 2026): the one screen a
 * run has, which follows what it is -- its decision while it waits for an OK (a campaign run's sheet, a reach-out's block),
 * its Stop while it goes, its report once it went -- held by the same hook as Sent's sheets, so its Approve, its Skip,
 * the next run waiting it opens and Send it again are the page's. Sequences draws it in place of the record (sequences/
 * run-pane.tsx). Before Sent's runs are read it is the run's report alone, which reads itself, with no acts yet.
 */
export function BroadcastRun({ id, flash, over }: RunPlace) {
  const data = useBroadcastsData();
  if (!data)
    return (
      <BroadcastDetail id={id} onClose={() => (over ? over.go(null) : backFrom(SEQUENCES_ROUTE, { replace: true }))} />
    );
  return <BroadcastRunOf data={data} id={id} flash={flash} over={over} />;
}
