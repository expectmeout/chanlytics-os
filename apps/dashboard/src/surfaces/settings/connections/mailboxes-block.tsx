/**
 * Chanlytics — Connections › Email (decision 0056): the mailboxes a business connected at Google or Microsoft, which
 * bring its customers' email in and write its sequences to leads, under their own row (contracts connections.ts
 * mailboxRow). The owner connects, pauses, resumes, sets, tests, checks and removes; anyone may read.
 *
 * With a mailbox connected, the row is Email (`EmailCard`): its name and state, and each mailbox a row of its own under
 * it, its address where Email's name starts, in the shape every connection's row has (Ruben, 21 Nov 2026: the card was
 * five kinds of row in one, its facts always open). A mailbox's row is its address, its state and, only while it has
 * something to say, one quiet line: why it is not sending, what its domain still lacks, or where its history stands
 * while it comes in. A press on it opens its settings in a sheet (mailbox-sheet.tsx); one that needs mending says Fix in
 * coral instead, and its sheet leads with what is wrong and the act that mends it (connected again, resumed, its records
 * added), as a row's Fix does. Its sending, signature, what it brought in, a test, Pause and Remove are the sheet's.
 *
 * Under the mailboxes: what was left in the mailbox today, and Add a mailbox, which opens what connecting brings and a
 * Connect for each provider. A domain's records are the DNS sheet's (dns-sheet.tsx).
 *
 * `EmailCard` and `ConnectedMailboxes` keep their state; a row, its lines and the foot are plain functions that return
 * the JSX, called and not drawn.
 */
import { Fragment, useState, type ReactNode } from "react";
import {
  IMPORT_WORDS,
  importLineOf,
  sourceRowsOf,
  type ImportRowDto,
  type ImportSource,
  type MailboxConnectionDto,
  type MailboxHistory,
  type MailboxProvider,
  type SetupDto,
} from "@chanlytics/contracts";
import type { ConnectionLine } from "./model/setup";
import type { ApiResult } from "@/client/api";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { canDo, gate, gateTitle, refusalToast, type FrameFlash } from "../../frame-verbs";
import { connectedMailboxes } from "./connected-mailboxes";
import { LeftSenders } from "./left-senders";
import { DnsSheet, copyWords } from "./dns-sheet";
import { HistoryAct } from "./history-act";
import { HistoryChoice } from "./history-choice";
import { MailboxSheet } from "./mailbox-sheet";
import { connRowPress } from "./row";
import { setupVerbs } from "../../setup/surface";

const MAILBOXES = connectedMailboxes;
/** The permission a mailbox's acts ask (contracts ROLE_PERMS): the one the doors' own role check stands on. */
const MAILBOX_PERM = "settings";

type Flash = (f: FrameFlash) => void;
type Email = NonNullable<SetupDto["email"]>;

/** The mailbox an owner has opened the settings or the DNS sheet of. */
interface Arm {
  id: string;
  what: "settings" | "dns";
}

interface MailboxActs {
  resume: (m: MailboxConnectionDto) => Promise<void>;
  check: (m: MailboxConnectionDto) => Promise<void>;
  test: (m: MailboxConnectionDto) => Promise<void>;
  remove: (m: MailboxConnectionDto) => Promise<void>;
  /**
   * To the provider, for a new mailbox (with what its owner chose of its history) or to Reconnect one: a refusal is
   * said here, and the browser stays.
   */
  connect: (provider: MailboxProvider, m?: MailboxConnectionDto, history?: MailboxHistory) => Promise<void>;
  /** The link for a Microsoft 365 admin, asked for and shown under the block to copy and send them. */
  adminLink: () => Promise<void>;
}

