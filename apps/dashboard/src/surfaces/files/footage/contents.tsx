/**
 * The folder's sheet (the footage sources plan, P5; the content loop PRD's F3): what came in, what waits and what
 * could not come in, each with its count and its reason in plain words, and its two quiet acts. Opened from the
 * Library's line and, with "See which", from the row in Settings, so a clip that could not come in is never only in
 * one place. Fetched the first time it is opened (settings-row.tsx).
 */
import { useEffect, useState } from "react";
import {
  FOOTAGE_SETUP as S,
  FOOTAGE_WORDS as W,
  footageSheetOf,
  type FootageDto,
  type FootagePassedDto,
} from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { checkFolderNow } from "@/bridge/verbs/footage";
import { navigate, useFrameToast } from "../../frame-verbs";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Sheet } from "../../kit/sheet/sheet";
import { DRIVE_SETTINGS_ROUTE } from "./use-footage";

/** What the folder holds that is not in the Library, read as the sheet opens; null until it answers. */
function usePassed(): FootagePassedDto[] | null {
  const [passed, setPassed] = useState<FootagePassedDto[] | null>(null);
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
  return passed;
}

/** The folder's sheet: what came in, what waits and what was passed over, and its two quiet acts. */
export function FolderSheet({ footage, onClose }: { footage: FootageDto; onClose: () => void }) {
  const passed = usePassed();
  const [toast, flash] = useFrameToast();
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
