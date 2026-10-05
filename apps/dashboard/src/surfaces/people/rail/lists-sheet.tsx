/**
 * On a phone the rail is not drawn, so its lists come up behind one tap on the standing line, as a sheet: the same
 * rows, the same counts and the same New list, and a pick closes it (moved whole from legacy/pages/people.jsx, decision
 * 0015). The kit's Sheet, a phone's small job (`shape="job"`), as People's other phone sheets are: its Esc, its wash,
 * a thumb's pull down and its leaving are the kit's (Base UI's Dialog), and the page's keys hold still behind it while
 * it is open (PL_OVERLAY). It was a sheet of People's own, with its own Esc listener, until 5 Oct 2026. Its rows stand
 * two to a row (clients.css, `.pl-lists`). The page draws its rows only while it is open: it leaves showing the ones it
 * held.
 */
import type { ReactNode } from "react";
import { Sheet } from "../../kit/sheet/sheet";

/** Its word to close it: a list is picked, and nothing is undone. */
const DONE = { word: "Done" };

export function PeopleListsSheet({
  open,
  onClose,
  title = "Lists",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <Sheet
      shape="job"
      open={open}
      onClose={onClose}
      title={title}
      close={DONE}
      className="pl-lists"
      testid="people-lists-sheet"
    >
      {children}
    </Sheet>
  );
}
