/**
 * Write to them, a step of the same sheet (the review of 4 Nov 2026; decision 0094): one email, written for them by the
 * route (POST leads/:id/draft) and theirs to change. With a mailbox that can send it, Send leaves from there, through the
 * one send door, with Undo for its grace. With none, the one press is the way to connect one; a mailbox that can't send
 * now says why (Ruben, 9 Nov 2026: a mailbox is required, and sending by hand defeats the purpose). ‹ Back returns to the
 * card.
 *
 * Hookless.
 */
import { LEAD_OWN_EMAIL_WORDS as OW, LEAD_WORDS as LW, type LeadPeekVM } from "@chanlytics/contracts";
import { LEAD_SHEET_WORDS as W } from "./model/view";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Panel } from "../../kit/panel/panel";
import { navigate } from "../../frame-verbs";
import type { DraftState, PeekActs } from "../peek/types";
import { WordsBox } from "./email-box";
import { stepHead } from "./picker";

interface WriteProps {
  vm: LeadPeekVM;
  draft: DraftState | null;
  busy: boolean;
  on: PeekActs;
}

/** The route said no before a word was written (no business address, they asked not to be written to): nothing to send. */
const refusedOutright = (d: DraftState) => !!d.refusal && !d.body;

/** What goes under the words, as the road it takes lays it. */
const footWordsOf = (d: DraftState) => (d.from ? d.foot : d.mailFoot?.trim()) || null;

/** No mailbox at all: the press is the way to one, on the page that says what it takes. */
const needsMailbox = (d: DraftState) => !d.from && d.whyNot === OW.whyNot.no_mailbox;

/**
 * The email, as it will go: to whom, its subject and its words to change, and what is added under them; "Writing it…"
 * while the route writes it. Why it can't go, where a mailbox can't send it. Refused outright, why and the way back alone.
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
    </div>
  );
}

/** The foot while it is written: Send, the primary; with no mailbox, the way to connect one. */
export function SheetWriteDock({ draft, busy, on }: WriteProps) {
  const d: DraftState = draft || {};
  if (refusedOutright(d)) return null;
  const canSend = !!(d.from && d.subject && d.body && !d.busy && d.words?.trim() && !d.sending);
  return (
    <div className="lw-dock" data-busy={busy || d.busy ? "true" : undefined} data-testid="lead-sheet-dock">
      {needsMailbox(d) ? (
        <Button
          variant="primary"
          className="lw-dock-b"
          onClick={() => navigate("admin/outreach/connect")}
          data-testid="lead-sheet-write-connect"
        >
          <Icon name="mail" size={14} />
          <span className="lw-dock-w">{OW.connect}</span>
        </Button>
      ) : (
        <Button
          variant="primary"
          className="lw-dock-b"
          disabled={!canSend}
          onClick={() => void on.onSend()}
          data-testid="lead-sheet-write-send"
        >
          <Icon name="send" size={14} />
          <span className="lw-dock-w">{OW.send}</span>
        </Button>
      )}
    </div>
  );
}