/** The owner's acts on a mailbox, each said in a toast when it is done; those that change what the sheet shows close it. */
function mailboxActsOf(
  flash: Flash,
  setBusy: (id: string | null) => void,
  setArm: (a: Arm | null) => void,
  setAdminUrl: (url: string | null) => void,
): MailboxActs {
  const connect = async (provider: MailboxProvider, m?: MailboxConnectionDto, history?: MailboxHistory) => {
    // Its own key, so a row's act never reads as running while the page is only leaving for the provider.
    setBusy(`connect:${m?.id ?? provider}`);
    const r = await MAILBOXES.connect(provider, m?.id, undefined, history);
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
    words: { done: string; refused: string; closes: boolean },
  ) => {
    setBusy(m.id);
    const r = await act();
    setBusy(null);
    if (words.closes) setArm(null);
    flash(r.ok ? { msg: <>{words.done}</> } : refusalToast(r, words.refused));
  };
  return {
    resume: (m) =>
      run(m, () => MAILBOXES.resume(m.id), {
        done: `${m.address} sends again, and its count starts again.`,
        refused: "Not resumed",
        closes: true,
      }),
    check: (m) =>
      run(m, () => MAILBOXES.check(m.id), {
        done: `${m.host}'s records were read again.`,
        refused: "Not checked",
        closes: false,
      }),
    test: (m) =>
      run(m, () => MAILBOXES.test(m.id), {
        done: `A test is on its way to ${m.address}: open it there.`,
        refused: "Not sent",
        closes: false,
      }),
    remove: (m) =>
      run(m, () => MAILBOXES.remove(m.id), {
        done: `${m.address} is removed. Nothing more leaves from it.`,
        refused: "Not removed",
        closes: true,
      }),
    connect,
    adminLink,
  };
}

/** What a row needs of the block around it. */
interface RowContext {
  owner: boolean;
  busy: string | null;
  acts: MailboxActs;
  flash: Flash;
  setArm: (arm: Arm | null) => void;
}

/** What a mailbox needs mended, most first: to be connected again, resumed, or its domain's records added. */
type Mend = "reconnect" | "resume" | "dns";

/** Each mend's act, and what a role that may not is told it would have done. */
const MEND_WORDS: Record<Mend, { label: string; doing: string }> = {
  reconnect: { label: "Reconnect", doing: "reconnect a mailbox" },
  resume: { label: "Resume", doing: "resume a mailbox" },
  dns: { label: MAILBOXES.dns.words.act, doing: "check a mailbox's records" },
};

/** Whether its domain still lacks a record (a record not read yet is not one), while it reads and sends. */
function dnsMissing(m: MailboxConnectionDto) {
  if (m.state !== "connected" && m.state !== "paused") return null;
  const d = MAILBOXES.dns.of(m);
  return d.missing ? MAILBOXES.dns.words.need(d.missing, d.found, d.total) : null;
}

/** The one thing its row's Fix and its sheet's head mend; null while nothing needs mending. */
function mendOf(m: MailboxConnectionDto): Mend | null {
  const can = MAILBOXES.acts(m);
  if (can.reconnect) return "reconnect";
  if (can.resume) return "resume";
  return dnsMissing(m) ? "dns" : null;
}

/** What a mailbox's row says, a quiet line each, only while there is something to say. */
interface MailboxLine {
  key: string;
  says: ReactNode;
  tone: "warn" | null;
}

/**
 * A mailbox's lines: why it is not sending (signed out, held, paused), then what its domain still lacks, or where its
 * history stands while it comes in or stopped, or what its records need. What came in today and when it was read are
 * not said: a row that works says nothing.
 */
function mailboxLines(m: MailboxConnectionDto, ctx: RowContext, imports: readonly ImportRowDto[] | null | undefined) {
  const now = Date.now();
  const zone = pageClock().zone();
  const r = MAILBOXES.row(m, now, zone);
  const history = MAILBOXES.historyLine(m, imports, now, zone);
  const live = history && history.act !== "bring" ? history : null;
  const need = dnsMissing(m);
  const lines: MailboxLine[] = [];
  if (r.standing) lines.push({ key: "standing", says: r.standing, tone: m.state === "paused" ? null : "warn" });
  if (need) lines.push({ key: "need", says: need, tone: "warn" });
  else if (live)
    lines.push({
      key: "history",
      says: (
        <span data-testid={`mailbox-history-${m.address}`}>
          {live.says}
          {live.act && ctx.owner ? (
            <>
              {" · "}
              <HistoryAct id={m.id} address={m.address} act={live.act} flash={ctx.flash} />
            </>
          ) : null}
        </span>
      ),
      tone: null,
    });
  else if (r.fix && !r.standing) lines.push({ key: "fix", says: r.fix, tone: null });
  return lines;
}

