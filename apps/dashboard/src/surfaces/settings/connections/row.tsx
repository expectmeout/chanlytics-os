/**
 * One connection, as Settings › Connections draws it (moved from legacy/pages/integrations-real.jsx, decision 0015 step
 * 11): its tile, its name, its state, and one button that says the same word on every connection. Each row said its
 * own verb there (Fix the card, Change the name, Find it, Connect your calendar) beside the number it is attached to,
 * and Ruben, 20 Oct 2026: "each connection should either say connect or disconnect and or settings as different
 * terminology for each connection makes it confusing. do not even expose the numbers on texting etc unless user
 * expands settings".
 *
 * So a connection not joined yet says Connect, and its press is the row's own verb (Meta's sign-up, Google's consent,
 * Find, the email form, the business record). One joined, or on its way, says Settings, which opens in place under its
 * name what it is attached to (the number, the address), what it says about itself, and its own acts by their own
 * names (Messages, Add a card, Check now, Change the name), with Disconnect last where Chanlytics can disconnect it.
 * One joined but not working, with an act that mends it, says Fix in coral instead (Ruben, the same day: "a button
 * that grabs users attention"), and what it opens leads with what is wrong and that act.
 * A row that waits on the owner still says why in a line of its own, and what happened or waits (a code just sent, a
 * sign-up left open) is on the row always. A row with neither (a Later row, a door this deployment lacks) keeps the
 * quiet press beside its name that says what it would be.
 *
 * On a phone a connection is a row of People's kind (25 Sep): the tile, its name, its state, and its button behind the
 * row: a Settings row is its press, whole, with a chevron that turns as it opens; a Connect row keeps its button, in
 * the state's place. On a desktop the button stands in the group's column, as it always has. Rows were 77 to 145px on
 * a phone.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import {
  MESSAGES_ROUTE,
  type ConnectionKind,
  type ConnectionRow as Row,
  type ConnectionVerb,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { canDo, gate, navigate } from "../../legacy-verbs";

const VERB_TESTID: Record<string, string> = {
  "verb:google-check": "google-check",
  "verb:google-connect": "google-connect",
  "verb:google-disconnect": "google-disconnect",
  "verb:whatsapp-connect": "connect-whatsapp-btn",
  messages: "channel-messages",
};
/** What a verb does, for the gate's sentence: the retry of a line carries the line's id, so it is found by its prefix. */
const doingOf = (to: string): string | undefined =>
  VERB_DOING[to] ?? (to.startsWith("verb:retry-line:") ? "set the line up again" : undefined);
const mayPress = (verb: ConnectionVerb | null): boolean =>
  !!verb && (verb.who === "owner" ? canDo("team") : canDo("approve"));
// What a connection's verb does, for the gate's sentence (contracts refusal.ts roleGate).
const VERB_DOING: Record<string, string> = {
  "verb:google-check": "read Google again",
  "verb:google-connect": "connect Google",
  "verb:google-disconnect": "disconnect Google",
  "verb:whatsapp-connect": "connect WhatsApp",
  "verb:business-record": "fill in the business record",
  "verb:email-setup": "set up email",
};
const verbGate = (verb: ConnectionVerb) =>
  mayPress(verb) ? {} : gate(verb.who === "owner" ? "team" : "approve", doingOf(verb.to));

/**
 * The verbs of a joined row that do not mend it: they stay its acts in Settings, and a row that has only one of them,
 * whatever is wrong, is not offered a Fix (its state says who has it).
 */
const NOT_A_MEND = new Set(["verb:google-disconnect", "verb:email-setup", MESSAGES_ROUTE]);

/**
 * The one word a row's button says. Connect where there is a way in from here; Fix, the coral one, where a connection
 * is joined but not working and its verb mends it (Meta's billing page, the record the carriers sent back, a read
 * again, the calendar's link: Ruben, 20 Oct 2026, "a button that grabs users attention"); Settings where there is a
 * connection, or one on its way, with something to look at (`holds`); nothing on a Later row, on a door this
 * deployment does not have, or on a step the row draws under itself (Google's locations to choose among).
 */
type Press = "connect" | "fix" | "settings" | null;
function pressOf(r: Row, holds: boolean): Press {
  if (r.state === "later") return null;
  if (r.verb && (r.state === "none" || r.state === "waiting_you")) return "connect";
  if (r.verb && r.state === "attention" && !NOT_A_MEND.has(r.verb.to)) return "fix";
  if (r.state === "none" || !holds) return null;
  return "settings";
}

