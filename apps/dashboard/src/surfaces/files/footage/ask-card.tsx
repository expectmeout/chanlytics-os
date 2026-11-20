/**
 * AI's card for a watched folder (the footage sources plan, P5; the canvas's boards "Setting it up", "The folder
 * chooser" and "The last card"). The owner never fills in a form: each step is the card with one press, and after
 * each press the next step arrives by itself.
 *
 *   Connect   what Chanlytics will open and what it never does, said before Google's own window says "all your
 *             files". The window is Google's; the card waits, and reads what came of it.
 *   Choose    the folder chooser, one level at a time. Skipped where the owner pasted a folder's link.
 *   Watch     the folder, whose Drive it is, whether the folders inside it count, and what comes in first. This
 *             press is the card's own (contracts bringInSpec commits it), so what became of it is kept on the turn
 *             like any card's.
 *
 * A step already done is one quiet line at most (the account, once connected), and the last step says the rest
 * itself. Where the folder stands is read where Settings reads it (use-footage.ts), so a card drawn again later picks
 * up at the step that is left.
 */
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  FOOTAGE_SETUP as W,
  FOOTAGE_WORDS,
  connectStoppedOf,
  textOrEmpty,
  type AskProposal,
  type ConnectStopped,
} from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import type { FolderChoice } from "./chooser";
import { LazyFolderChooser } from "./chooser-lazy";
import { copyAdminSteps, useFootage, type FootageHere } from "./use-footage";
import { WatchFacts } from "./watch-confirm";
import "./footage.css";

/** The step the card stands at. */
type FolderStep = "connect" | "blocked" | "choose" | "watch";

/** What the card's one press is at this step: its word, whether it may be pressed, and what it does. */
export interface FolderCard {
  step: FolderStep;
  /** The card as its head and its commit read it: this step's title, and at the last step what the press sends. */
  card: AskProposal;
  press: { label: string; disabled: boolean };
  /** The step's own act; null at the last step, whose press is the card's commit. */
  act: (() => void) | null;
  /**
   * A quiet second press beside it: Choose another at the last step, or, where the folder would take another's place,
   * Keep that one, which lets the card go (`dismiss`). Null where the step has one press.
   */
  also: { label: string; act: (() => void) | "dismiss" } | null;
  body: ReactNode;
}

/** What an earlier step made true, as one quiet line over the step in hand. */
function DoneLine({ said }: { said: string }) {
  return (
    <p className="fo-done" data-testid="fo-card-done">
      {said}
    </p>
  );
}

/** One line under a step's words: what a press came to. Amber only where the owner must do something differently. */
function StepTold({ said }: { said: Pick<ConnectStopped, "say" | "tone"> | null }) {
  if (!said) return null;
  return (
    <p className="fo-told" data-tone={said.tone} role="status" data-testid="fo-card-told">
      {said.say}
    </p>
  );
}

/** What every step of the card reads: the proposal, where the folder stands, and what the owner did on the card. */
interface FolderSteps {
  proposal: AskProposal;
  here: FootageHere;
  /** The folder a pasted link named, before any is picked. */
  pasted: string | null;
  picked: FolderChoice | null;
  /** The pasted folder is one the connected account cannot open. */
  shut: boolean;
  /** The chooser was closed with nothing chosen. */
  closed: boolean;
  inside: boolean;
  setInside: (inside: boolean) => void;
  /** Whether the manager's steps reached the clipboard; null before the press. */
  copied: boolean | null;
  copy: () => void;
  choose: () => void;
  /** The chooser, where it is open. */
  chooser: ReactNode;
}

