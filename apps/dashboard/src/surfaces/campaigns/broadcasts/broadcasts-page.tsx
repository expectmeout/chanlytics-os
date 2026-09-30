/**
 * Campaigns › Broadcasts, real: one approved template to the people who said yes (moved from
 * legacy/pages/broadcasts.jsx, decision 0015). Every number is a row's. Nothing here scores, estimates or invents: no
 * credits, no revenue, no "booked from broadcasts" — the schema has no column for it.
 *
 * The audience chips carry the count of people who may receive an offer (a
 * recorded yes and a number), computed by the same contracts predicate the
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
import { useLegacyUnsavedWork } from "../../legacy-parts";
import { canDo, demoSession, navigate, useLegacyToast } from "../../legacy-verbs";
import { useLook } from "../../look";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
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

// BroadcastsReal calls its hooks in the order it always has, each holding one concern (page/state.tsx); plain functions
// (page/) work out what its screens say, on every draw as before, and return the elements they draw.
function BroadcastsReal({ data, initialSegment = null, initialRun = null, initialYes = false }: BroadcastsRealProps) {
  const glass = useLook() === "glass";
  const [toastNode, flash]: [ReactNode, Flash] = useLegacyToast();
  // Who may send, approve or stop: the role store's answer, View-as included.
  const canSend = !!canDo("approve");
  const audiences = data.audiences || BC_NONE;
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  const { offered, link, templates } = useBcOffered(data);
  const { kept, aud, setAud, writing, setWriting } = useBcList(initialSegment, audiences);
  const [tplId, setTplId] = useState(() => {
    if (kept && kept.tplId && templates.some((t) => t.id === kept.tplId)) return kept.tplId;
    const d = bcDefault(templates);
    return d ? d.id : "";
  });
  const words = useBcWords(kept);
  const { params, sources, name, whenAt, wrote, clearWords } = words;
  const work = useLegacyUnsavedWork("broadcast", null, {
    value: { aud, tplId, params, sources, name, whenAt },
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
  // The broadcast open on the page is the one its link names (broadcasts/run:<id>); Open on a run follows that link,
  // and its report is its own screen, as the send is.
  const openId = initialRun;
  const openRun = (id: string | null) => navigate(id ? `broadcasts/run:${id}` : "broadcasts");
  useBcRunLanding(openId);
  const { yesOpen, setYesOpen, yesDoor } = useBcYes(initialYes, data, setWriting);
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
  // The armed question names a template and an audience: change either and it is
  // no longer the question that was asked.
  useEffect(() => {
    setArmed(false);
    setWho(0);
  }, [tplId, aud]);

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

  return (
    <div className={`bc-page${openId ? " is-report" : ""}`} data-testid="broadcasts-real">
      <div className="bc-body">
        {/* A run, opened: its report on a screen of its own, whether the list holds it or it is older than the list. */}
        {openId ? bcRunSolo({ ...v, openId }) : null}

        {/* Three questions, side by side -- who, what, when -- and the one act that
          cannot be taken back alone at the foot. As a single column, the audience,
          the words and the send button never appeared on the same screen: an owner
          scrolled past the preview to reach Send, which is the wrong direction of
          travel for the only irreversible control on the surface. */}
        {openId ? null : writing ? (glass ? bcComposerGlass(v) : bcComposer(v)) : bcLedger(v)}
      </div>

      {toastNode}
    </div>
  );
}

export function BroadcastsPage(props: BroadcastsPageProps) {
  const live = useSurface("broadcasts");
  const data = live || (demoSession() ? broadcastsSample() : null);
  if (!data) return null;
  return <BroadcastsReal data={data} {...props} />;
}