/** What a row's detail is, said beside it in its Settings. */
const DETAIL_WORD: Partial<Record<ConnectionKind, string>> = {
  whatsapp: "Number",
  phone: "Number",
  sms: "Number",
  google_profile: "Location",
  google_listing: "Address",
  calendar: "Books with",
  email: "Address",
};

/** A press anywhere on a one-act row presses its act, but for a control of its own, what it opened, or words picked. */
const connRowPress = (e: MouseEvent<HTMLDivElement>) => {
  const row = e && e.currentTarget;
  const t = e && (e.target as Element | null);
  if (!row || !t || !t.closest || !("querySelector" in row)) return;
  if (t.closest("button, a[href], input, select, textarea, [role='button'], .set-row-stack, .set-int-open")) return;
  const picked = typeof window.getSelection === "function" ? window.getSelection() : null;
  if (picked && String(picked)) return;
  const act = row.querySelector<HTMLElement>(".set-int-actions button, .set-int-actions a[href]");
  if (act && typeof act.click === "function") act.click();
};

/** What arming a row is: the listing's Disconnect, or Google's, asked before it is done. */
export interface Arm {
  kind: string;
  what: "remove" | "disconnect";
}

interface ConnectionRowProps {
  r: Row;
  run: (r: Row) => void;
  busy: boolean;
  /** Meta's sign-up window is open: the WhatsApp row's Connect says it is waiting, rather than dim without a word. */
  signup: boolean;
  arm: Arm | null;
  setArm: (a: Arm | null) => void;
  confirm: (what: "remove" | "disconnect") => void;
}

/** One of a row's notes: its words and, where there is somewhere to go, the door after them, in a new tab. */
function noteLine(note: Row["notes"][number], at: number): ReactNode {
  return (
    <span key={`${at}:${note.text}`} data-testid="connection-note">
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
    </span>
  );
}

/** What a row has to say: on the row itself, and in what it opens (its Settings, or the press beside its name). */
function rowSays(r: Row, wants: boolean) {
  // What happened or waits (a sign-up that could not go on, a code just sent, a name Meta declined) is on the row,
  // always: contracts marks it `live`. The rest is explanation, and waits to be asked for.
  const live = r.notes.filter((n) => n.live);
  const asked = r.notes.filter((n) => !n.live);
  const listing = r.kind === "google_listing" && r.group === "connected";
  // A row that waits on the owner already says its sentence in a line of its own.
  const sentence = wants ? "" : r.sentence;
  return { live, asked, listing, sentence, more: !!sentence || asked.length > 0 || listing };
}
type Says = ReturnType<typeof rowSays>;

/** The explanation a row opens: its sentence, the notes it waits to be asked for, and the listing's paragraph. */
function saysMore(r: Row, says: Says): ReactNode {
  if (!says.sentence && says.asked.length === 0 && !says.listing) return null;
  return (
    <span className="set-int-notes">
      {says.sentence ? <span data-testid={`connection-${r.kind}-says`}>{says.sentence}</span> : null}
      {says.asked.map(noteLine)}
      {says.listing ? (
        <span>
          The public listing is read once a day: Google shows five reviews and counts every rating. Connect the Business
          Profile for all of them, and for the replies you send from Reports.
        </span>
      ) : null}
    </span>
  );
}

/**
 * A verb as the kit's button: someone else's page that mends the row (Meta's billing page for a WhatsApp account), in
 * a new tab with nothing of this page's passing with it; one of the page's own verbs, said gated to a role that may
 * not press it (window.gate), never hidden; or a page of the app, which is anyone's to open.
 */
