/**
 * A new conversation's first step: who it is for (the design's 4.2). A search, who it finds, and Add someone new, by
 * name and number. Hookless: the sheet's state is handed in (state.ts), and who matches is the server's answer (People's
 * own search), so the pick finds anyone the workspace holds, not only who the tab has read.
 *
 * Drawn with the kit's Field and Button, and with nothing of People's page: the Pipeline's own pick stays the
 * Pipeline's (people/pipeline/new.tsx), since sharing it pulls People's modules into this sheet's chunk (state.ts says
 * what that costs).
 */
import { NEW_CONVERSATION_WORDS as W } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
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
            <span className="ix-new-said">{p.deal ? p.deal.line : p.lastContact.label}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Someone new, by name and number: the fields, or the way to open them. */
function adding(s: SheetState) {
  const { add, setAdd } = s.pick;
  if (!add.open)
    return (
      <div className="ix-new-acts">
        <LinkButton onClick={s.openAdd} data-testid="ix-new-who-add-open">
          <Icon name="plus" size={12} /> {W.who.add}
        </LinkButton>
      </div>
    );
  const wrong = add.error ? { problem: add.error, problemGlyph: <Icon name="notice" size={12} /> } : {};
  return (
    <section className="ix-new-part" data-testid="ix-new-who-add">
      <Field
        label={`${W.who.name} (${W.who.optional})`}
        value={add.name}
        onValueChange={(name) => setAdd((x) => ({ ...x, name }))}
        maxLength={80}
        readOnly={add.busy}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the fields open on a press that asked for them
        autoFocus
        data-testid="ix-new-who-name"
      />
      <Field
        label={W.who.number}
        type="tel"
        inputMode="tel"
        value={add.phone}
        onValueChange={(phone) => setAdd((x) => ({ ...x, phone, error: null }))}
        maxLength={24}
        readOnly={add.busy}
        onKeyDown={(e) => {
          if (e.key === "Enter") void s.addSomeone();
        }}
        {...wrong}
        data-testid="ix-new-who-phone"
      />
      <div className="ix-new-acts">
        <Button
          variant="primary"
          size="sm"
          disabled={add.busy || !add.phone.trim()}
          onClick={() => void s.addSomeone()}
          data-testid="ix-new-who-go"
        >
          {add.busy ? W.who.adding : W.who.go}
        </Button>
      </div>
    </section>
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
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the sheet opens on its one question
        autoFocus
        data-testid="ix-new-who-search"
      />
      {found(s)}
      {adding(s)}
    </div>
  );
}