/**
 * Its state as every row says it: On while it reads and sends, else its own word (Paused, Held, Reconnect); a domain
 * short of records is amber beside its Fix, never a green On (on a desk the two stand side by side).
 */
const mailboxPillOf = (m: MailboxConnectionDto) => {
  const r = MAILBOXES.row(m, Date.now(), pageClock().zone());
  if (dnsMissing(m)) return { tone: "warn" as const, label: MAILBOXES.dns.words.pill };
  return { tone: r.tone, label: r.pill === "Connected" ? "On" : r.pill };
};

/**
 * One mailbox, a row under Email: its address, its quiet lines, its state, and its press, which opens its settings: the
 * row itself and its chevron, or Fix where something needs mending.
 */
function mailboxRow(m: MailboxConnectionDto, ctx: RowContext, imports: readonly ImportRowDto[] | null | undefined) {
  const mend = mendOf(m);
  const open = () => ctx.setArm({ id: m.id, what: "settings" });
  const pill = mailboxPillOf(m);
  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events -- a pointer's press on the whole row, as a connection's row is (row.tsx connRowPress); a keyboard reaches the row's own Settings or Fix button
    <div
      key={m.id}
      className="set-int-row"
      data-child="true"
      data-testid={`mailbox-${m.address}`}
      data-state={m.state}
      data-offers={mend ? "primary" : "one"}
      onClick={mend ? undefined : connRowPress}
    >
      <span aria-hidden="true" />
      <span className="set-team-body">
        <span className="set-int-head">
          <span className="set-team-name">{m.address}</span>
        </span>
        {mailboxLines(m, ctx, imports).map((line) => (
          <span key={line.key} className="set-int-notes" data-tone={line.tone ?? undefined}>
            {line.says}
          </span>
        ))}
      </span>
      <StatePill kind="tone" value={pill.tone} label={pill.label} className="set-int-state" />
      <span className="set-int-actions">
        <Button
          size="sm"
          variant={mend ? "primary" : "secondary"}
          onClick={open}
          aria-label={mend ? `Fix ${m.address}` : `${m.address} settings`}
          data-testid={mend ? `mailbox-fix-${m.address}` : `mailbox-settings-${m.address}`}
        >
          {mend ? "Fix" : "Settings"}
        </Button>
      </span>
      {mend ? null : (
        <span className="set-int-chev" aria-hidden="true">
          <Icon name="chevron" size={11} />
        </span>
      )}
    </div>
  );
}

/**
 * What its sheet leads with where it needs mending (as a row's Fix opens on it): what is wrong, and the act that mends
 * it, the coral one. Resume is asked first, in its place.
 */
function MendHead({ m, mend, ctx }: { m: MailboxConnectionDto; mend: Mend; ctx: RowContext }) {
  const [asking, setAsking] = useState(false);
  const r = MAILBOXES.row(m, Date.now(), pageClock().zone());
  const says = mend === "dns" ? dnsMissing(m) : (r.standing ?? r.fix);
  const go = {
    reconnect: () => void ctx.acts.connect(m.provider, m),
    resume: () => setAsking(true),
    dns: () => ctx.setArm({ id: m.id, what: "dns" }),
  };
  return (
    <section className="set-mbx-group set-mbx-mend" data-testid={`mailbox-problem-${m.address}`}>
      <span className="set-int-problem">{says}</span>
      {asking ? (
        <Confirm
          question={`Resume ${m.address}?`}
          detail={`It sends again where its ramp left off. ${r.fix ?? ""}`.trim()}
          yes="Yes, resume"
          busy={ctx.busy === m.id}
          onYes={() => void ctx.acts.resume(m)}
          onNo={() => setAsking(false)}
          testid={`mailbox-resume-${m.address}`}
        />
      ) : (
        <Button
          size="sm"
          variant="primary"
          onClick={go[mend]}
          disabled={ctx.busy !== null}
          data-testid={`mailbox-${mend}-${m.address}`}
          {...(mend === "dns" || ctx.owner ? {} : gate(MAILBOX_PERM, MEND_WORDS[mend].doing))}
        >
          {MEND_WORDS[mend].label}
        </Button>
      )}
    </section>
  );
}

