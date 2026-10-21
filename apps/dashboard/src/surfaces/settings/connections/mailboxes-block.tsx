/**
 * Chanlytics — Connections › Mailboxes you write from (decision 0056): the mailboxes a business connected at Google or
 * Microsoft for its sequences to leads, under their own row (contracts connections.ts mailboxRow). Each row is contracts' words (`connectedMailboxes.words`),
 * so what it says is what the doors and the mailboxes clock decided: its day, its ramp, a hold and what to do about it,
 * a sign-out to reconnect. Its domain's records are listed while one is missing. The owner connects, pauses, resumes,
 * sets, tests, checks and removes; anyone may read.
 *
 * `ConnectedMailboxes` keeps its state; a row, its buttons, its questions and the foot are plain functions that return
 * the JSX, called and not drawn, as the block before it did. `MailboxRecords` and `MailboxSettings` are components.
 */
import { Fragment, useState } from "react";
import type { MailboxConnectionDto, MailboxProvider, MailboxRecordRow, SetupDto } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordField } from "../../kit/record/field";
import { canDo, gate, gateTitle, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { connectedMailboxes } from "./connected-mailboxes";

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

interface SettingsProps {
  m: MailboxConnectionDto;
  flash: Flash;
  onClose: () => void;
}

/** What is wrong with each box, in the owner's words; a box with nothing wrong has no key. */
type SettingsProblems = { name?: string; signature?: string; cap?: string };

/** The name it sends as, its signature and the most it sends a day, as its owner sets them. */
const MailboxSettings = ({ m, flash, onClose }: SettingsProps) => {
  const [name, setName] = useState(m.from_name);
  const [signature, setSignature] = useState(m.signature ?? "");
  const [cap, setCap] = useState(String(m.daily_cap));
  const [problems, setProblems] = useState<SettingsProblems>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const found: SettingsProblems = {};
    const n = Number(cap);
    if (!name.trim() || name.trim().length > 80) found.name = "Give the name people see, 80 characters at most.";
    if (signature.length > 1000) found.signature = "A signature is 1,000 characters at most.";
    if (!Number.isInteger(n) || n < 1 || n > MAILBOXES.capMax) found.cap = `Between 1 and ${MAILBOXES.capMax} a day.`;
    setProblems(found);
    if (found.name || found.signature || found.cap) return;
    setBusy(true);
    const r = await MAILBOXES.set(m.id, { from_name: name.trim(), signature: signature.trim() || null, daily_cap: n });
    setBusy(false);
    if (!r.ok) {
      flash(refusalToast(r, "Not saved"));
      return;
    }
    flash({ msg: <>{m.address} is saved</> });
    onClose();
  };
  return (
    <div className="set-row set-row-stack biz" data-testid={`mailbox-settings-${m.address}`}>
      <div className="biz-fields">
        <RecordField
          id={`mailbox-name-${m.id}`}
          testid="mailbox-name"
          label="The name people see beside it"
          value={name}
          onChange={setName}
          problem={problems.name}
          disabled={busy}
        />
        <RecordField
          id={`mailbox-signature-${m.id}`}
          testid="mailbox-signature"
          label="Its signature"
          value={signature}
          onChange={setSignature}
          rows={3}
          hint="Under every email it writes, above the foot the law asks for."
          problem={problems.signature}
          disabled={busy}
        />
        <RecordField
          id={`mailbox-cap-${m.id}`}
          testid="mailbox-cap"
          label="The most it sends a day"
          value={cap}
          onChange={setCap}
          type="number"
          unit="a day"
          hint="Its ramp and its domain keep it lower while they say so."
          problem={problems.cap}
          disabled={busy}
        />
      </div>
      <div className="set-acts">
        <Button size="sm" variant="primary" onClick={() => void save()} disabled={busy} data-testid="mailbox-save">
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

/** The row an owner has armed a question on, or opened the settings of. */
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

/** A row's buttons, each only where the mailbox's state offers it (contracts' `acts`) and no question is open. */
function mailboxButtons(m: MailboxConnectionDto, records: boolean, ctx: RowContext) {
  const { owner, busy, arm, acts, setArm } = ctx;
  const can = MAILBOXES.acts(m);
  const open = !(arm && arm.id === m.id);
  const owners = (what: string) => (owner ? {} : gate(MAILBOX_PERM, what));
  const off = busy !== null;
  return (
    <span className="set-int-actions">
      {can.reconnect && open && (
        <Button
          size="sm"
          variant="primary"
          onClick={() => void acts.connect(m.provider, m)}
          disabled={off}
          data-testid={`mailbox-reconnect-${m.address}`}
          {...owners("reconnect a mailbox")}
        >
          Reconnect
        </Button>
      )}
      {can.resume && open && (
        <Button
          size="sm"
          onClick={() => setArm({ id: m.id, what: "resume" })}
          disabled={off}
          data-testid={`mailbox-resume-${m.address}`}
          {...owners("resume a mailbox")}
        >
          Resume
        </Button>
      )}
      {records && open && (
        <Button
          size="sm"
          onClick={() => void acts.check(m)}
          disabled={off}
          data-testid={`mailbox-check-${m.address}`}
          {...owners("check a mailbox's records")}
        >
          {busy === m.id ? "Checking…" : "Check"}
        </Button>
      )}
      {can.test && open && (
        <Button
          size="sm"
          onClick={() => void acts.test(m)}
          disabled={off}
          data-testid={`mailbox-test-${m.address}`}
          {...owners("send a test")}
        >
          Send a test
        </Button>
      )}
      {(can.pause || can.unpause) && open && (
        <Button
          size="sm"
          onClick={() => void acts.pause(m, can.pause)}
          disabled={off}
          data-testid={`mailbox-pause-${m.address}`}
          {...owners(can.pause ? "pause a mailbox" : "unpause a mailbox")}
        >
          {can.pause ? "Pause" : "Unpause"}
        </Button>
      )}
      {owner && open && (
        <LinkButton
          onClick={() => setArm({ id: m.id, what: "settings" })}
          disabled={off}
          data-testid={`mailbox-settings-open-${m.address}`}
        >
          Settings
        </LinkButton>
      )}
      {owner && open && can.remove && (
        <LinkButton
          tone="danger"
          onClick={() => setArm({ id: m.id, what: "remove" })}
          disabled={off}
          data-testid={`mailbox-remove-${m.address}`}
        >
          Remove
        </LinkButton>
      )}
    </span>
  );
}

/** One mailbox: its words and pill and acts, its settings when open, and its records while one is missing. */
function mailboxRow(m: MailboxConnectionDto, ctx: RowContext, now: number) {
  const w = MAILBOXES.words(m, now);
  const missing = MAILBOXES.records(m).some((r) => !r.found);
  const settings = ctx.arm && ctx.arm.id === m.id && ctx.arm.what === "settings";
  return (
    <Fragment key={m.id}>
      <div className="set-dom" data-testid={`mailbox-${m.address}`} data-state={m.state}>
        <Icon name="mail" size={14} />
        <span className="t">
          <b>{m.address}</b>
          <span>{w.day}</span>
          {w.ramp ? <span className="dim">{w.ramp}</span> : null}
          {w.health ? (
            <span className="dim" data-testid={`mailbox-health-${m.address}`}>
              {w.health}
            </span>
          ) : null}
          {w.fix ? <span>{w.fix}</span> : null}
          {m.customer_domain && m.state === "connected" ? (
            <span className="dim">{MAILBOXES.customerDomain(m.host)}</span>
          ) : null}
          {mailboxQuestions(m, w.fix, ctx)}
        </span>
        <span className="cap">
          <span>{MAILBOXES.providerWords[m.provider]}</span>
        </span>
        <StatePill kind="tone" value={w.tone} label={w.pill} />
        {mailboxButtons(m, missing, ctx)}
      </div>
      {settings && <MailboxSettings m={m} flash={ctx.flash} onClose={() => ctx.setArm(null)} />}
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
 * The mailboxes a workspace writes its sequences to leads from, under their own row, which names them (decision 0056).
 * Drawn when this deployment offers a provider or the workspace has a mailbox connected; otherwise the row is Later,
 * and only what a connect came back with is said under it.
 */
export function ConnectedMailboxes({ email, flash, note, onNote }: ConnectedMailboxesProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [arm, setArm] = useState<Arm | null>(null);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);
  const owner = canDo(MAILBOX_PERM);
  const acts = mailboxActsOf(flash, setBusy, setArm, setAdminUrl);
  const ctx: RowContext = { owner, busy, arm, acts, flash, setArm };
  const providers = email?.sending?.providers ?? [];
  const mailboxes = email?.sending?.mailboxes ?? [];
  const admin = adminUrl ? adminLinkRow(adminUrl, flash, () => setAdminUrl(null)) : null;
  if (!email?.sending || (providers.length === 0 && mailboxes.length === 0))
    return note ? (
      <div className="set-domains" data-testid="connected-mailboxes-note">
        {mailboxNote(note, onNote, ctx)}
        {admin}
      </div>
    ) : null;
  const now = Date.now();
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
      {mailboxes.map((m) => mailboxRow(m, ctx, now))}
      {mailboxesFoot(mailboxes.length, providers, ctx)}
    </div>
  );
}
