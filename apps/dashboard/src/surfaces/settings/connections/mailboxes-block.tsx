/**
 * Chanlytics — Connections › Your mailbox (decision 0056): the mailboxes a business connected at Google or Microsoft,
 * which bring its customers' email in and write its sequences to leads, under their own row (contracts connections.ts
 * mailboxRow). Each row is contracts' words (`connectedMailboxes.row`): what came in through it (when it was read, who
 * wrote today), a hold or a sign-out and what to do about it; its day, its ramp and its health are its Sending lines,
 * a press away. Its domain's records are listed while one is missing. The owner connects, pauses, resumes, sets,
 * tests, checks and removes, from the one act a row offers and its caret; anyone may read.
 *
 * With a mailbox connected, the row is the Email card (`EmailCard`, the mailbox canvas of 27 Oct 2026): the hosted
 * address's row folds into it (contracts connectionRows), what came in and what it sends are facts in place of
 * sentences, and a mailbox's settings open in a sheet beside the page (mailbox-sheet.tsx), never inside the row.
 *
 * `EmailCard` and `ConnectedMailboxes` keep their state; a row, its buttons, its questions and the foot are plain
 * functions that return the JSX, called and not drawn, as the block before it did. `MailboxRecords` is a component.
 */
import { Fragment, useState } from "react";
import {
  importLineOf,
  type ConnectionRow,
  type ImportRowDto,
  type ImportSource,
  type MailboxConnectionDto,
  type MailboxProvider,
  type MailboxRecordRow,
  type SetupDto,
} from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { StatePill } from "../../kit/pill/state-pill";
import { canDo, gate, gateTitle, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { connectedMailboxes } from "./connected-mailboxes";
import { LeftSenders } from "./left-senders";
import { MailboxSheet } from "./mailbox-sheet";

const MAILBOXES = connectedMailboxes;
/** The permission a mailbox's acts ask (contracts ROLE_PERMS): the one the doors' own role check stands on. */
const MAILBOX_PERM = "settings";

type Flash = (f: LegacyFlash) => void;
type Email = NonNullable<SetupDto["email"]>;

interface RecordsProps {
  m: MailboxConnectionDto;
  flash: Flash;
}

/** Copy words, saying so; where the browser gives no clipboard, the words are selected so a person copies them by hand. */
function copyWords(flash: Flash, value: string, nodeId: string) {
  const byHand = () => {
    const node = document.getElementById(nodeId);
    if (node && window.getSelection && document.createRange) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    flash({ tone: "danger", msg: <>Couldn't copy. It's selected: copy it by hand</> });
  };
  if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => flash({ msg: <>Copied</> }), byHand);
  else byHand();
}

/** What a record's dot says: DNS has it, has it not, or could not be read just now. */
const DOT_WORDS: Record<MailboxRecordRow["state"], string> = {
  found: "Found",
  missing: "Not found yet",
  unread: "Not read yet",
};

