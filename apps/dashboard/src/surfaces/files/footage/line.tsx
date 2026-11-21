/**
 * The Library's one line for a watched folder (the footage sources plan, P5; the canvas's board "The Library"). Nothing
 * marks a file as "from Drive": it is the business's photo or clip like any other. One line above the list says the
 * one thing worth knowing right now, and it is absent when there is nothing to say. What could not come in and what
 * Drive is still processing are said on it once, quietly (the content loop PRD's F3, F5). A press on it opens what
 * came in, what waits and what was passed over, each with its reason in plain words (contents.tsx, the sheet the row
 * in Settings opens with "See which"); where the line needs its owner, its one act rides on it.
 *
 * It reads where Settings and Content's card read (use-footage.ts), so the three say the same thing of one folder.
 */
import { FOOTAGE_WORDS as W, footageLineOf, type FootageAct } from "@chanlytics/contracts";
import { useFrameToast } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { ListRow } from "../../kit/list-row/list-row";
import { Panel } from "../../kit/panel/panel";
import { useFolderRow } from "./settings-row";
import "./footage.css";

/** What each of the line's acts presses: Google's window, the chooser, or nothing of the line's own. */
const LINE_VERB: Readonly<Partial<Record<FootageAct, string>>> = {
  reconnect: "verb:drive-connect",
  connect_own: "verb:drive-connect",
  choose_another: "verb:drive-choose",
};

/** A line's press, short enough to leave the line its words: "Connect", where the row says "Connect your Google account". */
const lineActWord = (act: FootageAct): string => (act === "connect_own" ? W.acts.connect : W.acts[act]);

/** The line, above the Library's list; nothing where there is nothing to say. */
export function FolderLine() {
  const [toast, flash] = useFrameToast();
  const drive = useFolderRow(flash, false);
  const line = drive.footage && drive.standing ? footageLineOf(drive.footage, drive.standing) : null;
  if (!line || !drive.footage) return <>{drive.note}</>;
  const verb = line.act && drive.footage.can_change ? LINE_VERB[line.act] : undefined;
  const open = () => drive.run("verb:drive-contents");
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
          onClick={open}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              open();
            }
          }}
          data-testid="fo-line-open"
        />
      </Panel>
      {drive.note}
      {drive.sheets}
      {toast}
    </>
  );
}
