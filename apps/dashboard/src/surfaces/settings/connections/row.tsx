/**
 * One connection, as Settings › Connections draws it (moved from legacy/pages/integrations-real.jsx, decision 0015 step
 * 11): its tile, its name beside what it is attached to, its state, and its one act. What else it would say (the
 * sentence about it, what Meta or Google holds) waits behind a quiet press beside its name (connectionWords), unless it waits
 * on the owner, when it says why in a line of its own.
 *
 * On a phone a connection is a row of People's kind (25 Sep): the tile, its name over what it is attached to, its state,
 * and its acts behind the row rather than on a line of boxed buttons under it. A row with one act is that act's press,
 * whole, with a chevron; a row with two (the listing's Check now and Remove) keeps them in its ⋯, where Remove no longer
 * sits a thumb's width from Check now. A row that wants something (Connect Google) keeps its button. On a desktop the
 * acts stand in the group's column, as they always have. Rows were 77 to 145px on a phone.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import type { ConnectionRow as Row, ConnectionVerb } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { StatePill } from "../../kit/pill/state-pill";
import { canDo, gate, navigate } from "../../legacy-verbs";

const VERB_TESTID: Record<string, string> = {
  "verb:google-check": "google-check",
  "verb:google-connect": "google-connect",
  "verb:google-disconnect": "google-disconnect",
  "verb:whatsapp-connect": "connect-whatsapp-btn",
  messages: "channel-messages",
};
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

/** A press anywhere on a one-act row presses its act, but for a control of its own, a form under it, or words picked. */
const connRowPress = (e: MouseEvent<HTMLDivElement>) => {
  const row = e && e.currentTarget;
  const t = e && (e.target as Element | null);
  if (!row || !t || !t.closest || !("querySelector" in row)) return;
  if (t.closest("button, a[href], input, select, textarea, [role='button'], .set-row-stack")) return;
  const picked = typeof window.getSelection === "function" ? window.getSelection() : null;
  if (picked && String(picked)) return;
  // Its act is a button, or a door drawn as one (a page of Meta's that mends the row).
  const act = row.querySelector<HTMLElement>(".set-int-actions button, .set-int-actions a[href]");
  if (act && typeof act.click === "function") act.click();
};

/** What arming a row is: the listing's Remove, or Google's Disconnect, asked before it is done. */
export interface Arm {
  kind: string;
  what: "remove" | "disconnect";
}

