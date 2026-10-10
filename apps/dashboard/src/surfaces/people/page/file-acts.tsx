/**
 * People's Export, a word wherever it stands: a desktop's controls row beside Columns (Ruben, 9 Oct 2026: the ⋯ that
 * folded it away is gone, so it is seen and one press away) and a phone's bar beside Select and Sort (10 Oct 2026, for
 * the same reason). Everyone or the open list, from the route, as an attachment so the page stays where it is, owner
 * only, with its gate or the reason it is held. Import is the page's act now, Add people (import/import-sheet.tsx).
 */
import { Button } from "../../kit/button/button";
import { canDo, gate } from "../../legacy-verbs";
import type { Flash } from "../types";

export function PeopleFileActs({
  exportBlocked,
  exportHref,
  exportName,
  flash,
}: {
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
      <Button variant="quiet" size="sm" data-testid="people-export" {...press}>
        Export
      </Button>
    </div>
  );
}
