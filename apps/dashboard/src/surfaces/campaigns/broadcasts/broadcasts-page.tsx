/**
 * Campaigns › Broadcasts, real: one approved template to the people who said yes (moved from
 * legacy/pages/broadcasts.jsx, decision 0015). Every number is a row's. Nothing here scores, estimates or invents: no
 * credits, no revenue, no "booked from broadcasts" — the schema has no column for it.
 *
 * The audience chips carry the count of people who may receive an offer (what
 * the channels it goes by ask of them), computed by the same contracts predicate the
 * route enrols with. The template is one WhatsApp approved; its values are
 * typed here and the words a person will read are shown before anything is
 * sent. Sends and cancels go through the broadcasts verbs and the surface is
 * re-fetched, so the Scheduled and History rows are the server's.
 *
 * A real workspace draws the bridge's own rows (`useSurface("broadcasts")`); a demo session draws the same page from
 * the sample (sample.ts); without either, nothing is drawn.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ConsentChannel } from "@chanlytics/contracts";
import { canDo, demoSession, replaceRoute, useLegacyToast } from "../../legacy-verbs";
import { useLook } from "../../kit/look/look";
import { useUnsavedWork } from "../../kit/record/work";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import { cmDefaultChannels } from "../parts/channels";
import { CmSplit } from "../parts/split";
import { bcAgainOf, bcLedgerOf, bcRunSolo, bcSheetOf } from "./page/runs";
import { bcRunActs, bcSendActs } from "./page/acts";
import { bcLedger } from "./page/ledger-screen";
import { bcPeopleOf, bcPreviewOf, bcReachOf, bcSlotChoicesOf, bcSlotWordsOf } from "./page/reach";
import { bcComposer, bcComposerGlass } from "./page/send-screen";
import { useBcList, useBcNow, useBcOffered, useBcRunLanding, useBcWords, useBcYes } from "./page/state";
import type { BcApproving, BcBase, BcV, Flash } from "./page/types";
import { bcDefault, bcIsStarter } from "./page/words";
import { BC_NONE } from "./run";
import { broadcastsSample } from "./sample";
import type { BroadcastsSurface } from "./surface";

interface BroadcastsPageProps {
  initialSegment?: string | null;
  initialRun?: string | null;
  initialYes?: boolean;
}

interface BroadcastsRealProps extends BroadcastsPageProps {
  data: BroadcastsSurface;
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
  const v9 = { ...v8, ...bcLedgerOf(v8) };
  const v10 = { ...v9, ...bcSheetOf(v9) };
  return { ...v10, ...bcAgainOf(v10) };
}

/** What the page's state is opened with: what a link names, and (Campaigns' home) the send already open. */
interface BroadcastsPageState extends BroadcastsRealProps {
  /** The send screen is open from the first draw: the home's New message, which opens it by its address. */
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
}

