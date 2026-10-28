/**
 * A mailbox's settings, in the record kit's sheet (the mailbox canvas, 27 Oct 2026): beside the page on a desk, from
 * the bottom on a phone, where they unfolded inside the Email row before. Sending: the name it sends as, the most it
 * sends a day, whether it sends, and where its day, ramp and health stand. What it signs with, and the end of an email as
 * the preview, read by the rule the send reads (contracts mailboxSignsOf). Its backup address, and Remove, asked in the
 * foot. One Save, for what is typed and chosen; Ctrl or Cmd with Enter saves, by the sheet's rule.
 */
import { useState } from "react";
import type { MailboxConnectionDto, MailboxSignsChoice, SetupDto } from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordField } from "../../kit/record/field";
import { RecordSheet } from "../../kit/record/sheet";
import { Segmented } from "../../kit/segmented/segmented";
import { Switch } from "../../kit/switch/switch";
import { refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { connectedMailboxes } from "./connected-mailboxes";
import { EmailSetupForm } from "./email-setup";

const MAILBOXES = connectedMailboxes;
/** Settings' words for what a mailbox signs with, and the card's and the sheet's (contracts). */
const SIGNS = MAILBOXES.signs.words;
const CARD = MAILBOXES.card;

type Email = NonNullable<SetupDto["email"]>;

interface SheetProps {
  m: MailboxConnectionDto;
  /** Setup's email: the hosted address said as the backup, and its name form. */
  email: Email;
  businessName: string | null;
  owner: boolean;
  flash: (f: LegacyFlash) => void;
  onClose: () => void;
  /** Remove, once asked: the block's act, which closes the sheet when it is done. */
  onRemove: () => Promise<void>;
}

/** What is wrong with each box, in the owner's words; a box with nothing wrong has no key. */
type SettingsProblems = { name?: string; signature?: string; cap?: string };

/** What a save sends of what it signs with (00487): Gmail's clears their words, none keeps them for another day. */
const signsPatch = (choice: MailboxSignsChoice, signature: string) =>
  choice === "none"
    ? { signature_off: true }
    : { signature_off: false, signature: choice === "own" ? signature.trim() || null : null };

/** The settings' problems, found before a save is sent. */
function problemsOf(name: string, signs: MailboxSignsChoice, signature: string, cap: string): SettingsProblems {
  const found: SettingsProblems = {};
  const n = Number(cap);
  if (!name.trim() || name.trim().length > 80) found.name = "Give the name people see, 80 characters at most.";
  if (signature.length > 1000) found.signature = "A signature is 1,000 characters at most.";
  if (signs === "own" && !signature.trim()) found.signature = SIGNS.ownEmpty;
  if (!Number.isInteger(n) || n < 1 || n > MAILBOXES.capMax) found.cap = `Between 1 and ${MAILBOXES.capMax} a day.`;
  return found;
}

/**
 * What the Gmail choice signs with, as words (Gmail's own markup is never drawn here), and when it was read; or that
 * none goes. Their own words are the field above, where they write them.
 */
const SignsSaid = ({ m, choice }: { m: MailboxConnectionDto; choice: MailboxSignsChoice }) => {
  if (choice === "none")
    return (
      <p className="set-mbx-signs-read" data-testid="mailbox-signs-said">
        {SIGNS.none_says}
      </p>
    );
  const said = MAILBOXES.signs.gmail(m);
  return (
    <div className="set-mbx-signs" data-testid="mailbox-signs-said">
      <p className="set-mbx-signs-words">{said.words}</p>
      <p className="set-mbx-signs-read">{said.read}</p>
    </div>
  );
};

/** The end of an email as their inbox shows it, under what it signs with as the send will (mailboxSignsOf). */
const SignsPreview = (p: { m: MailboxConnectionDto; name: string; signs: MailboxSignsChoice; signature: string }) => {
  const { m, name, signs, signature } = p;
  // Write one, with nothing written yet: the save asks for it, so the preview says where it will go.
  const unwritten = signs === "own" && !signature.trim();
  const signed = unwritten
    ? null
    : MAILBOXES.signs.of(
        {
          signature: signs === "own" ? signature : null,
          signature_off: signs === "none",
          from_name: name,
          gmail_signature_at: m.signs.gmail_read_at,
        },
        m.signs.gmail,
      ).words;
  return (
    <div className="set-mbx-preview" data-testid="mailbox-preview">
      <span className="set-mbx-preview-from">
        <b>{name.trim() || m.from_name}</b> {m.address}
      </span>
      <span className="set-mbx-preview-body">{CARD.previewEnd}</span>
      {signed ? (
        <span className="set-mbx-preview-sig" data-testid="mailbox-preview-sig">
          {signed}
        </span>
      ) : (
        <span className="set-mbx-preview-none">{unwritten ? CARD.previewWrite : CARD.previewNone}</span>
      )}
    </div>
  );
};

/** Whether it sends: a switch where the owner may pause or unpause it, and its day, ramp and health under it. */
const SendingGroup = (p: { m: MailboxConnectionDto; on: boolean; setOn: (on: boolean) => void; locked: boolean }) => {
  const { m, on, setOn, locked } = p;
  const can = MAILBOXES.acts(m);
  const switchable = can.pause || can.unpause;
  const id = `mailbox-sending-${m.id}`;
  return (
    <div className="set-mbx-say">
      <span className="set-mbx-say-words">
        <span className="set-mbx-say-name" id={id}>
          {CARD.sending}
        </span>
        <span className="set-mbx-lines" data-testid={`mailbox-sending-${m.address}`}>
          {switchable ? <span>{on ? CARD.sendingOn(m.address) : CARD.sendingOff(m.address)}</span> : null}
          {MAILBOXES.sending(m, Date.now()).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </span>
      {switchable ? (
        <Switch
          checked={on}
          onCheckedChange={setOn}
          labelledBy={id}
          readOnly={locked}
          data-testid="mailbox-sending-switch"
        />
      ) : null}
    </div>
  );
};

/** The hosted address, where the workspace has one: what a reply leaves from when the mailbox can't send, and its name. */
const BackupGroup = (p: {
  m: MailboxConnectionDto;
  email: Email;
  businessName: string | null;
  flash: SheetProps["flash"];
}) => {
  const [open, setOpen] = useState(false);
  const hosted = p.email.mailbox;
  if (!hosted) return null;
  return (
    <section className="set-mbx-group" aria-labelledby="mailbox-backup-title" data-testid="mailbox-backup">
      <div className="set-mbx-say">
        <span className="set-mbx-say-words">
          <span className="set-mbx-say-name" id="mailbox-backup-title">
            {CARD.backup}
          </span>
          <span className="set-mbx-lines">
            <span>{CARD.backupSays(hosted.address, p.m.address)}</span>
          </span>
        </span>
        {!open ? <LinkButton onClick={() => setOpen(true)}>{CARD.changeName}</LinkButton> : null}
      </div>
      {open ? (
        <EmailSetupForm email={p.email} businessName={p.businessName} flash={p.flash} onClose={() => setOpen(false)} />
      ) : null}
    </section>
  );
};

/** A mailbox's settings, in a sheet: its Save is the sheet's, and Remove asks in its foot. */
export const MailboxSheet = ({ m, email, businessName, owner, flash, onClose, onRemove }: SheetProps) => {
  const [name, setName] = useState(m.from_name);
  const [signs, setSigns] = useState<MailboxSignsChoice>(MAILBOXES.signs.choiceOf(m));
  const [signature, setSignature] = useState(m.signature ?? "");
  const [cap, setCap] = useState(String(m.daily_cap));
  const [on, setOn] = useState(m.state !== "paused");
  const [problems, setProblems] = useState<SettingsProblems>({});
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const locked = busy || !owner;
  const save = async () => {
    const found = problemsOf(name, signs, signature, cap);
    setProblems(found);
    if (found.name || found.signature || found.cap) return;
    const can = MAILBOXES.acts(m);
    const paused = (can.pause || can.unpause) && on === (m.state === "paused") ? { paused: !on } : {};
    setBusy(true);
    const r = await MAILBOXES.set(m.id, {
      from_name: name.trim(),
      ...signsPatch(signs, signature),
      daily_cap: Number(cap),
      ...paused,
    });
    setBusy(false);
    if (!r.ok) {
      flash(refusalToast(r, "Not saved"));
      return;
    }
    flash({ msg: <>{m.address} is saved</> });
    onClose();
  };
  const remove = owner && MAILBOXES.acts(m).remove;
  const pill = MAILBOXES.row(m, Date.now()).pill;
  return (
    <RecordSheet
      id="mailbox"
      testid={`mailbox-sheet-${m.address}`}
      title={m.address}
      sub={`${MAILBOXES.providerWords[m.provider]} · ${pill}`}
      onClose={onClose}
      onSave={owner ? () => void save() : null}
      saving={busy}
      saveLabel="Save"
      savingLabel="Saving…"
      cancelLabel="Cancel"
      confirm={
        asking ? (
          <Confirm
            question={`Remove ${m.address}?`}
            detail="Nothing more leaves from it and its replies are no longer read here; what it sent stays in its threads, and a business it was writing to hears nothing more from that chain."
            yes="Yes, remove"
            danger
            busy={busy}
            onYes={() => {
              setBusy(true);
              void onRemove().finally(() => setBusy(false));
            }}
            onNo={() => setAsking(false)}
            testid={`mailbox-remove-${m.address}`}
          />
        ) : null
      }
    >
      <section className="set-mbx-group" aria-labelledby="mailbox-sending-title">
        <h3 className="set-mbx-group-title" id="mailbox-sending-title">
          {CARD.sending}
        </h3>
        <div className="set-mbx-two">
          <RecordField
            id={`mailbox-name-${m.id}`}
            testid="mailbox-name"
            label="Name beside it"
            value={name}
            onChange={setName}
            problem={problems.name}
            disabled={locked}
          />
          <RecordField
            id={`mailbox-cap-${m.id}`}
            testid="mailbox-cap"
            label="Most a day"
            value={cap}
            onChange={setCap}
            type="number"
            unit="a day"
            problem={problems.cap}
            disabled={locked}
          />
        </div>
        <SendingGroup m={m} on={on} setOn={setOn} locked={locked} />
      </section>
      <section className="set-mbx-group" aria-labelledby={`mailbox-signs-label-${m.id}`} data-testid="mailbox-signs">
        <h3 className="set-mbx-group-title" id={`mailbox-signs-label-${m.id}`}>
          {CARD.signature}
        </h3>
        <Segmented
          labelledBy={`mailbox-signs-label-${m.id}`}
          value={signs}
          onValueChange={setSigns}
          readOnly={locked}
          options={[
            {
              value: "gmail",
              label: m.provider === "google" ? SIGNS.gmail : SIGNS.name,
              testid: "mailbox-signs-gmail",
            },
            { value: "own", label: SIGNS.own, testid: "mailbox-signs-own" },
            { value: "none", label: SIGNS.none, testid: "mailbox-signs-none" },
          ]}
        />
        {signs === "own" ? (
          <RecordField
            id={`mailbox-signature-${m.id}`}
            testid="mailbox-signature"
            label={SIGNS.ownLabel}
            value={signature}
            onChange={setSignature}
            rows={4}
            problem={problems.signature}
            disabled={locked}
          />
        ) : (
          <SignsSaid m={m} choice={signs} />
        )}
        <span className="set-mbx-group-title set-mbx-preview-title">{CARD.preview}</span>
        <SignsPreview m={m} name={name} signs={signs} signature={signature} />
      </section>
      <BackupGroup m={m} email={email} businessName={businessName} flash={flash} />
      {remove ? (
        <section className="set-mbx-group set-mbx-say" data-testid="mailbox-remove-group">
          <span className="set-mbx-lines">
            <span>{CARD.removeSays}</span>
          </span>
          <LinkButton tone="danger" onClick={() => setAsking(true)} data-testid="mailbox-remove-ask">
            {CARD.remove(m.address)}
          </LinkButton>
        </section>
      ) : null}
    </RecordSheet>
  );
};
