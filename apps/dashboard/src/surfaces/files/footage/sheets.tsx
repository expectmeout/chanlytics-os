/**
 * The sheets a watched folder opens outside a conversation (the footage sources plan, P5): the last step, as the row
 * in Settings and Content's card take it, and the two ways of letting a folder go. Each says what it does before the
 * press and never after: stopping leaves the account connected, disconnecting drops Chanlytics' key at once, and what
 * came in stays either way.
 */
import { useEffect, useState } from "react";
import {
  CONTENT_LIBRARY_ROUTE,
  FOOTAGE_SETUP as W,
  type FootageCountsDto,
  type FootageDto,
} from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { disconnectDrive, removeFolderFiles, stopFolderWatch } from "@/bridge/verbs/footage";
import { navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import type { FolderChoice } from "./chooser";
import { stopWordsOf } from "./leave-words";
import { readFootageAgain } from "./use-footage";
import { WatchFacts, WatchTold, useWatchStep } from "./watch-confirm";

const LEAVE_CLOSE = { label: W.chooser.close, glyph: <Icon name="x" size={13} /> };

interface WatchSheetProps {
  /** The folder chosen; null closes the sheet. */
  folder: FolderChoice | null;
  footage: FootageDto | null;
  onClose: () => void;
  /** Back to the chooser, for another folder. */
  onAnother: () => void;
}

/** The last step in a sheet: the folder's facts, its one switch, and the press. */
export function WatchSheet({ folder, footage, onClose, onAnother }: WatchSheetProps) {
  // The folder watched until now, where this one would take its place (one folder a workspace).
  const watched = footage?.folder && footage.folder.state !== "stopped" ? footage.folder : null;
  const instead = watched && folder && watched.provider_id !== folder.id ? watched.name : null;
  const step = useWatchStep(folder, instead !== null);
  if (!folder) return null;
  const press = () => {
    switch (step.state) {
      case "starting":
        return (
          <Button variant="primary" disabled data-testid="fo-watch-press">
            {W.confirm.starting}
          </Button>
        );
      case "done":
        return (
          <Button
            onClick={() => {
              onClose();
              navigate(CONTENT_LIBRARY_ROUTE);
            }}
            data-testid="fo-watch-library"
          >
            {W.confirm.openLibrary}
          </Button>
        );
      case "shut":
        return (
          <Button variant="primary" onClick={onAnother} data-testid="fo-watch-another">
            {W.confirm.another}
          </Button>
        );
      case "unconfirmed":
        return (
          <Button variant="primary" onClick={() => void step.check()} data-testid="fo-watch-check">
            {W.confirm.check}
          </Button>
        );
      default:
        return (
          <>
            <Button variant="primary" onClick={() => void step.watch()} data-testid="fo-watch-press">
              {instead ? W.confirm.instead.press : W.confirm.press}
            </Button>
            <Button variant="quiet" onClick={onAnother} data-testid="fo-watch-another">
              {W.confirm.another}
            </Button>
          </>
        );
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={instead ? W.confirm.instead.title(folder.name) : W.confirm.title(folder.name)}
      close={LEAVE_CLOSE}
      foot={<div data-foot-pair="">{press()}</div>}
      flatFoot
      fit
      testid="fo-watch-sheet"
    >
      <WatchFacts
        email={footage?.account?.email ?? null}
        instead={instead}
        inside={step.inside}
        onInside={step.setInside}
        fixed={step.state === "starting" || step.state === "done"}
      >
        <WatchTold step={step} folder={folder} />
      </WatchFacts>
    </Sheet>
  );
}

/** What letting go would leave, as the server counts it; null until it is read, or where it could not be. */
interface Leaving {
  files: number;
  away: number;
  /** Of them, the ones a post or a video used: they stay even when what came is removed too. */
  used: number;
}

interface LeaveSheetProps {
  /** Which letting go: the folder alone, or the account. Null closes the sheet. */
  kind: "stop" | "disconnect" | null;
  footage: FootageDto | null;
  /** Whether another Google connection of this workspace keeps the grant alive at Google (a mailbox, a Business Profile). */
  sharesGoogle: boolean;
  onClose: () => void;
  /** Done: what to say once, and nothing else to do (the folder is read again here). */
  onDone: (said: string) => void;
  onFailed: (why: string) => void;
}

/** What letting go would leave, read as the sheet opens; null until it answers, and where it could not. */
function useLeaving(kind: LeaveSheetProps["kind"]): Leaving | null {
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  useEffect(() => {
    if (!kind) return undefined;
    let live = true;
    setLeaving(null);
    read("GET sources/leaving").then(
      (answer) => {
        if (live) setLeaving({ files: answer.files, away: answer.away, used: answer.used });
      },
      // Uncounted, the sheet still says what the press does: the counts are what it adds where it can.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [kind]);
  return leaving;
}

/** The press of the leave sheet: removes what came first where asked, then stops or disconnects, and says so once. */
function useLeaveGo(
  kind: "stop" | "disconnect",
  alsoRemove: boolean,
  { onDone, onFailed }: Pick<LeaveSheetProps, "onDone" | "onFailed">,
): { busy: boolean; go: () => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const removed = alsoRemove ? await removeFolderFiles() : null;
    if (alsoRemove && !removed?.ok) {
      setBusy(false);
      return onFailed(removed?.message ?? W.notDone);
    }
    const answer = await (kind === "stop" ? stopFolderWatch() : disconnectDrive());
    setBusy(false);
    if (!answer?.ok) return onFailed(answer?.message ?? W.notDone);
    await readFootageAgain();
    const done = kind === "stop" ? W.stop.done : W.disconnect.done;
    return onDone(removed?.ok ? `${done} ${W.removeToo.done(removed.data.removed)}` : done);
  };
  return { busy, go };
}

/** The sheet's title and its two presses, for the question it is on: letting go, or removing what came too. */
function leaveWordsOf(kind: "stop" | "disconnect", removing: Leaving | null, name: string) {
  const words = kind === "stop" ? W.stop : W.disconnect;
  if (removing)
    return {
      title: W.removeToo.title(removing.files),
      press: W.removeToo.press(removing.files - removing.used),
      keep: W.removeToo.keep,
      danger: true,
    };
  return {
    title: kind === "stop" ? W.stop.title(name) : W.disconnect.title,
    press: words.press,
    keep: words.keep,
    danger: kind === "disconnect",
  };
}

/**
 * Stop watching, or Disconnect: one question each, with what stays and what stops said first. "Remove what came from it
 * too" (the canvas's Settings 19) turns the sheet to a second question; its press removes, then lets go, as one.
 */
export function LeaveSheet({ kind, footage, sharesGoogle, onClose, onDone, onFailed }: LeaveSheetProps) {
  const leaving = useLeaving(kind);
  const [alsoRemove, setAlsoRemove] = useState(false);
  useEffect(() => setAlsoRemove(false), [kind]);
  const { busy, go } = useLeaveGo(kind ?? "stop", alsoRemove, { onDone, onFailed });
  if (!kind) return null;
  const removing = alsoRemove ? leaving : null;
  const wording = leaveWordsOf(kind, removing, footage?.folder?.name ?? "");
  const removable = leaving ? leaving.files - leaving.used : 0;
  return (
    <Sheet
      open
      onClose={onClose}
      title={wording.title}
      close={LEAVE_CLOSE}
      foot={
        <div data-foot-pair="">
          <Button
            variant="secondary"
            tone={wording.danger ? "danger" : undefined}
            disabled={busy}
            onClick={() => void go()}
            data-testid="fo-leave-go"
          >
            {wording.press}
          </Button>
          <Button variant="quiet" onClick={removing ? () => setAlsoRemove(false) : onClose} data-testid="fo-leave-keep">
            {wording.keep}
          </Button>
        </div>
      }
      flatFoot
      fit
      testid="fo-leave-sheet"
    >
      {removing ? (
        <div className="fo-leave" data-kind="remove">
          <p>{W.removeToo.say(removing.used)}</p>
        </div>
      ) : (
        <LeaveSaid
          kind={kind}
          counts={footage?.folder?.counts ?? null}
          leaving={leaving}
          sharesGoogle={sharesGoogle}
          onRemoveToo={removable > 0 ? () => setAlsoRemove(true) : null}
        />
      )}
    </Sheet>
  );
}

/**
 * What letting go leaves, said before the press, and the quiet way to remove what came too where there is any. Stopping
 * says the folder's own count, the one its row says (the content loop PRD's F4), and that its clips kept in Drive still
 * play (F1); disconnecting says what every folder of the account leaves, which no longer plays.
 */
function LeaveSaid({
  kind,
  counts,
  leaving,
  sharesGoogle,
  onRemoveToo,
}: {
  kind: "stop" | "disconnect";
  counts: FootageCountsDto | null;
  leaving: Leaving | null;
  sharesGoogle: boolean;
  onRemoveToo: (() => void) | null;
}) {
  const stop = kind === "stop" ? stopWordsOf(counts ?? { in: 0, away: 0 }) : null;
  return (
    <div className="fo-leave" data-kind={kind}>
      <p>{stop ? stop.stays : W.disconnect.drops}</p>
      {stop?.away ? <p>{stop.away}</p> : null}
      {!stop && leaving && leaving.away > 0 ? <p data-strong="true">{W.disconnect.away(leaving.away)}</p> : null}
      {kind === "disconnect" && sharesGoogle ? <p>{W.disconnect.google}</p> : null}
      {onRemoveToo ? (
        <div className="fo-leave-also">
          <Button variant="plain" size="sm" onClick={onRemoveToo} data-testid="fo-leave-remove-too">
            {W.removeToo.link}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