/** The card's own state: the folder picked, the chooser, and what a press on the card came to. */
function useFolderSteps(proposal: AskProposal, on: boolean): FolderSteps {
  const payload = proposal.payload ?? {};
  const here = useFootage(on);
  const pasted = textOrEmpty(payload.folder_id) || null;
  const [picked, setPicked] = useState<FolderChoice | null>(() => {
    const name = textOrEmpty(payload.folder_name);
    return pasted && name ? { id: pasted, name } : null;
  });
  const [choosing, setChoosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [shut, setShut] = useState(false);
  const [inside, setInside] = useState(true);
  const [copied, setCopied] = useState<boolean | null>(null);
  const account = here.dto?.account ?? null;

  // A pasted folder is named once its Drive is connected: the card then says which folder it is.
  const unnamed = on && account?.health === "ok" && !picked && !shut ? pasted : null;
  useEffect(() => {
    if (!unnamed) return undefined;
    let live = true;
    read("GET sources/folder", { query: { id: unnamed } }).then(
      (answer) => {
        if (!live) return;
        if (answer.folder) setPicked(answer.folder);
        else setShut(true);
      },
      () => {
        if (live) setShut(true);
      },
    );
    return () => {
      live = false;
    };
  }, [unnamed]);

  const chooser = choosing ? (
    <Suspense fallback={null}>
      <LazyFolderChooser
        open
        email={account?.email ?? null}
        onClose={() => {
          setChoosing(false);
          setClosed(true);
        }}
        onChoose={(folder) => {
          setChoosing(false);
          setClosed(false);
          setShut(false);
          setPicked(folder);
        }}
      />
    </Suspense>
  ) : null;

  return {
    proposal,
    here,
    pasted,
    picked,
    shut,
    closed,
    inside,
    setInside,
    copied,
    copy: () => void copyAdminSteps().then(setCopied),
    choose: () => setChoosing(true),
    chooser,
  };
}

/** A Workspace that blocks apps: the steps to send its manager, and the way that still works. */
function blockedStep(steps: FolderSteps): FolderCard {
  return {
    step: "blocked",
    card: { ...steps.proposal, title: W.connect.blocked.title },
    press: { label: FOOTAGE_WORDS.acts.copy_steps, disabled: false },
    act: steps.copy,
    also: null,
    body: (
      <div className="fo-asked" data-step="blocked" data-testid="fo-card">
        <p>{connectStoppedOf("blocked_by_admin").say}</p>
        <p className="fo-watch-fine">{W.connect.blocked.fine}</p>
        {steps.copied === true ? <StepTold said={{ say: FOOTAGE_WORDS.stepsCopied, tone: "rest" }} /> : null}
        {steps.copied === false ? <p className="fo-watch-fine">{FOOTAGE_WORDS.adminSteps}</p> : null}
      </div>
    ),
  };
}

/** The word on Connect's press: waiting on Google's window, a try again, a connect again, or the first press. */
function connectLabel(here: FootageHere, stopped: ConnectStopped | null): string {
  if (here.connecting) return W.connect.waiting;
  if (stopped?.press === "retry") return W.connect.retry;
  const again = here.dto?.account?.health === "needs_reconnect" || stopped?.press === "again";
  return again ? W.connect.again : W.connect.press;
}

/** Connect: what Chanlytics will open, said before Google's own window. */
function connectStep(steps: FolderSteps): FolderCard {
  const stopped = steps.here.outcome ? connectStoppedOf(steps.here.outcome) : null;
  return {
    step: "connect",
    card: { ...steps.proposal, title: W.connect.title },
    press: {
      label: connectLabel(steps.here, stopped),
      disabled: steps.here.connecting || steps.here.dto === null || stopped?.press === null,
    },
    act: steps.here.connect,
    also: null,
    body: (
      <div className="fo-asked" data-step="connect" data-testid="fo-card">
        <p>{steps.pasted ? W.connect.bodyPasted : W.connect.body}</p>
        {stopped ? <StepTold said={stopped} /> : <p className="fo-watch-fine">{W.connect.fine}</p>}
      </div>
    ),
  };
}

/** Choose: the chooser, a press away. */
function chooseStep(steps: FolderSteps): FolderCard {
  const email = steps.here.dto?.account?.email ?? null;
  return {
    step: "choose",
    card: { ...steps.proposal, title: W.choose.title },
    press: { label: W.choose.press, disabled: false },
    act: steps.choose,
    also: null,
    body: (
      <div className="fo-asked" data-step="choose" data-testid="fo-card">
        <DoneLine said={W.connect.done(email)} />
        <p>{W.choose.body}</p>
        {steps.shut ? <StepTold said={{ say: W.choose.shut(email), tone: "you" }} /> : null}
        {steps.closed && !steps.shut ? <StepTold said={{ say: W.choose.none, tone: "rest" }} /> : null}
        {steps.chooser}
      </div>
    ),
  };
}

/** Watch: the folder, whose Drive it is, whether the folders inside it count. The press is the card's own commit. */
function watchStep(steps: FolderSteps, folder: FolderChoice): FolderCard {
  const watched = steps.here.dto?.folder ?? null;
  const instead = watched && watched.provider_id !== folder.id ? watched.name : null;
  return {
    step: "watch",
    card: {
      ...steps.proposal,
      title: instead ? W.confirm.instead.title(folder.name) : W.confirm.title(folder.name),
      payload: {
        ...steps.proposal.payload,
        folder_id: folder.id,
        folder_name: folder.name,
        include_subfolders: steps.inside,
        instead: instead !== null,
      },
    },
    press: { label: instead ? W.confirm.instead.press : W.confirm.press, disabled: false },
    act: null,
    also: instead
      ? { label: W.confirm.instead.keep(instead), act: "dismiss" }
      : { label: W.confirm.another, act: steps.choose },
    body: (
      <div className="fo-asked" data-step="watch" data-testid="fo-card">
        <WatchFacts
          email={steps.here.dto?.account?.email ?? null}
          instead={instead}
          inside={steps.inside}
          onInside={steps.setInside}
          fixed={false}
        />
        {steps.chooser}
      </div>
    ),
  };
}

/**
 * The card once pressed: its head names the folder its press watched (the canvas's Confirm 4), and what became of the
 * press is the card's own line under it, so nothing else is said again over it.
 */
function decidedStep(steps: FolderSteps, folder: FolderChoice): FolderCard {
  return {
    step: "watch",
    card: { ...steps.proposal, title: W.confirm.title(folder.name) },
    press: { label: W.confirm.press, disabled: true },
    act: null,
    also: null,
    body: null,
  };
}

/**
 * The folder's card for a proposal of AI's: its step while it is still to be pressed (`idle`), and once decided, its
 * head alone where this page knows the folder its press watched. Null for any other card, and for one drawn again from
 * what the conversation kept, which reads nothing and is drawn as any card's record is.
 */
export function useFolderCard(proposal: AskProposal, idle: boolean): FolderCard | null {
  const mine = proposal.kind === "bring_in" && proposal.payload?.place === "drive";
  const steps = useFolderSteps(proposal, mine && idle);
  if (!mine) return null;
  if (!idle) return steps.picked ? decidedStep(steps, steps.picked) : null;
  const account = steps.here.dto?.account ?? null;
  if (account?.health === "blocked_by_admin") return blockedStep(steps);
  if (account?.health !== "ok") return connectStep(steps);
  return steps.picked ? watchStep(steps, steps.picked) : chooseStep(steps);
}
