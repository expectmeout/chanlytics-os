/**
 * The Library's one line for a watched folder (the footage sources plan, P5; the canvas's board "The Library"). Nothing
 * marks a file as "from Drive": it is the business's photo or clip like any other. One line above the list says the
 * one thing worth knowing right now, and it is absent when there is nothing to say. A press on it opens what came
 * in, what waits and what was passed over, each with its reason in plain words; where the line needs its owner, its
 * one act rides on it.
 *
 * It reads where Settings and Content's card read (use-footage.ts), so the three say the same thing of one folder.
 */
import { useEffect, useState } from "react";
import {
  FOOTAGE_SETUP as S,
  FOOTAGE_WORDS as W,
  footageLineOf,
  footageSheetOf,
  type FootageAct,
  type FootageDto,
  type FootagePassedDto,
} from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { checkFolderNow } from "@/bridge/verbs/footage";
import { navigate, useFrameToast } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { Panel } from "../../kit/panel/panel";
import { Sheet } from "../../kit/sheet/sheet";
import { useFolderRow } from "./settings-row";
import { DRIVE_SETTINGS_ROUTE } from "./use-footage";
import "./footage.css";

/** What each of the line's acts presses: Google's window, the chooser, or nothing of the line's own. */
const LINE_VERB: Readonly<Partial<Record<FootageAct, string>>> = {
  reconnect: "verb:drive-connect",
  connect_own: "verb:drive-connect",
  choose_another: "verb:drive-choose",
};

/** A line's press, short enough to leave the line its words: "Connect", where the row says "Connect your Google account". */
const lineActWord = (act: FootageAct): string => (act === "connect_own" ? W.acts.connect : W.acts[act]);

/** The folder's sheet: what came in, what waits and what was passed over, and its two quiet acts. */
function FolderSheet({ footage, onClose }: { footage: FootageDto; onClose: () => void }) {
  const [passed, setPassed] = useState<FootagePassedDto[] | null>(null);
  const [toast, flash] = useFrameToast();
  useEffect(() => {
    let live = true;
    read("GET sources/contents").then(
      (answer) => {
        if (live) setPassed(answer.rows);
      },
      // Uncounted, the sheet still says what is in the Library: the rest is what it adds where it can.
      () => {
        if (live) setPassed([]);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  const check = async () => {
    const answer = await checkFolderNow();
    flash(answer?.ok ? { msg: <>{W.checked}</> } : { tone: "danger", msg: <>{answer?.message ?? S.notDone}</> });
  };
  const rows = footageSheetOf(footage, passed ?? []);
  return (
    <Sheet
      open
      onClose={onClose}
      title={footage.folder?.name ?? W.provider}
      sub={S.chooser.sub(footage.account?.email ?? null)}
      close={{ label: S.chooser.close, glyph: <Icon name="x" size={13} /> }}
      foot={
        <div data-foot-acts="">
          {footage.can_change && footage.folder?.state === "watching" ? (
            <LinkButton onClick={() => void check()} data-testid="fo-sheet-check">
              {W.check}
            </LinkButton>
          ) : null}
          <LinkButton
            onClick={() => {
              onClose();
              navigate(DRIVE_SETTINGS_ROUTE);
            }}
            data-testid="fo-sheet-connections"
          >
            {W.openConnections}
          </LinkButton>
        </div>
      }
      flatFoot
      fit
      testid="fo-sheet"
    >
      <dl className="fo-rows" aria-busy={passed === null} data-testid="fo-sheet-rows">
        {rows.map((row) => (
          <div key={row.key} className="fo-row-said" data-testid={`fo-sheet-${row.key}`}>
            <dt>{row.head}</dt>
            <dd>{row.count.toLocaleString("en-US")}</dd>
            {row.say ? <p>{row.say}</p> : null}
          </div>
        ))}
      </dl>
      {toast}
    </Sheet>
  );
}

/** The line, above the Library's list; nothing where there is nothing to say. */
export function FolderLine() {
  const [toast, flash] = useFrameToast();
  const drive = useFolderRow(flash, false);
  const [open, setOpen] = useState(false);
  const line = drive.footage && drive.standing ? footageLineOf(drive.footage, drive.standing) : null;
  if (!line || !drive.footage) return <>{drive.note}</>;
  const verb = line.act && drive.footage.can_change ? LINE_VERB[line.act] : undefined;
  return (
    <>
      <Panel className="fo-line" variant="inset" size="flush" data-tone={line.tone} data-testid="fo-line">
        <ListRow
          mark={<Icon name={line.glyph === "alert" ? "alert" : line.glyph} size={15} />}
          name={line.head}
          // The line's second words wrap rather than cut: "8 wait until some are removed" is what it is there to say.
          said={(place) => <div className={`${place} fo-line-said`}>{line.sub}</div>}
          end={(place) =>
            verb && line.act ? (
              <Button
                className={place}
                size="sm"
                variant="primary"
                onClick={(event) => {
                  event.stopPropagation();
                  drive.run(verb);
                }}
                data-testid="fo-line-act"
              >
                {lineActWord(line.act)}
              </Button>
            ) : (
              <span className={place} aria-hidden="true">
                <Icon name="chevron" size={11} />
              </span>
            )
          }
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          data-testid="fo-line-open"
        />
      </Panel>
      {drive.note}
      {open ? <FolderSheet footage={drive.footage} onClose={() => setOpen(false)} /> : null}
      {drive.sheets}
      {toast}
    </>
  );
}
