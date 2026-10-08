/**
 * What a connection says beyond its name and its state, as a popover from the quiet press beside its name (row.tsx
 * AboutPress): the sentence about it, what Meta or Google holds, and the doors to their pages.
 *
 * A module of its own, which the row fetches when the press is first reached (row.tsx loadRowAbout): the kit's popover
 * stands on a part of Base UI no other pane of Settings draws, and imported by the row it added 40 KB gzipped to the
 * Settings page for a press most visits never make (measured against main's own build, 8 Oct 2026).
 */
import type { ReactElement } from "react";
import type { ConnectionRow as Row } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { Popover } from "../../kit/popover/popover";

interface RowAboutProps {
  r: Row;
  /** The row's press, which opens it: the kit's Button, as the row draws it before this has loaded. */
  trigger: ReactElement;
  /** The press came before this had loaded: drawn open, so the press opens what it asked for. */
  openFirst: boolean;
}

export function RowAbout({ r, trigger, openFirst }: RowAboutProps) {
  const listing = r.kind === "google_listing" && r.group === "connected";
  return (
    <Popover
      label={`About ${r.title}`}
      align="start"
      className="set-int-about"
      trigger={trigger}
      defaultOpen={openFirst}
    >
      {r.sentence ? <p data-testid={`connection-${r.kind}-says`}>{r.sentence}</p> : null}
      {r.notes.map((note, at) => (
        <p key={`${at}:${note.text}`} data-testid="connection-note">
          <span data-testid="connection-note-text">{note.text}</span>
          {note.link && (
            <>
              {" "}
              {/* Both go to Meta's own pages: a new tab, and nothing of this page's passes with it. */}
              <LinkButton
                href={note.link.href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="connection-note-link"
              >
                {note.link.label}
              </LinkButton>
            </>
          )}
        </p>
      ))}
      {listing ? (
        <p>
          The public listing is read once a day: Google shows five reviews and counts every rating. Connect the Business
          Profile for all of them, and for the replies you send from Reports.
        </p>
      ) : null}
    </Popover>
  );
}