// The page calls its hooks in the order it always has, each holding one concern (page/state.tsx); plain functions
// (page/) work out what its screens say, on every draw as before, and return the elements they draw. It is one hook, so the
// ledger's page and Campaigns' home, which hosts the send screen under New message, hold the one state.
function useBroadcastsPage({
  data,
  initialSegment = null,
  initialRun = null,
  initialYes = false,
  opened = false,
  flash: hosted,
  onYes,
}: BroadcastsPageState) {
  const glass = useLook() === "glass";
  const [ownToast, ownFlash]: [ReactNode, Flash] = useLegacyToast();
  const flash = hosted ?? ownFlash;
  const toastNode = hosted ? null : ownToast;
  // Who may send, approve or stop: the role store's answer, View-as included.
  const canSend = !!canDo("approve");
  const audiences = data.audiences || BC_NONE;
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  const { offered, link, templates } = useBcOffered(data);
  const { kept, aud, setAud, writing, setWriting } = useBcList(initialSegment, audiences, opened);
  const [tplId, setTplId] = useState(() => {
    if (kept && kept.tplId && templates.some((t) => t.id === kept.tplId)) return kept.tplId;
    const d = bcDefault(templates);
    return d ? d.id : "";
  });
  // The channels it goes by, ticked in the Send by row: WhatsApp alone until the owner ticks others, as every send went. A
  // choice like the list and the message, so a tick alone keeps nothing; what the tab kept comes back with the send.
  const [channels, setChannels] = useState<ConsentChannel[]>(() =>
    kept && kept.channels && kept.channels.length > 0 ? kept.channels : cmDefaultChannels(),
  );
  const words = useBcWords(kept);
  const { params, sources, name, whenAt, wrote, clearWords } = words;
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
  // Which half of the history is in view: a playbook's runs, the ones sent by
  // hand, or both. Null is both.
  const [origin, setOrigin] = useState<string | null>(null);
  // The band the list is filtered to (a state), or none: everything open and the latest gone.
  const [band, setBand] = useState<string | null>(null);
  const now = useBcNow(data);
  // Whether Send now has been pressed once and is asking. A question about one
  // template and one audience cannot be answered for another, so changing either
  // puts the button back.
  const [armed, setArmed] = useState(false);
  // The run open beside the list is the address's (`broadcasts/run:<id>`), replaced as it opens and closes, so a reload
  // opens it again and the crumbs name it; Back leaves the page rather than replaying every run read (the Inbox's rule,
  // and Playbooks'). A link to a run, or one that closes it, moves the page the same way.
  const [openId, setOpenId] = useState(initialRun);
  const followed = useRef(initialRun);
  useEffect(() => {
    if (followed.current === initialRun) return;
    followed.current = initialRun;
    setOpenId(initialRun);
  }, [initialRun]);
  const openRun = (id: string | null) => {
    setOpenId(id);
    replaceRoute(id ? `broadcasts/run:${id}` : "broadcasts");
  };
  useBcRunLanding(openId);
  // Left by the door to the yes, a hosted screen has been moved on by its host: it is not "done" as a send or a Cancel is.
  const leftByDoor = useRef(false);
  const { yesOpen, setYesOpen, yesDoor, yesLink } = useBcYes(
    initialYes,
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
  // The armed question names a template, an audience and how many of them it reaches, which the channels it goes by
  // decide: change any and it is no longer the question that was asked.
  useEffect(() => {
    setArmed(false);
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
    origin,
    setOrigin,
    band,
    setBand,
    now,
    armed,
    setArmed,
    openId,
    openRun,
    yesOpen,
    setYesOpen,
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
  return { v, glass, toastNode, writing, openId, leftByDoor };
}

function BroadcastsReal(props: BroadcastsRealProps) {
  const { v, glass, toastNode, writing, openId } = useBroadcastsPage(props);
  // The ledger is always the list; beside it, in a pane, what is open (parts/split.tsx): a run, whether the list holds it
  // or it is older than the list, else the send. The send is three questions -- who, what, when -- and the one act that
  // cannot be taken back alone at the foot: the audience, the words and the send button on one screen, never an owner
  // scrolling past the preview to reach Send.
  const open = openId ? bcRunSolo({ ...v, openId }) : writing ? (glass ? bcComposerGlass(v) : bcComposer(v)) : null;
  return (
    <>
      <CmSplit className="bc-page" testid="broadcasts-real" list={bcLedger(v, glass)} open={open} />
      {toastNode}
    </>
  );
}

/**
 * The send screen on its own, for Campaigns' home (New message › Send once): the pane the ledger opens beside its list, held by
 * the same hook, so what is kept in the tab, the channels, the preview and the one Send are the page's. `initialSegment` is the
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
}: {
  data: BroadcastsSurface;
  initialSegment?: string | null;
  flash: Flash;
  onDone: () => void;
  onYes: (route: string) => void;
}) {
  const { v, glass, writing, leftByDoor } = useBroadcastsPage({ data, initialSegment, opened: true, flash, onYes });
  const seen = useRef(false);
  useEffect(() => {
    if (writing) {
      seen.current = true;
      leftByDoor.current = false;
    } else if (seen.current && !leftByDoor.current) onDone();
  }, [writing]); // eslint-disable-line react-hooks/exhaustive-deps -- told when the send screen is left, not when its host re-draws
  return glass ? bcComposerGlass(v) : bcComposer(v);
}

export function BroadcastsPage(props: BroadcastsPageProps) {
  const live = useSurface("broadcasts");
  const data = live || (demoSession() ? broadcastsSample() : null);
  if (!data) return null;
  return <BroadcastsReal data={data} {...props} />;
}