interface ConnectionRowProps {
  r: Row;
  run: (r: Row) => void;
  busy: boolean;
  /** Meta's sign-up window is open: the WhatsApp row's act says it is waiting, rather than dim without a word. */
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

/** What a row has to say: on the row itself, and behind the press beside its name. */
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

/**
 * The row's acts in its column, each the kit's own (a tinted pill of the page's own stood here, and quiet links of
 * People's): one Button a row. It is the coral primary only on a row that waits on the owner (a card to fix); a
 * connection on offer is the plain capsule, so a list of them is not a column of coral; a door on a row that works is
 * quiet. A connection not built yet says so in a word and offers nothing to press.
 */
function rowActs(o: ConnectionRowProps & { owner: boolean; armed: string | null; loud: boolean }): ReactNode {
  const { r, run, busy, signup, setArm, owner, armed, loud } = o;
  const verb = r.verb;
  const variant = loud ? "primary" : "secondary";
  return (
    <span className="set-int-actions">
      {r.kind === "google_listing" && owner && !armed && (r.state === "connected" || r.state === "attention") && (
        <LinkButton
          tone="danger"
          onClick={() => setArm({ kind: r.kind, what: "remove" })}
          disabled={busy}
          data-testid="google-remove"
        >
          Remove
        </LinkButton>
      )}
      {!verb && !armed && r.state === "later" && (
        <span
          className="set-int-soon"
          title="Not built yet. When it is, this row is where you connect it."
          data-testid={`connection-${r.kind}-later`}
        >
          Soon
        </span>
      )}
      {/* A verb the role may not press stays on the row and says why (window.gate);
          it used to be hidden, with no word. A page to open is anyone's to open. */}
      {verb &&
        !armed &&
        (verb.href ? (
          // Someone else's page that mends the row (Meta's billing page for a WhatsApp account): a door, drawn as the row's
          // act, in a new tab, with nothing of this page's passing with it.
          <Button
            size="sm"
            variant={variant}
            href={verb.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`connection-${r.kind}-verb`}
          >
            {verb.label}
          </Button>
        ) : verb.to.startsWith("verb:") ? (
          <Button
            size="sm"
            variant={variant}
            onClick={() => run(r)}
            disabled={busy}
            data-testid={VERB_TESTID[verb.to] || `connection-${r.kind}-verb`}
            {...(mayPress(verb) ? {} : gate(verb.who === "owner" ? "team" : "approve", VERB_DOING[verb.to]))}
          >
            {busy && verb.to === "verb:google-check"
              ? "Reading…"
              : signup && verb.to === "verb:whatsapp-connect"
                ? "Waiting for Meta…"
                : verb.label}
          </Button>
        ) : (
          <Button
            size="sm"
            variant={loud ? "primary" : r.state === "none" ? "secondary" : "quiet"}
            onClick={() => navigate(verb.to)}
            data-testid={VERB_TESTID[verb.to] || `connection-${r.kind}-verb`}
            title={r.kind === "whatsapp" ? "What the receptionist and your campaigns send on this number" : undefined}
          >
            {verb.label}
          </Button>
        ))}
    </span>
  );
}

/**
 * The question a row asks before Remove and before Disconnect, on a line of its own under the row (settings.css,
 * .set-row-ask), as the team's does: in the row's body it stood in what a phone leaves between the tile and the pill.
 */
function rowAsk(o: Pick<ConnectionRowProps, "busy" | "setArm" | "confirm"> & { armed: string | null }): ReactNode {
  const { busy, setArm, confirm, armed } = o;
  if (armed === "remove") {
    return (
      <Confirm
        className="set-row-ask"
        question="Remove the listing?"
        detail="What was read from it goes with it."
        yes="Yes, remove"
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
 * The row's words: its name beside what it is attached to and, for a row that waits on the owner, why, in a line of
 * its own. What happened or waits is said under them, always. What else it would say (the sentence about it, what Meta
 * or Google asks and holds, the doors to their pages) opens in place under its name from one quiet press beside it:
 * the page drew all of it under every name, four lines to a row and a paragraph at a card's foot (Ruben, 7 Oct 2026:
 * "all extra info should be on a need to know"). In place, never a popover: the kit's stands on a part of Base UI
 * that added 40 KB gzipped to this page for a press most visits never make, and fetched on demand it made the bundler
 * regroup what seven other pages share (measured against main's own build, 8 Oct 2026).
 */
function connectionWords(r: Row, wants: boolean, about: { open: boolean; toggle: () => void }): ReactNode {
  const says = rowSays(r, wants);
  const aboutId = `connection-${r.kind}-about`;
  return (
    <span className="set-team-body">
      <span className="set-int-head">
        <span className="set-team-name">
          {r.title}
          {r.detail ? (
            <span className="dim set-int-detail">
              <span className="set-int-sep"> · </span>
              {r.detail}
            </span>
          ) : null}
        </span>
        {says.more ? (
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            aria-label={`About ${r.title}`}
            aria-expanded={about.open}
            aria-controls={aboutId}
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
      {says.more && about.open ? (
        <span className="set-int-notes" id={aboutId} data-testid={aboutId}>
          {says.sentence ? <span data-testid={`connection-${r.kind}-says`}>{says.sentence}</span> : null}
          {says.asked.map(noteLine)}
          {says.listing ? (
            <span>
              The public listing is read once a day: Google shows five reviews and counts every rating. Connect the
              Business Profile for all of them, and for the replies you send from Reports.
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

export const ConnectionRow = (props: ConnectionRowProps) => {
  const { r, run, busy, arm, setArm, confirm } = props;
  // What the row says besides, opened in place by the press beside its name (connectionWords).
  const [aboutOpen, setAboutOpen] = useState(false);
  const owner = canDo("team");
  const armed = arm && arm.kind === r.kind ? arm.what : null;
  const primary = r.state === "none" || r.state === "waiting_you";
  // A row that waits on the owner: its one act is the coral primary, and its sentence stands in the row.
  const wants = r.state === "waiting_you" || r.state === "attention";
  const loud = r.state === "waiting_you";
  const removable =
    r.kind === "google_listing" && owner && !armed && (r.state === "connected" || r.state === "attention");
  const verb = r.verb;
  const verbGate = verb && !mayPress(verb) ? gate(verb.who === "owner" ? "team" : "approve", VERB_DOING[verb.to]) : {};
  const press = verb
    ? () =>
        verb.href
          ? window.open(verb.href, "_blank", "noopener,noreferrer")
          : verb.to.startsWith("verb:")
            ? run(r)
            : navigate(verb.to)
    : null;
  // What the row offers a thumb: nothing (a Later row, a row asking a question), its one act, or a menu of two.
  const acts = [
    ...(removable ? [{ label: "Remove", danger: true, onClick: () => setArm({ kind: r.kind, what: "remove" }) }] : []),
    ...(verb && !armed && press ? [{ label: verb.label, onClick: press, gate: verbGate }] : []),
  ];
  const offers =
    armed || r.state === "later"
      ? "none"
      : verb && primary
        ? "primary"
        : acts.length > 1
          ? "menu"
          : acts.length === 1
            ? "one"
            : "none";
  return (
    <div
      className="set-int-row"
      data-testid={`connection-${r.kind}`}
      data-state={r.state}
      data-offers={offers}
      data-asking={armed ? "true" : undefined}
      onClick={offers === "one" ? connRowPress : undefined}
    >
      <Face
        className="set-int-tile"
        data-kind={r.kind}
        data-on={r.group === "connected" ? "true" : undefined}
        glyph={<Icon name={r.icon} size={15} />}
      />
      {connectionWords(r, wants, { open: aboutOpen, toggle: () => setAboutOpen((v) => !v) })}
      <StatePill kind="tone" value={r.tone} label={r.stateWords} />
      {rowActs({ ...props, owner, armed, loud })}
      {offers === "one" && (
        <span className="set-int-chev" aria-hidden="true">
          <Icon name="chevron" size={11} />
        </span>
      )}
      {offers === "menu" && (
        <span className="set-int-more">
          <MoreMenu items={acts} title={`${r.title}: more`} escape testid={`connection-${r.kind}-more`} />
        </span>
      )}
      {rowAsk({ busy, setArm, confirm, armed })}
    </div>
  );
};
