/**
 * A desktop's file acts, in the controls row beside Columns, as plain words (Ruben, 9 Oct 2026: the ⋯ that folded them
 * away is gone, so they are seen and one press away): Import, a client list as a file, read in the browser, counted, then
 * written in parts of fifty (import/import-sheet.tsx), for who may; and Export, everyone or the open list from the route,
 * as an attachment so the page stays where it is, owner only, with its gate or the reason it is held. A phone keeps them
 * in its more-menu (phone-menu.ts).
 */
import { Button } from "../../kit/button/button";
import { canDo, gate } from "../../legacy-verbs";
import type { Flash } from "../types";

export function PeopleFileActs({
  canImport,
  onImport,
  exportBlocked,
  exportHref,
  exportName,
  flash,
}: {
  canImport: boolean;
  onImport: () => void;
  /** Why there is no file to take (a list that cannot be counted, or one that is not here), in contracts' own words; else none. */
  exportBlocked: string | null | undefined;
  exportHref: string;
  /** The list the file would hold, when one is open; none, and it holds everyone. */
  exportName: string | null | undefined;
  flash: Flash;
}) {
  const press = !canDo("export")
    ? // A role that may not: the button stays, and a press says why at it (gate's props come last, so its handler is the one that runs).
      { onClick: () => undefined, ...gate("export") }
    : exportBlocked
      ? // A list that can't be counted has no file to take, and the button says why when it is pressed, not only on hover.
        { "data-tip": exportBlocked, onClick: () => flash({ msg: exportBlocked }) }
      : {
          "data-tip": exportName
            ? `Download the people on ${exportName} as a CSV file`
            : "Download everyone as a CSV file",
          onClick: () => window.open(exportHref, "_self"),
        };
  return (
    <div className="pl-file-acts">
      {canImport && (
        <Button variant="quiet" size="sm" onClick={onImport} data-testid="people-import">
          Import
        </Button>
      )}
      <Button variant="quiet" size="sm" data-testid="people-export" {...press}>
        Export
      </Button>
    </div>
  );
}
