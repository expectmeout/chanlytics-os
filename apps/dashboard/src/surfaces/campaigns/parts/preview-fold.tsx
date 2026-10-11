/**
 * The message, folded under its first words (Ruben, 11 Oct 2026: "make the preview something you expand to see, so the
 * drawer cards can be more compact without scrolling up and down"): one row of the kit's fold (RecordDisclosure), the
 * chat glyph and the message's first two lines as its person reads them, and a press opens the preview itself -- the walk
 * over it, the bubble, its buttons. The composers, the send screen and a campaign's drawer each stood a whole chat frame
 * tall, and the acts under it a scroll away.
 *
 * It opens by itself while something in it must be seen (`open`: a slot still to be typed, which stops the save).
 */
import type { ReactNode } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { mpFill } from "./message-preview";

interface CmPreviewFoldProps {
  /** The fold's id, unique on the page: its press and its region are named from it. */
  id: string;
  /** The message's words and what fills them, for the first lines the closed fold shows. */
  body: string | null | undefined;
  values?: readonly unknown[] | null;
  /** Held open while something in it must be seen; the row's own again after. */
  open?: boolean;
  testid: string;
  children: ReactNode;
}

/**
 * The first words of a message, one line of them: its line breaks are spaces in a row of two lines, and a slot filled per
 * person where it is sent (a visit's time) is "…" here, where the open bubble shows the hole by its number.
 */
const excerptOf = (body: string | null | undefined, values?: readonly unknown[] | null): string =>
  mpFill(body, values)
    .replace(/\{\{\d+\}\}/g, "…")
    .replace(/\s+/g, " ")
    .trim();

export function CmPreviewFold({ id, body, values = null, open = false, testid, children }: CmPreviewFoldProps) {
  const S = LIFECYCLE_WORDS.compose.sentence;
  return (
    <div className="cm-msg-fold" role="group" aria-label={S.previewLabel} data-testid={testid}>
      <RecordDisclosure
        id={id}
        forceOpen={open}
        testid={`${testid}-fold`}
        label={
          <span className="cm-fold-label">
            <Icon name="chat" size={13} />
            <span className="cm-fold-shut">{excerptOf(body, values)}</span>
            <span className="cm-fold-open">{S.previewOpen}</span>
          </span>
        }
      >
        {children}
      </RecordDisclosure>
    </div>
  );
}
