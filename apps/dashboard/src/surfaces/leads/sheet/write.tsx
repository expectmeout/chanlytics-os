/**
 * Write to them, a step of the same sheet (the review of 4 Nov 2026: the lead's own draft had no way to it left): one
 * email, written for them by the route (POST leads/:id/draft, its foot the law's) and sent from the owner's own mail app.
 * The email as it will go, Shorter and Warmer to ask again; at the foot their mail app, with Gmail, Outlook and Copy
 * under its caret (contracts composeLinksOf, as To send opens one). Opening or copying it arms "Did you send it?", asked
 * once they are back at the tab (peek/acts.tsx), and a yes there marks them contacted. ‹ Back returns to the card.
 *
 * Hookless.
 */
import {
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
import { stepHead } from "./picker";

interface WriteProps {
  vm: LeadPeekVM;
  draft: DraftState | null;
  busy: boolean;
  on: PeekActs;
}

/** The draft's words in paragraphs, each line kept where the route broke it. */
const paragraphsOf = (body: string) => body.split(/\n\s*\n/).filter((p) => p.trim());

/** The doors into a mail client for the draft, once it is written (contracts composeLinksOf); none while it is not. */
const linksOf = (vm: LeadPeekVM, d: DraftState) =>
  d.body && d.subject && !d.busy
    ? composeLinksOf({ to: d.to || vm.reach.email.address || "", subject: d.subject, text: d.body })
    : null;

/** The route said no before a word was written (no business address, they asked not to be written to): nothing to send. */
const refusedOutright = (d: DraftState) => !!d.refusal && !d.body;

/**
 * The email, as it will go: to whom, its subject and its words; "Writing it…" while the route writes it. A link too long
 * to carry the words says that they are copied as it opens. Refused outright, why and the way back alone.
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
  return (
    <div className="lw-step" data-testid="lead-sheet-write">
      {stepHead(W.write.title(vm.short), on.onBack, W.write.sub)}
      {refusal}
      <Panel variant="inset" size="sm" className="lw-write-mail" aria-busy={writing || undefined}>
        <p className="lw-now-to" data-testid="peek-draft-to">
          {W.mail.to(d.to || vm.reach.email.address || vm.reach.email.value)}
        </p>
        {d.subject && !writing ? (
          <p className="lw-now-subj" data-testid="peek-draft-subject">
            {d.subject}
          </p>
        ) : null}
        <div className="lw-now-body lw-write-body" data-testid="peek-draft-body">
          {writing || !d.body ? (
            <p>{writing ? LW.draftWriting : ""}</p>
          ) : (
            paragraphsOf(d.body).map((para, at) => <p key={at}>{para}</p>)
          )}
        </div>
      </Panel>
      <div className="lw-write-tones" role="group" aria-label={LW.draftRewrite}>
        <span>{LW.draftRewrite}</span>
        {LW.tones.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant="secondary"
            aria-pressed={d.tone === t.id}
            disabled={busy || writing || !d.body}
            onClick={() => void on.onTone(t.id)}
            data-testid={`peek-tone-${t.id}`}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <p className="lw-mail-n" data-testid="peek-draft-note">
        {LW.draftNote}
      </p>
      {links && !links.bodyInLinks ? (
        <p className="lw-mail-n" data-testid="lead-sheet-write-paste">
          {L.pasteNote}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The foot while it is written: their mail app, the primary, with Gmail, Outlook and Copy under its caret. A link too
 * long to carry the words leaves them to the clipboard, copied as it opens (the step above says so).
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
      <Icon name="mail" size={14} />
      <span className="lw-dock-w">{L.app}</span>
    </>
  );
  return (
    <div className="lw-dock" data-busy={busy || d.busy ? "true" : undefined} data-testid="lead-sheet-dock">
      <span className="lw-split">
        {links ? (
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
