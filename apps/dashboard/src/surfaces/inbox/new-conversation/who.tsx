/**
 * A new conversation's first step: who it is for (the design's 4.2). A search and who it finds; someone new is added
 * on People, by its own New (Ruben, 20 Oct 2026: the sheet's Add someone new went). Hookless: the sheet's state is handed in (state.ts), and who matches is the server's answer (People's
 * own search), so the pick finds anyone the workspace holds, not only who the tab has read.
 *
 * Drawn with the kit's Field and Button, and with nothing of People's page: the Pipeline's own pick stays the
 * Pipeline's (people/pipeline/new.tsx), since sharing it pulls People's modules into this sheet's chunk (state.ts says
 * what that costs). The kit's StoppedMark is the kit's, not People's: a person who said stop is marked here as in the
 * Pipeline's pick (the wiring's second audit, R11 S9-3).
 */
import { NEW_CONVERSATION_WORDS as W } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import { focusAsDrawn } from "../../legacy-verbs";
import type { SheetState } from "./state";

/** Who was found: each a press that picks them, with where their deal stands or when they were last heard. */
function found(s: SheetState) {
  const { rows, reading } = s.pick;
  if (!rows.length)
    return (
      <p className="ix-new-said" role={reading ? "status" : undefined} data-testid="ix-new-who-none">
        {reading ? W.reading : W.who.none}
      </p>
    );
  return (
    <ul className="ix-new-rows" data-testid="ix-new-who-list">
      {rows.map((p) => (
        <li key={p.id}>
          <Button variant="quiet" className="ix-new-row" onClick={() => s.choose(p.id)} data-testid="ix-new-who-pick">
            <span className="ix-new-name">{p.name}</span>
            {p.stopped && <StoppedMark testid="ix-new-who-stopped" />}
            <span className="ix-new-said">{p.deal ? p.deal.line : p.lastContact.label}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function NewWho({ s }: { s: SheetState }) {
  return (
    <div className="ix-new" data-testid="ix-new-who">
      <Field
        label={W.who.sub}
        type="search"
        placeholder={W.who.search}
        value={s.pick.q}
        onValueChange={s.pick.setQ}
        // Enter takes the first found, once what is shown answers what was typed: a search is a pick in two keys.
        onKeyDown={(e) => {
          const first = s.pick.rows[0];
          if (e.key !== "Enter" || s.pick.reading || !first) return;
          e.preventDefault();
          s.choose(first.id);
        }}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the sheet opens on its one question; not on a touch screen
        autoFocus={focusAsDrawn()}
        data-testid="ix-new-who-search"
      />
      {found(s)}
    </div>
  );
}