/** Send a test, in its sheet: to itself, while it reads; said gated to a member who may not, never hidden. */
function testOf(m: MailboxConnectionDto, ctx: RowContext) {
  if (!MAILBOXES.acts(m).test) return null;
  return (
    <LinkButton
      onClick={() => void ctx.acts.test(m)}
      disabled={ctx.busy !== null}
      data-testid={`mailbox-test-${m.address}`}
      {...(ctx.owner ? {} : gate(MAILBOX_PERM, "send a test"))}
    >
      {ctx.busy === m.id ? MAILBOXES.card.testing : MAILBOXES.card.test}
    </LinkButton>
  );
}

/** The card's words for the sources a mailbox brings in, by the imports ledger's own line for each. */
const BROUGHT_WORDS: Readonly<Record<"mailbox" | "contacts", string>> = {
  mailbox: MAILBOXES.card.inbox,
  contacts: MAILBOXES.card.contacts,
};

/**
 * Try again on a run that stopped (the live walk's TODAY-3, 27 Oct 2026): the first run's own door (POST imports/again,
 * setup/surface.ts importAgain), which starts it again where it stopped; it says Starting until Setup's read hears the
 * run, and a refusal says why.
 */
function ImportAgain({ source, flash }: { source: ImportSource; flash: Flash }) {
  const [starting, setStarting] = useState(false);
  const again = async () => {
    setStarting(true);
    const r = await setupVerbs.importAgain(source);
    if (r.ok) return;
    setStarting(false);
    flash(refusalToast(r, IMPORT_WORDS.stopped));
  };
  return (
    <LinkButton onClick={() => void again()} disabled={starting} data-testid={`mailbox-import-again-${source}`}>
      {starting ? IMPORT_WORDS.starting : IMPORT_WORDS.retry}
    </LinkButton>
  );
}

/**
 * The workspace's own rows of the ledger for what the mailboxes bring (its contacts, and the mail of a mailbox connected
 * before each had a run of its own, 00499), said as one line each: a mailbox's own run is said on its row.
 */
function sharedImports(imports: readonly ImportRowDto[] | null | undefined) {
  const zone = pageClock().zone();
  const shared = (imports ?? []).filter(
    (row) => row.source === "contacts" || (row.source === "mailbox" && !row.connection_id),
  );
  return sourceRowsOf(shared).flatMap((row) => {
    if (row.source !== "mailbox" && row.source !== "contacts") return [];
    const line = importLineOf(row, zone);
    // A stopped line says so in its own words, Try again beside it; only one still coming says where it stands.
    const says = line.state === "done" || line.state === "failed" ? line.says : `${line.says} · ${line.stand}`;
    return [
      {
        source: row.source,
        label: BROUGHT_WORDS[row.source],
        says,
        done: line.state === "done",
        retry: line.retry,
        via: row.via,
      },
    ];
  });
}

/**
 * What a mailbox's sheet says it brought in: its own history (with the act that fits, the six months for one that chose
 * from now on), else the workspace's line where it is the only mailbox; and the contacts its provider brought.
 */