function verbButton(o: {
  r: Row;
  verb: ConnectionVerb;
  label: string;
  variant: "primary" | "secondary";
  run: (r: Row) => void;
  busy: boolean;
  named?: string;
}): ReactNode {
  const { r, verb, label, variant, run, busy, named } = o;
  if (verb.href)
    return (
      <Button
        size="sm"
        variant={variant}
        href={verb.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={named}
        data-testid={`connection-${r.kind}-verb`}
      >
        {label}
      </Button>
    );
  const testid = VERB_TESTID[verb.to] || `connection-${r.kind}-verb`;
  if (verb.to.startsWith("verb:"))
    return (
      <Button
        size="sm"
        variant={variant}
        onClick={() => run(r)}
        disabled={busy}
        aria-label={named}
        data-testid={testid}
        {...verbGate(verb)}
      >
        {label}
      </Button>
    );
  return (
    <Button
      size="sm"
      variant={variant}
      onClick={() => navigate(verb.to)}
      aria-label={named}
      data-testid={testid}
      title={r.kind === "whatsapp" ? "What the receptionist and your campaigns send on this number" : undefined}
    >
      {label}
    </Button>
  );
}

/**
 * The row's button, in the group's column: Connect (the coral primary only on a row that waits on the owner, so a
 * list of connections on offer is not a column of coral), Settings, or, on a Later row, a word and nothing to press.
 */
function rowButton(
  o: ConnectionRowProps & { press: Press; open: boolean; toggle: () => void; panelId: string },
): ReactNode {
  const { r, run, busy, signup, press, open, toggle, panelId } = o;
  const verb = r.verb;
  return (
    <span className="set-int-actions">
      {press === null && r.state === "later" && (
        <span
          className="set-int-soon"
          title="Not built yet. When it is, this row is where you connect it."
          data-testid={`connection-${r.kind}-later`}
        >
          Soon
        </span>
      )}
      {press === "connect" &&
        verb &&
        verbButton({
          r,
          verb,
          label: signup && verb.to === "verb:whatsapp-connect" ? "Waiting for Meta…" : "Connect",
          variant: r.state === "waiting_you" ? "primary" : "secondary",
          run,
          busy,
          named: `Connect ${r.title}`,
        })}
      {press === "settings" && (
        <Button
          size="sm"
          variant="secondary"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${r.title} settings`}
          data-testid={`connection-${r.kind}-settings`}
        >
          Settings
        </Button>
      )}
      {/* Coral until it is open: then the coral is the act inside that mends it, so the page holds one. */}
      {press === "fix" && (
        <Button
          size="sm"
          variant={open ? "secondary" : "primary"}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Fix ${r.title}`}
          data-testid={`connection-${r.kind}-fix`}
        >
          Fix
        </Button>
      )}
    </span>
  );
}

/**
 * What a row's Settings opens, in place under its name: what it is attached to, what it says about itself, and its
 * acts, its own verb by its own name and Disconnect last where Chanlytics can disconnect it (Google's two: the
 * Business Profile's own verb, and the listing, which was Remove). Opened by Fix, it leads with what is wrong and the
 * act that mends it, the coral one, over a hairline, and the rest follows. A question one of them asks stands in
 * their place.
 */
