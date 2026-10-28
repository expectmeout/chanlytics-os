/**
 * A mailbox's domain records, in the record kit's sheet (the mailbox canvas's D1, 28 Oct 2026): where they had stood as
 * a table inside the Email card, a paragraph over cramped columns, DKIM's directions in code's letters and a bare dot
 * for each state. How many are found, when they were read, and where they go; then a record each: its state in words,
 * its host and its value to copy, what to do with an SPF record the domain has already, and DKIM's directions with the
 * way to where its provider makes it; a record DNS has is one line. Check again reads them now, the sheet staying open:
 * Setup's re-read brings the states back to it.
 */
import { useState } from "react";
import type { MailboxConnectionDto, MailboxRecordRow } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { RecordSheet } from "../../kit/record/sheet";
import { gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { connectedMailboxes } from "./connected-mailboxes";

/** The DNS sheet's verbs and words (contracts mailboxDnsOf, MAILBOX_DNS_WORDS). */
const DNS = connectedMailboxes.dns;
const DNS_WORDS = DNS.words;
/** The permission a mailbox's acts ask (contracts ROLE_PERMS), as the block's. */
const MAILBOX_PERM = "settings";

type Flash = (f: LegacyFlash) => void;

/**
 * Copy words, saying so where asked; where the browser gives no clipboard, the words are selected so a person copies
 * them by hand. `done` hears a copy that went through.
 */
export function copyWords(flash: Flash, value: string, nodeId: string, done?: () => void) {
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
    flash({ tone: "danger", msg: <>{DNS_WORDS.copyFailed}</> });
  };
  const went = done ?? (() => flash({ msg: <>{DNS_WORDS.copied}</> }));
  if (navigator.clipboard) navigator.clipboard.writeText(value).then(went, byHand);
  else byHand();
}

/** One of a record's parts to copy: its name, the words, and Copy, which says Copied once it went. */
function copyLine(p: { label: string; value: string; id: string; testid: string; copied: boolean; copy: () => void }) {
  return (
    <div className="set-dns-kv">
      <span className="set-dns-k">{p.label}</span>
      <code className="set-dns-v" id={p.id}>
        {p.value}
      </code>
      <Button size="sm" onClick={p.copy} aria-label={`Copy the ${p.label.toLowerCase()}`} data-testid={p.testid}>
        {p.copied ? DNS_WORDS.copied : DNS_WORDS.copy}
      </Button>
    </div>
  );
}

interface RecordProps {
  m: MailboxConnectionDto;
  r: MailboxRecordRow;
  copied: string | null;
  copy: (value: string, id: string) => void;
}

/** A record DNS does not have yet: its state, then its host and value to copy, or DKIM's directions and where to go. */
function recordToAdd({ m, r, copied, copy }: RecordProps) {
  const id = (part: string) => `dns-${m.id}-${r.key}-${part}`;
  const madeAt = r.key === "dkim" ? DNS_WORDS.madeAt(m.provider) : null;
  return (
    <section key={r.key} className="set-dns-rec" data-testid={`mailbox-dns-${r.key}`} data-state={r.state}>
      <div className="set-dns-rec-h">
        <b>{r.kind}</b>
        <span className="set-dns-type">{r.type}</span>
        <span className="set-dns-state" data-tone="warn">
          {DNS.state(r)}
        </span>
      </div>
      {r.key === "dkim" ? (
        <>
          <p className="set-dns-steps">{r.value}</p>
          {madeAt ? (
            <Button size="sm" href={madeAt.href} target="_blank" rel="noopener noreferrer" className="set-dns-go">
              {madeAt.label}
              <Icon name="external" size={12} />
            </Button>
          ) : null}
        </>
      ) : (
        <>
          {copyLine({
            label: DNS_WORDS.host,
            value: r.name,
            id: id("name"),
            testid: `mailbox-copy-${r.key}-host`,
            copied: copied === id("name"),
            copy: () => copy(r.name, id("name")),
          })}
          {copyLine({
            label: DNS_WORDS.value,
            value: r.value,
            id: id("value"),
            testid: `mailbox-copy-${r.key}`,
            copied: copied === id("value"),
            copy: () => copy(r.value, id("value")),
          })}
          {r.note ? (
            <p className="set-dns-why" data-testid={`mailbox-record-note-${r.key}`}>
              {r.note}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** A record DNS has: one line, its name and what it holds. */
function recordFound(r: MailboxRecordRow) {
  return (
    <div key={r.key} className="set-dns-rec set-dns-found" data-testid={`mailbox-dns-${r.key}`} data-state="found">
      <b>{r.kind}</b>
      <span className="set-dns-type">{r.type}</span>
      <code className="set-dns-found-v">{r.key === "dkim" ? r.name : `${r.name} · ${r.value}`}</code>
      <span className="set-dns-state" data-tone="ok">
        {DNS_WORDS.state.found}
      </span>
    </div>
  );
}

/** A mailbox's domain records, in a sheet: found of all, each to add, and Check again. */
export const DnsSheet = ({
  m,
  owner,
  flash,
  onClose,
}: {
  m: MailboxConnectionDto;
  owner: boolean;
  flash: Flash;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const dns = DNS.of(m);
  const copy = (value: string, id: string) => copyWords(flash, value, id, () => setCopied(id));
  const check = async () => {
    setChecking(true);
    const r = await connectedMailboxes.check(m.id);
    setChecking(false);
    flash(r.ok ? { msg: <>{DNS_WORDS.readAgain(m.host)}</> } : refusalToast(r, "Not checked"));
  };
  return (
    <RecordSheet
      id="mailbox-dns"
      testid={`mailbox-dns-sheet-${m.address}`}
      title={DNS_WORDS.title(m.host)}
      sub={DNS_WORDS.sub(m.address)}
      onClose={onClose}
      foot={
        <div className="set-dns-foot">
          <span className="set-dns-foot-note">{DNS_WORDS.foot}</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void check()}
            disabled={checking}
            data-testid={`mailbox-check-${m.address}`}
            {...(owner ? {} : gate(MAILBOX_PERM, "check a mailbox's records"))}
          >
            {checking ? DNS_WORDS.checking : DNS_WORDS.check}
          </Button>
        </div>
      }
    >
      <div className="set-dns-top">
        <div className="set-dns-row">
          <b data-testid="mailbox-dns-found">{DNS_WORDS.found(dns.found, dns.total)}</b>
          <span>{DNS_WORDS.checked(m.dns_checked_at)}</span>
        </div>
        <div className="set-dns-bar" aria-hidden="true">
          {dns.rows.map((r) => (
            <span key={r.key} data-on={r.found ? "true" : undefined} />
          ))}
        </div>
        <p className="set-dns-where">{DNS_WORDS.where(m.host)}</p>
      </div>
      {dns.rows.map((r) => (r.found ? recordFound(r) : recordToAdd({ m, r, copied, copy })))}
    </RecordSheet>
  );
};
