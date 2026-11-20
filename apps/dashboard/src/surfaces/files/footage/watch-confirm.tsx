/**
 * The last step: watch the folder (the footage sources plan, P5; the canvas's board "The last card"). It names the
 * folder, whose Drive it is, whether the folders inside it count, and what comes in first. Pressing it is the
 * business's word: from then on what lands in that folder is theirs and goes straight into the Library.
 *
 * The step is drawn in two frames that share everything here: AI's last card in a conversation, and the sheet the row
 * in Settings opens. The press says what it is doing and cannot be pressed twice. Where no answer comes back the
 * press may have gone through, so it is checked and never tried again (docs/words.md).
 */
import { useState, type ReactNode } from "react";
import { FOOTAGE_SETUP as W, type FootageDto } from "@chanlytics/contracts";
import { watchFolder } from "@/bridge/verbs/footage";
import { Switch } from "../../kit/switch/switch";
import type { FolderChoice } from "./chooser";
import { heldFootage, readFootageAgain } from "./use-footage";
import "./footage.css";

/** Where the step stands. */
type WatchState = "idle" | "starting" | "done" | "shut" | "unconfirmed" | "not_watched" | "refused";

interface WatchStep {
  state: WatchState;
  /** Whether the folders inside the chosen one count: the step's one switch. */
  inside: boolean;
  setInside: (inside: boolean) => void;
  /** The words of a refusal the server said in its own sentence; null otherwise. */
  refusal: string | null;
  watch: () => Promise<void>;
  /** After no answer: reads where the folder stands, and says which. */
  check: () => Promise<void>;
}

/** Whether the workspace now watches this folder, as the server last said. */
const watches = (dto: FootageDto | null, folder: FolderChoice): boolean =>
  !!dto?.folder && dto.folder.state !== "stopped" && dto.folder.provider_id === folder.id;

/** The step's press. `instead` says a folder is watched already and this one takes its place (one folder a workspace). */
export function useWatchStep(folder: FolderChoice | null, instead: boolean): WatchStep {
  const [state, setState] = useState<WatchState>("idle");
  const [inside, setInside] = useState(true);
  const [refusal, setRefusal] = useState<string | null>(null);

  const check = async () => {
    if (!folder) return;
    await readFootageAgain();
    setState(watches(heldFootage(), folder) ? "done" : "not_watched");
  };

  const watch = async () => {
    if (!folder || state === "starting") return;
    setState("starting");
    setRefusal(null);
    const answer = await watchFolder({ folder_id: folder.id, include_subfolders: inside, instead });
    // No answer at all: the press may have gone through. It is checked, never pressed again.
    if (answer === null) return setState("unconfirmed");
    if (answer.ok) {
      setState("done");
      void readFootageAgain();
      return undefined;
    }
    // The folder went, or was unshared, between choosing it and the press: said as the folder's, with the way on.
    if (answer.code === "forbidden" || answer.code === "not_found") return setState("shut");
    setRefusal(answer.message);
    return setState("refused");
  };

  return { state, inside, setInside, refusal, watch, check };
}

/** What the step says under its facts, once pressed: one line, its tone the step's. */
function watchToldOf(
  step: WatchStep,
  folder: FolderChoice,
): { say: string; tone: "live" | "done" | "you" | "rest" } | null {
  switch (step.state) {
    case "starting":
      return { say: W.confirm.looking(folder.name), tone: "live" };
    case "done":
      return { say: W.confirm.done(folder.name), tone: "done" };
    case "shut":
      return { say: W.confirm.cantOpen(folder.name), tone: "you" };
    case "unconfirmed":
      return { say: W.confirm.unconfirmed, tone: "rest" };
    case "not_watched":
      return { say: W.confirm.notWatched, tone: "rest" };
    case "refused":
      return { say: step.refusal ?? W.notDone, tone: "rest" };
    default:
      return null;
  }
}

interface WatchFactsProps {
  email: string | null;
  /** The folder watched until now, where this one takes its place. */
  instead: string | null;
  inside: boolean;
  onInside: (inside: boolean) => void;
  /** Pressed: the switch holds where it is. */
  fixed: boolean;
  /** What became of the press, under the facts. */
  children?: ReactNode;
}

/** The step's facts: whose Drive, the one switch, what comes in first, and what watching means. */
export function WatchFacts({ email, instead, inside, onInside, fixed, children }: WatchFactsProps) {
  return (
    <div className="fo-watch" data-testid="fo-watch">
      {instead ? <p className="fo-watch-says">{W.confirm.instead.body(instead)}</p> : null}
      <dl className="fo-watch-facts">
        <dt>{W.confirm.drive}</dt>
        <dd>{email ?? ""}</dd>
        <dt id="fo-watch-inside">{W.confirm.inside}</dt>
        <dd>
          <Switch
            checked={inside}
            onCheckedChange={onInside}
            readOnly={fixed}
            labelledBy="fo-watch-inside"
            data-testid="fo-watch-inside"
          />
        </dd>
        <dt>{W.confirm.first}</dt>
        <dd>{W.confirm.firstSaid}</dd>
      </dl>
      <p className="fo-watch-fine">{W.confirm.fine}</p>
      {children}
    </div>
  );
}

/** What became of the sheet's press, in one line. */
export function WatchTold({ step, folder }: { step: WatchStep; folder: FolderChoice }) {
  const line = watchToldOf(step, folder);
  if (!line) return null;
  return (
    <p className="fo-told" data-tone={line.tone} role="status" data-testid="fo-watch-told">
      {line.say}
    </p>
  );
}
