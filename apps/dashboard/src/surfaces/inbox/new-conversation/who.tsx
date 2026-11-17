/**
 * A new conversation's first step: who it is for (the design's 4.2). A search and who it finds; someone new is added
 * on People, by its own New (Ruben, 20 Oct 2026: the sheet's Add someone new went). Hookless: the sheet's state is handed in (state.ts), and who matches is the server's answer (People's
 * own search), so the pick finds anyone the workspace holds, not only who the tab has read.
 *
 * Drawn by the kit's person pick (kit/person-pick/), the one New proposal's picker on the Pipeline draws: the same
 * question in the same words, each person their face, their name, the stopped mark where they asked to stop, and where
 * their deal stands or when they were last heard. The kit's, not People's: nothing of People's page comes into this
 * sheet's chunk (state.ts says what that costs).
 */
import { NEW_CONVERSATION_WORDS as W } from "@chanlytics/contracts";
import { PersonPick } from "../../kit/person-pick/person-pick";
import { focusAsDrawn } from "../../frame-verbs";
import type { SheetState } from "./state";

export function NewWho({ s }: { s: SheetState }) {
  const { q, setQ, rows, reading } = s.pick;
  return (
    <PersonPick
      label={W.who.sub}
      placeholder={W.who.search}
      q={q}
      onQ={setQ}
      people={rows}
      onPick={s.choose}
      // Never "no one" while nobody has been read: what is shown is not yet the answer to what was typed.
      none={reading ? W.reading : W.who.none}
      reading={reading}
      // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the sheet opens on its one question; not on a touch screen
      autoFocus={focusAsDrawn()}
      testid="ix-new-who"
    />
  );
}