function rowSettings(
  o: ConnectionRowProps & { says: Says; panelId: string; owner: boolean; armed: string | null; fixing: boolean },
): ReactNode {
  const { r, run, busy, setArm, says, panelId, owner, armed, fixing } = o;
  const verb = r.verb;
  const disconnects = verb?.to === "verb:google-disconnect";
  const removable = r.kind === "google_listing" && owner && (r.state === "connected" || r.state === "attention");
  const act =
    verb && !disconnects
      ? verbButton({
          r,
          verb,
          label: busy && verb.to === "verb:google-check" ? "Reading…" : verb.label,
          variant: fixing ? "primary" : "secondary",
          run,
          busy,
        })
      : null;
  return (
    <div className="set-int-open" id={panelId} data-testid={`connection-${r.kind}-about`}>
      {fixing ? (
        <div className="set-int-fix" data-testid={`connection-${r.kind}-problem`}>
          <span className="set-int-problem" data-testid={`connection-${r.kind}-says`}>
            {r.sentence}
          </span>
          {!armed && act}
        </div>
      ) : null}
      {r.detail ? (
        <dl className="set-int-facts">
          <dt>{DETAIL_WORD[r.kind] ?? "Attached to"}</dt>
          <dd data-testid={`connection-${r.kind}-detail`}>{r.detail}</dd>
        </dl>
      ) : null}
      {saysMore(r, fixing ? { ...says, sentence: "" } : says)}
      {!armed && ((act && !fixing) || disconnects || removable) ? (
        <span className="set-acts">
          {fixing ? null : act}
          {disconnects && verb ? (
            <LinkButton
              tone="danger"
              onClick={() => run(r)}
              disabled={busy}
              data-testid="google-disconnect"
              {...verbGate(verb)}
            >
              Disconnect
            </LinkButton>
          ) : null}
          {removable ? (
            <LinkButton
              tone="danger"
              onClick={() => setArm({ kind: r.kind, what: "remove" })}
              disabled={busy}
              data-testid="google-remove"
            >
              Disconnect
            </LinkButton>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The question a row asks before it disconnects, on a line of its own under the row (settings.css, .set-row-ask), as
 * the team's does: in the row's body it stood in what a phone leaves between the tile and the pill.
 */
function rowAsk(o: Pick<ConnectionRowProps, "busy" | "setArm" | "confirm"> & { armed: string | null }): ReactNode {
  const { busy, setArm, confirm, armed } = o;
  if (armed === "remove") {
    return (
      <Confirm
        className="set-row-ask"
        question="Disconnect the listing?"
        detail="What was read from it goes with it."
        yes="Yes, disconnect"
        danger
        busy={busy}
        onYes={() => confirm("remove")}
        onNo={() => setArm(null)}
        testid="google-remove"
      />
    );
  }
  if (armed === "disconnect") {
    return (
      <Confirm
        className="set-row-ask"
        question="Disconnect Google?"
        detail="The public listing stays; replies and the full history do not."
        yes="Yes, disconnect"
        danger
        busy={busy}
        onYes={() => confirm("disconnect")}
        onNo={() => setArm(null)}
        testid="google-disconnect"
      />
    );
  }
  return null;
}

/**
 * The row's words: its name and, for a row that waits on the owner, why, in a line of its own. What happened or waits
 * is said under them, always. A row with no Settings to open keeps the quiet press beside its name that opens what it
 * would say (what Meta or Google asks, what it costs), in place under it (Ruben, 7 Oct 2026: "all extra info should be
 * on a need to know"). In place, never a popover: the kit's stands on a part of Base UI that added 40 KB gzipped to
 * this page for a press most visits never make (measured against main's own build, 8 Oct 2026).
 */
function connectionWords(
  r: Row,
  says: Says,
  wants: boolean,
  about: { shown: boolean; open: boolean; toggle: () => void; id: string },
): ReactNode {
  const asks = about.shown && says.more;
  return (
    <span className="set-team-body">
      <span className="set-int-head">
        <span className="set-team-name">{r.title}</span>
        {asks ? (
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            aria-label={`About ${r.title}`}
            aria-expanded={about.open}
            aria-controls={about.id}
            data-testid={`connection-${r.kind}-why`}
            onClick={about.toggle}
          >
            <Icon name="info" size={13} />
          </Button>
        ) : null}
      </span>
      {wants && r.sentence ? (
        <span className="set-team-mail" data-testid={`connection-${r.kind}-line`}>
          {r.sentence}
        </span>
      ) : null}
      {says.live.length > 0 ? (
        <span className="set-int-notes" data-testid={`connection-${r.kind}-notes`}>
          {says.live.map(noteLine)}
        </span>
      ) : null}
      {asks && about.open ? (
        <span className="set-int-notes" id={about.id} data-testid={about.id}>
          {says.sentence ? <span data-testid={`connection-${r.kind}-says`}>{says.sentence}</span> : null}
          {says.asked.map(noteLine)}
        </span>
      ) : null}
    </span>
  );
}

export const ConnectionRow = (props: ConnectionRowProps) => {
  const { r, busy, arm, setArm, confirm } = props;
  // What the row opens in place: its Settings, or what the press beside its name says.
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((v) => !v);
  const owner = canDo("team");
  const armed = arm && arm.kind === r.kind ? arm.what : null;
  // A row that waits on the owner: its sentence stands in the row, and Connect is the coral primary.
  const wants = r.state === "waiting_you";
  const says = rowSays(r, wants);
  const press = pressOf(r, !!r.detail || says.more || !!r.verb);
  const panelId = `connection-${r.kind}-about`;
  // What the row offers a thumb: its own button where it asks for something (Connect, Fix), the row's press that opens
  // its Settings, or nothing.
  const offers = press === "connect" || press === "fix" ? "primary" : press === "settings" ? "one" : "none";
  const settingsOpen = (press === "settings" || press === "fix") && open;
  return (
    <div
      className="set-int-row"
      data-testid={`connection-${r.kind}`}
      data-state={r.state}
      data-offers={offers}
      data-open={settingsOpen ? "true" : undefined}
      data-asking={armed ? "true" : undefined}
      onClick={offers === "one" ? connRowPress : undefined}
    >
      <Face
        className="set-int-tile"
        data-kind={r.kind}
        data-on={r.group === "connected" ? "true" : undefined}
        glyph={<Icon name={r.icon} size={15} />}
      />
      {connectionWords(r, says, wants, { shown: press === "connect" || press === null, open, toggle, id: panelId })}
      <StatePill kind="tone" value={r.tone} label={r.stateWords} />
      {rowButton({ ...props, press, open: settingsOpen, toggle, panelId })}
      {offers === "one" && (
        <span className="set-int-chev" aria-hidden="true">
          <Icon name="chevron" size={11} />
        </span>
      )}
      {settingsOpen && rowSettings({ ...props, says, panelId, owner, armed, fixing: press === "fix" })}
      {rowAsk({ busy, setArm, confirm, armed })}
    </div>
  );
};