function broughtIn(
  m: MailboxConnectionDto,
  ctx: RowContext,
  imports: readonly ImportRowDto[] | null | undefined,
  only: boolean,
) {
  const now = Date.now();
  const zone = pageClock().zone();
  const history = MAILBOXES.historyLine(m, imports, now, zone);
  // Its own rows of the ledger (00499: each mailbox brings its mail and its contacts), else the workspace's, where it is
  // the only mailbox or the provider that brought them is its own.
  const mine = (source: "mailbox" | "contacts") =>
    (imports ?? []).find((row) => row.source === source && row.connection_id === m.id);
  const shared = (source: "mailbox" | "contacts") =>
    sharedImports(imports).find((s) => s.source === source && (only || s.via === m.provider))?.says ?? null;
  const ownMail = mine("mailbox");
  const ownContacts = mine("contacts");
  const mail = history?.says ?? (ownMail ? importLineOf(ownMail, zone).says : shared("mailbox"));
  const contacts = ownContacts ? importLineOf(ownContacts, zone).says : shared("contacts");
  const lines = [
    mail ? { key: "mailbox", label: MAILBOXES.card.inbox, says: mail, act: history?.act ?? null } : null,
    contacts ? { key: "contacts", label: MAILBOXES.card.contacts, says: contacts, act: null } : null,
  ].filter((line) => line !== null);
  if (!lines.length) return null;
  return (
    <dl className="set-int-facts" data-testid="mailbox-brought">
      {lines.map((line) => (
        <Fragment key={line.key}>
          <dt>{line.label}</dt>
          <dd>
            {line.says}
            {line.act && ctx.owner ? (
              <>
                {" · "}
                <HistoryAct id={m.id} address={m.address} act={line.act} flash={ctx.flash} />
              </>
            ) : null}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** What a new mailbox brings as it connects (0086), chosen under its Connect: the owner's, and theirs to change. */
interface Choice {
  history: MailboxHistory;
  setHistory: (history: MailboxHistory) => void;
}

/**
 * The foot: the rule once, what connecting brings and Change, and a Connect for each provider this deployment offers,
 * while there is room; beside Microsoft's, the link for an organisation whose admin approves apps.
 */
function mailboxesFoot(count: number, providers: readonly MailboxProvider[], ctx: RowContext, choice: Choice) {
  const { owner, busy, acts } = ctx;
  const room = count < MAILBOXES.max;
  const gated = (what: string) => (owner ? {} : gate(MAILBOX_PERM, what));
  return (
    <div className="set-dom set-dom-foot">
      <span />
      <span className="t">
        <span>{MAILBOXES.foot(count)}</span>
        {room && owner ? (
          <HistoryChoice value={choice.history} onChange={choice.setHistory} lineClass="set-mbx-says" />
        ) : null}
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
              onClick={() => void acts.connect(p, undefined, choice.history)}
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
 * connected, the row is Email (`EmailCard`), which says all of this itself.
 */
export function ConnectedMailboxes({ email, flash, note, onNote }: ConnectedMailboxesProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, setArm] = useState<Arm | null>(null);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<MailboxHistory>("six_months");
  const owner = canDo(MAILBOX_PERM);
  const acts = mailboxActsOf(flash, setBusy, setArm, setAdminUrl);
  const ctx: RowContext = { owner, busy, acts, flash, setArm };
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
      {mailboxesFoot(0, providers, ctx, { history, setHistory })}
    </div>
  );
}

/** Email's own row: its name, the workspace's lines of what came in while one still comes or stopped, and its state. */
function emailHeadRow(r: ConnectionLine, imports: readonly ImportRowDto[] | null | undefined, ctx: RowContext) {
  const live = sharedImports(imports).filter((line) => !line.done);
  return (
    <div className="set-int-row" data-testid="connection-mailbox" data-state={r.state} data-offers="none">
      <Face className="set-int-lead" data-kind="mailbox" data-on="true" glyph={<Icon name={r.icon} size={15} />} />
      <span className="set-team-body">
        <span className="set-int-head">
          <span className="set-team-name">{r.title}</span>
        </span>
        {live.map((line) => (
          <span key={line.source} className="set-int-notes" data-testid={`mailbox-import-${line.source}`}>
            <span>
              {`${line.label}: ${line.says}`}
              {line.retry && ctx.owner ? (
                <>
                  {" · "}
                  <ImportAgain source={line.source} flash={ctx.flash} />
                </>
              ) : null}
            </span>
          </span>
        ))}
      </span>
      <StatePill kind="tone" value={r.tone} label={r.stateWords} className="set-int-state" />
      <span className="set-int-actions" />
    </div>
  );
}

/**
 * Add a mailbox, under the mailboxes: pressed, it opens what connecting brings, with Change, and a Connect for each
 * provider this deployment offers. At the most a workspace writes from, it goes, and the foot says why.
 */
function AddMailbox({
  count,
  providers,
  ctx,
}: {
  count: number;
  providers: readonly MailboxProvider[];
  ctx: RowContext;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<MailboxHistory>("six_months");
  if (!ctx.owner) return null;
  if (count >= MAILBOXES.max)
    return (
      <span className="set-int-notes" data-testid="mailbox-most">
        {MAILBOXES.foot(count)}
      </span>
    );
  if (!open)
    return (
      <LinkButton onClick={() => setOpen(true)} data-testid="mailbox-add">
        {`+ ${MAILBOXES.card.add}`}
      </LinkButton>
    );
  return (
    <div className="set-mbx-add" data-testid="mailbox-add-open">
      <HistoryChoice value={history} onChange={setHistory} lineClass="set-mbx-says" />
      <span className="set-int-actions">
        {providers.map((p) => (
          <Button
            key={p}
            size="sm"
            variant="primary"
            onClick={() => void ctx.acts.connect(p, undefined, history)}
            disabled={ctx.busy !== null}
            data-testid={`mailbox-connect-${p}`}
          >
            {`Connect ${MAILBOXES.providerWords[p]}`}
          </Button>
        ))}
        <LinkButton onClick={() => setOpen(false)}>Cancel</LinkButton>
      </span>
    </div>
  );
}

interface EmailCardProps {
  /** The mailbox row, titled Email: the hosted address's row folds into it (contracts connectionRows). */
  r: ConnectionLine;
  email: Email;
  /** What was brought in (Setup's imports ledger): each mailbox's history, and the workspace's contacts. */
  imports: readonly ImportRowDto[] | null | undefined;
  businessName: string | null;
  flash: Flash;
  note: ConnectedMailboxesProps["note"];
  onNote: () => void;
  /** The address named "Left in your mailbox": its list read and brought into view. */
  openLeft?: boolean;
}

/**
 * Email (the mailbox rows of 21 Nov 2026): its own row, a row for each mailbox under it, then what a connect came back
 * with, what was left in the mailbox and Add a mailbox. A mailbox's settings and its domain's records open in sheets.
 */
export function EmailCard({ r, email, imports, businessName, flash, note, onNote, openLeft = false }: EmailCardProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [arm, setArm] = useState<Arm | null>(null);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);
  const owner = canDo(MAILBOX_PERM);
  const acts = mailboxActsOf(flash, setBusy, setArm, setAdminUrl);
  const ctx: RowContext = { owner, busy, acts, flash, setArm };
  const boxes = email.sending?.mailboxes ?? [];
  // The mailbox whose settings, or whose DNS, is open in its sheet.
  const armedOf = (what: Arm["what"]) => (arm?.what === what ? (boxes.find((m) => m.id === arm.id) ?? null) : null);
  const opened = armedOf("settings");
  const dnsOf = armedOf("dns");
  const mend = opened ? mendOf(opened) : null;
  return (
    <>
      {emailHeadRow(r, imports, ctx)}
      {boxes.map((m) => mailboxRow(m, ctx, imports))}
      <div className="set-mbx-foot" data-testid="mailbox-foot">
        {note && mailboxNote(note, onNote, ctx)}
        {adminUrl ? adminLinkRow(adminUrl, flash, () => setAdminUrl(null)) : null}
        {!owner ? (
          <span className="set-int-notes" data-testid="mailbox-gate">
            {gateTitle(MAILBOX_PERM, "connect, pause, resume or remove a mailbox")}
          </span>
        ) : null}
        <div className="set-mbx-left">
          <LeftSenders
            owner={owner}
            flash={flash}
            today={email.sending?.left_today ?? null}
            open={openLeft}
            lead={false}
          />
        </div>
        <AddMailbox count={boxes.length} providers={email.sending?.providers ?? []} ctx={ctx} />
      </div>
      {opened ? (
        <MailboxSheet
          m={opened}
          email={email}
          businessName={businessName}
          owner={owner}
          flash={flash}
          head={mend ? <MendHead m={opened} mend={mend} ctx={ctx} /> : null}
          brought={broughtIn(opened, ctx, imports, boxes.length === 1)}
          test={testOf(opened, ctx)}
          onClose={() => setArm(null)}
          onRemove={() => acts.remove(opened)}
        />
      ) : null}
      {dnsOf ? <DnsSheet m={dnsOf} owner={owner} flash={flash} onClose={() => setArm(null)} /> : null}
    </>
  );
}