/** The records its domain needs, while one is missing: what each is for, where it goes, what to put in it. */
const MailboxRecords = ({ m, flash }: RecordsProps) => {
  const copy = (value: string, id: string) => copyWords(flash, value, id);
  const rows = MAILBOXES.records(m);
  const idOf = (r: MailboxRecordRow, part: string) => `mrec-${m.id}-${part}-${r.key}`;
  return (
    <div className="set-records" data-testid={`mailbox-records-${m.address}`}>
      <p className="set-records-intro">
        {`Add these at the place you manage ${m.host}'s DNS, so mail from ${m.address} is trusted.`}{" "}
        <span className="dim">A green dot is a record DNS already has.</span>
      </p>
      <div className="set-records-table" role="table" aria-label={`The records for ${m.host}`}>
        <div className="set-records-row set-records-head" role="row">
          <span role="columnheader">Record</span>
          <span role="columnheader">Name</span>
          <span role="columnheader">Value</span>
        </div>
        {rows.map((r) => (
          <div className="set-records-row" role="row" key={r.key}>
            <span role="cell" className="k">
              <span
                className="rec-dot"
                role="img"
                data-found={r.found ? "yes" : "no"}
                title={DOT_WORDS[r.state]}
                aria-label={DOT_WORDS[r.state]}
              />
              {r.kind}
              <span className="ty-inline">
                {" · "}
                {r.type}
              </span>
            </span>
            <span role="cell" className="n">
              <code id={idOf(r, "name")}>{r.name}</code>
            </span>
            <span role="cell" className="v">
              <code id={idOf(r, "value")}>{r.value}</code>
              {/* DKIM is made where the mailbox lives, so its words are where to go, not a value to paste. */}
              {r.key !== "dkim" && (
                <LinkButton
                  className="rec-copy"
                  onClick={() => copy(r.value, idOf(r, "value"))}
                  aria-label={`Copy the ${r.kind} value`}
                  data-testid={`mailbox-copy-${r.key}`}
                >
                  Copy
                </LinkButton>
              )}
              {r.note ? (
                <span className="dim set-records-note" data-testid={`mailbox-record-note-${r.key}`}>
                  {r.note}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** The mailbox an owner has armed a question on, or opened the settings sheet of. */
interface Arm {
  id: string;
  what: "remove" | "resume" | "settings";
}

interface MailboxActs {
  pause: (m: MailboxConnectionDto, paused: boolean) => Promise<void>;
  resume: (m: MailboxConnectionDto) => Promise<void>;
  check: (m: MailboxConnectionDto) => Promise<void>;
  test: (m: MailboxConnectionDto) => Promise<void>;
  remove: (m: MailboxConnectionDto) => Promise<void>;
  /** To the provider, for a new mailbox or to Reconnect one: a refusal is said here, and the browser stays. */
  connect: (provider: MailboxProvider, m?: MailboxConnectionDto) => Promise<void>;
  /** The link for a Microsoft 365 admin, asked for and shown under the block to copy and send them. */
  adminLink: () => Promise<void>;
}

/** The owner's acts on a mailbox, each said in a toast when it is done. */
function mailboxActsOf(
  flash: Flash,
  setBusy: (id: string | null) => void,
  setArm: (a: Arm | null) => void,
  setAdminUrl: (url: string | null) => void,
): MailboxActs {
  const connect = async (provider: MailboxProvider, m?: MailboxConnectionDto) => {
    // Its own key, so a row's Check never reads "Checking…" while the page is only leaving for the provider.
    setBusy(`connect:${m?.id ?? provider}`);
    const r = await MAILBOXES.connect(provider, m?.id);
    // Given a way to the provider, the browser is leaving; a page brought back from the history is pressable again.
    setBusy(null);
    if (!r.ok) flash(refusalToast(r, "Not connected"));
  };
  // Shown, not copied: a browser lets a copy happen only within the press itself, and this waits on the door first.
  const adminLink = async () => {
    const r = await MAILBOXES.adminLink();
    if (r.ok) setAdminUrl(r.data.url);
    else flash(refusalToast(r, "No link"));
  };
  const run = async (
    m: MailboxConnectionDto,
    act: () => Promise<ApiResult<unknown>>,
    done: string,
    refused: string,
  ) => {
    setBusy(m.id);
    const r = await act();
    setBusy(null);
    setArm(null);
    flash(r.ok ? { msg: <>{done}</> } : refusalToast(r, refused));
  };
  return {
    pause: (m, paused) =>
      run(
        m,
        () => MAILBOXES.set(m.id, { paused }),
        paused ? `${m.address} is paused: nothing leaves from it.` : `${m.address} sends again.`,
        paused ? "Not paused" : "Not unpaused",
      ),
    resume: (m) =>
      run(m, () => MAILBOXES.resume(m.id), `${m.address} sends again, and its count starts again.`, "Not resumed"),
    check: (m) => run(m, () => MAILBOXES.check(m.id), `${m.host}'s records were read again.`, "Not checked"),
    test: (m) => run(m, () => MAILBOXES.test(m.id), `A test is on its way to ${m.address}: open it there.`, "Not sent"),
    remove: (m) =>
      run(m, () => MAILBOXES.remove(m.id), `${m.address} is removed. Nothing more leaves from it.`, "Not removed"),
    connect,
    adminLink,
  };
}

/** What a row needs of the block around it. */
interface RowContext {
  owner: boolean;
  busy: string | null;
  arm: Arm | null;
  acts: MailboxActs;
  flash: Flash;
  setArm: (arm: Arm | null) => void;
}

/** The questions an owner is asked before Remove and before Resume, under the mailbox's words. */
function mailboxQuestions(m: MailboxConnectionDto, fix: string | null, ctx: RowContext) {
  const { busy, arm, acts, setArm } = ctx;
  const armed = (what: Arm["what"]) => arm && arm.id === m.id && arm.what === what;
  return (
    <>
      {armed("remove") && (
        <Confirm
          question={`Remove ${m.address}?`}
          detail="Nothing more leaves from it and its replies are no longer read here; what it sent stays in its threads, and a business it was writing to hears nothing more from that chain."
          yes="Yes, remove"
          danger
          busy={busy === m.id}
          onYes={() => void acts.remove(m)}
          onNo={() => setArm(null)}
          testid={`mailbox-remove-${m.address}`}
        />
      )}
      {armed("resume") && (
        <Confirm
          question={`Resume ${m.address}?`}
          detail={`It sends again where its ramp left off. ${fix ?? ""}`.trim()}
          yes="Yes, resume"
          busy={busy === m.id}
          onYes={() => void acts.resume(m)}
          onNo={() => setArm(null)}
          testid={`mailbox-resume-${m.address}`}
        />
      )}
    </>
  );
}

/** The one act a row offers first, by what its mailbox needs most; the rest are on its caret. */
type MainAct = "reconnect" | "resume" | "check" | "unpause" | "settings" | "test";

/**
 * What the mailbox needs most: to be connected again, resumed, its records read or its sending back; with nothing to
 * mend, its settings, which anyone may read and an owner changes (the canvas: Send a test is a once-in-a-while act, on
 * the caret).
 */
function mainActOf(can: ReturnType<typeof MAILBOXES.acts>, records: boolean): MainAct {
  if (can.reconnect) return "reconnect";
  if (can.resume) return "resume";
  if (records) return "check";
  if (can.unpause) return "unpause";
  return "settings";
}

/** Each act's words, its words while it runs, and what a role that may not is told it would have done. */
const MAIN_WORDS: Record<MainAct, { label: string; busy: string; doing: string }> = {
  reconnect: { label: "Reconnect", busy: "Reconnect", doing: "reconnect a mailbox" },
  resume: { label: "Resume", busy: "Resume", doing: "resume a mailbox" },
  check: { label: "Check", busy: "Checking…", doing: "check a mailbox's records" },
  unpause: { label: "Unpause", busy: "Unpausing…", doing: "unpause a mailbox" },
  settings: { label: "Settings", busy: "Settings", doing: "change a mailbox's settings" },
  test: { label: "Send a test", busy: "Sending…", doing: "send a test" },
};

/**
 * A row's acts, one split pill (Ruben, 20 Oct 2026: no three dots): the act its mailbox needs most, and a caret for the
 * rest, acts alone: its settings where they are not the act, the acts its state offers (contracts' `acts`) and Remove.
 * None while a question is open on it.
 */
function mailboxActions(m: MailboxConnectionDto, records: boolean, ctx: RowContext) {
  const { owner, busy, arm, acts, setArm } = ctx;
  const can = MAILBOXES.acts(m);
  if (arm && arm.id === m.id && arm.what !== "settings") return <span className="set-int-actions" />;
  const owners = (what: string) => (owner ? {} : gate(MAILBOX_PERM, what));
  // A menu's item stays pressable while another act runs: a press then does nothing, as a disabled button would.
  const unlessBusy = (go: () => void) => () => {
    if (busy === null) go();
  };
  const run: Record<MainAct, () => void> = {
    reconnect: () => void acts.connect(m.provider, m),
    resume: () => setArm({ id: m.id, what: "resume" }),
    check: () => void acts.check(m),
    unpause: () => void acts.pause(m, false),
    settings: () => setArm({ id: m.id, what: "settings" }),
    test: () => void acts.test(m),
  };
  const main = mainActOf(can, records);
  const items = [
    main !== "settings"
      ? { label: "Settings", icon: "settings", onClick: () => setArm({ id: m.id, what: "settings" }) }
      : null,
    records && main !== "check"
      ? {
          label: "Check its records",
          icon: "refresh",
          onClick: unlessBusy(run.check),
          gate: owners(MAIN_WORDS.check.doing),
        }
      : null,
    can.test && main !== "test"
      ? { label: "Send a test", icon: "mail", onClick: unlessBusy(run.test), gate: owners(MAIN_WORDS.test.doing) }
      : null,
    can.pause
      ? {
          label: "Pause sending",
          icon: "pause",
          onClick: unlessBusy(() => void acts.pause(m, true)),
          gate: owners("pause a mailbox"),
        }
      : null,
    owner && can.remove ? { divider: true } : null,
    owner && can.remove
      ? { label: "Remove…", icon: "x", danger: true, onClick: () => setArm({ id: m.id, what: "remove" }) }
      : null,
  ].filter((it) => it !== null);
  const primary = main === "reconnect";
  return (
    <span className="set-int-actions">
      <span className="set-mbx-acts">
        {
          <Button
            size="sm"
            variant={primary ? "primary" : undefined}
            onClick={run[main]}
            disabled={busy !== null}
            data-testid={`mailbox-${main === "unpause" ? "pause" : main}-${m.address}`}
            {...(main === "settings" ? {} : owners(MAIN_WORDS[main].doing))}
          >
            {busy === m.id && main !== "settings" ? MAIN_WORDS[main].busy : MAIN_WORDS[main].label}
          </Button>
        }
        {items.length > 0 && (
          <MoreMenu
            items={items}
            icon="chevron-down"
            size={12}
            btnClass={`btn btn-icon btn-sm${primary ? " btn-primary" : ""} set-mbx-caret`}
            title={`More for ${m.address}`}
            ariaLabel={`More for ${m.address}`}
            escape
            testid={`mailbox-more-${m.address}`}
          />
        )}
      </span>
    </span>
  );
}

/** Whether a mailbox's domain still lacks a record it needs. */
const missingOf = (m: MailboxConnectionDto) => MAILBOXES.records(m).some((x) => !x.found);

/**
 * One mailbox of several: what came in through it and its pill, its act and its caret, and its records while one is
 * missing. Its settings open in the card's sheet.
 */
function mailboxRow(m: MailboxConnectionDto, ctx: RowContext, now: number) {
  const r = MAILBOXES.row(m, now);
  const missing = missingOf(m);
  return (
    <Fragment key={m.id}>
      <div className="set-dom" data-testid={`mailbox-${m.address}`} data-state={m.state}>
        <Icon name="mail" size={14} />
        <span className="t">
          <b>{m.address}</b>
          {r.cameIn ? <span data-testid={`mailbox-came-in-${m.address}`}>{r.cameIn}</span> : null}
          {r.standing ? <span>{r.standing}</span> : null}
          {r.fix ? <span>{r.fix}</span> : null}
          {mailboxQuestions(m, r.fix, ctx)}
        </span>
        <span className="cap">
          <span>{MAILBOXES.providerWords[m.provider]}</span>
        </span>
        <StatePill kind="tone" value={r.tone} label={r.pill} />
        {mailboxActions(m, missing, ctx)}
      </div>
      {missing && m.state !== "reconnect" && <MailboxRecords m={m} flash={ctx.flash} />}
    </Fragment>
  );
}

/**
 * The foot: the rule once, and a Connect for each provider this deployment offers, while there is room; beside
 * Microsoft's, the link for an organisation whose admin approves apps.
 */
function mailboxesFoot(count: number, providers: readonly MailboxProvider[], ctx: RowContext) {
  const { owner, busy, acts } = ctx;
  const room = count < MAILBOXES.max;
  const gated = (what: string) => (owner ? {} : gate(MAILBOX_PERM, what));
  return (
    <div className="set-dom set-dom-foot">
      <span />
      <span className="t">
        <span>{MAILBOXES.foot(count)}</span>
      </span>
      <span />
      <span />
      <span className="set-int-actions">
        {room &&
          providers.map((p, i) => (
            <Button
              key={p}
              size="sm"
              variant={i === 0 && count === 0 ? "primary" : undefined}
              onClick={() => void acts.connect(p)}
              disabled={busy !== null}
              data-testid={`mailbox-connect-${p}`}
              {...gated("connect a mailbox")}
            >
              <Icon name="plus" size={12} />
              Connect {MAILBOXES.providerWords[p]}
            </Button>
          ))}
        {room && owner && providers.includes("microsoft") && (
          <LinkButton onClick={() => void acts.adminLink()} data-testid="mailbox-admin-link">
            Link for your admin
          </LinkButton>
        )}
      </span>
    </div>
  );
}

interface ConnectedMailboxesProps {
  email: Email | null | undefined;
  flash: Flash;
  /** What the browser came back from the provider with (or the door refused), said until the owner closes it. */
  note: { ok: boolean; words: string; code: string | null } | null;
  onNote: () => void;
}

/** The note a connect came back with, and, where it waits on a Microsoft 365 admin, the link to send them. */
function mailboxNote(note: NonNullable<ConnectedMailboxesProps["note"]>, onNote: () => void, ctx: RowContext) {
  return (
    <div className="set-dom set-dom-note" data-testid="mailbox-note" data-ok={note.ok ? "yes" : "no"}>
      <span />
      <span className="t">
        <span>{note.words}</span>
      </span>
      <span />
      <span />
      <span className="set-int-actions">
        {note.code === "admin_consent" && ctx.owner && (
          <LinkButton onClick={() => void ctx.acts.adminLink()} data-testid="mailbox-note-admin-link">
            Link for your admin
          </LinkButton>
        )}
        <LinkButton onClick={onNote}>Ok</LinkButton>
      </span>
    </div>
  );
}

/** The link for a Microsoft 365 admin, once asked for: the words to send with it, the link to select, and its Copy. */
function adminLinkRow(url: string, flash: Flash, onClose: () => void) {
  const id = "mailbox-admin-url";
  return (
    <div className="set-dom set-dom-note" data-testid="mailbox-admin-url-row">
      <span />
      <span className="t">
        <span>Send this to your Microsoft 365 admin. Once they approve Chanlytics, connect again.</span>
        <code id={id} className="dim">
          {url}
        </code>
      </span>
      <span />
      <span />
      <span className="set-int-actions">
        <LinkButton onClick={() => copyWords(flash, url, id)} data-testid="mailbox-admin-url-copy">
          Copy
        </LinkButton>
        <LinkButton onClick={onClose}>Ok</LinkButton>
      </span>
    </div>
  );
}

/**
 * Under the mailbox row while none is connected (decision 0056): a Connect for each provider this deployment offers,
 * and what a connect came back with. Where none is offered the row is Later, and only that is said under it. With one
 * connected, the row is the Email card (`EmailCard`), which says all of this itself.
 */
export function ConnectedMailboxes({ email, flash, note, onNote }: ConnectedMailboxesProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [arm, setArm] = useState<Arm | null>(null);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);
  const owner = canDo(MAILBOX_PERM);
  const acts = mailboxActsOf(flash, setBusy, setArm, setAdminUrl);
  const ctx: RowContext = { owner, busy, arm, acts, flash, setArm };
  const providers = email?.sending?.providers ?? [];
  const admin = adminUrl ? adminLinkRow(adminUrl, flash, () => setAdminUrl(null)) : null;
  if (!email?.sending || providers.length === 0)
    return note ? (
      <div className="set-domains" data-testid="connected-mailboxes-note">
        {mailboxNote(note, onNote, ctx)}
        {admin}
      </div>
    ) : null;
  return (
    <div className="set-domains" data-testid="connected-mailboxes">
      {note && mailboxNote(note, onNote, ctx)}
      {admin}
      {!owner && (
        <div className="set-dom set-dom-note">
          <span />
          <span className="t">
            <span>{gateTitle(MAILBOX_PERM, "connect, pause, resume or remove a mailbox")}</span>
          </span>
        </div>
      )}
      {mailboxesFoot(0, providers, ctx)}
    </div>
  );
}

/** The card's words for the sources a mailbox brings in, by the imports ledger's own line for each. */
const BROUGHT_FACTS: readonly { source: ImportSource; label: string }[] = [
  { source: "mailbox", label: MAILBOXES.card.inbox },
  { source: "contacts", label: MAILBOXES.card.contacts },
];

/**
 * The Email card's facts, in place of sentences: what came in from the mailbox and its contacts (the ledger's line for
 * each, with where it stands while it is still coming), and, for one mailbox, the most it sends a day and what it signs
 * as. A fact with nothing to say is left out.
 */
function cardFacts(one: MailboxConnectionDto | null, imports: readonly ImportRowDto[] | null | undefined) {
  const C = MAILBOXES.card;
  const brought = BROUGHT_FACTS.map(({ source, label }) => {
    const row = imports?.find((r) => r.source === source);
    if (!row) return null;
    const l = importLineOf(row);
    return { key: source, label, value: l.state === "done" ? l.says : `${l.says} · ${l.stand}` };
  });
  const own = one
    ? [
        { key: "sends", label: C.sends, value: C.sendsUpTo(one.daily_cap) },
        { key: "signs", label: C.signsAs, value: MAILBOXES.signs.as(one) },
      ]
    : [];
  return [...brought, ...own].filter((f) => f !== null);
}

/** The card's words beside its tile: Email, then the one mailbox's address and what came in, or how many there are. */
function cardWords(r: ConnectionRow, one: MailboxConnectionDto | null, now: number) {
  const w = one ? MAILBOXES.row(one, now) : null;
  return (
    <span className="set-team-body">
      <span className="set-int-head">
        <span className="set-team-name">{r.title}</span>
      </span>
      {one && w ? (
        <>
          <span className="set-mbx-says" data-testid={`mailbox-${one.address}`}>
            {`${one.address} · ${MAILBOXES.providerWords[one.provider]}`}
          </span>
          {w.cameIn ? (
            <span className="set-mbx-says" data-testid={`mailbox-came-in-${one.address}`}>
              {w.cameIn}
            </span>
          ) : null}
          {w.standing ? <span className="set-mbx-says">{w.standing}</span> : null}
          {w.fix ? <span className="set-mbx-says">{w.fix}</span> : null}
        </>
      ) : (
        <span className="set-mbx-says">{r.detail}</span>
      )}
    </span>
  );
}

interface EmailCardProps {
  /** The mailbox row, titled Email: the hosted address's row folds into it (contracts connectionRows). */
  r: ConnectionRow;
  email: Email;
  /** What was brought in (Setup's imports ledger): the card's Inbox and Contacts. */
  imports: readonly ImportRowDto[] | null | undefined;
  businessName: string | null;
  flash: Flash;
  note: ConnectedMailboxesProps["note"];
  onNote: () => void;
  /** The address named "Left in your mailbox" (Today's Brought in links to it): its list read and brought into view. */
  openLeft?: boolean;
}

/**
 * Email, as one card (the mailbox canvas, 27 Oct 2026): with one mailbox, its address, what came in, its state and its
 * act on the row, then its facts; with several, each its own line. What was left in the mailbox and Add a mailbox are
 * its foot. A mailbox's settings open in a sheet beside the page.
 */
export function EmailCard({ r, email, imports, businessName, flash, note, onNote, openLeft = false }: EmailCardProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [arm, setArm] = useState<Arm | null>(null);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);
  const owner = canDo(MAILBOX_PERM);
  const acts = mailboxActsOf(flash, setBusy, setArm, setAdminUrl);
  const ctx: RowContext = { owner, busy, arm, acts, flash, setArm };
  const boxes = email.sending?.mailboxes ?? [];
  const providers = email.sending?.providers ?? [];
  const now = Date.now();
  const one = boxes.length === 1 ? (boxes.at(0) ?? null) : null;
  const w = one ? MAILBOXES.row(one, now) : null;
  const opened = arm?.what === "settings" ? (boxes.find((m) => m.id === arm.id) ?? null) : null;
  const facts = cardFacts(one, imports);
  const room = owner && boxes.length < MAILBOXES.max;
  return (
    <>
      <div
        className="set-int-row set-mbx-one"
        data-testid="connection-mailbox"
        data-state={r.state}
        data-offers="split"
      >
        <Face className="set-int-tile" data-kind="mailbox" data-on="true" glyph={<Icon name={r.icon} size={15} />} />
        {cardWords(r, one, now)}
        <StatePill kind="tone" value={w ? w.tone : r.tone} label={w ? w.pill : r.stateWords} />
        {one ? mailboxActions(one, missingOf(one), ctx) : <span className="set-int-actions" />}
        <div className="set-mbx-below">
          {note && mailboxNote(note, onNote, ctx)}
          {adminUrl ? adminLinkRow(adminUrl, flash, () => setAdminUrl(null)) : null}
          {!owner ? (
            <p className="set-mbx-says" data-testid="mailbox-gate">
              {gateTitle(MAILBOX_PERM, "connect, pause, resume or remove a mailbox")}
            </p>
          ) : null}
          {facts.length ? (
            <dl className="set-mbx-facts" data-testid="mailbox-facts">
              {facts.map((f) => (
                <div key={f.key} className="set-mbx-fact">
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {one ? (
            <>
              {mailboxQuestions(one, w?.fix ?? null, ctx)}
              {missingOf(one) && one.state !== "reconnect" ? <MailboxRecords m={one} flash={flash} /> : null}
            </>
          ) : (
            <div className="set-domains">{boxes.map((m) => mailboxRow(m, ctx, now))}</div>
          )}
          <div className="set-mbx-foot">
            <div className="set-mbx-left">
              <LeftSenders
                owner={owner}
                flash={flash}
                today={email.sending?.left_today ?? null}
                open={openLeft}
                lead={false}
              />
            </div>
            {room
              ? providers.map((p) => (
                  <LinkButton
                    key={p}
                    onClick={() => void acts.connect(p)}
                    disabled={busy !== null}
                    data-testid={`mailbox-connect-${p}`}
                  >
                    {`+ ${MAILBOXES.card.add}${providers.length > 1 ? ` (${MAILBOXES.providerWords[p]})` : ""}`}
                  </LinkButton>
                ))
              : null}
          </div>
        </div>
      </div>
      {opened ? (
        <MailboxSheet
          m={opened}
          email={email}
          businessName={businessName}
          owner={owner}
          flash={flash}
          onClose={() => setArm(null)}
          onRemove={() => acts.remove(opened)}
        />
      ) : null}
    </>
  );
}
