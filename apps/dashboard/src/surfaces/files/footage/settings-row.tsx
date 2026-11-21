/**
 * The folder's row in Settings › Connections, pressed (the footage sources plan, P5; the canvas's board "Settings,
 * Connections"). The row itself is one of the page's rows, drawn by the page's own row from its model
 * (connections/model/setup-rows.ts driveRow); here is what its verbs do and the sheets they open: Google's own window,
 * the folder chooser, the last step, a look now, the two ways of letting a folder go, and the folder's own sheet
 * ("See which": what could not come in, each with its reason; the Library's line opens it too).
 *
 * After each press the next step arrives by itself: an account just connected with no folder opens the chooser, and a
 * folder chosen opens the last step. What Google's window came back with, where it connected nothing, is said once
 * under the row.
 */
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import {
  FOOTAGE_SETUP as S,
  FOOTAGE_WORDS as W,
  connectStoppedOf,
  type FootageDto,
  type FootageStanding,
} from "@chanlytics/contracts";
import { checkFolderNow } from "@/bridge/verbs/footage";
import type { FrameFlash } from "../../frame-verbs";
import { RecordRow } from "../../kit/record/row";
import type { FolderChoice } from "./chooser";
import { LazyFolderChooser } from "./chooser-lazy";
import { copyAdminSteps, useFootage } from "./use-footage";

// The sheets are fetched the first time one is opened: a page that only says where the folder stands carries none of them.
const WatchSheet = lazy(() => import("./sheets").then((m) => ({ default: m.WatchSheet })));
const LeaveSheet = lazy(() => import("./sheets").then((m) => ({ default: m.LeaveSheet })));
const FolderSheet = lazy(() => import("./contents").then((m) => ({ default: m.FolderSheet })));

interface FolderRow {
  /** Where the folder stands, for the page's rows; null until it is read. */
  footage: FootageDto | null;
  /** The same, in the words every screen says. */
  standing: FootageStanding | null;
  /** What a verb of the row does, by its name. */
  run: (verb: string) => void;
  /** What Google's window came back with where it connected nothing, said once under the row. */
  note: ReactNode;
  /** The sheets the row's verbs open. */
  sheets: ReactNode;
}

/**
 * The row's verbs and sheets. `sharesGoogle` says another Google connection of this workspace keeps the grant alive at
 * Google once Drive is disconnected, which the sheet says before the press.
 */
export function useFolderRow(flash: (f: FrameFlash) => void, sharesGoogle: boolean): FolderRow {
  const here = useFootage(true);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<FolderChoice | null>(null);
  const [leaving, setLeaving] = useState<"stop" | "disconnect" | null>(null);
  const [contents, setContents] = useState(false);

  // Connected just now, with no folder watched: the chooser arrives by itself, once.
  const wasConnecting = useRef(false);
  const noFolder = !!here.dto?.account && here.dto.account.health === "ok" && !here.dto.folder;
  useEffect(() => {
    if (wasConnecting.current && !here.connecting && here.outcome === null && noFolder) setChoosing(true);
    wasConnecting.current = here.connecting;
  }, [here.connecting, here.outcome, noFolder]);

  const check = async () => {
    const answer = await checkFolderNow();
    flash(answer?.ok ? { msg: <>{W.checked}</> } : { tone: "danger", msg: <>{answer?.message ?? S.notDone}</> });
    void here.again();
  };

  const run = (verb: string) => {
    switch (verb) {
      case "verb:drive-connect":
        return here.connect();
      case "verb:drive-choose":
        return setChoosing(true);
      case "verb:drive-check":
        return void check();
      case "verb:drive-stop":
        return setLeaving("stop");
      case "verb:drive-disconnect":
        return setLeaving("disconnect");
      case "verb:drive-contents":
        return setContents(true);
      case "verb:drive-steps":
        return void copyAdminSteps().then((copied) =>
          flash(copied ? { msg: <>{W.stepsCopied}</> } : { tone: "danger", msg: <>{W.adminSteps}</> }),
        );
      default:
        return undefined;
    }
  };

  const stopped = here.outcome ? connectStoppedOf(here.outcome) : null;
  const note = stopped ? (
    <RecordRow
      id="drive-note"
      testid="drive-note"
      label={W.provider}
      value={stopped.say}
      act={{ label: "Ok", onClick: here.clearOutcome }}
    />
  ) : null;

  // Drawn from the first time one is opened, and kept: a sheet plays its leaving once it is closed.
  const opened = useRef(false);
  opened.current = opened.current || choosing || chosen !== null || leaving !== null || contents;
  const sheets = !opened.current ? null : (
    <Suspense fallback={null}>
      <LazyFolderChooser
        open={choosing}
        email={here.dto?.account?.email ?? null}
        onClose={() => setChoosing(false)}
        onChoose={(folder) => {
          setChoosing(false);
          setChosen(folder);
        }}
      />
      <WatchSheet
        key={chosen?.id ?? "none"}
        folder={chosen}
        footage={here.dto}
        onClose={() => setChosen(null)}
        onAnother={() => {
          setChosen(null);
          setChoosing(true);
        }}
      />
      <LeaveSheet
        kind={leaving}
        footage={here.dto}
        sharesGoogle={sharesGoogle}
        onClose={() => setLeaving(null)}
        onDone={(line) => {
          setLeaving(null);
          flash({ msg: <>{line}</> });
        }}
        onFailed={(message) => flash({ tone: "danger", msg: <>{message}</> })}
      />
      {contents && here.dto ? <FolderSheet footage={here.dto} onClose={() => setContents(false)} /> : null}
    </Suspense>
  );

  return { footage: here.dto, standing: here.standing, run, note, sheets };
}
