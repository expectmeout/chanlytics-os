/**
 * Write to them, a step of the same sheet (the review of 4 Nov 2026; decision 0094): one email, written for them by the
 * route (POST leads/:id/draft) and theirs to change. With a mailbox that can send it, Send leaves from there, through the
 * one send door, with Undo for its grace; the mail apps stay under its caret. With none, their mail app is the primary,
 * with Gmail, Outlook and Copy under its caret (contracts composeLinksOf, as To send opens one): opening or copying it
 * arms "Did you send it?", asked once they are back at the tab (peek/acts.tsx). A yes there marks them contacted, and
 * either way the email keeps a row in History. ‹ Back returns to the card.
 *
 * Hookless.
 */
import {
  LEAD_OWN_EMAIL_WORDS as OW,
  LEAD_SHEET_WORDS as W,
  LEAD_WORDS as LW,
  REACH_OUT_TO_SEND_LABELS as L,
  composeLinksOf,
  type LeadPeekVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { Panel } from "../../kit/panel/panel";
import { onAPhone } from "../../legacy-verbs";
import type { DraftState, PeekActs } from "../peek/types";
import { WordsBox } from "./email-box";
import { stepHead } from "./picker";

interface WriteProps {
  vm: LeadPeekVM;
  draft: DraftState | null;
  busy: boolean;
  on: PeekActs;
}

/** How many lines the box of words stands. */

/** The doors into a mail client for the email as it now reads, once it is written (contracts composeLinksOf). */
const linksOf = (vm: LeadPeekVM, d: DraftState) =>
  d.body && d.subject && !d.busy
    ? composeLinksOf({ to: d.to || vm.reach.email.address || "", subject: d.subject, text: d.body })
    : null;

/** The route said no before a word was written (no business address, they asked not to be written to): nothing to send. */
const refusedOutright = (d: DraftState) => !!d.refusal && !d.body;

/** What goes under the words, as the road it takes lays it. */
const footWordsOf = (d: DraftState) => (d.from ? d.foot : d.mailFoot?.trim()) || null;

/**
 * The email, as it will go: to whom, its subject and its words to change, and what is added under them; "Writing it…"
 * while the route writes it. Why it goes from the mail app, where a mailbox can't send it. A link too long to carry the
 * words says that they are copied as it opens. Refused outright, why and the way back alone.
 */
export function SheetWrite({ vm, draft, busy, on }: WriteProps) {
  const d: DraftState = draft || {};
  const refusal = d.refusal ? (
    <p className="field-error" role="alert" data-testid="peek-draft-error">
      {d.refusal}
    </p>
  ) : null;
  if (refusedOutright(d))
    return (
      <div className="lw-step" data-testid="lead-sheet-write">
        {stepHead(W.write.title(vm.short), on.onBack)}
        {refusal}
      </div>
    );
  const writing = !!d.busy;
  const links = linksOf(vm, d);
  const foot = footWordsOf(d);
  return (
    <div className="lw-step" data-testid="lead-sheet-write">
      {stepHead(W.write.title(vm.short), on.onBack, d.from ? OW.sub : W.write.sub)}
      {refusal}
      <Panel variant="inset" size="sm" className="lw-write-mail" aria-busy={writing || undefined}>
        <p className="lw-now-to" data-testid="peek-draft-to">
          {W.mail.to(d.to || vm.reach.email.address || vm.reach.email.value)}
        </p>
        {d.from ? (
          <p className="lw-now-to" data-testid="lead-sheet-write-from">
            {OW.from(d.from)}
          </p>
        ) : null}
        {writing ? (
          <div className="lw-now-body" data-testid="peek-draft-body">
            <p>{LW.draftWriting}</p>
          </div>
        ) : (
          <>
            <div className="lw-now-subj">
              <WordsBox
                label={OW.subject}
                value={d.subject ?? ""}
                onChange={(subject) => on.onWords({ subject: subject.replace(/\r?\n/g, " ") })}
                max={200}
                readOnly={busy || !!d.sending}
                testid="peek-draft-subject"
              />
            </div>
            <div className="lw-now-body">
              <WordsBox
                label={OW.words}
                value={d.words ?? ""}
                onChange={(words) => on.onWords({ words })}
                max={4000}
                readOnly={busy || !!d.sending}
                testid="peek-draft-body"
              />
            </div>
            {foot ? (
              <div className="lw-write-foot" data-testid="lead-sheet-write-foot">
                <span>{OW.foot}</span>
                <p>{foot}</p>
              </div>
            ) : null}
          </>
        )}
      </Panel>
      <div className="lw-write-tones" role="group" aria-label={LW.draftRewrite}>
        <span>{LW.draftRewrite}</span>
        {LW.tones.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant="secondary"
            aria-pressed={d.tone === t.id}
            disabled={busy || writing || !!d.sending || !d.body}
            onClick={() => void on.onTone(t.id)}
            data-testid={`peek-tone-${t.id}`}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {!d.from && d.whyNot ? (
        <p className="lw-mail-n" data-testid="lead-sheet-write-why">
          {d.whyNot}
        </p>
      ) : null}
      {!d.from && links && !links.bodyInLinks ? (
        <p className="lw-mail-n" data-testid="lead-sheet-write-paste">
          {L.pasteNote}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The foot while it is written. From a mailbox: Send, the primary, with their mail apps and Copy under its caret. From
 * their mail app: that, the primary, with Gmail, Outlook and Copy under its caret. A link too long to carry the words
 * leaves them to the clipboard, copied as it opens (the step above says so).
 */
export function SheetWriteDock({ vm, draft, busy, on }: WriteProps) {
  const d: DraftState = draft || {};
  if (refusedOutright(d)) return null;
  const links = linksOf(vm, d);
  // Opening it is the moment they might send it: "Did you send it?" is armed, and words a link cannot carry are copied.
  const opening = () => {
    if (links && !links.bodyInLinks) void on.onCopyDraft();
    else on.onOpenMail();
  };
  const onWeb = (url: string) => () => {
    opening();
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const words = (
    <>
      <Icon name={d.from ? "send" : "mail"} size={14} />
      <span className="lw-dock-w">{d.from ? OW.send : L.app}</span>
    </>
  );
  const appItem = links
    ? [
        {
          label: L.app,
          glyph: <Icon name="mail" size={13} />,
          onSelect: () => {
            opening();
            window.location.assign(links.mailto);
          },
        },
      ]
    : [];
  const canSend = !!(d.from && links && d.words?.trim() && !d.sending);
  return (
    <div className="lw-dock" data-busy={busy || d.busy ? "true" : undefined} data-testid="lead-sheet-dock">
      <span className="lw-split">
        {d.from ? (
          <Button
            variant="primary"
            className="lw-dock-b"
            disabled={!canSend}
            onClick={() => void on.onSend()}
            data-testid="lead-sheet-write-send"
          >
            {words}
          </Button>
        ) : links ? (
          <Button
            variant="primary"
            className="lw-dock-b"
            href={links.mailto}
            onClick={opening}
            data-testid="peek-open-mail"
          >
            {words}
          </Button>
        ) : (
          <Button variant="primary" className="lw-dock-b" disabled data-testid="peek-open-mail">
            {words}
          </Button>
        )}
        <Menu
          label={L.more(vm.name)}
          trigger={
            <Button
              variant="primary"
              iconOnly
              className="lw-split-more"
              disabled={!links}
              aria-label={L.more(vm.name)}
              data-testid="lead-sheet-write-more"
            >
              <Icon name="chevron-down" size={13} />
            </Button>
          }
          // A phone draws the menu as a sheet, headed by whose email it is (as To send's is).
          groups={[
            {
              header: onAPhone() ? vm.name : undefined,
              items: links
                ? [
                    ...(d.from ? appItem : []),
                    { label: L.gmail, glyph: <Icon name="external" size={13} />, onSelect: onWeb(links.gmail) },
                    { label: L.outlook, glyph: <Icon name="external" size={13} />, onSelect: onWeb(links.outlook) },
                    { label: L.copy, glyph: <Icon name="copy" size={13} />, onSelect: () => void on.onCopyDraft() },
                  ]
                : [],
            },
          ]}
        />
      </span>
    </div>
  );
}
